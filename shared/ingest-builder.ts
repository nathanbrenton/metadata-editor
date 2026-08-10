import type {
  IngestCandidateInspection,
  IngestEvidence,
  IngestFileInspection,
  IngestMediaKind,
} from "./ingest-types.js";

import {
  analyzeIngestStructure,
} from "./ingest-structure-inference.js";
import {
  sidecarSuggestionValue,
} from "./ffmetadata-sidecar.js";

export const INGEST_BUILD_CONFIRMATION_PHRASE =
  "CREATE_STAGING_RELEASE";

export const INGEST_UPDATE_CONFIRMATION_PHRASE =
  "UPDATE_STAGING_RELEASE";

export type IngestBuildOperation =
  | "create"
  | "update";

export type IngestBuildPlanAction =
  | "create"
  | "add"
  | "update"
  | "reorder"
  | "preserve"
  | "remove"
  | "blocked";

export type IngestBuildTrackDraft = {
  sourceRelativePath: string;
  include: boolean;
  trackNumber: number;
  title: string;
  version: string;
  artist: string;
  date: string;
  destinationFilename: string;
  /**
   * Explicitly retarget this ingest source onto an existing stable track.
   * The existing track identity and authored metadata are preserved while
   * its canonical audio is replaced through the reviewed update workflow.
   */
  replacementTrackId?: string;
};

export const ingestVideoTypeOptions = [
  "music_video",
  "live_performance",
  "visualizer",
  "lyric_video",
  "studio_footage",
  "jam_session",
  "interview",
  "promotional",
  "other",
] as const;

export type IngestBuildVideoDraft = {
  sourceRelativePath: string;
  include: boolean;
  /** Stable Library identity. Editing the display title does not rewrite it. */
  videoId: string;
  title: string;
  videoType: string;
  /** Optional semantic relationship; the video remains release-scoped. */
  relatedTrackSourceRelativePath: string;
  destinationFilename: string;
};

export type IngestArtworkAssignmentDraft = {
  id: string;
  scope: "release" | "track";
  role: string;
  trackSourceRelativePaths: string[];
  /**
   * Explicit confirmation that this assignment may supersede an existing
   * canonical Library artwork target during an update. Inferred artwork
   * assignments never set this automatically.
   */
  replaceExisting?: boolean;
};

export const ingestArtworkRoleOptions = [
  "front_cover",
  "back_cover",
  "booklet",
  "disc",
  "liner_notes",
  "artist",
  "track_artwork",
  "thumbnail",
  "alternate",
  "promotional",
  "other",
] as const;

export type IngestEmbeddedArtworkSourceDraft = {
  audioSourceRelativePath: string;
  streamIndex: number;
  codecName?: string;
  extension: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
};

export type IngestBuildAssetDraft = {
  sourceRelativePath: string;
  sourceType?: "file" | "embedded-artwork";
  embeddedArtwork?: IngestEmbeddedArtworkSourceDraft;
  include: boolean;
  mediaKind: Extract<
    IngestMediaKind,
    "image" | "text"
  >;
  destinationRelativePath: string;
  artworkAssignments: IngestArtworkAssignmentDraft[];
};

export function defaultReleaseArtworkAssignment(): IngestArtworkAssignmentDraft {
  return {
    id: "release-front-cover",
    scope: "release",
    role: "front_cover",
    trackSourceRelativePaths: [],
  };
}

export function defaultTrackArtworkAssignment(
  trackSourceRelativePath: string,
): IngestArtworkAssignmentDraft {
  return {
    id: "track-front-cover",
    scope: "track",
    role: "front_cover",
    trackSourceRelativePaths: [
      trackSourceRelativePath,
    ],
  };
}

export function createArtworkAssignmentId(
  assignments: IngestArtworkAssignmentDraft[],
): string {
  const existing = new Set(
    assignments.map((assignment) => assignment.id),
  );
  let index = assignments.length + 1;
  let candidate = `artwork-assignment-${index}`;

  while (existing.has(candidate)) {
    index += 1;
    candidate = `artwork-assignment-${index}`;
  }

  return candidate;
}

