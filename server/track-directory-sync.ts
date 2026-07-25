import {
  constants,
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
} from "node:fs/promises";
import {
  createHash,
  randomUUID,
} from "node:crypto";
import path from "node:path";
import {
  parse,
  stringify,
} from "smol-toml";

import {
  buildTrackDirectoryIdForNumber,
  parseTrackDirectoryId,
} from "../shared/track-directory-naming.js";
import {
  assertPathWithinRoot,
  toLibraryRelativePath,
} from "./media-root.js";
import type {
  ReleaseScanResult,
  TrackScanResult,
} from "./types.js";

export const trackDirectoryRenameConfirmation =
  "RENAME_TRACK_DIRECTORIES";

export type TrackDirectoryRenameAction =
  | "rename"
  | "unchanged"
  | "blocked";

export type TrackDirectoryRenamePlanItem = {
  trackId: string;
  sourceRelativePath: string;
  targetId: string;
  targetRelativePath: string;
  trackNumber: number | null;
  discNumber: number;
  action: TrackDirectoryRenameAction;
  reason: string;
  metadataRelativePaths: string[];
};

export type TrackDirectoryRenamePlan = {
  releaseId: string;
  confirmation: typeof trackDirectoryRenameConfirmation;
  generatedAt: string;
  items: TrackDirectoryRenamePlanItem[];
  summary: {
    renameCount: number;
    unchangedCount: number;
    blockedCount: number;
  };
  fingerprint: string;
};

export type TrackDirectoryRenameReceipt = {
  releaseId: string;
  operationId: string | null;
  manifestRelativePath: string | null;
  renamed: Array<{
    previousTrackId: string;
    trackId: string;
    previousRelativePath: string;
    relativePath: string;
  }>;
  renamedCount: number;
  completedAt: string;
};

type TrackNumbering = {
  trackNumber: number | null;
  discNumber: number;
};

type MutablePlanItem = TrackDirectoryRenamePlanItem & {
  sourcePath: string;
  targetPath: string;
  track: TrackScanResult;
};

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function readPositiveInteger(
  value: unknown,
  fallback: number | null,
): number | null {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= 1 &&
    value <= 999
  )
    ? value
    : fallback;
}

async function pathExists(
  candidatePath: string,
): Promise<boolean> {
  try {
    await lstat(candidatePath);
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return false;
    }

    throw error;
  }
}

async function assertRealDirectory(
  mediaRoot: string,
  directoryPath: string,
): Promise<void> {
  const confined = assertPathWithinRoot(
    mediaRoot,
    directoryPath,
  );
  const stats = await lstat(confined);

  if (
    !stats.isDirectory() ||
    stats.isSymbolicLink()
  ) {
    throw new Error(
      `Expected a real directory: ${toLibraryRelativePath(mediaRoot, confined)}`,
    );
  }
}

async function readTrackNumbering(
  mediaRoot: string,
  track: TrackScanResult,
): Promise<TrackNumbering> {
  const trackToml = track.metadataFiles.find(
    (file) =>
      file.exists &&
      file.filename === "track.toml",
  );

  if (!trackToml) {
    return {
      trackNumber: null,
      discNumber: 1,
    };
  }

  const trackTomlPath = assertPathWithinRoot(
    mediaRoot,
    path.join(mediaRoot, trackToml.relativePath),
  );
  const stats = await lstat(trackTomlPath);

  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(
      `${trackToml.relativePath} must be a regular TOML file.`,
    );
  }

  const document = parse(
    await readFile(trackTomlPath, "utf8"),
  );
  const trackTable = isRecord(document)
    ? document.track
    : null;
  const numbering = isRecord(trackTable)
    ? trackTable.numbering
    : null;

  return {
    trackNumber: isRecord(numbering)
      ? readPositiveInteger(
          numbering.track_number,
          null,
        )
      : null,
    discNumber: isRecord(numbering)
      ? readPositiveInteger(
          numbering.disc_number,
          1,
        ) ?? 1
      : 1,
  };
}

function summarizePlan(
  items: TrackDirectoryRenamePlanItem[],
): TrackDirectoryRenamePlan["summary"] {
  return {
    renameCount: items.filter(
      (item) => item.action === "rename",
    ).length,
    unchangedCount: items.filter(
      (item) => item.action === "unchanged",
    ).length,
    blockedCount: items.filter(
      (item) => item.action === "blocked",
    ).length,
  };
}

