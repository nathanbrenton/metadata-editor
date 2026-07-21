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
} from "../shared/ingest-builder.js";
import type {
  IngestCandidateInspection,
  IngestFileInspection,
  IngestMediaKind,
} from "../shared/ingest-types.js";
import {
  assertPathWithinRoot,
} from "./media-root.js";
import {
  assertPathWithinIngestRoot,
} from "./ingest-root.js";
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
  "../demo-media";

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
  sourcePath: string;
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

type PreparedIngestBuild = {
  preview: IngestBuildPreview;
  operation: IngestBuildOperation;
  releasePath: string;
  releaseRelativePath: string;
  documents: PreparedDocument[];
  copies: PreparedCopy[];
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

  return {
    sourceRelativePath: requireString(
      value.sourceRelativePath,
      `Asset ${index + 1} source path`,
      1000,
    ),
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
  existingTrack?: ExistingReceiptTrack;
};

type PreparedArtworkAsset = {
  draft: IngestBuildAssetDraft;
  destinationRelativePath: string;
};

function releaseArtworkAssignments(
  artworkAssets: PreparedArtworkAsset[],
) {
  return artworkAssets.flatMap((asset) =>
    asset.draft.artworkAssignments
      .filter((assignment) => assignment.scope === "release")
      .map((assignment) => ({ asset, assignment })),
  );
}

function trackArtworkAssignments(
  artworkAssets: PreparedArtworkAsset[],
  trackSourceRelativePath: string,
) {
  return artworkAssets.flatMap((asset) =>
    asset.draft.artworkAssignments
      .filter(
        (assignment) =>
          assignment.scope === "track" &&
          assignment.trackSourceRelativePaths.includes(
            trackSourceRelativePath,
          ),
      )
      .map((assignment) => ({ asset, assignment })),
  );
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
  artworkAssets: PreparedArtworkAsset[],
): ReleaseScanResult {
  const releaseArtwork = releaseArtworkAssignments(
    artworkAssets,
  )[0];
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
    artworkMasters: releaseArtwork
      ? [
          {
            filename: path.posix.basename(
              releaseArtwork.asset.destinationRelativePath,
            ),
            relativePath:
              `${releaseRelativePath}/${releaseArtwork.asset.destinationRelativePath}`,
            extension: extensionOf(
              releaseArtwork.asset.destinationRelativePath,
            ),
          },
        ]
      : [],
    tracks: [],
  };

  release.tracks = tracks.map(
    (track): TrackScanResult => {
      const trackArtwork = trackArtworkAssignments(
        artworkAssets,
        track.draft.sourceRelativePath,
      )[0];

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
        artworkMasters: trackArtwork
          ? [
              {
                filename: path.posix.basename(
                  trackArtwork.asset.destinationRelativePath,
                ),
                relativePath:
                  `${releaseRelativePath}/${trackArtwork.asset.destinationRelativePath}`,
                extension: extensionOf(
                  trackArtwork.asset.destinationRelativePath,
                ),
              },
            ]
          : [],
      };
    },
  );

  return release;
}