export type IngestBuildDraft = {
  candidateId: string;
  releaseId: string;
  releaseTitle: string;
  releaseArtist: string;
  releaseDate: string;
  releaseType: string;
  tracks: IngestBuildTrackDraft[];
  /** Optional on read so stored V1 drafts and older test fixtures remain compatible. */
  videos?: IngestBuildVideoDraft[];
  assets: IngestBuildAssetDraft[];
};

export type IngestBuildPlanItem = {
  kind:
    | "directory"
    | "copy"
    | "toml"
    | "receipt";
  sourceRelativePath?: string;
  destinationRelativePath: string;
  mediaKind?: IngestMediaKind;
  sizeBytes?: number;
  sha256?: string;
  logicalRoles?: string[];
  action: IngestBuildPlanAction;
  reason: string;
  adjustment?: string;
};

export type IngestBuildPreview = {
  candidateId: string;
  operation: IngestBuildOperation;
  existingReleaseDetected: boolean;
  releaseId: string;
  releaseRelativePath: string;
  outputRootLabel: string;
  items: IngestBuildPlanItem[];
  summary: {
    trackCount: number;
    videoCount: number;
    addedVideoCount: number;
    copiedFileCount: number;
    tomlCount: number;
    totalCopyBytes: number;
    blockedCount: number;
    artworkSourceCount: number;
    artworkAssignmentCount: number;
    addedTrackCount: number;
    replacedTrackCount: number;
    reorderedTrackCount: number;
    updatedFileCount: number;
    preservedFileCount: number;
    removedFileCount: number;
  };
  warnings: string[];
  notes: string[];
  confirmationPhrase:
    | typeof INGEST_BUILD_CONFIRMATION_PHRASE
    | typeof INGEST_UPDATE_CONFIRMATION_PHRASE;
};

export type IngestStagingMetadataValue =
  | string
  | number
  | boolean
  | string[];

export type IngestStagingTrackTarget = {
  id: string;
  number: number;
  title: string;
  version: string;
  artist: string;
  sourceDate: string;
  sourceRelativePath: string;
  destinationRelativePath: string;
  metadataValues?: Record<string, IngestStagingMetadataValue>;
};

export type IngestStagingVideoTarget = {
  id: string;
  title: string;
  videoType: string;
  sourceRelativePath: string;
  destinationRelativePath: string;
  relatedTrackId?: string;
};

export type IngestStagingArtworkTarget = {
  sourceRelativePath: string;
  destinationRelativePath: string;
  scope: "release" | "track";
  role: string;
  trackId?: string;
  trackSourceRelativePath?: string;
};

export type IngestStagingTargetStatus = {
  releaseId: string;
  exists: boolean;
  operation: IngestBuildOperation;
  releaseRelativePath: string;
  existingRelease?: {
    title: string;
    artist: string;
    date: string;
    type: string;
    metadataValues?: Record<string, IngestStagingMetadataValue>;
  };
  existingTracks: IngestStagingTrackTarget[];
  existingVideos: IngestStagingVideoTarget[];
  existingArtwork: IngestStagingArtworkTarget[];
};

export type IngestBuildCopyReceipt = {
  sourceRelativePath: string;
  destinationRelativePath: string;
  mediaKind: IngestMediaKind;
  logicalRoles: string[];
  bytes: number;
  sourceSha256: string;
  destinationSha256: string;
};

export type IngestBuildResult = {
  candidateId: string;
  operation: IngestBuildOperation;
  releaseId: string;
  releaseRelativePath: string;
  createdFiles: string[];
  updatedFiles: string[];
  preservedFiles: string[];
  removedFiles: string[];
  receipts: IngestBuildCopyReceipt[];
  completedAt: string;
};

