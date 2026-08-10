import {
  createReadStream,
} from "node:fs";
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

export const ingestReceiptTrackRepairConfirmation =
  "REPAIR_INGEST_RECEIPT_TRACK_PATHS";

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
  ingestReceiptUpdated?: boolean;
  completedAt: string;
};

export type IngestReceiptTrackRepairPlanItem = {
  previousTrackId: string;
  previousTrackNumber: number;
  trackId: string;
  trackNumber: number;
  previousRelativePath: string;
  relativePath: string;
};

export type IngestReceiptTrackRepairPlan = {
  releaseId: string;
  receiptRelativePath: string;
  confirmation: typeof ingestReceiptTrackRepairConfirmation;
  generatedAt: string;
  items: IngestReceiptTrackRepairPlanItem[];
  verifiedCopyCount: number;
  blockedReasons: string[];
  fingerprint: string;
};

export type IngestReceiptTrackRepairReceipt = {
  releaseId: string;
  operationId: string | null;
  manifestRelativePath: string | null;
  repairedCount: number;
  completedAt: string;
};

type TrackIdPathMapping = {
  previousTrackId: string;
  trackId: string;
  trackNumber?: number;
};

type PreparedReceiptRewrite = {
  receiptPath: string;
  receiptRelativePath: string;
  originalContent: string;
  updatedContent: string;
  changedCount: number;
  document: Record<string, unknown>;
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

function rewriteTrackScopedString(
  value: string,
  releaseRelativePath: string,
  mappings: readonly TrackIdPathMapping[],
): string {
  for (const mapping of mappings) {
    if (value === mapping.previousTrackId) {
      return mapping.trackId;
    }

    const previousPrefix =
      `${releaseRelativePath}/tracks/${mapping.previousTrackId}`;
    const nextPrefix =
      `${releaseRelativePath}/tracks/${mapping.trackId}`;

    if (value === previousPrefix) {
      return nextPrefix;
    }

    if (value.startsWith(`${previousPrefix}/`)) {
      return `${nextPrefix}${value.slice(previousPrefix.length)}`;
    }
  }

  return value;
}

function rewriteIngestReceiptTrackReferences(
  document: Record<string, unknown>,
  releaseRelativePath: string,
  mappings: readonly TrackIdPathMapping[],
): number {
  let changedCount = 0;

  const rewriteRecordString = (
    record: Record<string, unknown>,
    key: string,
  ): void => {
    const value = record[key];

    if (typeof value !== "string") {
      return;
    }

    const rewritten = rewriteTrackScopedString(
      value,
      releaseRelativePath,
      mappings,
    );

    if (rewritten !== value) {
      record[key] = rewritten;
      changedCount += 1;
    }
  };

  if (Array.isArray(document.tracks)) {
    for (const track of document.tracks) {
      if (!isRecord(track)) {
        continue;
      }

      const previousTrackId =
        typeof track.id === "string"
          ? track.id
          : null;
      const mapping = previousTrackId
        ? mappings.find(
            (candidate) =>
              candidate.previousTrackId ===
              previousTrackId,
          )
        : undefined;

      rewriteRecordString(track, "id");
      rewriteRecordString(
        track,
        "destinationRelativePath",
      );

      if (
        mapping?.trackNumber !== undefined &&
        track.number !== mapping.trackNumber
      ) {
        track.number = mapping.trackNumber;
        changedCount += 1;
      }
    }
  }

  if (Array.isArray(document.videos)) {
    for (const video of document.videos) {
      if (!isRecord(video)) {
        continue;
      }

      rewriteRecordString(video, "relatedTrackId");
      rewriteRecordString(
        video,
        "destinationRelativePath",
      );
    }
  }

  const copies = document.copies;

  if (Array.isArray(copies)) {
    for (const copy of copies) {
      if (!isRecord(copy)) {
        continue;
      }

      rewriteRecordString(
        copy,
        "destinationRelativePath",
      );
    }
  }

  return changedCount;
}

async function readPreparedReceiptRewrite(
  mediaRoot: string,
  release: ReleaseScanResult,
  mappings: readonly TrackIdPathMapping[],
  allowStaleTrackIds = false,
): Promise<PreparedReceiptRewrite | null> {
  const receiptPath = assertPathWithinRoot(
    mediaRoot,
    path.join(
      mediaRoot,
      release.relativePath,
      "ingest-receipt.json",
    ),
  );
  const receiptRelativePath = toLibraryRelativePath(
    mediaRoot,
    receiptPath,
  );
  let stats;

  try {
    stats = await lstat(receiptPath);
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }

    throw error;
  }

  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(
      `${receiptRelativePath} must be a regular non-symbolic JSON file before track identity can be synchronized.`,
    );
  }

  const originalContent = await readFile(
    receiptPath,
    "utf8",
  );
  let parsed: unknown;

  try {
    parsed = JSON.parse(originalContent) as unknown;
  } catch (error) {
    throw new Error(
      `Unable to parse ${receiptRelativePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (!isRecord(parsed)) {
    throw new Error(
      `${receiptRelativePath} must contain a JSON object before track identity can be synchronized.`,
    );
  }

  const receiptRelease = parsed.release;

  if (
    !isRecord(receiptRelease) ||
    receiptRelease.id !== release.id ||
    receiptRelease.relativePath !== release.relativePath
  ) {
    throw new Error(
      `${receiptRelativePath} release identity does not match ${release.id}; repair release identity before track references.`,
    );
  }

  if (!allowStaleTrackIds && Array.isArray(parsed.tracks)) {
    const currentTrackIds = new Set(
      release.tracks.map((track) => track.id),
    );
    const orphanTrackIds = parsed.tracks
      .filter(isRecord)
      .map((track) => track.id)
      .filter(
        (trackId): trackId is string =>
          typeof trackId === "string" &&
          Boolean(trackId.trim()) &&
          !currentTrackIds.has(trackId),
      );

    if (orphanTrackIds.length > 0) {
      throw new Error(
        `${receiptRelativePath} already contains stale track IDs (${orphanTrackIds.join(", ")}). Run the explicit ingest-receipt track repair before another directory synchronization.`,
      );
    }
  }

  const changedCount = rewriteIngestReceiptTrackReferences(
    parsed,
    release.relativePath,
    mappings,
  );
  const updatedContent = `${JSON.stringify(
    parsed,
    null,
    2,
  )}\n`;

  JSON.parse(updatedContent);

  return {
    receiptPath,
    receiptRelativePath,
    originalContent,
    updatedContent,
    changedCount,
    document: parsed,
  };
}

async function hashRegularFile(
  filename: string,
): Promise<string> {
  const hash = createHash("sha256");

  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filename);
    stream.on("data", (chunk: Buffer | string) => {
      hash.update(chunk);
    });
    stream.on("error", reject);
    stream.on("end", resolve);
  });

  return hash.digest("hex");
}

async function verifyRewrittenReceiptCopies(
  mediaRoot: string,
  release: ReleaseScanResult,
  document: Record<string, unknown>,
): Promise<{
  verifiedCopyCount: number;
  blockedReasons: string[];
}> {
  const copies = document.copies;

  if (!Array.isArray(copies)) {
    return {
      verifiedCopyCount: 0,
      blockedReasons: [
        "ingest-receipt.json does not contain a copies array.",
      ],
    };
  }

  let verifiedCopyCount = 0;
  const blockedReasons: string[] = [];

  for (const [index, copy] of copies.entries()) {
    if (
      !isRecord(copy) ||
      typeof copy.destinationRelativePath !== "string" ||
      !copy.destinationRelativePath.trim()
    ) {
      blockedReasons.push(
        `Receipt copy ${index + 1} has no usable destination path.`,
      );
      continue;
    }

    const destination =
      copy.destinationRelativePath.replaceAll("\\\\", "/");

    try {
      if (
        path.posix.isAbsolute(destination) ||
        path.win32.isAbsolute(destination)
      ) {
        throw new Error(
          "receipt destination must be Library-relative",
        );
      }

      const absoluteDestination = assertPathWithinRoot(
        mediaRoot,
        path.resolve(
          mediaRoot,
          ...destination.split("/").filter(Boolean),
        ),
      );
      const normalizedDestination = toLibraryRelativePath(
        mediaRoot,
        absoluteDestination,
      );

      if (
        normalizedDestination !== release.relativePath &&
        !normalizedDestination.startsWith(
          `${release.relativePath}/`,
        )
      ) {
        throw new Error(
          "receipt destination is outside the containing release",
        );
      }

      const stats = await lstat(absoluteDestination);

      if (!stats.isFile() || stats.isSymbolicLink()) {
        throw new Error(
          "destination is not a regular non-symbolic file",
        );
      }

      if (
        typeof copy.bytes === "number" &&
        Number.isFinite(copy.bytes) &&
        stats.size !== copy.bytes
      ) {
        throw new Error(
          `size mismatch: receipt=${copy.bytes}, current=${stats.size}`,
        );
      }

      if (
        typeof copy.sourceSha256 === "string" &&
        copy.sourceSha256.trim()
      ) {
        const currentHash = await hashRegularFile(
          absoluteDestination,
        );

        if (currentHash !== copy.sourceSha256) {
          throw new Error(
            `SHA-256 mismatch: receipt=${copy.sourceSha256}, current=${currentHash}`,
          );
        }
      }

      verifiedCopyCount += 1;
    } catch (error) {
      blockedReasons.push(
        `${copy.destinationRelativePath}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return { verifiedCopyCount, blockedReasons };
}

function fingerprintReceiptRepair(
  releaseId: string,
  items: readonly IngestReceiptTrackRepairPlanItem[],
  blockedReasons: readonly string[],
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        releaseId,
        items,
        blockedReasons,
      }),
    )
    .digest("hex");
}