function syntheticMetadataPreview(
  release: ReleaseScanResult,
  draft: IngestBuildDraft,
  tracks: PreparedIngestTrack[],
  artworkAssets: PreparedArtworkAsset[],
): LibraryMetadataPreview {
  const releaseArtwork = releaseArtworkAssignments(
    artworkAssets,
  )[0];

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
                `${release.relativePath}/${releaseArtwork.asset.destinationRelativePath}`,
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

function customizeGeneratedDocuments(
  documents: GeneratedMetadataDocument[],
  draft: IngestBuildDraft,
  tracks: PreparedIngestTrack[],
  artworkAssets: PreparedArtworkAsset[],
  releaseRelativePath: string,
): GeneratedMetadataDocument[] {
  const trackByDirectory = new Map(
    tracks.map((track) => [track.relativePath, track]),
  );
  const releaseAssignments = releaseArtworkAssignments(
    artworkAssets,
  );

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
          ({ asset, assignment }, index) =>
            artworkRecord(
              assignment.id,
              assignment.role,
              asset.destinationRelativePath,
              index === 0,
            ),
        ),
      );
    }

    if (
      document.filename === "release-settings.toml" &&
      releaseAssignments.length > 0
    ) {
      setNestedRecordValue(
        data,
        ["settings", "inheritance"],
        "release_artwork_fallback_path",
        releaseAssignments[0].asset.destinationRelativePath,
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
        artworkAssets,
        track.draft.sourceRelativePath,
      );
      const firstArtwork = assignments[0];
      setNestedRecordValue(
        data,
        ["track", "assets"],
        "artwork",
        {
          master: firstArtwork
            ? relativeArtworkPathForTrack(
                track,
                releaseRelativePath,
                firstArtwork.asset.destinationRelativePath,
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
        assignments.map(({ asset, assignment }, index) =>
          artworkRecord(
            assignment.id,
            assignment.role,
            relativeArtworkPathForTrack(
              track,
              releaseRelativePath,
              asset.destinationRelativePath,
            ),
            index === 0,
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

  return {
    releaseId,
    exists,
    operation: exists ? "update" : "create",
    releaseRelativePath,
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
    sourcePath: canonicalSource,
    destinationRelativePath,
    destinationWithinRelease,
    mediaKind: file.mediaKind,
    logicalRoles,
    bytes: stats.size,
    sha256: await sha256File(canonicalSource),
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
  copies: PreparedCopy[],
): string {
  return `${JSON.stringify(
    {
      schema: {
        name:
          "metadata-editor-ingest-receipt",
        version: 1,
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
  newCopies: PreparedCopy[],
): string {
  const previousUpdates = Array.isArray(
    existingReceipt.raw.updates,
  )
    ? existingReceipt.raw.updates
    : [];
  const copies = [
    ...existingReceipt.copies.map((copy) => ({
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
        version: 2,
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
      copies,
      updates: [
        ...previousUpdates,
        {
          plannedAt: new Date().toISOString(),
          candidateId: draft.candidateId,
          addedTrackIds: tracks
            .filter((track) => !track.existingTrack)
            .map((track) => track.id),
          trackOrder: tracks.map((track) => ({
            id: track.id,
            number: track.draft.trackNumber,
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

  if (includedTracks.length === 0) {
    throw new Error(
      "At least one audio track must be included.",
    );
  }

  validateUniqueTrackInputs(includedTracks);

  if (existingReceipt) {
    const includedSourcePaths = new Set(
      includedTracks.map(
        (track) => track.sourceRelativePath,
      ),
    );
    const omittedExistingTracks =
      existingReceipt.tracks.filter(
        (track) =>
          !includedSourcePaths.has(
            track.sourceRelativePath,
          ),
      );

    if (omittedExistingTracks.length > 0) {
      throw new Error(
        [
          "Incremental staging updates do not remove existing tracks.",
          "Include every currently staged track, then add or reorder tracks as needed.",
          `Missing from this draft: ${omittedExistingTracks
            .map((track) => track.sourceRelativePath)
            .join(", ")}`,
        ].join(" "),
      );
    }
  }

  const existingTrackBySource = new Map(
    (existingReceipt?.tracks ?? []).map(
      (track) => [
        track.sourceRelativePath,
        track,
      ],
    ),
  );
  const usedTrackIds = new Set(
    existingReceipt?.tracks.map(
      (track) => track.id,
    ) ?? [],
  );

  const tracks = includedTracks.map(
    (track) => {
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

      const existingTrack =
        existingTrackBySource.get(
          track.sourceRelativePath,
        );
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
      const audioDestination = existingTrack
        ? path.posix.basename(
            existingTrack.destinationRelativePath,
          )
        : expectedDestination;

      if (
        existingTrack &&
        (
          relativePath !==
            `${releaseRelativePath}/tracks/${id}` ||
          audioDestination !==
            expectedDestination
        )
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
      };
    },
  );

  const trackIds = new Set<string>();

  for (const track of tracks) {
    if (trackIds.has(track.id)) {
      throw new Error(
        `Generated duplicate track ID: ${track.id}`,
      );
    }
    trackIds.add(track.id);
  }

  const includedAssets = draft.assets.filter(
    (asset) => asset.include,
  );
  const normalizedAssets = includedAssets.map(
    (asset) => {
      const file = fileMap.get(
        asset.sourceRelativePath,
      );

      if (!file) {
        throw new Error(
          `Asset source was not found in the inspected candidate: ${asset.sourceRelativePath}`,
        );
      }

      if (file.mediaKind !== asset.mediaKind) {
        throw new Error(
          `Asset kind changed after inspection: ${asset.sourceRelativePath}`,
        );
      }

      const destinationRelativePath =
        normalizeRelativeDestination(
          asset.destinationRelativePath,
          `${asset.sourceRelativePath} destination`,
        );

      if (
        extensionOf(destinationRelativePath) !==
          extensionOf(file.filename)
      ) {
        throw new Error(
          `${asset.sourceRelativePath}: destination extension must match the source because ingestion does not transcode.`,
        );
      }

      if (file.mediaKind === "image") {
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
        destinationRelativePath,
      };
    },
  );

  const existingCopyBySource = new Map(
    (existingReceipt?.copies ?? []).map(
      (copy) => [
        copy.sourceRelativePath,
        copy,
      ],
    ),
  );

  if (existingReceipt) {
    const newlyIncludedAssets =
      normalizedAssets.filter(
        (asset) =>
          !existingCopyBySource.has(
            asset.draft.sourceRelativePath,
          ),
      );

    if (newlyIncludedAssets.length > 0) {
      throw new Error(
        [
          "This staging-update milestone adds audio tracks and preserves existing sidecars.",
          "Add new artwork or text sidecars in a separate future asset-update workflow.",
          `New sidecars: ${newlyIncludedAssets
            .map((asset) => asset.draft.sourceRelativePath)
            .join(", ")}`,
        ].join(" "),
      );
    }
  }

  const artworkAssets: PreparedArtworkAsset[] =
    normalizedAssets
      .filter((asset) => asset.file.mediaKind === "image")
      .map((asset) => ({
        draft: asset.draft,
        destinationRelativePath:
          asset.destinationRelativePath,
      }));

  const release = syntheticReleaseScan(
    releaseId,
    releaseRelativePath,
    tracks,
    artworkAssets,
  );
  const generated =
    buildGeneratedTomlPreview(
      release,
      syntheticMetadataPreview(
        release,
        draft,
        tracks,
        artworkAssets,
      ),
    );
  const generatedDocuments =
    customizeGeneratedDocuments(
      generated.documents,
      draft,
      tracks,
      artworkAssets,
      releaseRelativePath,
    );
  const copies: PreparedCopy[] = [];
  const preservedCopies: PreparedCopy[] = [];
  const blockedItems: IngestBuildPlanItem[] = [];

  for (const track of tracks) {
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

    const receiptCopy =
      existingCopyBySource.get(
        track.draft.sourceRelativePath,
      );

    if (
      !receiptCopy ||
      receiptCopy.destinationRelativePath !==
        preparedCopy.destinationRelativePath
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
          "The source bytes changed after the original staging build. Incremental updates do not silently replace an existing audio master.",
      });
      continue;
    }

    const stagedDestination = assertPathWithinRoot(
      releasePath,
      path.join(
        releasePath,
        ...withinReleasePath(
          releaseRelativePath,
          preparedCopy.destinationRelativePath,
        ).split("/"),
      ),
    );

    if (
      !(await pathExists(stagedDestination)) ||
      (await sha256File(stagedDestination)) !==
        receiptCopy.sourceSha256
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
          "The staged audio master no longer matches its ingest receipt. Resolve the modified or missing destination before applying an incremental update.",
      });
      continue;
    }

    preservedCopies.push(preparedCopy);
  }

  for (const asset of normalizedAssets) {
    const preparedCopy = await prepareCopy(
      canonicalIngestRoot,
      asset.file,
      asset.destinationRelativePath,
      `${releaseRelativePath}/${asset.destinationRelativePath}`,
      asset.file.mediaKind === "image"
        ? asset.draft.artworkAssignments.map(
            (assignment) =>
              assignment.scope === "release"
                ? `release-artwork:${assignment.role}`
                : `track-artwork:${assignment.role}:${assignment.trackSourceRelativePaths.length}-tracks`,
          )
        : ["imported-text-sidecar"],
    );

    if (!existingReceipt) {
      copies.push(preparedCopy);
      continue;
    }

    const receiptCopy =
      existingCopyBySource.get(
        asset.draft.sourceRelativePath,
      );

    if (
      !receiptCopy ||
      receiptCopy.destinationRelativePath !==
        preparedCopy.destinationRelativePath ||
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
          "Existing staging sidecars are preserved only when their source mapping and bytes still match the ingest receipt.",
      });
      continue;
    }

    preservedCopies.push(preparedCopy);
  }

  const documents: PreparedDocument[] = [];
  const documentItems: IngestBuildPlanItem[] = [];
  const preservedDocumentPaths = new Set<string>();

  if (!existingReceipt) {
    for (const document of generatedDocuments) {
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

    if (previousTrackTotal !== tracks.length) {
      setNestedRecordValue(
        releaseToml.data,
        ["release", "numbering"],
        "track_total",
        tracks.length,
      );
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
        adjustment:
          `Track total ${String(previousTrackTotal ?? "unknown")} → ${tracks.length}`,
        reason:
          "The release track total will be synchronized while all other authored values are retained.",
      });
    } else {
      preservedDocumentPaths.add(
        releaseTomlPath,
      );
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

      if (numberChanged || totalChanged) {
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
            : `Track total ${String(previousTrackTotalValue ?? "unknown")} → ${tracks.length}`,
          reason:
            "Only track numbering fields will change; the track directory ID and all other authored metadata are retained.",
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
      "release-settings.toml",
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
          : "add",
        reason:
          "Source bytes will be copied and hash-verified without changing the ingest source.",
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
        copies,
      )
    : createReceiptContent(
        inspection,
        draft,
        releaseRelativePath,
        tracks,
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
      artworkAssets.length,
    artworkAssignmentCount:
      artworkAssets.reduce(
        (total, asset) =>
          total +
          asset.draft.artworkAssignments.length,
        0,
      ),
    addedTrackCount: tracks.filter(
      (track) => !track.existingTrack,
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
    removedFileCount: 0,
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
      warnings: operation === "create"
        ? [
            "Ingestion copies source bytes without rewriting embedded metadata.",
            "Audio sources are renamed to audio-master while retaining their original container extension.",
            "The copied audio master is also referenced as the initial audio-player source; no duplicate derivative is created.",
          ]
        : [
            "Existing authored metadata is preserved; the update changes only release/track numbering plus starter files for newly added tracks.",
            "Track directory IDs remain stable when the displayed track order changes.",
            "No existing track or file is removed by an incremental staging update.",
            "Playback audio, embedded tags, waveform data, and catalog output may require regeneration after the update.",
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
  const sourceBefore = await lstat(
    copy.sourcePath,
  );
  const sourceHashBefore =
    await sha256File(copy.sourcePath);

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
    destinationHash !== sourceHashBefore ||
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
    bytes: sourceAfter.size,
    sourceSha256: sourceHashAfter,
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
      ...prepared.copies.map(
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