function evidenceValue(
  evidence: IngestEvidence[],
  field: string,
): string | undefined {
  const item = evidence.find(
    (candidate) => candidate.field === field,
  );

  if (
    !item ||
    (typeof item.value !== "string" &&
      typeof item.value !== "number")
  ) {
    return undefined;
  }

  const value = String(item.value).trim();
  return value || undefined;
}

function embeddedValue(
  file: IngestFileInspection,
  keys: string[],
): string | undefined {
  const normalizedKeys = new Set(
    keys.map((key) => key.toLowerCase()),
  );

  const entry = Object.entries(
    file.embeddedMetadata,
  ).find(([key, value]) =>
    normalizedKeys.has(key.toLowerCase()) &&
    value.trim() !== "",
  );

  return entry?.[1].trim();
}

function sharedEmbeddedValue(
  files: IngestFileInspection[],
  keys: string[],
): string | undefined {
  const values = files
    .map((file) => embeddedValue(file, keys))
    .filter(
      (value): value is string =>
        typeof value === "string" &&
        value.trim() !== "",
    );

  if (values.length === 0) {
    return undefined;
  }

  const first = values[0];
  return values.every(
    (value) =>
      value.localeCompare(first, undefined, {
        sensitivity: "base",
      }) === 0,
  )
    ? first
    : undefined;
}

function filenameStem(filename: string): string {
  const separator = filename.lastIndexOf(".");
  return separator > 0
    ? filename.slice(0, separator)
    : filename;
}

function extensionOf(filename: string): string {
  const separator = filename.lastIndexOf(".");
  return separator > 0
    ? filename.slice(separator).toLowerCase()
    : "";
}

export function slugifyIngestValue(
  value: string,
): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
}

/*
 * Release directories follow the canonical YYYY-MM-DD_release-name
 * convention. The title slug remains usable when a date has not yet been
 * established so the draft can still be reviewed without inventing a date.
 */
export function buildReleaseDirectoryId(
  releaseDate: string,
  releaseTitle: string,
): string {
  const releaseSlug =
    slugifyIngestValue(releaseTitle) ||
    "untitled-release";
  const normalizedDate = releaseDate.trim();

  return normalizedDate
    ? `${normalizedDate}_${releaseSlug}`
    : releaseSlug;
}

/*
 * Old saved drafts may contain the earlier date-plus-artist suggestion.
 * Treat that deterministic legacy value as generated, while preserving any
 * unrelated directory ID as an intentional user override.
 */
export function shouldSynchronizeReleaseDirectoryId(
  draft: Pick<
    IngestBuildDraft,
    | "releaseId"
    | "releaseDate"
    | "releaseTitle"
    | "releaseArtist"
  >,
): boolean {
  const currentId = draft.releaseId.trim();
  const generatedId = buildReleaseDirectoryId(
    draft.releaseDate,
    draft.releaseTitle,
  );
  const legacyArtistId = buildReleaseDirectoryId(
    draft.releaseDate,
    draft.releaseArtist,
  );

  return (
    currentId === "" ||
    currentId === generatedId ||
    currentId === legacyArtistId
  );
}

function uniquifyPath(
  proposed: string,
  used: Set<string>,
): string {
  const normalized = proposed.replaceAll("\\", "/");

  if (!used.has(normalized)) {
    used.add(normalized);
    return normalized;
  }

  const slash = normalized.lastIndexOf("/");
  const directory =
    slash >= 0 ? normalized.slice(0, slash + 1) : "";
  const filename =
    slash >= 0 ? normalized.slice(slash + 1) : normalized;
  const dot = filename.lastIndexOf(".");
  const stem = dot > 0
    ? filename.slice(0, dot)
    : filename;
  const extension = dot > 0
    ? filename.slice(dot)
    : "";

  let index = 2;
  let candidate = "";

  do {
    candidate =
      `${directory}${stem}-${index}${extension}`;
    index += 1;
  } while (used.has(candidate));

  used.add(candidate);
  return candidate;
}

