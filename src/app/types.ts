import type {
  MissingMetadataDocument,
  RequiredFieldIssue,
} from "../metadata-readiness.js";
import type { IngestDraftIdentitySeed } from "../../shared/ingest-drafts.js";
import type {
  WorkflowApplicationView,
  WorkflowLocationDisplay,
} from "../WorkflowNavigation.js";
import type { IngestIdentityOverride } from "../ingest-identity-source.js";

type MetadataFileStatus = {
  filename: string;
  relativePath: string;
  exists: boolean;
};

type DiscoveredAsset = {
  filename: string;
  relativePath: string;
  extension: string;
};

type TrackScanResult = {
  id: string;
  relativePath: string;
  title?: string;
  trackNumber?: number;
  discNumber?: number;
  metadataFiles: MetadataFileStatus[];
  audioMasters: DiscoveredAsset[];
  playbackAudio?: DiscoveredAsset[];
  artworkMasters: DiscoveredAsset[];
};

type VideoScanResult = {
  id: string;
  relativePath: string;
  title?: string;
  videoType?: string;
  description?: string;
  date?: string;
  location?: string;
  director?: string;
  cameraOperator?: string;
  displayOrder?: number;
  posterTimeSeconds?: number;
  relatedTrackId?: string;
  masterPath?: string;
  metadataFiles: MetadataFileStatus[];
  videoMasters: DiscoveredAsset[];
};

type VideoMetadataEditorSnapshot = {
  releaseId: string;
  videoId: string;
  relativePath: string;
  originalSha256: string;
  title: string;
  videoType: string;
  description: string;
  date: string;
  location: string;
  director: string;
  cameraOperator: string;
  displayOrder: number;
  posterTimeSeconds: number | null;
  relatedTrackId: string;
  masterPath: string;
};

type ArtistAssetScanResult = {
  id: string;
  kind: string;
  masterPath: string;
  relativePath: string;
  exists: boolean;
  description?: string;
  sourceFilename?: string;
  sha256?: string;
};

type ArtistPhotoCandidate = {
  relativePath: string;
  filename: string;
  extension: string;
  sizeBytes: number;
  modifiedAt: string;
};

type ArtistScanResult = {
  id: string;
  slug: string;
  displayName: string;
  sortName?: string;
  bio?: string;
  primaryAssetId?: string;
  relativePath: string;
  metadataRelativePath: string;
  assets: ArtistAssetScanResult[];
};

type ReleaseScanResult = {
  id: string;
  relativePath: string;
  releaseTitle?: string;
  primaryArtistId?: string;
  primaryArtistName?: string;
  releaseDate?: string;
  releaseType?: string;
  metadataFiles: MetadataFileStatus[];
  artworkMasters: DiscoveredAsset[];
  tracks: TrackScanResult[];
  videos: VideoScanResult[];
};

type LibraryScanResult = {
  scannedAt: string;
  artists: ArtistScanResult[];
  releases: ReleaseScanResult[];
  warnings: string[];
};

type MediaTechnicalHealth =
  | "ready"
  | "review"
  | "blocked";

type MediaTechnicalInventoryEntry = {
  value: string;
  count: number;
};

type MediaTechnicalInventory = {
  audio: {
    codecs: MediaTechnicalInventoryEntry[];
    sampleRates: MediaTechnicalInventoryEntry[];
    bitDepths: MediaTechnicalInventoryEntry[];
    sampleFormats: MediaTechnicalInventoryEntry[];
    channels: MediaTechnicalInventoryEntry[];
  };
  artwork: {
    codecs: MediaTechnicalInventoryEntry[];
    dimensions: MediaTechnicalInventoryEntry[];
    pixelFormats: MediaTechnicalInventoryEntry[];
  };
  video: {
    codecs: MediaTechnicalInventoryEntry[];
    profiles: MediaTechnicalInventoryEntry[];
    dimensions: MediaTechnicalInventoryEntry[];
    pixelFormats: MediaTechnicalInventoryEntry[];
    frameRates: MediaTechnicalInventoryEntry[];
  };
};

