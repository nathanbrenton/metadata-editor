import {
  createHash,
  randomUUID,
} from "node:crypto";
import {
  lstat,
  mkdir,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import {
  createReadStream,
} from "node:fs";
import {
  spawn,
} from "node:child_process";
import path from "node:path";

import {
  detectFfmpegCapabilities,
} from "../ffmpeg-capabilities.js";
import {
  assertPathWithinRoot,
} from "../media-root.js";
import {
  scanReleaseById,
} from "../scanner.js";
import type {
  FfmpegCapabilities,
} from "../types.js";
import type {
  MediaPreparationProgress,
} from "./progress.js";
import {
  buildVideoWebStreamFfmpegArgs,
  buildVideoWebStreamInfo,
  buildVideoWebStreamPlan,
  buildVideoWebStreamVerificationArgs,
  inspectVideoWebStreamDirectory,
  type VideoWebStreamPlan,
  type VideoWebStreamVideoPlan,
} from "./video-web-stream.js";

export type VideoProcessRunner = (
  executable: string,
  args: readonly string[],
) => Promise<void>;

export type PrepareReleaseVideoWebStreamsOptions = {
  expectedPlanFingerprint: string;
  planGeneratedAt: string;
  ffmpegCapabilities?: FfmpegCapabilities;
  processRunner?: VideoProcessRunner;
  now?: () => Date;
  operationId?: string;
  onProgress?: (
    progress: MediaPreparationProgress,
  ) => void | Promise<void>;
};

export type VideoPreparationReceipt = {
  releaseId: string;
  operationId: string;
  operationRelativePath: string;
  createdCount: number;
  replacedCount: number;
  streamCount: number;
  completedAt: string;
};

type PreparedVideoStream = {
  videoId: string;
  action: "create" | "replace";
  targetRelativePath: string;
  stagePath: string;
  sizeBytes: number;
  sha256: string;
  backupPath?: string;
};

type VideoPreparationManifest = {
  schema: {
    name: "metadata-editor-video-preparation";
    version: 1;
  };
  operationId: string;
  releaseId: string;
  startedAt: string;
  completedAt?: string;
  status:
    | "staging"
    | "prepared"
    | "promoting"
    | "completed"
    | "rolled-back"
    | "rollback-incomplete";
  videoPlanFingerprint: string;
  items: Array<{
    videoId: string;
    action: "create" | "replace";
    targetRelativePath: string;
    sizeBytes: number;
    sha256: string;
    backupRelativePath?: string;
  }>;
  error?: string;
};

function rootPath(
  root: string,
  relativePath: string,
): string {
  return assertPathWithinRoot(
    root,
    path.resolve(
      root,
      ...relativePath
        .replaceAll("\\", "/")
        .split("/")
        .filter(Boolean),
    ),
  );
}

async function assertRegularFile(
  absolutePath: string,
  label: string,
): Promise<void> {
  const stats = await lstat(absolutePath);
  if (
    stats.isSymbolicLink() ||
    !stats.isFile() ||
    stats.size === 0
  ) {
    throw new Error(
      `${label} is not a non-empty regular file: ${absolutePath}`,
    );
  }
}

async function assertRegularDirectory(
  absolutePath: string,
  label: string,
): Promise<void> {
  const stats = await lstat(absolutePath);
  if (
    stats.isSymbolicLink() ||
    !stats.isDirectory()
  ) {
    throw new Error(
      `${label} is not a regular directory: ${absolutePath}`,
    );
  }
}

async function hashFile(
  absolutePath: string,
): Promise<{ sizeBytes: number; sha256: string }> {
  await assertRegularFile(absolutePath, "Prepared video resource");
  const stats = await lstat(absolutePath);
  const hash = createHash("sha256");

  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(absolutePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });

  return {
    sizeBytes: stats.size,
    sha256: hash.digest("hex"),
  };
}