function fingerprintPlan(
  releaseId: string,
  items: TrackDirectoryRenamePlanItem[],
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        releaseId,
        items: items.map((item) => ({
          trackId: item.trackId,
          targetId: item.targetId,
          trackNumber: item.trackNumber,
          discNumber: item.discNumber,
          action: item.action,
        })),
      }),
    )
    .digest("hex");
}

function blockItem(
  item: MutablePlanItem,
  reason: string,
): void {
  item.action = "blocked";
  item.reason = reason;
}

export async function buildTrackDirectoryRenamePlan(
  mediaRoot: string,
  release: ReleaseScanResult,
): Promise<TrackDirectoryRenamePlan> {
  const tracksRoot = assertPathWithinRoot(
    mediaRoot,
    path.join(
      mediaRoot,
      release.relativePath,
      "tracks",
    ),
  );
  await assertRealDirectory(mediaRoot, tracksRoot);

  const directoryEntries = await readdir(
    tracksRoot,
    { withFileTypes: true },
  );
  const existingNamesByCasefold = new Map(
    directoryEntries.map((entry) => [
      entry.name.toLocaleLowerCase("en-US"),
      entry.name,
    ]),
  );

  const mutableItems: MutablePlanItem[] = [];

  for (const track of release.tracks) {
    const numbering = await readTrackNumbering(
      mediaRoot,
      track,
    );
    const sourcePath = assertPathWithinRoot(
      mediaRoot,
      path.join(mediaRoot, track.relativePath),
    );
    await assertRealDirectory(mediaRoot, sourcePath);

    const parsedId = parseTrackDirectoryId(track.id);
    const targetId =
      numbering.trackNumber === null
        ? track.id
        : buildTrackDirectoryIdForNumber(
            track.id,
            numbering.trackNumber,
          ) ?? track.id;
    const targetPath = assertPathWithinRoot(
      mediaRoot,
      path.join(tracksRoot, targetId),
    );
    const metadataRelativePaths =
      track.metadataFiles
        .filter((file) => file.exists)
        .map((file) => file.relativePath);

    let action: TrackDirectoryRenameAction =
      "unchanged";
    let reason =
      "Directory sequence already matches the saved track number.";

    if (numbering.trackNumber === null) {
      reason =
        "No valid saved track number is available; the directory is unchanged.";
    } else if (!parsedId) {
      reason =
        "Directory ID does not use the artist_number_title convention and is left unchanged for manual review.";
    } else if (targetId !== track.id) {
      action = "rename";
      reason = `Track ${parsedId.trackNumber} will become track ${numbering.trackNumber}.`;
    }

    mutableItems.push({
      trackId: track.id,
      sourceRelativePath: track.relativePath,
      targetId,
      targetRelativePath: toLibraryRelativePath(
        mediaRoot,
        targetPath,
      ),
      trackNumber: numbering.trackNumber,
      discNumber: numbering.discNumber,
      action,
      reason,
      metadataRelativePaths,
      sourcePath,
      targetPath,
      track,
    });
  }

  const numberingGroups = new Map<
    string,
    MutablePlanItem[]
  >();

  for (const item of mutableItems) {
    if (item.trackNumber === null) {
      continue;
    }

    const key = `${item.discNumber}:${item.trackNumber}`;
    const group = numberingGroups.get(key) ?? [];
    group.push(item);
    numberingGroups.set(key, group);
  }

  for (const group of numberingGroups.values()) {
    if (group.length < 2) {
      continue;
    }

    for (const item of group) {
      blockItem(
        item,
        `Disc ${item.discNumber}, track ${item.trackNumber} is assigned to multiple track directories.`,
      );
    }
  }

  const targetGroups = new Map<
    string,
    MutablePlanItem[]
  >();

  for (const item of mutableItems) {
    const key = item.targetId.toLocaleLowerCase(
      "en-US",
    );
    const group = targetGroups.get(key) ?? [];
    group.push(item);
    targetGroups.set(key, group);
  }

  for (const group of targetGroups.values()) {
    if (group.length < 2) {
      continue;
    }

    for (const item of group) {
      blockItem(
        item,
        `Multiple tracks would use the target directory ${item.targetId}.`,
      );
    }
  }

  const itemBySourceCasefold = new Map(
    mutableItems.map((item) => [
      item.trackId.toLocaleLowerCase("en-US"),
      item,
    ]),
  );

  for (const item of mutableItems) {
    if (item.action !== "rename") {
      continue;
    }

    const targetKey = item.targetId.toLocaleLowerCase(
      "en-US",
    );
    const existingName =
      existingNamesByCasefold.get(targetKey);

    if (!existingName) {
      continue;
    }

    const occupyingItem =
      itemBySourceCasefold.get(targetKey);

    if (
      !occupyingItem ||
      occupyingItem.action !== "rename"
    ) {
      blockItem(
        item,
        `Target directory already exists and will not be overwritten: ${existingName}`,
      );
    }
  }

  const items: TrackDirectoryRenamePlanItem[] =
    mutableItems.map(({
      sourcePath: _sourcePath,
      targetPath: _targetPath,
      track: _track,
      ...item
    }) => item);

  return {
    releaseId: release.id,
    confirmation:
      trackDirectoryRenameConfirmation,
    generatedAt: new Date().toISOString(),
    items,
    summary: summarizePlan(items),
    fingerprint: fingerprintPlan(
      release.id,
      items,
    ),
  };
}