type MediaTechnicalReleaseSummary = {
  releaseId: string;
  durationSeconds?: number;
  health: MediaTechnicalHealth;
  issues: Array<{
    severity: "review" | "blocked";
    message: string;
  }>;
  inventory: MediaTechnicalInventory;
  summary: {
    total: number;
    probed: number;
    failed: number;
    audio: number;
    artwork: number;
    video: number;
  };
};

type MediaTechnicalContract = {
  version: 1;
  advisory: true;
  publishGating: false;
  audio: {
    total: number;
    preferredLossless: number;
    compatibleLossless: number;
    sourcePreservedLossy: number;
    review: number;
  };
  artwork: {
    total: number;
    preferred: number;
    compatible: number;
    review: number;
    geometry: {
      square: number;
      landscape: number;
      portrait: number;
      unknown: number;
    };
  };
  video: {
    total: number;
    preferredContainers: number;
    compatibleContainers: number;
    review: number;
    policy: "inventory-only";
    codecProfileThresholdDefined: false;
  };
};

type MediaTechnicalAuditResult = {
  contract: MediaTechnicalContract;
  releases: MediaTechnicalReleaseSummary[];
  healthSummary: {
    ready: number;
    review: number;
    blocked: number;
  };
};

type MediaTechnicalAuditState = {
  result: MediaTechnicalAuditResult | null;
  loading: boolean;
  error: string | null;
};

type IngestStagingIdentitySeed =
  IngestDraftIdentitySeed & {
    evidence: IngestIdentityOverride["evidence"];
  };

type PublishPlanIssue = {
  code: string;
  severity: "warning" | "blocked";
  relativePath: string;
  message: string;
  suggestion?: string;
};

type PublishPlanItem = {
  kind:
    | "catalog"
    | "publication-manifest"
    | "release-metadata"
    | "track-metadata"
    | "release-artwork"
    | "track-artwork"
    | "track-stream-manifest"
    | "track-stream-init"
    | "track-stream-segment"
    | "track-waveform"
    | "video-metadata"
    | "video-stream-manifest"
    | "video-stream-init"
    | "video-stream-segment"
    | "video-poster";
  action:
    | "create"
    | "replace"
    | "generate"
    | "update"
    | "blocked";
  destinationRelativePath: string;
  reason: string;
  sourceRelativePath?: string;
  trackId?: string;
  videoId?: string;
  sizeBytes?: number;
};

