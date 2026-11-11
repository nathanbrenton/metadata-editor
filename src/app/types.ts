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

/*
 * Types below are owned by the server/shared modules that produce the
 * corresponding API payloads; the client re-uses them instead of keeping
 * hand-maintained copies.
 */
import type {
  MetadataFileStatus,
  DiscoveredAsset,
  TrackScanResult,
  VideoScanResult,
  ArtistAssetScanResult,
  ArtistScanResult,
  InferredValue,
  ReleaseMetadataPreview,
  TrackMetadataPreview,
  LibraryMetadataPreview,
  GeneratedMetadataDocument,
  GeneratedMetadataPreview,
  GenerationPlanAction,
  GenerationPlanItem,
  MetadataGenerationScope,
  MetadataGenerationPlan,
  ParsedMetadataDocument,
  ReleaseMetadataDetail,
  MetadataFieldDefinition,
  ExportContainer,
  ExportPlanField,
  ExportPlanItem,
  MetadataExportPlan,
  FfmpegCapabilityStatus,
  FfmpegContainerCapability,
  FfmpegCapabilities,
  ExportDryRunCheck,
  ExportDryRunValidation,
} from "../../server/types.js";
import type {
  VideoMetadataEditorSnapshot,
} from "../../server/video-metadata.js";
import type {
  ArtistPhotoCandidate,
} from "../../server/artist-assets.js";
import type {
  MediaTechnicalHealth,
  MediaTechnicalInventoryEntry,
  MediaTechnicalInventory,
  MediaTechnicalReleaseSummary,
  MediaTechnicalContract,
  MediaTechnicalAuditResult,
} from "../../server/media-technical-audit.js";
import type {
  PublishPlanIssue,
  PublishPlanItem,
  PublishPlan,
} from "../../server/publish-plan.js";
import type {
  PublishPackageReceipt,
} from "../../server/publish-writer.js";
import type {
  PublicReleaseUnpublishPlan,
  PublicReleaseUnpublishReceipt,
} from "../../server/publication-membership.js";
import type {
  PublishOperationSummary,
  PublishOperationHistory,
} from "../../server/publish-operations.js";
import type {
  PublishedMediaDeploymentIssue,
  PublishedMediaDeploymentAudit,
} from "../../server/published-media-deployment.js";
import type {
  PublishFleetRelease,
  PublishFleetSummary,
} from "../../server/publish-fleet.js";
import type {
  ArtistPublicationPlan,
  ArtistPublicationReceipt,
} from "../../server/artist-publication.js";
import type {
  PublishedMediaDeploymentProfile,
} from "../../server/deployment-profiles.js";
import type {
  PublishedMediaDeploymentTarget,
  PublishedMediaDeploymentOperationReceipt,
  PublishedMediaDeploymentTargetStatus,
  PublishedMediaDeploymentSyncChange,
  PublishedMediaDeploymentSyncPlan,
} from "../../server/deployment-sync.js";
import type {
  ReleaseRenamePlanItem,
  ReleaseRenamePlan,
  ReleaseRenameReceipt,
} from "../../server/release-rename.js";

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

type MediaTechnicalAuditState = {
  result: MediaTechnicalAuditResult | null;
  loading: boolean;
  error: string | null;
};

type IngestStagingIdentitySeed =
  IngestDraftIdentitySeed & {
    evidence: IngestIdentityOverride["evidence"];
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
