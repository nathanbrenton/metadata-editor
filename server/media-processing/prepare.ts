import {
  createHash,
  randomUUID,
} from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import {
  spawn,
} from "node:child_process";
import {
  createReadStream,
} from "node:fs";

import {
  detectFfmpegCapabilities,
} from "../ffmpeg-capabilities.js";
import {
  assertPathWithinRoot,
} from "../media-root.js";
import {
  buildPublishPlan,
} from "../publish-plan.js";
import {
  scanReleaseById,
} from "../scanner.js";
import type {
  FfmpegCapabilities,
} from "../types.js";
import {
  buildMediaProcessingPlan,
  inspectWaveformDocument,
} from "./plan.js";
import {
  buildMediaProcessingProfile,
} from "./profile.js";
import type {
  MediaProcessingDerivativePlan,
  MediaProcessingPlan,
  MediaProcessingTrackPlan,
} from "./types.js";
import {
  generateWaveformPeaksFromWav,
  parseWavBuffer,
} from "./waveform-generator.js";
import {
  buildWebStreamFfmpegArgs,
  buildWebStreamInfo,
  buildWebStreamPlan,
  inspectWebStreamDirectory,
  type WebStreamPlan,
  type WebStreamTrackPlan,
} from "./web-stream.js";
import {
  buildBrowserArtworkFfmpegArgs,
  buildBrowserArtworkInfo,
  buildBrowserArtworkPlan,
  buildBrowserArtworkVerificationArgs,
  type BrowserArtworkPlan,
} from "./browser-artwork.js";
import type {
  MediaPreparationProgress,
} from "./progress.js";

export type MediaPreparationReceipt = {
  releaseId: string;
  operationId: string;
  operationRelativePath: string;
  createdCount: number;
  replacedCount: number;
  playbackCount: number;
  streamCount: number;
  waveformCount: number;
  artworkCount: number;
  completedAt: string;
};

export type ProcessRunner = (
  executable: string,
  args: readonly string[],
) => Promise<void>;

export type PrepareReleaseMediaOptions = {
  expectedPublishPlanFingerprint: string;
  publishPlanGeneratedAt: string;
  scope?: "all" | "playback";
  ffmpegCapabilities?: FfmpegCapabilities;
  processRunner?: ProcessRunner;
  now?: () => Date;
  operationId?: string;
  onProgress?: (
    progress: MediaPreparationProgress,
  ) => void | Promise<void>;
};

type PreparedDerivative = {
  trackId: string;
  kind:
    | MediaProcessingDerivativePlan["kind"]
    | "web-stream-hls"
    | "browser-artwork"
    | "browser-artwork-info";
  nodeType: "file" | "directory";
  action: "create" | "replace";
  targetRelativePath: string;
  stagePath: string;
  sizeBytes: number;
  sha256: string;
  backupPath?: string;
};