type PublishPlan = {
  releaseId: string;
  generatedAt: string;
  readOnly: true;
  writesEnabled: false;
  sourceRoot: string;
  destinationRoot: string;
  destinationReleaseRelativePath: string;
  destinationReleaseExists: boolean;
  publication: {
    state: "not-published" | "up-to-date" | "update-available";
    currentContentFingerprint: string;
    publishedContentFingerprint?: string;
    publishedAt?: string;
  };
  publicSelection: {
    settingsRelativePath: string;
    settingsExists: boolean;
    settingsSha256?: string;
    includeVideo: boolean;
    trackSelectionMode: "all" | "selected";
    includedTrackIds: string[];
    includedVideoIds: string[];
  };
  planFingerprint: string;
  status: "ready" | "warning" | "blocked";
  issues: PublishPlanIssue[];
  items: PublishPlanItem[];
  validation: {
    status: "ok" | "warning" | "blocked";
    warningCount: number;
    blockedCount: number;
  };
  derivatives: {
    trackCount: number;
    videoCount: number;
    currentCount: number;
    createCount: number;
    replaceCount: number;
    blockedCount: number;
  };
  libraryPlayback: {
    trackCount: number;
    currentCount: number;
    createCount: number;
    replaceCount: number;
    blockedCount: number;
  };
  webStreams: {
    trackCount: number;
    currentCount: number;
    createCount: number;
    replaceCount: number;
    blockedCount: number;
  };
  videoStreams: {
    videoCount: number;
    currentCount: number;
    createCount: number;
    replaceCount: number;
    blockedCount: number;
    planFingerprint: string;
    generatedAt: string;
  };
  waveforms: {
    trackCount: number;
    currentCount: number;
    createCount: number;
    replaceCount: number;
    blockedCount: number;
  };
  summary: {
    itemCount: number;
    createCount: number;
    replaceCount: number;
    generateCount: number;
    updateCount: number;
    blockedCount: number;
  };
  contract: {
    name: string;
    version: number;
    catalogSchemaVersion: number;
    mediaBaseUrl: string;
    trackResources: {
      stream: {
        hrefField: string;
        protocol: "hls";
        manifestRelativePath: string;
        codec: "aac";
        bitrateKbps: number;
        segmentDurationSeconds: number;
        segmentType: "fmp4";
      };
      waveform: {
        hrefField: string;
        filename: string;
        schemaVersion: number;
      };
    };
    videoResources: {
      metadataHrefField: string;
      poster: {
        hrefField: string;
        relativePath: string;
        format: "png";
      };
      stream: {
        hrefField: string;
        protocol: "hls";
        manifestRelativePath: string;
        videoCodec: "h264";
        videoProfile: "high";
        videoLevel: "4.1";
        maxWidth: number;
        maxHeight: number;
        maxFrameRate: number;
        audioCodec: "aac";
        audioBitrateKbps: number;
        segmentDurationSeconds: number;
        segmentType: "fmp4";
      };
    };
    privateContentExcluded: readonly string[];
  };
};