async function hashDirectoryTree(
  absolutePath: string,
): Promise<{ sizeBytes: number; sha256: string }> {
  await assertRegularDirectory(
    absolutePath,
    "Prepared video stream",
  );
  const entries = await readdir(absolutePath, {
    withFileTypes: true,
  });
  const records: Array<{
    name: string;
    sizeBytes: number;
    sha256: string;
  }> = [];

  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name)
  )) {
    if (!entry.isFile() || entry.isSymbolicLink()) {
      throw new Error(
        `Prepared video stream contains a non-regular entry: ${entry.name}`,
      );
    }

    const integrity = await hashFile(
      path.join(absolutePath, entry.name),
    );
    records.push({
      name: entry.name,
      ...integrity,
    });
  }

  if (records.length === 0) {
    throw new Error(
      "Prepared video stream directory is empty.",
    );
  }

  const hash = createHash("sha256");
  for (const record of records) {
    hash.update(record.name);
    hash.update("\0");
    hash.update(String(record.sizeBytes));
    hash.update("\0");
    hash.update(record.sha256);
    hash.update("\n");
  }

  return {
    sizeBytes: records.reduce(
      (total, record) => total + record.sizeBytes,
      0,
    ),
    sha256: hash.digest("hex"),
  };
}

async function defaultVideoProcessRunner(
  executable: string,
  args: readonly string[],
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, [...args], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    const errorChunks: Buffer[] = [];
    let errorBytes = 0;
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(
        new Error(
          "FFmpeg video preparation timed out.",
        ),
      );
    }, 6 * 60 * 60 * 1000);

    child.stderr.on("data", (chunk: Buffer) => {
      if (errorBytes >= 128 * 1024) return;
      errorChunks.push(chunk);
      errorBytes += chunk.length;
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (code === 0) {
        resolve();
        return;
      }

      const stderr = Buffer.concat(errorChunks)
        .toString("utf8")
        .trim();
      reject(
        new Error(
          stderr
            ? `FFmpeg video preparation failed: ${stderr}`
            : `FFmpeg video preparation exited with code ${String(code)}.`,
        ),
      );
    });
  });
}

async function writeManifest(
  manifestPath: string,
  manifest: VideoPreparationManifest,
): Promise<void> {
  await writeFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    { mode: 0o600 },
  );
}

async function ensureOperationParent(
  operationParent: string,
): Promise<void> {
  await mkdir(operationParent, {
    recursive: true,
    mode: 0o700,
  });
  const stats = await lstat(operationParent);
  if (
    stats.isSymbolicLink() ||
    !stats.isDirectory()
  ) {
    throw new Error(
      "Media operation workspace is not a regular directory.",
    );
  }
}

function videoLabel(
  item: VideoWebStreamVideoPlan,
): string {
  return item.title?.trim() || item.videoId;
}