function selectedIdentityEvidenceValue(
  inspection: IngestCandidateInspection,
  field: "release.artist" | "release.title",
): string | undefined {
  const selected = inspection.candidate.evidence.find(
    (item) =>
      item.field === field &&
      item.rule.startsWith("selected-"),
  );

  if (!selected) {
    return undefined;
  }

  const value = String(selected.value).trim();
  return value || undefined;
}

function metadataSidecars(
  inspection: IngestCandidateInspection,
): NonNullable<IngestFileInspection["metadataSidecar"]>[] {
  return inspection.files
    .map((file) => file.metadataSidecar)
    .filter(
      (sidecar): sidecar is NonNullable<IngestFileInspection["metadataSidecar"]> =>
        sidecar !== undefined,
    );
}

function sharedSidecarValue(
  inspection: IngestCandidateInspection,
  canonicalPath: string,
): string | number | undefined {
  const values = metadataSidecars(inspection)
    .map((sidecar) =>
      sidecarSuggestionValue(sidecar, canonicalPath),
    )
    .filter(
      (value): value is string | number =>
        value !== undefined && String(value).trim() !== "",
    );

  if (values.length === 0) {
    return undefined;
  }

  const first = String(values[0]).trim();
  return values.every(
    (value) =>
      String(value).trim().localeCompare(first, undefined, {
        sensitivity: "base",
      }) === 0,
  )
    ? values[0]
    : undefined;
}

function pairedSidecar(
  inspection: IngestCandidateInspection,
  file: IngestFileInspection,
): NonNullable<IngestFileInspection["metadataSidecar"]> | undefined {
  const matches = metadataSidecars(inspection).filter(
    (sidecar) => sidecar.pairedAudioRelativePath === file.relativePath,
  );

  return matches.length === 1 ? matches[0] : undefined;
}

function completeDateFromSidecarValue(
  value: string | number | undefined,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = String(value).trim();
  const match = normalized.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/,
  );

  if (!match) {
    return undefined;
  }

  return `${match[1]}-${match[2]}-${match[3]}`;
}

function defaultReleaseTitle(
  inspection: IngestCandidateInspection,
  audioFiles: IngestFileInspection[],
): string {
  return (
    selectedIdentityEvidenceValue(
      inspection,
      "release.title",
    ) ??
    (typeof sharedSidecarValue(inspection, "release.title") === "string"
      ? String(sharedSidecarValue(inspection, "release.title"))
      : undefined) ??
    sharedEmbeddedValue(
      audioFiles,
      ["album", "album_title"],
    ) ??
    evidenceValue(
      inspection.candidate.evidence,
      "release.title",
    ) ??
    inspection.candidate.displayTitle
  );
}

function defaultReleaseArtist(
  inspection: IngestCandidateInspection,
  audioFiles: IngestFileInspection[],
): string {
  return (
    selectedIdentityEvidenceValue(
      inspection,
      "release.artist",
    ) ??
    (typeof sharedSidecarValue(
      inspection,
      "release.primary_artist.name",
    ) === "string"
      ? String(
          sharedSidecarValue(
            inspection,
            "release.primary_artist.name",
          ),
        )
      : undefined) ??
    sharedEmbeddedValue(
      audioFiles,
      [
        "album_artist",
        "albumartist",
        "album artist",
        "artist",
      ],
    ) ??
    evidenceValue(
      inspection.candidate.evidence,
      "release.artist",
    ) ??
    ""
  );
}

function defaultReleaseDate(
  inspection: IngestCandidateInspection,
  audioFiles: IngestFileInspection[],
): string {
  const candidateDate = evidenceValue(
    inspection.candidate.evidence,
    "date",
  );

  if (candidateDate) {
    return candidateDate;
  }

  const sidecarDate = completeDateFromSidecarValue(
    sharedSidecarValue(
      inspection,
      "release.dates.release",
    ),
  );

  if (sidecarDate) {
    return sidecarDate;
  }

  const embeddedDate = sharedEmbeddedValue(
    audioFiles,
    ["date", "year", "originaldate"],
  );

  if (embeddedDate) {
    const match = embeddedDate.match(
      /^(\d{4})(?:-(\d{2})-(\d{2}))?/,
    );

    if (match) {
      return match[2] && match[3]
        ? `${match[1]}-${match[2]}-${match[3]}`
        : `${match[1]}-01-01`;
    }
  }

  return (
    audioFiles
      .map((file) =>
        evidenceValue(file.evidence, "date"),
      )
      .find(Boolean) ?? ""
  );
}