export async function buildIngestReceiptTrackRepairPlan(
  mediaRoot: string,
  release: ReleaseScanResult,
): Promise<IngestReceiptTrackRepairPlan> {
  const receiptRelativePath =
    `${release.relativePath}/ingest-receipt.json`;
  const receiptPath = assertPathWithinRoot(
    mediaRoot,
    path.join(mediaRoot, receiptRelativePath),
  );
  let receiptStats;

  try {
    receiptStats = await lstat(receiptPath);
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      const blockedReasons = [
        `${receiptRelativePath} does not exist.`,
      ];

      return {
        releaseId: release.id,
        receiptRelativePath,
        confirmation: ingestReceiptTrackRepairConfirmation,
        generatedAt: new Date().toISOString(),
        items: [],
        verifiedCopyCount: 0,
        blockedReasons,
        fingerprint: fingerprintReceiptRepair(
          release.id,
          [],
          blockedReasons,
        ),
      };
    }

    throw error;
  }

  if (!receiptStats.isFile() || receiptStats.isSymbolicLink()) {
    const blockedReasons = [
      `${receiptRelativePath} is not a regular non-symbolic file.`,
    ];

    return {
      releaseId: release.id,
      receiptRelativePath,
      confirmation: ingestReceiptTrackRepairConfirmation,
      generatedAt: new Date().toISOString(),
      items: [],
      verifiedCopyCount: 0,
      blockedReasons,
      fingerprint: fingerprintReceiptRepair(
        release.id,
        [],
        blockedReasons,
      ),
    };
  }

  let document: unknown;

  try {
    document = JSON.parse(
      await readFile(receiptPath, "utf8"),
    ) as unknown;
  } catch (error) {
    const blockedReasons = [
      `Unable to parse ${receiptRelativePath}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    ];

    return {
      releaseId: release.id,
      receiptRelativePath,
      confirmation: ingestReceiptTrackRepairConfirmation,
      generatedAt: new Date().toISOString(),
      items: [],
      verifiedCopyCount: 0,
      blockedReasons,
      fingerprint: fingerprintReceiptRepair(
        release.id,
        [],
        blockedReasons,
      ),
    };
  }

  if (
    !isRecord(document) ||
    !Array.isArray(document.tracks) ||
    !Array.isArray(document.copies)
  ) {
    const blockedReasons = [
      `${receiptRelativePath} must contain an object with tracks and copies arrays.`,
    ];

    return {
      releaseId: release.id,
      receiptRelativePath,
      confirmation: ingestReceiptTrackRepairConfirmation,
      generatedAt: new Date().toISOString(),
      items: [],
      verifiedCopyCount: 0,
      blockedReasons,
      fingerprint: fingerprintReceiptRepair(
        release.id,
        [],
        blockedReasons,
      ),
    };
  }

  const blockedReasons: string[] = [];
  const receiptRelease = document.release;

  if (
    !isRecord(receiptRelease) ||
    receiptRelease.id !== release.id ||
    receiptRelease.relativePath !== release.relativePath
  ) {
    blockedReasons.push(
      `${receiptRelativePath} release identity does not match ${release.id}; repair release identity before track references.`,
    );
  }

  type CurrentCanonicalTrack = {
    track: TrackScanResult;
    trackNumber: number;
    bytes: number;
    sha256: string;
  };

  const currentCanonicalTracks: CurrentCanonicalTrack[] = [];

  for (const track of release.tracks) {
    if (track.audioMasters.length !== 1) {
      blockedReasons.push(
        track.audioMasters.length === 0
          ? `${track.relativePath}: no canonical audio master is available for receipt identity matching.`
          : `${track.relativePath}: multiple canonical audio masters prevent unambiguous receipt identity matching.`,
      );
      continue;
    }

    const numbering = await readTrackNumbering(
      mediaRoot,
      track,
    );

    if (numbering.trackNumber === null) {
      blockedReasons.push(
        `${track.relativePath}: a saved track number is required before receipt identity can be repaired.`,
      );
      continue;
    }

    const master = track.audioMasters[0]!;
    const masterPath = assertPathWithinRoot(
      mediaRoot,
      path.join(mediaRoot, master.relativePath),
    );

    try {
      const stats = await lstat(masterPath);

      if (!stats.isFile() || stats.isSymbolicLink()) {
        blockedReasons.push(
          `${master.relativePath}: canonical audio must be a regular non-symbolic file before receipt identity matching.`,
        );
        continue;
      }

      currentCanonicalTracks.push({
        track,
        trackNumber: numbering.trackNumber,
        bytes: stats.size,
        sha256: await hashRegularFile(masterPath),
      });
    } catch (error) {
      blockedReasons.push(
        `${master.relativePath}: ${
          error instanceof Error
            ? error.message
            : String(error)
        }`,
      );
    }
  }

  const receiptCopies =
    document.copies.filter(isRecord);

  const canonicalReceiptCopyFor = (
    previousTrackId: string,
  ): Record<string, unknown> | null => {
    const prefix =
      `${release.relativePath}/tracks/${previousTrackId}/`;
    const candidates = receiptCopies.filter((copy) => {
      if (
        typeof copy.destinationRelativePath !== "string"
      ) {
        return false;
      }

      const destination =
        copy.destinationRelativePath.replaceAll("\\", "/");

      if (!destination.startsWith(prefix)) {
        return false;
      }

      const logicalRoles = Array.isArray(copy.logicalRoles)
        ? copy.logicalRoles.filter(
            (role): role is string =>
              typeof role === "string",
          )
        : [];
      const basename = path.posix.basename(destination);

      return (
        logicalRoles.includes("audio-master") ||
        /^audio-master\.[^/]+$/i.test(basename)
      );
    });

    if (candidates.length !== 1) {
      blockedReasons.push(
        candidates.length === 0
          ? `Receipt track ${previousTrackId} has no unique canonical audio-master copy record.`
          : `Receipt track ${previousTrackId} has multiple canonical audio-master copy records.`,
      );
      return null;
    }

    return candidates[0]!;
  };

  const items: IngestReceiptTrackRepairPlanItem[] = [];
  const seenPreviousIds = new Set<string>();
  const claimedCurrentTrackIds = new Set<string>();

  for (
    const [index, receiptTrack] of
    document.tracks.entries()
  ) {
    if (
      !isRecord(receiptTrack) ||
      typeof receiptTrack.id !== "string" ||
      !receiptTrack.id.trim() ||
      typeof receiptTrack.number !== "number" ||
      !Number.isSafeInteger(receiptTrack.number) ||
      receiptTrack.number < 1
    ) {
      blockedReasons.push(
        `Receipt track ${index + 1} has no usable ID/number pair.`,
      );
      continue;
    }

    const previousTrackId = receiptTrack.id.trim();
    const previousTrackNumber = receiptTrack.number;

    if (seenPreviousIds.has(previousTrackId)) {
      blockedReasons.push(
        `Receipt track ID ${previousTrackId} is duplicated.`,
      );
      continue;
    }
    seenPreviousIds.add(previousTrackId);

    const canonicalCopy =
      canonicalReceiptCopyFor(previousTrackId);

    if (!canonicalCopy) {
      continue;
    }

    const bytes = canonicalCopy.bytes;
    const sha256 =
      typeof canonicalCopy.sourceSha256 === "string"
        ? canonicalCopy.sourceSha256.trim().toLowerCase()
        : "";

    if (
      typeof bytes !== "number" ||
      !Number.isSafeInteger(bytes) ||
      bytes < 0 ||
      !/^[a-f0-9]{64}$/.test(sha256)
    ) {
      blockedReasons.push(
        `Receipt track ${previousTrackId} canonical audio copy must contain a usable byte count and SHA-256 hash.`,
      );
      continue;
    }

    const matches = currentCanonicalTracks.filter(
      (candidate) =>
        candidate.bytes === bytes &&
        candidate.sha256.toLowerCase() === sha256,
    );

    if (matches.length === 0) {
      blockedReasons.push(
        `Receipt track ${previousTrackId}: no current Library canonical audio master matches the recorded SHA-256 ${sha256} and byte size ${bytes}.`,
      );
      continue;
    }

    if (matches.length > 1) {
      blockedReasons.push(
        `Receipt track ${previousTrackId}: multiple current Library tracks share the recorded canonical audio SHA-256 and byte size (${matches.map(({ track }) => track.id).join(", ")}); repair refuses to guess.`,
      );
      continue;
    }

    const match = matches[0]!;

    if (claimedCurrentTrackIds.has(match.track.id)) {
      blockedReasons.push(
        `Current Library track ${match.track.id} matched more than one receipt track; repair refuses a many-to-one identity mapping.`,
      );
      continue;
    }
    claimedCurrentTrackIds.add(match.track.id);

    const previousRelativePath =
      `${release.relativePath}/tracks/${previousTrackId}`;

    if (
      previousTrackId === match.track.id &&
      previousTrackNumber === match.trackNumber &&
      previousRelativePath === match.track.relativePath
    ) {
      continue;
    }

    items.push({
      previousTrackId,
      previousTrackNumber,
      trackId: match.track.id,
      trackNumber: match.trackNumber,
      previousRelativePath,
      relativePath: match.track.relativePath,
    });
  }

  let verifiedCopyCount = 0;

  if (blockedReasons.length === 0) {
    const cloned = JSON.parse(
      JSON.stringify(document),
    ) as Record<string, unknown>;
    rewriteIngestReceiptTrackReferences(
      cloned,
      release.relativePath,
      items,
    );
    const verification = await verifyRewrittenReceiptCopies(
      mediaRoot,
      release,
      cloned,
    );
    verifiedCopyCount = verification.verifiedCopyCount;
    blockedReasons.push(...verification.blockedReasons);
  }

  return {
    releaseId: release.id,
    receiptRelativePath,
    confirmation: ingestReceiptTrackRepairConfirmation,
    generatedAt: new Date().toISOString(),
    items,
    verifiedCopyCount,
    blockedReasons,
    fingerprint: fingerprintReceiptRepair(
      release.id,
      items,
      blockedReasons,
    ),
  };
}

export async function executeIngestReceiptTrackRepair(
  mediaRoot: string,
  release: ReleaseScanResult,
  confirmation: string,
  expectedFingerprint: string,
): Promise<IngestReceiptTrackRepairReceipt> {
  if (confirmation !== ingestReceiptTrackRepairConfirmation) {
    throw new Error(
      `Confirmation must be ${ingestReceiptTrackRepairConfirmation}.`,
    );
  }

  const plan = await buildIngestReceiptTrackRepairPlan(
    mediaRoot,
    release,
  );

  if (
    !expectedFingerprint ||
    expectedFingerprint !== plan.fingerprint
  ) {
    throw new Error(
      "Ingest receipt track repair plan changed. Review the latest dry-run plan before applying it.",
    );
  }

  if (plan.blockedReasons.length > 0) {
    throw new Error(
      `Ingest receipt track repair is blocked. ${plan.blockedReasons.join(" ")}`,
    );
  }

  if (plan.items.length === 0) {
    return {
      releaseId: release.id,
      operationId: null,
      manifestRelativePath: null,
      repairedCount: 0,
      completedAt: new Date().toISOString(),
    };
  }

  const prepared = await readPreparedReceiptRewrite(
    mediaRoot,
    release,
    plan.items,
    true,
  );

  if (!prepared || prepared.changedCount === 0) {
    throw new Error(
      "The reviewed receipt repair no longer produces any changes. Refresh the repair plan.",
    );
  }

  const releasePath = assertPathWithinRoot(
    mediaRoot,
    path.join(mediaRoot, release.relativePath),
  );
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

  const operationId = randomUUID();
  const operationRoot = assertPathWithinRoot(
    mediaRoot,
    path.join(
      operationsRoot,
      `ingest-receipt-track-repair-${operationId}`,
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
  const backupPath = assertPathWithinRoot(
    mediaRoot,
    path.join(backupRoot, "ingest-receipt.json"),
  );
  const manifestPath = assertPathWithinRoot(
    mediaRoot,
    path.join(operationRoot, "manifest.json"),
  );
  const manifestBase = {
    schemaVersion: 1,
    operationId,
    operation: "ingest-receipt-track-repair",
    releaseId: release.id,
    createdAt: new Date().toISOString(),
    plan,
  };

  await writeManifest(
    mediaRoot,
    manifestPath,
    { ...manifestBase, status: "planned" },
    true,
  );

  try {
    await copyFile(
      prepared.receiptPath,
      backupPath,
      constants.COPYFILE_EXCL,
    );
    await writeFileAtomically(
      mediaRoot,
      prepared.receiptPath,
      prepared.updatedContent,
    );

    const reread = await readFile(
      prepared.receiptPath,
      "utf8",
    );
    JSON.parse(reread);

    const completedAt = new Date().toISOString();
    await writeManifest(
      mediaRoot,
      manifestPath,
      {
        ...manifestBase,
        status: "completed",
        completedAt,
        repairedCount: plan.items.length,
      },
      false,
    );

    return {
      releaseId: release.id,
      operationId,
      manifestRelativePath: toLibraryRelativePath(
        mediaRoot,
        manifestPath,
      ),
      repairedCount: plan.items.length,
      completedAt,
    };
  } catch (error) {
    const rollbackErrors: string[] = [];

    try {
      const backupContent = await readFile(
        backupPath,
        "utf8",
      );
      await writeFileAtomically(
        mediaRoot,
        prepared.receiptPath,
        backupContent,
      );
    } catch (rollbackError) {
      rollbackErrors.push(
        rollbackError instanceof Error
          ? rollbackError.message
          : String(rollbackError),
      );
    }

    const errorMessage =
      error instanceof Error ? error.message : String(error);

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
        ? `${errorMessage} The ingest receipt was rolled back.`
        : `${errorMessage} Receipt rollback was incomplete: ${rollbackErrors.join(" ")}`,
    );
  }
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

  let ingestReceiptRewrite: PreparedReceiptRewrite | null = null;
  let ingestReceiptBackupPath: string | null = null;

  try {
    ingestReceiptRewrite = await readPreparedReceiptRewrite(
      mediaRoot,
      release,
      runtimeItems.map((item) => ({
        previousTrackId: item.trackId,
        trackId: item.targetId,
        ...(item.trackNumber === null
          ? {}
          : { trackNumber: item.trackNumber }),
      })),
    );

    if (
      ingestReceiptRewrite &&
      ingestReceiptRewrite.changedCount > 0
    ) {
      ingestReceiptBackupPath = assertPathWithinRoot(
        mediaRoot,
        path.join(backupRoot, "ingest-receipt.json"),
      );
      await copyFile(
        ingestReceiptRewrite.receiptPath,
        ingestReceiptBackupPath,
        constants.COPYFILE_EXCL,
      );
    }

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

    if (
      ingestReceiptRewrite &&
      ingestReceiptRewrite.changedCount > 0
    ) {
      await writeFileAtomically(
        mediaRoot,
        ingestReceiptRewrite.receiptPath,
        ingestReceiptRewrite.updatedContent,
      );
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
        ingestReceiptUpdated: Boolean(
          ingestReceiptRewrite &&
          ingestReceiptRewrite.changedCount > 0
        ),
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
      ingestReceiptUpdated: Boolean(
        ingestReceiptRewrite &&
        ingestReceiptRewrite.changedCount > 0
      ),
      completedAt,
    };
  } catch (error) {
    const rollbackErrors: string[] = [];

    if (
      ingestReceiptRewrite &&
      ingestReceiptBackupPath
    ) {
      try {
        const backupContent = await readFile(
          ingestReceiptBackupPath,
          "utf8",
        );
        await writeFileAtomically(
          mediaRoot,
          ingestReceiptRewrite.receiptPath,
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