type Manifest = {
  schema: {
    name: "metadata-editor-media-preparation";
    version: 2;
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
  publishPlanFingerprint: string;
  mediaPlanFingerprint: string;
  items: Array<{
    trackId: string;
    kind:
      | MediaProcessingDerivativePlan["kind"]
      | "web-stream-hls"
      | "browser-artwork"
      | "browser-artwork-info";
    nodeType: "file" | "directory";
    action: "create" | "replace";
    targetRelativePath: string;
    sizeBytes: number;
    sha256: string;
    backupRelativePath?: string;
  }>;
  error?: string;
};

const allowedPreparationPublishBlockers = new Set([
  "playback-not-current",
  "web-stream-not-current",
  "waveform-not-current",
  "video-web-stream-not-current",
  // A supported TIFF/TIF artwork master can be converted during the
  // same reviewed preparation operation as audio derivatives.
  "browser-artwork-preparation-required",
]);

function isPreparableMissingDerivativeReference(
  issue: { code: string; message: string },
): boolean {
  if (issue.code !== "library-missing-or-unsafe-asset-reference") {
    return false;
  }

  return (
    issue.message.startsWith(
      'track.assets.audio_playback points to "audio-playback.mp3",',
    ) ||
    issue.message.startsWith(
      'track.assets.waveform_peaks points to "waveform-peaks.json",',
    )
  );
}

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

function hashPreparationPlan(
  mediaPlan: MediaProcessingPlan,
  webStreamPlan: WebStreamPlan,
  browserArtworkPlan: BrowserArtworkPlan,
): string {
  return createHash("sha256")
    .update(JSON.stringify({
      releaseId: mediaPlan.releaseId,
      playbackProfile: mediaPlan.profile.playback,
      waveformProfile: mediaPlan.profile.waveform,
      webStreamProfile: webStreamPlan.profile,
      browserArtwork: {
        status: browserArtworkPlan.status,
        action: browserArtworkPlan.action,
        master: browserArtworkPlan.master,
        outputRelativePath: browserArtworkPlan.outputRelativePath,
        infoRelativePath: browserArtworkPlan.infoRelativePath,
        sourceSizeBytes: browserArtworkPlan.sourceSizeBytes,
        sourceSha256: browserArtworkPlan.sourceSha256,
        profileSha256: browserArtworkPlan.profileSha256,
      },
      tracks: mediaPlan.items.map((item) => ({
        trackId: item.trackId,
        trackRelativePath: item.trackRelativePath,
        master: item.master,
        playback: item.playback,
        waveform: item.waveform,
        webStream: webStreamPlan.items.find(
          (stream) => stream.trackId === item.trackId,
        ),
      })),
    }))
    .digest("hex");
}

async function hashFile(
  absolutePath: string,
): Promise<{ sizeBytes: number; sha256: string }> {
  const stats = await lstat(absolutePath);
  if (stats.isSymbolicLink() || !stats.isFile() || stats.size === 0) {
    throw new Error(
      `Cannot hash non-empty regular file: ${absolutePath}`,
    );
  }

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
  const stats = await lstat(absolutePath);
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error(
      `Cannot hash non-symbolic directory: ${absolutePath}`,
    );
  }

  const entries = await readdir(absolutePath, {
    withFileTypes: true,
  });
  const records: Array<{
    name: string;
    sizeBytes: number;
    sha256: string;
  }> = [];

  for (const entry of entries.sort((a, b) =>
    a.name.localeCompare(b.name)
  )) {
    if (!entry.isFile() || entry.isSymbolicLink()) {
      throw new Error(
        `Prepared web stream contains a non-regular entry: ${entry.name}`,
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
    throw new Error("Prepared web stream directory is empty.");
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

function selectedMp3Encoder(
  capabilities: FfmpegCapabilities,
): string {
  const mp3 = capabilities.containers.find(
    (container) => container.container === "mp3",
  );

  if (
    !capabilities.available ||
    !mp3 ||
    mp3.status === "unsupported" ||
    !mp3.selectedEncoder
  ) {
    throw new Error(
      capabilities.error ??
      "FFmpeg does not expose a usable MP3 encoder.",
    );
  }

  return mp3.selectedEncoder;
}

export function buildPlaybackTranscodeArgs(
  inputPath: string,
  outputPath: string,
  encoder: string,
  bitrateKbps = 320,
): string[] {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    "-i",
    inputPath,
    "-map",
    "0:a:0",
    "-vn",
    "-map_metadata",
    "-1",
    "-map_chapters",
    "-1",
    "-c:a",
    encoder,
    "-b:a",
    `${bitrateKbps}k`,
    "-id3v2_version",
    "3",
    "-write_id3v1",
    "0",
    "-y",
    outputPath,
  ];
}

export function buildPlaybackMp3RemuxArgs(
  inputPath: string,
  outputPath: string,
): string[] {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    "-i",
    inputPath,
    "-map",
    "0:a:0",
    "-vn",
    "-map_metadata",
    "-1",
    "-map_chapters",
    "-1",
    "-c:a",
    "copy",
    "-id3v2_version",
    "3",
    "-write_id3v1",
    "0",
    "-y",
    outputPath,
  ];
}

export function buildWaveformDecodeArgs(
  inputPath: string,
  outputPath: string,
): string[] {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    "-i",
    inputPath,
    "-map",
    "0:a:0",
    "-vn",
    "-map_metadata",
    "-1",
    "-c:a",
    "pcm_s16le",
    "-f",
    "wav",
    "-y",
    outputPath,
  ];
}

export function buildPlaybackVerificationArgs(
  inputPath: string,
): string[] {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    "-i",
    inputPath,
    "-map",
    "0:a:0",
    "-f",
    "null",
    "-",
  ];
}

async function defaultProcessRunner(
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
      reject(new Error("FFmpeg media preparation timed out."));
    }, 60 * 60 * 1000);

    child.stderr.on("data", (chunk: Buffer) => {
      if (errorBytes >= 64 * 1024) return;
      errorChunks.push(chunk);
      errorBytes += chunk.length;
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(
        new Error(
          error.message.includes("ENOENT")
            ? "FFmpeg is unavailable for media preparation."
            : `Unable to start FFmpeg: ${error.message}`,
        ),
      );
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);

      if (code === 0) {
        resolve();
        return;
      }

      const details = Buffer.concat(errorChunks)
        .toString("utf8")
        .trim();
      reject(
        new Error(
          details
            ? `FFmpeg media preparation failed: ${details}`
            : `FFmpeg media preparation failed with exit code ${String(code)}.`,
        ),
      );
    });
  });
}

async function assertRegularFile(
  absolutePath: string,
  label: string,
): Promise<void> {
  const stats = await lstat(absolutePath);

  if (stats.isSymbolicLink() || !stats.isFile() || stats.size === 0) {
    throw new Error(`${label} is not a non-empty regular file.`);
  }
}

