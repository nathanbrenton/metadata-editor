import {
  constants as fsConstants,
  createReadStream,
} from "node:fs";
import {
  access,
  copyFile,
  cp,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import {
  createHash,
  randomUUID,
} from "node:crypto";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  parse,
  stringify,
} from "smol-toml";

import {
  formatTrackDisplayTitle,
} from "../shared/track-title.js";
import {
  generateArtistSortName,
} from "../shared/artist-sort-name.js";
import {
  INGEST_BUILD_CONFIRMATION_PHRASE,
  INGEST_UPDATE_CONFIRMATION_PHRASE,
  slugifyIngestValue,
  defaultReleaseArtworkAssignment,
  type IngestArtworkAssignmentDraft,
  type IngestBuildAssetDraft,
  type IngestBuildCopyReceipt,
  type IngestBuildDraft,
  type IngestBuildPlanItem,
  type IngestBuildPreview,
  type IngestBuildResult,
  type IngestBuildOperation,
  type IngestStagingTargetStatus,
  type IngestBuildTrackDraft,
  type IngestBuildVideoDraft,
  type IngestEmbeddedArtworkSourceDraft,
} from "../shared/ingest-builder.js";
import type {
  IngestCandidateInspection,
  IngestFileInspection,
  IngestMediaKind,
} from "../shared/ingest-types.js";
import {
  assertPathWithinRoot,
  defaultMediaLibraryRoot,
} from "./media-root.js";
import {
  assertPathWithinIngestRoot,
} from "./ingest-root.js";
import { extractEmbeddedArtwork } from "./embedded-artwork.js";
import {
  buildGeneratedTomlPreview,
} from "./toml-preview.js";
import type {
  GeneratedMetadataDocument,
  LibraryMetadataPreview,
  MetadataFileStatus,
  ReleaseScanResult,
  TrackScanResult,
} from "./types.js";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

export const defaultIngestOutputRoot =
  defaultMediaLibraryRoot;

export async function resolveIngestOutputRoot(
  configuredRoot =
    process.env.INGEST_OUTPUT_ROOT ??
    defaultIngestOutputRoot,
): Promise<string> {
  const candidate = path.resolve(
    projectRoot,
    configuredRoot,
  );

  return realpath(candidate);
}

type PreparedCopy = {
  sourceRelativePath: string;
  writeAction: "create" | "replace";
  replacementOfDestinationRelativePath?: string;
  sourcePath: string;
  embeddedArtwork?: {
    streamIndex: number;
    codecName?: string;
    containerBytes: number;
    containerSha256: string;
    containerMtimeMs: number;
  };
  destinationRelativePath: string;
  destinationWithinRelease: string;
  mediaKind: IngestMediaKind;
  logicalRoles: string[];
  bytes: number;
  sha256: string;
};

type PreparedDocument = GeneratedMetadataDocument & {
  writeAction: "create" | "replace";
};

type PreparedRemoval = {
  destinationRelativePath: string;
  destinationWithinRelease: string;
  reason: string;
};

type PreparedIngestBuild = {
  preview: IngestBuildPreview;
  operation: IngestBuildOperation;
  releasePath: string;
  releaseRelativePath: string;
  documents: PreparedDocument[];
  copies: PreparedCopy[];
  removals: PreparedRemoval[];
  preservedFiles: string[];
  receiptContent: string;
};

type ExistingReceiptTrack = {
  id: string;
  number: number;
  title: string;
  version: string;
  artist: string;
  sourceDate: string;
  sourceRelativePath: string;
  destinationRelativePath: string;
};

type ExistingReceiptVideo = {
  id: string;
  title: string;
  videoType: string;
  sourceRelativePath: string;
  destinationRelativePath: string;
  relatedTrackId?: string;
};

type ExistingReceiptCopy = {
  sourceRelativePath: string;
  destinationRelativePath: string;
  mediaKind: IngestMediaKind;
  logicalRoles: string[];
  bytes: number;
  sourceSha256: string;
};

type ExistingIngestReceipt = {
  raw: Record<string, unknown>;
  tracks: ExistingReceiptTrack[];
  videos: ExistingReceiptVideo[];
  copies: ExistingReceiptCopy[];
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

function requireString(
  value: unknown,
  label: string,
  maximumLength = 500,
): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be text.`);
  }

  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`${label} is required.`);
  }

  if (normalized.length > maximumLength) {
    throw new Error(
      `${label} exceeds ${maximumLength} characters.`,
    );
  }

  return normalized;
}

function optionalString(
  value: unknown,
  label: string,
  maximumLength = 500,
): string {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value !== "string") {
    throw new Error(`${label} must be text.`);
  }

  const normalized = value.trim();

  if (normalized.length > maximumLength) {
    throw new Error(
      `${label} exceeds ${maximumLength} characters.`,
    );
  }

  return normalized;
}

function requireBoolean(
  value: unknown,
  label: string,
): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be true or false.`);
  }

  return value;
}

function requirePositiveInteger(
  value: unknown,
  label: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1
  ) {
    throw new Error(
      `${label} must be a positive integer.`,
    );
  }

  return value;
}

function requireSha256(
  value: unknown,
  label: string,
): string {
  const normalized = requireString(value, label, 64);
  if (!/^[a-f0-9]{64}$/i.test(normalized)) {
    throw new Error(`${label} must be a 64-character hexadecimal digest.`);
  }
  return normalized.toLowerCase();
}

function requireIsoDate(
  value: unknown,
  label: string,
  allowBlank = false,
): string {
  const normalized = allowBlank
    ? optionalString(value, label, 10)
    : requireString(value, label, 10);

  if (allowBlank && !normalized) {
    return "";
  }

  const match = normalized.match(
    /^(\d{4})-(\d{2})-(\d{2})$/,
  );

  if (!match) {
    throw new Error(
      `${label} must use YYYY-MM-DD.`,
    );
  }

  const date = new Date(
    Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
    ),
  );

  if (
    date.getUTCFullYear() !== Number(match[1]) ||
    date.getUTCMonth() + 1 !== Number(match[2]) ||
    date.getUTCDate() !== Number(match[3])
  ) {
    throw new Error(`${label} is not a valid date.`);
  }

  return normalized;
}

function parseTrackDraft(
  value: unknown,
  index: number,
): IngestBuildTrackDraft {
  if (!isRecord(value)) {
    throw new Error(
      `Track ${index + 1} must be an object.`,
    );
  }

  return {
    sourceRelativePath: requireString(
      value.sourceRelativePath,
      `Track ${index + 1} source path`,
      1000,
    ),
    include: requireBoolean(
      value.include,
      `Track ${index + 1} include`,
    ),
    trackNumber: requirePositiveInteger(
      value.trackNumber,
      `Track ${index + 1} number`,
    ),
    title: requireString(
      value.title,
      `Track ${index + 1} title`,
    ),
    version: optionalString(
      value.version,
      `Track ${index + 1} version`,
    ),
    artist: requireString(
      value.artist,
      `Track ${index + 1} artist`,
    ),
    date: requireIsoDate(
      value.date,
      `Track ${index + 1} source date`,
      true,
    ),
    destinationFilename: requireString(
      value.destinationFilename,
      `Track ${index + 1} destination filename`,
      255,
    ),
  };
}


function parseVideoDraft(
  value: unknown,
  index: number,
): IngestBuildVideoDraft {
  if (!isRecord(value)) {
    throw new Error(`Video ${index + 1} must be an object.`);
  }

  const videoId = requireString(
    value.videoId,
    `Video ${index + 1} ID`,
    160,
  );
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(videoId)) {
    throw new Error(
      `Video ${index + 1} ID may contain lowercase letters, numbers, hyphens, and underscores only.`,
    );
  }

  return {
    sourceRelativePath: requireString(
      value.sourceRelativePath,
      `Video ${index + 1} source path`,
      1000,
    ),
    include: requireBoolean(
      value.include,
      `Video ${index + 1} include`,
    ),
    videoId,
    title: requireString(
      value.title,
      `Video ${index + 1} title`,
    ),
    videoType: requireString(
      value.videoType,
      `Video ${index + 1} type`,
      80,
    ),
    relatedTrackSourceRelativePath: optionalString(
      value.relatedTrackSourceRelativePath,
      `Video ${index + 1} related track source`,
      1000,
    ),
    destinationFilename: requireString(
      value.destinationFilename,
      `Video ${index + 1} destination filename`,
      255,
    ),
  };
}


function parseArtworkAssignmentDraft(
  value: unknown,
  assetIndex: number,
  assignmentIndex: number,
): IngestArtworkAssignmentDraft {
  if (!isRecord(value)) {
    throw new Error(
      `Asset ${assetIndex + 1} artwork assignment ${assignmentIndex + 1} must be an object.`,
    );
  }

  if (value.scope !== "release" && value.scope !== "track") {
    throw new Error(
      `Asset ${assetIndex + 1} artwork assignment ${assignmentIndex + 1} scope must be release or track.`,
    );
  }

  if (!Array.isArray(value.trackSourceRelativePaths)) {
    throw new Error(
      `Asset ${assetIndex + 1} artwork assignment ${assignmentIndex + 1} track paths must be an array.`,
    );
  }

  return {
    id: requireString(
      value.id,
      `Asset ${assetIndex + 1} artwork assignment ${assignmentIndex + 1} ID`,
      160,
    ),
    scope: value.scope,
    role: requireString(
      value.role,
      `Asset ${assetIndex + 1} artwork assignment ${assignmentIndex + 1} role`,
      80,
    ),
    trackSourceRelativePaths:
      value.trackSourceRelativePaths.map(
        (trackPath, trackIndex) =>
          requireString(
            trackPath,
            `Asset ${assetIndex + 1} artwork assignment ${assignmentIndex + 1} track ${trackIndex + 1}`,
            1000,
          ),
      ),
    ...(value.replaceExisting === true
      ? { replaceExisting: true }
      : {}),
  };
}

function parseEmbeddedArtworkSource(
  value: unknown,
  assetIndex: number,
) {
  if (!isRecord(value)) {
    throw new Error(
      `Asset ${assetIndex + 1} embedded artwork source must be an object.`,
    );
  }

  const streamIndex = value.streamIndex;
  if (!Number.isInteger(streamIndex) || Number(streamIndex) < 0) {
    throw new Error(
      `Asset ${assetIndex + 1} embedded artwork stream index must be a non-negative integer.`,
    );
  }

  return {
    audioSourceRelativePath: requireString(
      value.audioSourceRelativePath,
      `Asset ${assetIndex + 1} embedded artwork audio source`,
      1000,
    ),
    streamIndex: Number(streamIndex),
    ...(typeof value.codecName === "string" && value.codecName.trim()
      ? { codecName: value.codecName.trim() }
      : {}),
    extension: requireString(
      value.extension,
      `Asset ${assetIndex + 1} embedded artwork extension`,
      20,
    ),
    contentType: requireString(
      value.contentType,
      `Asset ${assetIndex + 1} embedded artwork content type`,
      100,
    ),
    sizeBytes: requirePositiveInteger(
      value.sizeBytes,
      `Asset ${assetIndex + 1} embedded artwork size`,
    ),
    sha256: requireSha256(
      value.sha256,
      `Asset ${assetIndex + 1} embedded artwork SHA-256`,
    ),
  };
}

function parseAssetDraft(
  value: unknown,
  index: number,
): IngestBuildAssetDraft {
  if (!isRecord(value)) {
    throw new Error(
      `Asset ${index + 1} must be an object.`,
    );
  }

  if (
    value.mediaKind !== "image" &&
    value.mediaKind !== "text"
  ) {
    throw new Error(
      `Asset ${index + 1} must be image or text.`,
    );
  }

  const include = requireBoolean(
    value.include,
    `Asset ${index + 1} include`,
  );
  const artworkAssignments =
    Array.isArray(value.artworkAssignments)
      ? value.artworkAssignments.map(
          (assignment, assignmentIndex) =>
            parseArtworkAssignmentDraft(
              assignment,
              index,
              assignmentIndex,
            ),
        )
      : value.mediaKind === "image" && include
        ? [defaultReleaseArtworkAssignment()]
        : [];

  if (
    value.sourceType !== undefined &&
    value.sourceType !== "file" &&
    value.sourceType !== "embedded-artwork"
  ) {
    throw new Error(
      `Asset ${index + 1} source type must be file or embedded-artwork.`,
    );
  }
  const sourceType =
    value.sourceType === "embedded-artwork"
      ? "embedded-artwork"
      : "file";
  const embeddedArtwork =
    sourceType === "embedded-artwork"
      ? parseEmbeddedArtworkSource(value.embeddedArtwork, index)
      : undefined;

  return {
    sourceRelativePath: requireString(
      value.sourceRelativePath,
      `Asset ${index + 1} source path`,
      1000,
    ),
    ...(sourceType === "embedded-artwork"
      ? { sourceType, embeddedArtwork }
      : {}),
    include,
    mediaKind: value.mediaKind,
    destinationRelativePath: requireString(
      value.destinationRelativePath,
      `Asset ${index + 1} destination path`,
      1000,
    ),
    artworkAssignments,
  };
}

export function parseIngestBuildDraft(
  value: unknown,
): IngestBuildDraft {
  if (!isRecord(value)) {
    throw new Error(
      "Ingest build draft must be an object.",
    );
  }

  if (!Array.isArray(value.tracks)) {
    throw new Error(
      "Ingest build tracks must be an array.",
    );
  }

  if (value.videos !== undefined && !Array.isArray(value.videos)) {
    throw new Error(
      "Ingest build videos must be an array when present.",
    );
  }

  if (!Array.isArray(value.assets)) {
    throw new Error(
      "Ingest build assets must be an array.",
    );
  }

  return {
    candidateId: requireString(
      value.candidateId,
      "Candidate ID",
      255,
    ),
    releaseId: requireString(
      value.releaseId,
      "Release ID",
      255,
    ),
    releaseTitle: requireString(
      value.releaseTitle,
      "Release title",
    ),
    releaseArtist: requireString(
      value.releaseArtist,
      "Release artist",
    ),
    releaseDate: requireIsoDate(
      value.releaseDate,
      "Release date",
    ),
    releaseType: requireString(
      value.releaseType,
      "Release type",
      80,
    ),
    tracks: value.tracks.map(parseTrackDraft),
    videos: Array.isArray(value.videos)
      ? value.videos.map(parseVideoDraft)
      : [],
    assets: value.assets.map(parseAssetDraft),
  };
}

function requireReleaseId(value: string): string {
  if (
    !/^[a-z0-9][a-z0-9_-]*$/.test(value) ||
    value === "." ||
    value === ".."
  ) {
    throw new Error(
      "Release ID may contain lowercase letters, numbers, hyphens, and underscores only.",
    );
  }

  return value;
}

function normalizeRelativeDestination(
  value: string,
  label: string,
): string {
  const normalized = value
    .replaceAll("\\", "/")
    .replace(/^\/+/, "");
  const segments = normalized.split("/");

  if (
    !normalized ||
    path.posix.isAbsolute(normalized) ||
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === "..",
    )
  ) {
    throw new Error(
      `${label} must be a safe release-relative path.`,
    );
  }

  return normalized;
}

function extensionOf(value: string): string {
  return path.posix.extname(
    value.replaceAll("\\", "/"),
  ).toLowerCase();
}

function expectedAudioDestination(
  file: IngestFileInspection,
): string {
  return `audio-master${extensionOf(file.filename)}`;
}

function expectedVideoDestination(
  file: IngestFileInspection,
): string {
  return `video-master${extensionOf(file.filename)}`;
}

function trackIdFor(
  track: IngestBuildTrackDraft,
): string {
  const artist =
    slugifyIngestValue(track.artist) ||
    "unknown-artist";
  const title =
    slugifyIngestValue(
      formatTrackDisplayTitle(
        track.title,
        track.version,
      ),
    ) || "untitled-track";
  const number = String(
    track.trackNumber,
  ).padStart(2, "0");

  return `${artist}_${number}_${title}`;
}

function metadataStatuses(
  directory: string,
  filenames: string[],
): MetadataFileStatus[] {
  return filenames.map((filename) => ({
    filename,
    relativePath: `${directory}/${filename}`,
    exists: false,
  }));
}

type PreparedIngestTrack = {
  draft: IngestBuildTrackDraft;
  id: string;
  relativePath: string;
  audioDestination: string;
  file?: IngestFileInspection;
  existingTrack?: ExistingReceiptTrack;
  preserveOnly?: boolean;
  replacement?: {
    previousSourceRelativePath: string;
    previousDestinationRelativePath: string;
  };
};

type PreparedIngestVideo = {
  draft: IngestBuildVideoDraft;
  id: string;
  relativePath: string;
  videoDestination: string;
  file?: IngestFileInspection;
  relatedTrackId?: string;
  existingVideo?: ExistingReceiptVideo;
  preserveOnly?: boolean;
};

type PreparedArtworkPlacement = {
  draft: IngestBuildAssetDraft;
  assignment: IngestArtworkAssignmentDraft;
  destinationRelativePath: string;
  trackSourceRelativePath?: string;
};

