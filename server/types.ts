export type MetadataFileStatus = {
  filename: string;
  relativePath: string;
  exists: boolean;
};

export type DiscoveredAsset = {
  filename: string;
  relativePath: string;
  extension: string;
};

export type TrackScanResult = {
  id: string;
  relativePath: string;
  metadataFiles: MetadataFileStatus[];
  audioMasters: DiscoveredAsset[];
  artworkMasters: DiscoveredAsset[];
};

export type ReleaseScanResult = {
  id: string;
  relativePath: string;
  metadataFiles: MetadataFileStatus[];
  artworkMasters: DiscoveredAsset[];
  tracks: TrackScanResult[];
};

export type LibraryScanResult = {
  mediaRoot: string;
  releasesRoot: string;
  scannedAt: string;
  releases: ReleaseScanResult[];
  warnings: string[];
};

export type InferredValue<T> = {
  value: T;
  source: string;
};

export type ReleaseMetadataPreview = {
  releaseId: InferredValue<string>;
  releaseDate?: InferredValue<string>;
  releaseTitle?: InferredValue<string>;
  artworkMasterPath?: InferredValue<string>;
};

export type TrackMetadataPreview = {
  trackId: InferredValue<string>;
  artistName?: InferredValue<string>;
  trackNumber?: InferredValue<number>;
  trackTitle?: InferredValue<string>;
  audioMasterPath?: InferredValue<string>;
  artworkMasterPath?: InferredValue<string>;
};

export type LibraryMetadataPreview = {
  release: ReleaseMetadataPreview;
  tracks: TrackMetadataPreview[];
  warnings: string[];
};

export type MetadataStorageRole =
  | "release"
  | "release-settings"
  | "release-production-notes"
  | "track"
  | "track-credits"
  | "track-production-notes";

export type GeneratedMetadataDocument = {
  storageRole: MetadataStorageRole;
  filename: string;
  relativePath: string;
  content: string;
  validated: boolean;
};

export type GeneratedMetadataPreview = {
  releaseId: string;
  documents: GeneratedMetadataDocument[];
  warnings: string[];
};

export type GenerationPlanAction =
  | "create"
  | "blocked";

export type MetadataGenerationScope =
  | "all"
  | "release"
  | "track";

export type GenerationPlanItem = {
  storageRole: MetadataStorageRole;
  filename: string;
  relativePath: string;
  action: GenerationPlanAction;
  reason: string;
  content: string;
  validated: boolean;
};

export type MetadataGenerationPlan = {
  releaseId: string;
  scope: MetadataGenerationScope;
  trackId?: string;
  items: GenerationPlanItem[];
  summary: {
    createCount: number;
    blockedCount: number;
  };
  warnings: string[];
};

export type MetadataCreationReceipt = {
  relativePath: string;
  bytes: number;
  sha256: string;
  verifiedAt: string;
};

export type MetadataCreationResult = {
  releaseId: string;
  created: string[];
  blocked: string[];
  receipts: MetadataCreationReceipt[];
  warnings: string[];
};

export type ParsedMetadataDocument = {
  filename: string;
  relativePath: string;
  scope: "release" | "track";
  trackId?: string;
  content: string;
  sha256: string;
  parsed: Record<string, unknown>;
};

export type ReleaseMetadataDetail = {
  releaseId: string;
  releaseRelativePath: string;
  documents: ParsedMetadataDocument[];
  missingFiles: MetadataFileStatus[];
  warnings: string[];
};

export type EditableMetadataValue =
  | string
  | number
  | boolean
  | string[];

export type MetadataValueChange = {
  path: string;
  value: EditableMetadataValue;
};

export type ScalarMetadataSaveRequest = {
  releaseId: string;
  relativePath: string;
  originalSha256: string;
  changes: MetadataValueChange[];
};

export type ScalarMetadataSaveReceipt = {
  relativePath: string;
  backupRelativePath: string;
  previousSha256: string;
  savedSha256: string;
  bytes: number;
  savedAt: string;
};

export type ExportContainer =
  | "mp3"
  | "flac"
  | "m4a"
  | "ogg-vorbis"
  | "opus"
  | "wav";

export type ExportPlanScope =
  | "all"
  | "track";

export type ExportPlanFieldStatus =
  | "write"
  | "normalized"
  | "omitted"
  | "unverified";

export type ExportPlanField = {
  canonicalPath: string;
  label: string;
  targetTags: string[];
  value:
    | string
    | number
    | boolean
    | string[];
  status: ExportPlanFieldStatus;
  note: string;
  sourceDocument: string;
};

export type ExportPlanItem = {
  trackId: string;
  sourceAudioRelativePath?: string;
  destinationRelativePath?: string;
  action: "ready" | "blocked";
  fields: ExportPlanField[];
  warnings: string[];
};

export type MetadataExportPlan = {
  releaseId: string;
  container: ExportContainer;
  scope: ExportPlanScope;
  trackId?: string;
  outputDirectory: string;
  items: ExportPlanItem[];
  summary: {
    readyCount: number;
    blockedCount: number;
    writeCount: number;
    normalizedCount: number;
    omittedCount: number;
    unverifiedCount: number;
  };
  warnings: string[];
};

export type MetadataValueType =
  | "string"
  | "integer"
  | "number"
  | "boolean"
  | "date"
  | "string-array"
  | "object"
  | "object-array";

export type MetadataFieldDefinition = {
  id: string;
  canonicalName: string;
  label: string;
  description: string;

  scope:
    | "release"
    | "track"
    | "credit"
    | "production"
    | "technical"
    | "video"
    | "common";

  storageFileRole: string;
  tomlPath: string;
  valueType: MetadataValueType;

  required: boolean;
  repeatable: boolean;
  inherited: boolean;

  aliases?: {
    ffmpeg?: string[];
    id3?: string[];
    vorbis?: string[];
    mp4?: string[];
    riff?: string[];

    players?: {
      vlc?: string[];
      appleMusic?: string[];
      windowsMediaPlayer?: string[];
      windowsMediaPlayerLegacy?: string[];
    };
  };

  playerCompatibility?: Array<{
    player:
      | "vlc"
      | "appleMusic"
      | "windowsMediaPlayer"
      | "windowsMediaPlayerLegacy";
    containers: string[];
    status:
      | "verified"
      | "partial"
      | "not-visible";
    displayLabel?: string;
    note: string;
  }>;

  displayPolicy:
    | "auto"
    | "always"
    | "never"
    | "developer";
};
