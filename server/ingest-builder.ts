import {
  constants as fsConstants,
  createReadStream,
} from "node:fs";
import {
  access,
  copyFile,
  lstat,
  mkdir,
  open,
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
  INGEST_BUILD_CONFIRMATION_PHRASE,
  slugifyIngestValue,
  type IngestBuildAssetDraft,
  type IngestBuildCopyReceipt,
  type IngestBuildDraft,
  type IngestBuildPlanItem,
  type IngestBuildPreview,
  type IngestBuildResult,
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

type PreparedIngestBuild = {
  preview: IngestBuildPreview;
  releasePath: string;
  releaseRelativePath: string;
  documents: GeneratedMetadataDocument[];
  copies: PreparedCopy[];
  receiptContent: string;
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

  return {
    sourceRelativePath: requireString(
      value.sourceRelativePath,
      `Asset ${index + 1} source path`,
      1000,
    ),
    include: requireBoolean(
      value.include,
      `Asset ${index + 1} include`,
    ),
    mediaKind: value.mediaKind,
    destinationRelativePath: requireString(
      value.destinationRelativePath,
      `Asset ${index + 1} destination path`,
      1000,
    ),
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

function syntheticReleaseScan(
  releaseId: string,
  releaseRelativePath: string,
  tracks: Array<{
    draft: IngestBuildTrackDraft;
    id: string;
    relativePath: string;
    audioDestination: string;
  }>,
  artworkRelativePath?: string,
): ReleaseScanResult {
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
    artworkMasters: artworkRelativePath
      ? [
          {
            filename: path.posix.basename(
              artworkRelativePath,
            ),
            relativePath:
              `${releaseRelativePath}/${artworkRelativePath}`,
            extension:
              extensionOf(artworkRelativePath),
          },
        ]
      : [],
    tracks: [],
  };

  release.tracks = tracks.map(
    (track): TrackScanResult => ({
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
          extension:
            extensionOf(track.audioDestination),
        },
      ],
      artworkMasters: [],
    }),
  );

  return release;
}

