import {
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  INGEST_DRAFT_SCHEMA_VERSION,
  type IngestDraftSourceStatus,
  type StoredIngestDraft,
} from "../shared/ingest-drafts.js";
import {
  defaultReleaseArtworkAssignment,
  type IngestArtworkAssignmentDraft,
  type IngestBuildAssetDraft,
  type IngestBuildDraft,
  type IngestBuildTrackDraft,
  type IngestBuildVideoDraft,
} from "../shared/ingest-builder.js";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

export const defaultIngestDraftRoot =
  ".local-state/ingest-drafts";

function draftString(
  value: unknown,
  label: string,
): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be text.`);
  }

  return value;
}

function draftBoolean(
  value: unknown,
  label: string,
): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be true or false.`);
  }

  return value;
}

function parseStoredTrack(
  value: unknown,
  index: number,
): IngestBuildTrackDraft {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error(`Track ${index + 1} must be an object.`);
  }

  const record = value as Record<string, unknown>;

  if (
    typeof record.trackNumber !== "number" ||
    !Number.isSafeInteger(record.trackNumber) ||
    record.trackNumber < 1
  ) {
    throw new Error(`Track ${index + 1} number must be a positive integer.`);
  }

  return {
    sourceRelativePath: draftString(
      record.sourceRelativePath,
      `Track ${index + 1} source path`,
    ),
    include: draftBoolean(
      record.include,
      `Track ${index + 1} include`,
    ),
    trackNumber: record.trackNumber,
    title: draftString(
      record.title,
      `Track ${index + 1} title`,
    ),
    version: draftString(
      record.version,
      `Track ${index + 1} version`,
    ),
    artist: draftString(
      record.artist,
      `Track ${index + 1} artist`,
    ),
    date: draftString(
      record.date,
      `Track ${index + 1} date`,
    ),
    destinationFilename: draftString(
      record.destinationFilename,
      `Track ${index + 1} destination filename`,
    ),
  };
}


function parseStoredVideo(
  value: unknown,
  index: number,
): IngestBuildVideoDraft {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error(`Video ${index + 1} must be an object.`);
  }

  const record = value as Record<string, unknown>;

  return {
    sourceRelativePath: draftString(
      record.sourceRelativePath,
      `Video ${index + 1} source path`,
    ),
    include: draftBoolean(
      record.include,
      `Video ${index + 1} include`,
    ),
    videoId: draftString(
      record.videoId,
      `Video ${index + 1} ID`,
    ),
    title: draftString(
      record.title,
      `Video ${index + 1} title`,
    ),
    videoType: draftString(
      record.videoType,
      `Video ${index + 1} type`,
    ),
    relatedTrackSourceRelativePath:
      typeof record.relatedTrackSourceRelativePath === "string"
        ? record.relatedTrackSourceRelativePath
        : "",
    ...(typeof record.relatedTrackId === "string" &&
    record.relatedTrackId.trim()
      ? {
          relatedTrackId:
            record.relatedTrackId,
        }
      : {}),
    destinationFilename: draftString(
      record.destinationFilename,
      `Video ${index + 1} destination filename`,
    ),
  };
}

function parseStoredArtworkAssignment(
  value: unknown,
  assetIndex: number,
  assignmentIndex: number,
): IngestArtworkAssignmentDraft {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error(
      `Asset ${assetIndex + 1} artwork assignment ${assignmentIndex + 1} must be an object.`,
    );
  }

  const record = value as Record<string, unknown>;
  const scope = record.scope;

  if (scope !== "release" && scope !== "track") {
    throw new Error(
      `Asset ${assetIndex + 1} artwork assignment ${assignmentIndex + 1} scope is invalid.`,
    );
  }

  if (!Array.isArray(record.trackSourceRelativePaths)) {
    throw new Error(
      `Asset ${assetIndex + 1} artwork assignment ${assignmentIndex + 1} tracks must be an array.`,
    );
  }

  return {
    id: draftString(
      record.id,
      `Asset ${assetIndex + 1} artwork assignment ${assignmentIndex + 1} ID`,
    ),
    scope,
    role: draftString(
      record.role,
      `Asset ${assetIndex + 1} artwork assignment ${assignmentIndex + 1} role`,
    ),
    trackSourceRelativePaths:
      record.trackSourceRelativePaths.map(
        (pathValue, trackIndex) =>
          draftString(
            pathValue,
            `Asset ${assetIndex + 1} artwork assignment ${assignmentIndex + 1} track ${trackIndex + 1}`,
          ),
      ),
    ...(record.replaceExisting === true
      ? { replaceExisting: true }
      : {}),
  };
}

function parseStoredAsset(
  value: unknown,
  index: number,
): IngestBuildAssetDraft {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error(`Asset ${index + 1} must be an object.`);
  }

  const record = value as Record<string, unknown>;

  if (
    record.mediaKind !== "image" &&
    record.mediaKind !== "text"
  ) {
    throw new Error(`Asset ${index + 1} must be image or text.`);
  }

  const include = draftBoolean(
    record.include,
    `Asset ${index + 1} include`,
  );
  const artworkAssignments =
    Array.isArray(record.artworkAssignments)
      ? record.artworkAssignments.map(
          (assignment, assignmentIndex) =>
            parseStoredArtworkAssignment(
              assignment,
              index,
              assignmentIndex,
            ),
        )
      : record.mediaKind === "image" && include
        ? [defaultReleaseArtworkAssignment()]
        : [];

  return {
    sourceRelativePath: draftString(
      record.sourceRelativePath,
      `Asset ${index + 1} source path`,
    ),
    include,
    mediaKind: record.mediaKind,
    destinationRelativePath: draftString(
      record.destinationRelativePath,
      `Asset ${index + 1} destination path`,
    ),
    artworkAssignments,
  };
}

