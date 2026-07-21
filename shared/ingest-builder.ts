import type {
  IngestCandidateInspection,
  IngestEvidence,
  IngestFileInspection,
  IngestMediaKind,
} from "./ingest-types.js";

export const INGEST_BUILD_CONFIRMATION_PHRASE =
  "CREATE_STAGING_RELEASE";

export type IngestBuildTrackDraft = {
  sourceRelativePath: string;
  include: boolean;
  trackNumber: number;
  title: string;
  version: string;
  artist: string;
  date: string;
  destinationFilename: string;
};

export type IngestArtworkAssignmentDraft = {
  id: string;
  scope: "release" | "track";
  role: string;
  trackSourceRelativePaths: string[];
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

export type IngestBuildAssetDraft = {
  sourceRelativePath: string;
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
  action: "create" | "blocked";
  reason: string;
};

export type IngestBuildPreview = {
  candidateId: string;
  releaseId: string;
  releaseRelativePath: string;
  outputRootLabel: string;
  items: IngestBuildPlanItem[];
  summary: {
    trackCount: number;
    copiedFileCount: number;
    tomlCount: number;
    totalCopyBytes: number;
    blockedCount: number;
    artworkSourceCount: number;
    artworkAssignmentCount: number;
  };
  warnings: string[];
  confirmationPhrase: typeof INGEST_BUILD_CONFIRMATION_PHRASE;
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
  releaseId: string;
  releaseRelativePath: string;
  createdFiles: string[];
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

function defaultReleaseTitle(
  inspection: IngestCandidateInspection,
  audioFiles: IngestFileInspection[],
): string {
  return (
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
  audioFiles: IngestFileInspection[],
): string {
  return (
    sharedEmbeddedValue(
      audioFiles,
      [
        "album_artist",
        "albumartist",
        "album artist",
        "artist",
      ],
    ) ?? ""
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
  file: IngestFileInspection,
): string {
  return (
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
  file: IngestFileInspection,
): string {
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

export function createDefaultIngestBuildDraft(
  inspection: IngestCandidateInspection,
): IngestBuildDraft {
  const audioFiles = inspection.files.filter(
    (file) => file.mediaKind === "audio",
  );
  const releaseTitle = defaultReleaseTitle(
    inspection,
    audioFiles,
  );
  const releaseArtist =
    defaultReleaseArtist(audioFiles);
  const releaseDate = defaultReleaseDate(
    inspection,
    audioFiles,
  );
  const releaseSlug =
    slugifyIngestValue(releaseTitle) ||
    "untitled-release";
  const releaseId = releaseDate
    ? `${releaseDate}_${releaseSlug}`
    : releaseSlug;

  const tracks = audioFiles.map(
    (file, index): IngestBuildTrackDraft => {
      const extension =
        extensionOf(file.filename);

      return {
        sourceRelativePath: file.relativePath,
        include: true,
        trackNumber: index + 1,
        title: defaultTrackTitle(file),
        version: defaultTrackVersion(file),
        artist:
          embeddedValue(file, ["artist"]) ??
          releaseArtist,
        date: defaultTrackDate(file),
        destinationFilename:
          `audio-master${extension}`,
      };
    },
  );

  const usedDestinations = new Set<string>();
  let releaseArtworkAssigned = false;

  const assets = inspection.files
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

      let destinationRelativePath: string;

      if (
        file.mediaKind === "image" &&
        !releaseArtworkAssigned
      ) {
        releaseArtworkAssigned = true;
        destinationRelativePath =
          `artwork/front/artwork-master${extension}`;
      } else if (file.mediaKind === "image") {
        destinationRelativePath =
          `artwork/supplemental/${sourceStem}${extension}`;
      } else {
        destinationRelativePath =
          `notes/imported/${sourceStem}${extension}`;
      }

      const artworkAssignments =
        file.mediaKind === "image" &&
        releaseArtworkAssigned &&
        destinationRelativePath.startsWith(
          "artwork/front/",
        )
          ? [defaultReleaseArtworkAssignment()]
          : [];

      return {
        sourceRelativePath: file.relativePath,
        include:
          file.mediaKind === "text" ||
          artworkAssignments.length > 0,
        mediaKind: file.mediaKind,
        destinationRelativePath:
          uniquifyPath(
            destinationRelativePath,
            usedDestinations,
          ),
        artworkAssignments,
      };
    });

  return {
    candidateId: inspection.candidate.id,
    releaseId,
    releaseTitle,
    releaseArtist,
    releaseDate,
    releaseType:
      audioFiles.length === 1
        ? "single"
        : "album",
    tracks,
    assets,
  };
}