function syntheticMetadataPreview(
  release: ReleaseScanResult,
  draft: IngestBuildDraft,
  tracks: Array<{
    draft: IngestBuildTrackDraft;
    id: string;
    relativePath: string;
    audioDestination: string;
  }>,
  artworkRelativePath?: string,
): LibraryMetadataPreview {
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
      ...(artworkRelativePath
        ? {
            artworkMasterPath: {
              value:
                `${release.relativePath}/${artworkRelativePath}`,
              source:
                "confirmed ingest asset mapping",
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

function customizeGeneratedDocuments(
  documents: GeneratedMetadataDocument[],
  draft: IngestBuildDraft,
  tracks: Array<{
    draft: IngestBuildTrackDraft;
    id: string;
    relativePath: string;
    audioDestination: string;
  }>,
  artworkRelativePath?: string,
): GeneratedMetadataDocument[] {
  const trackByDirectory = new Map(
    tracks.map((track) => [
      track.relativePath,
      track,
    ]),
  );

  return documents.map((document) => {
    const data = parse(
      document.content,
    ) as Record<string, unknown>;

    if (document.filename === "release.toml") {
      setNestedRecordValue(
        data,
        ["release"],
        "type",
        draft.releaseType,
      );
      setNestedRecordValue(
        data,
        ["release", "primary_artist"],
        "name",
        draft.releaseArtist,
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
    }

    if (
      document.filename ===
        "release-settings.toml" &&
      artworkRelativePath
    ) {
      setNestedRecordValue(
        data,
        ["settings", "inheritance"],
        "release_artwork_fallback_path",
        artworkRelativePath,
      );
    }

    const trackDirectory =
      path.posix.dirname(
        document.relativePath,
      );
    const track = trackByDirectory.get(
      trackDirectory,
    );

    if (
      track &&
      document.filename === "track.toml"
    ) {
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
    }

    if (
      track &&
      document.filename ===
        "track-credits.toml"
    ) {
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
      document.filename ===
        "track-production-notes.toml" &&
      track.draft.date
    ) {
      setNestedRecordValue(
        data,
        ["production", "recording"],
        "source_date",
        track.draft.date,
      );
    }

    const content =
      `${stringify(data).trimEnd()}\n`;
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

      const id = trackIdFor(track);

      return {
        draft: track,
        file,
        id,
        relativePath:
          `${releaseRelativePath}/tracks/${id}`,
        audioDestination:
          expectedDestination,
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

      return {
        draft: asset,
        file,
        destinationRelativePath,
      };
    },
  );

  const artworkRelativePath =
    normalizedAssets.find(
      (asset) =>
        asset.file.mediaKind === "image" &&
        asset.destinationRelativePath.startsWith(
          "artwork/front/",
        ),
    )?.destinationRelativePath;

  const release = syntheticReleaseScan(
    releaseId,
    releaseRelativePath,
    tracks,
    artworkRelativePath,
  );
  const generated =
    buildGeneratedTomlPreview(
      release,
      syntheticMetadataPreview(
        release,
        draft,
        tracks,
        artworkRelativePath,
      ),
    );
  const documents =
    customizeGeneratedDocuments(
      generated.documents,
      draft,
      tracks,
      artworkRelativePath,
    );
  const copies: PreparedCopy[] = [];

  for (const track of tracks) {
    copies.push(
      await prepareCopy(
        canonicalIngestRoot,
        track.file,
        `tracks/${track.id}/${track.audioDestination}`,
        `${track.relativePath}/${track.audioDestination}`,
        [
          "audio-master",
          "audio-player-source",
        ],
      ),
    );
  }

  for (const asset of normalizedAssets) {
    copies.push(
      await prepareCopy(
        canonicalIngestRoot,
        asset.file,
        asset.destinationRelativePath,
        `${releaseRelativePath}/${asset.destinationRelativePath}`,
        asset.file.mediaKind === "image"
          ? ["release-artwork-source"]
          : ["imported-text-sidecar"],
      ),
    );
  }

  const destinationSet = new Set<string>();

  for (const destination of [
    ...copies.map(
      (copy) =>
        copy.destinationRelativePath,
    ),
    ...documents.map(
      (document) =>
        document.relativePath,
    ),
    `${releaseRelativePath}/ingest-receipt.json`,
  ]) {
    if (destinationSet.has(destination)) {
      throw new Error(
        `Duplicate planned destination: ${destination}`,
      );
    }

    destinationSet.add(destination);
  }

  const blockedReason = finalExists
    ? "The destination release already exists; ingestion never overwrites a release."
    : "";
  const action = finalExists
    ? ("blocked" as const)
    : ("create" as const);
  const items: IngestBuildPlanItem[] = [
    {
      kind: "directory",
      destinationRelativePath:
        releaseRelativePath,
      action,
      reason:
        blockedReason ||
        "A fresh release directory will be created.",
    },
    ...tracks.map(
      (track): IngestBuildPlanItem => ({
        kind: "directory",
        destinationRelativePath:
          track.relativePath,
        action,
        reason:
          blockedReason ||
          "A fresh track directory will be created.",
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
        action,
        reason:
          blockedReason ||
          "Source bytes will be copied and verified without changing the source.",
      }),
    ),
    ...documents.map(
      (document): IngestBuildPlanItem => ({
        kind: "toml",
        destinationRelativePath:
          document.relativePath,
        action,
        reason:
          blockedReason ||
          "A parse-validated metadata template will be created.",
      }),
    ),
    {
      kind: "receipt",
      destinationRelativePath:
        `${releaseRelativePath}/ingest-receipt.json`,
      action,
      reason:
        blockedReason ||
        "A local source-to-destination audit receipt will be created.",
    },
  ];
  const receiptContent =
    createReceiptContent(
      inspection,
      draft,
      releaseRelativePath,
      tracks,
      copies,
    );

  return {
    preview: {
      candidateId: draft.candidateId,
      releaseId,
      releaseRelativePath,
      outputRootLabel,
      items,
      summary: {
        trackCount: tracks.length,
        copiedFileCount: copies.length,
        tomlCount: documents.length,
        totalCopyBytes: copies.reduce(
          (total, copy) =>
            total + copy.bytes,
          0,
        ),
        blockedCount: finalExists
          ? items.length
          : 0,
      },
      warnings: [
        "Ingestion copies source bytes without rewriting embedded metadata.",
        "Audio sources are renamed to audio-master while retaining their original container extension.",
        "The copied audio master is also referenced as the initial audio-player source; no duplicate derivative is created.",
      ],
      confirmationPhrase:
        INGEST_BUILD_CONFIRMATION_PHRASE,
    },
    releasePath,
    releaseRelativePath,
    documents,
    copies,
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
  if (
    confirmation !==
      INGEST_BUILD_CONFIRMATION_PHRASE
  ) {
    throw new Error(
      `Confirmation must exactly match ${INGEST_BUILD_CONFIRMATION_PHRASE}.`,
    );
  }

  const prepared =
    await prepareIngestReleaseBuild(
      ingestRoot,
      outputRoot,
      inspection,
      draft,
      outputRootLabel,
    );

  if (
    prepared.preview.summary.blockedCount > 0
  ) {
    throw new Error(
      "The staging release cannot be created because one or more destinations are blocked.",
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
  const stagingPath = assertPathWithinRoot(
    canonicalReleasesRoot,
    path.join(
      canonicalReleasesRoot,
      `.${draft.releaseId}.${randomUUID()}.ingest-tmp`,
    ),
  );
  let stagingCreated = false;

  try {
    await lock.writeFile(
      `${process.pid}\n`,
      "utf8",
    );
    await lock.sync();

    if (
      await pathExists(prepared.releasePath)
    ) {
      throw new Error(
        `Refusing to overwrite existing release: ${prepared.releaseRelativePath}`,
      );
    }

    await mkdir(stagingPath, {
      recursive: false,
      mode: 0o700,
    });
    stagingCreated = true;

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
        document.relativePath.slice(
          `${prepared.releaseRelativePath}/`
            .length,
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
      await writeTextFile(
        target,
        document.content,
      );
    }

    const receipt = JSON.parse(
      prepared.receiptContent,
    ) as Record<string, unknown>;

    receipt.completedAt =
      new Date().toISOString();
    receipt.copyReceipts = receipts;

    await writeTextFile(
      assertPathWithinRoot(
        stagingPath,
        path.join(
          stagingPath,
          "ingest-receipt.json",
        ),
      ),
      `${JSON.stringify(
        receipt,
        null,
        2,
      )}\n`,
    );

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

    const createdFiles = [
      ...prepared.copies.map(
        (copy) =>
          copy.destinationRelativePath,
      ),
      ...prepared.documents.map(
        (document) =>
          document.relativePath,
      ),
      `${prepared.releaseRelativePath}/ingest-receipt.json`,
    ];

    return {
      candidateId: draft.candidateId,
      releaseId: draft.releaseId,
      releaseRelativePath:
        prepared.releaseRelativePath,
      createdFiles,
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
  }
}