function parseDraftForStorage(
  value: unknown,
): IngestBuildDraft {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error("Stored ingest build draft must be an object.");
  }

  const record = value as Record<string, unknown>;

  if (
    !Array.isArray(record.tracks) ||
    (record.videos !== undefined && !Array.isArray(record.videos)) ||
    !Array.isArray(record.assets)
  ) {
    throw new Error("Stored ingest draft tracks, videos, and assets must be arrays when present.");
  }

  return {
    candidateId: draftString(record.candidateId, "Candidate ID"),
    releaseId: draftString(record.releaseId, "Release ID"),
    releaseTitle: draftString(record.releaseTitle, "Release title"),
    releaseArtist: draftString(record.releaseArtist, "Release artist"),
    releaseDate: draftString(record.releaseDate, "Release date"),
    releaseType: draftString(record.releaseType, "Release type"),
    tracks: record.tracks.map(parseStoredTrack),
    videos: Array.isArray(record.videos)
      ? record.videos.map(parseStoredVideo)
      : [],
    assets: record.assets.map(parseStoredAsset),
  };
}

export function resolveIngestDraftRoot(
  configuredRoot =
    process.env.INGEST_DRAFT_ROOT ??
    defaultIngestDraftRoot,
): string {
  const resolved = path.resolve(
    projectRoot,
    configuredRoot,
  );
  const relative = path.relative(
    projectRoot,
    resolved,
  );

  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(
      "INGEST_DRAFT_ROOT must remain inside metadata-editor.",
    );
  }

  return resolved;
}

function draftFilename(
  candidateId: string,
): string {
  if (!candidateId.trim()) {
    throw new Error(
      "Candidate ID is required for an ingest draft.",
    );
  }

  return `${createHash("sha256")
    .update(candidateId)
    .digest("hex")}.json`;
}

function parseStatus(
  value: unknown,
): IngestDraftSourceStatus {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error(
      "Ingest draft source status must be an object.",
    );
  }

  const record = value as Record<
    string,
    unknown
  >;
  const state = record.state;
  const mediaKind = record.mediaKind;

  if (
    typeof record.sourceRelativePath !==
      "string" ||
    !record.sourceRelativePath.trim() ||
    ![
      "unchanged",
      "new",
      "changed",
      "missing",
    ].includes(String(state)) ||
    ![
      "audio",
      "video",
      "image",
      "text",
      "unknown",
    ].includes(String(mediaKind)) ||
    typeof record.reviewed !== "boolean" ||
    typeof record.attached !== "boolean"
  ) {
    throw new Error(
      "Ingest draft source status is malformed.",
    );
  }

  return {
    sourceRelativePath:
      record.sourceRelativePath,
    state: state as IngestDraftSourceStatus["state"],
    mediaKind:
      mediaKind as IngestDraftSourceStatus["mediaKind"],
    ...(typeof record.sizeBytes === "number" &&
    Number.isSafeInteger(record.sizeBytes) &&
    record.sizeBytes >= 0
      ? { sizeBytes: record.sizeBytes }
      : {}),
    ...(typeof record.modifiedAt === "string"
      ? { modifiedAt: record.modifiedAt }
      : {}),
    reviewed: record.reviewed,
    attached: record.attached,
  };
}

export function parseStoredIngestDraft(
  value: unknown,
): StoredIngestDraft {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error(
      "Stored ingest draft must be an object.",
    );
  }

  const record = value as Record<
    string,
    unknown
  >;

  if (
    record.schemaVersion !==
      INGEST_DRAFT_SCHEMA_VERSION ||
    typeof record.candidateId !== "string" ||
    !record.candidateId.trim() ||
    typeof record.updatedAt !== "string" ||
    !Array.isArray(record.sourceStatuses)
  ) {
    throw new Error(
      "Stored ingest draft has an unsupported or malformed schema.",
    );
  }

  const draft = parseDraftForStorage(
    record.draft,
  );

  if (
    draft.candidateId !== record.candidateId
  ) {
    throw new Error(
      "Stored ingest draft candidate does not match its build draft.",
    );
  }

  return {
    schemaVersion:
      INGEST_DRAFT_SCHEMA_VERSION,
    candidateId: record.candidateId,
    updatedAt: record.updatedAt,
    draft,
    sourceStatuses:
      record.sourceStatuses.map(parseStatus),
  };
}

export async function readStoredIngestDraft(
  candidateId: string,
  draftRoot = resolveIngestDraftRoot(),
): Promise<StoredIngestDraft | null> {
  const target = path.join(
    draftRoot,
    draftFilename(candidateId),
  );

  try {
    return parseStoredIngestDraft(
      JSON.parse(
        await readFile(target, "utf8"),
      ),
    );
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
}

export async function writeStoredIngestDraft(
  value: unknown,
  draftRoot = resolveIngestDraftRoot(),
): Promise<StoredIngestDraft> {
  const parsed = parseStoredIngestDraft(
    value,
  );
  const stored: StoredIngestDraft = {
    ...parsed,
    updatedAt: new Date().toISOString(),
  };
  const target = path.join(
    draftRoot,
    draftFilename(stored.candidateId),
  );
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;

  await mkdir(draftRoot, {
    recursive: true,
    mode: 0o700,
  });

  try {
    await writeFile(
      temporary,
      `${JSON.stringify(stored, null, 2)}\n`,
      {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      },
    );
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, {
      force: true,
    });
    throw error;
  }

  return stored;
}

export async function deleteStoredIngestDraft(
  candidateId: string,
  draftRoot = resolveIngestDraftRoot(),
): Promise<void> {
  await rm(
    path.join(
      draftRoot,
      draftFilename(candidateId),
    ),
    { force: true },
  );
}