function updateTrackReferenceDocument(
  document: unknown,
  targetId: string,
): boolean {
  if (!isRecord(document)) {
    return false;
  }

  let changed = false;
  const trackTable = document.track;

  if (
    isRecord(trackTable) &&
    typeof trackTable.id === "string" &&
    trackTable.id !== targetId
  ) {
    trackTable.id = targetId;
    changed = true;
  }

  const trackReference = document.track_reference;

  if (
    isRecord(trackReference) &&
    typeof trackReference.track_id === "string" &&
    trackReference.track_id !== targetId
  ) {
    trackReference.track_id = targetId;
    changed = true;
  }

  return changed;
}

async function writeFileAtomically(
  mediaRoot: string,
  targetPath: string,
  content: string,
): Promise<void> {
  const parentPath = path.dirname(targetPath);
  const temporaryPath = assertPathWithinRoot(
    mediaRoot,
    path.join(
      parentPath,
      `.${path.basename(targetPath)}.${randomUUID()}.tmp`,
    ),
  );
  let temporaryCreated = false;

  try {
    const file = await open(
      temporaryPath,
      "wx",
      0o600,
    );
    temporaryCreated = true;

    try {
      await file.writeFile(content, "utf8");
      await file.sync();
    } finally {
      await file.close();
    }

    await rename(temporaryPath, targetPath);
    temporaryCreated = false;
  } finally {
    if (temporaryCreated) {
      await rm(temporaryPath, {
        force: true,
      });
    }
  }
}

async function writeManifest(
  mediaRoot: string,
  manifestPath: string,
  manifest: unknown,
  exclusive: boolean,
): Promise<void> {
  const content = `${JSON.stringify(
    manifest,
    null,
    2,
  )}\n`;

  if (exclusive) {
    const file = await open(
      manifestPath,
      "wx",
      0o600,
    );

    try {
      await file.writeFile(content, "utf8");
      await file.sync();
    } finally {
      await file.close();
    }

    return;
  }

  await writeFileAtomically(
    mediaRoot,
    manifestPath,
    content,
  );
}