async function stageVideoStream(
  mediaRoot: string,
  stageRoot: string,
  item: VideoWebStreamVideoPlan,
  plan: VideoWebStreamPlan,
  capabilities: FfmpegCapabilities,
  generatedAt: string,
  runProcess: VideoProcessRunner,
): Promise<string> {
  if (!item.master) {
    throw new Error(
      `Video ${item.videoId} does not have one resolved canonical source.`,
    );
  }

  if (!capabilities.available) {
    throw new Error(
      "FFmpeg is required to prepare video HLS derivatives.",
    );
  }

  const masterPath = rootPath(
    mediaRoot,
    item.master.relativePath,
  );
  await assertRegularFile(
    masterPath,
    "Canonical video master",
  );

  const stageDirectory = rootPath(
    stageRoot,
    item.directoryRelativePath,
  );
  await mkdir(stageDirectory, {
    recursive: true,
    mode: 0o700,
  });

  await runProcess(
    capabilities.executable,
    buildVideoWebStreamFfmpegArgs(
      masterPath,
      stageDirectory,
      plan.profile,
    ),
  );

  await writeFile(
    path.join(stageDirectory, "stream-info.json"),
    `${JSON.stringify(
      buildVideoWebStreamInfo(
        item.videoId,
        item.master,
        plan.profile,
        generatedAt,
      ),
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );

  await inspectVideoWebStreamDirectory(
    stageRoot,
    item.directoryRelativePath,
  );
  await runProcess(
    capabilities.executable,
    buildVideoWebStreamVerificationArgs(
      path.join(stageDirectory, "index.m3u8"),
    ),
  );

  return stageDirectory;
}

async function promoteVideoStreams(
  mediaRoot: string,
  operationRoot: string,
  prepared: PreparedVideoStream[],
  manifest: VideoPreparationManifest,
  manifestPath: string,
  verifyAfterPromotion: () => Promise<void>,
): Promise<void> {
  const promoted: PreparedVideoStream[] = [];
  let rollbackFailed = false;

  try {
    manifest.status = "promoting";
    await writeManifest(manifestPath, manifest);

    for (const item of prepared) {
      const targetPath = rootPath(
        mediaRoot,
        item.targetRelativePath,
      );
      await mkdir(path.dirname(targetPath), {
        recursive: true,
      });

      if (item.action === "create") {
        try {
          await lstat(targetPath);
          throw new Error(
            `Video preparation target appeared after review: ${item.targetRelativePath}`,
          );
        } catch (error) {
          if (
            !isMissingFileError(error)
          ) {
            throw error;
          }
        }
      } else {
        await assertRegularDirectory(
          targetPath,
          `Video stream selected for replacement (${item.targetRelativePath})`,
        );
        const backupPath = rootPath(
          operationRoot,
          path.posix.join(
            "backups",
            item.targetRelativePath,
          ),
        );
        await mkdir(path.dirname(backupPath), {
          recursive: true,
        });
        await rename(targetPath, backupPath);
        item.backupPath = backupPath;
      }

      await rename(item.stagePath, targetPath);
      promoted.push(item);
    }

    await verifyAfterPromotion();
  } catch (error) {
    for (const item of [...promoted].reverse()) {
      const targetPath = rootPath(
        mediaRoot,
        item.targetRelativePath,
      );
      try {
        await rm(targetPath, {
          recursive: true,
          force: true,
        });
        if (item.backupPath) {
          await mkdir(path.dirname(targetPath), {
            recursive: true,
          });
          await rename(item.backupPath, targetPath);
        }
      } catch {
        rollbackFailed = true;
      }
    }

    for (const item of prepared) {
      if (
        !item.backupPath ||
        promoted.includes(item)
      ) {
        continue;
      }
      try {
        await rename(
          item.backupPath,
          rootPath(
            mediaRoot,
            item.targetRelativePath,
          ),
        );
      } catch {
        rollbackFailed = true;
      }
    }

    manifest.status = rollbackFailed
      ? "rollback-incomplete"
      : "rolled-back";
    manifest.error =
      error instanceof Error
        ? error.message
        : String(error);
    await writeManifest(manifestPath, manifest);
    throw error;
  }
}

function isMissingFileError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "ENOENT",
  );
}

export async function prepareReleaseVideoWebStreams(
  mediaRoot: string,
  releaseId: string,
  options: PrepareReleaseVideoWebStreamsOptions,
): Promise<VideoPreparationReceipt> {
  if (!options.expectedPlanFingerprint.trim()) {
    throw new Error(
      "A reviewed video-plan fingerprint is required.",
    );
  }
  if (!options.planGeneratedAt.trim()) {
    throw new Error(
      "The reviewed video-plan generation time is required.",
    );
  }

  const capabilities =
    options.ffmpegCapabilities ??
    await detectFfmpegCapabilities();
  const runProcess =
    options.processRunner ?? defaultVideoProcessRunner;
  const now = options.now ?? (() => new Date());
  const release = await scanReleaseById(
    mediaRoot,
    releaseId,
  );
  if (!release) {
    throw new Error(`Release not found: ${releaseId}`);
  }

  const plan = await buildVideoWebStreamPlan(
    mediaRoot,
    release,
    capabilities,
    { generatedAt: options.planGeneratedAt },
  );
  if (
    plan.planFingerprint !==
    options.expectedPlanFingerprint
  ) {
    throw new Error(
      "The video preparation plan is stale. Refresh video readiness before preparing media.",
    );
  }
  if (plan.summary.blockedCount > 0) {
    throw new Error(
      "Video preparation is blocked by one or more canonical video sources or required FFmpeg encoders.",
    );
  }

  const itemsToPrepare = plan.items.filter(
    (item) =>
      item.action === "create" ||
      item.action === "replace",
  );
  if (itemsToPrepare.length === 0) {
    throw new Error(
      "No missing or stale private video HLS derivatives need preparation.",
    );
  }

  const operationId =
    options.operationId ??
    `video-preparation-${randomUUID()}`;
  const totalUnits = itemsToPrepare.length + 2;
  let completedUnits = 0;
  const reportProgress = async (
    progress: Omit<
      MediaPreparationProgress,
      | "operationId"
      | "releaseId"
      | "completedUnits"
      | "totalUnits"
      | "trackCount"
      | "videoCount"
      | "updatedAt"
    >,
  ): Promise<void> => {
    await options.onProgress?.({
      operationId,
      releaseId,
      completedUnits,
      totalUnits,
      trackCount: 0,
      videoCount: plan.items.length,
      updatedAt: new Date().toISOString(),
      ...progress,
    });
  };

  await reportProgress({
    status: "running",
    phase: "starting",
    message: "Preparing video web-stream plan…",
  });

  const operationParent = rootPath(
    mediaRoot,
    ".metadata-editor-operations",
  );
  const operationRoot = rootPath(
    mediaRoot,
    path.posix.join(
      ".metadata-editor-operations",
      operationId,
    ),
  );
  const manifestPath = path.join(
    operationRoot,
    "manifest.json",
  );
  const stageRoot = path.join(
    operationRoot,
    "staging",
  );

  await ensureOperationParent(operationParent);
  await mkdir(operationRoot, {
    recursive: false,
    mode: 0o700,
  });
  await mkdir(stageRoot, {
    recursive: true,
    mode: 0o700,
  });

  const prepared: PreparedVideoStream[] = [];
  const manifest: VideoPreparationManifest = {
    schema: {
      name: "metadata-editor-video-preparation",
      version: 1,
    },
    operationId,
    releaseId,
    startedAt: now().toISOString(),
    status: "staging",
    videoPlanFingerprint: plan.planFingerprint,
    items: [],
  };
  await writeManifest(manifestPath, manifest);

  try {
    for (
      let index = 0;
      index < itemsToPrepare.length;
      index += 1
    ) {
      const item = itemsToPrepare[index];
      if (
        item.action !== "create" &&
        item.action !== "replace"
      ) {
        continue;
      }

      await reportProgress({
        status: "running",
        phase: "video-web-stream-hls",
        message:
          `${videoLabel(item)}: transcoding H.264/AAC segmented video HLS…`,
        videoId: item.videoId,
        videoLabel: videoLabel(item),
        videoIndex: index + 1,
      });

      const stagePath = await stageVideoStream(
        mediaRoot,
        stageRoot,
        item,
        plan,
        capabilities,
        now().toISOString(),
        runProcess,
      );
      const integrity = await hashDirectoryTree(
        stagePath,
      );
      const preparedItem: PreparedVideoStream = {
        videoId: item.videoId,
        action: item.action,
        targetRelativePath:
          item.directoryRelativePath,
        stagePath,
        sizeBytes: integrity.sizeBytes,
        sha256: integrity.sha256,
      };
      prepared.push(preparedItem);
      manifest.items.push({
        videoId: item.videoId,
        action: item.action,
        targetRelativePath:
          item.directoryRelativePath,
        sizeBytes: integrity.sizeBytes,
        sha256: integrity.sha256,
        ...(item.action === "replace"
          ? {
              backupRelativePath: path.posix.join(
                ".metadata-editor-operations",
                operationId,
                "backups",
                item.directoryRelativePath,
              ),
            }
          : {}),
      });
      await writeManifest(manifestPath, manifest);
      completedUnits += 1;
    }

    await reportProgress({
      status: "running",
      phase: "validating",
      message:
        "Validating prepared video streams and checking for stale canonical-source changes…",
    });
    manifest.status = "prepared";
    await writeManifest(manifestPath, manifest);

    const releaseBeforePromotion =
      await scanReleaseById(mediaRoot, releaseId);
    if (!releaseBeforePromotion) {
      throw new Error(
        "The release disappeared while video streams were being prepared.",
      );
    }
    const planBeforePromotion =
      await buildVideoWebStreamPlan(
        mediaRoot,
        releaseBeforePromotion,
        capabilities,
        { generatedAt: options.planGeneratedAt },
      );
    if (
      planBeforePromotion.planFingerprint !==
      plan.planFingerprint
    ) {
      throw new Error(
        "The canonical video release changed while derivatives were being prepared. No video stream was promoted; refresh video readiness and try again.",
      );
    }

    completedUnits += 1;
    await reportProgress({
      status: "running",
      phase: "promoting",
      message:
        "Promoting prepared video streams into the private Library and verifying checksums…",
    });

    await promoteVideoStreams(
      mediaRoot,
      operationRoot,
      prepared,
      manifest,
      manifestPath,
      async () => {
        for (const item of prepared) {
          const integrity = await hashDirectoryTree(
            rootPath(
              mediaRoot,
              item.targetRelativePath,
            ),
          );
          if (
            integrity.sizeBytes !== item.sizeBytes ||
            integrity.sha256 !== item.sha256
          ) {
            throw new Error(
              `Prepared video derivative failed post-promotion SHA-256 verification: ${item.targetRelativePath}`,
            );
          }
        }

        const promotedRelease =
          await scanReleaseById(mediaRoot, releaseId);
        if (!promotedRelease) {
          throw new Error(
            "The release disappeared during video derivative promotion.",
          );
        }
        const verifiedPlan =
          await buildVideoWebStreamPlan(
            mediaRoot,
            promotedRelease,
            capabilities,
            { generatedAt: options.planGeneratedAt },
          );
        if (
          verifiedPlan.summary.currentCount !==
          verifiedPlan.summary.videoCount
        ) {
          throw new Error(
            "Prepared private video HLS derivatives did not validate as current after promotion.",
          );
        }
      },
    );

    completedUnits += 1;
    await reportProgress({
      status: "completed",
      phase: "completed",
      message: "Video preparation complete.",
    });

    const completedAt = now().toISOString();
    manifest.status = "completed";
    manifest.completedAt = completedAt;
    await writeManifest(manifestPath, manifest);
    await rm(stageRoot, {
      recursive: true,
      force: true,
    });

    return {
      releaseId,
      operationId,
      operationRelativePath: path.posix.join(
        ".metadata-editor-operations",
        operationId,
      ),
      createdCount: prepared.filter(
        (item) => item.action === "create",
      ).length,
      replacedCount: prepared.filter(
        (item) => item.action === "replace",
      ).length,
      streamCount: prepared.length,
      completedAt,
    };
  } catch (error) {
    if (
      manifest.status !== "rolled-back" &&
      manifest.status !== "rollback-incomplete"
    ) {
      manifest.status = "rolled-back";
      manifest.error =
        error instanceof Error
          ? error.message
          : String(error);
      await writeManifest(manifestPath, manifest);
    }
    await reportProgress({
      status: "failed",
      phase: "failed",
      message:
        error instanceof Error
          ? error.message
          : "Video preparation failed.",
    });
    throw error;
  }
}