function defaultTrackTitle(
  inspection: IngestCandidateInspection,
  file: IngestFileInspection,
): string {
  const sidecar = pairedSidecar(inspection, file);
  const sidecarTitle = sidecar
    ? sidecarSuggestionValue(sidecar, "track.title")
    : undefined;

  return (
    (typeof sidecarTitle === "string" ? sidecarTitle : undefined) ??
    embeddedValue(file, ["title"]) ??
    evidenceValue(file.evidence, "track.title") ??
    filenameStem(file.filename)
      .replace(/[_-]+/g, " ")
      .trim()
  );
}

function defaultTrackVersion(
  file: IngestFileInspection,
): string {
  return (
    evidenceValue(
      file.evidence,
      "track.version",
    ) ??
    evidenceValue(
      file.evidence,
      "track.take",
    ) ??
    ""
  );
}

function defaultTrackDate(
  inspection: IngestCandidateInspection,
  file: IngestFileInspection,
): string {
  const sidecar = pairedSidecar(inspection, file);
  const sidecarDate = completeDateFromSidecarValue(
    sidecar
      ? sidecarSuggestionValue(sidecar, "release.dates.release")
      : undefined,
  );

  if (sidecarDate) {
    return sidecarDate;
  }

  const embedded = embeddedValue(
    file,
    ["date", "year", "originaldate"],
  );

  if (embedded) {
    const match = embedded.match(
      /^(\d{4})(?:-(\d{2})-(\d{2}))?/,
    );

    if (match) {
      return match[2] && match[3]
        ? `${match[1]}-${match[2]}-${match[3]}`
        : `${match[1]}-01-01`;
    }
  }

  return (
    evidenceValue(file.evidence, "date") ?? ""
  );
}

function defaultVideoTitle(
  file: IngestFileInspection,
): string {
  return (
    embeddedValue(file, ["title"]) ??
    evidenceValue(file.evidence, "video.title") ??
    filenameStem(file.filename)
      .replace(/[_-]+/g, " ")
      .trim()
  );
}

export function buildVideoDirectoryId(
  title: string,
  ordinal = 1,
): string {
  const slug = slugifyIngestValue(title) || `video-${ordinal}`;
  return `video_${slug}`;
}