type MediaPreparationReceipt = {
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

type VideoPreparationReceipt = {
  releaseId: string;
  operationId: string;
  operationRelativePath: string;
  createdCount: number;
  replacedCount: number;
  streamCount: number;
  completedAt: string;
};

type MediaPreparationProgress = {
  operationId: string;
  releaseId: string;
  status: "running" | "completed" | "failed";
  phase:
    | "starting"
    | "web-stream-hls"
    | "video-web-stream-hls"
    | "browser-artwork"
    | "playback-mp3"
    | "waveform-peaks"
    | "validating"
    | "promoting"
    | "completed"
    | "failed";
  message: string;
  completedUnits: number;
  totalUnits: number;
  trackCount: number;
  videoCount?: number;
  trackId?: string;
  trackLabel?: string;
  trackIndex?: number;
  videoId?: string;
  videoLabel?: string;
  videoIndex?: number;
  updatedAt: string;
};

type PublishPackageReceipt = {
  releaseId: string;
  operationId: string;
  destinationRelativePath: string;
  mode: "build" | "update";
  resourceCount: number;
  trackCount: number;
  streamCount: number;
  waveformCount: number;
  videoCount: number;
  videoStreamCount: number;
  artworkCount: number;
  completedAt: string;
};

type PublicReleaseUnpublishPlan = {
  schema: {
    name: "metadata-editor-public-release-unpublish-plan";
    version: 1;
  };
  releaseId: string;
  generatedAt: string;
  readOnly: true;
  writesEnabled: false;
  confirmation: "UNPUBLISH_PUBLIC_RELEASE";
  destinationReleaseRelativePath: string;
  catalogEntry: {
    releaseId: string;
    title?: string;
    primaryArtist?: string;
    href: string;
    destinationReleaseRelativePath: string;
    releaseDirectoryExists: boolean;
  } | null;
  publication: {
    publishedAt?: string;
    sourcePlanFingerprint?: string;
    sourceContentFingerprint?: string;
  };
  publicFiles: {
    fileCount: number;
    totalBytes: number;
    treeFingerprint: string;
  };
  deploymentManifestWillNeedRefresh: boolean;
  status: "ready" | "blocked";
  issues: Array<{
    code: string;
    severity: "warning" | "blocked";
    relativePath: string;
    message: string;
  }>;
  planFingerprint: string;
};

type PublicReleaseUnpublishReceipt = {
  releaseId: string;
  operationId: string;
  destinationRelativePath: string;
  mode: "unpublish";
  removedFileCount: number;
  removedBytes: number;
  completedAt: string;
  deploymentManifestRefreshRequired: true;
};

type PublishOperationSummary = {
  operationId: string;
  releaseId: string;
  mode: "build" | "update" | "unpublish";
  state:
    | "running"
    | "interrupted"
    | "completed"
    | "failed"
    | "recovered";
  phase: string;
  startedAt: string;
  updatedAt?: string;
  completedAt?: string;
  failedAt?: string;
  reviewedPlanFingerprint?: string;
  resources?: number;
  recoveryAction:
    | "none"
    | "finalize-current"
    | "rollback-safe"
    | "review-required";
  recoveryReason?: string;
  error?: string;
  legacy: boolean;
};

type PublishOperationHistory = {
  serverInstanceId: string;
  operations: PublishOperationSummary[];
  interruptedCount: number;
  failedCount: number;
};

type BatchPreparationResult = {
  releaseId: string;
  status: "prepared" | "skipped" | "failed";
  error?: string;
  message?: string;
};

type BatchPreparationResponse = {
  scope: "all" | "playback";
  releaseCount: number;
  preparedCount: number;
  skippedCount: number;
  failedCount: number;
  results: BatchPreparationResult[];
};

type PublishedMediaDeploymentIssue = {
  code: string;
  severity: "warning" | "blocked";
  relativePath: string;
  message: string;
};

type PublishedMediaDeploymentAudit = {
  generatedAt: string;
  status: "empty" | "ready" | "warning" | "blocked";
  deployable: boolean;
  issues: PublishedMediaDeploymentIssue[];
  deploymentManifest: {
    exists: boolean;
    current: boolean;
    generatedAt?: string;
    contentFingerprint?: string;
  };
  summary: {
    catalogReleaseCount: number;
    releaseDirectoryCount: number;
    readyReleaseCount: number;
    blockedReleaseCount: number;
    fileCount: number;
    totalBytes: number;
    warningCount: number;
    blockedCount: number;
  };
};

type PublishFleetRelease = {
  releaseId: string;
  releaseTitle?: string;
  primaryArtistName?: string;
  libraryPresent: boolean;
  publicationState:
    | "not-published"
    | "up-to-date"
    | "update-available"
    | "published-only";
  planStatus: "ready" | "warning" | "blocked";
  blockerCount: number;
  warningCount: number;
  needsPreparation: boolean;
  playbackNeedsPreparation: boolean;
  audioStreamNeedsPreparation: boolean;
  videoStreamNeedsPreparation: boolean;
  waveformNeedsPreparation: boolean;
  publicSelection?: {
    includeVideo: boolean;
    publicTrackCount: number;
    libraryTrackCount: number;
    publicVideoCount: number;
    libraryVideoCount: number;
  };
};

type ArtistPublicationPlan = {
  generatedAt: string;
  readOnly: true;
  writesEnabled: false;
  status: "ready" | "blocked";
  state:
    | "not-published"
    | "up-to-date"
    | "update-available"
    | "blocked";
  planFingerprint: string;
  sourceContentFingerprint: string;
  issues: Array<{
    code: string;
    severity: "warning" | "blocked";
    artistId?: string;
    assetId?: string;
    message: string;
  }>;
  summary: {
    artistCount: number;
    includedReleaseCount: number;
    photoCount: number;
    primaryPhotoCount: number;
    blockedCount: number;
    warningCount: number;
  };
};

type ArtistPublicationReceipt = {
  mode: "build" | "update";
  artistCount: number;
  photoCount: number;
  resourceCount: number;
  completedAt: string;
  sourceContentFingerprint: string;
};

type PublishFleetSummary = {
  generatedAt: string;
  releases: PublishFleetRelease[];
  summary: {
    releaseCount: number;
    libraryReleaseCount: number;
    notPublishedCount: number;
    currentCount: number;
    updateAvailableCount: number;
    publishedOnlyCount: number;
    publicCatalogCount: number;
    blockedCount: number;
    warningCount: number;
    needsPreparationCount: number;
  };
  artists: ArtistPublicationPlan;
  deployment: PublishedMediaDeploymentAudit;
};

type PublishedMediaDeploymentProfile = {
  name: "local-sandbox" | "production" | "custom";
  label: string;
  environment: "local" | "production" | "custom";
  active: boolean;
  configured: boolean;
  targetSource:
    | "default-local-sandbox"
    | "profile-environment"
    | "explicit-override"
    | "unconfigured";
  configuredTarget?: string;
  description: string;
};

type PublishedMediaDeploymentTarget = {
  kind: "local" | "ssh";
  configuredValue: string;
  display: string;
  destinationPath: string;
  host?: string;
  sshPort?: number;
};

type PublishedMediaDeploymentOperationReceipt = {
  operationId: string;
  profileName?: PublishedMediaDeploymentProfile["name"];
  state: "running" | "completed" | "failed" | "rolled-back";
  startedAt: string;
  completedAt?: string;
  rolledBackAt?: string;
  target: PublishedMediaDeploymentTarget;
  sourceContentFingerprint: string;
  previousContentFingerprint?: string;
  planFingerprint: string;
  backupPath: string;
  incomingPath: string;
  summary: {
    addCount: number;
    updateCount: number;
    removeCount: number;
    metadataCount: number;
    unknownCount: number;
    changeCount: number;
  };
  error?: string;
};

type PublishedMediaDeploymentTargetStatus = {
  generatedAt: string;
  configured: boolean;
  profile: PublishedMediaDeploymentProfile;
  profiles: PublishedMediaDeploymentProfile[];
  architecture: {
    frontendSource: string;
    frontendServerRoot: string;
    publicMediaServerRoot: string;
    publicMediaUrlPrefix: string;
    localPublishedMediaRole: string;
    frontendAndMediaIndependent: boolean;
  };
  target?: PublishedMediaDeploymentTarget;
  stateRoot: string;
  deployConfirmation: string;
  rollbackConfirmation: string;
  deployCommand: string;
  rollbackCommand: string;
  latestOperation?: PublishedMediaDeploymentOperationReceipt;
};

type PublishedMediaDeploymentSyncChange = {
  action: "add" | "update" | "remove" | "metadata" | "unknown";
  path: string;
  itemized: string;
};

type PublishedMediaDeploymentSyncPlan = {
  generatedAt: string;
  profile: PublishedMediaDeploymentProfile;
  status: "current" | "changes";
  sourceRoot: string;
  sourceContentFingerprint: string;
  sourceFileCount: number;
  sourceTotalBytes: number;
  target: PublishedMediaDeploymentTarget;
  targetManifest: {
    exists: boolean;
    contentFingerprint?: string;
    generatedAt?: string;
  };
  changes: PublishedMediaDeploymentSyncChange[];
  summary: {
    addCount: number;
    updateCount: number;
    removeCount: number;
    metadataCount: number;
    unknownCount: number;
    changeCount: number;
  };
  planFingerprint: string;
  confirmation: string;
};

type InferredValue<T> = {
  value: T;
  source: string;
};

type ReleaseMetadataPreview = {
  releaseId: InferredValue<string>;
  releaseDate?: InferredValue<string>;
  releaseTitle?: InferredValue<string>;
  artworkMasterPath?: InferredValue<string>;
};

type TrackMetadataPreview = {
  trackId: InferredValue<string>;
  artistName?: InferredValue<string>;
  trackNumber?: InferredValue<number>;
  trackTitle?: InferredValue<string>;
  trackVersion?: InferredValue<string>;
  trackDisplayTitle?: InferredValue<string>;
  audioMasterPath?: InferredValue<string>;
  artworkMasterPath?: InferredValue<string>;
};

type LibraryMetadataPreview = {
  release: ReleaseMetadataPreview;
  tracks: TrackMetadataPreview[];
  warnings: string[];
};

type StarterTrackDraft = {
  trackId: string;
  trackNumber: number;
  artist: string;
  title: string;
  version: string;
  displayTitle: string;
};

type StarterMetadataDraft = {
  releaseId: string;
  releaseTitle: string;
  releaseDate: string;
  releaseArtist: string;
  tracks: StarterTrackDraft[];
};

type GeneratedMetadataDocument = {
  storageRole: string;
  filename: string;
  relativePath: string;
  content: string;
  validated: boolean;
};

type GeneratedMetadataPreview = {
  releaseId: string;
  documents: GeneratedMetadataDocument[];
  warnings: string[];
};

type GenerationPlanAction =
  | "create"
  | "blocked";

type GenerationPlanItem = {
  storageRole: string;
  filename: string;
  relativePath: string;
  action: GenerationPlanAction;
  reason: string;
  content: string;
  validated: boolean;
};

type MetadataGenerationScope =
  | "all"
  | "release"
  | "track";

type MetadataGenerationPlan = {
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

type ParsedMetadataDocument = {
  filename: string;
  relativePath: string;
  scope: "release" | "track";
  trackId?: string;
  content: string;
  sha256: string;
  parsed: Record<string, unknown>;
};

type ReleaseMetadataDetail = {
  releaseId: string;
  releaseRelativePath: string;
  documents: ParsedMetadataDocument[];
  missingFiles: MetadataFileStatus[];
  warnings: string[];
};

type MetadataFieldDefinition = {
  id: string;
  canonicalName: string;
  label: string;
  description: string;
  scope: string;
  storageFileRole: string;
  tomlPath: string;
  valueType: string;
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

  presentation?: {
    group:
      | "Release & Track Identity"
      | "Artists"
      | "Music Business & Rights"
      | "Dates"
      | "Musical Analysis"
      | "Track & Disc Numbering"
      | "Movement & Work"
      | "Performers"
      | "Songwriting & Composition"
      | "Samples & Interpolations"
      | "Sample Clearance"
      | "Production"
      | "Arrangement & Orchestration"
      | "Conducting & Musical Direction"
      | "Recording"
      | "Editing"
      | "Mixing"
      | "Mastering"
      | "Writing, Lyrics & Language"
      | "Language & Writing System"
      | "Lyrics"
      | "Lyrics Rights & Source"
      | "Identifiers"
      | "Text and Notes"
      | "Artwork"
      | "Technical Audio"
      | "Files and Sources"
      | "Developer / Advanced";
    order?: number;
    commonValues?: string[];
    examples?: string[];
    help?: string;
  };

  editor?: {
    control: "select-or-custom" | "multiline";
    options: string[];
    customLabel?: string;
    customPlaceholder?: string;
    rows?: number;
    maxLength?: number;
    placeholder?: string;
    help?: string;
  };

  displayPolicy: string;
};

type MetadataRegistryResponse = {
  fields: MetadataFieldDefinition[];
};

type ApplicationView =
  | WorkflowApplicationView
  | "compatibility"
  | "help";

type InterfaceAccentMode =
  | "gray"
  | "purple"
  | "blue";

type WorkflowHelpReturnTarget = {
  applicationView: Exclude<
    ApplicationView,
    "help"
  >;
  releaseId?: string;
};

type ToastMessage = {
  id: number;
  message: string;
  tone: "success" | "info" | "error";
};

type WorkflowLocationWithSize =
  WorkflowLocationDisplay & {
    sizeBytes?: number;
  };

type WorkflowLocationsResponse = {
  locations: WorkflowLocationWithSize[];
  publishState: "available";
};

type ReleaseRenamePlanItem = {
  kind: "directory" | "toml" | "receipt";
  relativePath: string;
  targetRelativePath: string;
  action: "rename" | "update" | "unchanged" | "blocked";
  reason: string;
};

type ReleaseRenamePlan = {
  releaseId: string;
  targetReleaseId: string;
  currentTitle: string;
  targetTitle: string;
  sourceRelativePath: string;
  targetRelativePath: string;
  confirmation: "RENAME_RELEASE_DIRECTORY";
  generatedAt: string;
  items: ReleaseRenamePlanItem[];
  summary: {
    renameCount: number;
    updateCount: number;
    unchangedCount: number;
    blockedCount: number;
  };
  fingerprint: string;
};

type ReleaseRenameReceipt = {
  previousReleaseId: string;
  releaseId: string;
  previousRelativePath: string;
  relativePath: string;
  operationId: string | null;
  manifestRelativePath: string | null;
  updatedFiles: string[];
  completedAt: string;
};

type ReleaseMetadataTab =
  | "overview"
  | "credits"
  | "recording"
  | "rights"
  | "lyrics"
  | "artwork"
  | "notes"
  | "files"
  | "developer"
  | "settings"
  | "raw";

type ReadinessNavigationTarget =
  | {
      kind: "document";
      scopeId: string;
      tab: ReleaseMetadataTab;
      file: MissingMetadataDocument;
    }
  | {
      kind: "field";
      scopeId: string;
      tab: ReleaseMetadataTab;
      field: RequiredFieldIssue;
    };

type MetadataEditorFocusTarget = {
  scopeId: string;
  tab: ReleaseMetadataTab;
  tomlPath?: string;
};

type PendingMetadataFocusRequest =
  MetadataEditorFocusTarget & {
    releaseId: string;
  };

type CompatibilityStatusFilter =
  | "all"
  | "verified"
  | "partial"
  | "not-visible"
  | "unverified";

type ExportContainer =
  | "mp3"
  | "flac"
  | "m4a"
  | "ogg-vorbis"
  | "opus"
  | "wav";

type ExportGuidanceStatus =
  | "supported"
  | "normalized"
  | "omitted"
  | "unverified";

type ExportGuidance = {
  status: ExportGuidanceStatus;
  tags: string[];
  note: string;
};

type ExportPlanField = {
  canonicalPath: string;
  label: string;
  targetTags: string[];
  ffmpegTags?: string[];
  value:
    | string
    | number
    | boolean
    | string[];
  status:
    | "write"
    | "normalized"
    | "omitted"
    | "unverified";
  note: string;
  sourceDocument: string;
};

type ExportPlanItem = {
  trackId: string;
  sourceAudioRelativePath?: string;
  destinationRelativePath?: string;
  action: "ready" | "blocked";
  fields: ExportPlanField[];
  warnings: string[];
};

type MetadataExportPlan = {
  releaseId: string;
  container: ExportContainer;
  scope: "all" | "track";
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

type FfmpegCapabilityStatus =
  | "ready"
  | "fallback-required"
  | "unsupported";

type FfmpegContainerCapability = {
  container: ExportContainer;
  status: FfmpegCapabilityStatus;
  preferredEncoder: string;
  selectedEncoder?: string;
  fallbackEncoders: string[];
  note: string;
};

type FfmpegCapabilities = {
  available: boolean;
  version?: string;
  executable: string;
  encoders: string[];
  containers:
    FfmpegContainerCapability[];
  checkedAt: string;
  error?: string;
};

type ExportDryRunCheck = {
  code: string;
  status:
    | "pass"
    | "warning"
    | "blocked";
  message: string;
};

type ExportDryRunValidation = {
  releaseId: string;
  container: ExportContainer;
  outputRoot: string;
  checkedAt: string;
  items: Array<{
    trackId: string;
    status:
      | "ready"
      | "warning"
      | "blocked";
    checks: ExportDryRunCheck[];
  }>;
  summary: {
    readyCount: number;
    warningCount: number;
    blockedCount: number;
  };
  canExport: boolean;
};

type ExportExecutionResult = {
  releaseId: string;
  container: ExportContainer;
  executedAt: string;
  confirmationPhrase: string;
  items: Array<{
    trackId: string;
    status: "created" | "failed";
    sourceAudioRelativePath?: string;
    destinationRelativePath?: string;
    encoder?: string;
    sizeBytes?: number;
    sha256?: string;
    createdAt?: string;
    error?: string;
  }>;
  summary: {
    createdCount: number;
    failedCount: number;
  };
};

export {
  type MetadataFileStatus,
  type DiscoveredAsset,
  type TrackScanResult,
  type VideoScanResult,
  type VideoMetadataEditorSnapshot,
  type ArtistAssetScanResult,
  type ArtistPhotoCandidate,
  type ArtistScanResult,
  type ReleaseScanResult,
  type LibraryScanResult,
  type MediaTechnicalHealth,
  type MediaTechnicalInventoryEntry,
  type MediaTechnicalInventory,
  type MediaTechnicalReleaseSummary,
  type MediaTechnicalContract,
  type MediaTechnicalAuditResult,
  type MediaTechnicalAuditState,
  type IngestStagingIdentitySeed,
  type PublishPlanIssue,
  type PublishPlanItem,
  type PublishPlan,
  type MediaPreparationReceipt,
  type VideoPreparationReceipt,
  type MediaPreparationProgress,
  type PublishPackageReceipt,
  type PublicReleaseUnpublishPlan,
  type PublicReleaseUnpublishReceipt,
  type PublishOperationSummary,
  type PublishOperationHistory,
  type BatchPreparationResult,
  type BatchPreparationResponse,
  type PublishedMediaDeploymentIssue,
  type PublishedMediaDeploymentAudit,
  type PublishFleetRelease,
  type ArtistPublicationPlan,
  type ArtistPublicationReceipt,
  type PublishFleetSummary,
  type PublishedMediaDeploymentProfile,
  type PublishedMediaDeploymentTarget,
  type PublishedMediaDeploymentOperationReceipt,
  type PublishedMediaDeploymentTargetStatus,
  type PublishedMediaDeploymentSyncChange,
  type PublishedMediaDeploymentSyncPlan,
  type InferredValue,
  type ReleaseMetadataPreview,
  type TrackMetadataPreview,
  type LibraryMetadataPreview,
  type StarterTrackDraft,
  type StarterMetadataDraft,
  type GeneratedMetadataDocument,
  type GeneratedMetadataPreview,
  type GenerationPlanAction,
  type GenerationPlanItem,
  type MetadataGenerationScope,
  type MetadataGenerationPlan,
  type ParsedMetadataDocument,
  type ReleaseMetadataDetail,
  type MetadataFieldDefinition,
  type MetadataRegistryResponse,
  type ApplicationView,
  type InterfaceAccentMode,
  type WorkflowHelpReturnTarget,
  type ToastMessage,
  type WorkflowLocationWithSize,
  type WorkflowLocationsResponse,
  type ReleaseRenamePlanItem,
  type ReleaseRenamePlan,
  type ReleaseRenameReceipt,
  type ReleaseMetadataTab,
  type ReadinessNavigationTarget,
  type MetadataEditorFocusTarget,
  type PendingMetadataFocusRequest,
  type CompatibilityStatusFilter,
  type ExportContainer,
  type ExportGuidanceStatus,
  type ExportGuidance,
  type ExportPlanField,
  type ExportPlanItem,
  type MetadataExportPlan,
  type FfmpegCapabilityStatus,
  type FfmpegContainerCapability,
  type FfmpegCapabilities,
  type ExportDryRunCheck,
  type ExportDryRunValidation,
  type ExportExecutionResult,
};