function artworkRoleDirectory(
  assignment: IngestArtworkAssignmentDraft,
): string {
  const role = assignment.role.trim().toLowerCase();

  if (role === "front_cover" || role === "track_artwork") {
    return "front";
  }

  if (role === "back_cover") {
    return "back";
  }

  if (role === "liner_notes") {
    return "liner-notes";
  }

  const roleSlug = slugifyIngestValue(role) || "supplemental";

  if (roleSlug === "disc" || roleSlug === "thumbnail") {
    return roleSlug;
  }

  const assignmentSlug =
    slugifyIngestValue(assignment.id) || "assignment";

  return `${roleSlug}/${assignmentSlug}`;
}

function buildArtworkPlacements(
  artworkDrafts: IngestBuildAssetDraft[],
  tracks: PreparedIngestTrack[],
): PreparedArtworkPlacement[] {
  const trackBySource = new Map(
    tracks.map((track) => [
      track.draft.sourceRelativePath,
      track,
    ]),
  );
  const placements: PreparedArtworkPlacement[] = [];

  for (const draft of artworkDrafts) {
    const extension = extensionOf(
      draft.destinationRelativePath,
    );

    for (const assignment of draft.artworkAssignments) {
      const roleDirectory = artworkRoleDirectory(assignment);

      if (assignment.scope === "release") {
        placements.push({
          draft,
          assignment,
          destinationRelativePath:
            `artwork/${roleDirectory}/artwork-master${extension}`,
        });
        continue;
      }

      for (const sourceRelativePath of
        assignment.trackSourceRelativePaths) {
        const track = trackBySource.get(sourceRelativePath);

        if (!track) {
          throw new Error(
            `${draft.sourceRelativePath}: artwork assignment references an unavailable track: ${sourceRelativePath}`,
          );
        }

        placements.push({
          draft,
          assignment,
          trackSourceRelativePath: sourceRelativePath,
          destinationRelativePath:
            `tracks/${track.id}/artwork/${roleDirectory}/artwork-master${extension}`,
        });
      }
    }
  }

  return placements;
}

function releaseArtworkAssignments(
  artworkPlacements: PreparedArtworkPlacement[],
) {
  return artworkPlacements
    .filter((placement) => !placement.trackSourceRelativePath)
    .map((placement) => ({
      placement,
      assignment: placement.assignment,
    }));
}

function trackArtworkAssignments(
  artworkPlacements: PreparedArtworkPlacement[],
  trackSourceRelativePath: string,
) {
  return artworkPlacements
    .filter(
      (placement) =>
        placement.trackSourceRelativePath ===
        trackSourceRelativePath,
    )
    .map((placement) => ({
      placement,
      assignment: placement.assignment,
    }));
}

function relativeArtworkPathForTrack(
  track: PreparedIngestTrack,
  releaseRelativePath: string,
  artworkRelativePath: string,
): string {
  return path.posix.relative(
    track.relativePath,
    `${releaseRelativePath}/${artworkRelativePath}`,
  );
}

function syntheticReleaseScan(
  releaseId: string,
  releaseRelativePath: string,
  tracks: PreparedIngestTrack[],
  artworkPlacements: PreparedArtworkPlacement[],
): ReleaseScanResult {
  const releaseArtwork = releaseArtworkAssignments(
    artworkPlacements,
  );
  const release: ReleaseScanResult = {
    id: releaseId,
    relativePath: releaseRelativePath,
    metadataFiles: metadataStatuses(
      releaseRelativePath,
      [
        "release.toml",
        "release-settings.toml",
        "release-production-notes.toml",
      ],
    ),
    artworkMasters: releaseArtwork.map(
      ({ placement }) => ({
        filename: path.posix.basename(
          placement.destinationRelativePath,
        ),
        relativePath:
          `${releaseRelativePath}/${placement.destinationRelativePath}`,
        extension: extensionOf(
          placement.destinationRelativePath,
        ),
      }),
    ),
    tracks: [],
  };

  release.tracks = tracks.map(
    (track): TrackScanResult => {
      const trackArtwork = trackArtworkAssignments(
        artworkPlacements,
        track.draft.sourceRelativePath,
      );

      return {
        id: track.id,
        relativePath: track.relativePath,
        metadataFiles: metadataStatuses(
          track.relativePath,
          [
            "track.toml",
            "track-credits.toml",
            "track-production-notes.toml",
          ],
        ),
        audioMasters: [
          {
            filename: track.audioDestination,
            relativePath:
              `${track.relativePath}/${track.audioDestination}`,
            extension: extensionOf(track.audioDestination),
          },
        ],
        artworkMasters: trackArtwork.map(
          ({ placement }) => ({
            filename: path.posix.basename(
              placement.destinationRelativePath,
            ),
            relativePath:
              `${releaseRelativePath}/${placement.destinationRelativePath}`,
            extension: extensionOf(
              placement.destinationRelativePath,
            ),
          }),
        ),
      };
    },
  );

  return release;
}

function syntheticMetadataPreview(
  release: ReleaseScanResult,
  draft: IngestBuildDraft,
  tracks: PreparedIngestTrack[],
  artworkPlacements: PreparedArtworkPlacement[],
): LibraryMetadataPreview {
  const releaseArtworkCandidates = releaseArtworkAssignments(
    artworkPlacements,
  );
  const releaseArtwork =
    releaseArtworkCandidates.find(
      ({ assignment }) => assignment.role === "front_cover",
    ) ?? releaseArtworkCandidates[0];

  return {
    release: {
      releaseId: {
        value: release.id,
        source: "confirmed ingest draft",
      },
      releaseDate: {
        value: draft.releaseDate,
        source: "confirmed ingest draft",
      },
      releaseTitle: {
        value: draft.releaseTitle,
        source: "confirmed ingest draft",
      },
      ...(releaseArtwork
        ? {
            artworkMasterPath: {
              value:
                `${release.relativePath}/${releaseArtwork.placement.destinationRelativePath}`,
              source: "confirmed ingest artwork assignment",
            },
          }
        : {}),
    },
    tracks: tracks.map((track) => ({
      trackId: {
        value: track.id,
        source: "generated ingest track ID",
      },
      artistName: {
        value: track.draft.artist,
        source: "confirmed ingest draft",
      },
      trackNumber: {
        value: track.draft.trackNumber,
        source: "confirmed ingest draft",
      },
      trackTitle: {
        value: track.draft.title,
        source: "confirmed ingest draft",
      },
      trackVersion: {
        value: track.draft.version,
        source: "confirmed ingest draft",
      },
      trackDisplayTitle: {
        value: formatTrackDisplayTitle(
          track.draft.title,
          track.draft.version,
        ),
        source: "generated from confirmed title and version",
      },
      audioMasterPath: {
        value:
          `${track.relativePath}/${track.audioDestination}`,
        source: "planned ingest copy",
      },
    })),
    warnings: [],
  };
}

function setNestedRecordValue(
  root: Record<string, unknown>,
  pathSegments: string[],
  key: string,
  value: unknown,
): void {
  let current = root;

  for (const segment of pathSegments) {
    const existing = current[segment];

    if (
      typeof existing !== "object" ||
      existing === null ||
      Array.isArray(existing)
    ) {
      current[segment] = {};
    }

    current = current[segment] as Record<
      string,
      unknown
    >;
  }

  current[key] = value;
}

function readNestedRecordValue(
  root: Record<string, unknown>,
  segments: string[],
): unknown {
  let current: unknown = root;

  for (const segment of segments) {
    if (!isRecord(current)) {
      return undefined;
    }

    current = current[segment];
  }

  return current;
}

function artworkRecord(
  id: string,
  role: string,
  masterPath: string,
  primary: boolean,
) {
  return {
    id,
    role,
    primary,
    master_path: masterPath,
    web_path: "",
    embedded_path: "",
    description: "",
    credits: [],
    copyright: "",
  };
}

function artworkDestinationStem(
  destinationRelativePath: string,
): string {
  const extension = path.posix.extname(
    destinationRelativePath,
  );

  return extension
    ? destinationRelativePath.slice(0, -extension.length)
    : destinationRelativePath;
}

function artworkRolesShareCanonicalTarget(
  left: unknown,
  right: string,
): boolean {
  if (typeof left !== "string") {
    return false;
  }

  if (
    (left === "front_cover" || left === "track_artwork") &&
    (right === "front_cover" || right === "track_artwork")
  ) {
    return true;
  }

  return (
    left === right &&
    [
      "back_cover",
      "liner_notes",
      "disc",
      "thumbnail",
    ].includes(right)
  );
}

function mergeArtworkRecord(
  currentValue: unknown,
  assignment: IngestArtworkAssignmentDraft,
  masterPath: string,
  primary: boolean,
): { value: unknown[]; changed: boolean } {
  const current = Array.isArray(currentValue)
    ? currentValue.slice()
    : [];
  const before = JSON.stringify(current);
  const index = current.findIndex((item) =>
    isRecord(item) &&
    (item.id === assignment.id ||
      artworkRolesShareCanonicalTarget(
        item.role,
        assignment.role,
      )),
  );
  const previous =
    index >= 0 && isRecord(current[index])
      ? current[index]
      : {};
  const previousId =
    typeof previous.id === "string" && previous.id.trim()
      ? previous.id
      : assignment.id;
  const next = {
    ...previous,
    id: previousId,
    role: assignment.role,
    primary,
    master_path: masterPath,
  };

  if (primary) {
    for (let itemIndex = 0; itemIndex < current.length; itemIndex += 1) {
      const item = current[itemIndex];
      if (itemIndex !== index && isRecord(item) && item.primary === true) {
        current[itemIndex] = {
          ...item,
          primary: false,
        };
      }
    }
  }

  if (index >= 0) {
    current[index] = next;
  } else {
    current.push(next);
  }

  return {
    value: current,
    changed: JSON.stringify(current) !== before,
  };
}

function customizeGeneratedDocuments(
  documents: GeneratedMetadataDocument[],
  draft: IngestBuildDraft,
  tracks: PreparedIngestTrack[],
  artworkPlacements: PreparedArtworkPlacement[],
  releaseRelativePath: string,
): GeneratedMetadataDocument[] {
  const trackByDirectory = new Map(
    tracks.map((track) => [track.relativePath, track]),
  );
  const releaseAssignments = releaseArtworkAssignments(
    artworkPlacements,
  );
  const primaryReleaseAssignment =
    releaseAssignments.find(
      ({ assignment }) => assignment.role === "front_cover",
    ) ?? releaseAssignments[0];

  return documents.map((document) => {
    const data = parse(
      document.content,
    ) as Record<string, unknown>;

    if (document.filename === "release.toml") {
      setNestedRecordValue(data, ["release"], "type", draft.releaseType);
      setNestedRecordValue(
        data,
        ["release", "primary_artist"],
        "name",
        draft.releaseArtist,
      );
      setNestedRecordValue(
        data,
        ["release", "primary_artist"],
        "sort_name",
        generateArtistSortName(
          draft.releaseArtist,
        ).value,
      );
      setNestedRecordValue(
        data,
        ["release"],
        "numbering",
        {
          track_total: tracks.length,
          disc_total: 1,
        },
      );
      setNestedRecordValue(
        data,
        ["release"],
        "artwork",
        releaseAssignments.map(
          ({ placement, assignment }) =>
            artworkRecord(
              assignment.id,
              assignment.role,
              placement.destinationRelativePath,
              placement === primaryReleaseAssignment?.placement,
            ),
        ),
      );
    }

    if (
      document.filename === "release-settings.toml" &&
      releaseAssignments.length > 0
    ) {
      const releaseFallback = primaryReleaseAssignment;
      setNestedRecordValue(
        data,
        ["settings", "inheritance"],
        "release_artwork_fallback_path",
        releaseFallback.placement.destinationRelativePath,
      );
    }

    const trackDirectory = path.posix.dirname(
      document.relativePath,
    );
    const track = trackByDirectory.get(trackDirectory);

    if (track && document.filename === "track.toml") {
      setNestedRecordValue(
        data,
        ["track", "numbering"],
        "track_total",
        tracks.length,
      );
      setNestedRecordValue(
        data,
        ["track", "assets"],
        "audio_playback",
        track.audioDestination,
      );
      setNestedRecordValue(
        data,
        ["track"],
        "dates",
        {
          release: draft.releaseDate,
          original_release: "",
        },
      );

      const assignments = trackArtworkAssignments(
        artworkPlacements,
        track.draft.sourceRelativePath,
      );
      const firstArtwork =
        assignments.find(
          ({ assignment }) =>
            assignment.role === "front_cover" ||
            assignment.role === "track_artwork",
        ) ?? assignments[0];
      setNestedRecordValue(
        data,
        ["track", "assets"],
        "artwork",
        {
          master: firstArtwork
            ? relativeArtworkPathForTrack(
                track,
                releaseRelativePath,
                firstArtwork.placement.destinationRelativePath,
              )
            : "",
          web: "",
          embedded: "",
          web_mime_type: "",
          embedded_mime_type: "",
          description: "",
        },
      );
      setNestedRecordValue(
        data,
        ["track"],
        "artwork",
        assignments.map(({ placement, assignment }) =>
          artworkRecord(
            assignment.id,
            assignment.role,
            relativeArtworkPathForTrack(
              track,
              releaseRelativePath,
              placement.destinationRelativePath,
            ),
            placement === firstArtwork?.placement,
          ),
        ),
      );
    }

    if (track && document.filename === "track-credits.toml") {
      setNestedRecordValue(
        data,
        ["track"],
        "album_artists",
        [
          {
            name: draft.releaseArtist,
            sort_name: "",
          },
        ],
      );
    }

    if (
      track &&
      document.filename === "track-production-notes.toml" &&
      track.draft.date
    ) {
      setNestedRecordValue(
        data,
        ["production", "recording"],
        "source_date",
        track.draft.date,
      );
    }

    const content = `${stringify(data).trimEnd()}\n`;
    parse(content);

    return {
      ...document,
      content,
      validated: true,
    };
  });
}

async function sha256File(
  filename: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filename);

    stream.on("error", reject);
    stream.on("data", (chunk) => {
      hash.update(chunk);
    });
    stream.on("end", () => {
      resolve(hash.digest("hex"));
    });
  });
}