async function assertRegularDirectory(
  absolutePath: string,
  label: string,
): Promise<void> {
  const stats = await lstat(absolutePath);

  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error(`${label} is not a regular directory.`);
  }
}

async function ensureOperationParent(
  operationParent: string,
): Promise<void> {
  try {
    const stats = await lstat(operationParent);
    if (stats.isSymbolicLink() || !stats.isDirectory()) {
      throw new Error(
        "The media-preparation operation root must be a regular directory, not a file or symbolic link.",
      );
    }
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      await mkdir(operationParent, {
        recursive: true,
        mode: 0o700,
      });
      return;
    }

    throw error;
  }
}

async function writeManifest(
  manifestPath: string,
  manifest: Manifest,
): Promise<void> {
  const temporaryPath = `${manifestPath}.${randomUUID()}.tmp`;
  await writeFile(
    temporaryPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    { mode: 0o600 },
  );
  await rename(temporaryPath, manifestPath);
}

function preparationItems(
  plan: MediaProcessingPlan,
): Array<{
  track: MediaProcessingTrackPlan;
  derivative: MediaProcessingDerivativePlan;
}> {
  return plan.items.flatMap((track) =>
    [track.playback, track.waveform]
      .filter(
        (derivative) =>
          derivative.action === "create" ||
          derivative.action === "replace",
      )
      .map((derivative) => ({ track, derivative })),
  );
}

function streamPreparationItems(
  plan: WebStreamPlan,
): WebStreamTrackPlan[] {
  return plan.items.filter(
    (item) =>
      item.action === "create" ||
      item.action === "replace",
  );
}

async function stagePlayback(
  mediaRoot: string,
  stagePath: string,
  track: MediaProcessingTrackPlan,
  capabilities: FfmpegCapabilities,
  runProcess: ProcessRunner,
): Promise<void> {
  const masterRelativePath = track.master.relativePath;
  const extension = track.master.extension?.toLowerCase();

  if (!masterRelativePath || !extension) {
    throw new Error(
      `Track ${track.trackId} does not have one resolved audio master.`,
    );
  }

  const masterPath = rootPath(mediaRoot, masterRelativePath);
  await assertRegularFile(masterPath, "Audio master");

  const args = extension === ".mp3"
    ? buildPlaybackMp3RemuxArgs(masterPath, stagePath)
    : buildPlaybackTranscodeArgs(
        masterPath,
        stagePath,
        selectedMp3Encoder(capabilities),
      );

  await runProcess(capabilities.executable, args);
  await assertRegularFile(stagePath, "Prepared playback MP3");
  await runProcess(
    capabilities.executable,
    buildPlaybackVerificationArgs(stagePath),
  );
}