export function createDefaultIngestBuildDraft(
  inspection: IngestCandidateInspection,
): IngestBuildDraft {
  const audioFiles = inspection.files.filter(
    (file) => file.mediaKind === "audio",
  );
  const videoFiles = inspection.files.filter(
    (file) => file.mediaKind === "video",
  );
  const structure = analyzeIngestStructure(
    inspection,
  );
  const releaseTitle = defaultReleaseTitle(
    inspection,
    audioFiles,
  );
  const releaseArtist =
    defaultReleaseArtist(
      inspection,
      audioFiles,
    );
  const releaseDate = defaultReleaseDate(
    inspection,
    audioFiles,
  );
  const releaseId = buildReleaseDirectoryId(
    releaseDate,
    releaseTitle,
  );

  const structurallyAssignedNumbers = new Map<
    string,
    number
  >();
  const usedTrackNumbers = new Set<number>();

  for (const [
    trackNumber,
    sourceRelativePath,
  ] of structure.uniqueAudioSourceByTrackNumber) {
    structurallyAssignedNumbers.set(
      sourceRelativePath,
      trackNumber,
    );
    usedTrackNumbers.add(trackNumber);
  }

  for (const file of audioFiles) {
    if (structurallyAssignedNumbers.has(file.relativePath)) {
      continue;
    }

    const sidecar = pairedSidecar(inspection, file);
    const value = sidecar
      ? sidecarSuggestionValue(
          sidecar,
          "track.numbering.track_number",
        )
      : undefined;

    if (
      typeof value === "number" &&
      Number.isSafeInteger(value) &&
      value > 0 &&
      !usedTrackNumbers.has(value)
    ) {
      structurallyAssignedNumbers.set(file.relativePath, value);
      usedTrackNumbers.add(value);
    }
  }

  let nextFallbackTrackNumber = 1;
  const nextAvailableTrackNumber = () => {
    while (
      usedTrackNumbers.has(
        nextFallbackTrackNumber,
      )
    ) {
      nextFallbackTrackNumber += 1;
    }

    const assigned = nextFallbackTrackNumber;
    usedTrackNumbers.add(assigned);
    nextFallbackTrackNumber += 1;
    return assigned;
  };

  const tracks = audioFiles.map(
    (file): IngestBuildTrackDraft => {
      const extension =
        extensionOf(file.filename);

      return {
        sourceRelativePath: file.relativePath,
        include: true,
        trackNumber:
          structurallyAssignedNumbers.get(
            file.relativePath,
          ) ?? nextAvailableTrackNumber(),
        title: defaultTrackTitle(inspection, file),
        version: defaultTrackVersion(file),
        artist:
          (() => {
            const sidecar = pairedSidecar(inspection, file);
            const value = sidecar
              ? sidecarSuggestionValue(
                  sidecar,
                  "track.primary_artist.name",
                )
              : undefined;
            return typeof value === "string"
              ? value
              : embeddedValue(file, ["artist"]) ?? releaseArtist;
          })(),
        date: defaultTrackDate(inspection, file),
        destinationFilename:
          `audio-master${extension}`,
      };
    },
  );
  const usedVideoIds = new Set<string>();
  const videos = videoFiles.map(
    (file, index): IngestBuildVideoDraft => {
      const title = defaultVideoTitle(file);
      const baseId = buildVideoDirectoryId(title, index + 1);
      let videoId = baseId;
      let suffix = 2;
      while (usedVideoIds.has(videoId)) {
        videoId = `${baseId}-${suffix}`;
        suffix += 1;
      }
      usedVideoIds.add(videoId);

      return {
        sourceRelativePath: file.relativePath,
        include: true,
        videoId,
        title,
        videoType: "other",
        relatedTrackSourceRelativePath: "",
        destinationFilename:
          `video-master${extensionOf(file.filename)}`,
      };
    },
  );

  const trackSourceByStructureNumber = new Map(
    tracks
      .map((track) => {
        const structuralNumber =
          structurallyAssignedNumbers.get(
            track.sourceRelativePath,
          );

        return structuralNumber === undefined
          ? undefined
          : ([
              structuralNumber,
              track.sourceRelativePath,
            ] as const);
      })
      .filter(
        (entry): entry is readonly [number, string] =>
          entry !== undefined,
      ),
  );

  const rootReleaseFrontSource =
    structure.releaseRootImageSources.length === 1
      ? structure.releaseRootImageSources[0]
      : undefined;
  const releaseArtworkDirectoryFrontSource =
    structure.releaseRootImageSources.length === 0 &&
    structure.releaseArtworkDirectoryImageSources
      .length === 1
      ? structure
          .releaseArtworkDirectoryImageSources[0]
      : undefined;
  const releaseFrontSource =
    rootReleaseFrontSource ??
    releaseArtworkDirectoryFrontSource;

  const usedDestinations = new Set<string>();

  const physicalAssets = inspection.files
    .filter(
      (
        file,
      ): file is IngestFileInspection & {
        mediaKind: "image" | "text";
      } =>
        file.mediaKind === "image" ||
        file.mediaKind === "text",
    )
    .map((file): IngestBuildAssetDraft => {
      const extension =
        extensionOf(file.filename);
      const sourceStem =
        slugifyIngestValue(
          filenameStem(file.filename),
        ) || "imported-file";
      const structureHint = structure.files.get(
        file.relativePath,
      );
      const trackNumber =
        structureHint?.trackNumber;
      const uniqueTrackImage =
        trackNumber !== undefined &&
        structure.uniqueImageSourceByTrackNumber.get(
          trackNumber,
        ) === file.relativePath;
      const trackSourceRelativePath =
        trackNumber !== undefined &&
        uniqueTrackImage
          ? trackSourceByStructureNumber.get(
              trackNumber,
            )
          : undefined;
      const isReleaseFront =
        file.mediaKind === "image" &&
        file.relativePath === releaseFrontSource;
      const artworkAssignments =
        file.mediaKind !== "image"
          ? []
          : isReleaseFront
            ? [defaultReleaseArtworkAssignment()]
            : trackSourceRelativePath
              ? [
                  defaultTrackArtworkAssignment(
                    trackSourceRelativePath,
                  ),
                ]
              : [];
      const destinationRelativePath =
        file.mediaKind === "text"
          ? `notes/imported/${sourceStem}${extension}`
          : isReleaseFront
            ? `artwork/front/artwork-master${extension}`
            : `artwork/supplemental/${sourceStem}${extension}`;

      return {
        sourceRelativePath: file.relativePath,
        include:
          (file.mediaKind === "text"
            ? !file.metadataSidecar
            : artworkAssignments.length > 0),
        mediaKind: file.mediaKind,
        destinationRelativePath:
          uniquifyPath(
            destinationRelativePath,
            usedDestinations,
          ),
        artworkAssignments,
      };
    });

  const embeddedArtworkByHash = new Map<
    string,
    {
      file: IngestFileInspection;
      artwork: NonNullable<IngestFileInspection["embeddedArtwork"]>[number];
    }
  >();

  for (const file of audioFiles) {
    for (const artwork of file.embeddedArtwork ?? []) {
      if (!embeddedArtworkByHash.has(artwork.sha256)) {
        embeddedArtworkByHash.set(artwork.sha256, { file, artwork });
      }
    }
  }

  const embeddedEntries = [...embeddedArtworkByHash.values()];
  const useEmbeddedFront =
    releaseFrontSource === undefined &&
    embeddedEntries.length === 1;
  const embeddedAssets = embeddedEntries.map(
    ({ file, artwork }, index): IngestBuildAssetDraft => {
      const sourceRelativePath =
        `embedded-artwork:${artwork.sha256}`;
      const destinationRelativePath = uniquifyPath(
        useEmbeddedFront && index === 0
          ? `artwork/front/artwork-master${artwork.extension}`
          : `artwork/supplemental/embedded-cover-${index + 1}${artwork.extension}`,
        usedDestinations,
      );
      const artworkAssignments =
        useEmbeddedFront && index === 0
          ? [defaultReleaseArtworkAssignment()]
          : [];

      return {
        sourceRelativePath,
        sourceType: "embedded-artwork",
        embeddedArtwork: {
          audioSourceRelativePath: file.relativePath,
          streamIndex: artwork.streamIndex,
          ...(artwork.codecName ? { codecName: artwork.codecName } : {}),
          extension: artwork.extension,
          contentType: artwork.contentType,
          sizeBytes: artwork.sizeBytes,
          sha256: artwork.sha256,
        },
        include: artworkAssignments.length > 0,
        mediaKind: "image",
        destinationRelativePath,
        artworkAssignments,
      };
    },
  );
  const assets = [...physicalAssets, ...embeddedAssets];

  return {
    candidateId: inspection.candidate.id,
    releaseId,
    releaseTitle,
    releaseArtist,
    releaseDate,
    releaseType:
      audioFiles.length === 1
        ? "single"
        : audioFiles.length === 0 && videoFiles.length > 0
          ? "other"
          : "album",
    tracks,
    videos,
    assets,
  };
}