async function pathExists(
  filename: string,
): Promise<boolean> {
  try {
    await lstat(filename);
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

type SidecarComparableMetadataValue =
  | string
  | number
  | boolean
  | string[];

function comparableMetadataValue(
  value: unknown,
): SidecarComparableMetadataValue | undefined {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (
    Array.isArray(value) &&
    value.every((item) => typeof item === "string")
  ) {
    return value as string[];
  }

  return undefined;
}

function recordNames(
  value: unknown,
): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const names = value
    .map((item) =>
      isRecord(item) && typeof item.name === "string"
        ? item.name.trim()
        : "",
    )
    .filter(Boolean);

  return names.length > 0 ? names : undefined;
}

function addComparableMetadataValue(
  destination: Record<string, SidecarComparableMetadataValue>,
  canonicalPath: string,
  document: Record<string, unknown> | undefined,
  pathSegments: string[],
): void {
  if (!document) {
    return;
  }

  const value = comparableMetadataValue(
    readNestedRecordValue(document, pathSegments),
  );

  if (value !== undefined) {
    destination[canonicalPath] = value;
  }
}

async function optionalTomlRecordForComparison(
  releasePath: string,
  releaseRelativePath: string,
  relativePath: string,
): Promise<Record<string, unknown> | undefined> {
  const withinRelease = withinReleasePath(
    releaseRelativePath,
    relativePath,
  );
  const target = assertPathWithinRoot(
    releasePath,
    path.join(
      releasePath,
      ...withinRelease.split("/"),
    ),
  );

  if (!(await pathExists(target))) {
    return undefined;
  }

  try {
    return (
      await readTomlRecordForUpdate(
        releasePath,
        releaseRelativePath,
        relativePath,
      )
    ).data;
  } catch {
    // Sidecar comparison is advisory. Existing Library validation remains
    // responsible for surfacing malformed or unsafe canonical metadata.
    return undefined;
  }
}

async function releaseSidecarComparisonValues(
  releasePath: string,
  releaseRelativePath: string,
): Promise<Record<string, SidecarComparableMetadataValue>> {
  const document = await optionalTomlRecordForComparison(
    releasePath,
    releaseRelativePath,
    `${releaseRelativePath}/release.toml`,
  );
  const values: Record<string, SidecarComparableMetadataValue> = {};

  addComparableMetadataValue(
    values,
    "release.title",
    document,
    ["release", "title"],
  );
  addComparableMetadataValue(
    values,
    "release.primary_artist.name",
    document,
    ["release", "primary_artist", "name"],
  );
  addComparableMetadataValue(
    values,
    "release.dates.release",
    document,
    ["release", "dates", "release"],
  );
  addComparableMetadataValue(
    values,
    "release.genres",
    document,
    ["release", "genres"],
  );
  addComparableMetadataValue(
    values,
    "release.rights.publisher",
    document,
    ["release", "rights", "publisher"],
  );
  addComparableMetadataValue(
    values,
    "release.rights.copyright",
    document,
    ["release", "rights", "copyright"],
  );
  addComparableMetadataValue(
    values,
    "release.rights.phonographic_copyright",
    document,
    ["release", "rights", "phonographic_copyright"],
  );

  return values;
}

async function trackSidecarComparisonValues(
  releasePath: string,
  releaseRelativePath: string,
  track: ExistingReceiptTrack,
): Promise<Record<string, SidecarComparableMetadataValue>> {
  const trackRelativePath = path.posix.dirname(
    track.destinationRelativePath,
  );
  const trackDocument = await optionalTomlRecordForComparison(
    releasePath,
    releaseRelativePath,
    `${trackRelativePath}/track.toml`,
  );
  const creditsDocument = await optionalTomlRecordForComparison(
    releasePath,
    releaseRelativePath,
    `${trackRelativePath}/track-credits.toml`,
  );
  const values: Record<string, SidecarComparableMetadataValue> = {};

  addComparableMetadataValue(
    values,
    "track.title",
    trackDocument,
    ["track", "title"],
  );
  addComparableMetadataValue(
    values,
    "track.language",
    trackDocument,
    ["track", "language"],
  );
  addComparableMetadataValue(
    values,
    "track.numbering.track_number",
    trackDocument,
    ["track", "numbering", "track_number"],
  );
  addComparableMetadataValue(
    values,
    "track.numbering.track_total",
    trackDocument,
    ["track", "numbering", "track_total"],
  );
  addComparableMetadataValue(
    values,
    "track.numbering.disc_number",
    trackDocument,
    ["track", "numbering", "disc_number"],
  );
  addComparableMetadataValue(
    values,
    "track.numbering.disc_total",
    trackDocument,
    ["track", "numbering", "disc_total"],
  );
  addComparableMetadataValue(
    values,
    "track.text.lyrics",
    trackDocument,
    ["track", "text", "lyrics"],
  );
  addComparableMetadataValue(
    values,
    "track.text.comment",
    trackDocument,
    ["track", "text", "comment"],
  );
  addComparableMetadataValue(
    values,
    "track.primary_artist.name",
    creditsDocument,
    ["track", "primary_artist", "name"],
  );

  const composers = recordNames(
    creditsDocument
      ? readNestedRecordValue(
          creditsDocument,
          ["track", "composers"],
        )
      : undefined,
  );
  if (composers) {
    values["track.composers[].name"] = composers;
  }

  const lyricists = recordNames(
    creditsDocument
      ? readNestedRecordValue(
          creditsDocument,
          ["track", "lyricists"],
        )
      : undefined,
  );
  if (lyricists) {
    values["track.lyricists[].name"] = lyricists;
  }

  return values;
}

export async function inspectIngestStagingTarget(
  outputRoot: string,
  releaseIdInput: string,
): Promise<IngestStagingTargetStatus> {
  const releaseId = requireReleaseId(
    releaseIdInput,
  );
  const canonicalOutputRoot =
    await realpath(outputRoot);
  const releaseRelativePath =
    `releases/${releaseId}`;
  const releasePath = assertPathWithinRoot(
    canonicalOutputRoot,
    path.join(
      canonicalOutputRoot,
      "releases",
      releaseId,
    ),
  );
  const exists = await pathExists(releasePath);

  if (exists) {
    const stats = await lstat(releasePath);

    if (
      stats.isSymbolicLink() ||
      !stats.isDirectory()
    ) {
      throw new Error(
        `Staging target is not a regular release directory: ${releaseRelativePath}`,
      );
    }
  }

  let existingReceipt: ExistingIngestReceipt | null = null;

  if (exists) {
    const receiptPath = assertPathWithinRoot(
      releasePath,
      path.join(releasePath, "ingest-receipt.json"),
    );

    if (await pathExists(receiptPath)) {
      existingReceipt =
        await readExistingIngestReceipt(
          releasePath,
          releaseId,
        );
    }
  }

  const existingTracks =
    existingReceipt?.tracks ?? [];
  const existingTrackById = new Map(
    existingTracks.map((track) => [track.id, track]),
  );
  const existingVideos: IngestStagingTargetStatus["existingVideos"] =
    (existingReceipt?.videos ?? []).map((video) => ({
      id: video.id,
      title: video.title,
      videoType: video.videoType,
      sourceRelativePath: video.sourceRelativePath,
      destinationRelativePath: video.destinationRelativePath,
      ...(video.relatedTrackId
        ? { relatedTrackId: video.relatedTrackId }
        : {}),
    }));
  const existingArtwork: IngestStagingTargetStatus["existingArtwork"] =
    (existingReceipt?.copies ?? []).flatMap<
      IngestStagingTargetStatus["existingArtwork"][number]
    >((copy) => {
      if (copy.mediaKind !== "image") {
        return [];
      }

      const logicalRole = copy.logicalRoles.find(
        (role) =>
          role.startsWith("release-artwork:") ||
          role.startsWith("track-artwork:"),
      );
      if (!logicalRole) {
        return [];
      }

      if (logicalRole.startsWith("release-artwork:")) {
        return [{
          sourceRelativePath: copy.sourceRelativePath,
          destinationRelativePath: copy.destinationRelativePath,
          scope: "release" as const,
          role: logicalRole.slice("release-artwork:".length),
        }];
      }

      const trackId = existingTracks.find((track) =>
        copy.destinationRelativePath.startsWith(
          `${releaseRelativePath}/tracks/${track.id}/`,
        ),
      )?.id;
      const track = trackId
        ? existingTrackById.get(trackId)
        : undefined;
      if (!track) {
        return [];
      }

      const roleAndSource = logicalRole.slice(
        "track-artwork:".length,
      );
      const separatorIndex = roleAndSource.indexOf(":");
      const role = separatorIndex >= 0
        ? roleAndSource.slice(0, separatorIndex)
        : roleAndSource;

      return [{
        sourceRelativePath: copy.sourceRelativePath,
        destinationRelativePath: copy.destinationRelativePath,
        scope: "track" as const,
        role,
        trackId: track.id,
        trackSourceRelativePath: track.sourceRelativePath,
      }];
    });

  const receiptRelease = existingReceipt?.raw.release;
  const existingReleaseMetadataValues = exists
    ? await releaseSidecarComparisonValues(
        releasePath,
        releaseRelativePath,
      )
    : {};
  const existingTrackMetadataValues = new Map(
    await Promise.all(
      existingTracks.map(async (track) => [
        track.id,
        await trackSidecarComparisonValues(
          releasePath,
          releaseRelativePath,
          track,
        ),
      ] as const),
    ),
  );
  const existingRelease =
    isRecord(receiptRelease)
      ? {
          title:
            typeof receiptRelease.title === "string"
              ? receiptRelease.title
              : "",
          artist:
            typeof receiptRelease.artist === "string"
              ? receiptRelease.artist
              : "",
          date:
            typeof receiptRelease.date === "string"
              ? receiptRelease.date
              : "",
          type:
            typeof receiptRelease.type === "string"
              ? receiptRelease.type
              : "",
          ...(Object.keys(existingReleaseMetadataValues).length > 0
            ? { metadataValues: existingReleaseMetadataValues }
            : {}),
        }
      : undefined;

  return {
    releaseId,
    exists,
    operation: exists ? "update" : "create",
    releaseRelativePath,
    ...(existingRelease ? { existingRelease } : {}),
    existingTracks: existingTracks.map((track) => ({
      id: track.id,
      number: track.number,
      title: track.title,
      version: track.version,
      artist: track.artist,
      sourceDate: track.sourceDate,
      sourceRelativePath: track.sourceRelativePath,
      destinationRelativePath: track.destinationRelativePath,
      ...(Object.keys(
        existingTrackMetadataValues.get(track.id) ?? {},
      ).length > 0
        ? {
            metadataValues:
              existingTrackMetadataValues.get(track.id),
          }
        : {}),
    })),
    existingVideos,
    existingArtwork,
  };
}

function receiptText(
  record: Record<string, unknown>,
  key: string,
  label: string,
): string {
  const value = record[key];

  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is missing from ingest-receipt.json.`);
  }

  return value.trim();
}

function receiptNumber(
  record: Record<string, unknown>,
  key: string,
  label: string,
): number {
  const value = record[key];

  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1
  ) {
    throw new Error(`${label} is invalid in ingest-receipt.json.`);
  }

  return value;
}

function parseExistingReceiptTrack(
  value: unknown,
  index: number,
): ExistingReceiptTrack {
  if (!isRecord(value)) {
    throw new Error(
      `Track ${index + 1} is malformed in ingest-receipt.json.`,
    );
  }

  return {
    id: receiptText(value, "id", `Track ${index + 1} ID`),
    number: receiptNumber(
      value,
      "number",
      `Track ${index + 1} number`,
    ),
    title:
      typeof value.title === "string"
        ? value.title
        : "",
    version:
      typeof value.version === "string"
        ? value.version
        : "",
    artist:
      typeof value.artist === "string"
        ? value.artist
        : "",
    sourceDate:
      typeof value.sourceDate === "string"
        ? value.sourceDate
        : "",
    sourceRelativePath: receiptText(
      value,
      "sourceRelativePath",
      `Track ${index + 1} source path`,
    ),
    destinationRelativePath: receiptText(
      value,
      "destinationRelativePath",
      `Track ${index + 1} destination path`,
    ),
  };
}

function parseExistingReceiptVideo(
  value: unknown,
  index: number,
): ExistingReceiptVideo {
  if (!isRecord(value)) {
    throw new Error(
      `Video ${index + 1} is malformed in ingest-receipt.json.`,
    );
  }

  return {
    id: receiptText(value, "id", `Video ${index + 1} ID`),
    title: typeof value.title === "string" ? value.title : "",
    videoType:
      typeof value.videoType === "string" ? value.videoType : "other",
    sourceRelativePath: receiptText(
      value,
      "sourceRelativePath",
      `Video ${index + 1} source path`,
    ),
    destinationRelativePath: receiptText(
      value,
      "destinationRelativePath",
      `Video ${index + 1} destination path`,
    ),
    ...(typeof value.relatedTrackId === "string" && value.relatedTrackId.trim()
      ? { relatedTrackId: value.relatedTrackId.trim() }
      : {}),
  };
}

function parseExistingReceiptCopy(
  value: unknown,
  index: number,
): ExistingReceiptCopy {
  if (!isRecord(value)) {
    throw new Error(
      `Copy ${index + 1} is malformed in ingest-receipt.json.`,
    );
  }

  const mediaKind = value.mediaKind;

  if (
    mediaKind !== "audio" &&
    mediaKind !== "video" &&
    mediaKind !== "image" &&
    mediaKind !== "text" &&
    mediaKind !== "unknown"
  ) {
    throw new Error(
      `Copy ${index + 1} media kind is invalid in ingest-receipt.json.`,
    );
  }

  return {
    sourceRelativePath: receiptText(
      value,
      "sourceRelativePath",
      `Copy ${index + 1} source path`,
    ),
    destinationRelativePath: receiptText(
      value,
      "destinationRelativePath",
      `Copy ${index + 1} destination path`,
    ),
    mediaKind,
    logicalRoles: Array.isArray(value.logicalRoles)
      ? value.logicalRoles.filter(
          (role): role is string =>
            typeof role === "string",
        )
      : [],
    bytes:
      typeof value.bytes === "number" &&
      Number.isSafeInteger(value.bytes) &&
      value.bytes >= 0
        ? value.bytes
        : 0,
    sourceSha256: receiptText(
      value,
      "sourceSha256",
      `Copy ${index + 1} source SHA-256`,
    ),
  };
}

async function readExistingIngestReceipt(
  releasePath: string,
  releaseId: string,
): Promise<ExistingIngestReceipt> {
  const receiptPath = assertPathWithinRoot(
    releasePath,
    path.join(releasePath, "ingest-receipt.json"),
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
      throw new Error(
        "This release directory predates incremental staging updates because ingest-receipt.json is missing. Recreate it through the ingest builder or migrate it before updating.",
      );
    }

    throw error;
  }

  if (
    stats.isSymbolicLink() ||
    !stats.isFile()
  ) {
    throw new Error(
      "Existing staging releases require a regular ingest-receipt.json file before they can be updated.",
    );
  }

  const rawValue = JSON.parse(
    await readFile(receiptPath, "utf8"),
  ) as unknown;

  if (!isRecord(rawValue)) {
    throw new Error(
      "Existing ingest-receipt.json must contain an object.",
    );
  }

  const release = rawValue.release;

  if (
    !isRecord(release) ||
    receiptText(release, "id", "Receipt release ID") !== releaseId
  ) {
    throw new Error(
      "Existing ingest receipt does not match the requested staging release.",
    );
  }

  if (
    !Array.isArray(rawValue.tracks) ||
    (rawValue.videos !== undefined && !Array.isArray(rawValue.videos)) ||
    !Array.isArray(rawValue.copies)
  ) {
    throw new Error(
      "Existing ingest receipt is missing track or copy records.",
    );
  }

  return {
    raw: rawValue,
    tracks: rawValue.tracks.map(
      parseExistingReceiptTrack,
    ),
    videos: Array.isArray(rawValue.videos)
      ? rawValue.videos.map(parseExistingReceiptVideo)
      : [],
    copies: rawValue.copies.map(
      parseExistingReceiptCopy,
    ),
  };
}

async function assertSafeReleaseTree(
  root: string,
  directory = root,
): Promise<void> {
  const stats = await lstat(directory);

  if (
    stats.isSymbolicLink() ||
    !stats.isDirectory()
  ) {
    throw new Error(
      `Unsafe staging release path: ${path.relative(root, directory) || "."}`,
    );
  }

  const entries = await readdir(directory, {
    withFileTypes: true,
  });

  for (const entry of entries) {
    const target = assertPathWithinRoot(
      root,
      path.join(directory, entry.name),
    );

    if (entry.isSymbolicLink()) {
      throw new Error(
        `Staging release updates refuse symbolic links: ${path.relative(root, target)}`,
      );
    }

    if (entry.isDirectory()) {
      await assertSafeReleaseTree(root, target);
      continue;
    }

    if (!entry.isFile()) {
      throw new Error(
        `Staging release updates require regular files: ${path.relative(root, target)}`,
      );
    }
  }
}

function inspectionFileMap(
  inspection: IngestCandidateInspection,
): Map<string, IngestFileInspection> {
  return new Map(
    inspection.files.map((file) => [
      file.relativePath,
      file,
    ]),
  );
}

async function prepareCopy(
  ingestRoot: string,
  file: IngestFileInspection,
  destinationWithinRelease: string,
  destinationRelativePath: string,
  logicalRoles: string[],
): Promise<PreparedCopy> {
  const sourcePath = assertPathWithinIngestRoot(
    ingestRoot,
    path.resolve(
      ingestRoot,
      ...file.relativePath
        .replaceAll("\\", "/")
        .split("/"),
    ),
  );
  const canonicalSource = await realpath(
    sourcePath,
  );

  assertPathWithinIngestRoot(
    ingestRoot,
    canonicalSource,
  );

  const stats = await lstat(canonicalSource);

  if (
    !stats.isFile() ||
    stats.isSymbolicLink()
  ) {
    throw new Error(
      `Ingest source is not a regular file: ${file.relativePath}`,
    );
  }

  await access(
    canonicalSource,
    fsConstants.R_OK,
  );

  if (
    stats.size !== file.sizeBytes ||
    stats.mtime.toISOString() !==
      file.modifiedAt
  ) {
    throw new Error(
      `Ingest source changed after inspection: ${file.relativePath}. Inspect the candidate again.`,
    );
  }

  return {
    sourceRelativePath: file.relativePath,
    writeAction: "create",
    sourcePath: canonicalSource,
    destinationRelativePath,
    destinationWithinRelease,
    mediaKind: file.mediaKind,
    logicalRoles,
    bytes: stats.size,
    sha256: await sha256File(canonicalSource),
  };
}

async function prepareEmbeddedArtworkCopy(
  ingestRoot: string,
  file: IngestFileInspection,
  virtualSourceRelativePath: string,
  embedded: IngestEmbeddedArtworkSourceDraft,
  destinationWithinRelease: string,
  destinationRelativePath: string,
  logicalRoles: string[],
): Promise<PreparedCopy> {
  const sourcePath = assertPathWithinIngestRoot(
    ingestRoot,
    path.resolve(
      ingestRoot,
      ...file.relativePath.replaceAll("\\", "/").split("/"),
    ),
  );
  const canonicalSource = await realpath(sourcePath);
  assertPathWithinIngestRoot(ingestRoot, canonicalSource);
  const stats = await lstat(canonicalSource);

  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(
      `Embedded artwork audio source is not a regular file: ${file.relativePath}`,
    );
  }
  if (
    stats.size !== file.sizeBytes ||
    stats.mtime.toISOString() !== file.modifiedAt
  ) {
    throw new Error(
      `Ingest source changed after inspection: ${file.relativePath}. Inspect the candidate again.`,
    );
  }

  const containerSha256 = await sha256File(canonicalSource);
  const extracted = await extractEmbeddedArtwork(
    canonicalSource,
    embedded.streamIndex,
    embedded.codecName,
  );
  const sha256 = createHash("sha256")
    .update(extracted.bytes)
    .digest("hex");

  if (
    sha256 !== embedded.sha256 ||
    extracted.bytes.length !== embedded.sizeBytes ||
    extracted.extension !== embedded.extension
  ) {
    throw new Error(
      `${virtualSourceRelativePath}: embedded artwork changed after inspection.`,
    );
  }

  return {
    sourceRelativePath: virtualSourceRelativePath,
    writeAction: "create",
    sourcePath: canonicalSource,
    embeddedArtwork: {
      streamIndex: embedded.streamIndex,
      ...(embedded.codecName
        ? { codecName: embedded.codecName }
        : {}),
      containerBytes: stats.size,
      containerSha256,
      containerMtimeMs: stats.mtimeMs,
    },
    destinationRelativePath,
    destinationWithinRelease,
    mediaKind: "image",
    logicalRoles,
    bytes: extracted.bytes.length,
    sha256,
  };
}

function validateUniqueTrackInputs(
  tracks: IngestBuildTrackDraft[],
): void {
  const sourcePaths = new Set<string>();
  const trackNumbers = new Set<number>();

  for (const track of tracks) {
    if (sourcePaths.has(track.sourceRelativePath)) {
      throw new Error(
        `Duplicate track source: ${track.sourceRelativePath}`,
      );
    }

    if (trackNumbers.has(track.trackNumber)) {
      throw new Error(
        `Duplicate track number: ${track.trackNumber}`,
      );
    }

    sourcePaths.add(track.sourceRelativePath);
    trackNumbers.add(track.trackNumber);
  }
}

function createReceiptContent(
  inspection: IngestCandidateInspection,
  draft: IngestBuildDraft,
  releaseRelativePath: string,
  tracks: Array<{
    draft: IngestBuildTrackDraft;
    id: string;
    relativePath: string;
    audioDestination: string;
  }>,
  videos: PreparedIngestVideo[],
  copies: PreparedCopy[],
): string {
  return `${JSON.stringify(
    {
      schema: {
        name:
          "metadata-editor-ingest-receipt",
        version: 3,
      },
      candidate: {
        id: inspection.candidate.id,
        relativePath:
          inspection.candidate.relativePath,
        kind: inspection.candidate.kind,
      },
      release: {
        id: draft.releaseId,
        relativePath: releaseRelativePath,
        title: draft.releaseTitle,
        artist: draft.releaseArtist,
        date: draft.releaseDate,
        type: draft.releaseType,
      },
      tracks: tracks.map((track) => ({
        id: track.id,
        number:
          track.draft.trackNumber,
        title: track.draft.title,
        version: track.draft.version,
        artist: track.draft.artist,
        sourceDate: track.draft.date,
        sourceRelativePath:
          track.draft.sourceRelativePath,
        destinationRelativePath:
          `${track.relativePath}/${track.audioDestination}`,
      })),
      videos: videos.map((video) => ({
        id: video.id,
        title: video.draft.title,
        videoType: video.draft.videoType,
        sourceRelativePath: video.draft.sourceRelativePath,
        destinationRelativePath:
          `${video.relativePath}/${video.videoDestination}`,
        ...(video.relatedTrackId
          ? { relatedTrackId: video.relatedTrackId }
          : {}),
      })),
      copies: copies.map((copy) => ({
        sourceRelativePath:
          copy.sourceRelativePath,
        destinationRelativePath:
          copy.destinationRelativePath,
        mediaKind: copy.mediaKind,
        logicalRoles: copy.logicalRoles,
        bytes: copy.bytes,
        sourceSha256: copy.sha256,
      })),
      inferenceEvidence: {
        candidate:
          inspection.candidate.evidence,
        files: inspection.files.map(
          (file) => ({
            sourceRelativePath:
              file.relativePath,
            evidence: file.evidence,
            embeddedMetadata:
              file.embeddedMetadata,
            metadataSidecar:
              file.metadataSidecar ?? null,
            embeddedArtwork:
              file.embeddedArtwork ?? [],
          }),
        ),
      },
      createdBy: {
        application: "metadata-editor",
        workflow: "ingest-builder-v1",
      },
    },
    null,
    2,
  )}\n`;
}

function uniqueTrackIdFor(
  track: IngestBuildTrackDraft,
  usedIds: Set<string>,
): string {
  const base = trackIdFor(track);

  if (!usedIds.has(base)) {
    usedIds.add(base);
    return base;
  }

  let suffix = 2;
  let candidate = `${base}-${suffix}`;

  while (usedIds.has(candidate)) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }

  usedIds.add(candidate);
  return candidate;
}

function withinReleasePath(
  releaseRelativePath: string,
  relativePath: string,
): string {
  const prefix = `${releaseRelativePath}/`;

  if (!relativePath.startsWith(prefix)) {
    throw new Error(
      `Path is outside the staging release: ${relativePath}`,
    );
  }

  return normalizeRelativeDestination(
    relativePath.slice(prefix.length),
    "Staging release path",
  );
}

async function readTomlRecordForUpdate(
  releasePath: string,
  releaseRelativePath: string,
  relativePath: string,
): Promise<{
  content: string;
  data: Record<string, unknown>;
}> {
  const withinRelease = withinReleasePath(
    releaseRelativePath,
    relativePath,
  );
  const target = assertPathWithinRoot(
    releasePath,
    path.join(
      releasePath,
      ...withinRelease.split("/"),
    ),
  );
  const stats = await lstat(target);

  if (
    stats.isSymbolicLink() ||
    !stats.isFile()
  ) {
    throw new Error(
      `Staging update requires a regular metadata file: ${relativePath}`,
    );
  }

  const content = await readFile(target, "utf8");
  const parsed = parse(content);

  if (!isRecord(parsed)) {
    throw new Error(
      `Expected a TOML document object: ${relativePath}`,
    );
  }

  return {
    content,
    data: parsed,
  };
}

function stringifyValidatedToml(
  data: Record<string, unknown>,
): string {
  const content = `${stringify(data).trimEnd()}\n`;
  parse(content);
  return content;
}

function buildUpdatedReceiptContent(
  existingReceipt: ExistingIngestReceipt,
  inspection: IngestCandidateInspection,
  draft: IngestBuildDraft,
  releaseRelativePath: string,
  tracks: PreparedIngestTrack[],
  videos: PreparedIngestVideo[],
  newCopies: PreparedCopy[],
  replacedDestinationPaths: Set<string>,
): string {
  const previousUpdates = Array.isArray(
    existingReceipt.raw.updates,
  )
    ? existingReceipt.raw.updates
    : [];
  const copies = [
    ...existingReceipt.copies
      .filter(
        (copy) =>
          !replacedDestinationPaths.has(
            copy.destinationRelativePath,
          ),
      )
      .map((copy) => ({
        sourceRelativePath:
          copy.sourceRelativePath,
        destinationRelativePath:
          copy.destinationRelativePath,
        mediaKind: copy.mediaKind,
        logicalRoles: copy.logicalRoles,
        bytes: copy.bytes,
        sourceSha256: copy.sourceSha256,
      })),
    ...newCopies.map((copy) => ({
      sourceRelativePath:
        copy.sourceRelativePath,
      destinationRelativePath:
        copy.destinationRelativePath,
      mediaKind: copy.mediaKind,
      logicalRoles: copy.logicalRoles,
      bytes: copy.bytes,
      sourceSha256: copy.sha256,
    })),
  ];

  return `${JSON.stringify(
    {
      ...existingReceipt.raw,
      schema: {
        name: "metadata-editor-ingest-receipt",
        version: 3,
      },
      candidate: {
        id: inspection.candidate.id,
        relativePath:
          inspection.candidate.relativePath,
        kind: inspection.candidate.kind,
      },
      release: {
        ...(isRecord(existingReceipt.raw.release)
          ? existingReceipt.raw.release
          : {}),
        id: draft.releaseId,
        relativePath: releaseRelativePath,
      },
      tracks: tracks.map((track) => ({
        id: track.id,
        number: track.draft.trackNumber,
        title: track.draft.title,
        version: track.draft.version,
        artist: track.draft.artist,
        sourceDate: track.draft.date,
        sourceRelativePath:
          track.draft.sourceRelativePath,
        destinationRelativePath:
          `${track.relativePath}/${track.audioDestination}`,
      })),
      videos: videos.map((video) => ({
        id: video.id,
        title: video.draft.title,
        videoType: video.draft.videoType,
        sourceRelativePath: video.draft.sourceRelativePath,
        destinationRelativePath:
          `${video.relativePath}/${video.videoDestination}`,
        ...(video.relatedTrackId
          ? { relatedTrackId: video.relatedTrackId }
          : {}),
      })),
      copies,
      updates: [
        ...previousUpdates,
        {
          plannedAt: new Date().toISOString(),
          candidateId: draft.candidateId,
          addedTrackIds: tracks
            .filter((track) => !track.existingTrack)
            .map((track) => track.id),
          addedVideoIds: videos
            .filter((video) => !video.existingVideo)
            .map((video) => video.id),
          replacedTrackIds: tracks
            .filter((track) => Boolean(track.replacement))
            .map((track) => track.id),
          addedArtworkDestinations: newCopies
            .filter(
              (copy) =>
                copy.mediaKind === "image" &&
                copy.writeAction !== "replace",
            )
            .map((copy) => copy.destinationRelativePath),
          replacedArtworkDestinations: newCopies
            .filter(
              (copy) =>
                copy.mediaKind === "image" &&
                copy.writeAction === "replace",
            )
            .map((copy) => copy.destinationRelativePath),
          trackOrder: tracks.map((track) => ({
            id: track.id,
            number: track.draft.trackNumber,
          })),
          metadataSidecars: inspection.files
            .filter((file) => file.metadataSidecar)
            .map((file) => ({
              sourceRelativePath: file.relativePath,
              metadataSidecar: file.metadataSidecar,
            })),
        },
      ],
      createdBy: {
        application: "metadata-editor",
        workflow: "ingest-builder-v2-update",
      },
    },
    null,
    2,
  )}\n`;
}

function videoMetadataDocument(
  releaseRelativePath: string,
  video: PreparedIngestVideo,
): GeneratedMetadataDocument {
  const data = {
    schema: {
      name: "video-metadata",
      version: 1,
    },
    video: {
      id: video.id,
      title: video.draft.title,
      type: video.draft.videoType,
      master_path: video.videoDestination,
      related_track_id: video.relatedTrackId ?? "",
    },
  };
  const content = `${stringify(data).trimEnd()}\n`;
  parse(content);

  return {
    // Until the metadata registry gains a dedicated video storage role,
    // this document is release-scoped for writer typing but lives under
    // videos/<stable-id>/video.toml and is not treated as release.toml.
    storageRole: "release",
    filename: "video.toml",
    relativePath: `${releaseRelativePath}/videos/${video.id}/video.toml`,
    content,
    validated: true,
  };
}

export async function prepareIngestReleaseBuild(
  ingestRoot: string,
  outputRoot: string,
  inspection: IngestCandidateInspection,
  draft: IngestBuildDraft,
  outputRootLabel =
    process.env.INGEST_OUTPUT_ROOT ??
    defaultIngestOutputRoot,
): Promise<PreparedIngestBuild> {
  if (
    inspection.candidate.id !==
      draft.candidateId
  ) {
    throw new Error(
      "Ingest draft candidate does not match the inspected candidate.",
    );
  }

  const releaseId = requireReleaseId(
    draft.releaseId,
  );
  const releaseRelativePath =
    `releases/${releaseId}`;

  /*
   * macOS may expose temporary paths through /var while realpath()
   * returns the equivalent /private/var path. Canonicalize both
   * filesystem roots before performing confinement comparisons.
   */
  const canonicalIngestRoot =
    await realpath(ingestRoot);
  const canonicalOutputRoot =
    await realpath(outputRoot);
  const releasePath = assertPathWithinRoot(
    canonicalOutputRoot,
    path.join(
      canonicalOutputRoot,
      "releases",
      releaseId,
    ),
  );
  const finalExists = await pathExists(
    releasePath,
  );
  const operation: IngestBuildOperation =
    finalExists ? "update" : "create";
  const existingReceipt = finalExists
    ? await readExistingIngestReceipt(
        releasePath,
        releaseId,
      )
    : null;

  if (finalExists) {
    await assertSafeReleaseTree(releasePath);
  }

  const fileMap =
    inspectionFileMap(inspection);
  const includedTracks = draft.tracks
    .filter((track) => track.include)
    .sort(
      (left, right) =>
        left.trackNumber -
        right.trackNumber,
    );

  const includedVideoDrafts = (draft.videos ?? []).filter(
    (video) => video.include,
  );

  if (
    includedTracks.length === 0 &&
    includedVideoDrafts.length === 0 &&
    !existingReceipt
  ) {
    throw new Error(
      "At least one audio track or video must be included when creating a release.",
    );
  }

  validateUniqueTrackInputs(includedTracks);

  const existingTrackBySource = new Map(
    (existingReceipt?.tracks ?? []).map(
      (track) => [
        track.sourceRelativePath,
        track,
      ],
    ),
  );
  const existingTrackById = new Map(
    (existingReceipt?.tracks ?? []).map(
      (track) => [track.id, track],
    ),
  );
  const usedTrackIds = new Set(
    existingReceipt?.tracks.map(
      (track) => track.id,
    ) ?? [],
  );
  const claimedExistingTrackIds = new Set<string>();

  const candidateTracks = includedTracks.map(
    (track): PreparedIngestTrack => {
      const file = fileMap.get(
        track.sourceRelativePath,
      );

      if (!file) {
        throw new Error(
          `Track source was not found in the inspected candidate: ${track.sourceRelativePath}`,
        );
      }

      if (file.mediaKind !== "audio") {
        throw new Error(
          `Track source is not detected as audio: ${track.sourceRelativePath}`,
        );
      }

      const expectedDestination =
        expectedAudioDestination(file);

      if (
        track.destinationFilename !==
          expectedDestination
      ) {
        throw new Error(
          `${track.sourceRelativePath}: destination filename must remain ${expectedDestination} so the staging library recognizes one canonical master.`,
        );
      }

      const replacementTrackId =
        track.replacementTrackId?.trim();
      if (replacementTrackId && !existingReceipt) {
        throw new Error(
          `${track.sourceRelativePath}: canonical-audio replacement requires an existing Library release.`,
        );
      }

      const replacementTarget = replacementTrackId
        ? existingTrackById.get(replacementTrackId)
        : undefined;

      if (replacementTrackId && !replacementTarget) {
        throw new Error(
          `${track.sourceRelativePath}: replacement target ${replacementTrackId} is not present in the existing ingest receipt.`,
        );
      }

      const existingTrack =
        replacementTarget ??
        existingTrackBySource.get(
          track.sourceRelativePath,
        );

      if (
        existingTrack &&
        claimedExistingTrackIds.has(existingTrack.id)
      ) {
        throw new Error(
          `${track.sourceRelativePath}: existing track ${existingTrack.id} is already claimed by another source in this update.`,
        );
      }
      if (existingTrack) {
        claimedExistingTrackIds.add(existingTrack.id);
      }

      const id = existingTrack
        ? existingTrack.id
        : uniqueTrackIdFor(
            track,
            usedTrackIds,
          );
      const relativePath = existingTrack
        ? path.posix.dirname(
            existingTrack.destinationRelativePath,
          )
        : `${releaseRelativePath}/tracks/${id}`;
      const audioDestination = replacementTarget
        ? expectedDestination
        : existingTrack
          ? path.posix.basename(
              existingTrack.destinationRelativePath,
            )
          : expectedDestination;

      if (
        existingTrack &&
        relativePath !==
          `${releaseRelativePath}/tracks/${id}`
      ) {
        throw new Error(
          `Existing receipt has an unsupported track destination for ${track.sourceRelativePath}.`,
        );
      }

      if (
        existingTrack &&
        !replacementTarget &&
        audioDestination !== expectedDestination
      ) {
        throw new Error(
          `Existing receipt has an unsupported track destination for ${track.sourceRelativePath}.`,
        );
      }

      return {
        draft: track,
        file,
        id,
        relativePath,
        audioDestination,
        ...(existingTrack
          ? { existingTrack }
          : {}),
        ...(replacementTarget
          ? {
              replacement: {
                previousSourceRelativePath:
                  replacementTarget.sourceRelativePath,
                previousDestinationRelativePath:
                  replacementTarget.destinationRelativePath,
              },
            }
          : {}),
      };
    },
  );

  const preservedExistingTracks: PreparedIngestTrack[] =
    (existingReceipt?.tracks ?? [])
      .filter(
        (track) =>
          !claimedExistingTrackIds.has(track.id),
      )
      .map((track) => ({
        draft: {
          sourceRelativePath: track.sourceRelativePath,
          include: true,
          trackNumber: track.number,
          title: track.title,
          version: track.version,
          artist: track.artist,
          date: track.sourceDate,
          destinationFilename:
            path.posix.basename(
              track.destinationRelativePath,
            ),
        },
        id: track.id,
        relativePath: path.posix.dirname(
          track.destinationRelativePath,
        ),
        audioDestination: path.posix.basename(
          track.destinationRelativePath,
        ),
        existingTrack: track,
        preserveOnly: true,
      }));

  const tracks = [
    ...candidateTracks,
    ...preservedExistingTracks,
  ].sort(
    (left, right) =>
      left.draft.trackNumber -
        right.draft.trackNumber ||
      left.id.localeCompare(right.id),
  );

  const trackIds = new Set<string>();
  const trackNumbers = new Map<number, string>();

  for (const track of tracks) {
    if (trackIds.has(track.id)) {
      throw new Error(
        `Generated duplicate track ID: ${track.id}`,
      );
    }
    trackIds.add(track.id);

    const existingNumberOwner =
      trackNumbers.get(track.draft.trackNumber);
    if (existingNumberOwner) {
      throw new Error(
        `Track number ${track.draft.trackNumber} is already used by ${existingNumberOwner}. Choose another number or explicitly replace that existing track.`,
      );
    }
    trackNumbers.set(
      track.draft.trackNumber,
      track.id,
    );
  }

  const existingVideoBySource = new Map(
    (existingReceipt?.videos ?? []).map((video) => [
      video.sourceRelativePath,
      video,
    ]),
  );
  const existingVideoById = new Map(
    (existingReceipt?.videos ?? []).map((video) => [
      video.id,
      video,
    ]),
  );
  const claimedExistingVideoIds = new Set<string>();
  const usedVideoIds = new Set(
    (existingReceipt?.videos ?? []).map((video) => video.id),
  );
  const trackBySource = new Map(
    tracks.map((track) => [
      track.draft.sourceRelativePath,
      track,
    ]),
  );

  const candidateVideos = includedVideoDrafts.map(
    (video): PreparedIngestVideo => {
      const file = fileMap.get(video.sourceRelativePath);
      if (!file) {
        throw new Error(
          `Video source was not found in the inspected candidate: ${video.sourceRelativePath}`,
        );
      }
      if (file.mediaKind !== "video") {
        throw new Error(
          `Video source is not probe-verified as video: ${video.sourceRelativePath}`,
        );
      }

      const expectedDestination = expectedVideoDestination(file);
      if (video.destinationFilename !== expectedDestination) {
        throw new Error(
          `${video.sourceRelativePath}: destination filename must remain ${expectedDestination} so the Library retains one canonical video master.`,
        );
      }

      const existingVideo = existingVideoBySource.get(
        video.sourceRelativePath,
      );
      const requestedId = video.videoId.trim();
      if (existingVideo && existingVideo.id !== requestedId) {
        throw new Error(
          `${video.sourceRelativePath}: existing video identity is stable as ${existingVideo.id}; rename/re-identification is a separate reviewed workflow.`,
        );
      }
      if (!existingVideo && existingVideoById.has(requestedId)) {
        throw new Error(
          `${video.sourceRelativePath}: video ID ${requestedId} already belongs to another Library video. Choose a unique video ID.`,
        );
      }
      if (existingVideo && claimedExistingVideoIds.has(existingVideo.id)) {
        throw new Error(
          `${video.sourceRelativePath}: existing video ${existingVideo.id} is already claimed by another source.`,
        );
      }
      if (existingVideo) {
        claimedExistingVideoIds.add(existingVideo.id);
      } else if (usedVideoIds.has(requestedId)) {
        throw new Error(`Duplicate video ID: ${requestedId}`);
      } else {
        usedVideoIds.add(requestedId);
      }

      const relatedTrackSource =
        video.relatedTrackSourceRelativePath.trim();
      const relatedTrack = relatedTrackSource
        ? trackBySource.get(relatedTrackSource)
        : undefined;
      if (relatedTrackSource && !relatedTrack) {
        throw new Error(
          `${video.sourceRelativePath}: related track is not available in the resulting release: ${relatedTrackSource}`,
        );
      }

      const id = existingVideo?.id ?? requestedId;
      const relativePath = existingVideo
        ? path.posix.dirname(existingVideo.destinationRelativePath)
        : `${releaseRelativePath}/videos/${id}`;
      const videoDestination = existingVideo
        ? path.posix.basename(existingVideo.destinationRelativePath)
        : expectedDestination;

      if (relativePath !== `${releaseRelativePath}/videos/${id}`) {
        throw new Error(
          `${video.sourceRelativePath}: existing video destination is outside the canonical videos/<id> layout.`,
        );
      }
      if (existingVideo && videoDestination !== expectedDestination) {
        throw new Error(
          `${video.sourceRelativePath}: existing canonical video extension differs from the inspected source; video replacement is not enabled in Video V1.`,
        );
      }

      return {
        draft: video,
        id,
        relativePath,
        videoDestination,
        file,
        ...(relatedTrack ? { relatedTrackId: relatedTrack.id } : {}),
        ...(existingVideo ? { existingVideo } : {}),
      };
    },
  );

  const preservedExistingVideos: PreparedIngestVideo[] =
    (existingReceipt?.videos ?? [])
      .filter((video) => !claimedExistingVideoIds.has(video.id))
      .map((video) => ({
        draft: {
          sourceRelativePath: video.sourceRelativePath,
          include: true,
          videoId: video.id,
          title: video.title,
          videoType: video.videoType,
          relatedTrackSourceRelativePath: "",
          destinationFilename:
            path.posix.basename(video.destinationRelativePath),
        },
        id: video.id,
        relativePath: path.posix.dirname(video.destinationRelativePath),
        videoDestination:
          path.posix.basename(video.destinationRelativePath),
        ...(video.relatedTrackId
          ? { relatedTrackId: video.relatedTrackId }
          : {}),
        existingVideo: video,
        preserveOnly: true,
      }));

  const videos = [
    ...candidateVideos,
    ...preservedExistingVideos,
  ];

  const includedAssets = draft.assets.filter(
    (asset) => asset.include,
  );
  const normalizedAssets = includedAssets.map(
    (asset) => {
      const embedded =
        asset.sourceType === "embedded-artwork"
          ? asset.embeddedArtwork
          : undefined;
      const file = fileMap.get(
        embedded?.audioSourceRelativePath ??
          asset.sourceRelativePath,
      );

      if (!file) {
        throw new Error(
          `Asset source was not found in the inspected candidate: ${asset.sourceRelativePath}`,
        );
      }

      if (embedded) {
        if (file.mediaKind !== "audio") {
          throw new Error(
            `${asset.sourceRelativePath}: embedded artwork source is no longer audio.`,
          );
        }
        const inspectedArtwork = (file.embeddedArtwork ?? []).find(
          (item) =>
            item.streamIndex === embedded.streamIndex &&
            item.sha256 === embedded.sha256,
        );
        if (!inspectedArtwork) {
          throw new Error(
            `${asset.sourceRelativePath}: embedded artwork changed after inspection. Inspect the candidate again.`,
          );
        }
      } else if (file.mediaKind !== asset.mediaKind) {
        throw new Error(
          `Asset kind changed after inspection: ${asset.sourceRelativePath}`,
        );
      }

      const destinationRelativePath =
        normalizeRelativeDestination(
          asset.destinationRelativePath,
          `${asset.sourceRelativePath} destination`,
        );
      const sourceExtension = embedded
        ? embedded.extension.toLowerCase()
        : extensionOf(file.filename);

      if (
        extensionOf(destinationRelativePath) !==
          sourceExtension
      ) {
        throw new Error(
          `${asset.sourceRelativePath}: destination extension must match the source because ingestion does not transcode.`,
        );
      }

      if (asset.mediaKind === "image") {
        if (asset.artworkAssignments.length === 0) {
          throw new Error(
            `${asset.sourceRelativePath}: included artwork requires at least one release-level or track-level assignment.`,
          );
        }

        const assignmentIds = new Set<string>();
        const includedTrackPaths = new Set(
          tracks.map((track) =>
            track.draft.sourceRelativePath,
          ),
        );

        for (const assignment of asset.artworkAssignments) {
          if (assignmentIds.has(assignment.id)) {
            throw new Error(
              `${asset.sourceRelativePath}: artwork assignment IDs must be unique.`,
            );
          }
          assignmentIds.add(assignment.id);

          if (!assignment.role.trim()) {
            throw new Error(
              `${asset.sourceRelativePath}: every artwork assignment requires a role.`,
            );
          }

          if (assignment.scope === "release") {
            if (assignment.trackSourceRelativePaths.length > 0) {
              throw new Error(
                `${asset.sourceRelativePath}: release-level artwork assignments cannot select tracks.`,
              );
            }
          } else {
            const selectedTracks = new Set(
              assignment.trackSourceRelativePaths,
            );

            if (selectedTracks.size === 0) {
              throw new Error(
                `${asset.sourceRelativePath}: track-level artwork assignments require at least one included track.`,
              );
            }

            for (const trackPath of selectedTracks) {
              if (!includedTrackPaths.has(trackPath)) {
                throw new Error(
                  `${asset.sourceRelativePath}: artwork assignment references a track that is not included: ${trackPath}`,
                );
              }
            }
          }
        }
      } else if (asset.artworkAssignments.length > 0) {
        throw new Error(
          `${asset.sourceRelativePath}: text sidecars cannot have artwork assignments.`,
        );
      }

      return {
        draft: asset,
        file,
        embeddedArtwork: embedded,
        destinationRelativePath,
      };
    },
  );

  const copyMappingKey = (
    sourceRelativePath: string,
    destinationRelativePath: string,
  ) => `${sourceRelativePath}\u0000${destinationRelativePath}`;
  const existingCopyByMapping = new Map(
    (existingReceipt?.copies ?? []).map(
      (copy) => [
        copyMappingKey(
          copy.sourceRelativePath,
          copy.destinationRelativePath,
        ),
        copy,
      ],
    ),
  );
  const existingCopySourcePaths = new Set(
    (existingReceipt?.copies ?? []).map(
      (copy) => copy.sourceRelativePath,
    ),
  );
  const existingCopyByDestination = new Map(
    (existingReceipt?.copies ?? []).map(
      (copy) => [
        copy.destinationRelativePath,
        copy,
      ],
    ),
  );
  const existingArtworkByStem = new Map<
    string,
    ExistingReceiptCopy
  >();
  for (const copy of existingReceipt?.copies ?? []) {
    if (copy.mediaKind !== "image") {
      continue;
    }

    const stem = artworkDestinationStem(
      copy.destinationRelativePath,
    );
    if (existingArtworkByStem.has(stem)) {
      throw new Error(
        `The existing ingest receipt contains more than one artwork copy for target ${stem}. Resolve the duplicate receipt entries before updating artwork.`,
      );
    }
    existingArtworkByStem.set(stem, copy);
  }

  if (existingReceipt) {
    const newTextSidecars =
      normalizedAssets.filter(
        (asset) =>
          asset.draft.mediaKind === "text" &&
          !asset.file.metadataSidecar &&
          !existingCopySourcePaths.has(
            asset.draft.sourceRelativePath,
          ),
      );

    if (newTextSidecars.length > 0) {
      throw new Error(
        [
          "Incremental artwork revision is available, but general text-sidecar addition remains a separate future workflow.",
          `New text sidecars: ${newTextSidecars
            .map((asset) => asset.draft.sourceRelativePath)
            .join(", ")}`,
        ].join(" "),
      );
    }
  }

  const artworkDrafts = normalizedAssets
    .filter((asset) => asset.draft.mediaKind === "image")
    .map((asset) => asset.draft);
  const artworkPlacements = buildArtworkPlacements(
    artworkDrafts,
    tracks,
  );

  const release = syntheticReleaseScan(
    releaseId,
    releaseRelativePath,
    tracks,
    artworkPlacements,
  );
  const generated =
    buildGeneratedTomlPreview(
      release,
      syntheticMetadataPreview(
        release,
        draft,
        tracks,
        artworkPlacements,
      ),
    );
  const generatedDocuments =
    customizeGeneratedDocuments(
      generated.documents,
      draft,
      tracks,
      artworkPlacements,
      releaseRelativePath,
    );
  const videoDocuments = videos
    .filter((video) => !video.existingVideo)
    .map((video) =>
      videoMetadataDocument(
        releaseRelativePath,
        video,
      ),
    );
  const copies: PreparedCopy[] = [];
  const preservedCopies: PreparedCopy[] = [];
  const preservedCopyItems: IngestBuildPlanItem[] = [];
  const removals: PreparedRemoval[] = [];
  const blockedItems: IngestBuildPlanItem[] = [];

  const verifyExistingCopy = async (
    receiptCopy: ExistingReceiptCopy,
  ): Promise<boolean> => {
    const stagedDestination = assertPathWithinRoot(
      releasePath,
      path.join(
        releasePath,
        ...withinReleasePath(
          releaseRelativePath,
          receiptCopy.destinationRelativePath,
        ).split("/"),
      ),
    );

    return (
      (await pathExists(stagedDestination)) &&
      (await sha256File(stagedDestination)) ===
        receiptCopy.sourceSha256
    );
  };

  const scheduleRemovalIfPresent = async (
    destinationRelativePath: string,
    reason: string,
  ) => {
    const destinationWithinRelease =
      withinReleasePath(
        releaseRelativePath,
        destinationRelativePath,
      );
    const target = assertPathWithinRoot(
      releasePath,
      path.join(
        releasePath,
        ...destinationWithinRelease.split("/"),
      ),
    );

    if (!(await pathExists(target))) {
      return;
    }

    const stats = await lstat(target);
    if (stats.isSymbolicLink()) {
      throw new Error(
        `Refusing to revise a symlinked Library asset: ${destinationRelativePath}`,
      );
    }

    removals.push({
      destinationRelativePath,
      destinationWithinRelease,
      reason,
    });
  };

  for (const track of tracks) {
    if (track.preserveOnly) {
      const receiptCopy = existingCopyByDestination.get(
        track.existingTrack!.destinationRelativePath,
      );

      if (
        !receiptCopy ||
        !(await verifyExistingCopy(receiptCopy))
      ) {
        blockedItems.push({
          kind: "copy",
          sourceRelativePath:
            track.existingTrack!.sourceRelativePath,
          destinationRelativePath:
            track.existingTrack!.destinationRelativePath,
          mediaKind: receiptCopy?.mediaKind ?? "audio",
          sizeBytes: receiptCopy?.bytes,
          sha256: receiptCopy?.sourceSha256,
          logicalRoles: receiptCopy?.logicalRoles,
          action: "blocked",
          reason:
            "An untouched existing track no longer matches its ingest receipt. Resolve the Library copy before applying this update.",
        });
        continue;
      }

      preservedCopyItems.push({
        kind: "copy",
        sourceRelativePath: receiptCopy.sourceRelativePath,
        destinationRelativePath: receiptCopy.destinationRelativePath,
        mediaKind: receiptCopy.mediaKind,
        sizeBytes: receiptCopy.bytes,
        sha256: receiptCopy.sourceSha256,
        logicalRoles: receiptCopy.logicalRoles,
        action: "preserve",
        adjustment: `Stable ID: ${track.id}`,
        reason:
          "This existing Library track is not part of the current ingest candidate and will be preserved unchanged.",
      });
      continue;
    }

    if (!track.file) {
      throw new Error(
        `Included track is missing its inspected source: ${track.draft.sourceRelativePath}`,
      );
    }

    const preparedCopy = await prepareCopy(
      canonicalIngestRoot,
      track.file,
      `tracks/${track.id}/${track.audioDestination}`,
      `${track.relativePath}/${track.audioDestination}`,
      [
        "audio-master",
        "audio-player-source",
      ],
    );

    if (!track.existingTrack) {
      copies.push(preparedCopy);
      continue;
    }

    if (track.replacement) {
      const previousCopy = existingCopyByDestination.get(
        track.replacement.previousDestinationRelativePath,
      );

      if (
        !previousCopy ||
        !(await verifyExistingCopy(previousCopy))
      ) {
        blockedItems.push({
          kind: "copy",
          sourceRelativePath:
            track.replacement.previousSourceRelativePath,
          destinationRelativePath:
            track.replacement.previousDestinationRelativePath,
          mediaKind: previousCopy?.mediaKind ?? "audio",
          sizeBytes: previousCopy?.bytes,
          sha256: previousCopy?.sourceSha256,
          logicalRoles: previousCopy?.logicalRoles,
          action: "blocked",
          reason:
            "Canonical-audio replacement requires the current Library master to match its ingest receipt before it can be superseded.",
        });
        continue;
      }

      if (
        previousCopy.destinationRelativePath !==
        preparedCopy.destinationRelativePath
      ) {
        const replacementDestination = assertPathWithinRoot(
          releasePath,
          path.join(
            releasePath,
            ...withinReleasePath(
              releaseRelativePath,
              preparedCopy.destinationRelativePath,
            ).split("/"),
          ),
        );
        if (await pathExists(replacementDestination)) {
          blockedItems.push({
            kind: "copy",
            sourceRelativePath: preparedCopy.sourceRelativePath,
            destinationRelativePath: preparedCopy.destinationRelativePath,
            mediaKind: preparedCopy.mediaKind,
            sizeBytes: preparedCopy.bytes,
            sha256: preparedCopy.sha256,
            logicalRoles: preparedCopy.logicalRoles,
            action: "blocked",
            reason:
              "The replacement canonical-audio destination already exists and is not the currently verified master. Resolve that collision before applying the revision.",
          });
          continue;
        }
      }

      preparedCopy.writeAction = "replace";
      preparedCopy.replacementOfDestinationRelativePath =
        previousCopy.destinationRelativePath;
      copies.push(preparedCopy);

      if (
        previousCopy.destinationRelativePath !==
        preparedCopy.destinationRelativePath
      ) {
        await scheduleRemovalIfPresent(
          previousCopy.destinationRelativePath,
          "The superseded canonical audio master will be removed after its replacement is staged and verified.",
        );
      }

      for (const derivative of [
        `${track.relativePath}/audio-playback.mp3`,
        `${track.relativePath}/waveform-peaks.json`,
        `${track.relativePath}/stream`,
      ]) {
        if (
          derivative ===
          preparedCopy.destinationRelativePath
        ) {
          continue;
        }
        await scheduleRemovalIfPresent(
          derivative,
          "This generated derivative depends on the previous canonical audio and must be regenerated by Prepare release.",
        );
      }
      continue;
    }

    const receiptCopy =
      existingCopyByMapping.get(
        copyMappingKey(
          track.draft.sourceRelativePath,
          preparedCopy.destinationRelativePath,
        ),
      );

    if (!receiptCopy) {
      blockedItems.push({
        kind: "copy",
        sourceRelativePath:
          preparedCopy.sourceRelativePath,
        destinationRelativePath:
          preparedCopy.destinationRelativePath,
        mediaKind: preparedCopy.mediaKind,
        sizeBytes: preparedCopy.bytes,
        sha256: preparedCopy.sha256,
        logicalRoles:
          preparedCopy.logicalRoles,
        action: "blocked",
        reason:
          "The existing ingest receipt does not contain the expected audio-master mapping.",
      });
      continue;
    }

    if (
      receiptCopy.sourceSha256 !==
        preparedCopy.sha256
    ) {
      blockedItems.push({
        kind: "copy",
        sourceRelativePath:
          preparedCopy.sourceRelativePath,
        destinationRelativePath:
          preparedCopy.destinationRelativePath,
        mediaKind: preparedCopy.mediaKind,
        sizeBytes: preparedCopy.bytes,
        sha256: preparedCopy.sha256,
        logicalRoles:
          preparedCopy.logicalRoles,
        action: "blocked",
        reason:
          "The source bytes changed after the original staging build. Choose Replace canonical audio for this track instead of silently overwriting the Library master.",
      });
      continue;
    }

    if (!(await verifyExistingCopy(receiptCopy))) {
      blockedItems.push({
        kind: "copy",
        sourceRelativePath:
          preparedCopy.sourceRelativePath,
        destinationRelativePath:
          preparedCopy.destinationRelativePath,
        mediaKind: preparedCopy.mediaKind,
        sizeBytes: preparedCopy.bytes,
        sha256: preparedCopy.sha256,
        logicalRoles:
          preparedCopy.logicalRoles,
        action: "blocked",
        reason:
          "The staged audio master no longer matches its ingest receipt. Resolve the modified or missing destination before applying an incremental update.",
      });
      continue;
    }

    preservedCopies.push(preparedCopy);
  }

  for (const video of videos) {
    if (video.preserveOnly) {
      const receiptCopy = existingCopyByDestination.get(
        video.existingVideo!.destinationRelativePath,
      );
      if (
        !receiptCopy ||
        receiptCopy.mediaKind !== "video" ||
        !(await verifyExistingCopy(receiptCopy))
      ) {
        blockedItems.push({
          kind: "copy",
          sourceRelativePath: video.existingVideo!.sourceRelativePath,
          destinationRelativePath:
            video.existingVideo!.destinationRelativePath,
          mediaKind: receiptCopy?.mediaKind ?? "video",
          sizeBytes: receiptCopy?.bytes,
          sha256: receiptCopy?.sourceSha256,
          logicalRoles: receiptCopy?.logicalRoles,
          action: "blocked",
          reason:
            "An untouched existing video no longer matches its ingest receipt. Resolve the canonical Library copy before applying this update.",
        });
        continue;
      }

      preservedCopyItems.push({
        kind: "copy",
        sourceRelativePath: receiptCopy.sourceRelativePath,
        destinationRelativePath: receiptCopy.destinationRelativePath,
        mediaKind: "video",
        sizeBytes: receiptCopy.bytes,
        sha256: receiptCopy.sourceSha256,
        logicalRoles: receiptCopy.logicalRoles,
        action: "preserve",
        adjustment: `Stable video ID: ${video.id}`,
        reason:
          "This existing canonical video is outside the current ingest candidate and will be preserved unchanged.",
      });
      continue;
    }

    if (!video.file) {
      throw new Error(
        `Included video is missing its inspected source: ${video.draft.sourceRelativePath}`,
      );
    }

    const preparedCopy = await prepareCopy(
      canonicalIngestRoot,
      video.file,
      `videos/${video.id}/${video.videoDestination}`,
      `${video.relativePath}/${video.videoDestination}`,
      ["video-master"],
    );

    if (!video.existingVideo) {
      copies.push(preparedCopy);
      continue;
    }

    const receiptCopy = existingCopyByMapping.get(
      copyMappingKey(
        video.draft.sourceRelativePath,
        preparedCopy.destinationRelativePath,
      ),
    );
    if (!receiptCopy || receiptCopy.mediaKind !== "video") {
      blockedItems.push({
        kind: "copy",
        sourceRelativePath: preparedCopy.sourceRelativePath,
        destinationRelativePath: preparedCopy.destinationRelativePath,
        mediaKind: "video",
        sizeBytes: preparedCopy.bytes,
        sha256: preparedCopy.sha256,
        logicalRoles: preparedCopy.logicalRoles,
        action: "blocked",
        reason:
          "The existing ingest receipt does not contain the expected canonical video-master mapping.",
      });
      continue;
    }
    if (receiptCopy.sourceSha256 !== preparedCopy.sha256) {
      blockedItems.push({
        kind: "copy",
        sourceRelativePath: preparedCopy.sourceRelativePath,
        destinationRelativePath: preparedCopy.destinationRelativePath,
        mediaKind: "video",
        sizeBytes: preparedCopy.bytes,
        sha256: preparedCopy.sha256,
        logicalRoles: preparedCopy.logicalRoles,
        action: "blocked",
        reason:
          "The video source bytes changed after the original staging build. Canonical video replacement will be added as a separate reviewed workflow rather than overwriting the Library master.",
      });
      continue;
    }
    if (!(await verifyExistingCopy(receiptCopy))) {
      blockedItems.push({
        kind: "copy",
        sourceRelativePath: preparedCopy.sourceRelativePath,
        destinationRelativePath: preparedCopy.destinationRelativePath,
        mediaKind: "video",
        sizeBytes: preparedCopy.bytes,
        sha256: preparedCopy.sha256,
        logicalRoles: preparedCopy.logicalRoles,
        action: "blocked",
        reason:
          "The canonical Library video no longer matches its ingest receipt. Resolve the modified or missing destination before applying an incremental update.",
      });
      continue;
    }

    preservedCopies.push(preparedCopy);
  }

  for (const asset of normalizedAssets) {
    const destinations =
      asset.draft.mediaKind === "image"
        ? artworkPlacements
            .filter(
              (placement) =>
                placement.draft === asset.draft,
            )
            .map((placement) => ({
              destinationRelativePath:
                placement.destinationRelativePath,
              logicalRoles: [
                placement.trackSourceRelativePath
                  ? `track-artwork:${placement.assignment.role}:${placement.trackSourceRelativePath}`
                  : `release-artwork:${placement.assignment.role}`,
              ],
              assignment: placement.assignment,
            }))
        : [
            {
              destinationRelativePath:
                asset.destinationRelativePath,
              logicalRoles: ["imported-text-sidecar"],
              assignment: undefined,
            },
          ];

    for (const destination of destinations) {
      const preparedCopy = asset.embeddedArtwork
        ? await prepareEmbeddedArtworkCopy(
            canonicalIngestRoot,
            asset.file,
            asset.draft.sourceRelativePath,
            asset.embeddedArtwork,
            destination.destinationRelativePath,
            `${releaseRelativePath}/${destination.destinationRelativePath}`,
            destination.logicalRoles,
          )
        : await prepareCopy(
            canonicalIngestRoot,
            asset.file,
            destination.destinationRelativePath,
            `${releaseRelativePath}/${destination.destinationRelativePath}`,
            destination.logicalRoles,
          );

      if (!existingReceipt) {
        copies.push(preparedCopy);
        continue;
      }

      const receiptCopy = existingCopyByMapping.get(
        copyMappingKey(
          preparedCopy.sourceRelativePath,
          preparedCopy.destinationRelativePath,
        ),
      );

      if (
        receiptCopy &&
        receiptCopy.sourceSha256 === preparedCopy.sha256
      ) {
        if (!(await verifyExistingCopy(receiptCopy))) {
          blockedItems.push({
            kind: "copy",
            sourceRelativePath:
              receiptCopy.sourceRelativePath,
            destinationRelativePath:
              receiptCopy.destinationRelativePath,
            mediaKind: receiptCopy.mediaKind,
            sizeBytes: receiptCopy.bytes,
            sha256: receiptCopy.sourceSha256,
            logicalRoles: receiptCopy.logicalRoles,
            action: "blocked",
            reason:
              "The existing Library artwork no longer matches its ingest receipt. Resolve the modified or missing destination before applying the revision.",
          });
          continue;
        }

        preservedCopies.push(preparedCopy);
        continue;
      }

      if (asset.draft.mediaKind === "image") {
        const existingArtwork = existingArtworkByStem.get(
          artworkDestinationStem(
            preparedCopy.destinationRelativePath,
          ),
        );

        if (existingArtwork) {
          if (destination.assignment?.replaceExisting !== true) {
            blockedItems.push({
              kind: "copy",
              sourceRelativePath:
                preparedCopy.sourceRelativePath,
              destinationRelativePath:
                preparedCopy.destinationRelativePath,
              mediaKind: preparedCopy.mediaKind,
              sizeBytes: preparedCopy.bytes,
              sha256: preparedCopy.sha256,
              logicalRoles: preparedCopy.logicalRoles,
              action: "blocked",
              reason:
                "This artwork assignment targets existing canonical Library artwork. Confirm the replacement in Artwork & files before applying the update.",
            });
            continue;
          }

          if (!(await verifyExistingCopy(existingArtwork))) {
            blockedItems.push({
              kind: "copy",
              sourceRelativePath:
                existingArtwork.sourceRelativePath,
              destinationRelativePath:
                existingArtwork.destinationRelativePath,
              mediaKind: existingArtwork.mediaKind,
              sizeBytes: existingArtwork.bytes,
              sha256: existingArtwork.sourceSha256,
              logicalRoles: existingArtwork.logicalRoles,
              action: "blocked",
              reason:
                "Artwork replacement requires the current Library artwork to match its ingest receipt before it can be superseded.",
            });
            continue;
          }

          if (
            existingArtwork.destinationRelativePath !==
              preparedCopy.destinationRelativePath
          ) {
            const replacementDestination =
              assertPathWithinRoot(
                releasePath,
                path.join(
                  releasePath,
                  ...withinReleasePath(
                    releaseRelativePath,
                    preparedCopy.destinationRelativePath,
                  ).split("/"),
                ),
              );
            if (await pathExists(replacementDestination)) {
              blockedItems.push({
                kind: "copy",
                sourceRelativePath:
                  preparedCopy.sourceRelativePath,
                destinationRelativePath:
                  preparedCopy.destinationRelativePath,
                mediaKind: preparedCopy.mediaKind,
                sizeBytes: preparedCopy.bytes,
                sha256: preparedCopy.sha256,
                logicalRoles: preparedCopy.logicalRoles,
                action: "blocked",
                reason:
                  "The replacement artwork destination already exists independently of the verified current artwork. Resolve that collision before applying the revision.",
              });
              continue;
            }
          }

          preparedCopy.writeAction = "replace";
          preparedCopy.replacementOfDestinationRelativePath =
            existingArtwork.destinationRelativePath;
          copies.push(preparedCopy);

          if (
            existingArtwork.destinationRelativePath !==
              preparedCopy.destinationRelativePath
          ) {
            await scheduleRemovalIfPresent(
              existingArtwork.destinationRelativePath,
              "The superseded canonical artwork will be removed after its reviewed replacement is staged and verified.",
            );
          }
          continue;
        }

        const untrackedDestination = assertPathWithinRoot(
          releasePath,
          path.join(
            releasePath,
            ...withinReleasePath(
              releaseRelativePath,
              preparedCopy.destinationRelativePath,
            ).split("/"),
          ),
        );
        if (await pathExists(untrackedDestination)) {
          blockedItems.push({
            kind: "copy",
            sourceRelativePath:
              preparedCopy.sourceRelativePath,
            destinationRelativePath:
              preparedCopy.destinationRelativePath,
            mediaKind: preparedCopy.mediaKind,
            sizeBytes: preparedCopy.bytes,
            sha256: preparedCopy.sha256,
            logicalRoles: preparedCopy.logicalRoles,
            action: "blocked",
            reason:
              "The requested artwork destination already exists but is not represented by the current ingest receipt. Refusing to overwrite an untracked Library asset.",
          });
          continue;
        }

        copies.push(preparedCopy);
        continue;
      }

      if (asset.file.metadataSidecar) {
        const sidecarDestination = assertPathWithinRoot(
          releasePath,
          path.join(
            releasePath,
            ...withinReleasePath(
              releaseRelativePath,
              preparedCopy.destinationRelativePath,
            ).split("/"),
          ),
        );

        if (await pathExists(sidecarDestination)) {
          blockedItems.push({
            kind: "copy",
            sourceRelativePath:
              preparedCopy.sourceRelativePath,
            destinationRelativePath:
              preparedCopy.destinationRelativePath,
            mediaKind: preparedCopy.mediaKind,
            sizeBytes: preparedCopy.bytes,
            sha256: preparedCopy.sha256,
            logicalRoles:
              preparedCopy.logicalRoles,
            action: "blocked",
            reason:
              "The requested FFmetadata archival destination already exists independently of this source mapping. Refusing to overwrite the existing Library sidecar.",
          });
        } else {
          copies.push(preparedCopy);
        }
        continue;
      }

      blockedItems.push({
        kind: "copy",
        sourceRelativePath:
          preparedCopy.sourceRelativePath,
        destinationRelativePath:
          preparedCopy.destinationRelativePath,
        mediaKind: preparedCopy.mediaKind,
        sizeBytes: preparedCopy.bytes,
        sha256: preparedCopy.sha256,
        logicalRoles:
          preparedCopy.logicalRoles,
        action: "blocked",
        reason:
          "Existing text sidecars are preserved only when their source mapping and bytes still match the ingest receipt. General sidecar replacement remains a separate future workflow.",
      });
    }
  }

  if (existingReceipt) {
    const replacedDestinations = new Set(
      copies.flatMap((copy) =>
        copy.replacementOfDestinationRelativePath
          ? [copy.replacementOfDestinationRelativePath]
          : [],
      ),
    );
    const accountedDestinations = new Set([
      ...copies.map((copy) => copy.destinationRelativePath),
      ...preservedCopies.map(
        (copy) => copy.destinationRelativePath,
      ),
      ...preservedCopyItems.map(
        (item) => item.destinationRelativePath,
      ),
    ]);

    for (const receiptCopy of existingReceipt.copies) {
      if (
        replacedDestinations.has(
          receiptCopy.destinationRelativePath,
        ) ||
        accountedDestinations.has(
          receiptCopy.destinationRelativePath,
        )
      ) {
        continue;
      }

      if (!(await verifyExistingCopy(receiptCopy))) {
        blockedItems.push({
          kind: "copy",
          sourceRelativePath: receiptCopy.sourceRelativePath,
          destinationRelativePath: receiptCopy.destinationRelativePath,
          mediaKind: receiptCopy.mediaKind,
          sizeBytes: receiptCopy.bytes,
          sha256: receiptCopy.sourceSha256,
          logicalRoles: receiptCopy.logicalRoles,
          action: "blocked",
          reason:
            "An existing Library asset that is outside this ingest candidate no longer matches its ingest receipt.",
        });
        continue;
      }

      preservedCopyItems.push({
        kind: "copy",
        sourceRelativePath: receiptCopy.sourceRelativePath,
        destinationRelativePath: receiptCopy.destinationRelativePath,
        mediaKind: receiptCopy.mediaKind,
        sizeBytes: receiptCopy.bytes,
        sha256: receiptCopy.sourceSha256,
        logicalRoles: receiptCopy.logicalRoles,
        action: "preserve",
        reason:
          "This verified existing Library asset is outside the current ingest candidate and will be preserved unchanged.",
      });
      accountedDestinations.add(
        receiptCopy.destinationRelativePath,
      );
    }
  }

  const documents: PreparedDocument[] = [];
  const documentItems: IngestBuildPlanItem[] = [];
  const preservedDocumentPaths = new Set<string>();

  if (!existingReceipt) {
    for (const document of [
      ...generatedDocuments,
      ...videoDocuments,
    ]) {
      documents.push({
        ...document,
        writeAction: "create",
      });
      documentItems.push({
        kind: "toml",
        destinationRelativePath:
          document.relativePath,
        action: "create",
        reason:
          "A parse-validated metadata template will be created.",
      });
    }
  } else {
    const newTracks = tracks.filter(
      (track) => !track.existingTrack,
    );

    for (const track of newTracks) {
      const trackPrefix = `${track.relativePath}/`;

      for (const document of generatedDocuments) {
        if (
          !document.relativePath.startsWith(
            trackPrefix,
          )
        ) {
          continue;
        }

        documents.push({
          ...document,
          writeAction: "create",
        });
        documentItems.push({
          kind: "toml",
          destinationRelativePath:
            document.relativePath,
          action: "add",
          adjustment:
            `New track ${track.draft.trackNumber}`,
          reason:
            "A starter metadata document will be added for the new track.",
        });
      }
    }

    for (const document of videoDocuments) {
      documents.push({
        ...document,
        writeAction: "create",
      });
      documentItems.push({
        kind: "toml",
        destinationRelativePath: document.relativePath,
        action: "add",
        adjustment: "New canonical video metadata",
        reason:
          "A parse-validated video.toml document will be added beside the canonical video master.",
      });
    }

    for (const video of videos.filter((item) => item.existingVideo)) {
      const relativePath = `${video.relativePath}/video.toml`;
      const target = assertPathWithinRoot(
        releasePath,
        path.join(
          releasePath,
          ...withinReleasePath(
            releaseRelativePath,
            relativePath,
          ).split("/"),
        ),
      );
      if (await pathExists(target)) {
        preservedDocumentPaths.add(relativePath);
      } else {
        blockedItems.push({
          kind: "toml",
          destinationRelativePath: relativePath,
          action: "blocked",
          reason:
            "An existing receipt video is missing video.toml. Repair the canonical Library video metadata before updating the release.",
        });
      }
    }

    const releaseTomlPath =
      `${releaseRelativePath}/release.toml`;
    const releaseToml =
      await readTomlRecordForUpdate(
        releasePath,
        releaseRelativePath,
        releaseTomlPath,
      );
    const previousTrackTotal =
      readNestedRecordValue(
        releaseToml.data,
        [
          "release",
          "numbering",
          "track_total",
        ],
      );
    const releaseArtworkUpdates =
      releaseArtworkAssignments(artworkPlacements);
    const releaseFrontArtwork =
      releaseArtworkUpdates.find(
        ({ assignment }) => assignment.role === "front_cover",
      );
    let releaseTomlChanged = false;
    const releaseTomlAdjustments: string[] = [];

    if (previousTrackTotal !== tracks.length) {
      setNestedRecordValue(
        releaseToml.data,
        ["release", "numbering"],
        "track_total",
        tracks.length,
      );
      releaseTomlChanged = true;
      releaseTomlAdjustments.push(
        `Track total ${String(previousTrackTotal ?? "unknown")} → ${tracks.length}`,
      );
    }

    if (releaseArtworkUpdates.length > 0) {
      let artworkRecords = readNestedRecordValue(
        releaseToml.data,
        ["release", "artwork"],
      );
      let artworkRecordsChanged = false;
      let hasPrimaryArtwork =
        Array.isArray(artworkRecords) &&
        artworkRecords.some(
          (item) => isRecord(item) && item.primary === true,
        );

      for (const { placement, assignment } of releaseArtworkUpdates) {
        const primary =
          assignment.role === "front_cover" ||
          (!hasPrimaryArtwork && !releaseFrontArtwork);
        const mergedArtwork = mergeArtworkRecord(
          artworkRecords,
          assignment,
          placement.destinationRelativePath,
          primary,
        );
        artworkRecords = mergedArtwork.value;
        artworkRecordsChanged ||= mergedArtwork.changed;
        hasPrimaryArtwork ||= primary;

        if (mergedArtwork.changed) {
          releaseTomlAdjustments.push(
            `${assignment.role} artwork → ${placement.destinationRelativePath}`,
          );
        }
      }

      if (artworkRecordsChanged) {
        setNestedRecordValue(
          releaseToml.data,
          ["release"],
          "artwork",
          artworkRecords,
        );
        releaseTomlChanged = true;
      }
    }

    if (releaseTomlChanged) {
      documents.push({
        storageRole: "release",
        filename: "release.toml",
        relativePath: releaseTomlPath,
        content: stringifyValidatedToml(
          releaseToml.data,
        ),
        validated: true,
        writeAction: "replace",
      });
      documentItems.push({
        kind: "toml",
        destinationRelativePath:
          releaseTomlPath,
        action: "update",
        adjustment: releaseTomlAdjustments.join(" · "),
        reason:
          "Only reviewed release numbering/artwork references are synchronized; unrelated authored release metadata is retained.",
      });
    } else {
      preservedDocumentPaths.add(
        releaseTomlPath,
      );
    }

    const releaseSettingsPath =
      `${releaseRelativePath}/release-settings.toml`;
    const releaseSettingsTarget = assertPathWithinRoot(
      releasePath,
      path.join(releasePath, "release-settings.toml"),
    );
    if (await pathExists(releaseSettingsTarget)) {
      if (releaseFrontArtwork) {
        const releaseSettings =
          await readTomlRecordForUpdate(
            releasePath,
            releaseRelativePath,
            releaseSettingsPath,
          );
        const previousFallback = readNestedRecordValue(
          releaseSettings.data,
          [
            "settings",
            "inheritance",
            "release_artwork_fallback_path",
          ],
        );
        const nextFallback =
          releaseFrontArtwork.placement.destinationRelativePath;

        if (previousFallback !== nextFallback) {
          setNestedRecordValue(
            releaseSettings.data,
            ["settings", "inheritance"],
            "release_artwork_fallback_path",
            nextFallback,
          );
          documents.push({
            storageRole: "release",
            filename: "release-settings.toml",
            relativePath: releaseSettingsPath,
            content: stringifyValidatedToml(
              releaseSettings.data,
            ),
            validated: true,
            writeAction: "replace",
          });
          documentItems.push({
            kind: "toml",
            destinationRelativePath: releaseSettingsPath,
            action: "update",
            adjustment: `Release artwork fallback → ${nextFallback}`,
            reason:
              "The release artwork fallback follows the reviewed canonical front-artwork revision while unrelated settings remain authored and intact.",
          });
        } else {
          preservedDocumentPaths.add(releaseSettingsPath);
        }
      } else {
        preservedDocumentPaths.add(releaseSettingsPath);
      }
    }

    for (const track of tracks.filter(
      (candidate) => candidate.existingTrack,
    )) {
      const trackTomlPath =
        `${track.relativePath}/track.toml`;
      const trackToml =
        await readTomlRecordForUpdate(
          releasePath,
          releaseRelativePath,
          trackTomlPath,
        );
      const previousTrackNumber =
        readNestedRecordValue(
          trackToml.data,
          [
            "track",
            "numbering",
            "track_number",
          ],
        );
      const previousTrackTotalValue =
        readNestedRecordValue(
          trackToml.data,
          [
            "track",
            "numbering",
            "track_total",
          ],
        );
      const numberChanged =
        previousTrackNumber !==
          track.draft.trackNumber;
      const totalChanged =
        previousTrackTotalValue !==
          tracks.length;
      const previousAudioDestination =
        path.posix.basename(
          track.existingTrack!.destinationRelativePath,
        );
      const audioDestinationChanged =
        Boolean(track.replacement) &&
        previousAudioDestination !==
          track.audioDestination;
      const trackArtworkUpdates =
        trackArtworkAssignments(
          artworkPlacements,
          track.draft.sourceRelativePath,
        );
      const trackFrontArtwork =
        trackArtworkUpdates.find(
          ({ assignment }) =>
            assignment.role === "front_cover" ||
            assignment.role === "track_artwork",
        );
      let artworkChanged = false;
      let nextArtworkMasterPath = "";

      if (trackFrontArtwork) {
        nextArtworkMasterPath =
          relativeArtworkPathForTrack(
            track,
            releaseRelativePath,
            trackFrontArtwork.placement.destinationRelativePath,
          );
        const previousArtworkAsset =
          readNestedRecordValue(
            trackToml.data,
            ["track", "assets", "artwork"],
          );
        const previousArtworkMaster =
          isRecord(previousArtworkAsset)
            ? previousArtworkAsset.master
            : undefined;

        if (previousArtworkMaster !== nextArtworkMasterPath) {
          setNestedRecordValue(
            trackToml.data,
            ["track", "assets"],
            "artwork",
            {
              ...(isRecord(previousArtworkAsset)
                ? previousArtworkAsset
                : {}),
              master: nextArtworkMasterPath,
            },
          );
          artworkChanged = true;
        }

      }

      if (trackArtworkUpdates.length > 0) {
        let artworkRecords = readNestedRecordValue(
          trackToml.data,
          ["track", "artwork"],
        );
        let hasPrimaryArtwork =
          Array.isArray(artworkRecords) &&
          artworkRecords.some(
            (item) => isRecord(item) && item.primary === true,
          );

        for (const { placement, assignment } of trackArtworkUpdates) {
          const masterPath = relativeArtworkPathForTrack(
            track,
            releaseRelativePath,
            placement.destinationRelativePath,
          );
          const primary =
            assignment.role === "front_cover" ||
            assignment.role === "track_artwork" ||
            (!hasPrimaryArtwork && !trackFrontArtwork);
          const mergedArtwork = mergeArtworkRecord(
            artworkRecords,
            assignment,
            masterPath,
            primary,
          );
          artworkRecords = mergedArtwork.value;
          artworkChanged ||= mergedArtwork.changed;
          hasPrimaryArtwork ||= primary;
        }

        if (artworkChanged) {
          setNestedRecordValue(
            trackToml.data,
            ["track"],
            "artwork",
            artworkRecords,
          );
        }
      }

      if (
        numberChanged ||
        totalChanged ||
        audioDestinationChanged ||
        artworkChanged
      ) {
        setNestedRecordValue(
          trackToml.data,
          ["track", "numbering"],
          "track_number",
          track.draft.trackNumber,
        );
        setNestedRecordValue(
          trackToml.data,
          ["track", "numbering"],
          "track_total",
          tracks.length,
        );
        if (audioDestinationChanged) {
          setNestedRecordValue(
            trackToml.data,
            ["track", "assets"],
            "audio_playback",
            track.audioDestination,
          );
        }
        documents.push({
          storageRole: "track",
          filename: "track.toml",
          relativePath: trackTomlPath,
          content: stringifyValidatedToml(
            trackToml.data,
          ),
          validated: true,
          writeAction: "replace",
        });
        documentItems.push({
          kind: "toml",
          destinationRelativePath:
            trackTomlPath,
          action: numberChanged
            ? "reorder"
            : "update",
          adjustment: numberChanged
            ? `Track ${String(previousTrackNumber ?? track.existingTrack?.number ?? "?")} → ${track.draft.trackNumber}`
            : audioDestinationChanged
              ? `Canonical audio ${previousAudioDestination} → ${track.audioDestination}`
              : artworkChanged
                ? nextArtworkMasterPath
                  ? `Front artwork → ${nextArtworkMasterPath}`
                  : "Artwork assignments updated"
                : `Track total ${String(previousTrackTotalValue ?? "unknown")} → ${tracks.length}`,
          reason: audioDestinationChanged
            ? "The canonical-audio path will follow the reviewed replacement while all unrelated authored track metadata is retained."
            : artworkChanged
              ? "The reviewed canonical track-artwork reference will be synchronized while unrelated authored track metadata is retained."
              : "Only track numbering fields will change; the track directory ID and all other authored metadata are retained.",
        });
      } else {
        preservedDocumentPaths.add(
          trackTomlPath,
        );
      }

      for (const filename of [
        "track-credits.toml",
        "track-production-notes.toml",
      ]) {
        const relativePath =
          `${track.relativePath}/${filename}`;
        const target = assertPathWithinRoot(
          releasePath,
          path.join(
            releasePath,
            ...withinReleasePath(
              releaseRelativePath,
              relativePath,
            ).split("/"),
          ),
        );

        if (await pathExists(target)) {
          preservedDocumentPaths.add(
            relativePath,
          );
        }
      }
    }

    for (const filename of [
      "release-production-notes.toml",
    ]) {
      const relativePath =
        `${releaseRelativePath}/${filename}`;
      const target = assertPathWithinRoot(
        releasePath,
        path.join(releasePath, filename),
      );

      if (await pathExists(target)) {
        preservedDocumentPaths.add(
          relativePath,
        );
      }
    }

    for (const relativePath of preservedDocumentPaths) {
      documentItems.push({
        kind: "toml",
        destinationRelativePath:
          relativePath,
        action: "preserve",
        reason:
          "The existing authored metadata file will be copied into the temporary update workspace unchanged.",
      });
    }
  }

  const destinationSet = new Set<string>();

  for (const destination of [
    ...copies.map(
      (copy) =>
        copy.destinationRelativePath,
    ),
    ...documents
      .filter(
        (document) =>
          document.writeAction === "create",
      )
      .map(
        (document) =>
          document.relativePath,
      ),
  ]) {
    if (destinationSet.has(destination)) {
      throw new Error(
        `Duplicate planned destination: ${destination}`,
      );
    }

    destinationSet.add(destination);
  }

  const items: IngestBuildPlanItem[] = [
    {
      kind: "directory",
      destinationRelativePath:
        releaseRelativePath,
      action: operation === "create"
        ? "create"
        : "preserve",
      reason: operation === "create"
        ? "A fresh release directory will be created."
        : "The existing release will be copied into an isolated temporary update workspace before changes are applied.",
    },
    ...tracks.map(
      (track): IngestBuildPlanItem => ({
        kind: "directory",
        destinationRelativePath:
          track.relativePath,
        action: track.existingTrack
          ? "preserve"
          : operation === "create"
            ? "create"
            : "add",
        adjustment: track.existingTrack
          ? `Stable ID: ${track.id}`
          : `New track ${track.draft.trackNumber}`,
        reason: track.existingTrack
          ? "The existing track directory and stable ID will be retained even when its track number changes."
          : "A new track directory will be added.",
      }),
    ),
    ...videos.map(
      (video): IngestBuildPlanItem => ({
        kind: "directory",
        destinationRelativePath: video.relativePath,
        action: video.existingVideo
          ? "preserve"
          : operation === "create"
            ? "create"
            : "add",
        adjustment: video.existingVideo
          ? `Stable video ID: ${video.id}`
          : `New video: ${video.draft.title}`,
        reason: video.existingVideo
          ? "The existing canonical video directory and stable ID will be retained."
          : "A release-scoped canonical video directory will be added.",
      }),
    ),
    ...preservedCopyItems,
    ...preservedCopies.map(
      (copy): IngestBuildPlanItem => ({
        kind: "copy",
        sourceRelativePath:
          copy.sourceRelativePath,
        destinationRelativePath:
          copy.destinationRelativePath,
        mediaKind: copy.mediaKind,
        sizeBytes: copy.bytes,
        sha256: copy.sha256,
        logicalRoles:
          copy.logicalRoles,
        action: "preserve",
        reason:
          "The existing verified staging copy matches the ingest receipt and will not be recopied or replaced.",
      }),
    ),
    ...copies.map(
      (copy): IngestBuildPlanItem => ({
        kind: "copy",
        sourceRelativePath:
          copy.sourceRelativePath,
        destinationRelativePath:
          copy.destinationRelativePath,
        mediaKind: copy.mediaKind,
        sizeBytes: copy.bytes,
        sha256: copy.sha256,
        logicalRoles:
          copy.logicalRoles,
        action: operation === "create"
          ? "create"
          : copy.writeAction === "replace"
            ? "update"
            : "add",
        adjustment: copy.writeAction === "replace"
          ? copy.mediaKind === "image"
            ? "Explicit canonical-artwork replacement"
            : copy.mediaKind === "video"
              ? "Explicit canonical-video replacement"
              : "Explicit canonical-audio replacement"
          : copy.mediaKind === "video"
            ? "Canonical video master"
            : undefined,
        reason: copy.writeAction === "replace"
          ? copy.mediaKind === "image"
            ? "The reviewed ingest artwork will replace the verified canonical Library artwork target after explicit confirmation."
            : copy.mediaKind === "video"
              ? "The reviewed ingest video will replace the verified canonical Library video master."
              : "The reviewed ingest source will replace the verified canonical Library master while preserving the stable track identity."
          : copy.mediaKind === "video"
            ? "Video source bytes will be copied and hash-verified without transcoding or changing the ingest source."
            : "Source bytes will be copied and hash-verified without changing the ingest source.",
      }),
    ),
    ...removals.map(
      (removal): IngestBuildPlanItem => ({
        kind: "copy",
        destinationRelativePath:
          removal.destinationRelativePath,
        action: "remove",
        reason: removal.reason,
      }),
    ),
    ...documentItems,
    ...blockedItems,
    {
      kind: "receipt",
      destinationRelativePath:
        `${releaseRelativePath}/ingest-receipt.json`,
      action: operation === "create"
        ? "create"
        : "update",
      adjustment: operation === "update"
        ? "Merge new tracks and current order"
        : undefined,
      reason: operation === "create"
        ? "A local source-to-destination audit receipt will be created."
        : "The existing audit receipt will be retained and extended with the incremental update history.",
    },
  ];

  const receiptContent = existingReceipt
    ? buildUpdatedReceiptContent(
        existingReceipt,
        inspection,
        draft,
        releaseRelativePath,
        tracks,
        videos,
        copies,
        new Set(
          copies.flatMap((copy) =>
            copy.replacementOfDestinationRelativePath
              ? [copy.replacementOfDestinationRelativePath]
              : [],
          ),
        ),
      )
    : createReceiptContent(
        inspection,
        draft,
        releaseRelativePath,
        tracks,
        videos,
        copies,
      );
  const preservedFiles = items
    .filter(
      (item) =>
        item.action === "preserve" &&
        item.kind !== "directory",
    )
    .map(
      (item) =>
        item.destinationRelativePath,
    );
  const summary = {
    trackCount: tracks.length,
    videoCount: videos.length,
    addedVideoCount: videos.filter(
      (video) => !video.existingVideo,
    ).length,
    copiedFileCount: copies.length,
    tomlCount: documents.length,
    totalCopyBytes: copies.reduce(
      (total, copy) =>
        total + copy.bytes,
      0,
    ),
    blockedCount: items.filter(
      (item) => item.action === "blocked",
    ).length,
    artworkSourceCount:
      artworkDrafts.length,
    artworkAssignmentCount:
      artworkDrafts.reduce(
        (total, asset) =>
          total +
          asset.artworkAssignments.length,
        0,
      ),
    addedTrackCount: tracks.filter(
      (track) => !track.existingTrack,
    ).length,
    replacedTrackCount: tracks.filter(
      (track) => Boolean(track.replacement),
    ).length,
    reorderedTrackCount: tracks.filter(
      (track) =>
        track.existingTrack &&
        track.existingTrack.number !==
          track.draft.trackNumber,
    ).length,
    updatedFileCount: items.filter(
      (item) =>
        item.action === "update" ||
        item.action === "reorder",
    ).length,
    preservedFileCount: items.filter(
      (item) => item.action === "preserve",
    ).length,
    removedFileCount: removals.length,
  };

  return {
    preview: {
      candidateId: draft.candidateId,
      operation,
      existingReleaseDetected:
        operation === "update",
      releaseId,
      releaseRelativePath,
      outputRootLabel,
      items,
      summary,
      warnings: [],
      notes: operation === "create"
        ? [
            "Source audio is copied byte-for-byte; embedded metadata is not rewritten.",
            "Canonical audio is stored as audio-master.<original-extension> while retaining the source container extension.",
            "No playback derivative is created during Staging. Library playback MP3s and website HLS streams are prepared separately from the canonical Library master.",
            "Probe-verified video is copied byte-for-byte into videos/<stable-id>/video-master.<original-extension> with a companion video.toml; public video streaming derivatives are not generated yet.",
          ]
        : [
            "Existing authored metadata and stable track IDs are preserved. Existing Library tracks omitted from the current ingest candidate remain untouched automatically.",
            "An explicit Replace canonical audio choice may supersede one verified master; generated Library playback MP3, HLS, and waveform derivatives for that track are removed so Prepare release can regenerate them from the new canonical audio.",
            "Track directory IDs remain stable when the displayed track order changes or canonical audio is replaced.",
            "New artwork can be added from a later ingest candidate. Replacing occupied canonical artwork requires explicit confirmation and preserves unrelated authored metadata.",
            "New canonical videos may be added to an existing release and existing verified videos are preserved when absent from the current candidate. Canonical video replacement remains a separate reviewed workflow.",
            "Intentional track removal and general text-sidecar replacement remain separate future workflows.",
          ],
      confirmationPhrase:
        operation === "create"
          ? INGEST_BUILD_CONFIRMATION_PHRASE
          : INGEST_UPDATE_CONFIRMATION_PHRASE,
    },
    operation,
    releasePath,
    releaseRelativePath,
    documents,
    copies,
    removals,
    preservedFiles,
    receiptContent,
  };
}

async function writeTextFile(
  filename: string,
  content: string,
): Promise<void> {
  const handle = await open(
    filename,
    "wx",
    0o600,
  );

  try {
    await handle.writeFile(
      content,
      "utf8",
    );
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function writeTextFileReplacing(
  filename: string,
  content: string,
): Promise<void> {
  const temporaryPath =
    `${filename}.${randomUUID()}.tmp`;
  let temporaryCreated = false;

  try {
    const handle = await open(
      temporaryPath,
      "wx",
      0o600,
    );
    temporaryCreated = true;

    try {
      await handle.writeFile(content, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }

    await rename(temporaryPath, filename);
    temporaryCreated = false;
  } finally {
    if (temporaryCreated) {
      await unlink(temporaryPath).catch(
        () => undefined,
      );
    }
  }
}

async function syncCopiedFile(
  filename: string,
): Promise<void> {
  const handle = await open(filename, "r");

  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function executePreparedCopy(
  stagingRoot: string,
  copy: PreparedCopy,
): Promise<IngestBuildCopyReceipt> {
  const destinationPath =
    assertPathWithinRoot(
      stagingRoot,
      path.join(
        stagingRoot,
        ...copy.destinationWithinRelease.split(
          "/",
        ),
      ),
    );
  if (
    copy.writeAction === "replace" &&
    await pathExists(destinationPath)
  ) {
    const destinationStats = await lstat(
      destinationPath,
    );
    if (
      destinationStats.isSymbolicLink() ||
      !destinationStats.isFile()
    ) {
      throw new Error(
        `Refusing to replace a non-regular Library file: ${copy.destinationRelativePath}`,
      );
    }
    await unlink(destinationPath);
  }

  const sourceBefore = await lstat(
    copy.sourcePath,
  );
  const sourceHashBefore =
    await sha256File(copy.sourcePath);
  let payloadHash = sourceHashBefore;
  let payloadBytes = sourceBefore.size;

  if (copy.embeddedArtwork) {
    if (
      sourceBefore.size !== copy.embeddedArtwork.containerBytes ||
      sourceHashBefore !== copy.embeddedArtwork.containerSha256 ||
      sourceBefore.mtimeMs !== copy.embeddedArtwork.containerMtimeMs
    ) {
      throw new Error(
        `Source changed before embedded artwork extraction: ${copy.sourceRelativePath}`,
      );
    }
    const extracted = await extractEmbeddedArtwork(
      copy.sourcePath,
      copy.embeddedArtwork.streamIndex,
      copy.embeddedArtwork.codecName,
    );
    payloadBytes = extracted.bytes.length;
    payloadHash = createHash("sha256")
      .update(extracted.bytes)
      .digest("hex");
    if (
      payloadBytes !== copy.bytes ||
      payloadHash !== copy.sha256
    ) {
      throw new Error(
        `Embedded artwork changed before copy: ${copy.sourceRelativePath}`,
      );
    }
    await mkdir(path.dirname(destinationPath), {
      recursive: true,
    });
    await writeFile(
      destinationPath,
      extracted.bytes,
      { flag: "wx" },
    );
  } else {
    if (
      sourceBefore.size !== copy.bytes ||
      sourceHashBefore !== copy.sha256
    ) {
      throw new Error(
        `Source changed before copy: ${copy.sourceRelativePath}`,
      );
    }
    await mkdir(path.dirname(destinationPath), {
      recursive: true,
    });
    await copyFile(
      copy.sourcePath,
      destinationPath,
      fsConstants.COPYFILE_EXCL,
    );
  }
  await syncCopiedFile(destinationPath);

  const [
    destinationHash,
    sourceHashAfter,
    sourceAfter,
  ] = await Promise.all([
    sha256File(destinationPath),
    sha256File(copy.sourcePath),
    lstat(copy.sourcePath),
  ]);

  if (
    destinationHash !== payloadHash ||
    sourceHashAfter !== sourceHashBefore ||
    sourceAfter.size !== sourceBefore.size ||
    sourceAfter.mtimeMs !== sourceBefore.mtimeMs
  ) {
    throw new Error(
      `Source or destination verification failed: ${copy.sourceRelativePath}`,
    );
  }

  return {
    sourceRelativePath:
      copy.sourceRelativePath,
    destinationRelativePath:
      copy.destinationRelativePath,
    mediaKind: copy.mediaKind,
    logicalRoles: copy.logicalRoles,
    bytes: payloadBytes,
    sourceSha256: payloadHash,
    destinationSha256:
      destinationHash,
  };
}

export async function executeIngestReleaseBuild(
  ingestRoot: string,
  outputRoot: string,
  inspection: IngestCandidateInspection,
  draft: IngestBuildDraft,
  confirmation: string,
  outputRootLabel =
    process.env.INGEST_OUTPUT_ROOT ??
    defaultIngestOutputRoot,
): Promise<IngestBuildResult> {
  const prepared =
    await prepareIngestReleaseBuild(
      ingestRoot,
      outputRoot,
      inspection,
      draft,
      outputRootLabel,
    );
  const expectedConfirmation =
    prepared.preview.confirmationPhrase;

  if (confirmation !== expectedConfirmation) {
    throw new Error(
      `Confirmation must exactly match ${expectedConfirmation}.`,
    );
  }

  if (
    prepared.preview.summary.blockedCount > 0
  ) {
    throw new Error(
      prepared.operation === "create"
        ? "The staging release cannot be created because one or more destinations are blocked."
        : "The staging release cannot be updated because one or more changes are blocked.",
    );
  }

  const canonicalOutputRoot =
    await realpath(outputRoot);
  const releasesRoot =
    assertPathWithinRoot(
      canonicalOutputRoot,
      path.join(
        canonicalOutputRoot,
        "releases",
      ),
    );

  await mkdir(releasesRoot, {
    recursive: true,
  });

  const canonicalReleasesRoot =
    await realpath(releasesRoot);
  const lockPath = assertPathWithinRoot(
    canonicalReleasesRoot,
    path.join(
      canonicalReleasesRoot,
      `.${draft.releaseId}.ingest.lock`,
    ),
  );
  const lock = await open(
    lockPath,
    "wx",
    0o600,
  );
  const operationId = randomUUID();
  const stagingPath = assertPathWithinRoot(
    canonicalReleasesRoot,
    path.join(
      canonicalReleasesRoot,
      `.${draft.releaseId}.${operationId}.ingest-tmp`,
    ),
  );
  const backupPath = assertPathWithinRoot(
    canonicalReleasesRoot,
    path.join(
      canonicalReleasesRoot,
      `.${draft.releaseId}.${operationId}.ingest-backup`,
    ),
  );
  let stagingCreated = false;
  let backupCreated = false;

  try {
    await lock.writeFile(
      `${process.pid}\n`,
      "utf8",
    );
    await lock.sync();

    const targetExists = await pathExists(
      prepared.releasePath,
    );

    if (
      prepared.operation === "create" &&
      targetExists
    ) {
      throw new Error(
        `Refusing to overwrite existing release: ${prepared.releaseRelativePath}`,
      );
    }

    if (
      prepared.operation === "update" &&
      !targetExists
    ) {
      throw new Error(
        `The staging release disappeared before the update could begin: ${prepared.releaseRelativePath}`,
      );
    }

    if (prepared.operation === "create") {
      await mkdir(stagingPath, {
        recursive: false,
        mode: 0o700,
      });
      stagingCreated = true;
    } else {
      await assertSafeReleaseTree(
        prepared.releasePath,
      );
      await cp(
        prepared.releasePath,
        stagingPath,
        {
          recursive: true,
          force: false,
          errorOnExist: true,
          preserveTimestamps: true,
        },
      );
      stagingCreated = true;
    }

    const removedFiles: string[] = [];
    const receipts: IngestBuildCopyReceipt[] =
      [];

    for (const copy of prepared.copies) {
      receipts.push(
        await executePreparedCopy(
          stagingPath,
          copy,
        ),
      );
    }

    for (const removal of prepared.removals) {
      const target = assertPathWithinRoot(
        stagingPath,
        path.join(
          stagingPath,
          ...removal.destinationWithinRelease.split("/"),
        ),
      );

      if (!(await pathExists(target))) {
        continue;
      }

      const stats = await lstat(target);
      if (stats.isSymbolicLink()) {
        throw new Error(
          `Refusing to remove a symlinked Library asset: ${removal.destinationRelativePath}`,
        );
      }

      await rm(target, {
        recursive: stats.isDirectory(),
        force: false,
      });
      removedFiles.push(
        removal.destinationRelativePath,
      );
    }

    for (const document of prepared.documents) {
      if (!document.validated) {
        throw new Error(
          `Generated TOML was not validated: ${document.relativePath}`,
        );
      }

      parse(document.content);

      const withinRelease =
        withinReleasePath(
          prepared.releaseRelativePath,
          document.relativePath,
        );
      const target = assertPathWithinRoot(
        stagingPath,
        path.join(
          stagingPath,
          ...withinRelease.split("/"),
        ),
      );

      await mkdir(path.dirname(target), {
        recursive: true,
      });

      if (document.writeAction === "create") {
        await writeTextFile(
          target,
          document.content,
        );
      } else {
        await writeTextFileReplacing(
          target,
          document.content,
        );
      }
    }

    const receipt = JSON.parse(
      prepared.receiptContent,
    ) as Record<string, unknown>;
    const previousCopyReceipts =
      prepared.operation === "update" &&
      Array.isArray(receipt.copyReceipts)
        ? receipt.copyReceipts
        : [];

    receipt.completedAt =
      new Date().toISOString();
    receipt.copyReceipts = [
      ...previousCopyReceipts,
      ...receipts,
    ];

    const receiptPath = assertPathWithinRoot(
      stagingPath,
      path.join(
        stagingPath,
        "ingest-receipt.json",
      ),
    );
    const receiptText = `${JSON.stringify(
      receipt,
      null,
      2,
    )}\n`;

    if (prepared.operation === "create") {
      await writeTextFile(
        receiptPath,
        receiptText,
      );
    } else {
      await writeTextFileReplacing(
        receiptPath,
        receiptText,
      );
    }

    if (prepared.operation === "create") {
      if (
        await pathExists(prepared.releasePath)
      ) {
        throw new Error(
          `Refusing to publish over existing release: ${prepared.releaseRelativePath}`,
        );
      }

      await rename(
        stagingPath,
        prepared.releasePath,
      );
      stagingCreated = false;
    } else {
      if (
        !(await pathExists(prepared.releasePath))
      ) {
        throw new Error(
          `The staging release disappeared before promotion: ${prepared.releaseRelativePath}`,
        );
      }

      await rename(
        prepared.releasePath,
        backupPath,
      );
      backupCreated = true;

      try {
        await rename(
          stagingPath,
          prepared.releasePath,
        );
        stagingCreated = false;
      } catch (error) {
        await rename(
          backupPath,
          prepared.releasePath,
        ).catch(() => undefined);
        backupCreated = false;
        throw error;
      }

      await rm(backupPath, {
        recursive: true,
        force: true,
      });
      backupCreated = false;
    }

    const createdFiles = [
      ...prepared.copies
        .filter((copy) => copy.writeAction === "create")
        .map(
          (copy) =>
            copy.destinationRelativePath,
        ),
      ...prepared.documents
        .filter(
          (document) =>
            document.writeAction === "create",
        )
        .map(
          (document) =>
            document.relativePath,
        ),
      ...(prepared.operation === "create"
        ? [
            `${prepared.releaseRelativePath}/ingest-receipt.json`,
          ]
        : []),
    ];
    const updatedFiles = [
      ...prepared.copies
        .filter((copy) => copy.writeAction === "replace")
        .map(
          (copy) => copy.destinationRelativePath,
        ),
      ...prepared.documents
        .filter(
          (document) =>
            document.writeAction === "replace",
        )
        .map(
          (document) =>
            document.relativePath,
        ),
      ...(prepared.operation === "update"
        ? [
            `${prepared.releaseRelativePath}/ingest-receipt.json`,
          ]
        : []),
    ];

    return {
      candidateId: draft.candidateId,
      operation: prepared.operation,
      releaseId: draft.releaseId,
      releaseRelativePath:
        prepared.releaseRelativePath,
      createdFiles,
      updatedFiles,
      preservedFiles:
        prepared.preservedFiles,
      removedFiles,
      receipts,
      completedAt:
        String(receipt.completedAt),
    };
  } finally {
    await lock.close().catch(
      () => undefined,
    );
    await unlink(lockPath).catch(
      () => undefined,
    );

    if (stagingCreated) {
      await rm(stagingPath, {
        recursive: true,
        force: true,
      }).catch(() => undefined);
    }

    if (backupCreated) {
      if (
        !(await pathExists(
          prepared.releasePath,
        ))
      ) {
        await rename(
          backupPath,
          prepared.releasePath,
        ).catch(() => undefined);
      } else {
        await rm(backupPath, {
          recursive: true,
          force: true,
        }).catch(() => undefined);
      }
    }
  }
}