async function stageWebStream(
  mediaRoot: string,
  stageRoot: string,
  track: MediaProcessingTrackPlan,
  stream: WebStreamTrackPlan,
  webStreamPlan: WebStreamPlan,
  capabilities: FfmpegCapabilities,
  generatedAt: string,
  runProcess: ProcessRunner,
): Promise<string> {
  const masterRelativePath = track.master.relativePath;

  if (!masterRelativePath) {
    throw new Error(
      `Track ${track.trackId} does not have one resolved canonical source.`,
    );
  }

  if (!capabilities.available) {
    throw new Error(
      "FFmpeg is required to generate the HLS web-stream derivative.",
    );
  }

  const masterPath = rootPath(mediaRoot, masterRelativePath);
  await assertRegularFile(masterPath, "Canonical audio source");
  const stageDirectory = rootPath(
    stageRoot,
    stream.directoryRelativePath,
  );
  await mkdir(stageDirectory, {
    recursive: true,
    mode: 0o700,
  });

  await runProcess(
    capabilities.executable,
    buildWebStreamFfmpegArgs(
      masterPath,
      stageDirectory,
      webStreamPlan.profile,
    ),
  );

  await writeFile(
    path.join(stageDirectory, "stream-info.json"),
    `${JSON.stringify(
      buildWebStreamInfo(
        track,
        webStreamPlan.profile,
        generatedAt,
      ),
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );

  await inspectWebStreamDirectory(
    stageRoot,
    stream.directoryRelativePath,
  );

  return stageDirectory;
}

async function stageWaveform(
  mediaRoot: string,
  decodeDirectory: string,
  stagePath: string,
  track: MediaProcessingTrackPlan,
  capabilities: FfmpegCapabilities,
  plan: MediaProcessingPlan,
  runProcess: ProcessRunner,
): Promise<void> {
  const masterRelativePath = track.master.relativePath;
  const extension = track.master.extension?.toLowerCase();

  if (!masterRelativePath || !extension) {
    throw new Error(
      `Track ${track.trackId} does not have one resolved audio master.`,
    );
  }

  const masterPath = rootPath(mediaRoot, masterRelativePath);
  await assertRegularFile(masterPath, "Audio master");
  let wavBytes: Buffer;

  if (extension === ".wav") {
    wavBytes = await readFile(masterPath);

    try {
      parseWavBuffer(wavBytes);
    } catch {
      if (!capabilities.available) {
        throw new Error(
          "The WAV master is not supported by the native analyzer and FFmpeg is unavailable for fallback decoding.",
        );
      }

      const decodedPath = rootPath(
        decodeDirectory,
        `${randomUUID()}.wav`,
      );
      await runProcess(
        capabilities.executable,
        buildWaveformDecodeArgs(masterPath, decodedPath),
      );
      wavBytes = await readFile(decodedPath);
    }
  } else {
    if (!capabilities.available) {
      throw new Error(
        `FFmpeg is required to decode ${extension} for waveform analysis.`,
      );
    }

    const decodedPath = rootPath(
      decodeDirectory,
      `${randomUUID()}.wav`,
    );
    await runProcess(
      capabilities.executable,
      buildWaveformDecodeArgs(masterPath, decodedPath),
    );
    wavBytes = await readFile(decodedPath);
  }

  const waveform = generateWaveformPeaksFromWav(
    wavBytes,
    plan.profile.waveform.peaksPerSecond,
  );
  const expected = buildMediaProcessingProfile(
    plan.profile.waveform.peaksPerSecond,
  ).waveform;
  const inspection = inspectWaveformDocument(
    waveform,
    expected,
  );

  if (!inspection.valid) {
    throw new Error(
      `Generated waveform failed profile validation: ${inspection.checks
        .map((check) => check.message)
        .join(" ")}`,
    );
  }

  await writeFile(
    stagePath,
    `${JSON.stringify(waveform, null, 2)}\n`,
    { mode: 0o600 },
  );
  await assertRegularFile(stagePath, "Prepared waveform JSON");
}

async function stageBrowserArtwork(
  mediaRoot: string,
  stageRoot: string,
  plan: BrowserArtworkPlan,
  capabilities: FfmpegCapabilities,
  generatedAt: string,
  runProcess: ProcessRunner,
): Promise<{
  outputStagePath: string;
  infoStagePath: string;
}> {
  if (
    !plan.master ||
    !plan.sourceSha256 ||
    plan.sourceSizeBytes === undefined
  ) {
    throw new Error(
      "Browser artwork preparation requires one resolved canonical TIFF/TIF master.",
    );
  }

  if (!capabilities.available) {
    throw new Error(
      "FFmpeg is required to generate the browser-compatible artwork derivative.",
    );
  }

  const masterPath = rootPath(
    mediaRoot,
    plan.master.relativePath,
  );
  await assertRegularFile(masterPath, "Canonical release artwork master");

  const outputStagePath = rootPath(
    stageRoot,
    plan.outputRelativePath,
  );
  const infoStagePath = rootPath(
    stageRoot,
    plan.infoRelativePath,
  );
  await mkdir(path.dirname(outputStagePath), {
    recursive: true,
    mode: 0o700,
  });

  await runProcess(
    capabilities.executable,
    buildBrowserArtworkFfmpegArgs(
      masterPath,
      outputStagePath,
    ),
  );
  await assertRegularFile(
    outputStagePath,
    "Prepared browser artwork PNG",
  );
  await runProcess(
    capabilities.executable,
    buildBrowserArtworkVerificationArgs(
      outputStagePath,
    ),
  );

  await writeFile(
    infoStagePath,
    `${JSON.stringify(
      buildBrowserArtworkInfo(plan, generatedAt),
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );
  await assertRegularFile(
    infoStagePath,
    "Prepared browser artwork generation sidecar",
  );

  return {
    outputStagePath,
    infoStagePath,
  };
}

async function targetExists(
  root: string,
  relativePath: string,
): Promise<boolean> {
  try {
    await lstat(rootPath(root, relativePath));
    return true;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return false;
    }
    throw error;
  }
}

async function promoteDerivatives(
  mediaRoot: string,
  operationRoot: string,
  prepared: PreparedDerivative[],
  manifest: Manifest,
  manifestPath: string,
  verifyAfterPromotion: () => Promise<void>,
): Promise<void> {
  const promoted: PreparedDerivative[] = [];
  let rollbackFailed = false;

  try {
    manifest.status = "promoting";
    await writeManifest(manifestPath, manifest);

    for (const item of prepared) {
      const targetPath = rootPath(
        mediaRoot,
        item.targetRelativePath,
      );
      await mkdir(path.dirname(targetPath), { recursive: true });

      if (item.action === "create") {
        try {
          await lstat(targetPath);
          throw new Error(
            `Preparation target appeared after review: ${item.targetRelativePath}`,
          );
        } catch (error) {
          if (
            !error ||
            typeof error !== "object" ||
            !("code" in error) ||
            error.code !== "ENOENT"
          ) {
            throw error;
          }
        }
      } else {
        if (item.nodeType === "directory") {
          await assertRegularDirectory(
            targetPath,
            `Derivative selected for replacement (${item.targetRelativePath})`,
          );
        } else {
          await assertRegularFile(
            targetPath,
            `Derivative selected for replacement (${item.targetRelativePath})`,
          );
        }
        const backupPath = rootPath(
          operationRoot,
          path.posix.join(
            "backups",
            item.targetRelativePath,
          ),
        );
        await mkdir(path.dirname(backupPath), { recursive: true });
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
          recursive: item.nodeType === "directory",
          force: true,
        });
        if (item.backupPath) {
          await mkdir(path.dirname(targetPath), { recursive: true });
          await rename(item.backupPath, targetPath);
        }
      } catch {
        rollbackFailed = true;
      }
    }

    // A replacement can fail after the original moved but before the new file
    // is promoted; restore that backup too.
    for (const item of prepared) {
      if (
        !item.backupPath ||
        promoted.includes(item)
      ) {
        continue;
      }

      try {
        const targetPath = rootPath(
          mediaRoot,
          item.targetRelativePath,
        );
        await rename(item.backupPath, targetPath);
      } catch {
        rollbackFailed = true;
      }
    }

    manifest.status = rollbackFailed
      ? "rollback-incomplete"
      : "rolled-back";
    manifest.error =
      error instanceof Error ? error.message : String(error);
    await writeManifest(manifestPath, manifest);
    throw error;
  }
}