export async function executeTrackDirectoryRenamePlan(
  mediaRoot: string,
  release: ReleaseScanResult,
  confirmation: string,
  expectedFingerprint: string,
): Promise<TrackDirectoryRenameReceipt> {
  if (
    confirmation !==
    trackDirectoryRenameConfirmation
  ) {
    throw new Error(
      `Confirmation must be ${trackDirectoryRenameConfirmation}.`,
    );
  }

  const plan = await buildTrackDirectoryRenamePlan(
    mediaRoot,
    release,
  );

  if (
    !expectedFingerprint ||
    expectedFingerprint !== plan.fingerprint
  ) {
    throw new Error(
      "Track directory rename plan changed. Review the latest dry-run plan before applying it.",
    );
  }

  if (plan.summary.blockedCount > 0) {
    const reasons = plan.items
      .filter((item) => item.action === "blocked")
      .map((item) => `${item.trackId}: ${item.reason}`);

    throw new Error(
      `Track directory synchronization is blocked. ${reasons.join(" ")}`,
    );
  }

  const renameItems = plan.items.filter(
    (item) => item.action === "rename",
  );

  if (renameItems.length === 0) {
    return {
      releaseId: release.id,
      operationId: null,
      manifestRelativePath: null,
      renamed: [],
      renamedCount: 0,
      completedAt: new Date().toISOString(),
    };
  }

  const releasePath = assertPathWithinRoot(
    mediaRoot,
    path.join(mediaRoot, release.relativePath),
  );
  const tracksRoot = assertPathWithinRoot(
    mediaRoot,
    path.join(releasePath, "tracks"),
  );
  const lockPath = assertPathWithinRoot(
    mediaRoot,
    path.join(
      tracksRoot,
      ".metadata-editor-track-directory-rename.lock",
    ),
  );
  let lockFile: Awaited<ReturnType<typeof open>>;

  try {
    lockFile = await open(
      lockPath,
      "wx",
      0o600,
    );
  } catch (error) {
    if (await pathExists(lockPath)) {
      throw new Error(
        "Another track directory synchronization is already running.",
      );
    }

    throw error;
  }

  try {
    const operationId = randomUUID();
    const operationsRoot = assertPathWithinRoot(
    mediaRoot,
    path.join(
      releasePath,
      ".metadata-editor-operations",
    ),
  );
  await mkdir(operationsRoot, {
    recursive: true,
    mode: 0o700,
  });
  const operationRoot = assertPathWithinRoot(
    mediaRoot,
    path.join(
      operationsRoot,
      `track-directory-rename-${operationId}`,
    ),
  );
  await mkdir(operationRoot, {
    recursive: false,
    mode: 0o700,
  });
  const backupRoot = assertPathWithinRoot(
    mediaRoot,
    path.join(operationRoot, "backups"),
  );
  await mkdir(backupRoot, {
    recursive: false,
    mode: 0o700,
  });
  const manifestPath = assertPathWithinRoot(
    mediaRoot,
    path.join(operationRoot, "manifest.json"),
  );

  const manifestBase = {
    schemaVersion: 1,
    operationId,
    operation: "track-directory-rename",
    releaseId: release.id,
    status: "planned",
    createdAt: new Date().toISOString(),
    plan,
  };

  await writeManifest(
    mediaRoot,
    manifestPath,
    manifestBase,
    true,
  );

  const runtimeItems = renameItems.map(
    (item, index) => {
      const sourcePath = assertPathWithinRoot(
        mediaRoot,
        path.join(mediaRoot, item.sourceRelativePath),
      );
      const targetPath = assertPathWithinRoot(
        mediaRoot,
        path.join(mediaRoot, item.targetRelativePath),
      );
      const temporaryPath = assertPathWithinRoot(
        mediaRoot,
        path.join(
          tracksRoot,
          `.metadata-editor-track-rename-${operationId}-${String(index + 1).padStart(3, "0")}`,
        ),
      );

      return {
        ...item,
        sourcePath,
        targetPath,
        temporaryPath,
        currentPath: sourcePath,
      };
    },
  );

  try {
    for (const item of runtimeItems) {
      await assertRealDirectory(
        mediaRoot,
        item.sourcePath,
      );

      if (await pathExists(item.temporaryPath)) {
        throw new Error(
          `Temporary rename path already exists: ${toLibraryRelativePath(mediaRoot, item.temporaryPath)}`,
        );
      }

      const trackBackupRoot = assertPathWithinRoot(
        mediaRoot,
        path.join(backupRoot, item.trackId),
      );
      await mkdir(trackBackupRoot, {
        recursive: false,
        mode: 0o700,
      });

      for (const metadataRelativePath of item.metadataRelativePaths) {
        const sourceMetadataPath = assertPathWithinRoot(
          mediaRoot,
          path.join(mediaRoot, metadataRelativePath),
        );
        const backupPath = assertPathWithinRoot(
          mediaRoot,
          path.join(
            trackBackupRoot,
            path.basename(metadataRelativePath),
          ),
        );

        await copyFile(
          sourceMetadataPath,
          backupPath,
          constants.COPYFILE_EXCL,
        );
      }
    }

    // Phase one clears every original name, making swaps and cycles safe.
    for (const item of runtimeItems) {
      await rename(
        item.sourcePath,
        item.temporaryPath,
      );
      item.currentPath = item.temporaryPath;
    }

    // Phase two refuses any target that appeared after planning.
    for (const item of runtimeItems) {
      if (await pathExists(item.targetPath)) {
        throw new Error(
          `Target directory appeared during synchronization and will not be overwritten: ${toLibraryRelativePath(mediaRoot, item.targetPath)}`,
        );
      }

      await rename(
        item.temporaryPath,
        item.targetPath,
      );
      item.currentPath = item.targetPath;
    }

    for (const item of runtimeItems) {
      for (const metadataRelativePath of item.metadataRelativePaths) {
        const targetMetadataPath = assertPathWithinRoot(
          mediaRoot,
          path.join(
            item.targetPath,
            path.basename(metadataRelativePath),
          ),
        );
        const content = await readFile(
          targetMetadataPath,
          "utf8",
        );
        const document = parse(content);

        if (
          updateTrackReferenceDocument(
            document,
            item.targetId,
          )
        ) {
          const updatedContent =
            `${stringify(document).trimEnd()}\n`;
          parse(updatedContent);
          await writeFileAtomically(
            mediaRoot,
            targetMetadataPath,
            updatedContent,
          );
        }
      }
    }

    const completedAt = new Date().toISOString();
    const renamed = runtimeItems.map((item) => ({
      previousTrackId: item.trackId,
      trackId: item.targetId,
      previousRelativePath:
        item.sourceRelativePath,
      relativePath: item.targetRelativePath,
    }));

    await writeManifest(
      mediaRoot,
      manifestPath,
      {
        ...manifestBase,
        status: "completed",
        completedAt,
        renamed,
      },
      false,
    );

    return {
      releaseId: release.id,
      operationId,
      manifestRelativePath:
        toLibraryRelativePath(
          mediaRoot,
          manifestPath,
        ),
      renamed,
      renamedCount: renamed.length,
      completedAt,
    };
  } catch (error) {
    const rollbackErrors: string[] = [];

    // Restore metadata from exclusive backups before restoring names.
    for (const item of runtimeItems) {
      if (!(await pathExists(item.currentPath))) {
        continue;
      }

      const trackBackupRoot = assertPathWithinRoot(
        mediaRoot,
        path.join(backupRoot, item.trackId),
      );

      for (const metadataRelativePath of item.metadataRelativePaths) {
        const backupPath = assertPathWithinRoot(
          mediaRoot,
          path.join(
            trackBackupRoot,
            path.basename(metadataRelativePath),
          ),
        );
        const currentMetadataPath = assertPathWithinRoot(
          mediaRoot,
          path.join(
            item.currentPath,
            path.basename(metadataRelativePath),
          ),
        );

        try {
          const backupContent = await readFile(
            backupPath,
            "utf8",
          );
          await writeFileAtomically(
            mediaRoot,
            currentMetadataPath,
            backupContent,
          );
        } catch (rollbackError) {
          rollbackErrors.push(
            rollbackError instanceof Error
              ? rollbackError.message
              : String(rollbackError),
          );
        }
      }
    }

    const rollbackTemporaryPaths = new Map<
      string,
      string
    >();

    // Clear target names again before restoring original names.
    for (const [index, item] of runtimeItems.entries()) {
      if (
        item.currentPath === item.sourcePath ||
        !(await pathExists(item.currentPath))
      ) {
        continue;
      }

      const rollbackTemporaryPath = assertPathWithinRoot(
        mediaRoot,
        path.join(
          tracksRoot,
          `.metadata-editor-track-rollback-${operationId}-${String(index + 1).padStart(3, "0")}`,
        ),
      );

      try {
        await rename(
          item.currentPath,
          rollbackTemporaryPath,
        );
        rollbackTemporaryPaths.set(
          item.trackId,
          rollbackTemporaryPath,
        );
      } catch (rollbackError) {
        rollbackErrors.push(
          rollbackError instanceof Error
            ? rollbackError.message
            : String(rollbackError),
        );
      }
    }

    for (const item of runtimeItems) {
      const rollbackTemporaryPath =
        rollbackTemporaryPaths.get(item.trackId);

      if (!rollbackTemporaryPath) {
        continue;
      }

      try {
        if (await pathExists(item.sourcePath)) {
          throw new Error(
            `Rollback source already exists: ${toLibraryRelativePath(mediaRoot, item.sourcePath)}`,
          );
        }

        await rename(
          rollbackTemporaryPath,
          item.sourcePath,
        );
      } catch (rollbackError) {
        rollbackErrors.push(
          rollbackError instanceof Error
            ? rollbackError.message
            : String(rollbackError),
        );
      }
    }

    const errorMessage =
      error instanceof Error
        ? error.message
        : String(error);

    await writeManifest(
      mediaRoot,
      manifestPath,
      {
        ...manifestBase,
        status: rollbackErrors.length === 0
          ? "rolled-back"
          : "rollback-incomplete",
        failedAt: new Date().toISOString(),
        error: errorMessage,
        rollbackErrors,
      },
      false,
    ).catch(() => undefined);

      throw new Error(
        rollbackErrors.length === 0
          ? `${errorMessage} All completed directory changes were rolled back.`
          : `${errorMessage} Rollback was incomplete: ${rollbackErrors.join(" ")}`,
      );
    }
  } finally {
    await lockFile.close().catch(() => undefined);
    await rm(lockPath, { force: true });
  }
}