function mediaPreparationTrackLabel(
  trackId: string,
): string {
  const numbered = trackId.match(
    /(?:^|_)(\d{1,3})_(.+)$/,
  );
  if (!numbered) {
    return trackId;
  }

  const title = numbered[2]
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) =>
      part.charAt(0).toUpperCase() +
      part.slice(1)
    )
    .join(" ");

  return `${Number(numbered[1])}. ${title}`;
}

export async function prepareReleaseMedia(
  mediaRoot: string,
  publishRoot: string,
  releaseId: string,
  options: PrepareReleaseMediaOptions,
): Promise<MediaPreparationReceipt> {
  if (!options.expectedPublishPlanFingerprint.trim()) {
    throw new Error("A reviewed publish-plan fingerprint is required.");
  }

  if (!options.publishPlanGeneratedAt.trim()) {
    throw new Error("The reviewed publish-plan generation time is required.");
  }

  const scope = options.scope ?? "all";
  const capabilities =
    options.ffmpegCapabilities ??
    await detectFfmpegCapabilities();
  const runProcess = options.processRunner ?? defaultProcessRunner;
  const now = options.now ?? (() => new Date());

  const reviewedPlan = await buildPublishPlan(
    mediaRoot,
    publishRoot,
    releaseId,
    {
      generatedAt: options.publishPlanGeneratedAt,
      ffmpegCapabilities: capabilities,
    },
  );

  if (
    reviewedPlan.planFingerprint !==
    options.expectedPublishPlanFingerprint
  ) {
    throw new Error(
      "The publish preflight is stale. Refresh preflight before preparing media.",
    );
  }

  const unsupportedBlockedIssues = scope === "all"
    ? reviewedPlan.issues.filter(
        (issue) =>
          issue.severity === "blocked" &&
          !allowedPreparationPublishBlockers.has(issue.code) &&
          !isPreparableMissingDerivativeReference(issue),
      )
    : [];

  if (unsupportedBlockedIssues.length > 0) {
    throw new Error(
      `Media preparation cannot continue until non-derivative blockers are resolved: ${unsupportedBlockedIssues
        .map((issue) => issue.message)
        .join(" ")}`,
    );
  }

  const release = await scanReleaseById(mediaRoot, releaseId);
  if (!release) {
    throw new Error(`Release not found: ${releaseId}`);
  }

  const mediaPlan = await buildMediaProcessingPlan(
    mediaRoot,
    release,
    capabilities,
    { generatedAt: options.publishPlanGeneratedAt },
  );

  const webStreamPlan = await buildWebStreamPlan(
    mediaRoot,
    mediaPlan,
    capabilities,
  );
  const browserArtworkPlan = await buildBrowserArtworkPlan(
    mediaRoot,
    release,
  );
  const blockedPublicDerivative = mediaPlan.items.some(
    (track) =>
      track.master.status !== "ready" ||
      track.waveform.action === "blocked",
  ) ||
    webStreamPlan.summary.blockedCount > 0 ||
    browserArtworkPlan.status === "blocked";

  if (scope === "all" && blockedPublicDerivative) {
    throw new Error(
      "Media preparation is blocked by the canonical source, HLS stream, waveform, or browser-artwork plan.",
    );
  }

  const itemsToPrepare = preparationItems(mediaPlan).filter(
    ({ derivative }) =>
      scope === "all" ||
      derivative.kind === "playback-mp3",
  );
  const streamsToPrepare =
    scope === "all"
      ? streamPreparationItems(webStreamPlan)
      : [];
  const artworkNeedsPreparation =
    scope === "all" &&
    (
      browserArtworkPlan.action === "create" ||
      browserArtworkPlan.action === "replace"
    );
  if (
    itemsToPrepare.length === 0 &&
    streamsToPrepare.length === 0 &&
    !artworkNeedsPreparation
  ) {
    throw new Error(
      scope === "playback"
        ? "No missing or stale Library playback MP3 derivatives need preparation."
        : "No missing or stale private playback/HLS/waveform/browser-artwork derivatives need preparation.",
    );
  }

  const mediaPlanFingerprint = hashPreparationPlan(
    mediaPlan,
    webStreamPlan,
    browserArtworkPlan,
  );
  const operationId =
    options.operationId ??
    `media-preparation-${randomUUID()}`;
  const trackCount = mediaPlan.items.length;
  const totalUnits =
    streamsToPrepare.length +
    itemsToPrepare.length +
    (artworkNeedsPreparation ? 1 : 0) +
    2;
  let completedUnits = 0;
  const reportProgress = async (
    progress: Omit<
      MediaPreparationProgress,
      | "operationId"
      | "releaseId"
      | "completedUnits"
      | "totalUnits"
      | "trackCount"
      | "updatedAt"
    >,
  ): Promise<void> => {
    await options.onProgress?.({
      operationId,
      releaseId,
      completedUnits,
      totalUnits,
      trackCount,
      updatedAt: new Date().toISOString(),
      ...progress,
    });
  };
  const trackProgressFields = (trackId: string) => {
    const trackIndex = mediaPlan.items.findIndex(
      (item) => item.trackId === trackId,
    );

    return {
      trackId,
      trackLabel: mediaPreparationTrackLabel(trackId),
      ...(trackIndex >= 0
        ? { trackIndex: trackIndex + 1 }
        : {}),
    };
  };

  await reportProgress({
    status: "running",
    phase: "starting",
    message: "Preparing media plan…",
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
  const stageRoot = path.join(operationRoot, "staging");
  const decodeRoot = path.join(operationRoot, "decoded");

  await ensureOperationParent(operationParent);
  await mkdir(operationRoot, { recursive: false, mode: 0o700 });
  await mkdir(stageRoot, { recursive: true, mode: 0o700 });
  await mkdir(decodeRoot, { recursive: true, mode: 0o700 });

  const prepared: PreparedDerivative[] = [];
  const manifest: Manifest = {
    schema: {
      name: "metadata-editor-media-preparation",
      version: 2,
    },
    operationId,
    releaseId,
    startedAt: now().toISOString(),
    status: "staging",
    publishPlanFingerprint:
      options.expectedPublishPlanFingerprint,
    mediaPlanFingerprint,
    items: [],
  };
  await writeManifest(manifestPath, manifest);

  try {
    if (artworkNeedsPreparation) {
      await reportProgress({
        status: "running",
        phase: "browser-artwork",
        message:
          "Release artwork: generating browser-compatible PNG from canonical TIFF/TIF master…",
      });

      const {
        outputStagePath,
        infoStagePath,
      } = await stageBrowserArtwork(
        mediaRoot,
        stageRoot,
        browserArtworkPlan,
        capabilities,
        options.publishPlanGeneratedAt,
        runProcess,
      );
      const outputIntegrity = await hashFile(outputStagePath);
      const infoIntegrity = await hashFile(infoStagePath);
      const outputAction = browserArtworkPlan.action === "replace"
        ? "replace"
        : "create";
      const infoAction = await targetExists(
        mediaRoot,
        browserArtworkPlan.infoRelativePath,
      )
        ? "replace"
        : "create";

      const artworkPrepared: PreparedDerivative = {
        trackId: releaseId,
        kind: "browser-artwork",
        nodeType: "file",
        action: outputAction,
        targetRelativePath: browserArtworkPlan.outputRelativePath,
        stagePath: outputStagePath,
        sizeBytes: outputIntegrity.sizeBytes,
        sha256: outputIntegrity.sha256,
      };
      const infoPrepared: PreparedDerivative = {
        trackId: releaseId,
        kind: "browser-artwork-info",
        nodeType: "file",
        action: infoAction,
        targetRelativePath: browserArtworkPlan.infoRelativePath,
        stagePath: infoStagePath,
        sizeBytes: infoIntegrity.sizeBytes,
        sha256: infoIntegrity.sha256,
      };
      prepared.push(artworkPrepared, infoPrepared);

      for (const item of [artworkPrepared, infoPrepared]) {
        manifest.items.push({
          trackId: item.trackId,
          kind: item.kind,
          nodeType: item.nodeType,
          action: item.action,
          targetRelativePath: item.targetRelativePath,
          sizeBytes: item.sizeBytes,
          sha256: item.sha256,
          ...(item.action === "replace"
            ? {
                backupRelativePath: path.posix.join(
                  ".metadata-editor-operations",
                  operationId,
                  "backups",
                  item.targetRelativePath,
                ),
              }
            : {}),
        });
      }
      await writeManifest(manifestPath, manifest);
      completedUnits += 1;
    }

    for (const stream of streamsToPrepare) {
      if (
        stream.action !== "create" &&
        stream.action !== "replace"
      ) {
        continue;
      }

      const track = mediaPlan.items.find(
        (item) => item.trackId === stream.trackId,
      );
      if (!track) {
        throw new Error(
          `Media plan is missing track ${stream.trackId}.`,
        );
      }

      await reportProgress({
        status: "running",
        phase: "web-stream-hls",
        message: `${mediaPreparationTrackLabel(track.trackId)}: transcoding segmented AAC-LC HLS stream…`,
        ...trackProgressFields(track.trackId),
      });

      const stagePath = await stageWebStream(
        mediaRoot,
        stageRoot,
        track,
        stream,
        webStreamPlan,
        capabilities,
        options.publishPlanGeneratedAt,
        runProcess,
      );
      const stagedIntegrity = await hashDirectoryTree(stagePath);
      const preparedItem: PreparedDerivative = {
        trackId: track.trackId,
        kind: "web-stream-hls",
        nodeType: "directory",
        action: stream.action,
        targetRelativePath: stream.directoryRelativePath,
        stagePath,
        sizeBytes: stagedIntegrity.sizeBytes,
        sha256: stagedIntegrity.sha256,
      };
      prepared.push(preparedItem);
      manifest.items.push({
        trackId: track.trackId,
        kind: "web-stream-hls",
        nodeType: "directory",
        action: stream.action,
        targetRelativePath: stream.directoryRelativePath,
        sizeBytes: stagedIntegrity.sizeBytes,
        sha256: stagedIntegrity.sha256,
        ...(stream.action === "replace"
          ? {
              backupRelativePath: path.posix.join(
                ".metadata-editor-operations",
                operationId,
                "backups",
                stream.directoryRelativePath,
              ),
            }
          : {}),
      });
      await writeManifest(manifestPath, manifest);
      completedUnits += 1;
    }

    for (const { track, derivative } of itemsToPrepare) {
      if (
        derivative.action !== "create" &&
        derivative.action !== "replace"
      ) {
        continue;
      }

      const stagePath = rootPath(
        stageRoot,
        derivative.relativePath,
      );
      await mkdir(path.dirname(stagePath), { recursive: true });

      await reportProgress({
        status: "running",
        phase: derivative.kind,
        message: derivative.kind === "playback-mp3"
          ? `${mediaPreparationTrackLabel(track.trackId)}: preparing Library playback MP3…`
          : `${mediaPreparationTrackLabel(track.trackId)}: generating waveform peaks…`,
        ...trackProgressFields(track.trackId),
      });

      if (derivative.kind === "playback-mp3") {
        await stagePlayback(
          mediaRoot,
          stagePath,
          track,
          capabilities,
          runProcess,
        );
      } else {
        await stageWaveform(
          mediaRoot,
          decodeRoot,
          stagePath,
          track,
          capabilities,
          mediaPlan,
          runProcess,
        );
      }

      const stagedIntegrity = await hashFile(stagePath);
      const preparedItem: PreparedDerivative = {
        trackId: track.trackId,
        kind: derivative.kind,
        nodeType: "file",
        action: derivative.action,
        targetRelativePath: derivative.relativePath,
        stagePath,
        sizeBytes: stagedIntegrity.sizeBytes,
        sha256: stagedIntegrity.sha256,
      };
      prepared.push(preparedItem);
      manifest.items.push({
        trackId: track.trackId,
        kind: derivative.kind,
        nodeType: "file",
        action: derivative.action,
        targetRelativePath: derivative.relativePath,
        sizeBytes: stagedIntegrity.sizeBytes,
        sha256: stagedIntegrity.sha256,
        ...(derivative.action === "replace"
          ? {
              backupRelativePath: path.posix.join(
                ".metadata-editor-operations",
                operationId,
                "backups",
                derivative.relativePath,
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
      message: "Validating prepared media and checking for stale source changes…",
    });

    manifest.status = "prepared";
    await writeManifest(manifestPath, manifest);

    const releaseBeforePromotion = await scanReleaseById(
      mediaRoot,
      releaseId,
    );
    if (!releaseBeforePromotion) {
      throw new Error(
        "The release disappeared while media was being prepared.",
      );
    }

    const planBeforePromotion = await buildMediaProcessingPlan(
      mediaRoot,
      releaseBeforePromotion,
      capabilities,
      { generatedAt: options.publishPlanGeneratedAt },
    );

    const webStreamsBeforePromotion = await buildWebStreamPlan(
      mediaRoot,
      planBeforePromotion,
      capabilities,
    );
    const browserArtworkBeforePromotion =
      await buildBrowserArtworkPlan(
        mediaRoot,
        releaseBeforePromotion,
      );

    if (
      hashPreparationPlan(
        planBeforePromotion,
        webStreamsBeforePromotion,
        browserArtworkBeforePromotion,
      ) !== mediaPlanFingerprint
    ) {
      throw new Error(
        "The release changed while media was being prepared. No derivative was promoted; refresh preflight and try again.",
      );
    }

    completedUnits += 1;
    await reportProgress({
      status: "running",
      phase: "promoting",
      message: "Promoting prepared media into the private Library and verifying checksums…",
    });

    await promoteDerivatives(
      mediaRoot,
      operationRoot,
      prepared,
      manifest,
      manifestPath,
      async () => {
        for (const item of prepared) {
          const promotedPath = rootPath(
            mediaRoot,
            item.targetRelativePath,
          );
          const integrity = item.nodeType === "directory"
            ? await hashDirectoryTree(promotedPath)
            : await hashFile(promotedPath);
          if (
            integrity.sizeBytes !== item.sizeBytes ||
            integrity.sha256 !== item.sha256
          ) {
            throw new Error(
              `Prepared derivative failed post-promotion SHA-256 verification: ${item.targetRelativePath}`,
            );
          }
        }

        const promotedRelease = await scanReleaseById(
          mediaRoot,
          releaseId,
        );
        if (!promotedRelease) {
          throw new Error(
            "The release disappeared during derivative promotion.",
          );
        }

        const verifiedPlan = await buildMediaProcessingPlan(
          mediaRoot,
          promotedRelease,
          capabilities,
          { generatedAt: options.publishPlanGeneratedAt },
        );
        const verifiedWebStreams = await buildWebStreamPlan(
          mediaRoot,
          verifiedPlan,
          capabilities,
        );
        const verifiedBrowserArtwork =
          await buildBrowserArtworkPlan(
            mediaRoot,
            promotedRelease,
          );
        const preparedFileKeys = new Set(
          prepared
            .filter((item) => item.nodeType === "file")
            .map((item) => `${item.trackId}:${item.kind}`),
        );
        const incompletePreparedFiles = verifiedPlan.items.flatMap(
          (track) =>
            [track.playback, track.waveform].filter(
              (derivative) =>
                preparedFileKeys.has(
                  `${track.trackId}:${derivative.kind}`,
                ) &&
                (derivative.action !== "none" ||
                  derivative.status !== "current"),
            ),
        );

        if (
          incompletePreparedFiles.length > 0 ||
          (scope === "all" &&
            verifiedWebStreams.summary.currentCount !==
              verifiedWebStreams.summary.trackCount) ||
          (artworkNeedsPreparation &&
            verifiedBrowserArtwork.status !== "current")
        ) {
          throw new Error(
            scope === "playback"
              ? "Prepared Library playback MP3 derivatives did not validate as current after promotion."
              : "Prepared private playback/HLS/waveform/browser-artwork derivatives did not validate as current after promotion.",
          );
        }
      },
    );

    completedUnits += 1;
    await reportProgress({
      status: "completed",
      phase: "completed",
      message:
        scope === "playback"
          ? "Library playback MP3 preparation complete."
          : "Media preparation complete.",
    });

    const completedAt = now().toISOString();
    manifest.status = "completed";
    manifest.completedAt = completedAt;
    await writeManifest(manifestPath, manifest);

    await rm(stageRoot, { recursive: true, force: true });
    await rm(decodeRoot, { recursive: true, force: true });

    const playbackCount = prepared.filter(
      (item) => item.kind === "playback-mp3",
    ).length;
    const streamCount = prepared.filter(
      (item) => item.kind === "web-stream-hls",
    ).length;
    const waveformCount = prepared.filter(
      (item) => item.kind === "waveform-peaks",
    ).length;
    const artworkCount = prepared.filter(
      (item) => item.kind === "browser-artwork",
    ).length;
    const createdCount = prepared.filter(
      (item) => item.action === "create",
    ).length;
    const replacedCount = prepared.filter(
      (item) => item.action === "replace",
    ).length;

    return {
      releaseId,
      operationId,
      operationRelativePath: path.posix.join(
        ".metadata-editor-operations",
        operationId,
      ),
      createdCount,
      replacedCount,
      playbackCount,
      streamCount,
      waveformCount,
      artworkCount,
      completedAt,
    };
  } catch (error) {
    if (
      manifest.status !== "rolled-back" &&
      manifest.status !== "rollback-incomplete"
    ) {
      manifest.status = "rolled-back";
      manifest.error =
        error instanceof Error ? error.message : String(error);
      await writeManifest(manifestPath, manifest);
    }
    await reportProgress({
      status: "failed",
      phase: "failed",
      message:
        error instanceof Error
          ? error.message
          : "Media preparation failed.",
    });
    throw error;
  }
}
