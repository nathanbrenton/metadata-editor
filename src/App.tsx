import {
  Fragment,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  flattenMetadata,
  type FlattenedMetadataRow,
} from "./metadata-flattener.js";

import {
  buildAudioPreviewUrl,
  getAdjacentPlayableTrackId,
  getAudioPreviewSourceLabel,
  getPlayableTrackIds,
  trackHasAudioPreview,
} from "./audio-preview.js";


import {
  getArrangementCreditDisplayPriority,
  isArrangementContributorRoleValue,
  normalizeArrangementCreditRole,
  sortArrangementCreditDisplayRecords,
} from "./arrangement-credit-role.js";

import {
  defaultWritingRoleForFamily,
  getWritingCreditDisplayPriority,
  sortWritingCreditDisplayRecords,
  writingCreditFamilyForRole,
  writingCreditRoleOptions,
  type WritingCreditFamily,
} from "./writing-credit-role.js";

import {
  sampleClearanceStatusOptions,
  sampleRelationshipTypeOptions,
  type SampleClearanceRecordDraft,
  type SampleRelationshipRecordDraft,
} from "./sample-relationship.js";

import {
  isTechnicalContributorRoleValue,
} from "./technical-credit-role.js";

import {
  getTechnicalCreditDisplayPriority,
  sortTechnicalCreditDisplayRecords,
} from "./technical-credit-role.js";

import {
  formatGuidedCopyrightNotice,
  formatGuidedCopyrightNoticeValue,
  formatGuidedRightsStatement,
  getGuidedCopyrightNoticeConfig,
  getRightsStatementSymbol,
  isGuidedCopyrightNoticePath,
  parseGuidedCopyrightNotice,
  parseGuidedRightsStatement,
  type RightsStatementSymbol,
} from "./rights-statement.js";

import {
  clearMetadataActivityLog,
  prependMetadataActivityEntry,
  readMetadataActivityLog,
  writeMetadataActivityLog,
  type MetadataActivityEntry,
} from "./activity-log.js";

import {
  buildMissingInheritedMetadataRows,
  findMetadataValueAcrossDocuments,
  isArtistSortNameInheritancePath,
  isBlankMetadataValue,
  resolveInheritedReleaseValue,
} from "./release-inheritance.js";

import {
  groupMatchingPerformerRoleSets,
  prioritizeReleaseArtistDisplay,
} from "./performer-display-order.js";

import {
  sortPerformerRoleDisplayValues,
} from "./performer-role-display-order.js";

import {
  metadataRowMatchesNotesTab,
} from "./metadata-tab-routing.js";

import {
  getDefaultTrackOverviewFieldOrder,
  getMissingTrackOverviewFieldPresentation,
  isDefaultTrackIdentityFieldPath,
  isDefaultTrackOverviewFieldPath,
  shouldShowDefaultTrackOverviewFields,
} from "./default-track-overview-fields.js";

import {
  camelotKeyForMusicalKey,
  isValidTuningReference,
} from "../shared/musical-analysis.js";

import {
  deriveTrackSaveChanges,
  deriveTrackTitleDraftChanges,
  generateTrackSortTitle,
} from "./track-derived-metadata.js";

import {
  artistNamePathForSortNamePath,
  deriveArtistSortNameChanges,
} from "./artist-sort-name.js";

import {
  generateArtistSortName,
} from "../shared/artist-sort-name.js";

import {
  findProductionContextField,
  productionContextFields,
  resolveProductionContextGroup,
} from "../shared/production-context.js";

import {
  isDefaultRightsFieldPath,
  shouldShowDefaultRightsFields,
} from "./default-rights-fields.js";

import {
  createTrackPerformerOverride,
  resolveEffectivePerformerRecords,
} from "./performer-inheritance.js";

import {
  formatTrackDisplayTitle,
  inferTrackTitleMetadata,
  recommendedTrackVersionOptions,
} from "../shared/track-title.js";

import {
  buildArtworkGallery,
  selectPreferredReleaseArtwork,
  type ArtworkGalleryItem,
} from "./artwork-gallery.js";

import {
  filterPresentableMetadataRows,
  unmappedMetadataGroup,
} from "./metadata-presentation.js";

import {
  getPatternMetadataHelpCommonValues,
  productionTypeCommonValues,
} from "./metadata-help-common-values.js";

import {
  lyricsMetadataGroupOrder,
  resolveEffectiveTrackLanguage,
} from "./lyrics-language.js";

import {
  buildMetadataReadiness,
  readinessBadgeLabel,
  readinessTone,
  summarizeMissingMetadataDocuments,
  summarizeReleaseScanReadiness,
  type MetadataReadinessScope,
  type MetadataReadinessSummary,
  type MissingMetadataDocument,
  type RequiredFieldIssue,
} from "./metadata-readiness.js";

import {
  addReadinessSkip,
  readReadinessSkips,
  removeReadinessSkip,
  writeReadinessSkips,
} from "./readiness-skips.js";

import type {
  IngestCandidateInspection,
  IngestCandidateSummary,
  IngestEvidence,
  IngestFileInspection,
  IngestScanResult,
} from "../shared/ingest-types.js";

import {
  workflowPath,
} from "./workflow-help-content.js";

import {
  WorkflowNavigation,
  type WorkflowApplicationView,
} from "./WorkflowNavigation.js";

import {
  buildTrackNavigationOrder,
} from "./track-navigation-order.js";

// Defer secondary workflows until they are opened so the initial editor
// bundle remains smaller and faster to parse.
const LazyIngestReleaseBuilder = lazy(async () => {
  const module = await import(
    "./IngestReleaseBuilder.js"
  );

  return {
    default: module.IngestReleaseBuilder,
  };
});

const LazyWorkflowHelpView = lazy(async () => {
  const module = await import(
    "./WorkflowHelpView.js"
  );

  return {
    default: module.WorkflowHelpView,
  };
});

const LazySampleRelationshipRecordEditor = lazy(async () => {
  const module = await import(
    "./SampleRecordEditors.js"
  );

  return {
    default: module.SampleRelationshipRecordEditor,
  };
});

const LazySampleClearanceRecordEditor = lazy(async () => {
  const module = await import(
    "./SampleRecordEditors.js"
  );

  return {
    default: module.SampleClearanceRecordEditor,
  };
});

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
  metadataFiles: MetadataFileStatus[];
  audioMasters: DiscoveredAsset[];
  playbackAudio?: DiscoveredAsset[];
  artworkMasters: DiscoveredAsset[];
};

type ReleaseScanResult = {
  id: string;
  relativePath: string;
  metadataFiles: MetadataFileStatus[];
  artworkMasters: DiscoveredAsset[];
  tracks: TrackScanResult[];
};

type LibraryScanResult = {
  scannedAt: string;
  releases: ReleaseScanResult[];
  warnings: string[];
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
    control: "select-or-custom";
    options: string[];
    customLabel?: string;
    customPlaceholder?: string;
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

const EXPORT_CONFIRMATION_PHRASE =
  "CREATE_VALIDATED_EXPORTS";

const exportContainerLabels:
  Record<ExportContainer, string> = {
    mp3: "MP3 / ID3",
    flac: "FLAC / Vorbis",
    m4a: "M4A / MP4",
    "ogg-vorbis": "OGG Vorbis",
    opus: "Opus",
    wav: "WAV / RIFF",
  };

const coreExportPaths = new Set([
  "release.title",
  "release.primary_artist.name",
  "release.dates.release",
  "release.genres",
  "track.title",
  "track.primary_artist.name",
  "track.numbering.track_number",
]);

function formatMetadataValue(
  value: unknown,
): string {
  if (Array.isArray(value)) {
    return value.length === 0
      ? "[]"
      : JSON.stringify(value);
  }

  if (
    typeof value === "object" &&
    value !== null
  ) {
    return JSON.stringify(value);
  }

  if (value === "") {
    return "(blank)";
  }

  if (value === null) {
    return "null";
  }

  return String(value);
}

function formatByteSize(sizeBytes: number): string {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let value = sizeBytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function formatDuration(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(wholeSeconds / 60);
  const remainder = wholeSeconds % 60;

  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export function App() {
  const [scan, setScan] =
    useState<LibraryScanResult | null>(null);
  const [ingestScan, setIngestScan] =
    useState<IngestScanResult | null>(null);
  const [ingestError, setIngestError] =
    useState<string | null>(null);
  const [ingestLoading, setIngestLoading] =
    useState(false);
  const [ingestInspection, setIngestInspection] =
    useState<IngestCandidateInspection | null>(null);
  const [ingestInspectionError, setIngestInspectionError] =
    useState<string | null>(null);
  const [ingestInspectionLoading, setIngestInspectionLoading] =
    useState(false);
  const [error, setError] =
    useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [
    selectedReleaseDetail,
    setSelectedReleaseDetail,
  ] = useState<ReleaseMetadataDetail | null>(
    null,
  );
  const [
    detailLoading,
    setDetailLoading,
  ] = useState(false);
  const [detailError, setDetailError] =
    useState<string | null>(null);
  const [metadataRegistry, setMetadataRegistry] =
    useState<MetadataFieldDefinition[]>([]);
  const [applicationView, setApplicationView] =
    useState<ApplicationView>("library");
  const [
    workflowHelpReturnTarget,
    setWorkflowHelpReturnTarget,
  ] = useState<WorkflowHelpReturnTarget | null>(
    null,
  );
  const [toast, setToast] =
    useState<ToastMessage | null>(null);
  const toastTimerRef =
    useRef<number | null>(null);

  const notify = useCallback(
    (
      message: string,
      tone: ToastMessage["tone"] = "info",
    ) => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(
          toastTimerRef.current,
        );
      }

      const nextToast = {
        id: Date.now(),
        message,
        tone,
      };

      setToast(nextToast);
      toastTimerRef.current =
        window.setTimeout(() => {
          setToast((current) =>
            current?.id === nextToast.id
              ? null
              : current,
          );
          toastTimerRef.current = null;
        }, 2600);
    },
    [],
  );

  useEffect(
    () => () => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(
          toastTimerRef.current,
        );
      }
    },
    [],
  );

  const [menuOpen, setMenuOpen] =
    useState(false);
  const applicationMenuRef =
    useRef<HTMLElement>(null);
  const [showAdminTools, setShowAdminTools] =
    useState(() => {
      try {
        return (
          window.localStorage.getItem(
            "metadata-editor.show-admin-tools-v2",
          ) === "true"
        );
      } catch {
        return false;
      }
    });

  const openReleaseDetail = useCallback(
    async (releaseId: string) => {
      setDetailLoading(true);
      setDetailError(null);

      try {
        const query = new URLSearchParams({
          release: releaseId,
        });

        const response = await fetch(
          `/api/library/release-detail?${query.toString()}`,
        );

        const result =
          (await response.json()) as
            | ReleaseMetadataDetail
            | {
                error?: string;
              };

        if (!response.ok) {
          throw new Error(
            "error" in result
              ? result.error ??
                  `Detail request failed: HTTP ${response.status}`
              : `Detail request failed: HTTP ${response.status}`,
          );
        }

        setSelectedReleaseDetail(
          result as ReleaseMetadataDetail,
        );
      } catch (error) {
        setDetailError(
          error instanceof Error
            ? error.message
            : "Unknown metadata-detail error",
        );
      } finally {
        setDetailLoading(false);
      }
    },
    [],
  );

  const refreshLibrary = useCallback(async (
    announce = false,
  ) => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        "/api/library/scan",
      );

      if (!response.ok) {
        throw new Error(
          `Library scan failed: HTTP ${response.status}`,
        );
      }

      setScan(
        (await response.json()) as LibraryScanResult,
      );

      if (announce) {
        notify(
          "Library refreshed",
          "success",
        );
      }
    } catch (scanError) {
      const message =
        scanError instanceof Error
          ? scanError.message
          : "Unknown scan error";

      setError(message);

      if (announce) {
        notify(
          "Library refresh failed",
          "error",
        );
      }
    } finally {
      setLoading(false);
    }
  }, [notify]);

  const refreshIngest = useCallback(async (
    announce = false,
  ) => {
    setIngestLoading(true);
    setIngestError(null);

    try {
      const response = await fetch(
        "/api/ingest/scan",
      );
      const result = (await response.json()) as
        | IngestScanResult
        | { error?: string };

      if (!response.ok) {
        throw new Error(
          "error" in result
            ? result.error ??
                `Ingest scan failed: HTTP ${response.status}`
            : `Ingest scan failed: HTTP ${response.status}`,
        );
      }

      setIngestScan(result as IngestScanResult);

      if (announce) {
        notify(
          "Ingest drop refreshed",
          "success",
        );
      }
    } catch (scanError) {
      const message =
        scanError instanceof Error
          ? scanError.message
          : "Unknown ingest scan error";

      setIngestError(message);

      if (announce) {
        notify(
          "Ingest drop refresh failed",
          "error",
        );
      }
    } finally {
      setIngestLoading(false);
    }
  }, [notify]);

  const inspectCandidate = useCallback(async (
    candidateId: string,
  ) => {
    setIngestInspectionLoading(true);
    setIngestInspectionError(null);

    try {
      const query = new URLSearchParams({
        candidate: candidateId,
      });
      const response = await fetch(
        `/api/ingest/candidate?${query.toString()}`,
      );
      const result = (await response.json()) as
        | IngestCandidateInspection
        | { error?: string };

      if (!response.ok) {
        throw new Error(
          "error" in result
            ? result.error ??
                `Inspection failed: HTTP ${response.status}`
            : `Inspection failed: HTTP ${response.status}`,
        );
      }

      setIngestInspection(
        result as IngestCandidateInspection,
      );
    } catch (inspectionError) {
      setIngestInspectionError(
        inspectionError instanceof Error
          ? inspectionError.message
          : "Unknown ingest inspection error",
      );
    } finally {
      setIngestInspectionLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshLibrary();
  }, [refreshLibrary]);

  useEffect(() => {
    if (
      (applicationView === "ingest" ||
        applicationView === "staging") &&
      ingestScan === null &&
      !ingestLoading
    ) {
      void refreshIngest();
    }
  }, [
    applicationView,
    ingestLoading,
    ingestScan,
    refreshIngest,
  ]);


  useEffect(() => {
    try {
      window.localStorage.setItem(
        "metadata-editor.show-admin-tools-v2",
        String(showAdminTools),
      );
    } catch {
      // Local storage is optional; the session state still works.
    }
  }, [showAdminTools]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const handlePointerDown = (
      event: PointerEvent,
    ) => {
      if (
        event.target instanceof Node &&
        !applicationMenuRef.current?.contains(
          event.target,
        ) &&
        !(event.target instanceof Element &&
          event.target.closest(
            ".menu-button",
          ))
      ) {
        setMenuOpen(false);
      }
    };

    window.addEventListener(
      "pointerdown",
      handlePointerDown,
    );

    return () =>
      window.removeEventListener(
        "pointerdown",
        handlePointerDown,
      );
  }, [menuOpen]);

  useEffect(() => {
    const loadRegistry = async () => {
      try {
        const response = await fetch(
          "/api/metadata/registry",
        );

        if (!response.ok) {
          return;
        }

        const result =
          (await response.json()) as
            MetadataRegistryResponse;

        setMetadataRegistry(result.fields);
      } catch {
        // The metadata table remains usable without registry annotations.
      }
    };

    void loadRegistry();
  }, []);

  const openWorkflowHelp = useCallback(() => {
    if (applicationView !== "help") {
      setWorkflowHelpReturnTarget({
        applicationView,
        ...(selectedReleaseDetail
          ? {
              releaseId:
                selectedReleaseDetail.releaseId,
            }
          : {}),
      });
    }

    setSelectedReleaseDetail(null);
    setApplicationView("help");
    setMenuOpen(false);
  }, [applicationView, selectedReleaseDetail]);

  const returnFromWorkflowHelp = useCallback(() => {
    const target = workflowHelpReturnTarget ?? {
      applicationView: "library" as const,
    };

    setWorkflowHelpReturnTarget(null);
    setApplicationView(target.applicationView);

    if (target.releaseId) {
      void openReleaseDetail(target.releaseId);
    }
  }, [
    openReleaseDetail,
    workflowHelpReturnTarget,
  ]);

  const navigateWorkflowView = useCallback((
    view: WorkflowApplicationView,
  ) => {
    setSelectedReleaseDetail(null);
    setApplicationView(view);
    setMenuOpen(false);
  }, []);

  const openReleaseInLibrary = useCallback(async (
    releaseId: string,
  ) => {
    setApplicationView("library");
    setSelectedReleaseDetail(null);
    await openReleaseDetail(releaseId);
  }, [openReleaseDetail]);

  const openTagSearch = useCallback(() => {
    setSelectedReleaseDetail(null);
    setApplicationView("compatibility");
    setMenuOpen(false);
  }, []);

  const summary = useMemo(() => {
    if (!scan) {
      return null;
    }

    let trackCount = 0;
    let missingCoreMetadataCount = 0;
    let missingCreditMetadataCount = 0;
    let missingSupplementalMetadataCount = 0;
    let audioMasterCount = 0;
    let artworkMasterCount = 0;

    for (const release of scan.releases) {
      trackCount += release.tracks.length;
      artworkMasterCount +=
        release.artworkMasters.length;

      const releaseReadiness =
        summarizeReleaseScanReadiness(
          release,
        );

      missingCoreMetadataCount +=
        releaseReadiness.core;
      missingCreditMetadataCount +=
        releaseReadiness.credits;
      missingSupplementalMetadataCount +=
        releaseReadiness.supplemental;

      for (const track of release.tracks) {
        audioMasterCount +=
          track.audioMasters.length;
        artworkMasterCount +=
          track.artworkMasters.length;
      }
    }

    return {
      releaseCount: scan.releases.length,
      trackCount,
      missingMetadataCount:
        missingCoreMetadataCount +
        missingCreditMetadataCount +
        missingSupplementalMetadataCount,
      missingCoreMetadataCount,
      missingCreditMetadataCount,
      missingSupplementalMetadataCount,
      audioMasterCount,
      artworkMasterCount,
    };
  }, [scan]);

  const footerSummary = useMemo(() => {
    const formatCount = (
      count: number,
      singular: string,
      plural = `${singular}s`,
    ) =>
      `${count} ${count === 1 ? singular : plural}`;

    const selectedRelease = selectedReleaseDetail
      ? scan?.releases.find(
          (release) =>
            release.id ===
            selectedReleaseDetail.releaseId,
        )
      : null;

    if (selectedRelease) {
      const readiness =
        summarizeReleaseScanReadiness(
          selectedRelease,
        );
      const audioMasterCount =
        selectedRelease.tracks.reduce(
          (count, track) =>
            count + track.audioMasters.length,
          0,
        );
      const artworkCount =
        selectedRelease.artworkMasters.length +
        selectedRelease.tracks.reduce(
          (count, track) =>
            count + track.artworkMasters.length,
          0,
        );

      return [
        "Library",
        formatReleaseTitle(selectedRelease.id),
        formatCount(
          selectedRelease.tracks.length,
          "track",
        ),
        formatCount(
          audioMasterCount,
          "audio master",
        ),
        formatCount(
          artworkCount,
          "artwork file",
        ),
        readinessBadgeLabel(readiness),
      ].join(" · ");
    }

    if (applicationView === "ingest") {
      if (ingestInspection) {
        const candidate =
          ingestInspection.candidate;

        return [
          "Ingest",
          candidate.displayTitle,
          formatCount(
            candidate.fileCount,
            "file",
          ),
          formatCount(
            candidate.audioCount,
            "audio file",
          ),
          formatCount(
            candidate.imageCount,
            "image",
          ),
          formatByteSize(
            candidate.totalSizeBytes,
          ),
          "source read-only",
        ].join(" · ");
      }

      if (ingestScan) {
        return [
          "Ingest",
          `Drop point ${ingestScan.configuredRoot}`,
          formatCount(
            ingestScan.candidateCount,
            "candidate",
          ),
          formatCount(
            ingestScan.fileCount,
            "file",
          ),
          `ffprobe ${
            ingestScan.capabilities.ffprobe
              .available
              ? "available"
              : "unavailable"
          }`,
          `MediaInfo ${
            ingestScan.capabilities.mediainfo
              .available
              ? "available"
              : "unavailable"
          }`,
          "inspection read-only",
        ].join(" · ");
      }

      return ingestLoading
        ? "Ingest · scanning drop point…"
        : "Ingest · drop summary unavailable";
    }

    if (applicationView === "staging") {
      if (ingestInspection) {
        const candidate =
          ingestInspection.candidate;

        return [
          "Staging",
          candidate.displayTitle,
          formatCount(
            candidate.audioCount,
            "audio file",
          ),
          formatCount(
            candidate.imageCount,
            "image",
          ),
          "candidate selected",
        ].join(" · ");
      }

      return [
        "Staging",
        formatCount(
          scan?.releases.length ?? 0,
          "release workspace",
        ),
        "no ingest candidate selected",
      ].join(" · ");
    }

    if (applicationView === "publish") {
      const publishCounts = {
        needsWork: 0,
        reviewCandidate: 0,
        preflightCandidate: 0,
      };

      for (const release of scan?.releases ?? []) {
        const label =
          assessPublishReadiness(
            release,
          ).preflightLabel;

        if (label === "Needs work") {
          publishCounts.needsWork += 1;
        } else if (label === "Review candidate") {
          publishCounts.reviewCandidate += 1;
        } else {
          publishCounts.preflightCandidate += 1;
        }
      }

      return [
        "Publish",
        formatCount(
          scan?.releases.length ?? 0,
          "release",
        ),
        `${publishCounts.needsWork} ${
          publishCounts.needsWork === 1
            ? "needs"
            : "need"
        } work`,
        formatCount(
          publishCounts.reviewCandidate,
          "review candidate",
        ),
        formatCount(
          publishCounts.preflightCandidate,
          "preflight candidate",
        ),
        "publishing disabled",
      ].join(" · ");
    }

    if (applicationView === "compatibility") {
      return [
        "Metadata Tag Search",
        formatCount(
          metadataRegistry.length,
          "registered field",
        ),
        "player compatibility reference",
      ].join(" · ");
    }

    if (applicationView === "help") {
      return `Workflow & Help · ${workflowPath}`;
    }

    if (!summary) {
      return loading
        ? "Library · scanning releases…"
        : "Library · summary unavailable";
    }

    const parts = [
      "Library",
      formatCount(
        summary.releaseCount,
        "release",
      ),
      formatCount(
        summary.trackCount,
        "track",
      ),
      formatCount(
        summary.audioMasterCount,
        "audio master",
      ),
      formatCount(
        summary.artworkMasterCount,
        "artwork file",
      ),
    ];

    if (summary.missingMetadataCount > 0) {
      parts.push(
        summary.missingCoreMetadataCount > 0 ||
          summary.missingCreditMetadataCount > 0
          ? `${summary.missingMetadataCount} missing TOMLs (${summary.missingCoreMetadataCount} core · ${summary.missingCreditMetadataCount} credits · ${summary.missingSupplementalMetadataCount} optional)`
          : `${summary.missingSupplementalMetadataCount} optional TOMLs not created`,
      );
    }

    return parts.join(" · ");
  }, [
    applicationView,
    ingestInspection,
    ingestLoading,
    ingestScan,
    loading,
    metadataRegistry.length,
    scan,
    selectedReleaseDetail,
    summary,
  ]);

  return (
    <main>
      {selectedReleaseDetail ? (
        <ReleaseMetadataDetailView
          detail={selectedReleaseDetail}
          release={
            scan?.releases.find(
              (release) =>
                release.id ===
                selectedReleaseDetail.releaseId,
            ) ?? null
          }
          metadataRegistry={metadataRegistry}
          showAdminTools={showAdminTools}
          onShowAdminToolsChange={
            setShowAdminTools
          }
          onNotify={notify}
          onBack={() =>
            setSelectedReleaseDetail(null)
          }
          onRefresh={() =>
            openReleaseDetail(
              selectedReleaseDetail.releaseId,
            )
          }
          onOpenWorkflowHelp={openWorkflowHelp}
          onNavigateWorkflow={navigateWorkflowView}
          onOpenTagSearch={openTagSearch}
        />
      ) : (
        <>
          <header className="page-header">
            <div className="page-header-title">
              <h1>
                {applicationView === "help"
                  ? "Workflow & Help"
                  : applicationView === "compatibility"
                    ? "Metadata Tag Search"
                    : "Metadata Editor"}
              </h1>
              <p className="subtitle">
                {applicationView === "ingest"
                  ? "Find and inspect source assets"
                  : applicationView === "staging"
                    ? "Build or update a release workspace"
                    : applicationView === "library"
                      ? "Author metadata and prepare media"
                      : applicationView === "publish"
                        ? "Preflight and deploy releases"
                        : applicationView === "compatibility"
                          ? "Metadata field reference and player mappings"
                          : "Release workflow, status reference, FAQ, and troubleshooting"}
              </p>
            </div>

            <div className="page-header-actions">
              {(applicationView === "library" ||
                applicationView === "publish") &&
                scan && (
                  <p className="scan-time">
                    Library scan:{" "}
                    {new Date(
                      scan.scannedAt,
                    ).toLocaleString()}
                  </p>
                )}

              {(applicationView === "ingest" ||
                applicationView === "staging") &&
                ingestScan && (
                  <p className="scan-time">
                    Drop scan:{" "}
                    {new Date(
                      ingestScan.scannedAt,
                    ).toLocaleString()}
                  </p>
                )}

              <button
                type="button"
                className="menu-button"
                aria-label="Open application menu"
                aria-expanded={menuOpen}
                onClick={() =>
                  setMenuOpen((open) => !open)
                }
              >
                <span aria-hidden="true">☰</span>
              </button>
            </div>
          </header>

          {menuOpen && (
            <aside
              ref={applicationMenuRef}
              className="application-menu"
              aria-label="Application menu"
            >
              {(applicationView === "library" ||
                applicationView === "publish") && (
                <section className="menu-card">
                  <h2>Refresh Library</h2>
                  <button
                    type="button"
                    disabled={loading}
                    onClick={() => {
                      void refreshLibrary(true);
                      setMenuOpen(false);
                    }}
                  >
                    {loading
                      ? "Scanning…"
                      : "Refresh library"}
                  </button>
                </section>
              )}

              {(applicationView === "ingest" ||
                applicationView === "staging") && (
                <section className="menu-card">
                  <h2>Refresh Ingest Drop</h2>
                  <button
                    type="button"
                    disabled={ingestLoading}
                    onClick={() => {
                      void refreshIngest(true);
                      setMenuOpen(false);
                    }}
                  >
                    {ingestLoading
                      ? "Inspecting drop…"
                      : "Refresh drop point"}
                  </button>
                </section>
              )}

              {applicationView !== "help" && (
                <section className="menu-card workflow-menu-card">
                  <h2>Release workflow</h2>
                  <p className="workflow-menu-path">
                    {workflowPath}
                  </p>
                  <p>
                    Inspect sources, stage a controlled
                    release, author the private library,
                    then validate and publish a sanitized
                    deployment copy.
                  </p>
                  <button
                    type="button"
                    onClick={openWorkflowHelp}
                  >
                    View workflow guide
                  </button>
                </section>
              )}

              {applicationView !== "help" && (
                <section className="menu-card">
                  <h2>Metadata Reference</h2>
                  <p>
                    Search canonical fields and verified
                    player-visible tag mappings outside the
                    four-step release workflow.
                  </p>
                  <button
                    type="button"
                    onClick={
                      applicationView === "compatibility"
                        ? () => navigateWorkflowView("library")
                        : openTagSearch
                    }
                  >
                    {applicationView === "compatibility"
                      ? "Return to Library"
                      : "Open Tag Search"}
                  </button>
                </section>
              )}

              <section className="menu-card">
                <h2>About</h2>
                <p>
                  Metadata Editor provides local library
                  discovery, metadata review, and
                  controlled metadata editing.
                </p>
                <p className="menu-meta">
                  Version 0.0.1 · Proprietary software
                </p>
              </section>

              <section className="menu-card">
                <h2>Admin</h2>
                <label className="admin-toggle">
                  <input
                    type="checkbox"
                    checked={showAdminTools}
                    onChange={(event) =>
                      setShowAdminTools(
                        event.target.checked,
                      )
                    }
                  />
                  <span>
                    Show Developer / Admin Tools
                  </span>
                </label>
                <p className="menu-meta">
                  Enables troubleshooting controls,
                  source paths, settings, and raw TOML.
                </p>
              </section>
            </aside>
          )}

          <WorkflowNavigation
            activeView={
              applicationView === "ingest" ||
              applicationView === "staging" ||
              applicationView === "library" ||
              applicationView === "publish"
                ? applicationView
                : null
            }
            onNavigate={navigateWorkflowView}
          />

          {applicationView === "help" ? (
            <Suspense
              fallback={
                <section
                  className="workflow-help-view"
                  aria-live="polite"
                >
                  <p>Loading workflow guide…</p>
                </section>
              }
            >
              <LazyWorkflowHelpView
                onBack={returnFromWorkflowHelp}
              />
            </Suspense>
          ) : applicationView ===
          "compatibility" ? (
            <MetadataCompatibilityView
              fields={metadataRegistry}
              releases={
                scan?.releases ?? []
              }
            />
          ) : applicationView === "ingest" ? (
            <IngestView
              scan={ingestScan}
              error={ingestError}
              loading={ingestLoading}
              inspection={ingestInspection}
              inspectionError={
                ingestInspectionError
              }
              inspectionLoading={
                ingestInspectionLoading
              }
              onRefresh={() =>
                void refreshIngest(true)
              }
              onInspect={(candidateId) =>
                void inspectCandidate(candidateId)
              }
              onBackToCandidates={() =>
                setIngestInspection(null)
              }
              onOpenStaging={() =>
                navigateWorkflowView("staging")
              }
            />
          ) : applicationView === "staging" ? (
            <StagingWorkspace
              inspection={ingestInspection}
              releases={scan?.releases ?? []}
              inspectionError={
                ingestInspectionError
              }
              onChooseCandidate={() =>
                navigateWorkflowView("ingest")
              }
              onBackToInspection={() =>
                navigateWorkflowView("ingest")
              }
              onOpenRelease={(releaseId) =>
                void openReleaseInLibrary(releaseId)
              }
              onReleaseCreated={async (
                releaseId,
              ) => {
                setIngestInspection(null);
                await refreshLibrary();
                await openReleaseInLibrary(
                  releaseId,
                );
              }}
            />
          ) : applicationView === "publish" ? (
            <PublishWorkspace
              releases={scan?.releases ?? []}
              loading={loading}
              error={error}
              onRefresh={() =>
                void refreshLibrary(true)
              }
              onOpenRelease={(releaseId) =>
                void openReleaseInLibrary(releaseId)
              }
              onOpenWorkflowHelp={
                openWorkflowHelp
              }
            />
          ) : (
            <>
              {error && (
                <p className="message error">
                  {error}
                </p>
              )}

              {scan && summary && (
                <>
                  {scan.warnings.length > 0 && (
                    <section className="warning-panel">
                      <h2>Scanner warnings</h2>

                      <ul>
                        {scan.warnings.map(
                          (warning) => (
                            <li key={warning}>
                              {warning}
                            </li>
                          ),
                        )}
                      </ul>
                    </section>
                  )}

                  <section className="release-list">
                    {scan.releases.map(
                      (release) => (
                        <ReleaseCard
                          key={
                            release.relativePath
                          }
                          release={release}
                          onLibraryChanged={
                            refreshLibrary
                          }
                          onOpenMetadata={() =>
                            void openReleaseDetail(
                              release.id,
                            )
                          }
                          showAdminTools={
                            showAdminTools
                          }
                        />
                      ),
                    )}
                  </section>

                </>
              )}

              {detailError && (
                <p className="message error">
                  {detailError}
                </p>
              )}

              {detailLoading && (
                <p className="message">
                  Loading metadata detail…
                </p>
              )}
            </>
          )}
        </>
      )}
      <footer className="app-footer">
        <p
          className="footer-summary"
          title={footerSummary}
          aria-live="polite"
          aria-atomic="true"
        >
          {footerSummary}
        </p>

        <p className="footer-links">
          {!selectedReleaseDetail && (
            <>
              <button
                type="button"
                className="footer-link-button"
                onClick={openWorkflowHelp}
              >
                Workflow &amp; Help
              </button>
              <span aria-hidden="true">·</span>
            </>
          )}
          <span>
            Copyright © 2026 Nathan Brenton.
            All rights reserved.
          </span>
        </p>
      </footer>

          {toast && (
        <div
          key={toast.id}
          className={`toast-notification ${toast.tone}`}
          role={
            toast.tone === "error"
              ? "alert"
              : "status"
          }
          aria-live="polite"
        >
          {toast.message}
        </div>
      )}
    </main>
  );
}

function getCompatibilityStatus(
  field: MetadataFieldDefinition,
): CompatibilityStatusFilter {
  const results =
    field.playerCompatibility ?? [];

  if (
    results.some(
      (result) =>
        result.status === "verified",
    )
  ) {
    return "verified";
  }

  if (
    results.some(
      (result) =>
        result.status === "partial",
    )
  ) {
    return "partial";
  }

  if (
    results.some(
      (result) =>
        result.status === "not-visible",
    )
  ) {
    return "not-visible";
  }

  return "unverified";
}

function formatAliasValues(
  values: string[] | undefined,
): string {
  return values && values.length > 0
    ? values.join(", ")
    : "—";
}

function getContainerTags(
  field: MetadataFieldDefinition,
  container: ExportContainer,
): string[] {
  switch (container) {
    case "mp3":
      return field.aliases?.id3 ?? [];
    case "flac":
    case "ogg-vorbis":
    case "opus":
      return field.aliases?.vorbis ?? [];
    case "m4a":
      return field.aliases?.mp4 ?? [];
    case "wav":
      return field.aliases?.riff ?? [];
  }
}

function getExportGuidance(
  field: MetadataFieldDefinition,
  container: ExportContainer,
): ExportGuidance {
  const tags = getContainerTags(
    field,
    container,
  );

  const omittedByWav = new Set([
    "release.primary_artist.name",
    "track.numbering.disc_number",
    "track.numbering.disc_total",
    "track.composers[].name",
  ]);

  if (
    container === "wav" &&
    omittedByWav.has(field.tomlPath)
  ) {
    return {
      status: "omitted",
      tags,
      note:
        "The controlled FFmpeg WAV fixture did not preserve this value.",
    };
  }

  if (tags.length === 0) {
    return {
      status: "unverified",
      tags: [],
      note:
        "No verified container tag is registered for this field.",
    };
  }

  if (
    field.tomlPath ===
      "release.dates.release" &&
    ["mp3", "m4a", "wav"].includes(
      container,
    )
  ) {
    return {
      status: "normalized",
      tags,
      note:
        "FFprobe preserved the date, but tested players displayed only the four-digit year for this container.",
    };
  }

  if (
    field.tomlPath ===
      "track.numbering.track_number"
  ) {
    return {
      status: "normalized",
      tags,
      note:
        "Current and total numbering may share one container tag. VLC displayed only the current number; Apple Music displayed both values.",
    };
  }

  if (
    field.tomlPath ===
      "track.numbering.track_total" ||
    field.tomlPath ===
      "track.numbering.disc_total"
  ) {
    return {
      status: "normalized",
      tags,
      note:
        "The total is commonly stored with the current track or disc number rather than as an independent visible field.",
    };
  }

  if (
    field.tomlPath ===
      "track.text.comment" &&
    ["flac", "ogg-vorbis", "opus"].includes(
      container,
    )
  ) {
    return {
      status: "normalized",
      tags,
      note:
        "VLC merged comment and description text into its Description field for Vorbis-style containers.",
    };
  }

  return {
    status: "supported",
    tags,
    note:
      "A container tag is registered and the controlled fixture did not identify a preservation failure.",
  };
}

function MetadataCompatibilityView({
  fields,
  releases,
}: {
  fields: MetadataFieldDefinition[];
  releases: ReleaseScanResult[];
}) {
  const [searchText, setSearchText] =
    useState("");
  const [
    referenceMenuOpen,
    setReferenceMenuOpen,
  ] = useState(false);
  const [scopeFilter, setScopeFilter] =
    useState("all");
  const [playerFilter, setPlayerFilter] =
    useState("all");
  const [statusFilter, setStatusFilter] =
    useState<CompatibilityStatusFilter>(
      "all",
    );
  const [
    exportContainer,
    setExportContainer,
  ] = useState<ExportContainer>("mp3");


  const [
    selectedExportReleaseId,
    setSelectedExportReleaseId,
  ] = useState("");
  const [
    selectedExportTrackId,
    setSelectedExportTrackId,
  ] = useState("all");
  const [
    exportOutputDirectory,
    setExportOutputDirectory,
  ] = useState(
    "deployment-output/metadata-export",
  );
  const [exportPlan, setExportPlan] =
    useState<MetadataExportPlan | null>(
      null,
    );
  const [
    exportPlanLoading,
    setExportPlanLoading,
  ] = useState(false);
  const [
    exportPlanError,
    setExportPlanError,
  ] = useState<string | null>(null);
  const [
    exportValidation,
    setExportValidation,
  ] = useState<ExportDryRunValidation | null>(
    null,
  );
  const [
    exportValidationLoading,
    setExportValidationLoading,
  ] = useState(false);
  const [
    exportValidationError,
    setExportValidationError,
  ] = useState<string | null>(null);


  const [
    exportConfirmation,
    setExportConfirmation,
  ] = useState("");
  const [
    exportExecution,
    setExportExecution,
  ] = useState<ExportExecutionResult | null>(
    null,
  );
  const [
    exportExecutionLoading,
    setExportExecutionLoading,
  ] = useState(false);
  const [
    exportExecutionError,
    setExportExecutionError,
  ] = useState<string | null>(null);


  const [
    ffmpegCapabilities,
    setFfmpegCapabilities,
  ] = useState<FfmpegCapabilities | null>(
    null,
  );
  const [
    ffmpegCapabilitiesLoading,
    setFfmpegCapabilitiesLoading,
  ] = useState(false);
  const [
    ffmpegCapabilitiesError,
    setFfmpegCapabilitiesError,
  ] = useState<string | null>(null);

  useEffect(() => {
    if (!referenceMenuOpen) {
      return;
    }

    const previousOverflow =
      document.body.style.overflow;

    const closeOnEscape = (
      event: KeyboardEvent,
    ) => {
      if (event.key === "Escape") {
        setReferenceMenuOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener(
      "keydown",
      closeOnEscape,
    );

    return () => {
      document.body.style.overflow =
        previousOverflow;
      window.removeEventListener(
        "keydown",
        closeOnEscape,
      );
    };
  }, [referenceMenuOpen]);

  const refreshFfmpegCapabilities =
    useCallback(async () => {
      setFfmpegCapabilitiesLoading(true);
      setFfmpegCapabilitiesError(null);

      try {
        const response = await fetch(
          "/api/ffmpeg/capabilities",
        );

        const result =
          (await response.json()) as
            | FfmpegCapabilities
            | { error?: string };

        if (!response.ok) {
          throw new Error(
            "error" in result
              ? result.error ??
                  `FFmpeg capability request failed: HTTP ${response.status}`
              : `FFmpeg capability request failed: HTTP ${response.status}`,
          );
        }

        setFfmpegCapabilities(
          result as FfmpegCapabilities,
        );
      } catch (error) {
        setFfmpegCapabilities(null);
        setFfmpegCapabilitiesError(
          error instanceof Error
            ? error.message
            : "Unknown FFmpeg capability error",
        );
      } finally {
        setFfmpegCapabilitiesLoading(false);
      }
    }, []);

  useEffect(() => {
    void refreshFfmpegCapabilities();
  }, [refreshFfmpegCapabilities]);

  const selectedContainerCapability =
    useMemo(
      () =>
        ffmpegCapabilities?.containers.find(
          (capability) =>
            capability.container ===
            exportContainer,
        ) ?? null,
      [
        ffmpegCapabilities,
        exportContainer,
      ],
    );

  useEffect(() => {
    if (
      selectedExportReleaseId &&
      releases.some(
        (release) =>
          release.id ===
          selectedExportReleaseId,
      )
    ) {
      return;
    }

    setSelectedExportReleaseId(
      releases[0]?.id ?? "",
    );
    setSelectedExportTrackId("all");
    setExportPlan(null);
  }, [
    releases,
    selectedExportReleaseId,
  ]);

  const selectedExportRelease =
    releases.find(
      (release) =>
        release.id ===
        selectedExportReleaseId,
    );

  const requestExportPlan = async () => {
    if (!selectedExportReleaseId) {
      setExportPlanError(
        "Select a release before previewing an export plan.",
      );
      return;
    }

    setExportPlanLoading(true);
    setExportPlanError(null);
    setExportValidation(null);
    setExportValidationError(null);
    setExportExecution(null);
    setExportExecutionError(null);
    setExportConfirmation("");

    try {
      const query = new URLSearchParams({
        release: selectedExportReleaseId,
        container: exportContainer,
        output: exportOutputDirectory,
      });

      if (
        selectedExportTrackId !== "all"
      ) {
        query.set(
          "track",
          selectedExportTrackId,
        );
      }

      const response = await fetch(
        `/api/export/plan?${query.toString()}`,
      );

      const result =
        (await response.json()) as
          | MetadataExportPlan
          | { error?: string };

      if (!response.ok) {
        throw new Error(
          "error" in result
            ? result.error ??
                `Export-plan request failed: HTTP ${response.status}`
            : `Export-plan request failed: HTTP ${response.status}`,
        );
      }

      setExportPlan(
        result as MetadataExportPlan,
      );
    } catch (error) {
      setExportPlan(null);
      setExportPlanError(
        error instanceof Error
          ? error.message
          : "Unknown export-plan error",
      );
    } finally {
      setExportPlanLoading(false);
    }
  };

  const requestExportValidation =
    async () => {
      if (!selectedExportReleaseId) {
        setExportValidationError(
          "Select a release before validating the export plan.",
        );
        return;
      }

      setExportValidationLoading(true);
      setExportValidationError(null);

      try {
        const query = new URLSearchParams({
          release: selectedExportReleaseId,
          container: exportContainer,
          output: exportOutputDirectory,
        });

        if (
          selectedExportTrackId !== "all"
        ) {
          query.set(
            "track",
            selectedExportTrackId,
          );
        }

        const response = await fetch(
          `/api/export/validate?${query.toString()}`,
        );

        const result =
          (await response.json()) as
            | ExportDryRunValidation
            | { error?: string };

        if (!response.ok) {
          throw new Error(
            "error" in result
              ? result.error ??
                  `Export validation failed: HTTP ${response.status}`
              : `Export validation failed: HTTP ${response.status}`,
          );
        }

        setExportValidation(
          result as ExportDryRunValidation,
        );
      } catch (error) {
        setExportValidation(null);
        setExportValidationError(
          error instanceof Error
            ? error.message
            : "Unknown export validation error",
        );
      } finally {
        setExportValidationLoading(false);
      }
    };

  const requestExportExecution =
    async () => {
      if (
        !exportValidation?.canExport
      ) {
        setExportExecutionError(
          "Run a successful dry-run validation before exporting.",
        );
        return;
      }

      if (
        exportConfirmation !==
        EXPORT_CONFIRMATION_PHRASE
      ) {
        setExportExecutionError(
          `Type ${EXPORT_CONFIRMATION_PHRASE} exactly to confirm.`,
        );
        return;
      }

      setExportExecutionLoading(true);
      setExportExecutionError(null);
      setExportExecution(null);

      try {
        const response = await fetch(
          "/api/export/execute",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              releaseId:
                selectedExportReleaseId,
              container:
                exportContainer,
              outputDirectory:
                exportOutputDirectory,
              ...(selectedExportTrackId !==
              "all"
                ? {
                    trackId:
                      selectedExportTrackId,
                  }
                : {}),
              confirmation:
                exportConfirmation,
            }),
          },
        );

        const result =
          (await response.json()) as
            | ExportExecutionResult
            | { error?: string };

        if (!response.ok) {
          throw new Error(
            "error" in result
              ? result.error ??
                  `Export execution failed: HTTP ${response.status}`
              : `Export execution failed: HTTP ${response.status}`,
          );
        }

        setExportExecution(
          result as ExportExecutionResult,
        );
        setExportConfirmation("");
        setExportValidation(null);
      } catch (error) {
        setExportExecutionError(
          error instanceof Error
            ? error.message
            : "Unknown export execution error",
        );
      } finally {
        setExportExecutionLoading(false);
      }
    };

  const scopes = useMemo(
    () =>
      Array.from(
        new Set(
          fields.map((field) => field.scope),
        ),
      ).sort(),
    [fields],
  );

  const visibleFields = useMemo(() => {
    const normalizedSearch =
      searchText.trim().toLowerCase();

    return fields.filter((field) => {
      if (
        scopeFilter !== "all" &&
        field.scope !== scopeFilter
      ) {
        return false;
      }

      const status =
        getCompatibilityStatus(field);

      if (
        statusFilter !== "all" &&
        status !== statusFilter
      ) {
        return false;
      }

      if (playerFilter !== "all") {
        const playerAliases =
          field.aliases?.players?.[
            playerFilter as
              | "vlc"
              | "appleMusic"
              | "windowsMediaPlayer"
              | "windowsMediaPlayerLegacy"
          ] ?? [];

        const playerResults =
          field.playerCompatibility?.filter(
            (result) =>
              result.player === playerFilter,
          ) ?? [];

        if (
          playerAliases.length === 0 &&
          playerResults.length === 0
        ) {
          return false;
        }
      }

      if (!normalizedSearch) {
        return true;
      }

      const searchable = [
        field.label,
        field.tomlPath,
        field.description,
        field.scope,
        field.storageFileRole,
        ...(field.aliases?.ffmpeg ?? []),
        ...(field.aliases?.id3 ?? []),
        ...(field.aliases?.vorbis ?? []),
        ...(field.aliases?.mp4 ?? []),
        ...(field.aliases?.riff ?? []),
        ...(field.aliases?.players?.vlc ??
          []),
        ...(field.aliases?.players
          ?.appleMusic ?? []),
      ]
        .join(" ")
        .toLowerCase();

      return searchable.includes(
        normalizedSearch,
      );
    });
  }, [
    fields,
    playerFilter,
    scopeFilter,
    searchText,
    statusFilter,
  ]);

  const exportSummary = useMemo(() => {
    const guidance = fields.map((field) => ({
      field,
      guidance: getExportGuidance(
        field,
        exportContainer,
      ),
    }));

    const counts = {
      supported: 0,
      normalized: 0,
      omitted: 0,
      unverified: 0,
    };

    for (const item of guidance) {
      counts[item.guidance.status] += 1;
    }

    const recommended = guidance
      .filter(
        (item) =>
          coreExportPaths.has(
            item.field.tomlPath,
          ) &&
          (
            item.guidance.status ===
              "supported" ||
            item.guidance.status ===
              "normalized"
          ),
      )
      .map((item) => item.field.label);

    return {
      counts,
      recommended,
    };
  }, [exportContainer, fields]);

  return (
    <section className="compatibility-view">
      <header className="compatibility-header">
        <div>
          <p className="eyebrow">
            Registry evidence
          </p>
          <h2>Metadata compatibility</h2>
          <p>
            Canonical TOML fields, container
            tags, and player-visible mappings.
            Windows mappings remain unverified.
          </p>
        </div>

        <div className="compatibility-header-actions">
          <strong>
            {visibleFields.length} of{" "}
            {fields.length} fields
          </strong>

          <button
            type="button"
            className="reference-menu-button"
            aria-label="Open compatibility reference menu"
            aria-expanded={referenceMenuOpen}
            onClick={() =>
              setReferenceMenuOpen(true)
            }
          >
            <span aria-hidden="true">☰</span>
            <span>Reference</span>
          </button>
        </div>
      </header>

      <section
        className="compatibility-filters"
        aria-label="Compatibility filters"
      >
        <label>
          <span>Search</span>
          <input
            type="search"
            value={searchText}
            placeholder="Field, path, tag, player label…"
            onChange={(event) =>
              setSearchText(
                event.currentTarget.value,
              )
            }
          />
        </label>

        <label>
          <span>Scope</span>
          <select
            value={scopeFilter}
            onChange={(event) =>
              setScopeFilter(
                event.currentTarget.value,
              )
            }
          >
            <option value="all">
              All scopes
            </option>
            {scopes.map((scope) => (
              <option
                key={scope}
                value={scope}
              >
                {scope}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Player</span>
          <select
            value={playerFilter}
            onChange={(event) =>
              setPlayerFilter(
                event.currentTarget.value,
              )
            }
          >
            <option value="all">
              All players
            </option>
            <option value="vlc">VLC</option>
            <option value="appleMusic">
              Apple Music
            </option>
            <option value="windowsMediaPlayer">
              Windows Media Player
            </option>
            <option value="windowsMediaPlayerLegacy">
              Windows Media Player Legacy
            </option>
          </select>
        </label>

        <label>
          <span>Status</span>
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(
                event.currentTarget
                  .value as
                  CompatibilityStatusFilter,
              )
            }
          >
            <option value="all">
              All statuses
            </option>
            <option value="verified">
              Verified
            </option>
            <option value="partial">
              Partial
            </option>
            <option value="not-visible">
              Not visible
            </option>
            <option value="unverified">
              Unverified
            </option>
          </select>
        </label>

        <label>
          <span>Export container</span>
          <select
            value={exportContainer}
            onChange={(event) =>
              setExportContainer(
                event.currentTarget
                  .value as ExportContainer,
              )
            }
          >
            {Object.entries(
              exportContainerLabels,
            ).map(([value, label]) => (
              <option
                key={value}
                value={value}
              >
                {label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="export-guidance-summary">
        <header>
          <div>
            <p className="eyebrow">
              Selected export target
            </p>
            <h3>
              {
                exportContainerLabels[
                  exportContainer
                ]
              }
            </h3>
          </div>

          <div className="export-guidance-counts">
            <span className="guidance-supported">
              {exportSummary.counts.supported}
              {" supported"}
            </span>
            <span className="guidance-normalized">
              {exportSummary.counts.normalized}
              {" normalized"}
            </span>
            <span className="guidance-omitted">
              {exportSummary.counts.omitted}
              {" omitted"}
            </span>
            <span className="guidance-unverified">
              {exportSummary.counts.unverified}
              {" unverified"}
            </span>
          </div>
        </header>

        <p>
          <strong>
            Recommended core fields:
          </strong>{" "}
          {exportSummary.recommended.length >
          0
            ? exportSummary.recommended.join(
                ", ",
              )
            : "No verified core fields for this target."}
        </p>
      </section>

      <section className="export-plan-preview">
        <header>
          <div>
            <p className="eyebrow">
              Read-only preview
            </p>
            <h3>Export plan</h3>
            <p>
              Preview source files,
              destination names, and
              canonical-field-to-tag mappings.
              This endpoint performs no
              filesystem writes.
            </p>
          </div>
        </header>

        <section className="ffmpeg-capability-panel">
          <div>
            <p className="eyebrow">
              Local FFmpeg
            </p>

            {ffmpegCapabilitiesLoading ? (
              <strong>
                Checking encoder availability…
              </strong>
            ) : ffmpegCapabilities ? (
              <>
                <strong>
                  {ffmpegCapabilities.available
                    ? `FFmpeg ${ffmpegCapabilities.version ?? "unknown"}`
                    : "FFmpeg unavailable"}
                </strong>
                <span>
                  {ffmpegCapabilities.available
                    ? `${ffmpegCapabilities.encoders.length} encoders detected`
                    : ffmpegCapabilities.error ??
                      "The ffmpeg executable could not be run."}
                </span>
              </>
            ) : (
              <strong>
                Capability check unavailable
              </strong>
            )}
          </div>

          <div className="ffmpeg-capability-selection">
            {selectedContainerCapability ? (
              <>
                <span
                  className={`ffmpeg-capability-status status-${selectedContainerCapability.status}`}
                >
                  {
                    selectedContainerCapability.status
                  }
                </span>
                <code>
                  {selectedContainerCapability.selectedEncoder ??
                    selectedContainerCapability.preferredEncoder}
                </code>
                <small>
                  {
                    selectedContainerCapability.note
                  }
                </small>
              </>
            ) : (
              <small>
                No capability result is available
                for the selected container.
              </small>
            )}
          </div>

          <button
            type="button"
            disabled={
              ffmpegCapabilitiesLoading
            }
            onClick={() =>
              void refreshFfmpegCapabilities()
            }
          >
            Recheck FFmpeg
          </button>
        </section>

        {ffmpegCapabilitiesError && (
          <p className="message error">
            {ffmpegCapabilitiesError}
          </p>
        )}

        <div className="export-plan-controls">
          <label>
            <span>Release</span>
            <select
              value={
                selectedExportReleaseId
              }
              onChange={(event) => {
                setSelectedExportReleaseId(
                  event.currentTarget.value,
                );
                setSelectedExportTrackId(
                  "all",
                );
                setExportPlan(null);
              }}
            >
              {releases.length === 0 && (
                <option value="">
                  No releases available
                </option>
              )}

              {releases.map((release) => (
                <option
                  key={release.id}
                  value={release.id}
                >
                  {release.id}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Track scope</span>
            <select
              value={selectedExportTrackId}
              disabled={
                !selectedExportRelease
              }
              onChange={(event) => {
                setSelectedExportTrackId(
                  event.currentTarget.value,
                );
                setExportPlan(null);
              }}
            >
              <option value="all">
                All tracks
              </option>

              {selectedExportRelease
                ?.tracks.map((track) => (
                  <option
                    key={track.id}
                    value={track.id}
                  >
                    {track.id}
                  </option>
                ))}
            </select>
          </label>

          <label>
            <span>
              Relative output directory
            </span>
            <input
              type="text"
              value={
                exportOutputDirectory
              }
              onChange={(event) => {
                setExportOutputDirectory(
                  event.currentTarget.value,
                );
                setExportPlan(null);
              }}
            />
          </label>

          <button
            type="button"
            disabled={
              exportPlanLoading ||
              !selectedExportReleaseId
            }
            onClick={() =>
              void requestExportPlan()
            }
          >
            {exportPlanLoading
              ? "Building preview…"
              : "Preview export plan"}
          </button>
        </div>

        {exportPlanError && (
          <p className="message error">
            {exportPlanError}
          </p>
        )}

        {exportPlan && (
          <div className="export-plan-results">
            <div className="export-plan-summary">
              <span>
                {exportPlan.summary.readyCount}
                {" ready"}
              </span>
              <span>
                {
                  exportPlan.summary
                    .blockedCount
                }
                {" blocked"}
              </span>
              <span>
                {
                  exportPlan.summary
                    .writeCount
                }
                {" direct writes"}
              </span>
              <span>
                {
                  exportPlan.summary
                    .normalizedCount
                }
                {" normalized"}
              </span>
              <span>
                {
                  exportPlan.summary
                    .omittedCount
                }
                {" omitted"}
              </span>
            </div>

            {exportPlan.items.map(
              (item) => (
                <article
                  key={item.trackId}
                  className={`export-plan-item action-${item.action}`}
                >
                  <header>
                    <div>
                      <strong>
                        {item.trackId}
                      </strong>
                      <code>
                        {item.sourceAudioRelativePath ??
                          "No source audio"}
                      </code>
                    </div>

                    <span>
                      {item.action}
                    </span>
                  </header>

                  {item.destinationRelativePath && (
                    <p>
                      <strong>
                        Destination:
                      </strong>{" "}
                      <code>
                        {
                          item.destinationRelativePath
                        }
                      </code>
                    </p>
                  )}

                  {item.warnings.map(
                    (warning) => (
                      <p
                        key={warning}
                        className="message warning"
                      >
                        {warning}
                      </p>
                    ),
                  )}

                  <details className="export-plan-field-disclosure">
                    <summary>
                      <span
                        className="export-plan-field-disclosure-triangle"
                        aria-hidden="true"
                      />
                      <strong>
                        Field mappings
                      </strong>
                      <span>
                        {item.fields.length}
                      </span>
                    </summary>

                    <div className="export-plan-field-table-wrap">
                      <table className="export-plan-field-table">
                        <thead>
                          <tr>
                            <th>
                              Canonical field
                            </th>
                            <th>Target tag</th>
                            <th>Value</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {item.fields.map(
                            (field) => (
                              <tr
                                key={[
                                  field.canonicalPath,
                                  field.sourceDocument,
                                ].join(":")}
                              >
                                <th scope="row">
                                  <strong>
                                    {field.label}
                                  </strong>
                                  <code>
                                    {
                                      field.canonicalPath
                                    }
                                  </code>
                                </th>
                                <td>
                                  <code>
                                    {field.targetTags
                                      .length > 0
                                      ? field.targetTags.join(
                                          ", ",
                                        )
                                      : "—"}
                                  </code>
                                </td>
                                <td>
                                  {formatMetadataValue(
                                    field.value,
                                  )}
                                </td>
                                <td>
                                  <span
                                    className={`export-plan-field-status status-${field.status}`}
                                    title={
                                      field.note
                                    }
                                  >
                                    {
                                      field.status
                                    }
                                  </span>
                                </td>
                              </tr>
                            ),
                          )}
                        </tbody>
                      </table>
                    </div>
                  </details>
                </article>
              ),
            )}
          </div>
        )}

        {exportPlan && (
          <div className="export-validation-controls">
            <button
              type="button"
              disabled={exportValidationLoading}
              onClick={() =>
                void requestExportValidation()
              }
            >
              {exportValidationLoading
                ? "Validating dry run…"
                : "Validate dry run"}
            </button>

            <span>
              Checks filesystem paths and encoder
              readiness without running FFmpeg.
            </span>
          </div>
        )}

        {exportValidationError && (
          <p className="message error">
            {exportValidationError}
          </p>
        )}

        {exportValidation && (
          <section className="export-validation-results">
            <header>
              <div>
                <p className="card-type">
                  Read-only dry run
                </p>
                <h3>Export validation</h3>
                <code>
                  {exportValidation.outputRoot}
                </code>
              </div>

              <span
                className={`export-validation-overall ${
                  exportValidation.canExport
                    ? "status-ready"
                    : "status-blocked"
                }`}
              >
                {exportValidation.canExport
                  ? "Validation passed"
                  : "Export blocked"}
              </span>
            </header>

            <div className="export-plan-summary">
              <span>
                {exportValidation.summary.readyCount}
                {" ready"}
              </span>
              <span>
                {
                  exportValidation.summary
                    .warningCount
                }
                {" warnings"}
              </span>
              <span>
                {
                  exportValidation.summary
                    .blockedCount
                }
                {" blocked"}
              </span>
            </div>

            {exportValidation.items.map(
              (item) => {
                const plannedItem =
                  exportPlan?.items.find(
                    (planItem) =>
                      planItem.trackId ===
                      item.trackId,
                  );

                return (
                  <details
                    key={item.trackId}
                    className={`export-validation-item status-${item.status}`}
                  >
                    <summary>
                      <span className="export-validation-summary-main">
                        <span
                          className="export-validation-disclosure"
                          aria-hidden="true"
                        />
                        <strong>{item.trackId}</strong>
                      </span>

                      <span className="export-validation-item-status">
                        {item.status}
                      </span>
                    </summary>

                    <div className="export-validation-item-details">
                      <div className="export-validation-paths">
                        <div>
                          <strong>Source audio</strong>
                          <code>
                            {plannedItem?.sourceAudioRelativePath ??
                              "No source audio selected"}
                          </code>
                        </div>

                        <div>
                          <strong>Destination file</strong>
                          <code>
                            {plannedItem?.destinationRelativePath ??
                              "No destination selected"}
                          </code>
                        </div>
                      </div>

                      <ul>
                        {item.checks.map(
                          (itemCheck) => (
                            <li
                              key={`${item.trackId}:${itemCheck.code}`}
                              className={`status-${itemCheck.status}`}
                            >
                              <strong>
                                {itemCheck.code.replaceAll(
                                  "-",
                                  " ",
                                )}
                              </strong>
                              <span>
                                {itemCheck.message}
                              </span>
                            </li>
                          ),
                        )}
                      </ul>
                    </div>
                  </details>
                );
              },
            )}
          </section>
        )}


        {exportValidation?.canExport && (
          <section className="export-execution-gate">
            <header>
              <div>
                <p className="eyebrow">
                  Create-only execution
                </p>
                <h3>Execute validated export</h3>
              </div>

              <span className="status-warning">
                Writes media files
              </span>
            </header>

            <p>
              The server rebuilds and validates the
              plan immediately before execution.
              Existing destination files are never
              replaced.
            </p>

            <label>
              <span>
                Type{" "}
                <code>
                  {EXPORT_CONFIRMATION_PHRASE}
                </code>{" "}
                to confirm
              </span>
              <input
                type="text"
                autoComplete="off"
                aria-describedby="export-confirmation-help"
                value={exportConfirmation}
                onChange={(event) =>
                  setExportConfirmation(
                    event.currentTarget.value,
                  )
                }
              />
            </label>

            <p
              id="export-confirmation-help"
              className={`export-confirmation-help ${
                exportConfirmation ===
                EXPORT_CONFIRMATION_PHRASE
                  ? "status-ready"
                  : ""
              }`}
              aria-live="polite"
            >
              {exportConfirmation ===
              EXPORT_CONFIRMATION_PHRASE
                ? "Confirmation phrase matches. Export execution is enabled."
                : `Enter ${EXPORT_CONFIRMATION_PHRASE} exactly to enable execution.`}
            </p>

            <button
              type="button"
              className={
                exportExecutionLoading
                  ? "is-loading"
                  : undefined
              }
              disabled={
                exportExecutionLoading ||
                exportConfirmation !==
                  EXPORT_CONFIRMATION_PHRASE
              }
              onClick={() =>
                void requestExportExecution()
              }
            >
              {exportExecutionLoading
                ? "Creating exports…"
                : "Create validated exports"}
            </button>
          </section>
        )}

        {exportExecutionError && (
          <p className="message error">
            {exportExecutionError}
          </p>
        )}

        {exportExecution && (
          <section className="export-execution-results">
            <header>
              <div>
                <p className="eyebrow">
                  Export receipts
                </p>
                <h3>Execution results</h3>
              </div>

              <div className="export-plan-summary">
                <span>
                  {
                    exportExecution.summary
                      .createdCount
                  }
                  {" created"}
                </span>
                <span>
                  {
                    exportExecution.summary
                      .failedCount
                  }
                  {" failed"}
                </span>
              </div>
            </header>

            {exportExecution.items.map(
              (item) => (
                <details
                  key={item.trackId}
                  className={`export-execution-item status-${item.status}`}
                >
                  <summary>
                    <strong>{item.trackId}</strong>
                    <span>{item.status}</span>
                  </summary>

                  <div>
                    {item.destinationRelativePath && (
                      <p>
                        <strong>
                          Destination
                        </strong>
                        <code>
                          {
                            item.destinationRelativePath
                          }
                        </code>
                      </p>
                    )}

                    {item.encoder && (
                      <p>
                        <strong>Encoder</strong>
                        <code>{item.encoder}</code>
                      </p>
                    )}

                    {item.sha256 && (
                      <p>
                        <strong>SHA-256</strong>
                        <code>{item.sha256}</code>
                      </p>
                    )}

                    {typeof item.sizeBytes ===
                      "number" && (
                      <p>
                        <strong>Size</strong>
                        <span>
                          {item.sizeBytes} bytes
                        </span>
                      </p>
                    )}

                    {item.error && (
                      <p className="message error">
                        {item.error}
                      </p>
                    )}
                  </div>
                </details>
              ),
            )}
          </section>
        )}
      </section>

      {referenceMenuOpen && (
        <div
          className="reference-menu-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setReferenceMenuOpen(false);
            }
          }}
        >
          <aside
            className="reference-menu-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reference-menu-title"
          >
            <header className="reference-menu-header">
              <div>
                <p className="eyebrow">
                  Compatibility reference
                </p>
                <h2 id="reference-menu-title">
                  Legend and media players
                </h2>
                <p>
                  Detailed tag mappings are kept
                  here so the export workflow stays
                  focused.
                </p>
              </div>

              <button
                type="button"
                className="reference-menu-close"
                aria-label="Close compatibility reference menu"
                onClick={() =>
                  setReferenceMenuOpen(false)
                }
              >
                ×
              </button>
            </header>

            <section
              className="reference-status-legend"
              aria-label="Compatibility status legend"
            >
              <span className="compatibility-status status-verified">
                Verified
              </span>
              <span className="compatibility-status status-partial">
                Partial
              </span>
              <span className="compatibility-status status-not-visible">
                Not visible
              </span>
              <span className="compatibility-status status-unverified">
                Unverified
              </span>
            </section>

            <p className="reference-menu-count">
              Showing {visibleFields.length} of{" "}
              {fields.length} fields using the
              current filters.
            </p>

      {visibleFields.length === 0 ? (
                    <p className="empty-state">
                      No registry fields match these
                      filters.
                    </p>
                  ) : (
                    <div className="compatibility-table-wrap">
                      <table className="compatibility-table">
                        <thead>
                          <tr>
                            <th>Canonical field</th>
                            <th>FFmpeg</th>
                            <th>ID3</th>
                            <th>Vorbis</th>
                            <th>MP4</th>
                            <th>RIFF</th>
                            <th>
                              Export guidance
                            </th>
                            <th>VLC</th>
                            <th>Apple Music</th>
                            <th>
                              Windows Media Player
                            </th>
                            <th>
                              Windows Media Player Legacy
                            </th>
                          </tr>
                        </thead>
            
                        <tbody>
                          {visibleFields.map((field) => {
                            const status =
                              getCompatibilityStatus(
                                field,
                              );
            
                            return (
                              <tr key={field.id}>
                                <th scope="row">
                                  <div className="compatibility-field">
                                    <strong>
                                      {field.label}
                                    </strong>
                                    <code>
                                      {field.tomlPath}
                                    </code>
                                    <span>
                                      {field.scope}
                                      {" · "}
                                      {field.valueType}
                                    </span>
                                    <small>
                                      {field.description}
                                    </small>
                                    <span
                                      className={`compatibility-status status-${status}`}
                                    >
                                      {status.replace(
                                        "-",
                                        " ",
                                      )}
                                    </span>
                                  </div>
                                </th>
                                <td>
                                  {formatAliasValues(
                                    field.aliases?.ffmpeg,
                                  )}
                                </td>
                                <td>
                                  {formatAliasValues(
                                    field.aliases?.id3,
                                  )}
                                </td>
                                <td>
                                  {formatAliasValues(
                                    field.aliases?.vorbis,
                                  )}
                                </td>
                                <td>
                                  {formatAliasValues(
                                    field.aliases?.mp4,
                                  )}
                                </td>
                                <td>
                                  {formatAliasValues(
                                    field.aliases?.riff,
                                  )}
                                </td>
                                <td>
                                  <ExportGuidanceCell
                                    field={field}
                                    container={
                                      exportContainer
                                    }
                                  />
                                </td>
                                <td>
                                  <CompatibilityPlayerCell
                                    field={field}
                                    player="vlc"
                                  />
                                </td>
                                <td>
                                  <CompatibilityPlayerCell
                                    field={field}
                                    player="appleMusic"
                                  />
                                </td>
                                <td>
                                  <CompatibilityPlayerCell
                                    field={field}
                                    player="windowsMediaPlayer"
                                  />
                                </td>
                                <td>
                                  <CompatibilityPlayerCell
                                    field={field}
                                    player="windowsMediaPlayerLegacy"
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
            
          </aside>
        </div>
      )}
    </section>
  );
}

function ExportGuidanceCell({
  field,
  container,
}: {
  field: MetadataFieldDefinition;
  container: ExportContainer;
}) {
  const guidance = getExportGuidance(
    field,
    container,
  );

  return (
    <div className="export-guidance-cell">
      <span
        className={`export-guidance-status guidance-${guidance.status}`}
      >
        {guidance.status}
      </span>

      <code>
        {guidance.tags.length > 0
          ? guidance.tags.join(", ")
          : "No registered tag"}
      </code>

      <small>{guidance.note}</small>
    </div>
  );
}

function CompatibilityPlayerCell({
  field,
  player,
}: {
  field: MetadataFieldDefinition;
  player:
    | "vlc"
    | "appleMusic"
    | "windowsMediaPlayer"
    | "windowsMediaPlayerLegacy";
}) {
  const aliases =
    field.aliases?.players?.[player] ?? [];

  const results =
    field.playerCompatibility?.filter(
      (result) =>
        result.player === player,
    ) ?? [];

  if (
    aliases.length === 0 &&
    results.length === 0
  ) {
    return (
      <span className="compatibility-unverified">
        Not verified
      </span>
    );
  }

  return (
    <div className="compatibility-player-cell">
      <strong>
        {aliases.length > 0
          ? aliases.join(", ")
          : "No visible label"}
      </strong>

      {results.map((result) => (
        <details
          key={[
            result.player,
            result.status,
            result.containers.join("-"),
          ].join(":")}
        >
          <summary>
            <span
              className={`compatibility-status status-${result.status}`}
            >
              {result.status.replace(
                "-",
                " ",
              )}
            </span>
            {result.containers.join(", ")}
          </summary>
          <p>{result.note}</p>
        </details>
      ))}
    </div>
  );
}

function StagingWorkspace({
  inspection,
  releases,
  inspectionError,
  onChooseCandidate,
  onBackToInspection,
  onOpenRelease,
  onReleaseCreated,
}: {
  inspection: IngestCandidateInspection | null;
  releases: ReleaseScanResult[];
  inspectionError: string | null;
  onChooseCandidate: () => void;
  onBackToInspection: () => void;
  onOpenRelease: (releaseId: string) => void;
  onReleaseCreated: (
    releaseId: string,
  ) => void | Promise<void>;
}) {
  if (inspection) {
    return (
      <Suspense
        fallback={
          <section
            className="workflow-workspace"
            aria-live="polite"
          >
            <p>Loading staging workspace…</p>
          </section>
        }
      >
        <LazyIngestReleaseBuilder
          inspection={inspection}
          onCancel={onBackToInspection}
          onReleaseCreated={onReleaseCreated}
        />
      </Suspense>
    );
  }

  return (
    <section className="workflow-workspace staging-workspace">
      <header className="workflow-workspace-header">
        <div>
          <p className="eyebrow">Step 2 · Staging</p>
          <h2>Build or update a release workspace</h2>
          <p>
            Staging turns one inspected ingest candidate
            into a reviewed release plan. Select a source
            candidate in Ingest before configuring track
            order, destinations, and create/update actions.
          </p>
        </div>
        <button
          type="button"
          className="primary-button"
          onClick={onChooseCandidate}
        >
          Choose ingest candidate
        </button>
      </header>

      <div className="workflow-workspace-notice">
        <strong>No candidate selected</strong>
        <span>
          Inspect a candidate first. Returning to this tab
          preserves the selected inspection and opens its
          staging builder or updater.
        </span>
      </div>

      {inspectionError && (
        <p className="message error">
          {inspectionError}
        </p>
      )}

      <section className="workflow-table-panel">
        <header>
          <div>
            <h3>Existing release workspaces</h3>
            <p>
              These library releases can be targeted by an
              incremental update when a matching release ID
              is configured in the staging builder.
            </p>
          </div>
          <strong>{releases.length} releases</strong>
        </header>

        <div className="workflow-table-scroll">
          <table className="workflow-workspace-table staging-release-table">
            <thead>
              <tr>
                <th scope="col">Release</th>
                <th scope="col" className="numeric">Tracks</th>
                <th scope="col" className="numeric">Audio masters</th>
                <th scope="col">Metadata</th>
                <th scope="col">Update behavior</th>
                <th scope="col" className="action-column">Action</th>
              </tr>
            </thead>
            <tbody>
              {releases.length === 0 ? (
                <tr>
                  <td colSpan={6} className="workflow-empty-cell">
                    No staged release workspaces were found in the configured library root.
                  </td>
                </tr>
              ) : (
                releases.map((release) => {
                  const readiness =
                    summarizeReleaseScanReadiness(release);
                  const masterCount = release.tracks.reduce(
                    (count, track) =>
                      count + track.audioMasters.length,
                    0,
                  );

                  return (
                    <tr key={release.id}>
                      <th scope="row">
                        <strong>{formatReleaseTitle(release.id)}</strong>
                        <code>{release.relativePath}</code>
                      </th>
                      <td className="numeric">{release.tracks.length}</td>
                      <td className="numeric">{masterCount}</td>
                      <td>
                        <span
                          className={`badge ${readinessTone(readiness)}`}
                        >
                          {readinessBadgeLabel(readiness)}
                        </span>
                      </td>
                      <td>
                        Preserve authored files; add new
                        tracks and apply validated numbering
                        changes only.
                      </td>
                      <td className="action-column">
                        <button
                          type="button"
                          onClick={() => onOpenRelease(release.id)}
                        >
                          Open Library
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function assessPublishReadiness(
  release: ReleaseScanResult,
): {
  metadataLabel: string;
  metadataTone: string;
  masterLabel: string;
  playbackLabel: string;
  artworkLabel: string;
  preflightLabel: string;
  preflightTone: string;
  note: string;
} {
  const metadata = summarizeReleaseScanReadiness(release);
  const readyMasters = release.tracks.filter(
    (track) => track.audioMasters.length === 1,
  ).length;
  const playbackCount = release.tracks.filter(
    (track) => track.playbackAudio !== undefined,
  ).length;
  const artworkCount =
    release.artworkMasters.length +
    release.tracks.reduce(
      (count, track) =>
        count + track.artworkMasters.length,
      0,
    );
  const metadataBlockers = metadata.core + metadata.credits;
  const masterBlockers =
    release.tracks.length === 0 ||
    readyMasters !== release.tracks.length;

  if (metadataBlockers > 0 || masterBlockers) {
    return {
      metadataLabel: readinessBadgeLabel(metadata),
      metadataTone: readinessTone(metadata),
      masterLabel: `${readyMasters}/${release.tracks.length} unambiguous`,
      playbackLabel: `${playbackCount}/${release.tracks.length} available`,
      artworkLabel: `${artworkCount} source${artworkCount === 1 ? "" : "s"}`,
      preflightLabel: "Needs work",
      preflightTone: "missing",
      note:
        "Resolve core/credit metadata gaps and ensure exactly one audio master per track before release-wide preflight.",
    };
  }

  if (
    playbackCount !== release.tracks.length ||
    artworkCount === 0 ||
    metadata.supplemental > 0
  ) {
    return {
      metadataLabel: readinessBadgeLabel(metadata),
      metadataTone: readinessTone(metadata),
      masterLabel: `${readyMasters}/${release.tracks.length} unambiguous`,
      playbackLabel: `${playbackCount}/${release.tracks.length} available`,
      artworkLabel: `${artworkCount} source${artworkCount === 1 ? "" : "s"}`,
      preflightLabel: "Review candidate",
      preflightTone: "warning",
      note:
        "Core sources are present. Prepare missing playback media, review optional metadata, and confirm artwork before publishing.",
    };
  }

  return {
    metadataLabel: readinessBadgeLabel(metadata),
    metadataTone: readinessTone(metadata),
    masterLabel: `${readyMasters}/${release.tracks.length} unambiguous`,
    playbackLabel: `${playbackCount}/${release.tracks.length} available`,
    artworkLabel: `${artworkCount} source${artworkCount === 1 ? "" : "s"}`,
    preflightLabel: "Preflight candidate",
    preflightTone: "preview",
    note:
      "Visible prerequisites look complete, but consolidated preflight and deployment writes are not enabled yet.",
  };
}

function PublishWorkspace({
  releases,
  loading,
  error,
  onRefresh,
  onOpenRelease,
  onOpenWorkflowHelp,
}: {
  releases: ReleaseScanResult[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onOpenRelease: (releaseId: string) => void;
  onOpenWorkflowHelp: () => void;
}) {
  return (
    <section className="workflow-workspace publish-workspace">
      <header className="workflow-workspace-header">
        <div>
          <p className="eyebrow">Step 4 · Publish</p>
          <h2>Preflight and deploy releases</h2>
          <p>
            Review private-library readiness before a
            sanitized player-facing deployment is built.
            This workspace is intentionally read-only until
            consolidated preflight and atomic publishing are
            implemented.
          </p>
        </div>
        <div className="workflow-workspace-actions">
          <button
            type="button"
            disabled={loading}
            onClick={onRefresh}
          >
            {loading ? "Refreshing…" : "Refresh readiness"}
          </button>
          <button
            type="button"
            onClick={onOpenWorkflowHelp}
          >
            Publishing guide
          </button>
        </div>
      </header>

      <div className="workflow-workspace-notice planned">
        <strong>Publishing writes are not enabled</strong>
        <span>
          The table consolidates currently visible evidence.
          It does not mark a release Ready, generate a public
          snapshot, or change deployment output.
        </span>
      </div>

      {error && (
        <p className="message error">{error}</p>
      )}

      <section className="workflow-table-panel">
        <header>
          <div>
            <h3>Release readiness overview</h3>
            <p>
              Open a release in Library to resolve metadata,
              source, playback, artwork, or derivative gaps.
            </p>
          </div>
          <strong>{releases.length} releases</strong>
        </header>

        <div className="workflow-table-scroll">
          <table className="workflow-workspace-table publish-readiness-table">
            <thead>
              <tr>
                <th scope="col">Release</th>
                <th scope="col">Metadata</th>
                <th scope="col">Audio masters</th>
                <th scope="col">Playback media</th>
                <th scope="col">Artwork</th>
                <th scope="col">Preflight</th>
                <th scope="col">Current guidance</th>
                <th scope="col">Publication</th>
                <th scope="col" className="action-column">Action</th>
              </tr>
            </thead>
            <tbody>
              {releases.length === 0 ? (
                <tr>
                  <td colSpan={9} className="workflow-empty-cell">
                    No releases are available for readiness review.
                  </td>
                </tr>
              ) : (
                releases.map((release) => {
                  const assessment =
                    assessPublishReadiness(release);

                  return (
                    <tr key={release.id}>
                      <th scope="row">
                        <strong>{formatReleaseTitle(release.id)}</strong>
                        <code>{release.relativePath}</code>
                      </th>
                      <td>
                        <span className={`badge ${assessment.metadataTone}`}>
                          {assessment.metadataLabel}
                        </span>
                      </td>
                      <td>{assessment.masterLabel}</td>
                      <td>{assessment.playbackLabel}</td>
                      <td>{assessment.artworkLabel}</td>
                      <td>
                        <span className={`badge ${assessment.preflightTone}`}>
                          {assessment.preflightLabel}
                        </span>
                      </td>
                      <td>{assessment.note}</td>
                      <td>
                        <span className="badge planned">
                          Not enabled
                        </span>
                      </td>
                      <td className="action-column">
                        <button
                          type="button"
                          onClick={() => onOpenRelease(release.id)}
                        >
                          Open Library
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

function IngestView({
  scan,
  error,
  loading,
  inspection,
  inspectionError,
  inspectionLoading,
  onRefresh,
  onInspect,
  onBackToCandidates,
  onOpenStaging,
}: {
  scan: IngestScanResult | null;
  error: string | null;
  loading: boolean;
  inspection: IngestCandidateInspection | null;
  inspectionError: string | null;
  inspectionLoading: boolean;
  onRefresh: () => void;
  onInspect: (candidateId: string) => void;
  onBackToCandidates: () => void;
  onOpenStaging: () => void;
}) {
  if (inspection) {
    return (
      <IngestCandidateInspectionView
        inspection={inspection}
        onBack={onBackToCandidates}
        onOpenStaging={onOpenStaging}
      />
    );
  }

  return (
    <section className="ingest-view">
      <header className="ingest-view-header">
        <div>
          <p className="eyebrow">
            Step 1 · Ingest
          </p>
          <h2>Ingest drop</h2>
          <p>
            Inspect top-level folders and loose media,
            then continue with the selected candidate in
            Staging.
          </p>
        </div>

        <button
          type="button"
          disabled={loading}
          onClick={onRefresh}
        >
          {loading
            ? "Inspecting drop…"
            : "Refresh drop point"}
        </button>
      </header>

      {error && (
        <p className="message error">{error}</p>
      )}

      {inspectionError && (
        <p className="message error">
          {inspectionError}
        </p>
      )}

      {inspectionLoading && (
        <p className="message">
          Probing candidate media with ffprobe and
          MediaInfo…
        </p>
      )}

      {scan && (
        <>
          {scan.warnings.length > 0 && (
            <section className="warning-panel">
              <h3>Inspection capabilities</h3>
              <ul>
                {scan.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </section>
          )}

          {scan.candidates.length === 0 ? (
            <p className="message">
              No eligible top-level folders or loose
              files were found.
            </p>
          ) : (
            <IngestCandidateTable
              candidates={scan.candidates}
              disabled={inspectionLoading}
              onInspect={onInspect}
            />
          )}
        </>
      )}
    </section>
  );
}

function IngestCandidateTable({
  candidates,
  disabled,
  onInspect,
}: {
  candidates: IngestCandidateSummary[];
  disabled: boolean;
  onInspect: (candidateId: string) => void;
}) {
  return (
    <section
      className="ingest-table-panel"
      aria-labelledby="ingest-candidates-heading"
    >
      <header className="ingest-table-panel-header">
        <div>
          <h3 id="ingest-candidates-heading">
            Ingest candidates
          </h3>
          <p>
            Each top-level folder or loose media file is
            treated as one read-only candidate.
          </p>
        </div>
        <strong>
          {candidates.length}{" "}
          {candidates.length === 1
            ? "candidate"
            : "candidates"}
        </strong>
      </header>

      <div className="ingest-table-scroll">
        <table className="ingest-table ingest-candidate-table">
          <thead>
            <tr>
              <th scope="col">Candidate</th>
              <th scope="col">Type</th>
              <th scope="col" className="numeric">
                Files
              </th>
              <th scope="col" className="numeric">
                Audio
              </th>
              <th scope="col" className="numeric">
                Images
              </th>
              <th scope="col" className="numeric">
                Text
              </th>
              <th scope="col" className="numeric">
                Size
              </th>
              <th scope="col">Extensions</th>
              <th scope="col">Date evidence</th>
              <th scope="col" className="action-column">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((candidate) => (
              <tr
                key={candidate.id}
                className={`ingest-candidate-row${
                  disabled ? " is-disabled" : ""
                }`}
                tabIndex={disabled ? -1 : 0}
                aria-disabled={disabled}
                aria-label={`Inspect ${candidate.displayTitle}`}
                onClick={() => {
                  if (!disabled) {
                    onInspect(candidate.id);
                  }
                }}
                onKeyDown={(event) => {
                  if (
                    disabled ||
                    event.target !== event.currentTarget
                  ) {
                    return;
                  }

                  if (
                    event.key === "Enter" ||
                    event.key === " "
                  ) {
                    event.preventDefault();
                    onInspect(candidate.id);
                  }
                }}
              >
                <th scope="row" className="ingest-sticky-column">
                  <strong>{candidate.displayTitle}</strong>
                  <code>{candidate.relativePath}</code>
                  {candidate.warnings.length > 0 && (
                    <span className="ingest-row-warning">
                      {candidate.warnings.length}{" "}
                      {candidate.warnings.length === 1
                        ? "warning"
                        : "warnings"}
                    </span>
                  )}
                </th>
                <td>
                  {candidate.kind === "folder"
                    ? "Folder"
                    : "Loose file"}
                </td>
                <td className="numeric">
                  {candidate.fileCount}
                </td>
                <td className="numeric">
                  {candidate.audioCount}
                </td>
                <td className="numeric">
                  {candidate.imageCount}
                </td>
                <td className="numeric">
                  {candidate.textCount}
                </td>
                <td className="numeric">
                  {formatByteSize(
                    candidate.totalSizeBytes,
                  )}
                </td>
                <td>
                  {candidate.extensions.length > 0
                    ? candidate.extensions.join(", ")
                    : "—"}
                </td>
                <td>
                  {candidate.dateCandidates.length > 0
                    ? candidate.dateCandidates.join(", ")
                    : "—"}
                </td>
                <td className="action-column">
                  <button
                    type="button"
                    className="primary-button"
                    disabled={disabled}
                    onClick={(event) => {
                      event.stopPropagation();
                      onInspect(candidate.id);
                    }}
                  >
                    Inspect
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function IngestCandidateInspectionView({
  inspection,
  onBack,
  onOpenStaging,
}: {
  inspection: IngestCandidateInspection;
  onBack: () => void;
  onOpenStaging: () => void;
}) {
  const { candidate } = inspection;
  const [expandedFiles, setExpandedFiles] = useState<
    string[]
  >([]);

  const toggleFile = (relativePath: string) => {
    setExpandedFiles((current) =>
      current.includes(relativePath)
        ? current.filter(
            (path) => path !== relativePath,
          )
        : [...current, relativePath],
    );
  };

  return (
    <section className="ingest-view ingest-inspection-view">
      <header
        className="ingest-view-header ingest-inspection-header"
      >
        <div className="ingest-inspection-identity">
          <button
            type="button"
            className="metadata-detail-back-button"
            aria-label="Back to ingest candidates"
            title="Back to ingest candidates"
            onClick={onBack}
          >
            <span aria-hidden="true">←</span>
          </button>

          <div>
            <p className="eyebrow">
              Candidate inspection
            </p>
            <h2>{candidate.displayTitle}</h2>
            <code>{candidate.relativePath}</code>
          </div>
        </div>
        <div className="ingest-inspection-actions">
          <span className="badge">
            {candidate.kind === "folder"
              ? "Folder candidate"
              : "Loose-file candidate"}
          </span>
          <button
            type="button"
            className="primary-button"
            disabled={candidate.audioCount === 0}
            onClick={onOpenStaging}
          >
            Continue to Staging
          </button>
        </div>
      </header>

      <section
        className="ingest-table-panel"
        aria-labelledby="candidate-summary-heading"
      >
        <header className="ingest-table-panel-header">
          <h3 id="candidate-summary-heading">
            Candidate summary
          </h3>
        </header>
        <div className="ingest-table-scroll">
          <table className="ingest-table ingest-summary-table">
            <thead>
              <tr>
                <th scope="col">Candidate type</th>
                <th scope="col" className="numeric">
                  Files
                </th>
                <th scope="col" className="numeric">
                  Audio
                </th>
                <th scope="col" className="numeric">
                  Images
                </th>
                <th scope="col" className="numeric">
                  Text
                </th>
                <th scope="col" className="numeric">
                  Total size
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  {candidate.kind === "folder"
                    ? "Folder"
                    : "Loose file"}
                </td>
                <td className="numeric">
                  {candidate.fileCount}
                </td>
                <td className="numeric">
                  {candidate.audioCount}
                </td>
                <td className="numeric">
                  {candidate.imageCount}
                </td>
                <td className="numeric">
                  {candidate.textCount}
                </td>
                <td className="numeric">
                  {formatByteSize(
                    candidate.totalSizeBytes,
                  )}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section
        className="ingest-table-panel"
        aria-labelledby="candidate-evidence-heading"
      >
        <header className="ingest-table-panel-header">
          <div>
            <h3 id="candidate-evidence-heading">
              Inferred metadata
            </h3>
            <p>
              Deterministic local rules report suggestions,
              not authoritative metadata.
            </p>
          </div>
        </header>
        <IngestEvidenceTable
          evidence={candidate.evidence}
        />
      </section>

      {inspection.warnings.length > 0 && (
        <section className="warning-panel">
          <h3>Inspection warnings</h3>
          <ul>
            {inspection.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      )}

      <section
        className="ingest-table-panel"
        aria-labelledby="source-files-heading"
      >
        <header className="ingest-table-panel-header">
          <div>
            <h3 id="source-files-heading">
              Source files
            </h3>
            <p>
              Technical properties and embedded tags are
              collected without modifying the files.
            </p>
          </div>
          <strong>
            {inspection.files.length}{" "}
            {inspection.files.length === 1
              ? "file"
              : "files"}
          </strong>
        </header>

        <div className="ingest-table-scroll">
          <table className="ingest-table ingest-source-table">
            <thead>
              <tr>
                <th scope="col">Filename</th>
                <th scope="col">Type</th>
                <th scope="col">Container</th>
                <th scope="col">Codec</th>
                <th scope="col" className="numeric">
                  Duration
                </th>
                <th scope="col" className="numeric">
                  Sample rate
                </th>
                <th scope="col" className="numeric">
                  Channels
                </th>
                <th scope="col" className="numeric">
                  Size
                </th>
                <th scope="col">Probe</th>
                <th scope="col" className="action-column">
                  Details
                </th>
              </tr>
            </thead>
            {inspection.files.map((file) => {
              const expanded = expandedFiles.includes(
                file.relativePath,
              );

              return (
                <tbody key={file.relativePath}>
                  <tr>
                    <th
                      scope="row"
                      className="ingest-sticky-column"
                    >
                      <strong>{file.filename}</strong>
                      <code>{file.relativePath}</code>
                      {file.warnings.length > 0 && (
                        <span className="ingest-row-warning">
                          {file.warnings.length}{" "}
                          {file.warnings.length === 1
                            ? "warning"
                            : "warnings"}
                        </span>
                      )}
                    </th>
                    <td>{file.mediaKind}</td>
                    <td>
                      {file.technical.container ?? "—"}
                    </td>
                    <td>
                      {file.technical.codec ?? "—"}
                    </td>
                    <td className="numeric">
                      {file.technical.durationSeconds !==
                      undefined
                        ? formatDuration(
                            file.technical
                              .durationSeconds,
                          )
                        : "—"}
                    </td>
                    <td className="numeric">
                      {file.technical.sampleRateHz !==
                      undefined
                        ? `${file.technical.sampleRateHz.toLocaleString()} Hz`
                        : "—"}
                    </td>
                    <td className="numeric">
                      {file.technical.channels ?? "—"}
                    </td>
                    <td className="numeric">
                      {formatByteSize(file.sizeBytes)}
                    </td>
                    <td>{file.detectedBy}</td>
                    <td className="action-column">
                      <button
                        type="button"
                        aria-expanded={expanded}
                        onClick={() =>
                          toggleFile(file.relativePath)
                        }
                      >
                        {expanded
                          ? "Hide"
                          : "Details"}
                      </button>
                    </td>
                  </tr>

                  {expanded && (
                    <tr className="ingest-detail-row">
                      <td colSpan={10}>
                        <IngestFileInspectionDetail
                          file={file}
                        />
                      </td>
                    </tr>
                  )}
                </tbody>
              );
            })}
          </table>
        </div>
      </section>
    </section>
  );
}

function IngestEvidenceTable({
  evidence,
}: {
  evidence: IngestEvidence[];
}) {
  if (evidence.length === 0) {
    return (
      <p className="metadata-empty-value ingest-table-empty">
        No title or date patterns were inferred.
      </p>
    );
  }

  return (
    <div className="ingest-table-scroll">
      <table className="ingest-table ingest-evidence-table">
        <thead>
          <tr>
            <th scope="col">Metadata field</th>
            <th scope="col">Inferred value</th>
            <th scope="col">Evidence</th>
            <th scope="col">Inference confidence</th>
            <th scope="col">Rule</th>
          </tr>
        </thead>
        <tbody>
          {evidence.map((item, index) => (
            <tr
              key={`${item.field}:${item.rule}:${index}`}
            >
              <th
                scope="row"
                className="ingest-sticky-column"
              >
                {item.field}
              </th>
              <td>{String(item.value)}</td>
              <td>
                <span className="ingest-evidence-source">
                  {item.source}
                </span>
                <code>{item.rawValue}</code>
              </td>
              <td>{formatInferenceConfidence(item.confidence)}</td>
              <td>
                <code>{item.rule}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IngestFileInspectionDetail({
  file,
}: {
  file: IngestFileInspection;
}) {
  const technicalEntries = Object.entries(
    file.technical,
  ).filter(([, value]) => value !== undefined);
  const embeddedEntries = Object.entries(
    file.embeddedMetadata,
  );

  return (
    <div className="ingest-file-detail">
      <div className="ingest-file-detail-columns">
        <section>
          <h4>Technical properties</h4>
          {technicalEntries.length === 0 ? (
            <p className="metadata-empty-value">
              No normalized technical properties were
              reported.
            </p>
          ) : (
            <table className="ingest-property-table">
              <tbody>
                {technicalEntries.map(
                  ([key, value]) => (
                    <tr key={key}>
                      <th scope="row">{key}</th>
                      <td>
                        {formatIngestTechnicalValue(
                          key,
                          value,
                        )}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          )}
        </section>

        <section>
          <h4>Embedded metadata</h4>
          {embeddedEntries.length === 0 ? (
            <p className="metadata-empty-value">
              No embedded tags were reported.
            </p>
          ) : (
            <table className="ingest-property-table">
              <tbody>
                {embeddedEntries.map(
                  ([key, value]) => (
                    <tr key={key}>
                      <th scope="row">{key}</th>
                      <td>{value}</td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section className="ingest-file-evidence">
        <h4>Filename and embedded evidence</h4>
        <IngestEvidenceTable
          evidence={file.evidence}
        />
      </section>

      {file.warnings.length > 0 && (
        <ul className="ingest-warning-list">
          {file.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatInferenceConfidence(
  confidence: IngestEvidence["confidence"],
): string {
  return (
    confidence.charAt(0).toUpperCase() +
    confidence.slice(1)
  );
}

function formatIngestTechnicalValue(
  key: string,
  value: string | number,
): string {
  if (
    key === "durationSeconds" &&
    typeof value === "number"
  ) {
    return formatDuration(value);
  }

  if (
    key === "sampleRateHz" &&
    typeof value === "number"
  ) {
    return `${value.toLocaleString()} Hz`;
  }

  if (
    key === "bitRate" &&
    typeof value === "number"
  ) {
    return `${Math.round(value / 1000)} kb/s`;
  }

  if (
    (key === "width" || key === "height") &&
    typeof value === "number"
  ) {
    return `${value} px`;
  }

  return String(value);
}


function ReleaseCard({
  release,
  onLibraryChanged,
  onOpenMetadata,
  showAdminTools,
}: {
  release: ReleaseScanResult;
  onLibraryChanged: () => Promise<void>;
  onOpenMetadata: () => void;
  showAdminTools: boolean;
}) {
  const [adminToolsOpen, setAdminToolsOpen] =
    useState(false);
  const [preview, setPreview] =
    useState<LibraryMetadataPreview | null>(null);
  const [previewError, setPreviewError] =
    useState<string | null>(null);
  const [previewLoading, setPreviewLoading] =
    useState(false);
  const [generatedPreview, setGeneratedPreview] =
    useState<GeneratedMetadataPreview | null>(null);
  const [
    generatedPreviewError,
    setGeneratedPreviewError,
  ] = useState<string | null>(null);
  const [
    generatedPreviewLoading,
    setGeneratedPreviewLoading,
  ] = useState(false);
  const [generationPlan, setGenerationPlan] =
    useState<MetadataGenerationPlan | null>(null);
  const [
    generationPlanError,
    setGenerationPlanError,
  ] = useState<string | null>(null);
  const [
    generationPlanLoading,
    setGenerationPlanLoading,
  ] = useState(false);
  const [generationScope, setGenerationScope] =
    useState<MetadataGenerationScope>("all");
  const [selectedTrackId, setSelectedTrackId] =
    useState(
      release.tracks[0]?.id ?? "",
    );
  const [confirmationText, setConfirmationText] =
    useState("");
  const [creationLoading, setCreationLoading] =
    useState(false);
  const [creationError, setCreationError] =
    useState<string | null>(null);
  const [creationMessage, setCreationMessage] =
    useState<string | null>(null);

  const loadPreview = async () => {
    setPreviewLoading(true);
    setPreviewError(null);

    try {
      const query = new URLSearchParams({
        release: release.id,
      });

      const response = await fetch(
        `/api/library/preview?${query.toString()}`,
      );

      if (!response.ok) {
        throw new Error(
          `Preview failed: HTTP ${response.status}`,
        );
      }

      setPreview(
        (await response.json()) as LibraryMetadataPreview,
      );
    } catch (error) {
      setPreviewError(
        error instanceof Error
          ? error.message
          : "Unknown preview error",
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  const loadGeneratedPreview = async () => {
    setGeneratedPreviewLoading(true);
    setGeneratedPreviewError(null);

    try {
      const query = new URLSearchParams({
        release: release.id,
      });

      const response = await fetch(
        `/api/library/generated-preview?${query.toString()}`,
      );

      if (!response.ok) {
        throw new Error(
          `Generated preview failed: HTTP ${response.status}`,
        );
      }

      setGeneratedPreview(
        (await response.json()) as GeneratedMetadataPreview,
      );
    } catch (error) {
      setGeneratedPreviewError(
        error instanceof Error
          ? error.message
          : "Unknown generated-preview error",
      );
    } finally {
      setGeneratedPreviewLoading(false);
    }
  };

  const loadGenerationPlan = async () => {
    setGenerationPlanLoading(true);
    setGenerationPlanError(null);

    try {
      const query = new URLSearchParams({
        release: release.id,
        scope: generationScope,
      });

      if (
        generationScope === "track" &&
        selectedTrackId
      ) {
        query.set("track", selectedTrackId);
      }

      const response = await fetch(
        `/api/library/generation-plan?${query.toString()}`,
      );

      if (!response.ok) {
        throw new Error(
          `Generation plan failed: HTTP ${response.status}`,
        );
      }

      setGenerationPlan(
        (await response.json()) as MetadataGenerationPlan,
      );
    } catch (error) {
      setGenerationPlanError(
        error instanceof Error
          ? error.message
          : "Unknown generation-plan error",
      );
    } finally {
      setGenerationPlanLoading(false);
    }
  };

  const createMissingMetadata = async () => {
    if (
      confirmationText !==
      "CREATE_MISSING_METADATA"
    ) {
      setCreationError(
        "Enter the exact confirmation phrase before creating files.",
      );
      return;
    }

    setCreationLoading(true);
    setCreationError(null);
    setCreationMessage(null);

    try {
      const response = await fetch(
        "/api/library/create-missing-metadata",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            releaseId: release.id,
            scope: generationScope,
            ...(generationScope === "track"
              ? {
                  trackId: selectedTrackId,
                }
              : {}),
            confirmation:
              "CREATE_MISSING_METADATA",
          }),
        },
      );

      const result = (await response.json()) as {
        created?: string[];
        blocked?: string[];
        receipts?: Array<{
          relativePath: string;
          bytes: number;
          sha256: string;
          verifiedAt: string;
        }>;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          result.error ??
            `Metadata creation failed: HTTP ${response.status}`,
        );
      }

      const createdCount =
        result.created?.length ?? 0;
      const blockedCount =
        result.blocked?.length ?? 0;

      const verifiedCount =
        result.receipts?.length ?? 0;

      setCreationMessage(
        `Created ${createdCount} metadata files; verified ${verifiedCount}; ${blockedCount} existing files remained blocked.`,
      );
      setConfirmationText("");

      // Refresh both the library scan and the local plan.
      await onLibraryChanged();
      await loadGenerationPlan();
    } catch (error) {
      setCreationError(
        error instanceof Error
          ? error.message
          : "Unknown metadata creation error",
      );
    } finally {
      setCreationLoading(false);
    }
  };

  const metadataReadiness =
    summarizeReleaseScanReadiness(
      release,
    );

  const releaseDateMatch =
    release.id.match(
      /^(\d{4})-(\d{2})-(\d{2})_/,
    );

  const releaseDateLabel = releaseDateMatch
    ? new Date(
        `${releaseDateMatch[1]}-${releaseDateMatch[2]}-${releaseDateMatch[3]}T12:00:00`,
      ).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "Release date not identified";

  const releaseArtwork =
    selectPreferredReleaseArtwork(
      release.artworkMasters,
    );

  const audioMasters =
    release.tracks.flatMap(
      (track) => track.audioMasters,
    );

  const trackArtwork =
    release.tracks.flatMap(
      (track) =>
        track.artworkMasters.map(
          (asset) => ({
            ...asset,
            trackId: track.id,
          }),
        ),
    );

  return (
    <article className="release-card library-release-card">
      <header className="library-release-header">
        <button
          type="button"
          className="release-primary-action"
          onClick={onOpenMetadata}
          aria-label={`Open metadata for ${formatReleaseTitle(
            release.id,
          )}`}
        >
          <span
            className="release-artwork-tile"
            aria-hidden="true"
          >
            {releaseArtwork ? (
              <img
                src={`/api/library/artwork?${new URLSearchParams(
                  {
                    path: releaseArtwork.relativePath,
                  },
                ).toString()}`}
                alt=""
                loading="lazy"
              />
            ) : (
              <>
                <strong>No artwork</strong>
                <small>Release</small>
              </>
            )}
          </span>

          <span className="release-summary">
            <strong className="release-title">
              {formatReleaseTitle(
                release.id,
              )}
            </strong>

            <span className="release-subtitle">
              {releaseDateLabel}
              {" · "}
              {release.tracks.length}{" "}
              {release.tracks.length === 1
                ? "track"
                : "tracks"}
            </span>
          </span>
        </button>

        <div className="release-status-actions">
          <span
            className={`badge ${readinessTone(
              metadataReadiness,
            )}`}
            title={
              metadataReadiness.total > 0
                ? `${metadataReadiness.core} core · ${metadataReadiness.credits} credits · ${metadataReadiness.supplemental} optional`
                : "All expected metadata documents are present"
            }
          >
            {readinessBadgeLabel(
              metadataReadiness,
            )}
          </span>

          {showAdminTools && (
            <button
              type="button"
              className="admin-tools-button"
              aria-expanded={adminToolsOpen}
              onClick={() =>
                setAdminToolsOpen(
                  (open) => !open,
                )
              }
            >
              Developer / Admin Tools
            </button>
          )}

          <button
            type="button"
            className="primary-button"
            onClick={onOpenMetadata}
          >
            View metadata
          </button>
        </div>
      </header>

      {showAdminTools && adminToolsOpen && (
      <div
        className="library-release-disclosures"
        onClick={(event) => {
          if (
            !event.altKey ||
            !(event.target instanceof HTMLElement)
          ) {
            return;
          }

          const summary =
            event.target.closest("summary");

          if (!summary) {
            return;
          }

          const clickedDetails =
            summary.parentElement;

          if (
            !(clickedDetails instanceof
              HTMLDetailsElement)
          ) {
            return;
          }

          event.preventDefault();

          const shouldOpen =
            !clickedDetails.open;

          event.currentTarget
            .querySelectorAll("details")
            .forEach((details) => {
              details.open = shouldOpen;
            });
        }}
      >
        <section
          className="admin-disclosure"
          aria-label="Developer and admin tools"
        >
          <div className="admin-disclosure-content">
            <details>
              <summary>
                <span>Release Metadata</span>
                <small>
                  {release.metadataFiles.length} files
                </small>
              </summary>

              <div className="library-disclosure-content">
                <MetadataPanel
                  title="Release metadata files"
                  files={release.metadataFiles}
                />
              </div>
            </details>

            <details>
              <summary>
                <span>Track Metadata</span>
                <small>
                  {release.tracks.length} tracks
                </small>
              </summary>

              <div className="library-disclosure-content tracks">
                {release.tracks.length === 0 ? (
                  <p className="empty-state">
                    No track directories discovered.
                  </p>
                ) : (
                  release.tracks.map((track) => (
                    <TrackMetadataSummary
                      key={track.relativePath}
                      track={track}
                    />
                  ))
                )}
              </div>
            </details>

            <details>
              <summary>
                <span>Audio Masters</span>
                <small>
                  {audioMasters.length} files
                </small>
              </summary>

              <div className="library-disclosure-content">
                <AssetPanel
                  title="Audio master files"
                  assets={audioMasters}
                  emptyLabel="No audio masters detected"
                />
              </div>
            </details>

            <details>
              <summary>
                <span>Track Artwork</span>
                <small>
                  {release.artworkMasters.length +
                    trackArtwork.length}{" "}
                  files
                </small>
              </summary>

              <div className="library-disclosure-content asset-stack">
                <AssetPanel
                  title="Release artwork"
                  assets={release.artworkMasters}
                  emptyLabel="No release artwork detected"
                />

                {release.tracks.map((track) => (
                  <AssetPanel
                    key={track.relativePath}
                    title={`${track.id} artwork`}
                    assets={track.artworkMasters}
                    emptyLabel="No track artwork detected"
                  />
                ))}
              </div>
            </details>

            <div className="library-disclosure-content admin-actions">
              <div className="card-actions">
                <button
                  type="button"
                  disabled={previewLoading}
                  onClick={() => void loadPreview()}
                >
                  {previewLoading
                    ? "Loading preview…"
                    : preview
                      ? "Refresh inference"
                      : "Preview inferred metadata"}
                </button>

                <button
                  type="button"
                  disabled={generatedPreviewLoading}
                  onClick={() =>
                    void loadGeneratedPreview()
                  }
                >
                  {generatedPreviewLoading
                    ? "Rendering TOML…"
                    : generatedPreview
                      ? "Refresh TOML preview"
                      : "Preview generated TOML"}
                </button>

                <button
                  type="button"
                  disabled={generationPlanLoading}
                  onClick={() =>
                    void loadGenerationPlan()
                  }
                >
                  {generationPlanLoading
                    ? "Building plan…"
                    : generationPlan
                      ? "Refresh generation plan"
                      : "View generation plan"}
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
      )}

      {previewError && (
        <p className="message error">
          {previewError}
        </p>
      )}

      {preview && (
        <MetadataPreviewPanel preview={preview} />
      )}

      {generatedPreviewError && (
        <p className="message error">
          {generatedPreviewError}
        </p>
      )}

      {generatedPreview && (
        <GeneratedTomlPanel
          preview={generatedPreview}
        />
      )}

      {generationPlanError && (
        <p className="message error">
          {generationPlanError}
        </p>
      )}

      {generationPlan && (
        <GenerationPlanPanel
          plan={generationPlan}
          generationScope={generationScope}
          selectedTrackId={selectedTrackId}
          tracks={release.tracks}
          confirmationText={confirmationText}
          creationLoading={creationLoading}
          creationError={creationError}
          creationMessage={creationMessage}
          onGenerationScopeChange={(scope) => {
            setGenerationScope(scope);
            setGenerationPlan(null);
            setConfirmationText("");
          }}
          onSelectedTrackIdChange={(trackId) => {
            setSelectedTrackId(trackId);
            setGenerationPlan(null);
            setConfirmationText("");
          }}
          onConfirmationTextChange={
            setConfirmationText
          }
          onCreate={() =>
            void createMissingMetadata()
          }
        />
      )}
    </article>
  );
}

function TrackMetadataSummary({
  track,
}: {
  track: TrackScanResult;
}) {
  const missingCount =
    track.metadataFiles.filter(
      (file) => !file.exists,
    ).length;

  return (
    <article className="track-card track-metadata-summary">
      <header className="track-header">
        <div>
          <p className="card-type">
            Track
          </p>
          <h4>{track.id}</h4>
          <code>{track.relativePath}</code>
        </div>

        <span
          className={
            missingCount > 0
              ? "badge missing"
              : "badge complete"
          }
        >
          {missingCount > 0
            ? `${missingCount} missing`
            : "Complete"}
        </span>
      </header>

      <MetadataPanel
        title="Track metadata files"
        files={track.metadataFiles}
      />
    </article>
  );
}


type EditableMetadataValue =
  | string
  | number
  | boolean
  | string[];

type MetadataDraft = Record<
  string,
  EditableMetadataValue
>;

type PerformerRecordDraft = {
  key: string;
  sourceIndex: number | null;
  name: string;
  role: string;
  sortName: string;
};

type PerformerDraftMap = Record<
  string,
  PerformerRecordDraft[]
>;

type TechnicalCreditDraftMap = Record<
  string,
  PerformerRecordDraft[]
>;

type ArrangementCreditDraftMap = Record<
  string,
  PerformerRecordDraft[]
>;

type WritingCreditRecordDraft =
  PerformerRecordDraft & {
    family: WritingCreditFamily;
    sourceFamily: WritingCreditFamily | null;
  };

type WritingCreditDraftMap = Record<
  string,
  WritingCreditRecordDraft[]
>;

type SampleRelationshipDraftMap = Record<
  string,
  SampleRelationshipRecordDraft[]
>;

type SampleClearanceDraftMap = Record<
  string,
  SampleClearanceRecordDraft[]
>;


type MetadataValueChange = {
  path: string;
  value: EditableMetadataValue;
};

type ScalarMetadataSaveReceipt = {
  relativePath: string;
  backupRelativePath: string;
  previousSha256: string;
  savedSha256: string;
  bytes: number;
  savedAt: string;
  synchronizedTrackFiles?: number;
  skippedTrackFiles?: number;
};

type PerformerCopyTargetPlan = {
  trackId: string;
  relativePath: string;
  documentExists: boolean;
  addCount: number;
  duplicateCount: number;
  resultingCount: number;
  status: "ready" | "blocked";
  reason?: string;
};

type PerformerCopyExecutionTarget =
  PerformerCopyTargetPlan & {
    createdDocument: boolean;
    receipt?: ScalarMetadataSaveReceipt;
    error?: string;
  };

type PerformerCopyResponse = {
  releaseId: string;
  sourceTrackId: string;
  sourceRelativePath: string;
  sourceSha256: string;
  selectedCredits: Array<{
    sourceIndex: number;
    name: string;
    role: string;
    sortName: string;
  }>;
  destinations: PerformerCopyTargetPlan[];
  summary: {
    selectedCreditCount: number;
    destinationCount: number;
    readyCount: number;
    blockedCount: number;
    addCount: number;
    duplicateCount: number;
  };
  execution?: {
    status: "verified" | "partial" | "failed";
    targets: PerformerCopyExecutionTarget[];
    addedCount: number;
    duplicateCount: number;
    failedCount: number;
  };
};

type PerformerCopySource = {
  document: ParsedMetadataDocument;
  records: PerformerRecordDraft[];
};

type PerformerCopyTrackOption = {
  trackId: string;
  label: string;
};

function createMetadataActivityEntry({
  releaseId,
  document,
  action,
  status,
  message,
  receipt,
}: {
  releaseId: string;
  document: ParsedMetadataDocument;
  action: MetadataActivityEntry["action"];
  status: MetadataActivityEntry["status"];
  message: string;
  receipt?: ScalarMetadataSaveReceipt;
}): MetadataActivityEntry {
  const occurredAt =
    receipt?.savedAt ??
    new Date().toISOString();

  return {
    id: [
      occurredAt,
      document.relativePath,
      action,
      status,
      Math.random().toString(36).slice(2),
    ].join(":"),
    occurredAt,
    releaseId,
    documentRelativePath:
      document.relativePath,
    documentFilename: document.filename,
    scope: document.scope,
    trackId: document.trackId,
    action,
    status,
    message,
    receipt: receipt
      ? {
          backupRelativePath:
            receipt.backupRelativePath,
          previousSha256:
            receipt.previousSha256,
          savedSha256:
            receipt.savedSha256,
          bytes: receipt.bytes,
          synchronizedTrackFiles:
            receipt.synchronizedTrackFiles,
          skippedTrackFiles:
            receipt.skippedTrackFiles,
        }
      : undefined,
  };
}

function createPerformerCopyActivityEntry({
  releaseId,
  sourceTrackId,
  target,
}: {
  releaseId: string;
  sourceTrackId: string;
  target: PerformerCopyExecutionTarget;
}): MetadataActivityEntry {
  const occurredAt =
    target.receipt?.savedAt ??
    new Date().toISOString();
  const verified =
    Boolean(target.receipt) &&
    !target.error;

  return {
    id: [
      occurredAt,
      target.relativePath,
      "copy-performers",
      verified ? "verified" : "failed",
      Math.random().toString(36).slice(2),
    ].join(":"),
    occurredAt,
    releaseId,
    documentRelativePath:
      target.relativePath,
    documentFilename:
      "track-credits.toml",
    scope: "track",
    trackId: target.trackId,
    action: "copy-performers",
    status: verified
      ? "verified"
      : "failed",
    message: verified
      ? `${target.addCount} ${
          target.addCount === 1
            ? "performer credit was"
            : "performer credits were"
        } copied from ${sourceTrackId} and verified.`
      : target.error ??
        `Performer credits from ${sourceTrackId} could not be copied.`,
    receipt: target.receipt
      ? {
          backupRelativePath:
            target.receipt.backupRelativePath,
          previousSha256:
            target.receipt.previousSha256,
          savedSha256:
            target.receipt.savedSha256,
          bytes: target.receipt.bytes,
        }
      : undefined,
  };
}

function isEditableMetadataValue(
  value: unknown,
): value is EditableMetadataValue {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    (
      Array.isArray(value) &&
      value.every(
        (entry) => typeof entry === "string",
      )
    )
  );
}

function metadataValuesEqual(
  left: EditableMetadataValue,
  right: EditableMetadataValue,
): boolean {
  if (
    Array.isArray(left) &&
    Array.isArray(right)
  ) {
    return (
      left.length === right.length &&
      left.every(
        (entry, index) =>
          entry === right[index],
      )
    );
  }

  return left === right;
}

function stringArrayToEditorText(
  values: string[],
): string {
  return values.join("\n");
}

function editorTextToStringArray(
  value: string,
): string[] {
  return value
    .split("\n")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}


function getPerformerPath(
  document: ParsedMetadataDocument,
):
  | "track.performers"
  | "release.credits.performers" {
  return document.scope === "release"
    ? "release.credits.performers"
    : "track.performers";
}

function isPerformerRecordPath(
  metadataPath: string,
): boolean {
  return (
    metadataPath === "track.performers" ||
    metadataPath ===
      "release.credits.performers" ||
    /^(?:track\.performers|release\.credits\.performers)\[\d+\]\.(name|role|sort_name)$/.test(
      metadataPath,
    )
  );
}

function readPerformerRecords(
  document: ParsedMetadataDocument,
): PerformerRecordDraft[] {
  const performerContainer =
    document.scope === "release"
      ? (
          typeof document.parsed.release === "object" &&
          document.parsed.release !== null &&
          !Array.isArray(document.parsed.release) &&
          "credits" in document.parsed.release &&
          typeof document.parsed.release.credits === "object" &&
          document.parsed.release.credits !== null &&
          !Array.isArray(document.parsed.release.credits)
            ? document.parsed.release.credits
            : null
        )
      : (
          typeof document.parsed.track === "object" &&
          document.parsed.track !== null &&
          !Array.isArray(document.parsed.track)
            ? document.parsed.track
            : null
        );

  if (
    !performerContainer ||
    !("performers" in performerContainer) ||
    !Array.isArray(performerContainer.performers)
  ) {
    return [];
  }

  return performerContainer.performers.flatMap(
    (value, sourceIndex) => {
      if (
        typeof value !== "object" ||
        value === null ||
        Array.isArray(value)
      ) {
        return [];
      }

      return [
        {
          key:
            `existing-${sourceIndex}`,
          sourceIndex,
          name:
            "name" in value &&
            typeof value.name === "string"
              ? value.name
              : "",
          role:
            "role" in value &&
            typeof value.role === "string"
              ? value.role
              : "",
          sortName:
            "sort_name" in value &&
            typeof value.sort_name ===
              "string"
              ? value.sort_name
              : "",
        },
      ];
    },
  );
}

function performerRecordsEqual(
  left: readonly PerformerRecordDraft[],
  right: readonly PerformerRecordDraft[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (record, index) => {
        const comparison =
          right[index];

        return (
          comparison !== undefined &&
          record.sourceIndex ===
            comparison.sourceIndex &&
          record.name ===
            comparison.name &&
          record.role ===
            comparison.role &&
          record.sortName ===
            comparison.sortName
        );
      },
    )
  );
}

function serializePerformerRecords(
  records:
    | readonly PerformerRecordDraft[]
    | undefined,
): Array<{
  sourceIndex: number | null;
  name: string;
  role: string;
  sortName: string;
}> | undefined {
  return records?.map(
    ({
      sourceIndex,
      name,
      role,
      sortName,
    }) => ({
      sourceIndex,
      name,
      role,
      sortName,
    }),
  );
}


type TechnicalContributorPath =
  | "track.contributors"
  | "release.credits.contributors";

function getTechnicalContributorPath(
  document: ParsedMetadataDocument,
): TechnicalContributorPath {
  return document.scope === "release"
    ? "release.credits.contributors"
    : "track.contributors";
}

function readTechnicalContributorArray(
  document: ParsedMetadataDocument,
): unknown[] {
  if (document.scope === "release") {
    const release =
      document.parsed.release;

    if (
      typeof release !== "object" ||
      release === null ||
      Array.isArray(release) ||
      !("credits" in release)
    ) {
      return [];
    }

    const credits = release.credits;

    if (
      typeof credits !== "object" ||
      credits === null ||
      Array.isArray(credits) ||
      !("contributors" in credits) ||
      !Array.isArray(
        credits.contributors,
      )
    ) {
      return [];
    }

    return credits.contributors;
  }

  const track =
    document.parsed.track;

  if (
    typeof track !== "object" ||
    track === null ||
    Array.isArray(track) ||
    !("contributors" in track) ||
    !Array.isArray(track.contributors)
  ) {
    return [];
  }

  return track.contributors;
}

function readTechnicalCreditRecords(
  document: ParsedMetadataDocument,
): PerformerRecordDraft[] {
  return readTechnicalContributorArray(
    document,
  ).flatMap(
    (value, sourceIndex) => {
      if (
        typeof value !== "object" ||
        value === null ||
        Array.isArray(value)
      ) {
        return [];
      }

      const role =
        "role" in value &&
        typeof value.role === "string"
          ? value.role
          : "";

      if (
        !isTechnicalContributorRoleValue(
          role,
        )
      ) {
        return [];
      }

      return [
        {
          key: [
            "existing-technical",
            document.scope,
            sourceIndex,
          ].join("-"),
          sourceIndex,
          name:
            "name" in value &&
            typeof value.name === "string"
              ? value.name
              : "",
          role,
          sortName:
            "sort_name" in value &&
            typeof value.sort_name ===
              "string"
              ? value.sort_name
              : "",
        },
      ];
    },
  );
}

function readManagedTechnicalCreditSourceIndexes(
  document: ParsedMetadataDocument,
): number[] {
  return readTechnicalCreditRecords(
    document,
  ).flatMap((record) =>
    record.sourceIndex === null
      ? []
      : [record.sourceIndex],
  );
}

function normalizeTechnicalCreditRole(
  role: string,
): string {
  return role
    .trim()
    .toLocaleLowerCase()
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ");
}

/*
 * Primary liner-note variants share one override key so a track-level
 * "Recorded By" credit can replace a release-level "Recording Engineer"
 * credit without affecting assistant or additional engineering credits.
 */
function technicalCreditOverrideKey(
  role: string,
): string {
  const normalized =
    normalizeTechnicalCreditRole(role);

  if (
    /^(recorded by|recording engineer|tracking engineer)$/.test(
      normalized,
    )
  ) {
    return "recording:primary";
  }

  if (
    /^(mixed by|mix engineer|mixing engineer|mixer)$/.test(
      normalized,
    )
  ) {
    return "mixing:primary";
  }

  if (
    /^(mastered by|mastering engineer|remastering engineer)$/.test(
      normalized,
    )
  ) {
    return "mastering:primary";
  }

  return normalized;
}

function mergeInheritedTechnicalCredits(
  releaseRecords: readonly PerformerRecordDraft[],
  trackRecords: readonly PerformerRecordDraft[],
): {
  effective: PerformerRecordDraft[];
  inherited: PerformerRecordDraft[];
} {
  const trackOverrideKeys =
    new Set(
      trackRecords.map((record) =>
        technicalCreditOverrideKey(
          record.role,
        ),
      ),
    );

  const inherited =
    releaseRecords
      .filter(
        (record) =>
          !trackOverrideKeys.has(
            technicalCreditOverrideKey(
              record.role,
            ),
          ),
      )
      .map((record, index) => ({
        ...record,
        key: [
          "inherited-release-technical",
          index,
          record.key,
        ].join("-"),
        sourceIndex: null,
      }));

  return {
    effective: [
      ...trackRecords,
      ...inherited,
    ],
    inherited,
  };
}

function serializeTechnicalCreditRecords(
  records:
    | readonly PerformerRecordDraft[]
    | undefined,
): Array<{
  sourceIndex: number | null;
  name: string;
  role: string;
  sortName: string;
}> | undefined {
  return serializePerformerRecords(
    records,
  );
}

type ArrangementContributorPath =
  TechnicalContributorPath;

function getArrangementContributorPath(
  document: ParsedMetadataDocument,
): ArrangementContributorPath {
  return getTechnicalContributorPath(document);
}

function readArrangementCreditRecords(
  document: ParsedMetadataDocument,
): PerformerRecordDraft[] {
  return readTechnicalContributorArray(
    document,
  ).flatMap((value, sourceIndex) => {
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value)
    ) {
      return [];
    }

    const role =
      "role" in value &&
      typeof value.role === "string"
        ? value.role
        : "";

    if (
      !isArrangementContributorRoleValue(
        role,
      )
    ) {
      return [];
    }

    return [
      {
        key: [
          "existing-arrangement",
          document.scope,
          sourceIndex,
        ].join("-"),
        sourceIndex,
        name:
          "name" in value &&
          typeof value.name === "string"
            ? value.name
            : "",
        role,
        sortName:
          "sort_name" in value &&
          typeof value.sort_name === "string"
            ? value.sort_name
            : "",
      },
    ];
  });
}

function readManagedArrangementCreditSourceIndexes(
  document: ParsedMetadataDocument,
): number[] {
  return readArrangementCreditRecords(
    document,
  ).flatMap((record) =>
    record.sourceIndex === null
      ? []
      : [record.sourceIndex],
  );
}

function arrangementCreditOverrideKey(
  role: string,
): string {
  const normalized =
    normalizeArrangementCreditRole(role);

  if (
    /^(arranger|arranged by|arrangement by)$/.test(
      normalized,
    )
  ) {
    return "arrangement:general";
  }

  const specializedFamilies: Array<{
    pattern: RegExp;
    key: string;
  }> = [
    {
      pattern: /\b(?:background vocal|vocal|choir)\b/,
      key: "arrangement:vocal",
    },
    {
      pattern: /\bstring\b/,
      key: "arrangement:string",
    },
    {
      pattern: /\b(?:brass|horn)\b/,
      key: "arrangement:brass",
    },
    {
      pattern: /\bwoodwind\b/,
      key: "arrangement:woodwind",
    },
    {
      pattern: /\brhythm\b/,
      key: "arrangement:rhythm",
    },
    {
      pattern: /\b(?:percussion|drum)\b/,
      key: "arrangement:percussion",
    },
    {
      pattern: /\b(?:keyboard|synthesizer|synth)\b/,
      key: "arrangement:keyboard",
    },
  ];
  const specialized =
    specializedFamilies.find(({ pattern }) =>
      pattern.test(normalized),
    );

  if (specialized) {
    return specialized.key;
  }

  if (/\borchestrat/.test(normalized)) {
    return "orchestration:general";
  }

  return normalized;
}

function mergeInheritedArrangementCredits(
  releaseRecords: readonly PerformerRecordDraft[],
  trackRecords: readonly PerformerRecordDraft[],
): {
  effective: PerformerRecordDraft[];
  inherited: PerformerRecordDraft[];
} {
  const trackOverrideKeys = new Set(
    trackRecords.map((record) =>
      arrangementCreditOverrideKey(
        record.role,
      ),
    ),
  );
  const inherited = releaseRecords
    .filter(
      (record) =>
        !trackOverrideKeys.has(
          arrangementCreditOverrideKey(
            record.role,
          ),
        ),
    )
    .map((record, index) => ({
      ...record,
      key: [
        "inherited-release-arrangement",
        index,
        record.key,
      ].join("-"),
      sourceIndex: null,
    }));

  return {
    effective: [
      ...trackRecords,
      ...inherited,
    ],
    inherited,
  };
}

function serializeArrangementCreditRecords(
  records:
    | readonly PerformerRecordDraft[]
    | undefined,
): Array<{
  sourceIndex: number | null;
  name: string;
  role: string;
  sortName: string;
}> | undefined {
  return serializePerformerRecords(records);
}

type WritingCreditBasePath =
  | "track"
  | "release.credits";

function getWritingCreditBasePath(
  document: ParsedMetadataDocument,
): WritingCreditBasePath {
  return document.scope === "release"
    ? "release.credits"
    : "track";
}

function readWritingCreditFamilyArray(
  document: ParsedMetadataDocument,
  family: WritingCreditFamily,
): unknown[] {
  const root = document.parsed;
  const scopeRecord =
    document.scope === "release"
      ? root.release
      : root.track;

  if (
    typeof scopeRecord !== "object" ||
    scopeRecord === null ||
    Array.isArray(scopeRecord)
  ) {
    return [];
  }

  const record =
    document.scope === "release"
      ? (
          "credits" in scopeRecord &&
          typeof scopeRecord.credits === "object" &&
          scopeRecord.credits !== null &&
          !Array.isArray(scopeRecord.credits)
            ? scopeRecord.credits
            : null
        )
      : scopeRecord;

  if (!record) {
    return [];
  }

  const familyValue =
    (record as Record<string, unknown>)[family];

  return Array.isArray(familyValue)
    ? familyValue
    : [];
}

function readWritingCreditRecords(
  document: ParsedMetadataDocument,
): WritingCreditRecordDraft[] {
  const families: readonly WritingCreditFamily[] = [
    "songwriters",
    "composers",
    "lyricists",
  ];

  return families.flatMap((family) =>
    readWritingCreditFamilyArray(document, family).flatMap(
      (value, sourceIndex) => {
        if (
          typeof value !== "object" ||
          value === null ||
          Array.isArray(value)
        ) {
          return [];
        }

        const role =
          "role" in value &&
          typeof value.role === "string" &&
          value.role.trim()
            ? value.role
            : defaultWritingRoleForFamily(family);

        return [
          {
            key: [
              "existing-writing",
              document.scope,
              family,
              sourceIndex,
            ].join("-"),
            family,
            sourceFamily: family,
            sourceIndex,
            name:
              "name" in value &&
              typeof value.name === "string"
                ? value.name
                : "",
            role,
            sortName:
              "sort_name" in value &&
              typeof value.sort_name === "string"
                ? value.sort_name
                : "",
          },
        ];
      },
    ),
  );
}

function writingCreditRecordsEqual(
  left: readonly WritingCreditRecordDraft[],
  right: readonly WritingCreditRecordDraft[],
): boolean {
  return (
    left.length === right.length &&
    left.every((record, index) => {
      const other = right[index];

      return (
        other !== undefined &&
        record.family === other.family &&
        record.sourceFamily === other.sourceFamily &&
        record.sourceIndex === other.sourceIndex &&
        record.name === other.name &&
        record.role === other.role &&
        record.sortName === other.sortName
      );
    })
  );
}

function mergeInheritedWritingCredits(
  releaseRecords: readonly WritingCreditRecordDraft[],
  trackRecords: readonly WritingCreditRecordDraft[],
): {
  effective: WritingCreditRecordDraft[];
  inherited: WritingCreditRecordDraft[];
} {
  const localFamilies = new Set(
    trackRecords.map((record) => record.family),
  );
  const inherited = releaseRecords
    .filter((record) => !localFamilies.has(record.family))
    .map((record, index) => ({
      ...record,
      key: [
        "inherited-release-writing",
        index,
        record.key,
      ].join("-"),
      sourceFamily: null,
      sourceIndex: null,
    }));

  return {
    effective: [...trackRecords, ...inherited],
    inherited,
  };
}

function serializeWritingCreditRecords(
  records:
    | readonly WritingCreditRecordDraft[]
    | undefined,
): Array<{
  family: WritingCreditFamily;
  sourceFamily: WritingCreditFamily | null;
  sourceIndex: number | null;
  name: string;
  role: string;
  sortName: string;
}> | undefined {
  return records?.map((record) => ({
    family: record.family,
    sourceFamily: record.sourceFamily,
    sourceIndex: record.sourceIndex,
    name: record.name,
    role: record.role,
    sortName: record.sortName,
  }));
}

function readTrackRecordArray(
  document: ParsedMetadataDocument,
  key: string,
): unknown[] {
  const track = document.parsed.track;

  if (
    typeof track !== "object" ||
    track === null ||
    Array.isArray(track)
  ) {
    return [];
  }

  const value = (track as Record<string, unknown>)[key];
  return Array.isArray(value) ? value : [];
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function readSampleRelationshipRecords(
  document: ParsedMetadataDocument,
): SampleRelationshipRecordDraft[] {
  return readTrackRecordArray(document, "samples").flatMap(
    (value, sourceIndex) => {
      if (
        typeof value !== "object" ||
        value === null ||
        Array.isArray(value)
      ) {
        return [];
      }

      const record = value as Record<string, unknown>;
      const relationshipType =
        typeof record.relationship_type === "string" &&
        sampleRelationshipTypeOptions.includes(
          record.relationship_type as
            typeof sampleRelationshipTypeOptions[number],
        )
          ? record.relationship_type as
              typeof sampleRelationshipTypeOptions[number]
          : "sample";

      return [{
        key: `existing-sample-${sourceIndex}`,
        sourceIndex,
        relationshipType,
        sourceTitle:
          typeof record.source_title === "string"
            ? record.source_title
            : "",
        sourceArtist:
          typeof record.source_artist === "string"
            ? record.source_artist
            : "",
        sourceWriters: stringArrayValue(record.source_writers),
        sourceRelease:
          typeof record.source_release === "string"
            ? record.source_release
            : "",
        sourceYear:
          typeof record.source_year === "number"
            ? record.source_year
            : null,
        sourceIsrc:
          typeof record.source_isrc === "string"
            ? record.source_isrc
            : "",
        sourceIswc:
          typeof record.source_iswc === "string"
            ? record.source_iswc
            : "",
        usageDescription:
          typeof record.usage_description === "string"
            ? record.usage_description
            : "",
        creditText:
          typeof record.credit_text === "string"
            ? record.credit_text
            : "",
        notes:
          typeof record.notes === "string"
            ? record.notes
            : "",
      }];
    },
  );
}

function readSampleClearanceRecords(
  document: ParsedMetadataDocument,
): SampleClearanceRecordDraft[] {
  return readTrackRecordArray(document, "sample_clearances").flatMap(
    (value, sourceIndex) => {
      if (
        typeof value !== "object" ||
        value === null ||
        Array.isArray(value)
      ) {
        return [];
      }

      const record = value as Record<string, unknown>;
      const status =
        typeof record.status === "string" &&
        sampleClearanceStatusOptions.includes(
          record.status as
            typeof sampleClearanceStatusOptions[number],
        )
          ? record.status as
              typeof sampleClearanceStatusOptions[number]
          : "not reviewed";

      return [{
        key: `existing-sample-clearance-${sourceIndex}`,
        sourceIndex,
        sampleReference:
          typeof record.sample_reference === "number"
            ? record.sample_reference
            : sourceIndex + 1,
        status,
        masterUseCleared: record.master_use_cleared === true,
        publishingCleared: record.publishing_cleared === true,
        agreementReference:
          typeof record.agreement_reference === "string"
            ? record.agreement_reference
            : "",
        territories: stringArrayValue(record.territories),
        expirationDate:
          typeof record.expiration_date === "string"
            ? record.expiration_date
            : "",
        notes:
          typeof record.notes === "string"
            ? record.notes
            : "",
      }];
    },
  );
}

function sampleRelationshipRecordsEqual(
  left: readonly SampleRelationshipRecordDraft[],
  right: readonly SampleRelationshipRecordDraft[],
): boolean {
  return JSON.stringify(left.map(({ key, ...record }) => record)) ===
    JSON.stringify(right.map(({ key, ...record }) => record));
}

function sampleClearanceRecordsEqual(
  left: readonly SampleClearanceRecordDraft[],
  right: readonly SampleClearanceRecordDraft[],
): boolean {
  return JSON.stringify(left.map(({ key, ...record }) => record)) ===
    JSON.stringify(right.map(({ key, ...record }) => record));
}

function serializeSampleRelationshipRecords(
  records: readonly SampleRelationshipRecordDraft[] | undefined,
) {
  return records?.map(({ key: _key, ...record }) => record);
}

function serializeSampleClearanceRecords(
  records: readonly SampleClearanceRecordDraft[] | undefined,
) {
  return records?.map(({ key: _key, ...record }) => record);
}

type PersonRoleDisplayRecord = {
  key: string;
  name: string;
  role: string;
  sortName?: string;
};

type GroupedPersonRoleDisplay = {
  key: string;
  name: string;
  roles: string[];
  sortNames: string[];
  sourceCount: number;
};

function normalizePersonCreditValue(
  value: string,
): string {
  return value
    .trim()
    .replace(/\s+/g, " ");
}

function appendDistinctCreditValue(
  values: string[],
  value: string,
) {
  const normalized =
    normalizePersonCreditValue(value);

  if (!normalized) {
    return;
  }

  const comparison =
    normalized.toLocaleLowerCase();

  if (
    values.some(
      (existingValue) =>
        existingValue.toLocaleLowerCase() ===
        comparison,
    )
  ) {
    return;
  }

  values.push(normalized);
}

/*
 * Read-only credit views collapse repeated names while preserving the
 * authored record-per-role structure used by edit mode and TOML saves.
 */
function groupPersonRoleDisplayRecords(
  records: readonly PersonRoleDisplayRecord[],
): GroupedPersonRoleDisplay[] {
  const grouped = new Map<
    string,
    GroupedPersonRoleDisplay
  >();

  records.forEach((record) => {
    const name =
      normalizePersonCreditValue(
        record.name,
      );
    const groupKey = name
      ? name.toLocaleLowerCase()
      : `missing-name:${record.key}`;
    const existing =
      grouped.get(groupKey);

    if (existing) {
      appendDistinctCreditValue(
        existing.roles,
        record.role,
      );
      appendDistinctCreditValue(
        existing.sortNames,
        record.sortName ?? "",
      );
      existing.sourceCount += 1;
      return;
    }

    const nextGroup: GroupedPersonRoleDisplay = {
      key: groupKey,
      name,
      roles: [],
      sortNames: [],
      sourceCount: 1,
    };

    appendDistinctCreditValue(
      nextGroup.roles,
      record.role,
    );
    appendDistinctCreditValue(
      nextGroup.sortNames,
      record.sortName ?? "",
    );
    grouped.set(groupKey, nextGroup);
  });

  return Array.from(grouped.values());
}

function sortGroupedPerformerRoleDisplays(
  records: readonly GroupedPersonRoleDisplay[],
): GroupedPersonRoleDisplay[] {
  return records.map((record) => ({
    ...record,
    roles: sortPerformerRoleDisplayValues(
      record.roles,
    ),
  }));
}

function isTrackTitleDraftPath(
  metadataPath: string,
): metadataPath is
  | "track.title"
  | "track.version"
  | "track.display_title" {
  return (
    metadataPath === "track.title" ||
    metadataPath === "track.version" ||
    metadataPath === "track.display_title"
  );
}

function buildDocumentDraftKey(
  document: ParsedMetadataDocument,
  metadataPath: string,
): string {
  return `${document.relativePath}::${metadataPath}`;
}

function readDocumentDraftString(
  document: ParsedMetadataDocument,
  metadataPath: string,
  draft: MetadataDraft,
): string {
  const draftKey = buildDocumentDraftKey(
    document,
    metadataPath,
  );
  const draftValue = draft[draftKey];

  if (typeof draftValue === "string") {
    return draftValue;
  }

  const row = flattenMetadata(
    document.parsed,
  ).find(
    (candidate) =>
      candidate.path === metadataPath,
  );

  return typeof row?.value === "string"
    ? row.value
    : "";
}

function getDocumentDraftChanges(
  document: ParsedMetadataDocument,
  draft: MetadataDraft,
): MetadataValueChange[] {
  const prefix = `${document.relativePath}::`;

  return Object.entries(draft)
    .filter(([key]) =>
      key.startsWith(prefix),
    )
    .map(([key, value]) => ({
      path: key.slice(prefix.length),
      value,
    }));
}

function getDocumentSaveChanges(
  document: ParsedMetadataDocument,
  draft: MetadataDraft,
  releaseDocuments: ParsedMetadataDocument[] = [],
): {
  changes: MetadataValueChange[];
  createChanges: MetadataValueChange[];
} {
  const authoredChanges = getDocumentDraftChanges(
    document,
    draft,
  );
  const existing = new Map<
    string,
    EditableMetadataValue
  >();

  for (const row of flattenMetadata(document.parsed)) {
    if (isEditableMetadataValue(row.value)) {
      existing.set(row.path, row.value);
    }
  }

  const baseResult =
    document.scope === "track" &&
    document.filename === "track.toml"
      ? deriveTrackSaveChanges(
          existing,
          authoredChanges,
        )
      : {
          changes: authoredChanges,
          createChanges: [],
        };
  const releaseArtistDocument =
    releaseDocuments.find(
      (candidate) =>
        candidate.filename ===
        "release.toml",
    );
  const releaseArtistValue =
    releaseArtistDocument
      ? readDocumentDraftString(
          releaseArtistDocument,
          "release.primary_artist.name",
          draft,
        )
      : findMetadataValueAcrossDocuments(
          releaseDocuments,
          "release.primary_artist.name",
        );
  const artistSortChanges =
    deriveArtistSortNameChanges(
      existing,
      [
        ...baseResult.changes,
        ...baseResult.createChanges,
      ],
      {
        scope: document.scope,
        filename: document.filename,
        releaseArtistName:
          typeof releaseArtistValue ===
          "string"
            ? releaseArtistValue
            : "",
      },
    );

  return {
    changes: [
      ...baseResult.changes,
      ...artistSortChanges,
    ],
    createChanges:
      baseResult.createChanges,
  };
}

function removeDocumentDraftChanges(
  document: ParsedMetadataDocument,
  draft: MetadataDraft,
): MetadataDraft {
  const prefix = `${document.relativePath}::`;

  return Object.fromEntries(
    Object.entries(draft).filter(
      ([key]) => !key.startsWith(prefix),
    ),
  );
}

function parseDraftNumber(
  value: string,
): number | null {
  if (value.trim() === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}


function readEffectiveTrackNavigationInteger({
  trackId,
  metadataPath,
  documents,
  draft,
}: {
  trackId: string;
  metadataPath:
    | "track.numbering.track_number"
    | "track.numbering.disc_number";
  documents: ParsedMetadataDocument[];
  draft: MetadataDraft;
}): number | null {
  const trackDocuments = documents.filter(
    (document) =>
      document.scope === "track" &&
      document.trackId === trackId,
  );

  for (const document of trackDocuments) {
    const draftKey = buildDocumentDraftKey(
      document,
      metadataPath,
    );
    const row = flattenMetadata(
      document.parsed,
    ).find(
      (candidate) =>
        candidate.path === metadataPath,
    );
    const value = Object.prototype.hasOwnProperty.call(
      draft,
      draftKey,
    )
      ? draft[draftKey]
      : row?.value;
    const parsed =
      typeof value === "number"
        ? value
        : typeof value === "string"
          ? Number(value)
          : Number.NaN;

    if (
      Number.isSafeInteger(parsed) &&
      parsed > 0
    ) {
      return parsed;
    }
  }

  return null;
}

function normalizeMetadataRegistryPath(
  metadataPath: string,
): string {
  return metadataPath.replace(
    /\[\d+\]/g,
    "[]",
  );
}

function findRegisteredMetadataField(
  metadataRegistry: MetadataFieldDefinition[],
  metadataPath: string,
): MetadataFieldDefinition | undefined {
  const normalizedPath =
    normalizeMetadataRegistryPath(
      metadataPath,
    );

  return metadataRegistry.find(
    (field) =>
      field.tomlPath === metadataPath ||
      field.tomlPath === normalizedPath,
  );
}

type MetadataAliasGroup = {
  label: string;
  values: string[];
  verified?: boolean;
};

function buildMetadataAliasGroups(
  field: MetadataFieldDefinition,
): MetadataAliasGroup[] {
  const groups: MetadataAliasGroup[] = [];

  const addGroup = (
    label: string,
    values: string[] | undefined,
    verified = true,
  ) => {
    if (values && values.length > 0) {
      groups.push({
        label,
        values,
        verified,
      });
    }
  };

  addGroup("FFmpeg", field.aliases?.ffmpeg);
  addGroup("ID3", field.aliases?.id3);
  addGroup("Vorbis", field.aliases?.vorbis);
  addGroup("MP4", field.aliases?.mp4);
  addGroup("RIFF", field.aliases?.riff);

  groups.push({
    label: "VLC",
    values:
      field.aliases?.players?.vlc?.length
        ? field.aliases.players.vlc
        : ["Not yet verified"],
    verified:
      Boolean(
        field.aliases?.players?.vlc?.length,
      ),
  });

  groups.push({
    label: "Apple Music",
    values:
      field.aliases?.players?.appleMusic
        ?.length
        ? field.aliases.players.appleMusic
        : ["Not yet verified"],
    verified:
      Boolean(
        field.aliases?.players?.appleMusic
          ?.length,
      ),
  });

  groups.push({
    label: "Windows Media Player",
    values:
      field.aliases?.players
        ?.windowsMediaPlayer?.length
        ? field.aliases.players
            .windowsMediaPlayer
        : ["Not yet verified"],
    verified:
      Boolean(
        field.aliases?.players
          ?.windowsMediaPlayer?.length,
      ),
  });

  groups.push({
    label: "Windows Media Player Legacy",
    values:
      field.aliases?.players
        ?.windowsMediaPlayerLegacy?.length
        ? field.aliases.players
            .windowsMediaPlayerLegacy
        : ["Not yet verified"],
    verified:
      Boolean(
        field.aliases?.players
          ?.windowsMediaPlayerLegacy?.length,
      ),
  });

  return groups;
}

const contributorRoleGroups: Array<{
  pattern: RegExp;
  group: NonNullable<
    MetadataFieldDefinition["presentation"]
  >["group"];
}> = [
  {
    pattern:
      /\b(mix(?:ed|er|ing)?|mixdown)\b/i,
    group: "Mixing",
  },
  {
    pattern:
      /\b(master(?:ed|ing)?|remaster(?:ed|ing)?)\b/i,
    group: "Mastering",
  },
  {
    pattern:
      /\b(edit(?:ed|ing|or)?|transfer(?:red|ring)?|restor(?:ation|ed|ing)?)\b/i,
    group: "Editing",
  },
  {
    pattern:
      /\b(record(?:ed|ing)?|tracking|engineer(?:ed|ing)?|tape operator)\b/i,
    group: "Recording",
  },
  {
    pattern:
      /\b(arrang|orchestrat)\b/i,
    group: "Arrangement & Orchestration",
  },
  {
    pattern:
      /\b(conductor|conducting|musical director|music director|bandleader)\b/i,
    group: "Conducting & Musical Direction",
  },
  {
    pattern:
      /\b(composer|lyricist|songwriter|written|lyrics|music by)\b/i,
    group: "Songwriting & Composition",
  },
  {
    pattern:
      /\b(publisher|publishing|administrator)\b/i,
    group: "Music Business & Rights",
  },
  {
    pattern:
      /\b(producer|production|programmer|sound designer|creative director|art director|coordinator|studio assistant|technician)\b/i,
    group: "Production",
  },
];

const metadataGroupOrder = [
  "Release & Track Identity",
  "Track & Disc Numbering",
  "Artists",
  "Music Business & Rights",
  "Sample Clearance",
  "Dates",
  "Musical Analysis",
  "Movement & Work",
  "Performers",
  "Songwriting & Composition",
  "Samples & Interpolations",
  "Writing, Lyrics & Language",
  ...lyricsMetadataGroupOrder,
  "Arrangement & Orchestration",
  "Conducting & Musical Direction",
  "Production",
  "Recording",
  "Editing",
  "Mixing",
  "Mastering",
  "Identifiers",
  "Text and Notes",
  "Artwork",
  "Technical Audio",
  "Files and Sources",
  unmappedMetadataGroup,
  "Developer / Advanced",
] as const;

const metadataGroupRank = new Map(
  metadataGroupOrder.map(
    (group, index) => [
      group,
      index,
    ],
  ),
);

function MetadataFieldLabel({
  label,
  path,
}: {
  label: string | undefined;
  path: string;
}) {
  /*
   * Friendly registry labels remain unchanged. Canonical path labels
   * use a dim namespace and a brighter final field name.
   */
  if (label && label !== path) {
    return <>{label}</>;
  }

  const lastDotIndex = path.lastIndexOf(
    ".",
  );

  if (lastDotIndex < 0) {
    return (
      <span className="metadata-path-leaf">
        {path}
      </span>
    );
  }

  return (
    <span className="metadata-path-label">
      <span className="metadata-path-namespace">
        {path.slice(0, lastDotIndex + 1)}
      </span>
      <span className="metadata-path-leaf">
        {path.slice(lastDotIndex + 1)}
      </span>
    </span>
  );
}

function isTrackDiscNumberingPath(
  path: string,
): boolean {
  /*
   * Canonical paths live below release.numbering or track.numbering.
   * The leaf-name fallback also keeps common imported/legacy spellings
   * together instead of scattering them into identity or advanced groups.
   */
  return (
    path ===
      "track.identifiers.discogs_track_position" ||
    /^(release|track)\.numbering\.(track_number|track_total|disc_number|disc_total|disk_number|disk_total)$/.test(
      path,
    ) ||
    /^(release|track)\.(track_number|track_total|total_tracks|disc_number|disc_total|total_discs|disk_number|disk_total|total_disks)$/.test(
      path,
    ) ||
    /(^|\.)(track_number|track_total|total_tracks|disc_number|disc_total|total_discs|disk_number|disk_total|total_disks)$/.test(
      path,
    )
  );
}

function isRelatedMetadataTagPath(
  path: string,
): boolean {
  const normalizedPath =
    path.replace(/\[\d+\]/g, "[]");

  if (
    normalizedPath ===
      "release.primary_artist.sort_name" ||
    normalizedPath === "track.sort_title"
  ) {
    return false;
  }

  return (
    normalizedPath ===
      "track.identifiers.discogs_track_position" ||
    /^track\.album_artists\[\]\.(name|sort_name)$/.test(
      normalizedPath,
    ) ||
    /^(track\.classification\.(instrumental|cover|live|remix|remaster))$/.test(
      normalizedPath,
    ) ||
    /^track\.(?:audio\.)?(?:tempo|initial_key|musical_key)$/.test(
      normalizedPath,
    ) ||
    normalizedPath ===
      "release.identifiers.barcode" ||
    /(^|\.)(discogs|musicbrainz|acoustid|spotify|apple_music|itunes|amazon|bandcamp|beatport|tidal|youtube|deezer)(_|\.|$)/i.test(
      normalizedPath,
    ) ||
    /(^|\.)(legacy|imported|provider|external|vendor|compatibility|alias|aliases|original_tag|source_tag)(_|\.|$)/i.test(
      normalizedPath,
    ) ||
    /(^|\.)(sort_name|sort_title|sort_album|sort_artist)$/.test(
      normalizedPath,
    ) ||
    /(^|\.)(probe|ffprobe|mediainfo|derived|detected)(_|\.|$)/i.test(
      normalizedPath,
    ) ||
    /(^|\.)(codec_tag|container_tag|id3|vorbis|riff|mp4)(_|\.|$)/i.test(
      normalizedPath,
    )
  );
}

function resolveMetadataRowGroup(
  rows: FlattenedMetadataRow[],
  row: FlattenedMetadataRow,
  field:
    | MetadataFieldDefinition
    | undefined,
): string {
  const releaseContributorMatch =
    row.path.match(
      /^(release\.credits\.contributors\[\d+\])\./,
    );

  if (releaseContributorMatch) {
    const roleRow = rows.find(
      (candidate) =>
        candidate.path ===
        `${releaseContributorMatch[1]}.role`,
    );

    if (
      roleRow &&
      typeof roleRow.value === "string"
    ) {
      const matchedCreativeGroup =
        contributorRoleGroups.find(
          ({ pattern, group }) =>
            [
              "Arrangement & Orchestration",
              "Conducting & Musical Direction",
            ].includes(group) &&
            pattern.test(roleRow.value as string),
        );

      if (matchedCreativeGroup) {
        return matchedCreativeGroup.group;
      }
    }

    return "Artists";
  }

  const contributorMatch = row.path.match(
    /^(track\.contributors\[\d+\])\./,
  );

  if (contributorMatch) {
    const roleRow = rows.find(
      (candidate) =>
        candidate.path ===
        `${contributorMatch[1]}.role`,
    );

    if (
      roleRow &&
      typeof roleRow.value === "string"
    ) {
      const roleValue = roleRow.value;

      const matchedGroup =
        contributorRoleGroups.find(
          ({ pattern }) =>
            pattern.test(roleValue),
        );

      if (matchedGroup) {
        return matchedGroup.group;
      }
    }

    return "Production";
  }

  const path = row.path;

  /*
   * Artwork entries are arrays-of-tables, so their paths commonly
   * contain indexes such as release.artwork[0].role.
   *
   * Keep local file/path fields under Files and Sources, while the
   * descriptive and structural artwork metadata belongs to Artwork.
   */
  const isArtworkPath =
    /^(release|track)\.artwork(?:\[\d+\])?(?:\.|$)/.test(
      path,
    ) ||
    /^production\.artwork(?:\[\d+\])?(?:\.|$)/.test(
      path,
    );

  if (isArtworkPath) {
    const artworkLeaf =
      path.split(".").at(-1) ?? "";

    const isArtworkFileReference =
      /^(file|filename|path|relative_path|absolute_path|directory|source|source_file|master_path|web_path|embedded_path|local_path|uri|url)$/.test(
        artworkLeaf,
      ) ||
      /(?:^|_)(file|filename|path|directory|source_path)$/.test(
        artworkLeaf,
      );

    return isArtworkFileReference
      ? "Files and Sources"
      : "Artwork";
  }

  /*
   * Also recognize artwork-related records nested below assets.
   * Path-like leaves remain under Files and Sources.
   */
  if (
    /^(release|track)\.assets\.(artwork|cover|front_cover|back_cover|booklet|disc_artwork|thumbnail)(?:\[\d+\])?(?:\.|$)/.test(
      path,
    )
  ) {
    const artworkLeaf =
      path.split(".").at(-1) ?? "";

    return /^(file|filename|path|relative_path|directory|source|source_file|local_path|uri|url)$/.test(
      artworkLeaf,
    )
      ? "Files and Sources"
      : "Artwork";
  }

  /*
   * Keep sort fields beside the names or titles they support.
   * These checks intentionally run before registry fallbacks.
   */
  if (
    /^(release|track)\.(primary_artist|album_artists|featured_artists|remixers)(\[|\.|$)/.test(
      path,
    ) ||
    /^release\.(album_artists|credits\.featured_artists|credits\.remixers)(\[|\.|$)/.test(
      path,
    )
  ) {
    return "Artists";
  }

  if (
    /^(track\.performers|release\.credits\.performers)(\[|\.|$)/.test(
      path,
    )
  ) {
    return "Performers";
  }

  if (
    /^(track\.(arrangers|orchestrators)|release\.credits\.arrangers)(\[|\.|$)/.test(
      path,
    )
  ) {
    return "Arrangement & Orchestration";
  }

  if (
    /^(track\.conductors|release\.credits\.conductors)(\[|\.|$)/.test(
      path,
    )
  ) {
    return "Conducting & Musical Direction";
  }

  if (
    /^(track\.(composers|lyricists|songwriters)|release\.credits\.(composers|lyricists|songwriters))(\[|\.|$)/.test(
      path,
    )
  ) {
    return "Songwriting & Composition";
  }

  if (/^track\.samples(\[|\.|$)/.test(path)) {
    return "Samples & Interpolations";
  }

  if (/^track\.sample_clearances(\[|\.|$)/.test(path)) {
    return "Sample Clearance";
  }

  if (
    /^track\.(language|script)(\.|$)/.test(
      path,
    ) ||
    /^release\.(language|script)(\.|$)/.test(
      path,
    ) ||
    /^track\.text\.(lyrics_language|lyrics_script)(\.|$)/.test(
      path,
    )
  ) {
    return "Language & Writing System";
  }

  if (
    /^track\.text\.(lyrics|synchronized_lyrics|unsynchronized_lyrics|translation)(\.|$)/.test(
      path,
    )
  ) {
    return "Lyrics";
  }

  if (
    /^track\.text\.(lyrics_copyright|lyrics_source)(\.|$)/.test(
      path,
    )
  ) {
    return "Lyrics Rights & Source";
  }

  if (
    /^release\.identifiers\.(upc|ean|barcode)$/.test(
      path,
    ) ||
    /^track\.identifiers\.(isrc|iswc)$/.test(
      path,
    )
  ) {
    return "Music Business & Rights";
  }

  if (
    /^(release|track)\.(title|subtitle|display_title|version|type|status|explicit)(\.|$)/.test(
      path,
    ) ||
    /^release\.(genres|identifiers\.(release_genres|release_moods|release_styles|release_tags))(\.|$)/.test(
      path,
    ) ||
    /^track\.(classification|sort_title)(\.|$)/.test(
      path,
    )
  ) {
    return "Release & Track Identity";
  }

  if (
    /^(release|track)\.id(\.|$)/.test(
      path,
    ) ||
    /^(schema|release_reference|track_reference|settings)(\.|$)/.test(
      path,
    ) ||
    /\.(missing_file_policy)$/.test(
      path,
    )
  ) {
    return "Developer / Advanced";
  }

  if (
    /^release\.(label|distributor|rights)(\.|$)/.test(
      path,
    ) ||
    /^track\.(publishers|publishing|rights)(\[|\.|$)/.test(
      path,
    )
  ) {
    return "Music Business & Rights";
  }

  if (
    /^(release|track)\.dates(\.|$)/.test(
      path,
    )
  ) {
    return "Dates";
  }

  if (
    /^(release|track)\.numbering(\.|$)/.test(
      path,
    ) ||
    isTrackDiscNumberingPath(path)
  ) {
    return "Track & Disc Numbering";
  }

  if (
    /^track\.movement(\.|$)/.test(
      path,
    )
  ) {
    return "Movement & Work";
  }

  /*
   * Artwork classification must run before generic identity,
   * identifier, and file/source rules. Artwork fields may occur
   * beneath artwork, assets, identifiers, or production paths.
   */
  if (
    /(^|\.)(artwork|artwork_master|cover|cover_art|cover_artwork|front_cover|back_cover|embedded_artwork|image|thumbnail)(\.|$)/.test(
      path,
    ) ||
    /^(release|track)\.assets\.(front|back|cover|artwork|image|thumbnail)(\.|$)/.test(
      path,
    ) ||
    /^production\.artwork(\.|$)/.test(
      path,
    )
  ) {
    return "Artwork";
  }

  if (
    /^(release|track)\.identifiers(\.|$)/.test(
      path,
    ) ||
    /\.(isrc|iswc|isni|ipi_name_number|ipi_base_number|musicbrainz_[a-z_]+|discogs_[a-z_]+|acoustid|spotify_[a-z_]+|barcode|ean|upc|catalog_number)$/.test(
      path,
    )
  ) {
    return "Identifiers";
  }

  if (
    /^track\.text(\.|$)/.test(path) ||
    /^release\.text(\.|$)/.test(path) ||
    /\.(comment|description|notes|liner_notes|website)$/.test(
      path,
    )
  ) {
    return "Text and Notes";
  }

  if (
    /^track\.(?:audio\.)?(?:bpm|tempo|key|initial_key|musical_key|camelot_key|time_signature|tuning_hz)(?:\.|$)/.test(
      path,
    )
  ) {
    return "Musical Analysis";
  }

  if (
    /^track\.audio(\.|$)/.test(path) ||
    /\.(sample_rate|bit_depth|channels|channel_layout|codec|duration)(\.|$)/.test(
      path,
    )
  ) {
    return "Technical Audio";
  }

  if (
    /^(release|track)\.(assets|track_sources|settings_source|credit_sources|production_note_sources)(\.|$)/.test(
      path,
    ) ||
    /^production\.(archive|project)(\.|$)/.test(
      path,
    ) ||
    /\.(file|session_file|directory|master_path|web_path|embedded_path)$/.test(
      path,
    )
  ) {
    return "Files and Sources";
  }

  if (
    /^production\.(mix|mixing)(\.|$)/.test(
      path,
    ) ||
    /^track\.production\.(mix|mixing)(\.|$)/.test(
      path,
    )
  ) {
    return "Mixing";
  }

  if (
    /^production\.mastering(\.|$)/.test(
      path,
    ) ||
    /^track\.production\.mastering(\.|$)/.test(
      path,
    )
  ) {
    return "Mastering";
  }

  const productionContextGroup =
    resolveProductionContextGroup(path);

  if (productionContextGroup) {
    return productionContextGroup;
  }

  if (
    /^track\.production\.recording(\.|$)/.test(path)
  ) {
    return "Recording";
  }

  if (
    /^track\.production\.editing(\.|$)/.test(path)
  ) {
    return "Editing";
  }

  if (
    /^track\.production\.sound_design(\.|$)/.test(path) ||
    /^(track\.production|release\.credits\.contributors)(\.|$)/.test(
      path,
    )
  ) {
    return "Production";
  }

  const registeredGroup =
    field?.presentation?.group;

  if (registeredGroup) {
    return registeredGroup;
  }

  /*
   * Unknown authored fields remain visible without being mistaken for core
   * identity metadata. The neutral disclosure makes their registration
   * status and source document explicit.
   */
  return unmappedMetadataGroup;
}

function MetadataFieldModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const closeButtonRef =
    useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (
      event: KeyboardEvent,
    ) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      document.body.style.overflow =
        previousOverflow;
      window.removeEventListener(
        "keydown",
        handleKeyDown,
      );
    };
  }, [onClose]);

  return (
    <div
      className="metadata-field-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (
          event.target ===
          event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <section
        className="metadata-field-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="metadata-field-modal-title"
      >
        <header>
          <h3 id="metadata-field-modal-title">
            {title}
          </h3>

          <button
            ref={closeButtonRef}
            type="button"
            className="metadata-field-modal-close"
            aria-label="Close dialog"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="metadata-field-modal-body">
          {children}
        </div>
      </section>
    </div>
  );
}

function MetadataActivityLogModal({
  entries,
  onClose,
  onClear,
}: {
  entries: MetadataActivityEntry[];
  onClose: () => void;
  onClear: () => void;
}) {
  return (
    <MetadataFieldModal
      title="Metadata Activity Log"
      onClose={onClose}
    >
      <section className="metadata-activity-log-intro">
        <div>
          <h4>Current browser session</h4>
          <p>
            Verified save receipts and failed metadata-write attempts are
            retained only in this tab&apos;s session storage. No additional
            filesystem log is created.
          </p>
        </div>

        <button
          type="button"
          disabled={entries.length === 0}
          onClick={onClear}
        >
          Clear activity
        </button>
      </section>

      {entries.length === 0 ? (
        <p className="metadata-activity-empty">
          No metadata save activity has been recorded in this browser
          session.
        </p>
      ) : (
        <ol className="metadata-activity-list">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className={`metadata-activity-entry ${entry.status}`}
            >
              <header>
                <div>
                  <span
                    className={`badge ${
                      entry.status === "verified"
                        ? "complete"
                        : "missing"
                    }`}
                  >
                    {entry.status === "verified"
                      ? "Saved and verified"
                      : "Write failed"}
                  </span>
                  <strong>
                    {entry.documentFilename}
                  </strong>
                </div>

                <time dateTime={entry.occurredAt}>
                  {new Date(
                    entry.occurredAt,
                  ).toLocaleString()}
                </time>
              </header>

              <p className="metadata-activity-context">
                <span>{entry.releaseId}</span>
                {entry.trackId && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{entry.trackId}</span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <span>
                  {entry.action === "add-fields"
                    ? "Added fields"
                    : entry.action ===
                        "remove-fields"
                      ? "Removed fields"
                      : entry.action ===
                          "copy-performers"
                        ? "Copied performer credits"
                        : entry.action ===
                            "create-document"
                          ? "Created metadata document"
                          : "Saved metadata"}
                </span>
              </p>

              <code className="metadata-activity-path">
                {entry.documentRelativePath}
              </code>
              <p>{entry.message}</p>

              {entry.receipt && (
                <details className="metadata-activity-receipt">
                  <summary>
                    View verification receipt
                  </summary>
                  <dl>
                    <div>
                      <dt>Backup</dt>
                      <dd>
                        <code>
                          {entry.receipt.backupRelativePath}
                        </code>
                      </dd>
                    </div>
                    <div>
                      <dt>SHA-256</dt>
                      <dd>
                        <code>
                          {entry.receipt.savedSha256}
                        </code>
                      </dd>
                    </div>
                    <div>
                      <dt>Bytes</dt>
                      <dd>{entry.receipt.bytes}</dd>
                    </div>
                    {(entry.receipt.synchronizedTrackFiles ?? 0) > 0 && (
                      <div>
                        <dt>Track files synchronized</dt>
                        <dd>
                          {entry.receipt.synchronizedTrackFiles}
                        </dd>
                      </div>
                    )}
                  </dl>
                </details>
              )}
            </li>
          ))}
        </ol>
      )}
    </MetadataFieldModal>
  );
}


function PerformerCreditCopyModal({
  releaseId,
  source,
  sourceLabel,
  releasePrimaryArtistName,
  trackOptions,
  onClose,
  onComplete,
}: {
  releaseId: string;
  source: PerformerCopySource;
  sourceLabel: string;
  releasePrimaryArtistName: string;
  trackOptions: PerformerCopyTrackOption[];
  onClose: () => void;
  onComplete: (
    result: PerformerCopyResponse,
  ) => void | Promise<void>;
}) {
  const selectableRecords =
    source.records.filter(
      (record): record is
        PerformerRecordDraft & {
          sourceIndex: number;
        } =>
        record.sourceIndex !== null &&
        Boolean(record.name.trim()) &&
        Boolean(record.role.trim()),
    );
  const [selectedSourceIndexes, setSelectedSourceIndexes] =
    useState<number[]>(() =>
      selectableRecords.map(
        (record) => record.sourceIndex,
      ),
    );
  const [selectedDestinationTrackIds, setSelectedDestinationTrackIds] =
    useState<string[]>([]);
  const [plan, setPlan] =
    useState<PerformerCopyResponse | null>(
      null,
    );
  const [loadingMode, setLoadingMode] =
    useState<"review" | "execute" | null>(
      null,
    );
  const [error, setError] =
    useState<string | null>(null);

  const groupedRecords = useMemo(() => {
    const groups = new Map<
      string,
      {
        name: string;
        records: Array<
          PerformerRecordDraft & {
            sourceIndex: number;
          }
        >;
      }
    >();

    selectableRecords.forEach((record) => {
      const normalizedName = record.name
        .trim()
        .replace(/\\s+/g, " ")
        .toLocaleLowerCase();
      const existing =
        groups.get(normalizedName);

      if (existing) {
        existing.records.push(record);
      } else {
        groups.set(normalizedName, {
          name: record.name.trim(),
          records: [record],
        });
      }
    });

    return prioritizeReleaseArtistDisplay(
      Array.from(groups.values()),
      releasePrimaryArtistName,
    );
  }, [
    releasePrimaryArtistName,
    selectableRecords,
  ]);

  const resetPlan = () => {
    setPlan(null);
    setError(null);
  };

  const updateSourceSelection = (
    sourceIndexes: number[],
  ) => {
    setSelectedSourceIndexes(
      Array.from(new Set(sourceIndexes)),
    );
    resetPlan();
  };

  const updateDestinationSelection = (
    trackIds: string[],
  ) => {
    setSelectedDestinationTrackIds(
      Array.from(new Set(trackIds)),
    );
    resetPlan();
  };

  const requestCopy = async (
    execute: boolean,
  ) => {
    setLoadingMode(
      execute ? "execute" : "review",
    );
    setError(null);

    try {
      const response = await fetch(
        "/api/library/copy-performer-credits",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            releaseId,
            sourceScope:
              source.document.scope,
            sourceTrackId:
              source.document.trackId,
            sourceOriginalSha256:
              source.document.sha256,
            selectedSourceIndexes,
            destinationTrackIds:
              selectedDestinationTrackIds,
            execute,
          }),
        },
      );
      const result =
        (await response.json()) as
          | PerformerCopyResponse
          | { error?: string };

      if (!response.ok) {
        throw new Error(
          "error" in result
            ? result.error ??
                `Performer copy failed: HTTP ${response.status}`
            : `Performer copy failed: HTTP ${response.status}`,
        );
      }

      const copyResult =
        result as PerformerCopyResponse;
      setPlan(copyResult);

      if (execute) {
        await onComplete(copyResult);
      }
    } catch (copyError) {
      setError(
        copyError instanceof Error
          ? copyError.message
          : "Unknown performer-copy error",
      );
    } finally {
      setLoadingMode(null);
    }
  };

  const targetLabel = (trackId: string) =>
    trackOptions.find(
      (option) =>
        option.trackId === trackId,
    )?.label ?? trackId;
  const executionComplete =
    Boolean(plan?.execution);

  return (
    <MetadataFieldModal
      title="Copy performer credits"
      onClose={onClose}
    >
      <section className="performer-copy-intro">
        <h4>
          {source.document.scope === "release"
            ? "Source release"
            : "Source track"}
        </h4>
        <strong>{sourceLabel}</strong>
        <p>
          Select saved name/role pairs, choose destination tracks, then review the duplicate-aware copy plan before writing. Existing target credits are never removed.
        </p>
      </section>

      <section className="performer-copy-section">
        <header>
          <div>
            <h4>1. Performer credits</h4>
            <p>
              Select one role, several roles for the same person, or credits from multiple people.
            </p>
          </div>
          <div className="performer-copy-selection-actions">
            <button
              type="button"
              onClick={() =>
                updateSourceSelection(
                  selectableRecords.map(
                    (record) =>
                      record.sourceIndex,
                  ),
                )
              }
            >
              Select all
            </button>
            <button
              type="button"
              onClick={() =>
                updateSourceSelection([])
              }
            >
              Clear
            </button>
          </div>
        </header>

        <div className="performer-copy-credit-groups">
          {groupedRecords.map((group) => {
            const groupIndexes =
              group.records.map(
                (record) =>
                  record.sourceIndex,
              );
            const groupSelected =
              groupIndexes.every(
                (sourceIndex) =>
                  selectedSourceIndexes.includes(
                    sourceIndex,
                  ),
              );

            return (
              <fieldset key={group.name}>
                <legend>
                  <label>
                    <input
                      type="checkbox"
                      checked={groupSelected}
                      onChange={(event) => {
                        if (event.target.checked) {
                          updateSourceSelection([
                            ...selectedSourceIndexes,
                            ...groupIndexes,
                          ]);
                        } else {
                          updateSourceSelection(
                            selectedSourceIndexes.filter(
                              (sourceIndex) =>
                                !groupIndexes.includes(
                                  sourceIndex,
                                ),
                            ),
                          );
                        }
                      }}
                    />
                    <strong>{group.name}</strong>
                    <small>
                      Select all {group.records.length} {group.records.length === 1 ? "role" : "roles"}
                    </small>
                  </label>
                </legend>

                {group.records.map((record) => (
                  <label
                    key={record.sourceIndex}
                    className="performer-copy-credit-option"
                  >
                    <input
                      type="checkbox"
                      checked={
                        selectedSourceIndexes.includes(
                          record.sourceIndex,
                        )
                      }
                      onChange={(event) =>
                        updateSourceSelection(
                          event.target.checked
                            ? [
                                ...selectedSourceIndexes,
                                record.sourceIndex,
                              ]
                            : selectedSourceIndexes.filter(
                                (sourceIndex) =>
                                  sourceIndex !==
                                  record.sourceIndex,
                              ),
                        )
                      }
                    />
                    <span>{record.name}</span>
                    <strong>{record.role}</strong>
                    {record.sortName && (
                      <small>
                        Sort name: {record.sortName}
                      </small>
                    )}
                  </label>
                ))}
              </fieldset>
            );
          })}
        </div>
      </section>

      <section className="performer-copy-section">
        <header>
          <div>
            <h4>2. Destination tracks</h4>
            <p>
              {source.document.scope === "track"
                ? "The source track is excluded. "
                : "Release performers may be copied into explicit track overrides. "}
              Missing track-credits documents will be created only for targets that receive a new credit.
            </p>
          </div>
          <div className="performer-copy-selection-actions">
            <button
              type="button"
              onClick={() =>
                updateDestinationSelection(
                  trackOptions.map(
                    (option) => option.trackId,
                  ),
                )
              }
            >
              Select all tracks
            </button>
            <button
              type="button"
              onClick={() =>
                updateDestinationSelection([])
              }
            >
              Clear
            </button>
          </div>
        </header>

        <div className="performer-copy-destination-grid">
          {trackOptions.map((option) => (
            <label key={option.trackId}>
              <input
                type="checkbox"
                checked={
                  selectedDestinationTrackIds.includes(
                    option.trackId,
                  )
                }
                onChange={(event) =>
                  updateDestinationSelection(
                    event.target.checked
                      ? [
                          ...selectedDestinationTrackIds,
                          option.trackId,
                        ]
                      : selectedDestinationTrackIds.filter(
                          (trackId) =>
                            trackId !==
                            option.trackId,
                        ),
                  )
                }
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="performer-copy-section performer-copy-review">
        <header>
          <div>
            <h4>3. Review copy plan</h4>
            <p>
              Exact name/role duplicates are skipped using case-insensitive, whitespace-normalized matching.
            </p>
          </div>
          {!executionComplete && (
            <button
              type="button"
              disabled={
                selectedSourceIndexes.length === 0 ||
                selectedDestinationTrackIds.length === 0 ||
                loadingMode !== null
              }
              onClick={() =>
                void requestCopy(false)
              }
            >
              {loadingMode === "review"
                ? "Reviewing…"
                : "Review copy plan"}
            </button>
          )}
        </header>

        {plan && (
          <>
            <div className="performer-copy-summary">
              <span>
                <strong>{plan.summary.selectedCreditCount}</strong> selected credits
              </span>
              <span>
                <strong>{plan.summary.addCount}</strong> records to add
              </span>
              <span>
                <strong>{plan.summary.duplicateCount}</strong> duplicates to skip
              </span>
              <span>
                <strong>{plan.summary.blockedCount}</strong> blocked targets
              </span>
            </div>

            <ol className="performer-copy-target-plan">
              {(plan.execution?.targets ??
                plan.destinations).map(
                (target) => {
                  const executionTarget:
                    | PerformerCopyExecutionTarget
                    | null = plan.execution
                      ? (
                          target as
                            PerformerCopyExecutionTarget
                        )
                      : null;
                  return (
                    <li
                      key={target.trackId}
                      className={
                        target.status === "blocked" ||
                        executionTarget?.error
                          ? "blocked"
                          : "ready"
                      }
                    >
                      <div>
                        <strong>
                          {targetLabel(
                            target.trackId,
                          )}
                        </strong>
                        <small>
                          {target.relativePath ||
                            "No target path"}
                        </small>
                      </div>
                      <span>
                        {executionTarget?.receipt
                          ? `${target.addCount} added and verified`
                          : executionTarget?.error
                            ? executionTarget.error
                            : target.status === "blocked"
                              ? target.reason
                              : target.addCount === 0
                                ? `${target.duplicateCount} duplicate ${target.duplicateCount === 1 ? "credit" : "credits"}; no write needed`
                                : `${target.addCount} to add · ${target.duplicateCount} ${target.duplicateCount === 1 ? "duplicate" : "duplicates"} skipped`}
                      </span>
                    </li>
                  );
                },
              )}
            </ol>
          </>
        )}

        {error && (
          <p className="error-message">
            {error}
          </p>
        )}
      </section>

      <footer className="performer-copy-footer">
        <button
          type="button"
          onClick={onClose}
        >
          {executionComplete ? "Close" : "Cancel"}
        </button>

        {!executionComplete && (
          <button
            type="button"
            className="primary-button"
            disabled={
              !plan ||
              plan.summary.addCount === 0 ||
              plan.summary.readyCount === 0 ||
              loadingMode !== null
            }
            onClick={() =>
              void requestCopy(true)
            }
          >
            {loadingMode === "execute"
              ? "Copying credits…"
              : plan
                ? `Copy ${plan.summary.addCount} missing ${plan.summary.addCount === 1 ? "credit" : "credits"}`
                : "Review before copying"}
          </button>
        )}
      </footer>
    </MetadataFieldModal>
  );
}


function describeMetadataValueGuidance(
  valueType: FlattenedMetadataRow["valueType"],
): string {
  switch (valueType) {
    case "string":
      return "Enter a single text value. Unless a recommended vocabulary is listed above, this field accepts project-defined free text.";
    case "integer":
      return "Enter a whole number without decimals or leading zeroes.";
    case "number":
      return "Enter a numeric value. Decimals are allowed when meaningful for the field.";
    case "boolean":
      return "Use true or false.";
    case "date":
      return "Use an ISO-style date such as YYYY-MM-DD when the full date is known.";
    case "string-array":
      return "Enter one or more text values. TOML stores these as a quoted, comma-separated array.";
    case "object":
      return "This value is a structured TOML object; edit its individual child fields.";
    case "object-array":
      return "This value is a repeatable list of structured TOML objects; edit the indexed child fields.";
    default:
      return "Use a value consistent with the field's existing TOML data type.";
  }
}

type SupplementalFieldGuidance = {
  help?: string;
  commonValues?: string[];
  examples?: string[];
};

function normalizeMetadataGuidancePath(
  path: string,
): string {
  return path.replace(/\[\d+\]/g, "[]");
}

function getSupplementalFieldGuidance(
  path: string,
  valueType: FlattenedMetadataRow["valueType"],
): SupplementalFieldGuidance {
  const normalizedPath =
    normalizeMetadataGuidancePath(path);

  const exactGuidance:
    Record<string, SupplementalFieldGuidance> = {
      "production.production_type": {
        help:
          "Describe the production or recording context with one concise, reusable term. Use Release Type for the publication format; use this field for session context such as a rehearsal, jam session, home recording, or field recording.",
        commonValues: [
          ...productionTypeCommonValues,
        ],
        examples: [
          "home recording",
          "jam session",
          "field recording",
        ],
      },
      "production.session_type": {
        help:
          "Describe the kind of working session represented by these files or notes.",
        commonValues: [
          "tracking session",
          "overdub session",
          "rehearsal",
          "jam session",
          "writing session",
          "live session",
          "editing session",
          "mix session",
          "mastering session",
        ],
      },
      "production.location_type": {
        help:
          "Classify the recording environment separately from the specific venue or geographic location.",
        commonValues: [
          "commercial studio",
          "home studio",
          "rehearsal space",
          "live venue",
          "remote setup",
          "mobile setup",
          "field location",
          "outdoor location",
        ],
      },
      "production.capture_method": {
        help:
          "Describe the broad capture workflow without replacing detailed equipment or engineering notes.",
        commonValues: [
          "multitrack recording",
          "live to stereo",
          "direct to two-track",
          "overdubbed recording",
          "remote collaboration",
          "archive transfer",
        ],
      },
      "track.album_artists[].name": {
        help:
          "Compatibility album-artist value stored on this track. It normally mirrors release.primary_artist.name and does not replace the authoritative Track Artist field.",
        examples: [
          "Album Artist",
          "Various Artists",
        ],
      },
      "track.album_artists[].sort_name": {
        help:
          "Optional alphabetical sort form for the compatibility Album Artist value. It normally mirrors release.primary_artist.sort_name.",
        examples: [
          "First Last → Last, First",
          "The Example Band → Example Band, The",
        ],
      },
      "track.subtitle": {
        help:
          "Optional secondary track title. A blank track subtitle inherits release.subtitle when one is present; enter a track-specific value only when this track differs.",
        examples: [
          "Part I",
          "Live Session",
        ],
      },
      "track.dates.release": {
        help:
          "Release date for this track. A blank value inherits release.dates.release; override it only when this track has a different release date.",
        examples: [
          "2009-05-01",
          "2026-07-18",
        ],
      },
      "track.dates.original_release": {
        help:
          "Earliest known release date for this recording or track version. A blank value inherits release.dates.original_release; override it only when this specific recording or track was first released on a different date, such as an earlier single later included on the release.",
        examples: [
          "2009-05-01",
          "1998",
        ],
      },
      "track.rights.copyright": {
        help:
          "Track-level copyright notice using the fixed form Copyright © [name or names]. All rights reserved. Leave it blank when the release-level notice applies; use an override only when this track has distinct ownership or wording.",
        examples: [
          "Copyright © Example Publishing. All rights reserved.",
        ],
      },
      "track.rights.phonographic_copyright": {
        help:
          "Track-level sound-recording notice using the fixed form Sound Recording Copyright ℗ [name or names]. All rights reserved. This is distinct from composition, publishing, lyrics, and artwork copyright.",
        examples: [
          "Sound Recording Copyright ℗ Example Records. All rights reserved.",
        ],
      },
      "track.rights.publisher": {
        help:
          "Publisher associated with the underlying musical work. Leave blank when the release-level publisher applies.",
        examples: [
          "Example Music Publishing",
        ],
      },
      "track.rights.license": {
        help:
          "Optional track-specific license or usage statement. Use only when this track differs from the release-level licensing terms.",
        examples: [
          "All rights reserved",
        ],
      },
      "track.version": {
        help:
          "Use a concise version label only when it distinguishes this recording from another version of the same track.",
        commonValues: [
          "Original Mix",
          "Radio Edit",
          "Extended Mix",
          "Instrumental",
          "Acoustic",
          "Live",
          "Demo",
          "Remix",
          "Remaster",
          "Clean",
          "Explicit",
          "Mono",
          "Stereo",
        ],
        examples: [
          "Original Mix",
          "Radio Edit",
          "Demo",
        ],
      },
      "track.text.lyrics_copyright": {
        help:
          "Copyright notice specifically covering the lyrical text. Put this field under Label, Publishing & Copyright; it does not replace songwriter or lyricist credits, publishing ownership, the release copyright notice, or the sound-recording ℗ notice.",
        examples: [
          "© 2026 Example Music Publishing",
          "Lyrics © 2026 Jane Doe",
        ],
      },
      "release.primary_artist.sort_name": {
        help:
          "Optional alphabetical sort form for the release artist. It does not change the artist name displayed to listeners. For a conventional personal name written as First Last, use Last, First. Leave this blank when the display name already sorts correctly. Do not automatically reverse stage names, group names, or names whose cultural ordering is uncertain.",
        examples: [
          "First Last → Last, First",
          "The Example Band → Example Band, The",
          "SingleName → SingleName",
        ],
      },
      "release.identifiers.upc": {
        help:
          "Use this as the authoritative commercial identifier when the release is assigned a UPC. Enter digits only and preserve any leading zeroes.",
        examples: [
          "012345678905",
        ],
      },
      "release.identifiers.ean": {
        help:
          "Use this as the authoritative commercial identifier when the release is assigned an EAN. Enter digits only and preserve any leading zeroes.",
        examples: [
          "4012345678901",
        ],
      },
      "release.identifiers.barcode": {
        help:
          "Generic barcode compatibility field. Prefer the specific UPC or EAN field as authoritative, and use this field only when importing, mirroring, or preserving a source system's generic barcode value.",
        examples: [
          "012345678905",
          "4012345678901",
        ],
      },
      "release.status": {
        help:
          "Describes the release's publication or lifecycle state. This is the authoritative field for whether the release is still being prepared, scheduled, officially published, withdrawn, or archived. It does not describe the musical or editorial edition.",
        commonValues: [
          "draft",
          "scheduled",
          "official",
          "released",
          "withdrawn",
          "archived",
        ],
        examples: [
          "draft",
          "official",
          "archived",
        ],
      },
      "release.version": {
        help:
          "Describes the edition or variant of this release. Use it only when this record must be distinguished from another edition of the same release. This field is optional and is not authoritative for publication status or release type.",
        commonValues: [
          "Original Release",
          "Deluxe Edition",
          "Expanded Edition",
          "Remastered",
          "Anniversary Edition",
          "Demo Edition",
          "Promo Edition",
        ],
        examples: [
          "2026 Remaster",
          "Deluxe Edition",
          "Expanded Edition",
        ],
      },
      "track.explicit": {
        commonValues: [
          "clean",
          "explicit",
          "not_applicable",
        ],
      },
      "release.language": {
        help:
          "Prefer a short BCP 47 or ISO 639 language code and use the same convention throughout the library.",
        commonValues: [
          "en",
          "es",
          "fr",
          "de",
          "it",
          "pt",
          "ja",
          "ko",
          "zh",
          "zxx",
        ],
      },
      "track.language": {
        help:
          "Prefer a short BCP 47 or ISO 639 language code and use the same convention throughout the library.",
        commonValues: [
          "en",
          "es",
          "fr",
          "de",
          "it",
          "pt",
          "ja",
          "ko",
          "zh",
          "zxx",
        ],
      },
      "track.text.lyrics_language": {
        help:
          "Use the language code for the lyrical text. Leave the local field blank when it should follow the effective Track Language.",
        commonValues: [
          "en",
          "es",
          "fr",
          "de",
          "it",
          "pt",
          "ja",
          "ko",
          "zh",
          "zxx",
        ],
      },
      "release.script": {
        help:
          "Prefer a consistent ISO 15924 script code when the release writing system is known.",
        commonValues: [
          "Latn",
          "Cyrl",
          "Arab",
          "Hebr",
          "Grek",
          "Hans",
          "Hant",
          "Jpan",
          "Kore",
          "Deva",
        ],
      },
      "track.script": {
        help:
          "Prefer a consistent ISO 15924 script code when the track writing system is known.",
        commonValues: [
          "Latn",
          "Cyrl",
          "Arab",
          "Hebr",
          "Grek",
          "Hans",
          "Hant",
          "Jpan",
          "Kore",
          "Deva",
        ],
      },
      "track.text.lyrics_script": {
        help:
          "Use an ISO 15924 script code for the lyrical text when it differs from or clarifies the track writing system.",
        commonValues: [
          "Latn",
          "Cyrl",
          "Arab",
          "Hebr",
          "Grek",
          "Hans",
          "Hant",
          "Jpan",
          "Kore",
          "Deva",
        ],
      },
      "release.artwork[].role": {
        commonValues: [
          "front_cover",
          "back_cover",
          "booklet",
          "disc",
          "artist",
          "logo",
          "other",
        ],
      },
      "track.artwork[].role": {
        commonValues: [
          "front_cover",
          "track_artwork",
          "artist",
          "logo",
          "other",
        ],
      },
      "track.performers[].role": {
        commonValues: [
          "vocals",
          "lead vocals",
          "backing vocals",
          "guitar",
          "bass",
          "drums",
          "percussion",
          "piano",
          "keyboards",
          "synthesizer",
          "strings",
          "brass",
          "woodwinds",
          "conductor",
          "ensemble",
        ],
      },
      "track.contributors[].role": {
        commonValues: [
          "producer",
          "executive producer",
          "composer",
          "lyricist",
          "songwriter",
          "arranger",
          "recording engineer",
          "mixing engineer",
          "mastering engineer",
          "editor",
          "remixer",
        ],
      },
      "track.identifiers[].type": {
        commonValues: [
          "isrc",
          "musicbrainz_recording_id",
          "acoustid",
          "catalog_number",
          "custom",
        ],
      },
      "release.identifiers[].type": {
        commonValues: [
          "upc",
          "ean",
          "musicbrainz_release_id",
          "catalog_number",
          "custom",
        ],
      },
      "track.audio.channel_layout": {
        commonValues: [
          "mono",
          "stereo",
          "2.1",
          "5.1",
          "7.1",
        ],
      },
      "track.audio.sample_format": {
        commonValues: [
          "pcm_s16le",
          "pcm_s24le",
          "pcm_s32le",
          "pcm_f32le",
        ],
      },
      "track.audio.bit_depth": {
        commonValues: [
          "16",
          "24",
          "32",
        ],
      },
      "track.audio.sample_rate": {
        commonValues: [
          "44100",
          "48000",
          "88200",
          "96000",
          "176400",
          "192000",
        ],
      },
      "track.source.type": {
        commonValues: [
          "studio_master",
          "mixdown",
          "stem",
          "transfer",
          "vinyl",
          "cassette",
          "cd",
          "digital_file",
          "other",
        ],
      },
      "release.type": {
        commonValues: [
          "album",
          "single",
          "EP",
          "broadcast",
          "audio drama",
          "audiobook",
          "compilation",
          "demo",
          "DJ mix",
          "field recording",
          "interview",
          "live",
          "mixtape",
          "remix",
          "soundtrack",
          "spoken word",
          "other",
        ],
      },
    };

  const patternCommonValues =
    getPatternMetadataHelpCommonValues(
      normalizedPath,
    );
  const exact =
    exactGuidance[normalizedPath];

  if (exact) {
    return {
      ...exact,
      commonValues: mergeMetadataGuidanceValues(
        exact.commonValues ?? [],
        patternCommonValues,
      ),
    };
  }

  if (patternCommonValues.length > 0) {
    if (normalizedPath.endsWith(".language")) {
      return {
        help:
          "Prefer a short BCP 47 or ISO 639 language code and use the same convention throughout the library.",
        commonValues: patternCommonValues,
      };
    }

    if (normalizedPath.endsWith(".script")) {
      return {
        help:
          "Prefer a consistent ISO 15924 script code when the writing system is known.",
        commonValues: patternCommonValues,
      };
    }

    if (normalizedPath.endsWith(".country")) {
      return {
        help:
          "Prefer a consistent two-letter ISO 3166-1 alpha-2 country code when the field represents a country.",
        commonValues: patternCommonValues,
      };
    }

    return {
      commonValues: patternCommonValues,
    };
  }

  if (
    normalizedPath.endsWith(".role")
  ) {
    return {
      commonValues: [
        "performer",
        "producer",
        "recording engineer",
        "mix engineer",
        "mastering engineer",
        "composer",
        "lyricist",
        "arranger",
        "art director",
        "photography",
      ],
    };
  }

  if (
    normalizedPath.includes(".date") ||
    normalizedPath.includes(".dates.")
  ) {
    return {
      help:
        "Use an ISO-style date. Prefer YYYY-MM-DD when the full date is known, YYYY-MM when only the month is known, or YYYY when only the year is known.",
      examples: [
        "2026-07-13",
        "2026-07",
        "2026",
      ],
    };
  }

  if (
    normalizedPath.endsWith(".country")
  ) {
    return {
      help:
        "Prefer a consistent two-letter ISO 3166-1 alpha-2 country code when the field represents a country.",
      commonValues: [
        "US",
        "GB",
        "CA",
        "AU",
        "DE",
        "FR",
        "JP",
      ],
    };
  }

  if (
    normalizedPath.endsWith(".language")
  ) {
    return {
      help:
        "Prefer a short BCP 47 or ISO 639 language code and use the same convention throughout the library.",
      commonValues: [
        "en",
        "es",
        "fr",
        "de",
        "it",
        "pt",
        "ja",
        "ko",
        "zh",
        "zxx",
      ],
    };
  }

  if (
    normalizedPath.endsWith(".email")
  ) {
    return {
      examples: [
        "artist@example.com",
        "rights@example.com",
      ],
    };
  }

  if (
    normalizedPath.endsWith(".url") ||
    normalizedPath.endsWith(".website")
  ) {
    return {
      examples: [
        "https://example.com",
      ],
    };
  }

  if (
    normalizedPath.endsWith(".bpm")
  ) {
    return {
      help:
        "Enter the musical tempo in beats per minute.",
      examples: [
        "90",
        "120",
        "128",
      ],
    };
  }

  if (
    normalizedPath.includes("track_number") ||
    normalizedPath.includes("track_total") ||
    normalizedPath.includes("disc_number") ||
    normalizedPath.includes("disc_total")
  ) {
    return {
      help:
        "Enter a positive whole number without leading zeroes.",
      examples: [
        "1",
        "2",
        "12",
      ],
    };
  }

  if (
    normalizedPath.endsWith(".name")
  ) {
    return {
      examples: [
        "Artist Name",
        "Contributor Name",
      ],
    };
  }

  if (
    normalizedPath.endsWith(".title")
  ) {
    return {
      examples: [
        "Track Title",
        "Release Title",
      ],
    };
  }

  if (
    normalizedPath.endsWith(".description") ||
    normalizedPath.endsWith(".comment") ||
    normalizedPath.endsWith(".notes")
  ) {
    return {
      examples: [
        "Concise internal or public-facing note.",
      ],
    };
  }

  if (valueType === "boolean") {
    return {
      commonValues: [
        "true",
        "false",
      ],
    };
  }

  if (valueType === "string-array") {
    return {
      examples: [
        '["value one", "value two"]',
        '["single value"]',
        "[]",
      ],
    };
  }

  if (
    valueType === "integer" ||
    valueType === "number"
  ) {
    return {
      examples: [
        "1",
        "2",
        "10",
      ],
    };
  }

  return {
    help:
      "Use a concise value consistent with the rest of the library.",
  };
}

type MetadataFieldHelpSpec = {
  label: string;
  field:
    | MetadataFieldDefinition
    | undefined;
  path: string;
  valueType:
    FlattenedMetadataRow["valueType"];
};

function mergeMetadataGuidanceValues(
  ...valueGroups: readonly (readonly string[])[]
): string[] {
  const values: string[] = [];
  const seen = new Set<string>();

  for (const group of valueGroups) {
    for (const rawValue of group) {
      const value = rawValue.trim();
      const normalizedValue =
        value.toLocaleLowerCase();

      if (
        value.length === 0 ||
        seen.has(normalizedValue)
      ) {
        continue;
      }

      seen.add(normalizedValue);
      values.push(value);
    }
  }

  return values;
}

type EffectiveMetadataFieldGuidance = {
  help: string;
  commonValues: string[];
  examples: string[];
};

function resolveEffectiveMetadataFieldGuidance(
  spec: MetadataFieldHelpSpec,
): EffectiveMetadataFieldGuidance {
  const supplementalGuidance =
    getSupplementalFieldGuidance(
      spec.path,
      spec.valueType,
    );
  const presentation =
    spec.field?.presentation;

  return {
    help:
      presentation?.help ??
      supplementalGuidance.help ??
      describeMetadataValueGuidance(
        spec.valueType,
      ),
    commonValues:
      mergeMetadataGuidanceValues(
        spec.field?.editor?.options ?? [],
        presentation?.commonValues ?? [],
        supplementalGuidance.commonValues ?? [],
      ),
    examples:
      mergeMetadataGuidanceValues(
        presentation?.examples ?? [],
        supplementalGuidance.examples ?? [],
      ),
  };
}

function MetadataFieldFacts({
  spec,
}: {
  spec: MetadataFieldHelpSpec;
}) {
  return (
    <dl className="metadata-field-facts">
      <div>
        <dt>Canonical path</dt>
        <dd>
          <code>{spec.path}</code>
        </dd>
      </div>

      <div>
        <dt>Data type</dt>
        <dd>
          <code>{spec.valueType}</code>
        </dd>
      </div>

      {spec.field && (
        <>
          <div>
            <dt>Required</dt>
            <dd>
              {spec.field.required
                ? "Yes"
                : "No"}
            </dd>
          </div>

          <div>
            <dt>Repeatable</dt>
            <dd>
              {spec.field.repeatable
                ? "Yes"
                : "No"}
            </dd>
          </div>

          <div>
            <dt>Inherited</dt>
            <dd>
              {spec.field.inherited
                ? "Yes"
                : "No"}
            </dd>
          </div>
        </>
      )}
    </dl>
  );
}

function MetadataFieldControls({
  field,
  path,
  valueType,
}: {
  field:
    | MetadataFieldDefinition
    | undefined;
  path: string;
  valueType:
    FlattenedMetadataRow["valueType"];
}) {
  const [modalOpen, setModalOpen] =
    useState(false);
  const label = field?.label ?? path;
  const spec: MetadataFieldHelpSpec = {
    label,
    field,
    path,
    valueType,
  };
  const guidance =
    resolveEffectiveMetadataFieldGuidance(
      spec,
    );
  const groups = field
    ? buildMetadataAliasGroups(field)
    : [];

  return (
    <>
      <span className="metadata-field-controls">
        <button
          type="button"
          className="metadata-field-control"
          aria-label={`Help and field information for ${label}`}
          title="Help and field information"
          onClick={() => setModalOpen(true)}
        >
          ?
        </button>
      </span>

      {modalOpen && (
        <MetadataFieldModal
          title={`${label} — Help`}
          onClose={() => setModalOpen(false)}
        >
          {guidance.commonValues.length > 0 && (
            <section className="metadata-field-guidance metadata-field-common-values">
              <h4>Common values</h4>
              <ul className="metadata-field-modal-values">
                {guidance.commonValues.map(
                  (value) => (
                    <li key={value}>
                      <code>{value}</code>
                    </li>
                  ),
                )}
              </ul>
              <p className="metadata-field-guidance-note">
                {field?.editor?.control ===
                "select-or-custom"
                  ? "Choose a standard value in Edit mode, or select Other… to preserve a custom value from liner notes or another source."
                  : "Suggested vocabulary; values are not restricted unless the field guidance explicitly says otherwise."}
              </p>
            </section>
          )}

          <section className="metadata-field-guidance metadata-field-value-guidance">
            <h4>Value guidance</h4>
            <p>{guidance.help}</p>

            {guidance.examples.length > 0 && (
              <div className="metadata-field-guidance-examples">
                <h5>Examples</h5>
                <ul className="metadata-field-modal-values">
                  {guidance.examples.map(
                    (value) => (
                      <li key={value}>
                        <code>{value}</code>
                      </li>
                    ),
                  )}
                </ul>
              </div>
            )}
          </section>

          <section className="metadata-field-guidance metadata-field-about">
            <h4>About this field</h4>
            <p>
              {field?.description ??
                "Metadata value stored at this canonical TOML path."}
            </p>
          </section>

          {!field && (
            <p className="metadata-field-guidance-note metadata-field-full-width">
              This path uses supplemental guidance until
              a dedicated canonical registry entry is
              added.
            </p>
          )}

          <details className="metadata-field-guidance metadata-help-technical-disclosure metadata-tag-disclosure">
            <summary>
              <span>Technical details</span>
              <small>
                Canonical path, data type, and field behavior
              </small>
            </summary>

            <div className="metadata-help-technical-content metadata-tag-disclosure-content">
              <MetadataFieldFacts spec={spec} />

              {field && groups.length > 0 && (
                <details className="metadata-tag-details metadata-tag-details-inline metadata-tag-disclosure">
                  <summary>
                    <span>
                      Player compatibility and tag mappings
                    </span>
                    <small>
                      {groups.length} mapping
                      {groups.length === 1 ? " group" : " groups"}
                    </small>
                  </summary>

                  <div className="metadata-tag-disclosure-content">
                    <dl className="metadata-aliases">
                      {groups.map((group) => (
                        <div key={group.label}>
                          <dt>{group.label}</dt>
                          <dd
                            className={
                              group.verified === false
                                ? "alias-unverified"
                                : undefined
                            }
                          >
                            {group.values.join(", ")}
                          </dd>
                        </div>
                      ))}
                    </dl>

                    <MetadataCompatibilityNotes
                      field={field}
                    />
                  </div>
                </details>
              )}
            </div>
          </details>
        </MetadataFieldModal>
      )}
    </>
  );
}

type MetadataFieldPairHelpProps = {
  title: string;
  description: string;
  nameField:
    | MetadataFieldDefinition
    | undefined;
  namePath: string;
  roleField:
    | MetadataFieldDefinition
    | undefined;
  rolePath: string;
  nameGuidance: string;
  roleGuidance: string;
  nameExample: string;
  roleExample: string;
  commonRoleValues: string[];
  fieldOrder?: "name-role" | "role-name";
};

function MetadataFieldPairHelpModal({
  title,
  description,
  nameField,
  namePath,
  roleField,
  rolePath,
  nameGuidance,
  roleGuidance,
  nameExample,
  roleExample,
  commonRoleValues,
  fieldOrder = "name-role",
  onClose,
}: MetadataFieldPairHelpProps & {
  onClose: () => void;
}) {
  const nameSpec: MetadataFieldHelpSpec = {
    label: nameField?.label ?? "Name",
    field: nameField,
    path: namePath,
    valueType: "string",
  };
  const roleSpec: MetadataFieldHelpSpec = {
    label: roleField?.label ?? "Role",
    field: roleField,
    path: rolePath,
    valueType: "string",
  };
  const pairFields = {
    name: {
      key: "name",
      label: "Name",
      example: nameExample,
      guidance: nameGuidance,
      spec: nameSpec,
    },
    role: {
      key: "role",
      label: "Role",
      example: roleExample,
      guidance: roleGuidance,
      spec: roleSpec,
    },
  } as const;
  const orderedPairFields =
    fieldOrder === "role-name"
      ? [pairFields.role, pairFields.name]
      : [pairFields.name, pairFields.role];

  return (
    <MetadataFieldModal
      title={`${title} — Help`}
      onClose={onClose}
    >
      {commonRoleValues.length > 0 && (
        <section className="metadata-field-guidance metadata-field-common-values">
          <h4>Common role values</h4>
          <ul className="metadata-field-modal-values">
            {commonRoleValues.map(
              (value) => (
                <li key={value}>
                  <code>{value}</code>
                </li>
              ),
            )}
          </ul>
          <p className="metadata-field-guidance-note">
            Choose a standard role when it matches the credit.
            Select Other… to preserve custom liner-note wording.
          </p>
        </section>
      )}

      <section className="metadata-field-guidance metadata-field-pair-guidance">
        <h4>Field guidance</h4>
        <div className="metadata-field-pair-guidance-grid">
          {orderedPairFields.map(
            (field) => (
              <article key={field.key}>
                <h5>{field.label}</h5>
                <p>{field.guidance}</p>
                <p className="metadata-field-pair-example">
                  <strong>Example:</strong>{" "}
                  <code>{field.example}</code>
                </p>
              </article>
            ),
          )}
        </div>
      </section>

      <section className="metadata-field-guidance metadata-field-pair-about">
        <h4>About this pair</h4>
        <p>{description}</p>
      </section>

      <details className="metadata-field-guidance metadata-help-technical-disclosure metadata-tag-disclosure">
        <summary>
          <span>Technical details</span>
          <small>
            Canonical paths, data types, and field behavior
          </small>
        </summary>

        <div className="metadata-help-technical-content metadata-tag-disclosure-content">
          <div className="metadata-field-pair-facts-grid">
            {orderedPairFields.map(
              (field) => (
                <article key={field.key}>
                  <h5>{field.label} field</h5>
                  <MetadataFieldFacts
                    spec={field.spec}
                  />
                </article>
              ),
            )}
          </div>
        </div>
      </details>
    </MetadataFieldModal>
  );
}

function MetadataFieldPairControls(
  props: MetadataFieldPairHelpProps,
) {
  const [modalOpen, setModalOpen] =
    useState(false);

  return (
    <>
      <button
        type="button"
        className="metadata-field-control"
        aria-label={`Help and field information for ${props.title}`}
        title={`Help for ${props.title}`}
        onClick={() => setModalOpen(true)}
      >
        ?
      </button>

      {modalOpen && (
        <MetadataFieldPairHelpModal
          {...props}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}

function activeReadinessDocuments(
  scope: MetadataReadinessScope,
  skippedPaths: ReadonlySet<string>,
): MissingMetadataDocument[] {
  return scope.missingDocuments.filter(
    (file) =>
      file.importance !== "supplemental" ||
      !skippedPaths.has(file.relativePath),
  );
}

function ReadinessNavBadge({
  scope,
  skippedPaths,
}: {
  scope?: MetadataReadinessScope;
  skippedPaths: ReadonlySet<string>;
}) {
  if (!scope) {
    return null;
  }

  const documents = activeReadinessDocuments(
    scope,
    skippedPaths,
  );
  const documentSummary =
    summarizeMissingMetadataDocuments(documents);
  const count =
    documentSummary.total +
    scope.missingRequiredFields.length;

  if (count === 0) {
    return null;
  }

  const tone =
    scope.missingRequiredFields.length > 0 ||
    documentSummary.core > 0
      ? "missing"
      : documentSummary.credits > 0
        ? "warning"
        : "supplemental";
  const details = [
    ...documents.map((file) => file.filename),
    ...scope.missingRequiredFields.map(
      (field) => field.label,
    ),
  ].join(", ");

  return (
    <small
      className={`readiness-count ${tone}`}
      title={`Needs attention: ${details}`}
    >
      {count}
    </small>
  );
}

function MetadataReadinessPanel({
  summary,
  trackLabels,
  open,
  skippedPaths,
  onToggle,
  onNavigate,
  onSkip,
  onRestore,
}: {
  summary: MetadataReadinessSummary;
  trackLabels: Map<string, string>;
  open: boolean;
  skippedPaths: ReadonlySet<string>;
  onToggle: () => void;
  onNavigate: (target: ReadinessNavigationTarget) => void;
  onSkip: (file: MissingMetadataDocument) => void;
  onRestore: (file: MissingMetadataDocument) => void;
}) {
  const scopesWithGaps = summary.scopes
    .map((scope) => ({
      ...scope,
      missingDocuments: activeReadinessDocuments(
        scope,
        skippedPaths,
      ),
    }))
    .filter(
      (scope) =>
        scope.missingDocuments.length > 0 ||
        scope.missingRequiredFields.length > 0,
    );
  const skippedDocuments = summary.scopes.flatMap(
    (scope) =>
      scope.missingDocuments
        .filter(
          (file) =>
            file.importance === "supplemental" &&
            skippedPaths.has(file.relativePath),
        )
        .map((file) => ({ scope, file })),
  );

  return (
    <section className="metadata-readiness-panel">
      <header className="metadata-readiness-header">
        <div>
          <h2>Metadata readiness</h2>
          <p>
            Work on a gap to jump directly to its release or track and the relevant editor. Optional files may also be skipped in this browser.
          </p>
        </div>

        <div className="metadata-readiness-summary">
          <span
            className={`badge ${
              summary.missingCoreDocuments > 0
                ? "missing"
                : "complete"
            }`}
          >
            {summary.missingCoreDocuments > 0
              ? `${summary.missingCoreDocuments} core missing`
              : "Core documents complete"}
          </span>
          <span
            className={`badge ${
              summary.missingRequiredFields > 0
                ? "warning"
                : "complete"
            }`}
          >
            {summary.missingRequiredFields > 0
              ? `${summary.missingRequiredFields} required fields missing`
              : "Required fields complete"}
          </span>
          {summary.missingCreditDocuments > 0 && (
            <span className="badge warning">
              {summary.missingCreditDocuments} credit {summary.missingCreditDocuments === 1 ? "file" : "files"} missing
            </span>
          )}
          {summary.missingSupplementalDocuments - skippedDocuments.length > 0 && (
            <span className="badge supplemental">
              {summary.missingSupplementalDocuments - skippedDocuments.length} optional to review
            </span>
          )}
          {skippedDocuments.length > 0 && (
            <span className="badge skipped">
              {skippedDocuments.length} skipped
            </span>
          )}
          <button
            type="button"
            className="metadata-readiness-toggle"
            aria-expanded={open}
            onClick={onToggle}
          >
            {open ? "Hide details" : "Review gaps"}
          </button>
        </div>
      </header>

      {open && scopesWithGaps.length > 0 && (
        <div className="metadata-readiness-scopes">
          {scopesWithGaps.map((scope) => (
            <section
              key={scope.id}
              className="metadata-readiness-scope"
            >
              <header>
                <strong>
                  {scope.kind === "release"
                    ? "Release"
                    : trackLabels.get(scope.id) ?? scope.id}
                </strong>
                <span>
                  {scope.missingDocuments.length + scope.missingRequiredFields.length} {scope.missingDocuments.length + scope.missingRequiredFields.length === 1 ? "item" : "items"}
                </span>
              </header>

              {scope.missingDocuments.map((file) => (
                <ReadinessDocumentRow
                  key={file.relativePath}
                  scope={scope}
                  file={file}
                  onNavigate={onNavigate}
                  onSkip={onSkip}
                />
              ))}

              {scope.missingRequiredFields.map((field) => (
                <ReadinessFieldRow
                  key={field.tomlPath}
                  scope={scope}
                  field={field}
                  onNavigate={onNavigate}
                />
              ))}
            </section>
          ))}
        </div>
      )}

      {open && skippedDocuments.length > 0 && (
        <details className="metadata-readiness-skipped">
          <summary>
            {skippedDocuments.length} optional {skippedDocuments.length === 1 ? "item" : "items"} skipped in this browser
          </summary>
          <div>
            {skippedDocuments.map(({ scope, file }) => (
              <div
                key={file.relativePath}
                className="metadata-readiness-item is-skipped"
              >
                <div>
                  <strong>{file.filename}</strong>
                  <small>
                    {scope.kind === "release"
                      ? "Release"
                      : trackLabels.get(scope.id) ?? scope.id}
                  </small>
                  <code>{file.relativePath}</code>
                </div>
                <span className="readiness-kind supplemental">
                  Skipped
                </span>
                <button
                  type="button"
                  onClick={() => onRestore(file)}
                >
                  Restore
                </button>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}

function ReadinessDocumentRow({
  scope,
  file,
  onNavigate,
  onSkip,
}: {
  scope: MetadataReadinessScope;
  file: MissingMetadataDocument;
  onNavigate: (target: ReadinessNavigationTarget) => void;
  onSkip: (file: MissingMetadataDocument) => void;
}) {
  return (
    <div className="metadata-readiness-item">
      <div>
        <strong>{file.filename}</strong>
        <small>{file.description}</small>
        <code>{file.relativePath}</code>
      </div>
      <span className={`readiness-kind ${file.importance}`}>
        {file.importance === "core"
          ? "Core"
          : file.importance === "credits"
            ? "Credits"
            : "Optional"}
      </span>
      <div className="metadata-readiness-item-actions">
        {file.importance === "supplemental" && (
          <button
            type="button"
            className="secondary"
            onClick={() => onSkip(file)}
          >
            Skip for now
          </button>
        )}
        <button
          type="button"
          onClick={() =>
            onNavigate({
              kind: "document",
              scopeId: scope.id,
              tab: file.tab,
              file,
            })
          }
        >
          Work on this
        </button>
      </div>
    </div>
  );
}

function ReadinessFieldRow({
  scope,
  field,
  onNavigate,
}: {
  scope: MetadataReadinessScope;
  field: RequiredFieldIssue;
  onNavigate: (target: ReadinessNavigationTarget) => void;
}) {
  return (
    <div className="metadata-readiness-item">
      <div>
        <strong>{field.label}</strong>
        <small>Required metadata field is blank or absent.</small>
        <code>{field.tomlPath}</code>
      </div>
      <span className="readiness-kind required">
        Required
      </span>
      <button
        type="button"
        onClick={() =>
          onNavigate({
            kind: "field",
            scopeId: scope.id,
            tab: field.tab,
            field,
          })
        }
      >
        Edit field
      </button>
    </div>
  );
}

function MetadataReadinessWorkItem({
  target,
  creating,
  onCreate,
  onSkip,
  onEditField,
  onClose,
}: {
  target: ReadinessNavigationTarget;
  creating: boolean;
  onCreate: (file: MissingMetadataDocument) => void;
  onSkip: (file: MissingMetadataDocument) => void;
  onEditField: (field: RequiredFieldIssue) => void;
  onClose: () => void;
}) {
  return (
    <section
      id="metadata-readiness-work-item"
      className="metadata-readiness-work-item"
      tabIndex={-1}
    >
      <header>
        <div>
          <span className="eyebrow">Readiness task</span>
          <h2>
            {target.kind === "document"
              ? target.file.filename
              : target.field.label}
          </h2>
        </div>
        <button
          type="button"
          className="metadata-readiness-work-close"
          aria-label="Close readiness task"
          onClick={onClose}
        >
          ×
        </button>
      </header>

      {target.kind === "document" ? (
        <>
          <p>{target.file.description}</p>
          <code>{target.file.relativePath}</code>
          <p className="metadata-readiness-work-guidance">
            Create this document to expose its fields in the current tab. Creation uses the existing validated, no-overwrite metadata workflow; the editor opens immediately afterward.
          </p>
          <div className="metadata-readiness-work-actions">
            {target.file.importance === "supplemental" && (
              <button
                type="button"
                className="secondary"
                disabled={creating}
                onClick={() => onSkip(target.file)}
              >
                Skip optional file
              </button>
            )}
            <button
              type="button"
              disabled={creating}
              onClick={() => onCreate(target.file)}
            >
              {creating
                ? "Creating…"
                : "Create and edit"}
            </button>
          </div>
        </>
      ) : (
        <>
          <p>
            This required field is blank or absent. Open edit mode and the interface will move to its metadata row.
          </p>
          <code>{target.field.tomlPath}</code>
          <div className="metadata-readiness-work-actions">
            <button
              type="button"
              onClick={() => onEditField(target.field)}
            >
              Edit this field
            </button>
          </div>
        </>
      )}
    </section>
  );
}

function ReleaseMetadataDetailView({
  detail,
  release,
  metadataRegistry,
  showAdminTools,
  onShowAdminToolsChange,
  onNotify,
  onBack,
  onRefresh,
  onOpenWorkflowHelp,
  onNavigateWorkflow,
  onOpenTagSearch,
}: {
  detail: ReleaseMetadataDetail;
  release: ReleaseScanResult | null;
  metadataRegistry: MetadataFieldDefinition[];
  showAdminTools: boolean;
  onShowAdminToolsChange: (
    visible: boolean,
  ) => void;
  onNotify: (
    message: string,
    tone?: ToastMessage["tone"],
  ) => void;
  onBack: () => void;
  onRefresh: () => void | Promise<void>;
  onOpenWorkflowHelp: () => void;
  onNavigateWorkflow: (
    view: WorkflowApplicationView,
  ) => void;
  onOpenTagSearch: () => void;
}) {
  const [setupMode, setSetupMode] =
    useState(false);
  const [
    starterDraft,
    setStarterDraft,
  ] = useState<StarterMetadataDraft | null>(
    null,
  );
  const [
    starterReviewed,
    setStarterReviewed,
  ] = useState(false);
  const [
    starterCreationLoading,
    setStarterCreationLoading,
  ] = useState(false);
  const [
    starterCreationError,
    setStarterCreationError,
  ] = useState<string | null>(null);

  const [editMode, setEditMode] =
    useState(false);
  const [draft, setDraft] =
    useState<MetadataDraft>({});
  const [
    performerDrafts,
    setPerformerDrafts,
  ] = useState<PerformerDraftMap>({});
  const [
    technicalCreditDrafts,
    setTechnicalCreditDrafts,
  ] = useState<TechnicalCreditDraftMap>({});
  const [
    arrangementCreditDrafts,
    setArrangementCreditDrafts,
  ] = useState<ArrangementCreditDraftMap>({});
  const [
    writingCreditDrafts,
    setWritingCreditDrafts,
  ] = useState<WritingCreditDraftMap>({});
  const [
    sampleRelationshipDrafts,
    setSampleRelationshipDrafts,
  ] = useState<SampleRelationshipDraftMap>({});
  const [
    sampleClearanceDrafts,
    setSampleClearanceDrafts,
  ] = useState<SampleClearanceDraftMap>({});
  const [
    savingDocumentPath,
    setSavingDocumentPath,
  ] = useState<string | null>(null);
  const [savingAll, setSavingAll] =
    useState(false);
  const [
    addingFieldsPath,
    setAddingFieldsPath,
  ] = useState<string | null>(null);
  const [
    removingFieldKey,
    setRemovingFieldKey,
  ] = useState<string | null>(null);
  const [
    creatingTrackCreditsPath,
    setCreatingTrackCreditsPath,
  ] = useState<string | null>(null);
  const [
    pendingInitialTechnicalCreditPath,
    setPendingInitialTechnicalCreditPath,
  ] = useState<string | null>(null);
  const [
    pendingInitialArrangementCreditPath,
    setPendingInitialArrangementCreditPath,
  ] = useState<string | null>(null);
  const [
    pendingInitialWritingCreditPath,
    setPendingInitialWritingCreditPath,
  ] = useState<string | null>(null);
  const [
    pendingInitialSamplePath,
    setPendingInitialSamplePath,
  ] = useState<string | null>(null);
  const [saveError, setSaveError] =
    useState<string | null>(null);
  const [activityLogOpen, setActivityLogOpen] =
    useState(false);
  const [performerCopySource, setPerformerCopySource] =
    useState<PerformerCopySource | null>(
      null,
    );
  const [metadataActivityEntries, setMetadataActivityEntries] =
    useState<MetadataActivityEntry[]>(() =>
      readMetadataActivityLog(
        window.sessionStorage,
      ),
    );
  const [
    activeDocumentGroup,
    setActiveDocumentGroup,
  ] = useState("release");
  const [
    activeMetadataTab,
    setActiveMetadataTab,
  ] = useState<ReleaseMetadataTab>(
    "overview",
  );
  const [
    detailMenuOpen,
    setDetailMenuOpen,
  ] = useState(false);
  const [readinessOpen, setReadinessOpen] =
    useState(true);
  const [
    readinessTarget,
    setReadinessTarget,
  ] = useState<ReadinessNavigationTarget | null>(
    null,
  );
  const [
    creatingReadinessPath,
    setCreatingReadinessPath,
  ] = useState<string | null>(null);
  const [
    pendingReadinessDocumentPath,
    setPendingReadinessDocumentPath,
  ] = useState<string | null>(null);
  const [
    skippedReadinessPaths,
    setSkippedReadinessPaths,
  ] = useState<string[]>(() =>
    readReadinessSkips(
      window.localStorage,
      detail.releaseId,
    ),
  );
  const detailMenuRef =
    useRef<HTMLElement>(null);
  const audioPreviewRef =
    useRef<HTMLAudioElement | null>(null);
  const [audioPreviewTrackId, setAudioPreviewTrackId] =
    useState<string | null>(null);
  const [audioPreviewPlaying, setAudioPreviewPlaying] =
    useState(false);
  const [audioPreviewLoading, setAudioPreviewLoading] =
    useState(false);
  const [audioPreviewError, setAudioPreviewError] =
    useState<string | null>(null);
  const [audioPreviewVolume, setAudioPreviewVolume] =
    useState(0.8);

  useEffect(() => {
    setAudioPreviewTrackId(null);
    setAudioPreviewPlaying(false);
    setAudioPreviewLoading(false);
    setAudioPreviewError(null);

    const audio = new Audio();
    audio.preload = "metadata";
    audio.volume = audioPreviewVolume;

    const handlePlay = () => {
      setAudioPreviewPlaying(true);
      setAudioPreviewLoading(false);
    };
    const handlePause = () => {
      setAudioPreviewPlaying(false);
      setAudioPreviewLoading(false);
    };
    const handleWaiting = () => {
      setAudioPreviewLoading(true);
    };
    const handleCanPlay = () => {
      setAudioPreviewLoading(false);
    };
    const handleError = () => {
      setAudioPreviewPlaying(false);
      setAudioPreviewLoading(false);
      setAudioPreviewError(
        "The selected source could not be decoded or transcoded for preview. Confirm FFmpeg is available, or generate audio-playback.mp3.",
      );
    };

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handlePause);
    audio.addEventListener("waiting", handleWaiting);
    audio.addEventListener("canplay", handleCanPlay);
    audio.addEventListener("error", handleError);
    audioPreviewRef.current = audio;

    return () => {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handlePause);
      audio.removeEventListener("waiting", handleWaiting);
      audio.removeEventListener("canplay", handleCanPlay);
      audio.removeEventListener("error", handleError);
      audioPreviewRef.current = null;
    };
  }, [detail.releaseId]);

  useEffect(() => {
    const audio = audioPreviewRef.current;

    if (audio) {
      audio.volume = audioPreviewVolume;
    }
  }, [audioPreviewVolume]);

  const recordMetadataActivity = (
    entry: MetadataActivityEntry,
  ) => {
    setMetadataActivityEntries(
      (currentEntries) => {
        const nextEntries =
          prependMetadataActivityEntry(
            currentEntries,
            entry,
          );

        writeMetadataActivityLog(
          window.sessionStorage,
          nextEntries,
        );

        return nextEntries;
      },
    );
  };

  const clearActivityLog = () => {
    clearMetadataActivityLog(
      window.sessionStorage,
    );
    setMetadataActivityEntries([]);
  };

  const persistSkippedReadinessPaths = (
    nextPaths: string[],
  ) => {
    writeReadinessSkips(
      window.localStorage,
      detail.releaseId,
      nextPaths,
    );
    setSkippedReadinessPaths(nextPaths);
  };

  const skipReadinessDocument = (
    file: MissingMetadataDocument,
  ) => {
    if (file.importance !== "supplemental") {
      return;
    }

    persistSkippedReadinessPaths(
      addReadinessSkip(
        skippedReadinessPaths,
        file.relativePath,
      ),
    );
    setReadinessTarget(null);
    setReadinessOpen(true);
    onNotify(
      `${file.filename} skipped in this browser`,
      "info",
    );
  };

  const restoreReadinessDocument = (
    file: MissingMetadataDocument,
  ) => {
    persistSkippedReadinessPaths(
      removeReadinessSkip(
        skippedReadinessPaths,
        file.relativePath,
      ),
    );
    onNotify(
      `${file.filename} restored to readiness`,
      "info",
    );
  };


  const completePerformerCopy = async (
    result: PerformerCopyResponse,
  ) => {
    const execution = result.execution;

    if (!execution) {
      return;
    }

    execution.targets.forEach((target) => {
      if (
        target.receipt ||
        target.error
      ) {
        recordMetadataActivity(
          createPerformerCopyActivityEntry({
            releaseId: detail.releaseId,
            sourceTrackId:
              result.sourceTrackId,
            target,
          }),
        );
      }
    });

    await Promise.resolve(onRefresh());

    if (execution.status === "verified") {
      onNotify(
        `${execution.addedCount} ${
          execution.addedCount === 1
            ? "performer credit"
            : "performer credits"
        } copied and verified`,
        "success",
      );
    } else if (
      execution.status === "partial"
    ) {
      onNotify(
        `${execution.addedCount} performer credits copied; ${execution.failedCount} targets need review`,
        "info",
      );
    } else {
      onNotify(
        "Performer credits could not be copied",
        "error",
      );
    }
  };

  useEffect(() => {
    setActiveDocumentGroup("release");
    setActiveMetadataTab("overview");
    setDetailMenuOpen(false);
    setReadinessOpen(true);
    setActivityLogOpen(false);
    setPerformerCopySource(null);
    setSetupMode(false);
    setStarterDraft(null);
    setStarterReviewed(false);
    setStarterCreationError(null);
    setPendingInitialTechnicalCreditPath(
      null,
    );
    setPendingInitialArrangementCreditPath(
      null,
    );
    setPendingInitialWritingCreditPath(null);
    setPendingInitialSamplePath(null);
    setReadinessTarget(null);
    setCreatingReadinessPath(null);
    setPendingReadinessDocumentPath(null);
    setSkippedReadinessPaths(
      readReadinessSkips(
        window.localStorage,
        detail.releaseId,
      ),
    );
  }, [detail.releaseId]);

  useEffect(() => {
    if (
      !pendingInitialTechnicalCreditPath
    ) {
      return;
    }

    const document =
      detail.documents.find(
        (candidate) =>
          candidate.relativePath ===
            pendingInitialTechnicalCreditPath &&
          candidate.filename ===
            "track-credits.toml",
      );

    if (!document) {
      return;
    }

    setTechnicalCreditDrafts(
      (currentDrafts) => ({
        ...currentDrafts,
        [document.relativePath]:
          currentDrafts[
            document.relativePath
          ] ?? [
            {
              key: [
                "new-technical",
                Date.now(),
                0,
              ].join("-"),
              sourceIndex: null,
              name: "",
              role: "",
              sortName: "",
            },
          ],
      }),
    );
    setPendingInitialTechnicalCreditPath(
      null,
    );
  }, [
    detail.documents,
    pendingInitialTechnicalCreditPath,
  ]);


  useEffect(() => {
    if (
      !pendingInitialArrangementCreditPath
    ) {
      return;
    }

    const document =
      detail.documents.find(
        (candidate) =>
          candidate.relativePath ===
            pendingInitialArrangementCreditPath &&
          candidate.filename ===
            "track-credits.toml",
      );

    if (!document) {
      return;
    }

    setArrangementCreditDrafts(
      (currentDrafts) => ({
        ...currentDrafts,
        [document.relativePath]:
          currentDrafts[
            document.relativePath
          ] ?? [
            {
              key: [
                "new-arrangement",
                Date.now(),
                0,
              ].join("-"),
              sourceIndex: null,
              name: "",
              role: "",
              sortName: "",
            },
          ],
      }),
    );
    setPendingInitialArrangementCreditPath(
      null,
    );
  }, [
    detail.documents,
    pendingInitialArrangementCreditPath,
  ]);

  useEffect(() => {
    if (!pendingInitialWritingCreditPath) {
      return;
    }

    const document = detail.documents.find(
      (candidate) =>
        candidate.relativePath ===
          pendingInitialWritingCreditPath &&
        candidate.filename === "track-credits.toml",
    );

    if (!document) {
      return;
    }

    setWritingCreditDrafts((currentDrafts) => ({
      ...currentDrafts,
      [document.relativePath]:
        currentDrafts[document.relativePath] ?? [
          {
            key: [
              "new-writing",
              Date.now(),
              0,
            ].join("-"),
            family: "songwriters",
            sourceFamily: null,
            sourceIndex: null,
            name: "",
            role: "written by",
            sortName: "",
          },
        ],
    }));
    setPendingInitialWritingCreditPath(null);
  }, [
    detail.documents,
    pendingInitialWritingCreditPath,
  ]);

  useEffect(() => {
    if (!pendingInitialSamplePath) {
      return;
    }

    const document = detail.documents.find(
      (candidate) =>
        candidate.relativePath === pendingInitialSamplePath &&
        candidate.filename === "track-credits.toml",
    );

    if (!document) {
      return;
    }

    setSampleRelationshipDrafts((currentDrafts) => ({
      ...currentDrafts,
      [document.relativePath]:
        currentDrafts[document.relativePath] ?? [
          {
            key: `new-sample-${Date.now()}`,
            sourceIndex: null,
            relationshipType: "sample",
            sourceTitle: "",
            sourceArtist: "",
            sourceWriters: [],
            sourceRelease: "",
            sourceYear: null,
            sourceIsrc: "",
            sourceIswc: "",
            usageDescription: "",
            creditText: "",
            notes: "",
          },
        ],
    }));
    setPendingInitialSamplePath(null);
  }, [detail.documents, pendingInitialSamplePath]);

  useEffect(() => {
    if (!pendingReadinessDocumentPath) {
      return;
    }

    const createdDocument = detail.documents.find(
      (candidate) =>
        candidate.relativePath ===
        pendingReadinessDocumentPath,
    );

    if (!createdDocument) {
      return;
    }

    setReadinessTarget(null);
    setPendingReadinessDocumentPath(null);

    window.requestAnimationFrame(() => {
      const element = Array.from(
        document.querySelectorAll<HTMLElement>(
          "[data-metadata-document-path]",
        ),
      ).find(
        (candidate) =>
          candidate.dataset.metadataDocumentPath ===
          createdDocument.relativePath,
      );

      element?.scrollIntoView({
        block: "start",
        behavior: "smooth",
      });
      element?.focus({ preventScroll: true });
    });
  }, [
    detail.documents,
    pendingReadinessDocumentPath,
  ]);

  useEffect(() => {
    if (
      !showAdminTools &&
      [
        "files",
        "developer",
        "settings",
        "raw",
      ].includes(activeMetadataTab) &&
      readinessTarget?.tab !== activeMetadataTab
    ) {
      setActiveMetadataTab("overview");
    }
  }, [
    activeMetadataTab,
    readinessTarget,
    showAdminTools,
  ]);

  useEffect(() => {
    if (!detailMenuOpen) {
      return;
    }

    const handlePointerDown = (
      event: PointerEvent,
    ) => {
      if (
        event.target instanceof Node &&
        !detailMenuRef.current?.contains(
          event.target,
        ) &&
        !(event.target instanceof Element &&
          event.target.closest(
            ".detail-menu-button",
          ))
      ) {
        setDetailMenuOpen(false);
      }
    };

    window.addEventListener(
      "pointerdown",
      handlePointerDown,
    );

    return () =>
      window.removeEventListener(
        "pointerdown",
        handlePointerDown,
      );
  }, [detailMenuOpen]);

  const dirtyCount =
    Object.keys(draft).length +
    Object.keys(
      performerDrafts,
    ).length +
    Object.keys(
      technicalCreditDrafts,
    ).length +
    Object.keys(
      arrangementCreditDrafts,
    ).length;

  useEffect(() => {
    if (dirtyCount === 0) {
      return;
    }

    const handleBeforeUnload = (
      event: BeforeUnloadEvent,
    ) => {
      event.preventDefault();

      /*
       * Browsers ignore custom text but require returnValue for
       * compatibility with the native unsaved-changes prompt.
       */
      event.returnValue = "";
    };

    window.addEventListener(
      "beforeunload",
      handleBeforeUnload,
    );

    return () => {
      window.removeEventListener(
        "beforeunload",
        handleBeforeUnload,
      );
    };
  }, [dirtyCount]);

  const updateDraftValue = (
    document: ParsedMetadataDocument,
    metadataPath: string,
    originalValue: EditableMetadataValue,
    nextValue: EditableMetadataValue,
  ) => {
    const key = buildDocumentDraftKey(
      document,
      metadataPath,
    );
    const originalValues = new Map<
      string,
      EditableMetadataValue
    >();
    for (const row of flattenMetadata(document.parsed)) {
      if (isEditableMetadataValue(row.value)) {
        originalValues.set(row.path, row.value);
      }
    }

    setDraft((currentDraft) => {
      const nextDraft = {
        ...currentDraft,
      };

      if (
        metadataValuesEqual(
          nextValue,
          originalValue,
        )
      ) {
        delete nextDraft[key];
      } else {
        nextDraft[key] = nextValue;
      }

      if (
        document.scope === "track" &&
        document.filename === "track.toml" &&
        typeof nextValue === "string" &&
        isTrackTitleDraftPath(metadataPath)
      ) {
        const derivedChanges =
          deriveTrackTitleDraftChanges({
            current: {
              title: readDocumentDraftString(
                document,
                "track.title",
                currentDraft,
              ),
              version: readDocumentDraftString(
                document,
                "track.version",
                currentDraft,
              ),
              displayTitle: readDocumentDraftString(
                document,
                "track.display_title",
                currentDraft,
              ),
              sortTitle: readDocumentDraftString(
                document,
                "track.sort_title",
                currentDraft,
              ),
            },
            changedPath: metadataPath,
            nextValue,
          });

        for (const change of derivedChanges) {
          // Existing fields update immediately in the browser. Missing default
          // fields are still created by deriveTrackSaveChanges during save.
          if (!originalValues.has(change.path)) continue;

          const derivedKey = buildDocumentDraftKey(
            document,
            change.path,
          );
          const derivedOriginalValue =
            originalValues.get(change.path);

          if (
            derivedOriginalValue !== undefined &&
            metadataValuesEqual(
              change.value,
              derivedOriginalValue,
            )
          ) {
            delete nextDraft[derivedKey];
          } else {
            nextDraft[derivedKey] = change.value;
          }
        }
      }

      return nextDraft;
    });
  };

  const updatePerformerDraft = (
    document: ParsedMetadataDocument,
    nextRecords: PerformerRecordDraft[],
  ) => {
    const originalRecords =
      readPerformerRecords(document);

    setPerformerDrafts(
      (currentDrafts) => {
        const nextDrafts = {
          ...currentDrafts,
        };

        if (
          performerRecordsEqual(
            originalRecords,
            nextRecords,
          )
        ) {
          delete nextDrafts[
            document.relativePath
          ];
        } else {
          nextDrafts[
            document.relativePath
          ] = nextRecords;
        }

        return nextDrafts;
      },
    );
  };

  const updateTechnicalCreditDraft = (
    document: ParsedMetadataDocument,
    nextRecords: PerformerRecordDraft[],
  ) => {
    const originalRecords =
      readTechnicalCreditRecords(
        document,
      );

    setTechnicalCreditDrafts(
      (currentDrafts) => {
        const nextDrafts = {
          ...currentDrafts,
        };

        if (
          performerRecordsEqual(
            originalRecords,
            nextRecords,
          )
        ) {
          delete nextDrafts[
            document.relativePath
          ];
        } else {
          nextDrafts[
            document.relativePath
          ] = nextRecords;
        }

        return nextDrafts;
      },
    );
  };

  const updateArrangementCreditDraft = (
    document: ParsedMetadataDocument,
    nextRecords: PerformerRecordDraft[],
  ) => {
    const originalRecords =
      readArrangementCreditRecords(document);

    setArrangementCreditDrafts(
      (currentDrafts) => {
        const nextDrafts = {
          ...currentDrafts,
        };

        if (
          performerRecordsEqual(
            originalRecords,
            nextRecords,
          )
        ) {
          delete nextDrafts[
            document.relativePath
          ];
        } else {
          nextDrafts[
            document.relativePath
          ] = nextRecords;
        }

        return nextDrafts;
      },
    );
  };

  const updateWritingCreditDraft = (
    document: ParsedMetadataDocument,
    nextRecords: WritingCreditRecordDraft[],
  ) => {
    const originalRecords =
      readWritingCreditRecords(document);

    setWritingCreditDrafts((currentDrafts) => {
      const nextDrafts = { ...currentDrafts };

      if (
        writingCreditRecordsEqual(
          originalRecords,
          nextRecords,
        )
      ) {
        delete nextDrafts[document.relativePath];
      } else {
        nextDrafts[document.relativePath] = nextRecords;
      }

      return nextDrafts;
    });
  };

  const updateSampleRelationshipDraft = (
    document: ParsedMetadataDocument,
    nextRecords: SampleRelationshipRecordDraft[],
  ) => {
    const originalRecords = readSampleRelationshipRecords(document);

    setSampleRelationshipDrafts((currentDrafts) => {
      const nextDrafts = { ...currentDrafts };
      if (sampleRelationshipRecordsEqual(originalRecords, nextRecords)) {
        delete nextDrafts[document.relativePath];
      } else {
        nextDrafts[document.relativePath] = nextRecords;
      }
      return nextDrafts;
    });
  };

  const updateSampleClearanceDraft = (
    document: ParsedMetadataDocument,
    nextRecords: SampleClearanceRecordDraft[],
  ) => {
    const originalRecords = readSampleClearanceRecords(document);

    setSampleClearanceDrafts((currentDrafts) => {
      const nextDrafts = { ...currentDrafts };
      if (sampleClearanceRecordsEqual(originalRecords, nextRecords)) {
        delete nextDrafts[document.relativePath];
      } else {
        nextDrafts[document.relativePath] = nextRecords;
      }
      return nextDrafts;
    });
  };

  const saveDocumentDraft = async (
    document: ParsedMetadataDocument,
  ) => {
    const { changes, createChanges } = getDocumentSaveChanges(
      document,
      draft,
      releaseDocuments,
    );
    const performerRecords =
      performerDrafts[
        document.relativePath
      ];
    const technicalContributorRecords =
      technicalCreditDrafts[
        document.relativePath
      ];
    const arrangementContributorRecords =
      arrangementCreditDrafts[
        document.relativePath
      ];
    const writingCreditRecords =
      writingCreditDrafts[document.relativePath];
    const sampleRelationshipRecords =
      sampleRelationshipDrafts[document.relativePath];
    const sampleClearanceRecords =
      sampleClearanceDrafts[document.relativePath];

    if (
      changes.length === 0 &&
      createChanges.length === 0 &&
      performerRecords === undefined &&
      technicalContributorRecords ===
        undefined &&
      arrangementContributorRecords ===
        undefined &&
      writingCreditRecords === undefined &&
      sampleRelationshipRecords === undefined &&
      sampleClearanceRecords === undefined
    ) {
      setSaveError(
        "This document has no metadata changes to save.",
      );
      return;
    }

    setSavingDocumentPath(
      document.relativePath,
    );
    setSaveError(null);

    let writeVerified = false;

    try {
      const response = await fetch(
        "/api/library/save-scalar-metadata",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            releaseId: detail.releaseId,
            relativePath:
              document.relativePath,
            originalSha256:
              document.sha256,
            changes,
            createChanges,
            performers:
              serializePerformerRecords(
                performerRecords,
              ),
            performerPath:
              performerRecords === undefined
                ? undefined
                : getPerformerPath(document),
            technicalContributors:
              serializeTechnicalCreditRecords(
                technicalContributorRecords,
              ),
            managedTechnicalContributorSourceIndexes:
              technicalContributorRecords ===
                undefined
                ? undefined
                : readManagedTechnicalCreditSourceIndexes(
                    document,
                  ),
            technicalContributorPath:
              technicalContributorRecords ===
                undefined
                ? undefined
                : getTechnicalContributorPath(
                    document,
                  ),
            arrangementContributors:
              serializeArrangementCreditRecords(
                arrangementContributorRecords,
              ),
            managedArrangementContributorSourceIndexes:
              arrangementContributorRecords ===
                undefined
                ? undefined
                : readManagedArrangementCreditSourceIndexes(
                    document,
                  ),
            arrangementContributorPath:
              arrangementContributorRecords ===
                undefined
                ? undefined
                : getArrangementContributorPath(
                    document,
                  ),
            writingCredits:
              serializeWritingCreditRecords(
                writingCreditRecords,
              ),
            writingCreditBasePath:
              writingCreditRecords === undefined
                ? undefined
                : getWritingCreditBasePath(document),
            sampleRelationships:
              serializeSampleRelationshipRecords(
                sampleRelationshipRecords,
              ),
            sampleClearances:
              serializeSampleClearanceRecords(
                sampleClearanceRecords,
              ),
          }),
        },
      );

      const result = (await response.json()) as
        | ScalarMetadataSaveReceipt
        | {
            error?: string;
          };

      if (!response.ok) {
        throw new Error(
          "error" in result
            ? result.error ??
                `Save failed: HTTP ${response.status}`
            : `Save failed: HTTP ${response.status}`,
        );
      }

      const receipt =
        result as ScalarMetadataSaveReceipt;

      recordMetadataActivity(
        createMetadataActivityEntry({
          releaseId: detail.releaseId,
          document,
          action: "save",
          status: "verified",
          message:
            "Metadata saved and verified against the canonical TOML document.",
          receipt,
        }),
      );
      writeVerified = true;

      /*
       * Refresh before clearing browser drafts. This keeps newly created
       * record rows visible until the canonical TOML document and hash have
       * been loaded from disk.
       */
      await onRefresh();

      setDraft((currentDraft) =>
        removeDocumentDraftChanges(
          document,
          currentDraft,
        ),
      );
      setPerformerDrafts(
        (currentDrafts) => {
          const nextDrafts = {
            ...currentDrafts,
          };

          delete nextDrafts[
            document.relativePath
          ];

          return nextDrafts;
        },
      );
      setTechnicalCreditDrafts(
        (currentDrafts) => {
          const nextDrafts = {
            ...currentDrafts,
          };

          delete nextDrafts[
            document.relativePath
          ];

          return nextDrafts;
        },
      );
      setArrangementCreditDrafts(
        (currentDrafts) => {
          const nextDrafts = {
            ...currentDrafts,
          };

          delete nextDrafts[
            document.relativePath
          ];

          return nextDrafts;
        },
      );
      setWritingCreditDrafts((currentDrafts) => {
        const nextDrafts = { ...currentDrafts };
        delete nextDrafts[document.relativePath];
        return nextDrafts;
      });
      setSampleRelationshipDrafts((currentDrafts) => {
        const nextDrafts = { ...currentDrafts };
        delete nextDrafts[document.relativePath];
        return nextDrafts;
      });
      setSampleClearanceDrafts((currentDrafts) => {
        const nextDrafts = { ...currentDrafts };
        delete nextDrafts[document.relativePath];
        return nextDrafts;
      });
      const synchronizedTrackFiles =
        (
          result as
            ScalarMetadataSaveReceipt
        ).synchronizedTrackFiles ?? 0;

      onNotify(
        synchronizedTrackFiles > 0
          ? `Metadata saved and verified · ${synchronizedTrackFiles} track ${
              synchronizedTrackFiles === 1
                ? "file"
                : "files"
            } synchronized`
          : "Metadata saved and verified",
        "success",
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown metadata save error";

      if (!writeVerified) {
        recordMetadataActivity(
          createMetadataActivityEntry({
            releaseId: detail.releaseId,
            document,
            action: "save",
            status: "failed",
            message,
          }),
        );
      }
      setSaveError(message);
      onNotify(
        "Metadata save failed",
        "error",
      );
    } finally {
      setSavingDocumentPath(null);
    }
  };

  const saveAllDrafts = async () => {
    const changedDocuments =
      detail.documents
        .filter(
          (document) =>
            getDocumentDraftChanges(
              document,
              draft,
            ).length > 0 ||
            performerDrafts[
              document.relativePath
            ] !== undefined ||
            technicalCreditDrafts[
              document.relativePath
            ] !== undefined ||
            arrangementCreditDrafts[
              document.relativePath
            ] !== undefined ||
            writingCreditDrafts[
              document.relativePath
            ] !== undefined ||
            sampleRelationshipDrafts[
              document.relativePath
            ] !== undefined ||
            sampleClearanceDrafts[
              document.relativePath
            ] !== undefined,
        )
        /*
         * Save track documents before release.toml. A release save may
         * synchronize authoritative totals into track.toml files, so
         * placing it last avoids stale-hash conflicts with unsaved
         * track changes.
         */
        .sort((left, right) => {
          const leftIsRelease =
            left.scope === "release";
          const rightIsRelease =
            right.scope === "release";

          return Number(leftIsRelease) -
            Number(rightIsRelease);
        });

    if (changedDocuments.length === 0) {
      return;
    }

    setSavingAll(true);
    setSaveError(null);

    let savedCount = 0;
    let synchronizedTrackFiles = 0;
    let activeSaveDocument:
      | ParsedMetadataDocument
      | null = null;

    try {
      for (const document of changedDocuments) {
        activeSaveDocument = document;
        const { changes, createChanges } =
          getDocumentSaveChanges(
            document,
            draft,
            releaseDocuments,
          );
        const performerRecords =
          performerDrafts[
            document.relativePath
          ];
        const technicalContributorRecords =
          technicalCreditDrafts[
            document.relativePath
          ];
        const arrangementContributorRecords =
          arrangementCreditDrafts[
            document.relativePath
          ];
        const writingCreditRecords =
          writingCreditDrafts[document.relativePath];
        const sampleRelationshipRecords =
          sampleRelationshipDrafts[document.relativePath];
        const sampleClearanceRecords =
          sampleClearanceDrafts[document.relativePath];

        const response = await fetch(
          "/api/library/save-scalar-metadata",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              releaseId: detail.releaseId,
              relativePath:
                document.relativePath,
              originalSha256:
                document.sha256,
              changes,
              createChanges,
              performers:
                serializePerformerRecords(
                  performerRecords,
                ),
              performerPath:
                performerRecords === undefined
                  ? undefined
                  : getPerformerPath(document),
              technicalContributors:
                serializeTechnicalCreditRecords(
                  technicalContributorRecords,
                ),
              managedTechnicalContributorSourceIndexes:
                technicalContributorRecords ===
                  undefined
                  ? undefined
                  : readManagedTechnicalCreditSourceIndexes(
                      document,
                    ),
              technicalContributorPath:
                technicalContributorRecords ===
                  undefined
                  ? undefined
                  : getTechnicalContributorPath(
                      document,
                    ),
              arrangementContributors:
                serializeArrangementCreditRecords(
                  arrangementContributorRecords,
                ),
              managedArrangementContributorSourceIndexes:
                arrangementContributorRecords ===
                  undefined
                  ? undefined
                  : readManagedArrangementCreditSourceIndexes(
                      document,
                    ),
              arrangementContributorPath:
                arrangementContributorRecords ===
                  undefined
                  ? undefined
                  : getArrangementContributorPath(
                      document,
                    ),
              writingCredits:
                serializeWritingCreditRecords(
                  writingCreditRecords,
                ),
              writingCreditBasePath:
                writingCreditRecords === undefined
                  ? undefined
                  : getWritingCreditBasePath(document),
              sampleRelationships:
                serializeSampleRelationshipRecords(
                  sampleRelationshipRecords,
                ),
              sampleClearances:
                serializeSampleClearanceRecords(
                  sampleClearanceRecords,
                ),
            }),
          },
        );

        const result =
          (await response.json()) as
            | ScalarMetadataSaveReceipt
            | {
                error?: string;
              };

        if (!response.ok) {
          throw new Error(
            "error" in result
              ? result.error ??
                  `Save failed: HTTP ${response.status}`
              : `Save failed: HTTP ${response.status}`,
          );
        }

        const receipt =
          result as ScalarMetadataSaveReceipt;

        savedCount += 1;
        synchronizedTrackFiles +=
          receipt.synchronizedTrackFiles ??
          0;

        recordMetadataActivity(
          createMetadataActivityEntry({
            releaseId: detail.releaseId,
            document,
            action: "save",
            status: "verified",
            message:
              "Metadata saved and verified against the canonical TOML document.",
            receipt,
          }),
        );

        setDraft((currentDraft) =>
          removeDocumentDraftChanges(
            document,
            currentDraft,
          ),
        );
        setPerformerDrafts(
          (currentDrafts) => {
            const nextDrafts = {
              ...currentDrafts,
            };

            delete nextDrafts[
              document.relativePath
            ];

            return nextDrafts;
          },
        );
        setTechnicalCreditDrafts(
          (currentDrafts) => {
            const nextDrafts = {
              ...currentDrafts,
            };

            delete nextDrafts[
              document.relativePath
            ];

            return nextDrafts;
          },
        );
        setArrangementCreditDrafts(
          (currentDrafts) => {
            const nextDrafts = {
              ...currentDrafts,
            };

            delete nextDrafts[
              document.relativePath
            ];

            return nextDrafts;
          },
        );
        setWritingCreditDrafts((currentDrafts) => {
          const nextDrafts = { ...currentDrafts };
          delete nextDrafts[document.relativePath];
          return nextDrafts;
        });
        setSampleRelationshipDrafts((currentDrafts) => {
          const nextDrafts = { ...currentDrafts };
          delete nextDrafts[document.relativePath];
          return nextDrafts;
        });
        setSampleClearanceDrafts((currentDrafts) => {
          const nextDrafts = { ...currentDrafts };
          delete nextDrafts[document.relativePath];
          return nextDrafts;
        });
      }

      activeSaveDocument = null;
      await onRefresh();
      setEditMode(false);

      const fileLabel =
        savedCount === 1
          ? "metadata file"
          : "metadata files";

      onNotify(
        synchronizedTrackFiles > 0
          ? `${savedCount} ${fileLabel} saved and verified · ${synchronizedTrackFiles} track ${
              synchronizedTrackFiles === 1
                ? "file"
                : "files"
            } synchronized`
          : `${savedCount} ${fileLabel} saved and verified`,
        "success",
      );
    } catch (error) {
      /*
       * Some earlier documents may already be saved. Refresh hashes and
       * canonical values while retaining drafts for documents that did
       * not complete.
       */
      await onRefresh();

      const message =
        error instanceof Error
          ? error.message
          : "Unknown metadata save error";

      if (activeSaveDocument) {
        recordMetadataActivity(
          createMetadataActivityEntry({
            releaseId: detail.releaseId,
            document: activeSaveDocument,
            action: "save",
            status: "failed",
            message,
          }),
        );
      }

      setSaveError(message);
      onNotify(
        savedCount > 0
          ? `${savedCount} saved before an error occurred`
          : "Metadata save failed",
        "error",
      );
    } finally {
      setSavingAll(false);
    }
  };

  const addMetadataFields = async (
    document: ParsedMetadataDocument,
    fields: MetadataFieldDefinition[],
  ) => {
    if (fields.length === 0) {
      return;
    }

    setAddingFieldsPath(
      document.relativePath,
    );
    setSaveError(null);

    let writeVerified = false;

    try {
      const response = await fetch(
        "/api/library/create-metadata-fields",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            releaseId: detail.releaseId,
            relativePath:
              document.relativePath,
            originalSha256:
              document.sha256,
            changes: fields.map(
              (field) => ({
                path: field.tomlPath,
                value:
                  getInitialMetadataFieldValue(
                    field,
                    document,
                    draft,
                    releaseDocuments,
                  ),
              }),
            ),
          }),
        },
      );

      const result =
        (await response.json()) as
          | ScalarMetadataSaveReceipt
          | {
              error?: string;
            };

      if (!response.ok) {
        throw new Error(
          "error" in result
            ? result.error ??
                `Field creation failed: HTTP ${response.status}`
            : `Field creation failed: HTTP ${response.status}`,
        );
      }

      const receipt =
        result as ScalarMetadataSaveReceipt;

      recordMetadataActivity(
        createMetadataActivityEntry({
          releaseId: detail.releaseId,
          document,
          action: "add-fields",
          status: "verified",
          message: `${fields.length} ${
            fields.length === 1
              ? "metadata field was"
              : "metadata fields were"
          } added and verified.`,
          receipt,
        }),
      );
      writeVerified = true;

      await onRefresh();
      onNotify(
        `${fields.length} ${
          fields.length === 1
            ? "field"
            : "fields"
        } added`,
        "success",
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown metadata field creation error";

      if (!writeVerified) {
        recordMetadataActivity(
          createMetadataActivityEntry({
            releaseId: detail.releaseId,
            document,
            action: "add-fields",
            status: "failed",
            message,
          }),
        );
      }
      setSaveError(message);
      onNotify(
        "Metadata fields could not be added",
        "error",
      );
    } finally {
      setAddingFieldsPath(null);
    }
  };

  const removeMetadataField = async (
    document: ParsedMetadataDocument,
    field: MetadataFieldDefinition,
  ) => {
    const removalKey = buildDocumentDraftKey(
      document,
      field.tomlPath,
    );

    setRemovingFieldKey(removalKey);
    setSaveError(null);

    let writeVerified = false;

    try {
      const response = await fetch(
        "/api/library/delete-metadata-fields",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            releaseId: detail.releaseId,
            relativePath:
              document.relativePath,
            originalSha256:
              document.sha256,
            paths: [field.tomlPath],
          }),
        },
      );

      const result =
        (await response.json()) as
          | ScalarMetadataSaveReceipt
          | {
              error?: string;
            };

      if (!response.ok) {
        throw new Error(
          "error" in result
            ? result.error ??
                `Field removal failed: HTTP ${response.status}`
            : `Field removal failed: HTTP ${response.status}`,
        );
      }

      const receipt =
        result as ScalarMetadataSaveReceipt;

      recordMetadataActivity(
        createMetadataActivityEntry({
          releaseId: detail.releaseId,
          document,
          action: "remove-fields",
          status: "verified",
          message: `${field.label} was removed and verified.`,
          receipt,
        }),
      );
      writeVerified = true;

      // A deleted field must not leave a stale browser draft behind.
      setDraft((currentDraft) => {
        const nextDraft = {
          ...currentDraft,
        };

        delete nextDraft[removalKey];
        return nextDraft;
      });

      await onRefresh();
      onNotify(
        `${field.label} removed`,
        "success",
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown metadata field removal error";

      if (!writeVerified) {
        recordMetadataActivity(
          createMetadataActivityEntry({
            releaseId: detail.releaseId,
            document,
            action: "remove-fields",
            status: "failed",
            message,
          }),
        );
      }

      setSaveError(message);
      onNotify(
        "Metadata field could not be removed",
        "error",
      );
    } finally {
      setRemovingFieldKey(null);
    }
  };

  const createTrackCreditsDocument = async (
    file: MetadataFileStatus,
    initialCreditKind:
      | "technical"
      | "arrangement"
      | "writing"
      | "samples",
  ) => {
    setCreatingTrackCreditsPath(
      file.relativePath,
    );
    setSaveError(null);

    try {
      const response = await fetch(
        "/api/library/create-track-credits-document",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            releaseId: detail.releaseId,
            relativePath:
              file.relativePath,
          }),
        },
      );

      const result =
        (await response.json()) as
          | {
              created?: string[];
            }
          | {
              error?: string;
            };

      if (!response.ok) {
        throw new Error(
          "error" in result
            ? result.error ??
                `Credits-file creation failed: HTTP ${response.status}`
            : `Credits-file creation failed: HTTP ${response.status}`,
        );
      }

      setPendingInitialTechnicalCreditPath(
        initialCreditKind === "technical"
          ? file.relativePath
          : null,
      );
      setPendingInitialArrangementCreditPath(
        initialCreditKind === "arrangement"
          ? file.relativePath
          : null,
      );
      setPendingInitialWritingCreditPath(
        initialCreditKind === "writing"
          ? file.relativePath
          : null,
      );
      setPendingInitialSamplePath(
        initialCreditKind === "samples"
          ? file.relativePath
          : null,
      );

      await onRefresh();
      onNotify(
        initialCreditKind === "technical"
          ? "Technical credits are ready to edit"
          : initialCreditKind === "arrangement"
            ? "Arrangement credits are ready to edit"
            : initialCreditKind === "writing"
              ? "Songwriting credits are ready to edit"
              : "Sample relationships are ready to edit",
        "success",
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown track-credits document creation error";

      setPendingInitialTechnicalCreditPath(
        null,
      );
      setPendingInitialArrangementCreditPath(
        null,
      );
      setPendingInitialWritingCreditPath(null);
      setPendingInitialSamplePath(null);
        setSaveError(message);
      onNotify(
        initialCreditKind === "technical"
          ? "Technical credits could not be initialized"
          : initialCreditKind === "arrangement"
            ? "Arrangement credits could not be initialized"
            : initialCreditKind === "writing"
              ? "Songwriting credits could not be initialized"
              : "Sample relationships could not be initialized",
        "error",
      );
    } finally {
      setCreatingTrackCreditsPath(
        null,
      );
    }
  };

  const createReadinessDocument = async (
    file: MissingMetadataDocument,
  ) => {
    setCreatingReadinessPath(
      file.relativePath,
    );
    setSaveError(null);

    try {
      const response = await fetch(
        "/api/library/create-metadata-document",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            releaseId: detail.releaseId,
            relativePath: file.relativePath,
            confirmation:
              "CREATE_METADATA_DOCUMENT",
          }),
        },
      );

      const result = (await response.json()) as {
        created?: string[];
        receipts?: Array<{
          relativePath: string;
          bytes: number;
          sha256: string;
          verifiedAt: string;
        }>;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          result.error ??
            `Metadata document creation failed: HTTP ${response.status}`,
        );
      }

      persistSkippedReadinessPaths(
        removeReadinessSkip(
          skippedReadinessPaths,
          file.relativePath,
        ),
      );

      const receipt = result.receipts?.find(
        (candidate) =>
          candidate.relativePath ===
          file.relativePath,
      );
      const occurredAt =
        receipt?.verifiedAt ??
        new Date().toISOString();

      recordMetadataActivity({
        id: [
          occurredAt,
          file.relativePath,
          "create-document",
          Math.random().toString(36).slice(2),
        ].join(":"),
        occurredAt,
        releaseId: detail.releaseId,
        documentRelativePath:
          file.relativePath,
        documentFilename: file.filename,
        scope:
          activeDocumentGroup === "release"
            ? "release"
            : "track",
        ...(activeDocumentGroup !== "release"
          ? { trackId: activeDocumentGroup }
          : {}),
        action: "create-document",
        status: "verified",
        message: receipt
          ? `${file.filename} created and verified (${receipt.bytes} bytes; SHA-256 ${receipt.sha256}).`
          : `${file.filename} created and verified.`,
      });

      setPendingReadinessDocumentPath(
        file.relativePath,
      );
      setEditMode(true);
      await Promise.resolve(onRefresh());
      onNotify(
        `${file.filename} created and ready to edit`,
        "success",
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown metadata document creation error";

      recordMetadataActivity({
        id: [
          new Date().toISOString(),
          file.relativePath,
          "create-document",
          "failed",
          Math.random().toString(36).slice(2),
        ].join(":"),
        occurredAt: new Date().toISOString(),
        releaseId: detail.releaseId,
        documentRelativePath:
          file.relativePath,
        documentFilename: file.filename,
        scope:
          activeDocumentGroup === "release"
            ? "release"
            : "track",
        ...(activeDocumentGroup !== "release"
          ? { trackId: activeDocumentGroup }
          : {}),
        action: "create-document",
        status: "failed",
        message,
      });
      setSaveError(message);
      onNotify(
        "Metadata document could not be created",
        "error",
      );
    } finally {
      setCreatingReadinessPath(null);
    }
  };

  const discardDraft = () => {
    setDraft({});
    setPerformerDrafts({});
    setTechnicalCreditDrafts({});
    setArrangementCreditDrafts({});
    setWritingCreditDrafts({});
    setSampleRelationshipDrafts({});
    setSampleClearanceDrafts({});
    setEditMode(false);
    onNotify(
      "Changes discarded",
      "info",
    );
  };

  const releaseDocuments =
    detail.documents.filter(
      (document) =>
        document.scope === "release",
    );
  const releasePrimaryArtistValue =
    findMetadataValueAcrossDocuments(
      releaseDocuments,
      "release.primary_artist.name",
    );
  const releasePrimaryArtistName =
    typeof releasePrimaryArtistValue ===
    "string"
      ? releasePrimaryArtistValue
      : "";

  /*
   * Build track navigation from the scanner result rather than from
   * parsed TOML documents. This keeps every discovered track visible
   * even before its metadata files have been created.
   *
   * Preserve any document-only track IDs as a defensive fallback for
   * older or partially migrated libraries.
   */
  const scannedTrackIds =
    release?.tracks.map((track) => track.id) ??
    [];

  const documentTrackIds =
    detail.documents
      .map((document) => document.trackId)
      .filter(
        (trackId): trackId is string =>
          Boolean(trackId),
      );
  const discoveredTrackIds = Array.from(
    new Set([
      ...scannedTrackIds,
      ...documentTrackIds,
    ]),
  );
  const trackNavigation =
    buildTrackNavigationOrder(
      discoveredTrackIds.map(
        (trackId, sourceIndex) => {
          const inferredNumber =
            inferTrackSummary(
              trackId,
            ).number;

          return {
            trackId,
            sourceIndex,
            trackNumber:
              readEffectiveTrackNavigationInteger({
                trackId,
                metadataPath:
                  "track.numbering.track_number",
                documents: detail.documents,
                draft,
              }) ?? inferredNumber,
            discNumber:
              readEffectiveTrackNavigationInteger({
                trackId,
                metadataPath:
                  "track.numbering.disc_number",
                documents: detail.documents,
                draft,
              }),
          };
        },
      ),
    );
  const trackIds =
    trackNavigation.entries.map(
      (entry) => entry.trackId,
    );
  const trackNavigationById = new Map(
    trackNavigation.entries.map(
      (entry) => [entry.trackId, entry],
    ),
  );
  const orderedScannedTracks = trackIds
    .map((trackId) =>
      release?.tracks.find(
        (track) => track.id === trackId,
      ),
    )
    .filter(
      (track): track is TrackScanResult =>
        Boolean(track),
    );

  const playableTrackIds = getPlayableTrackIds(
    orderedScannedTracks,
  );
  const activeTrackIsPlayable =
    activeDocumentGroup !== "release" &&
    playableTrackIds.includes(
      activeDocumentGroup,
    );
  const preferredAudioPreviewTrackId =
    activeTrackIsPlayable
      ? activeDocumentGroup
      : audioPreviewTrackId &&
          playableTrackIds.includes(
            audioPreviewTrackId,
          )
        ? audioPreviewTrackId
        : playableTrackIds[0] ?? null;

  const loadAudioPreviewTrack = async (
    trackId: string,
    playImmediately: boolean,
  ) => {
    const audio = audioPreviewRef.current;
    const track = release?.tracks.find(
      (candidate) => candidate.id === trackId,
    );

    if (
      !audio ||
      !track ||
      !trackHasAudioPreview(track)
    ) {
      setAudioPreviewError(
        "This track does not have one unambiguous audio preview source.",
      );
      return;
    }

    setActiveDocumentGroup(trackId);
    setAudioPreviewError(null);

    if (audioPreviewTrackId !== trackId) {
      audio.pause();
      audio.src = buildAudioPreviewUrl(
        detail.releaseId,
        trackId,
      );
      audio.load();
      setAudioPreviewTrackId(trackId);
      setAudioPreviewLoading(true);
    }

    if (!playImmediately) {
      audio.pause();
      return;
    }

    try {
      await audio.play();
    } catch (error) {
      setAudioPreviewPlaying(false);
      setAudioPreviewLoading(false);
      setAudioPreviewError(
        error instanceof Error
          ? error.message
          : "Audio preview could not start.",
      );
    }
  };

  const toggleAudioPreviewTrack = (
    trackId: string,
  ) => {
    const audio = audioPreviewRef.current;

    if (
      audioPreviewTrackId === trackId &&
      audio &&
      !audio.paused
    ) {
      audio.pause();
      return;
    }

    void loadAudioPreviewTrack(
      trackId,
      true,
    );
  };

  const moveAudioPreview = (
    direction: -1 | 1,
  ) => {
    const audio = audioPreviewRef.current;
    const targetTrackId =
      getAdjacentPlayableTrackId(
        playableTrackIds,
        audioPreviewTrackId ??
          (activeTrackIsPlayable
            ? activeDocumentGroup
            : null),
        direction,
      );

    if (!targetTrackId) {
      return;
    }

    void loadAudioPreviewTrack(
      targetTrackId,
      Boolean(audio && !audio.paused),
    );
  };

  const findMissingTrackCreditsFile = (
    trackId: string,
  ): MetadataFileStatus | undefined =>
    release?.tracks
      .find(
        (track) =>
          track.id === trackId,
      )
      ?.metadataFiles.find(
        (file) =>
          !file.exists &&
          file.filename ===
            "track-credits.toml",
      );

  const metadataEntryIds = [
    "release",
    ...trackIds,
  ];

  const activeMetadataEntryIndex =
    Math.max(
      0,
      metadataEntryIds.indexOf(
        activeDocumentGroup,
      ),
    );

  const activeMetadataEntryLabel =
    activeDocumentGroup === "release"
      ? "Release"
      : `Track ${
          activeMetadataEntryIndex
        } of ${trackIds.length}`;

  const cycleMetadataEntry = (
    direction: -1 | 1,
  ) => {
    if (metadataEntryIds.length < 2) {
      return;
    }

    const nextIndex =
      (
        activeMetadataEntryIndex +
        direction +
        metadataEntryIds.length
      ) % metadataEntryIds.length;

    setActiveDocumentGroup(
      metadataEntryIds[nextIndex] ??
        "release",
    );
  };

  const countDraftChangesForDocuments = (
    documents: ParsedMetadataDocument[],
  ): number => {
    const documentPrefixes =
      documents.map(
        (document) =>
          `${document.relativePath}::`,
      );

    const scalarCount =
      Object.keys(draft).filter(
        (draftKey) =>
          documentPrefixes.some(
            (prefix) =>
              draftKey.startsWith(
                prefix,
              ),
          ),
      ).length;

    const performerCount =
      documents.filter(
        (document) =>
          performerDrafts[
            document.relativePath
          ] !== undefined,
      ).length;
    const technicalCreditCount =
      documents.filter(
        (document) =>
          technicalCreditDrafts[
            document.relativePath
          ] !== undefined,
      ).length;
    const arrangementCreditCount =
      documents.filter(
        (document) =>
          arrangementCreditDrafts[
            document.relativePath
          ] !== undefined,
      ).length;
    const writingCreditCount =
      documents.filter(
        (document) =>
          writingCreditDrafts[
            document.relativePath
          ] !== undefined,
      ).length;
    const sampleRelationshipCount =
      documents.filter(
        (document) =>
          sampleRelationshipDrafts[
            document.relativePath
          ] !== undefined,
      ).length;
    const sampleClearanceCount =
      documents.filter(
        (document) =>
          sampleClearanceDrafts[
            document.relativePath
          ] !== undefined,
      ).length;

    return (
      scalarCount +
      performerCount +
      technicalCreditCount +
      arrangementCreditCount +
      writingCreditCount +
      sampleRelationshipCount +
      sampleClearanceCount
    );
  };

  const releaseDraftCount =
    countDraftChangesForDocuments(
      releaseDocuments,
    );

  const releaseDateLabel =
    formatReleaseDate(detail.releaseId);
  const releaseArtwork =
    selectPreferredReleaseArtwork(
      release?.artworkMasters ?? [],
    );
  const isMetadataEmpty =
    detail.documents.length === 0;
  const inferredReleaseTitle =
    formatReleaseTitle(detail.releaseId);

  const inferredTracks = trackIds
    .map(inferTrackSummary)
    .map((track) => {
      const titleMetadata =
        inferTrackTitleMetadata(
          track.title,
          inferredReleaseTitle,
        );

      return {
        ...track,
        title: titleMetadata.title,
        version: titleMetadata.version,
        displayTitle:
          titleMetadata.displayTitle,
      };
    });

  const audioPreviewControlTrackId =
    preferredAudioPreviewTrackId;
  const audioPreviewControlTrack =
    audioPreviewControlTrackId
      ? release?.tracks.find(
          (track) =>
            track.id ===
            audioPreviewControlTrackId,
        ) ?? null
      : null;
  const audioPreviewControlTitle =
    audioPreviewControlTrackId
      ? readTrackDisplayTitle(
          audioPreviewControlTrackId,
          detail.documents.filter(
            (document) =>
              document.trackId ===
              audioPreviewControlTrackId,
          ),
          inferredTracks.find(
            (track) =>
              track.id ===
              audioPreviewControlTrackId,
          )?.displayTitle ??
            formatReleaseTitle(
              audioPreviewControlTrackId,
            ),
        )
      : "No playable track";
  const audioPreviewSourceLabel =
    getAudioPreviewSourceLabel(
      audioPreviewControlTrack,
    );

  const performerCopyTrackOptions =
    trackIds.map((trackId, index) => {
      const trackDocuments =
        detail.documents.filter(
          (document) =>
            document.trackId === trackId,
        );
      const inferredTitle =
        inferredTracks.find(
          (track) =>
            track.id === trackId,
        )?.displayTitle ??
        formatReleaseTitle(trackId);
      const navigationEntry =
        trackNavigationById.get(trackId);
      const trackNumber =
        navigationEntry?.trackNumber ??
        index + 1;
      const discPrefix =
        navigationEntry &&
        navigationEntry.effectiveDiscNumber > 1
          ? `Disc ${navigationEntry.effectiveDiscNumber} · `
          : "";

      return {
        trackId,
        label: `${discPrefix}Track ${trackNumber} — ${readTrackDisplayTitle(
          trackId,
          trackDocuments,
          inferredTitle,
        )}`,
      };
    });

  const readinessTrackLabels = new Map(
    performerCopyTrackOptions.map(
      (option) => [
        option.trackId,
        option.label,
      ],
    ),
  );

  const performerCopySourceLabel =
    performerCopySource?.document.scope ===
      "release"
      ? `Release — ${inferredReleaseTitle}`
      : performerCopySource?.document.trackId
        ? performerCopyTrackOptions.find(
            (option) =>
              option.trackId ===
              performerCopySource.document.trackId,
          )?.label ??
          performerCopySource.document.trackId
        : "Track";

  const trackNumberConflictMessages =
    trackNavigation.conflicts.map(
      (conflict) => {
        const trackLabels =
          conflict.trackIds.map(
            (trackId) => {
              const trackDocuments =
                detail.documents.filter(
                  (document) =>
                    document.trackId ===
                    trackId,
                );
              const inferredTitle =
                inferredTracks.find(
                  (track) =>
                    track.id === trackId,
                )?.displayTitle ??
                formatReleaseTitle(trackId);

              return readTrackDisplayTitle(
                trackId,
                trackDocuments,
                inferredTitle,
              );
            },
          );
        const discLabel =
          conflict.discNumber > 1
            ? `Disc ${conflict.discNumber}, track ${conflict.trackNumber}`
            : `Track ${conflict.trackNumber}`;

        return `${discLabel}: ${trackLabels.join(
          ", ",
        )}`;
      },
    );

  const inferredReleaseArtist =
    inferCommonReleaseArtist(
      inferredTracks,
    );

  const skippedReadinessPathSet = useMemo(
    () => new Set(skippedReadinessPaths),
    [skippedReadinessPaths],
  );

  const metadataReadiness = release
    ? buildMetadataReadiness({
        release,
        documents: detail.documents,
        fields: metadataRegistry,
      })
    : null;
  const fallbackMissingSummary =
    summarizeMissingMetadataDocuments(
      detail.missingFiles,
    );
  const detailMissingSummary =
    metadataReadiness
      ? {
          core:
            metadataReadiness.missingCoreDocuments,
          credits:
            metadataReadiness.missingCreditDocuments,
          supplemental:
            metadataReadiness.missingSupplementalDocuments,
          total:
            metadataReadiness.totalMissingDocuments,
        }
      : fallbackMissingSummary;
  const releaseReadinessScope =
    metadataReadiness?.scopes.find(
      (scope) => scope.id === "release",
    );

  const metadataHealthLabel =
    isMetadataEmpty
      ? "Not started"
      : detail.warnings.length > 0
        ? "Needs review"
        : metadataReadiness?.actionableCount
          ? "Partial"
          : "Core complete";

  const metadataHealthTone =
    isMetadataEmpty
      ? "missing"
      : detail.warnings.length > 0
        ? "warning"
        : metadataReadiness?.actionableCount
          ? "preview"
          : "complete";

  const navigateToReadinessItem = (
    target: ReadinessNavigationTarget,
  ) => {
    if (
      target.tab === "settings" &&
      !showAdminTools
    ) {
      onShowAdminToolsChange(true);
    }

    setActiveDocumentGroup(target.scopeId);
    setActiveMetadataTab(target.tab);
    setReadinessTarget(target);
    setReadinessOpen(false);

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const workItem = document.getElementById(
          "metadata-readiness-work-item",
        );

        workItem?.scrollIntoView({
          block: "center",
          behavior: "smooth",
        });
        workItem?.focus({
          preventScroll: true,
        });
      });
    });
  };

  const editReadinessField = (
    field: RequiredFieldIssue,
  ) => {
    setEditMode(true);
    setReadinessTarget(null);

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const row = Array.from(
          document.querySelectorAll<HTMLElement>(
            "[data-metadata-path]",
          ),
        ).find(
          (candidate) =>
            candidate.dataset.metadataPath ===
            field.tomlPath,
        );

        row?.scrollIntoView({
          block: "center",
          behavior: "smooth",
        });
        row?.focus({ preventScroll: true });
      });
    });
  };

  const beginStarterSetup = () => {
    setStarterDraft({
      releaseId: detail.releaseId,
      releaseTitle: inferredReleaseTitle,
      releaseDate:
        detail.releaseId.slice(0, 10),
      releaseArtist:
        inferredReleaseArtist,
      tracks: inferredTracks.map(
        (track, index) => ({
          trackId: track.id,
          trackNumber:
            track.number ?? index + 1,
          artist: track.artist,
          title: track.title,
          version: track.version,
          displayTitle:
            track.displayTitle,
        }),
      ),
    });
    setStarterReviewed(false);
    setStarterCreationError(null);
    setSetupMode(true);
  };

  const updateStarterTrack = (
    trackId: string,
    field:
      | "trackNumber"
      | "artist"
      | "title"
      | "version"
      | "displayTitle",
    value: string,
  ) => {
    setStarterDraft((current) => {
      if (!current) {
        return current;
      }

      return {
        ...current,
        tracks: current.tracks.map(
          (track) => {
            if (track.trackId !== trackId) {
              return track;
            }

            if (field === "trackNumber") {
              return {
                ...track,
                trackNumber:
                  Number.parseInt(
                    value,
                    10,
                  ) || 0,
              };
            }

            if (
              field === "title" ||
              field === "version"
            ) {
              const previousGeneratedTitle =
                formatTrackDisplayTitle(
                  track.title,
                  track.version,
                );
              const nextTrack = {
                ...track,
                [field]: value,
              };
              const nextGeneratedTitle =
                formatTrackDisplayTitle(
                  nextTrack.title,
                  nextTrack.version,
                );

              return {
                ...nextTrack,
                displayTitle:
                  !track.displayTitle.trim() ||
                  track.displayTitle ===
                    previousGeneratedTitle
                    ? nextGeneratedTitle
                    : track.displayTitle,
              };
            }

            return {
              ...track,
              [field]: value,
            };
          },
        ),
      };
    });
  };

  const createStarterMetadata = async () => {
    if (
      !starterDraft ||
      !starterReviewed
    ) {
      setStarterCreationError(
        "Review the inferred values and confirm them before creating starter metadata.",
      );
      return;
    }

    setStarterCreationLoading(true);
    setStarterCreationError(null);

    try {
      const response = await fetch(
        "/api/library/create-starter-metadata",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            starter: starterDraft,
            confirmation:
              "CREATE_STARTER_METADATA",
          }),
        },
      );

      const result = (await response.json()) as {
        created?: string[];
        receipts?: Array<unknown>;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          result.error ??
            `Starter metadata creation failed: HTTP ${response.status}`,
        );
      }

      setSetupMode(false);
      setStarterDraft(null);
      setStarterReviewed(false);

      await Promise.resolve(onRefresh());
      onNotify(
        "Starter metadata created",
        "success",
      );
    } catch (error) {
      onNotify(
        "Starter metadata creation failed",
        "error",
      );
      setStarterCreationError(
        error instanceof Error
          ? error.message
          : "Unknown starter metadata creation error",
      );
    } finally {
      setStarterCreationLoading(false);
    }
  };

  const metadataTabs: Array<{
    id: ReleaseMetadataTab;
    label: string;
    adminOnly?: boolean;
  }> = [
    {
      id: "overview",
      label: "Overview",
    },
    {
      id: "credits",
      label:
        "Artists, Performers & Writers",
    },
    {
      id: "recording",
      label: "Recording, Mixing & Mastering",
    },
    {
      id: "rights",
      label:
        "Label, Publishing & Copyright",
    },
    {
      id: "lyrics",
      label: "Lyrics & Language",
    },
    {
      id: "artwork",
      label: "Artwork",
    },
    {
      id: "notes",
      label: "Production & Text Notes",
    },
    {
      id: "files",
      label: "Files & Sources",
      adminOnly: true,
    },
    {
      id: "developer",
      label: "Developer / Advanced",
      adminOnly: true,
    },
    {
      id: "settings",
      label: "Settings",
      adminOnly: true,
    },
    {
      id: "raw",
      label: "Raw TOML",
      adminOnly: true,
    },
  ];

  const navigateFromRelease = (
    view: WorkflowApplicationView,
  ) => {
    if (view === "library") {
      return;
    }

    if (
      dirtyCount > 0 &&
      !window.confirm(
        `Discard all unsaved metadata changes and open ${view[0].toUpperCase()}${view.slice(1)}?`,
      )
    ) {
      return;
    }

    onNavigateWorkflow(view);
  };

  const openTagSearchFromRelease = () => {
    if (
      dirtyCount > 0 &&
      !window.confirm(
        "Discard all unsaved metadata changes and open Metadata Tag Search?",
      )
    ) {
      return;
    }

    onOpenTagSearch();
  };

  return (
    <section className="metadata-detail">
      <header className="metadata-detail-header">
        <div className="metadata-detail-identity">
          <button
            type="button"
            className="metadata-detail-back-button"
            aria-label="Back to library"
            title="Back to library"
            onClick={() => {
              if (
                dirtyCount > 0 &&
                !window.confirm(
                  "Discard all unsaved metadata changes and return to the library?",
                )
              ) {
                return;
              }

              onBack();
            }}
          >
            <span aria-hidden="true">←</span>
          </button>

          <span
            className="metadata-detail-artwork"
            aria-hidden="true"
          >
            {releaseArtwork ? (
              <img
                src={`/api/library/artwork?${new URLSearchParams(
                  {
                    path:
                      releaseArtwork.relativePath,
                  },
                ).toString()}`}
                alt=""
              />
            ) : (
              <strong>No artwork</strong>
            )}
          </span>

          <div>
            <h1>
              {formatReleaseTitle(
                detail.releaseId,
              )}
            </h1>

            <p className="metadata-detail-date">
              {releaseDateLabel}
            </p>

            <div
              className="metadata-health-summary"
              aria-label="Metadata health summary"
            >
              <span
                className={`badge ${metadataHealthTone}`}
              >
                {metadataHealthLabel}
              </span>
              <span className="metadata-health-count">
                {detail.documents.length} parsed
              </span>
              <span
                className="metadata-health-count"
                title={`${detailMissingSummary.core} core · ${detailMissingSummary.credits} credits · ${detailMissingSummary.supplemental} optional`}
              >
                {readinessBadgeLabel(
                  detailMissingSummary,
                )}
              </span>
              <span className="metadata-health-count">
                {detail.warnings.length} warnings
              </span>
            </div>
          </div>
        </div>

        <div className="detail-actions">
          <button
            type="button"
            className="menu-button detail-menu-button"
            aria-label="Open release menu"
            aria-expanded={detailMenuOpen}
            onClick={() =>
              setDetailMenuOpen(
                (open) => !open,
              )
            }
          >
            <span aria-hidden="true">☰</span>
          </button>
        </div>

        {detailMenuOpen && (
          <aside
            ref={detailMenuRef}
            className="application-menu detail-menu"
            aria-label="Release menu"
          >
            <section className="menu-card">
              <h2>Refresh Metadata</h2>
              <button
                type="button"
                onClick={() => {
                  void Promise.resolve(
                    onRefresh(),
                  )
                    .then(() => {
                      onNotify(
                        "Metadata refreshed",
                        "success",
                      );
                    })
                    .catch(() => {
                      onNotify(
                        "Metadata refresh failed",
                        "error",
                      );
                    });
                  setDetailMenuOpen(false);
                }}
              >
                Refresh metadata
              </button>
            </section>

            <section className="menu-card">
              <h2>Activity Log</h2>
              <p>
                {metadataActivityEntries.length === 0
                  ? "No metadata writes recorded in this browser session."
                  : `${metadataActivityEntries.length} recent metadata ${
                      metadataActivityEntries.length === 1
                        ? "event"
                        : "events"
                    } in this browser session.`}
              </p>
              <button
                type="button"
                onClick={() => {
                  setActivityLogOpen(true);
                  setDetailMenuOpen(false);
                }}
              >
                View activity log
              </button>
            </section>

            <section className="menu-card workflow-menu-card">
              <h2>Release workflow</h2>
              <p className="workflow-menu-path">
                {workflowPath}
              </p>
              <p>
                Review the full ingest, authoring,
                preparation, preflight, and publishing
                guide.
              </p>
              <button
                type="button"
                onClick={() => {
                  if (
                    dirtyCount > 0 &&
                    !window.confirm(
                      "Discard unsaved metadata changes and open Workflow & Help?",
                    )
                  ) {
                    return;
                  }

                  setDetailMenuOpen(false);
                  onOpenWorkflowHelp();
                }}
              >
                View workflow guide
              </button>
            </section>

            <section className="menu-card">
              <h2>Metadata Reference</h2>
              <p>
                Search canonical fields and verified
                player-visible tag mappings.
              </p>
              <button
                type="button"
                onClick={() => {
                  setDetailMenuOpen(false);
                  openTagSearchFromRelease();
                }}
              >
                Open Tag Search
              </button>
            </section>

            <section className="menu-card">
              <h2>Admin</h2>
              <label className="admin-toggle">
                <input
                  type="checkbox"
                  checked={showAdminTools}
                  onChange={(event) =>
                    onShowAdminToolsChange(
                      event.target.checked,
                    )
                  }
                />
                <span>
                  Show Developer / Admin Tools
                </span>
              </label>
              <p className="menu-meta">
                Enables troubleshooting controls,
                source paths, settings, and raw TOML.
              </p>
            </section>
          </aside>
        )}
      </header>

      <WorkflowNavigation
        activeView="library"
        onNavigate={navigateFromRelease}
      />

      {metadataReadiness && (
        <MetadataReadinessPanel
          summary={metadataReadiness}
          trackLabels={readinessTrackLabels}
          open={readinessOpen}
          skippedPaths={skippedReadinessPathSet}
          onToggle={() =>
            setReadinessOpen((current) => !current)
          }
          onNavigate={navigateToReadinessItem}
          onSkip={skipReadinessDocument}
          onRestore={restoreReadinessDocument}
        />
      )}

      {activityLogOpen && (
        <MetadataActivityLogModal
          entries={metadataActivityEntries}
          onClose={() =>
            setActivityLogOpen(false)
          }
          onClear={clearActivityLog}
        />
      )}


      {performerCopySource && (
          <PerformerCreditCopyModal
            releaseId={detail.releaseId}
            source={performerCopySource}
            sourceLabel={
              performerCopySourceLabel
            }
            releasePrimaryArtistName={
              releasePrimaryArtistName
            }
            trackOptions={
              performerCopyTrackOptions.filter(
                (option) =>
                  performerCopySource.document.scope ===
                    "release" ||
                  option.trackId !==
                    performerCopySource.document.trackId,
              )
            }
            onClose={() =>
              setPerformerCopySource(null)
            }
            onComplete={completePerformerCopy}
          />
        )}

      <section
        className={[
          "draft-status",
          dirtyCount > 0
            ? "has-unsaved-changes"
            : "",
        ]
          .filter(Boolean)
          .join(" ")}
        role="status"
        aria-live="polite"
      >
        <div className="draft-status-copy">
          <span>
            Mode:{" "}
            <strong>
              {editMode
                ? "Editing in browser"
                : "Read-only"}
            </strong>
          </span>

          <span>
            Unsaved changes:{" "}
            <strong>{dirtyCount}</strong>
          </span>

          <span
            className={[
              "badge",
              dirtyCount > 0
                ? "unsaved"
                : "preview",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {dirtyCount > 0
              ? "Unsaved browser changes"
              : "No filesystem writes"}
          </span>
        </div>

        <div
          className="audio-preview-transport"
          role="group"
          aria-label="Audio preview controls"
        >
          <div className="audio-preview-buttons">
            <button
              type="button"
              className="audio-preview-skip"
              aria-label="Previous playable track"
              title="Previous playable track"
              disabled={
                playableTrackIds.length < 2
              }
              onClick={() =>
                moveAudioPreview(-1)
              }
            >
              <span aria-hidden="true">⏮</span>
            </button>

            <button
              type="button"
              className="audio-preview-play-toggle"
              aria-label={
                audioPreviewPlaying &&
                audioPreviewTrackId ===
                  audioPreviewControlTrackId
                  ? "Pause audio preview"
                  : "Play audio preview"
              }
              title={
                audioPreviewPlaying &&
                audioPreviewTrackId ===
                  audioPreviewControlTrackId
                  ? "Pause audio preview"
                  : "Play audio preview"
              }
              disabled={
                !audioPreviewControlTrackId
              }
              onClick={() => {
                if (audioPreviewControlTrackId) {
                  toggleAudioPreviewTrack(
                    audioPreviewControlTrackId,
                  );
                }
              }}
            >
              <span aria-hidden="true">
                {audioPreviewLoading &&
                audioPreviewTrackId ===
                  audioPreviewControlTrackId
                  ? "…"
                  : audioPreviewPlaying &&
                      audioPreviewTrackId ===
                        audioPreviewControlTrackId
                    ? "❚❚"
                    : "▶"}
              </span>
            </button>

            <button
              type="button"
              className="audio-preview-skip"
              aria-label="Next playable track"
              title="Next playable track"
              disabled={
                playableTrackIds.length < 2
              }
              onClick={() =>
                moveAudioPreview(1)
              }
            >
              <span aria-hidden="true">⏭</span>
            </button>
          </div>

          <div className="audio-preview-now-playing">
            <strong>
              {audioPreviewControlTitle}
            </strong>
            <small>
              {audioPreviewSourceLabel}
            </small>
          </div>

          <label className="audio-preview-volume">
            <span>Volume</span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={audioPreviewVolume}
              aria-label="Audio preview volume"
              onChange={(event) =>
                setAudioPreviewVolume(
                  Number(event.target.value),
                )
              }
            />
          </label>
        </div>

        <div className="draft-status-actions">
          {isMetadataEmpty ? (
            <button
              type="button"
              className="primary-action"
              onClick={beginStarterSetup}
            >
              {setupMode
                ? "Metadata setup"
                : "Start metadata setup"}
            </button>
          ) : editMode ? (
            <>
              <button
                type="button"
                className="primary-action"
                disabled={
                  dirtyCount === 0 ||
                  savingAll ||
                  savingDocumentPath !== null
                }
                onClick={() =>
                  void saveAllDrafts()
                }
              >
                {savingAll
                  ? "Saving edits…"
                  : "Save edits"}
              </button>

              {dirtyCount > 0 && (
                <button
                  type="button"
                  disabled={
                    savingAll ||
                    savingDocumentPath !== null ||
                    addingFieldsPath !== null
                  }
                  onClick={discardDraft}
                >
                  Discard edits
                </button>
              )}
            </>
          ) : null}
        </div>
      </section>

      {audioPreviewError && (
        <p className="message error">
          Audio preview: {audioPreviewError}
        </p>
      )}

      {saveError && (
        <p className="message error">
          {saveError}
        </p>
      )}

      {trackNumberConflictMessages.length > 0 && (
        <section
          className="track-number-conflict-notice"
          role="alert"
          aria-label="Duplicate track numbering"
        >
          <strong>
            Duplicate track numbering
          </strong>
          <span>
            Track navigation uses the assigned sequence, but matching numbers on the same disc must be resolved.
          </span>
          <ul>
            {trackNumberConflictMessages.map(
              (message) => (
                <li key={message}>
                  {message}
                </li>
              ),
            )}
          </ul>
        </section>
      )}

      {isMetadataEmpty && (
        <section className="new-release-onboarding">
          <div className="new-release-onboarding-heading">
            <div>
              <span className="eyebrow">
                New release setup
              </span>
              <h2>
                {setupMode
                  ? "Confirm starter metadata"
                  : "Review inferred metadata"}
              </h2>
              <p>
                {setupMode
                  ? "Correct the inferred values below, then create the minimum starter documents needed for normal editing."
                  : "Metadata Editor found the release, artwork, tracks, and audio masters. Review the suggestions, then start metadata setup."}
              </p>
            </div>

            <span className="badge preview">
              {inferredTracks.length} tracks
            </span>
          </div>

          {!setupMode ? (
            <>
              <dl className="inferred-release-summary">
                <div>
                  <dt>Release title</dt>
                  <dd>
                    {inferredReleaseTitle}
                  </dd>
                </div>
                <div>
                  <dt>Release date</dt>
                  <dd>{releaseDateLabel}</dd>
                </div>
                <div>
                  <dt>Suggested artist</dt>
                  <dd>
                    {inferredReleaseArtist}
                  </dd>
                </div>
                <div>
                  <dt>Artwork</dt>
                  <dd>
                    {releaseArtwork
                      ? "Release artwork found"
                      : "No release artwork found"}
                  </dd>
                </div>
              </dl>

              <div className="inferred-track-list">
                <div className="inferred-track-row inferred-track-header">
                  <span>No.</span>
                  <span>Artist</span>
                  <span>Track title</span>
                </div>

                {inferredTracks.map(
                  (track) => (
                    <div
                      key={track.id}
                      className="inferred-track-row"
                    >
                      <span>
                        {track.number === null
                          ? "—"
                          : String(
                              track.number,
                            ).padStart(
                              2,
                              "0",
                            )}
                      </span>
                      <strong>
                        {track.artist}
                      </strong>
                      <span>
                        {track.title}
                      </span>
                    </div>
                  ),
                )}
              </div>

              <div className="onboarding-actions">
                <p>
                  Folder-derived values remain
                  suggestions until you review and
                  create starter metadata.
                </p>
                <button
                  type="button"
                  className="primary-action"
                  onClick={beginStarterSetup}
                >
                  Start metadata setup
                </button>
              </div>
            </>
          ) : starterDraft ? (
            <>
              <div className="starter-release-form">
                <label>
                  <span>Release title</span>
                  <input
                    value={
                      starterDraft.releaseTitle
                    }
                    onChange={(event) =>
                      setStarterDraft({
                        ...starterDraft,
                        releaseTitle:
                          event.target.value,
                      })
                    }
                  />
                </label>

                <label>
                  <span>Release artist</span>
                  <input
                    value={
                      starterDraft.releaseArtist
                    }
                    onChange={(event) =>
                      setStarterDraft({
                        ...starterDraft,
                        releaseArtist:
                          event.target.value,
                      })
                    }
                  />
                </label>

                <label>
                  <span>Release date</span>
                  <input
                    type="date"
                    value={
                      starterDraft.releaseDate
                    }
                    onChange={(event) =>
                      setStarterDraft({
                        ...starterDraft,
                        releaseDate:
                          event.target.value,
                      })
                    }
                  />
                </label>
              </div>

              <div className="starter-track-editor">
                <div className="starter-track-editor-header">
                  <span>No.</span>
                  <span>Artist</span>
                  <span>Track title</span>
                  <span>Track version</span>
                  <span>Display title</span>
                </div>

                {starterDraft.tracks.map(
                  (track) => (
                    <div
                      key={track.trackId}
                      className="starter-track-editor-row"
                    >
                      <input
                        type="number"
                        min="1"
                        aria-label={`${track.trackId} track number`}
                        value={
                          track.trackNumber
                        }
                        onChange={(event) =>
                          updateStarterTrack(
                            track.trackId,
                            "trackNumber",
                            event.target.value,
                          )
                        }
                      />
                      <input
                        aria-label={`${track.trackId} artist`}
                        value={track.artist}
                        onChange={(event) =>
                          updateStarterTrack(
                            track.trackId,
                            "artist",
                            event.target.value,
                          )
                        }
                      />
                      <input
                        aria-label={`${track.trackId} title`}
                        value={track.title}
                        onChange={(event) =>
                          updateStarterTrack(
                            track.trackId,
                            "title",
                            event.target.value,
                          )
                        }
                      />
                      <SelectOrCustomMetadataInput
                        value={track.version}
                        options={
                          recommendedTrackVersionOptions
                        }
                        selectLabel={`${track.trackId} track version`}
                        customPlaceholder="Custom track version"
                        onChange={(value) =>
                          updateStarterTrack(
                            track.trackId,
                            "version",
                            value,
                          )
                        }
                      />
                      <label className="starter-display-title-field">
                        <input
                          aria-label={`${track.trackId} display title`}
                          value={track.displayTitle}
                          onChange={(event) =>
                            updateStarterTrack(
                              track.trackId,
                              "displayTitle",
                              event.target.value,
                            )
                          }
                        />
                        <button
                          type="button"
                          className="starter-use-generated-title"
                          disabled={
                            track.displayTitle ===
                            formatTrackDisplayTitle(
                              track.title,
                              track.version,
                            )
                          }
                          onClick={() =>
                            updateStarterTrack(
                              track.trackId,
                              "displayTitle",
                              formatTrackDisplayTitle(
                                track.title,
                                track.version,
                              ),
                            )
                          }
                        >
                          Use generated
                        </button>
                      </label>
                    </div>
                  ),
                )}
              </div>

              <label className="starter-confirmation">
                <input
                  type="checkbox"
                  checked={starterReviewed}
                  onChange={(event) =>
                    setStarterReviewed(
                      event.target.checked,
                    )
                  }
                />
                <span>
                  I reviewed the release and track
                  values above.
                </span>
              </label>

              {starterCreationError && (
                <p className="message error">
                  {starterCreationError}
                </p>
              )}

              <div className="onboarding-actions">
                <button
                  type="button"
                  onClick={() => {
                    setSetupMode(false);
                    setStarterDraft(null);
                    setStarterReviewed(false);
                    setStarterCreationError(null);
                  }}
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className={[
                    "primary-action",
                    starterCreationLoading
                      ? "is-loading"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-busy={
                    starterCreationLoading
                  }
                  disabled={
                    !starterReviewed ||
                    starterCreationLoading
                  }
                  onClick={() =>
                    void createStarterMetadata()
                  }
                >
                  {starterCreationLoading
                    ? "Creating starter metadata…"
                    : "Create starter metadata"}
                </button>
              </div>
            </>
          ) : null}
        </section>
      )}

      <nav
        className="release-metadata-tabs"
        aria-label="Release metadata categories"
      >
        {metadataTabs
          .filter(
            (tab) =>
              !tab.adminOnly ||
              showAdminTools,
          )
          .map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={
                activeMetadataTab === tab.id
                  ? "active"
                  : undefined
              }
              aria-pressed={
                activeMetadataTab === tab.id
              }
              onClick={() =>
                setActiveMetadataTab(tab.id)
              }
            >
              {tab.label}
            </button>
          ))}
      </nav>

      <div className="release-metadata-workspace">
        <nav
          className="metadata-document-tabs"
          aria-label="Metadata document groups"
        >
        <button
          type="button"
          className={
            activeDocumentGroup === "release"
              ? "active"
              : undefined
          }
          aria-pressed={
            activeDocumentGroup === "release"
          }
          onClick={() =>
            setActiveDocumentGroup("release")
          }
        >
          <span className="document-nav-label">
            <strong>Release</strong>
            <small>
              {formatReleaseTitle(
                detail.releaseId,
              )}
            </small>
          </span>

          <small
            className="document-count"
            title={`${releaseDocuments.length} metadata documents`}
          >
            {releaseDocuments.length}
          </small>

          <ReadinessNavBadge
            scope={releaseReadinessScope}
            skippedPaths={skippedReadinessPathSet}
          />

          {releaseDraftCount > 0 && (
            <small
              className="unsaved-count"
              title={`${releaseDraftCount} unsaved changes`}
            >
              {releaseDraftCount}
            </small>
          )}
        </button>

        {trackIds.map((trackId, index) => {
          const trackDocuments =
            detail.documents.filter(
              (document) =>
                document.trackId === trackId,
            );
          const navigationEntry =
            trackNavigationById.get(trackId);
          const trackNumber =
            navigationEntry?.trackNumber ??
            index + 1;
          const trackNavigationLabel =
            navigationEntry &&
            navigationEntry.effectiveDiscNumber > 1
              ? `Disc ${navigationEntry.effectiveDiscNumber} · Track ${trackNumber}`
              : `Track ${trackNumber}`;
          const numberConflictTitle =
            navigationEntry?.hasNumberConflict
              ? `Duplicate track number ${trackNumber} on disc ${navigationEntry.effectiveDiscNumber}`
              : undefined;

          const trackDocumentCount =
            trackDocuments.length;

          const trackDraftCount =
            countDraftChangesForDocuments(
              trackDocuments,
            );
          const trackReadinessScope =
            metadataReadiness?.scopes.find(
              (scope) => scope.id === trackId,
            );
          const scannedTrack =
            release?.tracks.find(
              (track) => track.id === trackId,
            );
          const trackPlayable = Boolean(
            scannedTrack &&
              trackHasAudioPreview(
                scannedTrack,
              ),
          );
          const trackIsPlaying =
            audioPreviewPlaying &&
            audioPreviewTrackId === trackId;

          return (
            <div
              key={trackId}
              className={[
                "metadata-document-nav-item",
                activeDocumentGroup === trackId
                  ? "active"
                  : "",
                trackIsPlaying
                  ? "is-playing"
                  : "",
                navigationEntry?.hasNumberConflict
                  ? "has-numbering-conflict"
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <button
                type="button"
                className="metadata-document-select track-document-select"
                aria-pressed={
                  activeDocumentGroup ===
                  trackId
                }
                title={trackId}
                onClick={() =>
                  setActiveDocumentGroup(
                    trackId,
                  )
                }
              >
                <span className="document-nav-label track-document-nav-label">
                  <span className="track-navigation-heading">
                    <strong className="track-navigation-number">
                      <span>
                        {trackNavigationLabel}
                      </span>
                      {navigationEntry?.hasNumberConflict && (
                        <small
                          className="track-number-conflict-badge"
                          title={numberConflictTitle}
                          aria-label={numberConflictTitle}
                        >
                          !
                        </small>
                      )}
                    </strong>

                    <span
                      className="track-navigation-badges"
                      aria-label="Track metadata status"
                    >
                      <small
                        className="document-count"
                        title={`${trackDocumentCount} metadata documents`}
                      >
                        {trackDocumentCount}
                      </small>

                      <ReadinessNavBadge
                        scope={trackReadinessScope}
                        skippedPaths={skippedReadinessPathSet}
                      />

                      {trackDraftCount > 0 && (
                        <small
                          className="unsaved-count"
                          title={`${trackDraftCount} unsaved changes`}
                        >
                          {trackDraftCount}
                        </small>
                      )}
                    </span>
                  </span>

                  <small className="track-navigation-title">
                    {readTrackDisplayTitle(
                      trackId,
                      trackDocuments,
                      inferredTracks.find(
                        (track) =>
                          track.id === trackId,
                      )?.displayTitle ??
                        formatReleaseTitle(trackId),
                    )}
                  </small>
                </span>
              </button>

              <button
                type="button"
                className="metadata-track-preview-button"
                aria-label={
                  trackIsPlaying
                    ? `Pause ${trackNavigationLabel}`
                    : `Play ${trackNavigationLabel}`
                }
                title={
                  trackPlayable
                    ? trackIsPlaying
                      ? "Pause audio preview"
                      : "Play audio preview"
                    : "No unambiguous audio preview source"
                }
                disabled={!trackPlayable}
                onClick={() =>
                  toggleAudioPreviewTrack(
                    trackId,
                  )
                }
              >
                <span aria-hidden="true">
                  {audioPreviewLoading &&
                  audioPreviewTrackId === trackId
                    ? "…"
                    : trackIsPlaying
                      ? "❚❚"
                      : "▶"}
                </span>
              </button>
            </div>
          );
        })}
        </nav>

        <div className="release-metadata-content">
          {readinessTarget &&
            readinessTarget.scopeId === activeDocumentGroup &&
            readinessTarget.tab === activeMetadataTab && (
              <MetadataReadinessWorkItem
                target={readinessTarget}
                creating={
                  readinessTarget.kind === "document" &&
                  creatingReadinessPath ===
                    readinessTarget.file.relativePath
                }
                onCreate={(file) =>
                  void createReadinessDocument(file)
                }
                onSkip={skipReadinessDocument}
                onEditField={editReadinessField}
                onClose={() => setReadinessTarget(null)}
              />
            )}

          {activeMetadataTab === "artwork" && (
            <ArtworkGallery
              release={release}
              activeDocumentGroup={
                activeDocumentGroup
              }
            />
          )}

          {activeDocumentGroup ===
            "release" && (
        <MetadataDocumentSection
          title="Release documents"
          documents={releaseDocuments}
          releaseDocuments={
            releaseDocuments
          }
          editMode={editMode}
          canFinishEditing={
            editMode && dirtyCount === 0
          }
          onBeginEdit={() =>
            setEditMode(true)
          }
          onDoneEditing={() =>
            setEditMode(false)
          }
          draft={draft}
          performerDrafts={
            performerDrafts
          }
          technicalCreditDrafts={
            technicalCreditDrafts
          }
          arrangementCreditDrafts={
            arrangementCreditDrafts
          }
          writingCreditDrafts={
            writingCreditDrafts
          }
          sampleRelationshipDrafts={
            sampleRelationshipDrafts
          }
          sampleClearanceDrafts={
            sampleClearanceDrafts
          }
          onDraftValueChange={
            updateDraftValue
          }
          onPerformerDraftChange={
            updatePerformerDraft
          }
          onTechnicalCreditDraftChange={
            updateTechnicalCreditDraft
          }
          onArrangementCreditDraftChange={
            updateArrangementCreditDraft
          }
          onWritingCreditDraftChange={
            updateWritingCreditDraft
          }
          onSampleRelationshipDraftChange={
            updateSampleRelationshipDraft
          }
          onSampleClearanceDraftChange={
            updateSampleClearanceDraft
          }
          onCopyPerformerCredits={(
            document,
            records,
          ) =>
            setPerformerCopySource({
              document,
              records,
            })
          }
          metadataRegistry={
            metadataRegistry
          }
          activeMetadataTab={
            activeMetadataTab
          }
          savingDocumentPath={
            savingDocumentPath
          }
          addingFieldsPath={
            addingFieldsPath
          }
          removingFieldKey={
            removingFieldKey
          }
          creatingTrackCredits={
            false
          }
          onCreateTrackCreditsDocument={(
            file,
            initialCreditKind,
          ) =>
            void createTrackCreditsDocument(
              file,
              initialCreditKind,
            )
          }
          onAddFields={
            addMetadataFields
          }
          onRemoveField={(document, field) =>
            void removeMetadataField(
              document,
              field,
            )
          }
          onSaveDocument={(document) =>
            void saveDocumentDraft(document)
          }
        />
      )}

      {trackIds.map((trackId) =>
        activeDocumentGroup === trackId ? (
          <MetadataDocumentSection
            key={trackId}
            title={`Track: ${trackId}`}
            documents={detail.documents.filter(
              (document) =>
                document.trackId === trackId,
            )}
            releaseDocuments={
              releaseDocuments
            }
            editMode={editMode}
            canFinishEditing={
              editMode && dirtyCount === 0
            }
            onBeginEdit={() =>
              setEditMode(true)
            }
            onDoneEditing={() =>
              setEditMode(false)
            }
            draft={draft}
            performerDrafts={
              performerDrafts
            }
            technicalCreditDrafts={
              technicalCreditDrafts
            }
            arrangementCreditDrafts={
              arrangementCreditDrafts
            }
            writingCreditDrafts={
              writingCreditDrafts
            }
            sampleRelationshipDrafts={
              sampleRelationshipDrafts
            }
            sampleClearanceDrafts={
              sampleClearanceDrafts
            }
            onDraftValueChange={
              updateDraftValue
            }
            onPerformerDraftChange={
              updatePerformerDraft
            }
            onTechnicalCreditDraftChange={
              updateTechnicalCreditDraft
            }
            onArrangementCreditDraftChange={
              updateArrangementCreditDraft
            }
            onWritingCreditDraftChange={
              updateWritingCreditDraft
            }
            onSampleRelationshipDraftChange={
              updateSampleRelationshipDraft
            }
            onSampleClearanceDraftChange={
              updateSampleClearanceDraft
            }
            onCopyPerformerCredits={(
              document,
              records,
            ) =>
              setPerformerCopySource({
                document,
                records,
              })
            }
            metadataRegistry={
              metadataRegistry
            }
            activeMetadataTab={
              activeMetadataTab
            }
            savingDocumentPath={
              savingDocumentPath
            }
            addingFieldsPath={
              addingFieldsPath
            }
            removingFieldKey={
              removingFieldKey
            }
            missingTrackCreditsFile={
              findMissingTrackCreditsFile(
                trackId,
              )
            }
            creatingTrackCredits={
              creatingTrackCreditsPath ===
              findMissingTrackCreditsFile(
                trackId,
              )?.relativePath
            }
            onCreateTrackCreditsDocument={(
              file,
              initialCreditKind,
            ) =>
              void createTrackCreditsDocument(
                file,
                initialCreditKind,
              )
            }
            onAddFields={
              addMetadataFields
            }
            onRemoveField={(document, field) =>
              void removeMetadataField(
                document,
                field,
              )
            }
            onSaveDocument={(document) =>
              void saveDocumentDraft(document)
            }
          />
        ) : null,
      )}

        </div>
      </div>

      {detail.warnings.length > 0 && (
        <section className="warning-panel">
          <h2>Metadata warnings</h2>

          <ul>
            {detail.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}

type InferredTrackSummary = {
  id: string;
  number: number | null;
  artist: string;
  title: string;
};

function titleCaseSlug(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(
      /\b\w/g,
      (character) =>
        character.toUpperCase(),
    );
}

function inferTrackSummary(
  trackId: string,
): InferredTrackSummary {
  const match = trackId.match(
    /^(.*?)_(\d{1,3})_(.+)$/,
  );

  if (!match) {
    return {
      id: trackId,
      number: null,
      artist: "Review artist",
      title: titleCaseSlug(trackId),
    };
  }

  const [, artistSlug, number, titleSlug] =
    match;

  return {
    id: trackId,
    number: Number(number),
    artist: titleCaseSlug(
      artistSlug.replace(
        /-feat(?:uring)?-/g,
        " feat. ",
      ),
    ),
    title: titleCaseSlug(
      titleSlug.replace(
        /-feat(?:uring)?-/g,
        " feat. ",
      ),
    ),
  };
}

function readTrackDisplayTitle(
  trackId: string,
  documents: ParsedMetadataDocument[],
  inferredTitle: string,
): string {
  const trackDocument = documents.find(
    (document) =>
      document.trackId === trackId &&
      document.filename === "track.toml",
  );

  const trackValue =
    trackDocument?.parsed.track;

  if (
    typeof trackValue !== "object" ||
    trackValue === null
  ) {
    return inferredTitle;
  }

  const trackRecord =
    trackValue as Record<string, unknown>;
  const displayTitle =
    typeof trackRecord.display_title ===
      "string"
      ? trackRecord.display_title.trim()
      : "";

  if (displayTitle) {
    return displayTitle;
  }

  const title =
    typeof trackRecord.title === "string"
      ? trackRecord.title
      : "";
  const version =
    typeof trackRecord.version === "string"
      ? trackRecord.version
      : "";
  const generatedTitle =
    formatTrackDisplayTitle(
      title,
      version,
    );

  return generatedTitle || inferredTitle;
}

function inferCommonReleaseArtist(
  tracks: InferredTrackSummary[],
): string {
  const artistCounts = new Map<
    string,
    number
  >();

  for (const track of tracks) {
    const primaryArtist =
      track.artist.split(/\s+feat\.\s+/i)[0];

    artistCounts.set(
      primaryArtist,
      (artistCounts.get(primaryArtist) ?? 0) +
        1,
    );
  }

  return (
    Array.from(artistCounts.entries()).sort(
      (left, right) =>
        right[1] - left[1],
    )[0]?.[0] ?? "Review artist"
  );
}

function formatReleaseTitle(
  releaseId: string,
): string {
  const match = releaseId.match(
    /^\d{4}-\d{2}-\d{2}_(.+)$/,
  );

  if (!match) {
    return releaseId;
  }

  return match[1]
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(
      /\b\w/g,
      (character) =>
        character.toUpperCase(),
    );
}

function formatReleaseDate(
  releaseId: string,
): string {
  const match = releaseId.match(
    /^(\d{4})-(\d{2})-(\d{2})_/,
  );

  if (!match) {
    return "Release date not identified";
  }

  const [, year, month, day] = match;
  const date = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
    ),
  );

  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !==
      Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    return "Release date not identified";
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    },
  ).format(date);
}

function formatReleaseDisplayName(
  releaseId: string,
): string {
  const match = releaseId.match(
    /^(\d{4})-(\d{2})-(\d{2})_(.+)$/,
  );

  if (!match) {
    return releaseId;
  }

  const [
    ,
    year,
    month,
    day,
    slug,
  ] = match;

  const date = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
    ),
  );

  /*
   * Reject invalid calendar dates rather than allowing JavaScript
   * to roll them into a different month.
   */
  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !==
      Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    return releaseId;
  }

  const title = slug
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(
      /\b\w/g,
      (character) =>
        character.toUpperCase(),
    );

  const formattedDate =
    new Intl.DateTimeFormat(
      "en-US",
      {
        month: "long",
        day: "2-digit",
        year: "numeric",
        timeZone: "UTC",
      },
    )
      .format(date)
      .replace(",", "");

  return `${title} (${formattedDate})`;
}

function formatMetadataDocumentLabel(
  filename: string,
): string {
  const labels: Record<string, string> = {
    "release.toml": "Release",
    "release-settings.toml": "Settings",
    "release-production-notes.toml":
      "Production Notes",
    "track.toml": "Track",
    "track-credits.toml": "Credits",
    "track-production-notes.toml":
      "Production Notes",
  };

  return (
    labels[filename] ??
    filename.replace(/\.toml$/i, "")
  );
}

function MetadataDocumentSection({
  title,
  documents,
  releaseDocuments,
  editMode,
  canFinishEditing,
  onBeginEdit,
  onDoneEditing,
  draft,
  performerDrafts,
  technicalCreditDrafts,
  arrangementCreditDrafts,
  writingCreditDrafts,
  sampleRelationshipDrafts,
  sampleClearanceDrafts,
  onDraftValueChange,
  onPerformerDraftChange,
  onTechnicalCreditDraftChange,
  onArrangementCreditDraftChange,
  onWritingCreditDraftChange,
  onSampleRelationshipDraftChange,
  onSampleClearanceDraftChange,
  onCopyPerformerCredits,
  metadataRegistry,
  activeMetadataTab,
  savingDocumentPath,
  addingFieldsPath,
  removingFieldKey,
  missingTrackCreditsFile,
  creatingTrackCredits,
  onSaveDocument,
  onAddFields,
  onRemoveField,
  onCreateTrackCreditsDocument,
}: {
  title: string;
  documents: ParsedMetadataDocument[];
  releaseDocuments: ParsedMetadataDocument[];
  editMode: boolean;
  canFinishEditing: boolean;
  onBeginEdit: () => void;
  onDoneEditing: () => void;
  draft: MetadataDraft;
  performerDrafts: PerformerDraftMap;
  technicalCreditDrafts:
    TechnicalCreditDraftMap;
  arrangementCreditDrafts:
    ArrangementCreditDraftMap;
  writingCreditDrafts:
    WritingCreditDraftMap;
  sampleRelationshipDrafts:
    SampleRelationshipDraftMap;
  sampleClearanceDrafts:
    SampleClearanceDraftMap;
  onDraftValueChange: (
    document: ParsedMetadataDocument,
    metadataPath: string,
    originalValue: EditableMetadataValue,
    nextValue: EditableMetadataValue,
  ) => void;
  onPerformerDraftChange: (
    document: ParsedMetadataDocument,
    records: PerformerRecordDraft[],
  ) => void;
  onTechnicalCreditDraftChange: (
    document: ParsedMetadataDocument,
    records: PerformerRecordDraft[],
  ) => void;
  onArrangementCreditDraftChange: (
    document: ParsedMetadataDocument,
    records: PerformerRecordDraft[],
  ) => void;
  onWritingCreditDraftChange: (
    document: ParsedMetadataDocument,
    records: WritingCreditRecordDraft[],
  ) => void;
  onSampleRelationshipDraftChange: (
    document: ParsedMetadataDocument,
    records: SampleRelationshipRecordDraft[],
  ) => void;
  onSampleClearanceDraftChange: (
    document: ParsedMetadataDocument,
    records: SampleClearanceRecordDraft[],
  ) => void;
  onCopyPerformerCredits: (
    document: ParsedMetadataDocument,
    records: PerformerRecordDraft[],
  ) => void;
  metadataRegistry: MetadataFieldDefinition[];
  activeMetadataTab: ReleaseMetadataTab;
  savingDocumentPath: string | null;
  addingFieldsPath: string | null;
  removingFieldKey: string | null;
  missingTrackCreditsFile?:
    MetadataFileStatus;
  creatingTrackCredits: boolean;
  onSaveDocument: (
    document: ParsedMetadataDocument,
  ) => void;
  onAddFields: (
    document: ParsedMetadataDocument,
    fields: MetadataFieldDefinition[],
  ) => void;
  onRemoveField: (
    document: ParsedMetadataDocument,
    field: MetadataFieldDefinition,
  ) => void;
  onCreateTrackCreditsDocument: (
    file: MetadataFileStatus,
    initialCreditKind:
      | "technical"
      | "arrangement"
      | "writing"
      | "samples",
  ) => void;
}) {
  const releaseTechnicalCredits =
    releaseDocuments.flatMap(
      (releaseDocument) =>
        releaseDocument.filename ===
        "release.toml"
          ? readTechnicalCreditRecords(
              releaseDocument,
            )
          : [],
    );
  const groupedReleaseTechnicalCredits =
    groupPersonRoleDisplayRecords(
      sortTechnicalCreditDisplayRecords(
        releaseTechnicalCredits.map(
          (record) => ({
            key: record.key,
            name: record.name,
            role: record.role,
            sortName: record.sortName,
          }),
        ),
      ),
    );

  const releaseArrangementCredits =
    releaseDocuments.flatMap(
      (releaseDocument) =>
        releaseDocument.filename ===
        "release.toml"
          ? readArrangementCreditRecords(
              releaseDocument,
            )
          : [],
    );
  const groupedReleaseArrangementCredits =
    groupPersonRoleDisplayRecords(
      sortArrangementCreditDisplayRecords(
        releaseArrangementCredits.map(
          (record) => ({
            key: record.key,
            name: record.name,
            role: record.role,
            sortName: record.sortName,
          }),
        ),
      ),
    );

  const releaseWritingCredits =
    releaseDocuments.flatMap((releaseDocument) =>
      releaseDocument.filename === "release.toml"
        ? readWritingCreditRecords(releaseDocument)
        : [],
    );
  const groupedReleaseWritingCredits =
    groupPersonRoleDisplayRecords(
      sortWritingCreditDisplayRecords(
        releaseWritingCredits.map((record) => ({
          key: record.key,
          name: record.name,
          role: record.role,
          sortName: record.sortName,
          family: record.family,
        })),
      ),
    );

  return (
    <section className="metadata-detail-section">
      {activeMetadataTab === "raw" && (
        <header className="raw-toml-section-header">
          <div>
            <h2>{title}</h2>
            {documents.length === 1 && (
              <code>
                {documents[0]?.filename}
              </code>
            )}
          </div>
          <span className="badge preview">
            {documents.length} files
          </span>
        </header>
      )}

      {activeMetadataTab ===
        "recording" &&
        missingTrackCreditsFile && (
          <div className="technical-credit-file-empty-state">
            <div>
              <strong>
                Recording, mixing and mastering credits
              </strong>
              <p>
                {groupedReleaseTechnicalCredits.length > 0
                  ? "This track is using the release-level technical-credit defaults. Create a track credits document only when this track needs an override."
                  : "No track-credits.toml document exists for this track yet."}
              </p>

              {groupedReleaseTechnicalCredits.length > 0 && (
                <div className="missing-track-inherited-credit-list">
                  {groupedReleaseTechnicalCredits.map(
                    (credit) => (
                      <div key={credit.key}>
                        <strong>
                          {credit.roles.join(", ")}
                        </strong>
                        <span>{credit.name}</span>
                        <small className="metadata-provenance-note metadata-inherited-note">
                          Inherited from release
                        </small>
                      </div>
                    ),
                  )}
                </div>
              )}
            </div>

            {editMode ? (
              <button
                type="button"
                className={[
                  "performer-add-button",
                  creatingTrackCredits
                    ? "is-loading"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                disabled={
                  creatingTrackCredits
                }
                aria-busy={
                  creatingTrackCredits
                }
                onClick={() =>
                  onCreateTrackCreditsDocument(
                    missingTrackCreditsFile,
                    "technical",
                  )
                }
              >
                <span aria-hidden="true">
                  +
                </span>
                <span>
                  {creatingTrackCredits
                    ? "Preparing technical credits…"
                    : groupedReleaseTechnicalCredits.length > 0
                      ? "Add track override"
                      : "Add technical credits"}
                </span>
              </button>
            ) : (
              <small>
                Enter Edit mode to add the first technical
                credit.
              </small>
            )}
          </div>
        )}

      {activeMetadataTab ===
        "credits" &&
        missingTrackCreditsFile && (
          <div className="technical-credit-file-empty-state writing-credit-file-empty-state">
            <div>
              <strong>Songwriting &amp; composition credits</strong>
              <p>
                {groupedReleaseWritingCredits.length > 0
                  ? "This track is using the release-level songwriting defaults. Create a track credits document only when this track needs an override."
                  : "No track-credits.toml document exists for this track yet."}
              </p>

              {groupedReleaseWritingCredits.length > 0 && (
                <div className="missing-track-inherited-credit-list">
                  {groupedReleaseWritingCredits.map((credit) => (
                    <div key={credit.key}>
                      <strong>{credit.roles.join(", ")}</strong>
                      <span>{credit.name}</span>
                      <small className="metadata-provenance-note metadata-inherited-note">
                        Inherited from release
                      </small>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {editMode ? (
              <button
                type="button"
                className={[
                  "performer-add-button",
                  creatingTrackCredits ? "is-loading" : "",
                ].filter(Boolean).join(" ")}
                disabled={creatingTrackCredits}
                aria-busy={creatingTrackCredits}
                onClick={() =>
                  onCreateTrackCreditsDocument(
                    missingTrackCreditsFile,
                    "writing",
                  )
                }
              >
                <span aria-hidden="true">+</span>
                <span>
                  {creatingTrackCredits
                    ? "Preparing songwriting credits…"
                    : groupedReleaseWritingCredits.length > 0
                      ? "Add track override"
                      : "Add songwriting credits"}
                </span>
              </button>
            ) : (
              <small>
                Enter Edit mode to add the first songwriting credit.
              </small>
            )}
          </div>
        )}

      {activeMetadataTab ===
        "credits" &&
        missingTrackCreditsFile && (
          <div className="technical-credit-file-empty-state arrangement-credit-file-empty-state">
            <div>
              <strong>
                Arrangement &amp; orchestration credits
              </strong>
              <p>
                {groupedReleaseArrangementCredits.length > 0
                  ? "This track is using the release-level arrangement and orchestration defaults. Create a track credits document only when this track needs an override."
                  : "No track-credits.toml document exists for this track yet."}
              </p>

              {groupedReleaseArrangementCredits.length > 0 && (
                <div className="missing-track-inherited-credit-list">
                  {groupedReleaseArrangementCredits.map(
                    (credit) => (
                      <div key={credit.key}>
                        <strong>
                          {credit.roles.join(", ")}
                        </strong>
                        <span>{credit.name}</span>
                        <small className="metadata-provenance-note metadata-inherited-note">
                          Inherited from release
                        </small>
                      </div>
                    ),
                  )}
                </div>
              )}
            </div>

            {editMode ? (
              <button
                type="button"
                className={[
                  "performer-add-button",
                  creatingTrackCredits
                    ? "is-loading"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                disabled={creatingTrackCredits}
                aria-busy={creatingTrackCredits}
                onClick={() =>
                  onCreateTrackCreditsDocument(
                    missingTrackCreditsFile,
                    "arrangement",
                  )
                }
              >
                <span aria-hidden="true">+</span>
                <span>
                  {creatingTrackCredits
                    ? "Preparing arrangement credits…"
                    : groupedReleaseArrangementCredits.length > 0
                      ? "Add track override"
                      : "Add arrangement credits"}
                </span>
              </button>
            ) : (
              <small>
                Enter Edit mode to add the first arrangement
                credit.
              </small>
            )}
          </div>
        )}

      {activeMetadataTab === "credits" && missingTrackCreditsFile && (
        <div className="technical-credit-file-empty-state sample-credit-file-empty-state">
          <div>
            <strong>Samples &amp; interpolations</strong>
            <p>
              Create track-credits.toml to record sampled recordings,
              interpolations, musical quotations, or lyrical quotations.
            </p>
          </div>
          {editMode ? (
            <button
              type="button"
              className="performer-add-button"
              disabled={creatingTrackCredits}
              onClick={() =>
                onCreateTrackCreditsDocument(
                  missingTrackCreditsFile,
                  "samples",
                )
              }
            >
              <span aria-hidden="true">+</span>
              <span>{creatingTrackCredits ? "Preparing samples…" : "Add sample credit"}</span>
            </button>
          ) : (
            <small>Enter Edit mode to add the first sample credit.</small>
          )}
        </div>
      )}

      {activeMetadataTab === "rights" && missingTrackCreditsFile && (
        <div className="technical-credit-file-empty-state sample-clearance-file-empty-state">
          <div>
            <strong>Sample clearance</strong>
            <p>
              Create track-credits.toml to keep private master-use and
              publishing-clearance status linked to numbered sample sources.
            </p>
          </div>
          <small>
            Add the related source under Artists, Performers &amp; Writers →
            Samples &amp; Interpolations first. The clearance editor becomes
            available after track-credits.toml exists.
          </small>
        </div>
      )}

      {documents.length === 0 ? (
        <p className="empty-state">
          No metadata documents exist for this selection yet.
        </p>
      ) : (
        <div className="metadata-category-documents">
          {documents.map((document) => (
            <MetadataDocumentTable
              key={document.relativePath}
              document={document}
              releaseDocuments={
                releaseDocuments
              }
              editMode={editMode}
              canFinishEditing={
                canFinishEditing
              }
              onBeginEdit={onBeginEdit}
              onDoneEditing={
                onDoneEditing
              }
              draft={draft}
              performerDraft={
                performerDrafts[
                  document.relativePath
                ]
              }
              technicalCreditDraft={
                technicalCreditDrafts[
                  document.relativePath
                ]
              }
              arrangementCreditDraft={
                arrangementCreditDrafts[
                  document.relativePath
                ]
              }
              writingCreditDraft={
                writingCreditDrafts[
                  document.relativePath
                ]
              }
              sampleRelationshipDraft={
                sampleRelationshipDrafts[
                  document.relativePath
                ]
              }
              sampleClearanceDraft={
                sampleClearanceDrafts[
                  document.relativePath
                ]
              }
              onDraftValueChange={
                onDraftValueChange
              }
              onPerformerDraftChange={(
                records,
              ) =>
                onPerformerDraftChange(
                  document,
                  records,
                )
              }
              onTechnicalCreditDraftChange={(
                records,
              ) =>
                onTechnicalCreditDraftChange(
                  document,
                  records,
                )
              }
              onArrangementCreditDraftChange={(
                records,
              ) =>
                onArrangementCreditDraftChange(
                  document,
                  records,
                )
              }
              onWritingCreditDraftChange={(
                records,
              ) =>
                onWritingCreditDraftChange(
                  document,
                  records,
                )
              }
              onSampleRelationshipDraftChange={(records) =>
                onSampleRelationshipDraftChange(document, records)
              }
              onSampleClearanceDraftChange={(records) =>
                onSampleClearanceDraftChange(document, records)
              }
              onCopyPerformerCredits={(
                records,
              ) =>
                onCopyPerformerCredits(
                  document,
                  records,
                )
              }
              metadataRegistry={
                metadataRegistry
              }
              activeMetadataTab={
                activeMetadataTab
              }
              saving={
                savingDocumentPath ===
                document.relativePath
              }
              addingFields={
                addingFieldsPath ===
                document.relativePath
              }
              removingFieldKey={
                removingFieldKey
              }
              onAddFields={
                onAddFields
              }
              onRemoveField={
                onRemoveField
              }
              onSave={() =>
                onSaveDocument(document)
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}

const playerCompatibilityLabels = {
  vlc: "VLC",
  appleMusic: "Apple Music",
  windowsMediaPlayer:
    "Windows Media Player",
  windowsMediaPlayerLegacy:
    "Windows Media Player Legacy",
} as const;

function MetadataCompatibilityNotes({
  field,
}: {
  field: MetadataFieldDefinition;
}) {
  if (
    !field.playerCompatibility ||
    field.playerCompatibility.length === 0
  ) {
    return null;
  }

  return (
    <ul className="metadata-compatibility-notes">
      {field.playerCompatibility.map(
        (result) => (
          <li
            key={[
              result.player,
              result.containers.join("-"),
              result.status,
            ].join(":")}
            className={`compatibility-${result.status}`}
          >
            <strong>
              {
                playerCompatibilityLabels[
                  result.player
                ]
              }
            </strong>

            <span>
              {result.status.replace("-", " ")}
              {" · "}
              {result.containers.join(", ")}
            </span>

            <p>{result.note}</p>
          </li>
        ),
      )}
    </ul>
  );
}


const controlledVocabularyOtherValue =
  "__metadata_other__";

function findControlledVocabularyOption(
  value: string,
  options: readonly string[],
): string | undefined {
  const normalizedValue = value
    .trim()
    .toLocaleLowerCase();

  if (!normalizedValue) {
    return undefined;
  }

  return options.find(
    (option) =>
      option.trim().toLocaleLowerCase() ===
      normalizedValue,
  );
}

function SelectOrCustomMetadataInput({
  value,
  options,
  onChange,
  selectLabel,
  customLabel = "Other…",
  customPlaceholder = "Enter a custom value",
  ariaInvalid,
}: {
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  selectLabel: string;
  customLabel?: string;
  customPlaceholder?: string;
  ariaInvalid?: boolean;
}) {
  const matchedOption =
    findControlledVocabularyOption(
      value,
      options,
    );
  const [customMode, setCustomMode] =
    useState(
      value.trim().length > 0 &&
        matchedOption === undefined,
    );

  useEffect(() => {
    if (matchedOption) {
      setCustomMode(false);
      return;
    }

    if (value.trim()) {
      setCustomMode(true);
      return;
    }

    setCustomMode(false);
  }, [matchedOption, value]);

  const customValue = matchedOption
    ? ""
    : value;

  return (
    <span
      className={[
        "controlled-vocabulary-input",
        customMode ? "is-custom" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <select
        aria-label={selectLabel}
        aria-invalid={ariaInvalid}
        value={
          customMode
            ? controlledVocabularyOtherValue
            : matchedOption ?? ""
        }
        onChange={(event) => {
          const nextValue =
            event.target.value;

          if (
            nextValue ===
            controlledVocabularyOtherValue
          ) {
            setCustomMode(true);
            return;
          }

          setCustomMode(false);
          onChange(nextValue);
        }}
      >
        <option value="">
          Select a standard value…
        </option>
        {options.map((option) => (
          <option
            key={option}
            value={option}
          >
            {option}
          </option>
        ))}
        <option
          value={
            controlledVocabularyOtherValue
          }
        >
          {customLabel}
        </option>
      </select>

      {customMode && (
        <input
          type="text"
          aria-label={`${selectLabel} custom value`}
          aria-invalid={ariaInvalid}
          value={customValue}
          placeholder={customPlaceholder}
          onChange={(event) =>
            onChange(event.target.value)
          }
        />
      )}
    </span>
  );
}


function CopyrightNoticeInput({
  path,
  value,
  onChange,
}: {
  path: string;
  value: string;
  onChange: (nextValue: string) => void;
}) {
  const config =
    getGuidedCopyrightNoticeConfig(path);
  const parsedValue =
    parseGuidedCopyrightNotice(value, path);
  const [customMode, setCustomMode] =
    useState(parsedValue === null);
  const [guidedHolder, setGuidedHolder] =
    useState(parsedValue?.holder ?? "");
  const lastEmittedGuidedValue =
    useRef<string | null>(null);

  useEffect(() => {
    const nextParsedValue =
      parseGuidedCopyrightNotice(
        value,
        path,
      );

    setCustomMode(nextParsedValue === null);
    setGuidedHolder(
      nextParsedValue?.holder ?? "",
    );
    lastEmittedGuidedValue.current = null;
  }, [path]);

  useEffect(() => {
    if (
      value ===
      lastEmittedGuidedValue.current
    ) {
      lastEmittedGuidedValue.current = null;
      return;
    }

    const nextParsedValue =
      parseGuidedCopyrightNotice(
        value,
        path,
      );

    if (nextParsedValue === null) {
      return;
    }

    setGuidedHolder(nextParsedValue.holder);
  }, [path, value]);

  if (!config) {
    return null;
  }

  const canonicalPlaceholder =
    `${config.prefix} ${config.symbol} Name. All rights reserved.`;
  const noticeKind =
    config.symbol === "℗"
      ? "sound recording copyright"
      : "copyright";

  if (customMode) {
    return (
      <span className="guided-copyright-input is-custom">
        <input
          type="text"
          aria-label={`Custom ${noticeKind} notice`}
          value={value}
          placeholder={canonicalPlaceholder}
          onChange={(event) =>
            onChange(event.target.value)
          }
        />

        <button
          type="button"
          className="guided-rights-mode-button"
          onClick={() =>
            setCustomMode(false)
          }
        >
          Use guided format
        </button>

        {parsedValue === null &&
          value.trim() !== "" && (
            <small className="guided-rights-note">
              This existing custom value remains unchanged until the guided name field is edited.
            </small>
          )}
      </span>
    );
  }

  const updateHolder = (holder: string) => {
    setGuidedHolder(holder);

    const nextValue =
      formatGuidedCopyrightNotice(
        holder,
        path,
      );

    lastEmittedGuidedValue.current =
      nextValue;
    onChange(nextValue);
  };

  return (
    <span className="guided-copyright-input">
      <span className="guided-copyright-fragment">
        {config.prefix}
      </span>
      <span
        className="guided-copyright-fragment guided-copyright-symbol"
        aria-label={
          config.symbol === "℗"
            ? "Sound recording copyright symbol"
            : "Copyright symbol"
        }
        title={
          config.symbol === "℗"
            ? "Sound recording copyright"
            : "Copyright"
        }
      >
        {config.symbol}
      </span>
      <input
        type="text"
        aria-label={`${config.prefix} holder names`}
        value={guidedHolder}
        placeholder="Name or names"
        onChange={(event) =>
          updateHolder(event.target.value)
        }
      />
      <span
        className="guided-copyright-punctuation"
        aria-hidden="true"
      >
        .
      </span>
      <span className="guided-copyright-reservation">
        All rights reserved.
      </span>

      <button
        type="button"
        className="guided-rights-mode-button"
        onClick={() =>
          setCustomMode(true)
        }
      >
        Custom value
      </button>

      <small className="guided-rights-preview">
        Value preview: {
          formatGuidedCopyrightNotice(
            guidedHolder,
            path,
          ) || "Blank"
        }
      </small>
    </span>
  );
}

function GuidedRightsStatementInput({
  path,
  symbol,
  value,
  onChange,
}: {
  path: string;
  symbol: RightsStatementSymbol;
  value: string;
  onChange: (nextValue: string) => void;
}) {
  const parsedValue =
    parseGuidedRightsStatement(
      value,
      symbol,
    );
  const [customMode, setCustomMode] =
    useState(parsedValue === null);
  const initialGuidedParts =
    parsedValue ?? {
      year: "",
      holder: "",
    };
  const [guidedYear, setGuidedYear] =
    useState(initialGuidedParts.year);
  const [guidedHolder, setGuidedHolder] =
    useState(initialGuidedParts.holder);

  // Preserve partial years and spaces while controlled inputs rerender.
  const lastEmittedGuidedValue =
    useRef<string | null>(null);

  useEffect(() => {
    const nextParsedValue =
      parseGuidedRightsStatement(
        value,
        symbol,
      );

    setCustomMode(nextParsedValue === null);
    setGuidedYear(
      nextParsedValue?.year ?? "",
    );
    setGuidedHolder(
      nextParsedValue?.holder ?? "",
    );
    lastEmittedGuidedValue.current = null;
  }, [path, symbol]);

  useEffect(() => {
    if (
      value ===
      lastEmittedGuidedValue.current
    ) {
      lastEmittedGuidedValue.current = null;
      return;
    }

    const nextParsedValue =
      parseGuidedRightsStatement(
        value,
        symbol,
      );

    if (nextParsedValue === null) {
      return;
    }

    setGuidedYear(nextParsedValue.year);
    setGuidedHolder(nextParsedValue.holder);
  }, [symbol, value]);

  if (customMode) {
    return (
      <span className="guided-rights-input is-custom">
        <input
          type="text"
          aria-label="Custom rights statement"
          value={value}
          placeholder={
            symbol === "℗"
              ? "℗ 2026 Rights Holder"
              : "© 2026 Rights Holder"
          }
          onChange={(event) =>
            onChange(event.target.value)
          }
        />

        <button
          type="button"
          className="guided-rights-mode-button"
          onClick={() =>
            setCustomMode(false)
          }
        >
          Use guided fields
        </button>

        {parsedValue === null &&
          value.trim() !== "" && (
            <small className="guided-rights-note">
              This existing custom value remains unchanged
              until a guided field is edited.
            </small>
          )}
      </span>
    );
  }

  const parts = {
    year: guidedYear,
    holder: guidedHolder,
  };
  const updateParts = (
    year: string,
    holder: string,
  ) => {
    // Keep the exact in-progress input locally. The emitted TOML value
    // remains normalized and never requires a literal symbol entry.
    setGuidedYear(year);
    setGuidedHolder(holder);

    const nextValue =
      formatGuidedRightsStatement(
        symbol,
        year,
        holder,
      );

    lastEmittedGuidedValue.current =
      nextValue;
    onChange(nextValue);
  };

  return (
    <span className="guided-rights-input">
      <span
        className="guided-rights-symbol"
        aria-label={
          symbol === "℗"
            ? "Phonographic copyright symbol"
            : "Copyright symbol"
        }
        title={
          symbol === "℗"
            ? "Phonographic copyright"
            : "Copyright"
        }
      >
        {symbol}
      </span>

      <input
        type="text"
        inputMode="numeric"
        aria-label="Rights year"
        value={parts.year}
        placeholder="Year"
        maxLength={4}
        onChange={(event) => {
          const nextYear =
            event.target.value
              .replace(/\D/g, "")
              .slice(0, 4);

          updateParts(
            nextYear,
            parts.holder,
          );
        }}
      />

      <input
        type="text"
        aria-label="Rights holder name"
        value={parts.holder}
        placeholder="Person or entity name"
        onChange={(event) =>
          updateParts(
            parts.year,
            event.target.value,
          )
        }
      />

      <button
        type="button"
        className="guided-rights-mode-button"
        onClick={() =>
          setCustomMode(true)
        }
      >
        Custom value
      </button>

      <small className="guided-rights-preview">
        Value preview: {
          formatGuidedRightsStatement(
            symbol,
            parts.year,
            parts.holder,
          ) || "Blank"
        }
      </small>
    </span>
  );
}


function isMultilineLyricsPath(
  path: string,
): boolean {
  return /^track\.text\.(lyrics|synchronized_lyrics|unsynchronized_lyrics|translation)$/.test(
    path,
  );
}


function MetadataValueCell({
  document,
  row,
  field,
  inheritedValue,
  inheritedSourcePath,
  generatedFallbackValue,
  generatedFallbackNote,
  editMode,
  draft,
  onDraftValueChange,
}: {
  document: ParsedMetadataDocument;
  row: FlattenedMetadataRow;
  field?: MetadataFieldDefinition;
  inheritedValue?: EditableMetadataValue;
  inheritedSourcePath?: string;
  generatedFallbackValue?: EditableMetadataValue;
  generatedFallbackNote?: string;
  editMode: boolean;
  draft: MetadataDraft;
  onDraftValueChange: (
    document: ParsedMetadataDocument,
    metadataPath: string,
    originalValue: EditableMetadataValue,
    nextValue: EditableMetadataValue,
  ) => void;
}) {
  if (!isEditableMetadataValue(row.value)) {
    return (
      <span className="metadata-value readonly-complex">
        {formatMetadataValue(row.value)}
      </span>
    );
  }

  const originalValue = row.value;
  const usingInheritedValue =
    inheritedValue !== undefined &&
    isBlankMetadataValue(originalValue);

  const generatedSortTitle =
    row.path === "track.sort_title" &&
    typeof originalValue === "string" &&
    !originalValue.trim()
      ? generateTrackSortTitle({
          title: readDocumentDraftString(
            document,
            "track.title",
            draft,
          ),
          version: readDocumentDraftString(
            document,
            "track.version",
            draft,
          ),
          displayTitle: readDocumentDraftString(
            document,
            "track.display_title",
            draft,
          ),
        })
      : null;
  const internallyGeneratedValue =
    row.path === "track.display_title" &&
    typeof originalValue === "string" &&
    !originalValue.trim()
      ? formatTrackDisplayTitle(
          readDocumentDraftString(document, "track.title", draft),
          readDocumentDraftString(document, "track.version", draft),
        )
      : row.path === "track.audio.camelot_key" &&
          typeof originalValue === "string" &&
          !originalValue.trim()
        ? camelotKeyForMusicalKey(
            readDocumentDraftString(document, "track.audio.key", draft),
          ) ?? ""
        : generatedSortTitle?.value ?? "";
  const internallyGeneratedNote =
    row.path === "track.audio.camelot_key"
      ? "Generated from Key"
      : row.path === "track.sort_title"
        ? generatedSortTitle?.source
          ? `Generated from ${generatedSortTitle.source}`
          : ""
        : "Generated from Track Title";
  const usingInternallyGeneratedValue =
    Boolean(internallyGeneratedValue);

  const effectiveValue = usingInheritedValue
    ? inheritedValue
    : usingInternallyGeneratedValue
      ? internallyGeneratedValue
      : originalValue;

  const draftKey = buildDocumentDraftKey(
    document,
    row.path,
  );
  const changed =
    Object.prototype.hasOwnProperty.call(
      draft,
      draftKey,
    );
  const authoredCurrentValue = changed
    ? draft[draftKey]
    : effectiveValue;
  const usingFallbackGeneratedValue =
    generatedFallbackValue !== undefined &&
    !isBlankMetadataValue(
      generatedFallbackValue,
    ) &&
    isBlankMetadataValue(
      authoredCurrentValue,
    );
  const usingGeneratedValue =
    usingInternallyGeneratedValue ||
    usingFallbackGeneratedValue;
  const generatedNote =
    usingFallbackGeneratedValue
      ? generatedFallbackNote ?? "Generated value"
      : internallyGeneratedNote;
  const currentValue =
    usingFallbackGeneratedValue
      ? generatedFallbackValue
      : authoredCurrentValue;
  const guidedNoticeDisplayValue =
    typeof currentValue === "string"
      ? formatGuidedCopyrightNoticeValue(
          row.path,
          currentValue,
        )
      : null;
  const displayCurrentValue =
    guidedNoticeDisplayValue ?? currentValue;

  if (!editMode) {
    return (
      <span
        className={[
          isBlankMetadataValue(currentValue)
            ? "metadata-value blank"
            : "metadata-value",
          changed ? "draft-changed" : "",
          isMultilineLyricsPath(row.path)
            ? "multiline-metadata-value"
            : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <span>
          {row.path === "track.audio.tuning_hz" && typeof displayCurrentValue === "number"
            ? `${formatMetadataValue(displayCurrentValue)} Hz`
            : formatMetadataValue(displayCurrentValue)}
        </span>

        {usingGeneratedValue && (
          <small className="metadata-provenance-note metadata-derived-note">
            {generatedNote}
          </small>
        )}

        {usingInheritedValue && (
          <small
            className="metadata-provenance-note metadata-inherited-note"
            title={
              inheritedSourcePath
                ? `Inherited from ${inheritedSourcePath}`
                : "Inherited from release metadata"
            }
          >
            Inherited from release
          </small>
        )}
      </span>
    );
  }

  if (
    Array.isArray(originalValue) ||
    Array.isArray(effectiveValue)
  ) {
    const currentArray = Array.isArray(
      currentValue,
    )
      ? currentValue
      : Array.isArray(effectiveValue)
        ? effectiveValue
        : [];

    return (
      <label className="metadata-editor-field array-field">
        <textarea
          rows={Math.max(
            3,
            currentArray.length + 1,
          )}
          value={stringArrayToEditorText(
            currentArray,
          )}
          placeholder="One value per line"
          onChange={(event) =>
            onDraftValueChange(
              document,
              row.path,
              originalValue,
              editorTextToStringArray(
                event.target.value,
              ),
            )
          }
        />

        <span className="array-field-help">
          One value per line
        </span>

        {usingInheritedValue &&
          !changed && (
          <span className="metadata-provenance-note metadata-inherited-note">
            Inherited from release
          </span>
        )}

        {changed && (
          <span className="changed-indicator">
            Track override
          </span>
        )}
      </label>
    );
  }

  if (
    typeof originalValue === "boolean" ||
    typeof effectiveValue === "boolean"
  ) {
    return (
      <label className="metadata-editor-field boolean-field">
        <select
          value={String(currentValue)}
          onChange={(event) =>
            onDraftValueChange(
              document,
              row.path,
              originalValue,
              event.target.value === "true",
            )
          }
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </select>

        {usingInheritedValue &&
          !changed && (
          <span className="metadata-provenance-note metadata-inherited-note">
            Inherited from release
          </span>
        )}

        {changed && (
          <span className="changed-indicator">
            Track override
          </span>
        )}
      </label>
    );
  }

  if (
    typeof originalValue === "number" ||
    typeof effectiveValue === "number"
  ) {
    return (
      <label className="metadata-editor-field">
        <span className={row.path === "track.audio.tuning_hz" ? "metadata-number-with-unit" : undefined}>
        <input
          type="number"
          min={row.path === "track.audio.tuning_hz" ? 100 : isTrackDiscNumberingPath(row.path) ? 1 : undefined}
          max={row.path === "track.audio.tuning_hz" ? 999 : undefined}
          step={isTrackDiscNumberingPath(row.path) ? 1 : row.path === "track.audio.tuning_hz" ? 0.1 : "any"}
          value={String(currentValue)}
          onChange={(event) => {
            const parsed =
              parseDraftNumber(
                event.target.value,
              );

            if (
              parsed !== null &&
              (row.path !== "track.audio.tuning_hz" || isValidTuningReference(parsed))
            ) {
              onDraftValueChange(
                document,
                row.path,
                originalValue,
                parsed,
              );
            }
          }}
        />
        {row.path === "track.audio.tuning_hz" && <span className="metadata-value-unit">Hz</span>}
        </span>

        {usingInheritedValue &&
          !changed && (
          <span className="metadata-provenance-note metadata-inherited-note">
            Inherited from release
          </span>
        )}

        {changed && (
          <span className="changed-indicator">
            Track override
          </span>
        )}
      </label>
    );
  }

  if (
    typeof currentValue === "string" &&
    isMultilineLyricsPath(row.path)
  ) {
    const lineCount =
      currentValue.split("\n").length;

    return (
      <label className="metadata-editor-field multiline-lyrics-field">
        <textarea
          rows={Math.min(
            24,
            Math.max(12, lineCount + 2),
          )}
          value={currentValue}
          placeholder="Enter complete lyrics with one lyrical line per line. Use a blank line between stanzas."
          spellCheck="true"
          onChange={(event) =>
            onDraftValueChange(
              document,
              row.path,
              originalValue,
              event.target.value,
            )
          }
        />

        <span className="multiline-lyrics-help">
          Preserve intentional line and stanza breaks.
        </span>

        {changed && (
          <span className="changed-indicator">
            Modified
          </span>
        )}
      </label>
    );
  }

  if (
    typeof currentValue === "string" &&
    isGuidedCopyrightNoticePath(row.path)
  ) {
    return (
      <div className="metadata-editor-field guided-rights-field">
        <CopyrightNoticeInput
          path={row.path}
          value={currentValue}
          onChange={(nextValue) =>
            onDraftValueChange(
              document,
              row.path,
              originalValue,
              nextValue,
            )
          }
        />

        {usingInheritedValue &&
          !changed && (
          <span className="metadata-provenance-note metadata-inherited-note">
            Inherited from release
          </span>
        )}

        {changed && (
          <span className="changed-indicator">
            {usingInheritedValue
              ? "Track override"
              : "Modified"}
          </span>
        )}
      </div>
    );
  }

  const rightsStatementSymbol =
    typeof currentValue === "string"
      ? getRightsStatementSymbol(row.path)
      : null;

  if (
    rightsStatementSymbol &&
    typeof currentValue === "string"
  ) {
    return (
      <div className="metadata-editor-field guided-rights-field">
        <GuidedRightsStatementInput
          path={row.path}
          symbol={rightsStatementSymbol}
          value={currentValue}
          onChange={(nextValue) =>
            onDraftValueChange(
              document,
              row.path,
              originalValue,
              nextValue,
            )
          }
        />

        {usingInheritedValue &&
          !changed && (
          <span className="metadata-provenance-note metadata-inherited-note">
            Inherited from release
          </span>
        )}

        {changed && (
          <span className="changed-indicator">
            {usingInheritedValue
              ? "Track override"
              : "Modified"}
          </span>
        )}
      </div>
    );
  }

  const controlledVocabulary =
    field?.editor?.control ===
      "select-or-custom" &&
    typeof currentValue === "string"
      ? {
          editor: field.editor,
          value: currentValue,
        }
      : null;

  if (controlledVocabulary) {
    const supportsTrackLanguageDefault =
      row.path ===
        "track.text.lyrics_language" &&
      typeof generatedFallbackValue ===
        "string" &&
      Boolean(generatedFallbackValue.trim());
    const restoreTrackLanguagePending =
      supportsTrackLanguageDefault &&
      changed &&
      isBlankMetadataValue(
        draft[draftKey],
      ) &&
      !isBlankMetadataValue(
        originalValue,
      );
    const showUseTrackLanguage =
      supportsTrackLanguageDefault &&
      (
        changed ||
        !isBlankMetadataValue(
          originalValue,
        )
      );

    return (
      <label className="metadata-editor-field controlled-vocabulary-field">
        <SelectOrCustomMetadataInput
          value={controlledVocabulary.value}
          options={
            controlledVocabulary.editor.options
          }
          selectLabel={`Select ${field?.label ?? row.path}`}
          customLabel={
            controlledVocabulary.editor.customLabel
          }
          customPlaceholder={
            controlledVocabulary.editor.customPlaceholder
          }
          onChange={(nextValue) =>
            onDraftValueChange(
              document,
              row.path,
              originalValue,
              nextValue,
            )
          }
        />

        {showUseTrackLanguage && (
          <span className="metadata-inheritance-actions">
            <small className="metadata-provenance-note metadata-derived-note">
              Track Language: {generatedFallbackValue}
            </small>

            <button
              type="button"
              className="metadata-use-release-value-button"
              disabled={restoreTrackLanguagePending}
              onClick={() =>
                onDraftValueChange(
                  document,
                  row.path,
                  originalValue,
                  "",
                )
              }
            >
              {restoreTrackLanguagePending
                ? "Track Language selected"
                : "Use Track Language"}
            </button>
          </span>
        )}

        {usingGeneratedValue && (
          <span className="metadata-provenance-note metadata-derived-note">
            {generatedNote}
          </span>
        )}

        {usingInheritedValue &&
          !changed && (
          <span className="metadata-provenance-note metadata-inherited-note">
            Inherited from release
          </span>
        )}

        {changed && (
          <span className="changed-indicator">
            {restoreTrackLanguagePending
              ? "Use Track Language"
              : usingInheritedValue
                ? "Track override"
                : supportsTrackLanguageDefault
                  ? "Local override"
                  : "Modified"}
          </span>
        )}
      </label>
    );
  }

  if (
    row.path === "track.display_title" &&
    typeof currentValue === "string"
  ) {
    const localTrackTitle =
      readDocumentDraftString(
        document,
        "track.title",
        draft,
      );
    const localTrackVersion =
      readDocumentDraftString(
        document,
        "track.version",
        draft,
      );
    const generatedDisplayTitle =
      formatTrackDisplayTitle(
        localTrackTitle,
        localTrackVersion,
      );
    const matchesGeneratedTitle =
      currentValue.trim() ===
      generatedDisplayTitle;

    return (
      <label className="metadata-editor-field track-display-title-field">
        <input
          type="text"
          value={currentValue}
          onChange={(event) =>
            onDraftValueChange(
              document,
              row.path,
              originalValue,
              event.target.value,
            )
          }
        />

        {generatedDisplayTitle && (
          <span className="track-display-title-suggestion">
            <span>
              Suggested: {generatedDisplayTitle}
            </span>

            <button
              type="button"
              disabled={matchesGeneratedTitle}
              onClick={() =>
                onDraftValueChange(
                  document,
                  row.path,
                  originalValue,
                  generatedDisplayTitle,
                )
              }
            >
              {matchesGeneratedTitle
                ? "Using generated title"
                : "Use generated title"}
            </button>
          </span>
        )}

        <small className="metadata-provenance-note metadata-derived-note track-display-title-help">
          Generated from Track Title plus the local Track Version. It stays synchronized while using the generated wording; an individual custom title remains unchanged.
        </small>

        {changed && (
          <span className="changed-indicator">
            Modified
          </span>
        )}
      </label>
    );
  }

  const supportsReleaseValueInheritance =
    inheritedValue !== undefined;
  const restoreReleaseValuePending =
    supportsReleaseValueInheritance &&
    changed &&
    isBlankMetadataValue(currentValue);
  const showUseReleaseValue =
    supportsReleaseValueInheritance &&
    (
      changed ||
      !isBlankMetadataValue(originalValue)
    );

  return (
    <label className="metadata-editor-field">
      <input
        type="text"
        value={String(currentValue)}
        onChange={(event) =>
          onDraftValueChange(
            document,
            row.path,
            originalValue,
            event.target.value,
          )
        }
      />

      {supportsReleaseValueInheritance && (
        <span className="metadata-inheritance-actions">
          <small className="metadata-provenance-note metadata-inherited-note">
            Release value: {formatMetadataValue(inheritedValue)}
          </small>

          {showUseReleaseValue && (
            <button
              type="button"
              className="metadata-use-release-value-button"
              disabled={restoreReleaseValuePending}
              onClick={() =>
                onDraftValueChange(
                  document,
                  row.path,
                  originalValue,
                  "",
                )
              }
            >
              {restoreReleaseValuePending
                ? "Release value selected"
                : "Use release value"}
            </button>
          )}
        </span>
      )}

      {usingGeneratedValue &&
        !changed && (
        <span className="metadata-provenance-note metadata-derived-note">
          {generatedNote}
        </span>
      )}

      {usingInheritedValue &&
        !changed && (
        <span className="metadata-provenance-note metadata-inherited-note">
          Inherited from release
        </span>
      )}

      {changed && (
        <span className="changed-indicator">
          {restoreReleaseValuePending
            ? "Restore release value"
            : usingInheritedValue
              ? "Track override"
              : "Modified"}
        </span>
      )}
    </label>
  );
}

function metadataRowMatchesTab(
  path: string,
  group: string,
  tab: ReleaseMetadataTab,
): boolean {
  const lowerPath = path.toLowerCase();

  if (tab === "raw") {
    return false;
  }

  if (tab === "settings") {
    return true;
  }

  if (tab === "files") {
    return group === "Files and Sources";
  }

  if (tab === "developer") {
    return group === "Developer / Advanced";
  }

  if (tab === "artwork") {
    return group === "Artwork";
  }

  const isLyricsRelated =
    [
      "Language & Writing System",
      "Lyrics",
      "Lyrics Rights & Source",
    ].includes(group) ||
    (
      /(^|\.)(lyrics?|language|script|translation)(\.|\[|$)/.test(
        lowerPath,
      ) ||
      /^track\.text\.(synchronized_lyrics|unsynchronized_lyrics)(\.|\[|$)/.test(
        lowerPath,
      )
    );

  const isWritingCredit =
    /(^|\.)(composer|composers|songwriter|songwriters|lyricist|lyricists|written_by|music_by|words_by)(\.|\[|$)/.test(
      lowerPath,
    );

  if (tab === "lyrics") {
    return isLyricsRelated;
  }

  if (tab === "credits") {
    return (
      group === "Artists" ||
      group === "Performers" ||
      group === "Songwriting & Composition" ||
      group === "Samples & Interpolations" ||
      group === "Arrangement & Orchestration" ||
      group === "Conducting & Musical Direction" ||
      isWritingCredit
    );
  }

  if (tab === "recording") {
    return [
      "Production",
      "Recording",
      "Editing",
      "Mixing",
      "Mastering",
      "Technical Audio",
    ].includes(group);
  }

  if (tab === "rights") {
    return (
      group === "Music Business & Rights" ||
      group === "Sample Clearance"
    );
  }

  if (tab === "notes") {
    return metadataRowMatchesNotesTab(
      lowerPath,
      group,
    );
  }

  return ![
    "Artists",
    "Performers",
    "Songwriting & Composition",
    "Samples & Interpolations",
    "Writing, Lyrics & Language",
    "Language & Writing System",
    "Lyrics",
    "Lyrics Rights & Source",
    "Arrangement & Orchestration",
    "Conducting & Musical Direction",
    "Production",
    "Recording",
    "Editing",
    "Mixing",
    "Mastering",
    "Technical Audio",
    "Music Business & Rights",
    "Sample Clearance",
    "Artwork",
    "Text and Notes",
    "Files and Sources",
    "Developer / Advanced",
  ].includes(group) &&
    !isLyricsRelated &&
    !isWritingCredit;
}

type ReleaseContributorRowItem = {
  row: FlattenedMetadataRow;
  fieldDefinition:
    | MetadataFieldDefinition
    | undefined;
  group: string;
  sourceIndex: number;
  startsGroup: boolean;
};

type ReleaseContributorRecord = {
  index: number;
  rows: ReleaseContributorRowItem[];
};

const engineeringContributorGroups =
  new Set([
    "Recording",
    "Editing",
    "Mixing",
    "Mastering",
  ]);

const engineeringCreditSummaryGroup =
  "Recording, Mixing & Mastering Credits";

function getTrackContributorRecordIndex(
  path: string,
): number | null {
  const match = path.match(
    /^track\.contributors\[(\d+)\]\./,
  );

  if (!match) {
    return null;
  }

  const parsedIndex = Number.parseInt(
    match[1] ?? "",
    10,
  );

  return Number.isInteger(parsedIndex)
    ? parsedIndex
    : null;
}

function getTrackContributorLeaf(
  path: string,
): string {
  return path.split(".").at(-1) ?? path;
}

function getReleaseContributorRecordIndex(
  path: string,
): number | null {
  const match = path.match(
    /^release\.credits\.contributors\[(\d+)\]\./,
  );

  if (!match) {
    return null;
  }

  const parsedIndex = Number.parseInt(
    match[1] ?? "",
    10,
  );

  return Number.isInteger(parsedIndex)
    ? parsedIndex
    : null;
}

function getReleaseContributorLeaf(
  path: string,
): string {
  return path.split(".").at(-1) ?? path;
}

function getContributorFieldLabel(
  leaf: string,
): string {
  switch (leaf) {
    case "name":
      return "Name";
    case "role":
      return "Role";
    case "sort_name":
      return "Sort name";
    default:
      return leaf
        .replaceAll("_", " ")
        .replace(
          /\b\w/g,
          (character) =>
            character.toUpperCase(),
        );
  }
}

function getInitialMetadataFieldValue(
  field: MetadataFieldDefinition,
  document: ParsedMetadataDocument,
  draft: MetadataDraft,
  releaseDocuments: ParsedMetadataDocument[] = [],
): EditableMetadataValue {
  if (field.tomlPath === "track.text.lyrics_language") {
    const releaseLanguageValue =
      findMetadataValueAcrossDocuments(
        releaseDocuments,
        "release.language",
      );
    const effectiveTrackLanguage =
      resolveEffectiveTrackLanguage({
        trackLanguage: readDocumentDraftString(
          document,
          "track.language",
          draft,
        ),
        releaseLanguage:
          typeof releaseLanguageValue === "string"
            ? releaseLanguageValue
            : "",
      });

    return effectiveTrackLanguage.value;
  }
  if (field.tomlPath === "track.audio.time_signature") return "4/4";
  if (field.tomlPath === "track.audio.tuning_hz") return 440;
  if (field.tomlPath === "track.audio.camelot_key") {
    return camelotKeyForMusicalKey(
      readDocumentDraftString(document, "track.audio.key", draft),
    ) ?? "";
  }
  if (field.tomlPath === "track.display_title") {
    return formatTrackDisplayTitle(
      readDocumentDraftString(document, "track.title", draft),
      readDocumentDraftString(document, "track.version", draft),
    );
  }
  if (field.tomlPath === "track.sort_title") {
    return generateTrackSortTitle({
      title: readDocumentDraftString(
        document,
        "track.title",
        draft,
      ),
      version: readDocumentDraftString(
        document,
        "track.version",
        draft,
      ),
      displayTitle: readDocumentDraftString(
        document,
        "track.display_title",
        draft,
      ),
    }).value;
  }

  const artistNamePath =
    artistNamePathForSortNamePath(
      field.tomlPath,
    );

  if (artistNamePath) {
    return generateArtistSortName(
      readDocumentDraftString(
        document,
        artistNamePath,
        draft,
      ),
    ).value;
  }

  switch (field.valueType) {
    case "boolean":
      return false;
    case "integer":
    case "number":
      return 0;
    case "string-array":
      return [];
    default:
      return "";
  }
}

function metadataStorageRoleForFilename(
  filename: string,
): string {
  const roles: Record<string, string> = {
    "release.toml": "release",
    "release-settings.toml":
      "release-settings",
    "release-production-notes.toml":
      "release-production-notes",
    "track.toml": "track",
    "track-credits.toml":
      "track-credits",
    "track-production-notes.toml":
      "track-production-notes",
  };

  return roles[filename] ?? "";
}

function buildDocumentMetadataRegistry(
  document: ParsedMetadataDocument,
  metadataRegistry: MetadataFieldDefinition[],
): MetadataFieldDefinition[] {
  if (
    document.filename !== "release-production-notes.toml" &&
    document.filename !== "track-production-notes.toml"
  ) {
    return metadataRegistry;
  }

  const storageFileRole =
    metadataStorageRoleForFilename(
      document.filename,
    );
  const existingPaths = new Set(
    metadataRegistry.map(
      (field) => field.tomlPath,
    ),
  );
  const supplemental = productionContextFields
    .filter(
      (field) => !existingPaths.has(field.path),
    )
    .map(
      (field): MetadataFieldDefinition => ({
        id: `${document.scope}.${field.path}`,
        canonicalName: `${document.scope}.${field.path}`,
        label: field.label,
        description: field.help,
        scope: document.scope,
        storageFileRole,
        tomlPath: field.path,
        valueType: "string",
        required: false,
        repeatable: false,
        inherited:
          document.scope === "track",
        presentation: {
          group: field.group,
          order: field.order,
          examples: field.examples,
          help: field.help,
        },
        displayPolicy: "auto",
      }),
    );

  return [
    ...metadataRegistry,
    ...supplemental,
  ];
}

function PerformerRecordEditor({
  document,
  records,
  releasePrimaryArtistName,
  releaseDefaultRecords = [],
  inheritedFromRelease = false,
  editMode,
  metadataRegistry,
  relatedOpen,
  onRelatedToggle,
  onChange,
  onCustomizeTrack,
  onUseRelease,
}: {
  document: ParsedMetadataDocument;
  records: PerformerRecordDraft[];
  releasePrimaryArtistName: string;
  releaseDefaultRecords?: PerformerRecordDraft[];
  inheritedFromRelease?: boolean;
  editMode: boolean;
  metadataRegistry: MetadataFieldDefinition[];
  relatedOpen: boolean;
  onRelatedToggle: (
    event: React.SyntheticEvent<
      HTMLDetailsElement
    >,
  ) => void;
  onChange: (
    records: PerformerRecordDraft[],
  ) => void;
  onCustomizeTrack?: () => void;
  onUseRelease?: () => void;
}) {
  const performerBasePath =
    document.scope === "release"
      ? "release.credits.performers"
      : "track.performers";
  const roleField =
    findRegisteredMetadataField(
      metadataRegistry,
      `${performerBasePath}[0].role`,
    );
  const sortNameField =
    findRegisteredMetadataField(
      metadataRegistry,
      `${performerBasePath}[0].sort_name`,
    );
  const canEditRecords =
    editMode && !inheritedFromRelease;
  const performanceRoleOptions =
    roleField?.editor?.options ??
    roleField?.presentation?.commonValues ??
    [];

  const updateRecord = (
    recordIndex: number,
    updates: Partial<
      Pick<
        PerformerRecordDraft,
        "name" | "role" | "sortName"
      >
    >,
  ) => {
    onChange(
      records.map(
        (record, index) =>
          index === recordIndex
            ? {
                ...record,
                ...updates,
              }
            : record,
      ),
    );
  };

  const addRecord = () => {
    if (records.length >= 500) {
      return;
    }

    onChange([
      ...records,
      {
        key: [
          "new",
          Date.now(),
          records.length,
        ].join("-"),
        sourceIndex: null,
        name: "",
        role: "",
        sortName: "",
      },
    ]);
  };

  const removeRecord = (
    recordIndex: number,
  ) => {
    const record =
      records[recordIndex];

    if (!record) {
      return;
    }

    const hasContent = [
      record.name,
      record.role,
      record.sortName,
    ].some(
      (value) =>
        value.trim().length > 0,
    );

    if (
      hasContent &&
      !window.confirm(
        `Remove performer ${
          record.name.trim() ||
          recordIndex + 1
        } and the paired performance role?`,
      )
    ) {
      return;
    }

    onChange(
      records.filter(
        (_, index) =>
          index !== recordIndex,
      ),
    );
  };

  const personGroupedRecords =
    prioritizeReleaseArtistDisplay(
      sortGroupedPerformerRoleDisplays(
        groupPersonRoleDisplayRecords(
          records.map((record) => ({
            key: record.key,
            name: record.name,
            role: record.role,
            sortName: record.sortName,
          })),
        ),
      ),
      releasePrimaryArtistName,
    );
  const groupedRecords =
    groupMatchingPerformerRoleSets(
      personGroupedRecords,
      releasePrimaryArtistName,
    );
  const showSortNames =
    canEditRecords
      ? records.some(
          (record) =>
            record.sortName.trim(),
        ) || records.length > 0
      : personGroupedRecords.some(
          (record) =>
            record.sortNames.length > 0,
        );
  const incompleteCount =
    records.filter(
      (record) =>
        !record.name.trim() ||
        !record.role.trim(),
    ).length;

  return (
    <div className="performer-record-editor">
      {inheritedFromRelease && (
        <div className="performer-inheritance-banner">
          <div>
            <strong>Inherited from release</strong>
            <p>
              This track uses the release performer baseline. Customize it only when this track differs.
            </p>
          </div>
          {editMode && onCustomizeTrack && (
            <button
              type="button"
              className="performer-add-button"
              onClick={onCustomizeTrack}
            >
              Customize performers for this track
            </button>
          )}
        </div>
      )}

      {canEditRecords && (
        <div className="performer-record-toolbar">
          {incompleteCount > 0 ? (
            <p className="performer-validation-message">
              {incompleteCount} incomplete{" "}
              {incompleteCount === 1
                ? "record needs"
                : "records need"}{" "}
              both a name and role before saving.
            </p>
          ) : (
            <span aria-hidden="true" />
          )}

          <div className="performer-record-toolbar-actions">
            {document.scope === "track" &&
              releaseDefaultRecords.length > 0 &&
              onUseRelease && (
                <button
                  type="button"
                  className="metadata-section-copy-button"
                  onClick={onUseRelease}
                >
                  Use release performers
                </button>
              )}

            <button
              type="button"
              className="performer-add-button"
              disabled={records.length >= 500}
              onClick={addRecord}
            >
              <span aria-hidden="true">+</span>
              <span>Add performer</span>
            </button>
          </div>
        </div>
      )}

      {records.length === 0 ? (
        <div className="performer-empty-state">
          <p>
            No performers have been added.
          </p>

          {canEditRecords && (
            <button
              type="button"
              className="performer-add-button"
              onClick={addRecord}
            >
              <span aria-hidden="true">+</span>
              <span>Add first performer</span>
            </button>
          )}
        </div>
      ) : (
        <>
          <div
            className={[
              "performer-record-column-headings",
              !canEditRecords
                ? "is-read-only"
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <div>
              <strong>Name</strong>
            </div>

            <div>
              <strong>Performance role</strong>
            </div>

            {canEditRecords && (
              <span className="sr-only">
                Record actions
              </span>
            )}
          </div>

          <div className="performer-record-list">
            {canEditRecords
              ? records.map(
                  (record, recordIndex) => (
                    <div
                      key={record.key}
                      className={[
                        "performer-record-row",
                        !record.name.trim() ||
                        !record.role.trim()
                          ? "is-incomplete"
                          : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <label>
                        <span className="sr-only">
                          Performer{" "}
                          {recordIndex + 1} name
                        </span>
                        <input
                          type="text"
                          value={record.name}
                          aria-invalid={
                            !record.name.trim()
                          }
                          placeholder="Performer name"
                          onChange={(event) =>
                            updateRecord(
                              recordIndex,
                              {
                                name:
                                  event.target.value,
                              },
                            )
                          }
                        />
                      </label>

                      <label>
                        <span className="sr-only">
                          Performer{" "}
                          {recordIndex + 1} role
                        </span>
                        <SelectOrCustomMetadataInput
                          value={record.role}
                          options={
                            performanceRoleOptions
                          }
                          selectLabel={`Select performer ${recordIndex + 1} role`}
                          customPlaceholder="Custom performance role"
                          ariaInvalid={
                            !record.role.trim()
                          }
                          onChange={(nextRole) =>
                            updateRecord(
                              recordIndex,
                              {
                                role: nextRole,
                              },
                            )
                          }
                        />
                      </label>

                      <button
                        type="button"
                        className="performer-remove-button"
                        aria-label={`Remove performer ${recordIndex + 1}`}
                        title="Remove performer and role"
                        onClick={() =>
                          removeRecord(
                            recordIndex,
                          )
                        }
                      >
                        <span aria-hidden="true">
                          −
                        </span>
                      </button>
                    </div>
                  ),
                )
              : groupedRecords.map(
                  (record) => (
                    <div
                      key={record.key}
                      className="performer-record-row is-read-only is-grouped-display"
                    >
                      <span>
                        {record.name ||
                          "(name not entered)"}
                      </span>
                      <span>
                        {record.roles.length > 0
                          ? record.roles.join(", ")
                          : "(role not entered)"}
                      </span>
                    </div>
                  ),
                )}
          </div>

        </>
      )}

      {showSortNames &&
        records.length > 0 && (
        <details
          className="metadata-related-tags performer-related-tags"
          open={relatedOpen}
          onToggle={onRelatedToggle}
        >
          <summary>
            <span
              className="metadata-section-triangle"
              aria-hidden="true"
            />
            <span>Related tags</span>
          </summary>

          <div className="performer-sort-name-list">
            <header>
              <strong>
                Performer sort names
              </strong>
              <MetadataFieldControls
                field={sortNameField}
                path={`${performerBasePath}[].sort_name`}
                valueType="string"
              />
            </header>

            {canEditRecords
              ? records.map(
                  (record, recordIndex) => (
                    <label key={record.key}>
                      <span>
                        {record.name ||
                          `Performer ${recordIndex + 1}`}
                      </span>

                      <input
                        type="text"
                        value={record.sortName}
                        placeholder="Last, First"
                        onChange={(event) =>
                          updateRecord(
                            recordIndex,
                            {
                              sortName:
                                event.target.value,
                            },
                          )
                        }
                      />
                    </label>
                  ),
                )
              : personGroupedRecords
                  .filter(
                    (record) =>
                      record.sortNames.length > 0,
                  )
                  .map((record) => (
                    <label key={record.key}>
                      <span>
                        {record.name ||
                          "(name not entered)"}
                      </span>
                      <span>
                        {record.sortNames.join(", ")}
                      </span>
                    </label>
                  ))}
          </div>
        </details>
      )}
    </div>
  );
}


function WritingCreditRecordEditor({
  document,
  records,
  inheritedRecords = [],
  releaseDefaultRecords = [],
  editMode,
  metadataRegistry,
  relatedOpen,
  onRelatedToggle,
  onChange,
}: {
  document: ParsedMetadataDocument;
  records: WritingCreditRecordDraft[];
  inheritedRecords?: WritingCreditRecordDraft[];
  releaseDefaultRecords?: WritingCreditRecordDraft[];
  editMode: boolean;
  metadataRegistry: MetadataFieldDefinition[];
  relatedOpen: boolean;
  onRelatedToggle: (
    event: React.SyntheticEvent<
      HTMLDetailsElement
    >,
  ) => void;
  onChange: (
    records: WritingCreditRecordDraft[],
  ) => void;
}) {
  const basePath = getWritingCreditBasePath(document);
  const nameField =
    findRegisteredMetadataField(
      metadataRegistry,
      `${basePath}.composers[0].name`,
    ) ??
    findRegisteredMetadataField(
      metadataRegistry,
      `${basePath}.songwriters[0].name`,
    );
  const roleField =
    findRegisteredMetadataField(
      metadataRegistry,
      `${basePath}.songwriters[0].role`,
    );
  const sortNameField =
    findRegisteredMetadataField(
      metadataRegistry,
      `${basePath}.songwriters[0].sort_name`,
    );
  const isReleaseCreditEditor =
    document.scope === "release";

  const updateRecord = (
    recordIndex: number,
    updates: Partial<
      Pick<
        WritingCreditRecordDraft,
        "name" | "role" | "sortName" | "family"
      >
    >,
  ) => {
    onChange(
      records.map((record, index) => {
        if (index !== recordIndex) {
          return record;
        }

        const nextRole =
          updates.role ?? record.role;
        const nextFamily =
          updates.family ??
          writingCreditFamilyForRole(
            nextRole,
            record.family,
          );

        return {
          ...record,
          ...updates,
          family: nextFamily,
        };
      }),
    );
  };

  const addRecord = (
    initial?: Partial<
      Pick<
        WritingCreditRecordDraft,
        "name" | "role" | "sortName" | "family"
      >
    >,
  ) => {
    if (records.length >= 500) {
      return;
    }

    const role = initial?.role ?? "written by";
    const family =
      initial?.family ??
      writingCreditFamilyForRole(role);

    onChange([
      ...records,
      {
        key: [
          "new-writing",
          document.scope,
          Date.now(),
          records.length,
        ].join("-"),
        family,
        sourceFamily: null,
        sourceIndex: null,
        name: initial?.name ?? "",
        role,
        sortName: initial?.sortName ?? "",
      },
    ]);
  };

  const removeRecord = (recordIndex: number) => {
    const record = records[recordIndex];

    if (!record) {
      return;
    }

    const hasContent = [
      record.name,
      record.role,
      record.sortName,
    ].some((value) => value.trim().length > 0);

    if (
      hasContent &&
      !window.confirm(
        `Remove songwriting credit ${
          record.name.trim() || recordIndex + 1
        } and the paired role?`,
      )
    ) {
      return;
    }

    onChange(
      records.filter((_, index) => index !== recordIndex),
    );
  };

  const overrideReleaseFamily = (
    family: WritingCreditFamily,
  ) => {
    const familyDefaults = releaseDefaultRecords.filter(
      (record) => record.family === family,
    );

    onChange([
      ...records.filter((record) => record.family !== family),
      ...familyDefaults.map((record, index) => ({
        ...record,
        key: [
          "track-writing-override",
          family,
          Date.now(),
          index,
        ].join("-"),
        sourceFamily: null,
        sourceIndex: null,
      })),
    ]);
  };

  const restoreReleaseFamily = (
    family: WritingCreditFamily,
  ) => {
    const matchingCount = records.filter(
      (record) => record.family === family,
    ).length;

    if (
      matchingCount > 0 &&
      !window.confirm(
        `Remove ${matchingCount} track-level ${
          matchingCount === 1 ? "credit" : "credits"
        } in this writing category and use the release defaults?`,
      )
    ) {
      return;
    }

    onChange(
      records.filter((record) => record.family !== family),
    );
  };

  const groupedLocalRecords =
    groupPersonRoleDisplayRecords(
      sortWritingCreditDisplayRecords(
        records.map((record) => ({
          key: record.key,
          name: record.name,
          role: record.role,
          sortName: record.sortName,
          family: record.family,
        })),
      ),
    );
  const groupedInheritedRecords =
    groupPersonRoleDisplayRecords(
      sortWritingCreditDisplayRecords(
        inheritedRecords.map((record) => ({
          key: record.key,
          name: record.name,
          role: record.role,
          sortName: record.sortName,
          family: record.family,
        })),
      ),
    );
  const readOnlyGroupedRecords = [
    ...groupedLocalRecords.map((record, sourceIndex) => ({
      record,
      inherited: false,
      sourceIndex,
    })),
    ...groupedInheritedRecords.map((record, sourceIndex) => ({
      record,
      inherited: true,
      sourceIndex:
        groupedLocalRecords.length + sourceIndex,
    })),
  ].sort((left, right) => {
    const priorityDifference =
      getWritingCreditDisplayPriority(
        left.record.roles[0] ?? "",
      ) -
      getWritingCreditDisplayPriority(
        right.record.roles[0] ?? "",
      );

    return priorityDifference !== 0
      ? priorityDifference
      : left.sourceIndex - right.sourceIndex;
  });
  const showSortNames = editMode
    ? records.length > 0
    : [
        ...groupedLocalRecords,
        ...groupedInheritedRecords,
      ].some((record) => record.sortNames.length > 0);
  const incompleteCount = records.filter(
    (record) =>
      !record.name.trim() || !record.role.trim(),
  ).length;
  const releaseFamilies = new Set(
    releaseDefaultRecords.map((record) => record.family),
  );

  return (
    <div className="performer-record-editor writing-credit-record-editor">
      <div className="performer-record-toolbar">
        <div>
          <div className="credit-pair-help-heading">
            <strong>
              {isReleaseCreditEditor
                ? "Release songwriting role and name"
                : "Songwriting role and name"}
            </strong>
            <MetadataFieldPairControls
              title={
                isReleaseCreditEditor
                  ? "Release songwriting role and name"
                  : "Songwriting role and name"
              }
              description={
                isReleaseCreditEditor
                  ? "Set release-wide writing defaults. Tracks inherit each songwriter, composer, and lyricist category until that category is overridden locally."
                  : "Credit combined authorship as Written by or Songwriter. Use Composer or Music by for music-only authorship, and Lyricist, Lyrics by, or Words by for text-only authorship."
              }
              nameField={nameField}
              namePath={`${basePath}.songwriters[].name`}
              roleField={roleField}
              rolePath={`${basePath}.songwriters[].role`}
              nameGuidance="Enter the credited writer's display name exactly as supplied by the official credits."
              roleGuidance="Use Written by when the source does not distinguish music from words. Use Composer and Lyricist when those responsibilities are known separately."
              nameExample="Nathan Brenton"
              roleExample="written by"
              commonRoleValues={Array.from(
                writingCreditRoleOptions,
              )}
              fieldOrder="role-name"
            />
          </div>
          <p>
            {isReleaseCreditEditor
              ? "Tracks inherit release writing credits by category and may override only the categories that differ."
              : "Songwriter, composer, and lyricist credits identify authorship of the musical work rather than recording or publishing ownership."}
          </p>
        </div>

        {editMode && (
          <button
            type="button"
            className="performer-add-button"
            disabled={records.length >= 500}
            onClick={() => addRecord()}
          >
            <span aria-hidden="true">+</span>
            <span>Add writing credit</span>
          </button>
        )}
      </div>

      {editMode ? (
        <>
          {incompleteCount > 0 && (
            <p className="performer-validation-note">
              Complete the name and role for every writing credit before saving.
            </p>
          )}

          {records.length === 0 ? (
            <div className="performer-empty-state">
              <p>No local songwriting credits have been added.</p>
              <button
                type="button"
                onClick={() => addRecord()}
              >
                Add first writing credit
              </button>
            </div>
          ) : (
            <>
              <div className="performer-record-column-headings">
                <div><strong>Writing role</strong></div>
                <div><strong>Name</strong></div>
                <div><strong>Actions</strong></div>
              </div>
              <div className="performer-record-list">
                {records.map((record, recordIndex) => {
                  const canRestoreRelease =
                    !isReleaseCreditEditor &&
                    releaseFamilies.has(record.family);

                  return (
                    <div
                      key={record.key}
                      className={[
                        "performer-record-row",
                        !record.name.trim() || !record.role.trim()
                          ? "is-incomplete"
                          : "",
                      ].filter(Boolean).join(" ")}
                    >
                      <label>
                        <span className="sr-only">
                          Writing credit {recordIndex + 1} role
                        </span>
                        <SelectOrCustomMetadataInput
                          value={record.role}
                          options={Array.from(
                            writingCreditRoleOptions,
                          )}
                          selectLabel={`Select writing credit ${recordIndex + 1} role`}
                          customPlaceholder="Custom writing role"
                          ariaInvalid={!record.role.trim()}
                          onChange={(nextRole) =>
                            updateRecord(recordIndex, {
                              role: nextRole,
                            })
                          }
                        />
                      </label>

                      <label>
                        <span className="sr-only">
                          Writing credit {recordIndex + 1} name
                        </span>
                        <input
                          type="text"
                          value={record.name}
                          aria-invalid={!record.name.trim()}
                          placeholder="Credited writer"
                          onChange={(event) =>
                            updateRecord(recordIndex, {
                              name: event.target.value,
                            })
                          }
                        />
                      </label>

                      <div className="technical-credit-record-actions">
                        {canRestoreRelease && (
                          <button
                            type="button"
                            className="technical-credit-use-release-button"
                            title="Remove this track category and restore the release writing credits"
                            onClick={() =>
                              restoreReleaseFamily(record.family)
                            }
                          >
                            Use release credit
                          </button>
                        )}
                        <button
                          type="button"
                          className="performer-remove-button"
                          aria-label={`Remove writing credit ${recordIndex + 1}`}
                          title="Remove credited writer and role"
                          onClick={() => removeRecord(recordIndex)}
                        >
                          <span aria-hidden="true">−</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {!isReleaseCreditEditor &&
            inheritedRecords.length > 0 && (
              <section className="inherited-technical-credit-list">
                <header>
                  <div>
                    <strong>Inherited release defaults</strong>
                    <p>
                      Override only the songwriting categories that differ on this track.
                    </p>
                  </div>
                </header>

                {sortWritingCreditDisplayRecords(
                  inheritedRecords,
                ).map((record) => (
                  <div
                    key={record.key}
                    className="inherited-technical-credit-row"
                  >
                    <span>{record.role}</span>
                    <span>{record.name}</span>
                    <button
                      type="button"
                      title="Copy every release credit in this writing category into a track-level override"
                      onClick={() =>
                        overrideReleaseFamily(record.family)
                      }
                    >
                      Override category
                    </button>
                  </div>
                ))}
              </section>
            )}
        </>
      ) : (
        <>
          {readOnlyGroupedRecords.length === 0 ? (
            <div className="performer-empty-state">
              <p>No songwriting or composition credits have been added.</p>
            </div>
          ) : (
            <>
              <div className="performer-record-column-headings is-read-only">
                <div><strong>Writing role</strong></div>
                <div><strong>Name</strong></div>
              </div>
              <div className="performer-record-list">
                {readOnlyGroupedRecords.map(
                  ({ record, inherited }) => (
                    <div
                      key={`${inherited ? "inherited" : "local"}:${record.key}`}
                      className="performer-record-row is-read-only is-grouped-display"
                    >
                      <span>
                        {record.roles.length > 0
                          ? record.roles.join(", ")
                          : "(role not entered)"}
                      </span>
                      <span>
                        {record.name || "(name not entered)"}
                        {inherited && (
                          <small className="metadata-provenance-note metadata-inherited-note technical-credit-inherited-note">
                            Inherited from release
                          </small>
                        )}
                      </span>
                    </div>
                  ),
                )}
              </div>
            </>
          )}
        </>
      )}

      {showSortNames &&
        (records.length > 0 || inheritedRecords.length > 0) && (
        <details
          className="metadata-related-tags performer-related-tags"
          open={relatedOpen}
          onToggle={onRelatedToggle}
        >
          <summary>
            <span
              className="metadata-section-triangle"
              aria-hidden="true"
            />
            <span>Related tags</span>
          </summary>

          <div className="performer-sort-name-list">
            <header>
              <strong>Writer sort names</strong>
              <MetadataFieldControls
                field={sortNameField}
                path={`${basePath}.songwriters[].sort_name`}
                valueType="string"
              />
            </header>

            {editMode
              ? records.map((record, recordIndex) => (
                  <label key={record.key}>
                    <span>
                      {record.name ||
                        `Writing credit ${recordIndex + 1}`}
                    </span>
                    <input
                      type="text"
                      value={record.sortName}
                      placeholder="Last, First"
                      onChange={(event) =>
                        updateRecord(recordIndex, {
                          sortName: event.target.value,
                        })
                      }
                    />
                  </label>
                ))
              : [
                  ...groupedLocalRecords.map((record) => ({
                    record,
                    inherited: false,
                  })),
                  ...groupedInheritedRecords.map((record) => ({
                    record,
                    inherited: true,
                  })),
                ]
                  .filter(
                    ({ record }) => record.sortNames.length > 0,
                  )
                  .map(({ record, inherited }) => (
                    <label key={`${inherited ? "inherited" : "local"}:${record.key}`}>
                      <span>
                        {record.name || "(name not entered)"}
                        {inherited ? " · inherited" : ""}
                      </span>
                      <span>{record.sortNames.join(", ")}</span>
                    </label>
                  ))}
          </div>
        </details>
      )}
    </div>
  );
}



function ArrangementCreditRecordEditor({
  document,
  records,
  inheritedRecords = [],
  releaseDefaultRecords = [],
  editMode,
  metadataRegistry,
  relatedOpen,
  onRelatedToggle,
  onChange,
}: {
  document: ParsedMetadataDocument;
  records: PerformerRecordDraft[];
  inheritedRecords?: PerformerRecordDraft[];
  releaseDefaultRecords?: PerformerRecordDraft[];
  editMode: boolean;
  metadataRegistry: MetadataFieldDefinition[];
  relatedOpen: boolean;
  onRelatedToggle: (
    event: React.SyntheticEvent<
      HTMLDetailsElement
    >,
  ) => void;
  onChange: (
    records: PerformerRecordDraft[],
  ) => void;
}) {
  const contributorPath =
    getArrangementContributorPath(
      document,
    );
  const indexedContributorPath =
    contributorPath.replace(
      ".contributors",
      ".contributors[0]",
    );
  const genericContributorPath =
    contributorPath.replace(
      ".contributors",
      ".contributors[]",
    );
  const nameField =
    findRegisteredMetadataField(
      metadataRegistry,
      `${indexedContributorPath}.name`,
    );
  const roleField =
    findRegisteredMetadataField(
      metadataRegistry,
      `${indexedContributorPath}.role`,
    );
  const sortNameField =
    findRegisteredMetadataField(
      metadataRegistry,
      `${indexedContributorPath}.sort_name`,
    );
  const contributorRoleOptions =
    roleField?.editor?.options ??
    roleField?.presentation?.commonValues ??
    [];
  const arrangementRoleOptions =
    contributorRoleOptions.filter(
      isArrangementContributorRoleValue,
    );
  const isReleaseCreditEditor =
    document.scope === "release";

  const updateRecord = (
    recordIndex: number,
    updates: Partial<
      Pick<
        PerformerRecordDraft,
        "name" | "role" | "sortName"
      >
    >,
  ) => {
    onChange(
      records.map((record, index) =>
        index === recordIndex
          ? {
              ...record,
              ...updates,
            }
          : record,
      ),
    );
  };

  const addRecord = (
    initial?: Partial<
      Pick<
        PerformerRecordDraft,
        "name" | "role" | "sortName"
      >
    >,
  ) => {
    if (records.length >= 500) {
      return;
    }

    onChange([
      ...records,
      {
        key: [
          "new-arrangement",
          document.scope,
          Date.now(),
          records.length,
        ].join("-"),
        sourceIndex: null,
        name: initial?.name ?? "",
        role: initial?.role ?? "",
        sortName:
          initial?.sortName ?? "",
      },
    ]);
  };

  const removeRecord = (
    recordIndex: number,
  ) => {
    const record = records[recordIndex];

    if (!record) {
      return;
    }

    const hasContent = [
      record.name,
      record.role,
      record.sortName,
    ].some(
      (value) =>
        value.trim().length > 0,
    );

    if (
      hasContent &&
      !window.confirm(
        `Remove arrangement credit ${
          record.name.trim() ||
          recordIndex + 1
        } and the paired role?`,
      )
    ) {
      return;
    }

    onChange(
      records.filter(
        (_, index) =>
          index !== recordIndex,
      ),
    );
  };

  const restoreReleaseRole = (
    role: string,
  ) => {
    const overrideKey =
      arrangementCreditOverrideKey(role);
    const matchingCount = records.filter(
      (record) =>
        arrangementCreditOverrideKey(
          record.role,
        ) === overrideKey,
    ).length;

    if (
      matchingCount > 0 &&
      !window.confirm(
        `Remove ${matchingCount} track-level ${
          matchingCount === 1
            ? "credit"
            : "credits"
        } for “${role}” and use the release default?`,
      )
    ) {
      return;
    }

    onChange(
      records.filter(
        (record) =>
          arrangementCreditOverrideKey(
            record.role,
          ) !== overrideKey,
      ),
    );
  };

  const groupedLocalRecords =
    groupPersonRoleDisplayRecords(
      sortArrangementCreditDisplayRecords(
        records.map((record) => ({
          key: record.key,
          name: record.name,
          role: record.role,
          sortName: record.sortName,
        })),
      ),
    );
  const groupedInheritedRecords =
    groupPersonRoleDisplayRecords(
      sortArrangementCreditDisplayRecords(
        inheritedRecords.map((record) => ({
          key: record.key,
          name: record.name,
          role: record.role,
          sortName: record.sortName,
        })),
      ),
    );
  const readOnlyGroupedRecords = [
    ...groupedLocalRecords.map(
      (record, sourceIndex) => ({
        record,
        inherited: false,
        sourceIndex,
      }),
    ),
    ...groupedInheritedRecords.map(
      (record, sourceIndex) => ({
        record,
        inherited: true,
        sourceIndex:
          groupedLocalRecords.length +
          sourceIndex,
      }),
    ),
  ].sort((left, right) => {
    const priorityDifference =
      getArrangementCreditDisplayPriority(
        left.record.roles[0] ?? "",
      ) -
      getArrangementCreditDisplayPriority(
        right.record.roles[0] ?? "",
      );

    return priorityDifference !== 0
      ? priorityDifference
      : left.sourceIndex - right.sourceIndex;
  });
  const showSortNames = editMode
    ? records.some(
        (record) =>
          record.sortName.trim(),
      ) || records.length > 0
    : [
        ...groupedLocalRecords,
        ...groupedInheritedRecords,
      ].some(
        (record) =>
          record.sortNames.length > 0,
      );
  const incompleteCount = records.filter(
    (record) =>
      !record.name.trim() ||
      !record.role.trim(),
  ).length;
  const releaseOverrideKeys = new Set(
    releaseDefaultRecords.map((record) =>
      arrangementCreditOverrideKey(
        record.role,
      ),
    ),
  );

  const renderReadOnlyRecord = (
    record: GroupedPersonRoleDisplay,
    inherited: boolean,
  ) => (
    <div
      key={`${
        inherited ? "inherited" : "local"
      }:${record.key}`}
      className="performer-record-row is-read-only is-grouped-display"
    >
      <span>
        {record.roles.length > 0
          ? record.roles.join(", ")
          : "(role not entered)"}
      </span>
      <span>
        {record.name ||
          "(name not entered)"}
        {inherited && (
          <small className="metadata-provenance-note metadata-inherited-note technical-credit-inherited-note">
            Inherited from release
          </small>
        )}
      </span>
    </div>
  );

  return (
    <div className="performer-record-editor arrangement-credit-record-editor">
      <div className="performer-record-toolbar">
        <div>
          <div className="credit-pair-help-heading">
            <strong>
              {isReleaseCreditEditor
                ? "Release arrangement & orchestration role and name"
                : "Arrangement & orchestration role and name"}
            </strong>
            <MetadataFieldPairControls
              title={
                isReleaseCreditEditor
                  ? "Release arrangement & orchestration role and name"
                  : "Arrangement & orchestration role and name"
              }
              description={
                isReleaseCreditEditor
                  ? "Release arrangement and orchestration credits become defaults for every track. Add one record per credited person and role."
                  : "Track-level arrangement credits override matching release defaults by role. Unrelated release arrangement roles continue to inherit."
              }
              nameField={nameField}
              namePath={`${genericContributorPath}.name`}
              roleField={roleField}
              rolePath={`${genericContributorPath}.role`}
              nameGuidance="Enter the credited person's name exactly as supplied by the contributor, liner notes, or release documentation."
              roleGuidance={
                isReleaseCreditEditor
                  ? "Use one arrangement or orchestration role per record. Tracks inherit these credits until a track supplies an override for the same role family."
                  : "Use one arrangement or orchestration role per record. A track-level role replaces the matching release default while unrelated release credits remain inherited."
              }
              nameExample="Nathan Brenton"
              roleExample="string arranger"
              commonRoleValues={
                arrangementRoleOptions
              }
              fieldOrder="role-name"
            />
          </div>
          <p>
            {isReleaseCreditEditor
              ? "Set release-wide arrangement defaults, then tailor only the tracks that differ."
              : "Track arrangement credits override matching release defaults; all other release arrangement credits remain inherited."}
          </p>

          {editMode &&
            incompleteCount > 0 && (
            <p className="performer-validation-message">
              {incompleteCount} incomplete{" "}
              {incompleteCount === 1
                ? "record needs"
                : "records need"}{" "}
              both a name and role before saving.
            </p>
          )}
        </div>

        {editMode && (
          <button
            type="button"
            className="performer-add-button"
            disabled={records.length >= 500}
            onClick={() => addRecord()}
          >
            <span aria-hidden="true">+</span>
            <span>Add arrangement credit</span>
          </button>
        )}
      </div>

      {editMode ? (
        <>
          {records.length === 0 ? (
            <div className="performer-empty-state">
              <p>
                {isReleaseCreditEditor
                  ? "No release-level arrangement or orchestration credits have been added."
                  : inheritedRecords.length > 0
                    ? "This track currently uses all release-level arrangement defaults."
                    : "No arrangement or orchestration credits have been added."}
              </p>

              <button
                type="button"
                className="performer-add-button"
                onClick={() => addRecord()}
              >
                <span aria-hidden="true">+</span>
                <span>
                  {isReleaseCreditEditor
                    ? "Add first release credit"
                    : "Add track override"}
                </span>
              </button>
            </div>
          ) : (
            <>
              <div className="performer-record-column-headings">
                <div>
                  <strong>
                    Arrangement or orchestration role
                  </strong>
                </div>
                <div><strong>Name</strong></div>
                <span className="sr-only">
                  Record actions
                </span>
              </div>

              <div className="performer-record-list">
                {records.map(
                  (record, recordIndex) => {
                    const canRestoreRelease =
                      !isReleaseCreditEditor &&
                      releaseOverrideKeys.has(
                        arrangementCreditOverrideKey(
                          record.role,
                        ),
                      );

                    return (
                      <div
                        key={record.key}
                        className={[
                          "performer-record-row",
                          !record.name.trim() ||
                          !record.role.trim()
                            ? "is-incomplete"
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        <label>
                          <span className="sr-only">
                            Arrangement credit {recordIndex + 1} role
                          </span>
                          <SelectOrCustomMetadataInput
                            value={record.role}
                            options={
                              arrangementRoleOptions
                            }
                            selectLabel={`Select arrangement credit ${recordIndex + 1} role`}
                            customPlaceholder="Custom arrangement or orchestration role"
                            ariaInvalid={!record.role.trim()}
                            onChange={(nextRole) =>
                              updateRecord(
                                recordIndex,
                                { role: nextRole },
                              )
                            }
                          />
                        </label>

                        <label>
                          <span className="sr-only">
                            Arrangement credit {recordIndex + 1} name
                          </span>
                          <input
                            type="text"
                            value={record.name}
                            aria-invalid={!record.name.trim()}
                            placeholder="Credited person"
                            onChange={(event) =>
                              updateRecord(
                                recordIndex,
                                {
                                  name: event.target.value,
                                },
                              )
                            }
                          />
                        </label>

                        <div className="technical-credit-record-actions">
                          {canRestoreRelease && (
                            <button
                              type="button"
                              className="technical-credit-use-release-button"
                              title="Remove track override and restore the release arrangement credit"
                              onClick={() =>
                                restoreReleaseRole(
                                  record.role,
                                )
                              }
                            >
                              Use release credit
                            </button>
                          )}

                          <button
                            type="button"
                            className="performer-remove-button"
                            aria-label={`Remove arrangement credit ${recordIndex + 1}`}
                            title="Remove credited person and role"
                            onClick={() =>
                              removeRecord(recordIndex)
                            }
                          >
                            <span aria-hidden="true">−</span>
                          </button>
                        </div>
                      </div>
                    );
                  },
                )}
              </div>
            </>
          )}

          {!isReleaseCreditEditor &&
            inheritedRecords.length > 0 && (
            <section className="inherited-technical-credit-list">
              <header>
                <div>
                  <strong>Inherited release defaults</strong>
                  <p>
                    Override only the arrangement roles that differ on this track.
                  </p>
                </div>
              </header>

              {sortArrangementCreditDisplayRecords(
                inheritedRecords,
              ).map((record) => (
                <div
                  key={record.key}
                  className="inherited-technical-credit-row"
                >
                  <span>{record.role}</span>
                  <span>{record.name}</span>
                  <button
                    type="button"
                    onClick={() =>
                      addRecord({
                        name: record.name,
                        role: record.role,
                        sortName: record.sortName,
                      })
                    }
                  >
                    Override
                  </button>
                </div>
              ))}
            </section>
          )}
        </>
      ) : (
        <>
          {readOnlyGroupedRecords.length === 0 ? (
            <div className="performer-empty-state">
              <p>
                No arrangement or orchestration credits have been added.
              </p>
            </div>
          ) : (
            <>
              <div className="performer-record-column-headings is-read-only">
                <div>
                  <strong>
                    Arrangement or orchestration role
                  </strong>
                </div>
                <div><strong>Name</strong></div>
              </div>
              <div className="performer-record-list">
                {readOnlyGroupedRecords.map(
                  ({ record, inherited }) =>
                    renderReadOnlyRecord(
                      record,
                      inherited,
                    ),
                )}
              </div>
            </>
          )}
        </>
      )}

      {showSortNames &&
        records.length > 0 && (
        <details
          className="metadata-related-tags performer-related-tags"
          open={relatedOpen}
          onToggle={onRelatedToggle}
        >
          <summary>
            <span
              className="metadata-section-triangle"
              aria-hidden="true"
            />
            <span>Related tags</span>
          </summary>

          <div className="performer-sort-name-list">
            <header>
              <strong>
                Contributor sort names
              </strong>
              <MetadataFieldControls
                field={sortNameField}
                path={`${genericContributorPath}.sort_name`}
                valueType="string"
              />
            </header>

            {editMode
              ? records.map(
                  (record, recordIndex) => (
                    <label key={record.key}>
                      <span>
                        {record.name ||
                          `Arrangement credit ${recordIndex + 1}`}
                      </span>

                      <input
                        type="text"
                        value={record.sortName}
                        placeholder="Last, First"
                        onChange={(event) =>
                          updateRecord(
                            recordIndex,
                            {
                              sortName:
                                event.target.value,
                            },
                          )
                        }
                      />
                    </label>
                  ),
                )
              : groupedLocalRecords
                  .filter(
                    (record) =>
                      record.sortNames.length > 0,
                  )
                  .map((record) => (
                    <label key={record.key}>
                      <span>
                        {record.name ||
                          "(name not entered)"}
                      </span>
                      <span>
                        {record.sortNames.join(", ")}
                      </span>
                    </label>
                  ))}
          </div>
        </details>
      )}
    </div>
  );
}

function TechnicalCreditRecordEditor({
  document,
  records,
  inheritedRecords = [],
  releaseDefaultRecords = [],
  editMode,
  metadataRegistry,
  relatedOpen,
  onRelatedToggle,
  onChange,
}: {
  document: ParsedMetadataDocument;
  records: PerformerRecordDraft[];
  inheritedRecords?: PerformerRecordDraft[];
  releaseDefaultRecords?: PerformerRecordDraft[];
  editMode: boolean;
  metadataRegistry: MetadataFieldDefinition[];
  relatedOpen: boolean;
  onRelatedToggle: (
    event: React.SyntheticEvent<
      HTMLDetailsElement
    >,
  ) => void;
  onChange: (
    records: PerformerRecordDraft[],
  ) => void;
}) {
  const contributorPath =
    getTechnicalContributorPath(
      document,
    );
  const indexedContributorPath =
    contributorPath.replace(
      ".contributors",
      ".contributors[0]",
    );
  const genericContributorPath =
    contributorPath.replace(
      ".contributors",
      ".contributors[]",
    );
  const nameField =
    findRegisteredMetadataField(
      metadataRegistry,
      `${indexedContributorPath}.name`,
    );
  const roleField =
    findRegisteredMetadataField(
      metadataRegistry,
      `${indexedContributorPath}.role`,
    );
  const sortNameField =
    findRegisteredMetadataField(
      metadataRegistry,
      `${indexedContributorPath}.sort_name`,
    );
  const contributorRoleOptions =
    roleField?.editor?.options ??
    roleField?.presentation?.commonValues ??
    [];
  const technicalRoleOptions =
    contributorRoleOptions.filter(
      isTechnicalContributorRoleValue,
    );
  const isReleaseCreditEditor =
    document.scope === "release";

  const updateRecord = (
    recordIndex: number,
    updates: Partial<
      Pick<
        PerformerRecordDraft,
        "name" | "role" | "sortName"
      >
    >,
  ) => {
    onChange(
      records.map(
        (record, index) =>
          index === recordIndex
            ? {
                ...record,
                ...updates,
              }
            : record,
      ),
    );
  };

  const addRecord = (
    initial?: Partial<
      Pick<
        PerformerRecordDraft,
        "name" | "role" | "sortName"
      >
    >,
  ) => {
    if (records.length >= 500) {
      return;
    }

    onChange([
      ...records,
      {
        key: [
          "new-technical",
          document.scope,
          Date.now(),
          records.length,
        ].join("-"),
        sourceIndex: null,
        name: initial?.name ?? "",
        role: initial?.role ?? "",
        sortName:
          initial?.sortName ?? "",
      },
    ]);
  };

  const removeRecord = (
    recordIndex: number,
  ) => {
    const record =
      records[recordIndex];

    if (!record) {
      return;
    }

    const hasContent = [
      record.name,
      record.role,
      record.sortName,
    ].some(
      (value) =>
        value.trim().length > 0,
    );

    if (
      hasContent &&
      !window.confirm(
        `Remove technical credit ${
          record.name.trim() ||
          recordIndex + 1
        } and the paired role?`,
      )
    ) {
      return;
    }

    onChange(
      records.filter(
        (_, index) =>
          index !== recordIndex,
      ),
    );
  };

  const restoreReleaseRole = (
    role: string,
  ) => {
    const overrideKey =
      technicalCreditOverrideKey(role);
    const matchingCount =
      records.filter(
        (record) =>
          technicalCreditOverrideKey(
            record.role,
          ) === overrideKey,
      ).length;

    if (
      matchingCount > 0 &&
      !window.confirm(
        `Remove ${matchingCount} track-level ${
          matchingCount === 1
            ? "credit"
            : "credits"
        } for “${role}” and use the release default?`,
      )
    ) {
      return;
    }

    onChange(
      records.filter(
        (record) =>
          technicalCreditOverrideKey(
            record.role,
          ) !== overrideKey,
      ),
    );
  };

  const groupedLocalRecords =
    groupPersonRoleDisplayRecords(
      sortTechnicalCreditDisplayRecords(
        records.map((record) => ({
          key: record.key,
          name: record.name,
          role: record.role,
          sortName: record.sortName,
        })),
      ),
    );
  const groupedInheritedRecords =
    groupPersonRoleDisplayRecords(
      sortTechnicalCreditDisplayRecords(
        inheritedRecords.map((record) => ({
          key: record.key,
          name: record.name,
          role: record.role,
          sortName: record.sortName,
        })),
      ),
    );
  const readOnlyGroupedRecords = [
    ...groupedLocalRecords.map(
      (record, sourceIndex) => ({
        record,
        inherited: false,
        sourceIndex,
      }),
    ),
    ...groupedInheritedRecords.map(
      (record, sourceIndex) => ({
        record,
        inherited: true,
        sourceIndex:
          groupedLocalRecords.length +
          sourceIndex,
      }),
    ),
  ].sort((left, right) => {
    const priorityDifference =
      getTechnicalCreditDisplayPriority(
        left.record.roles[0] ?? "",
      ) -
      getTechnicalCreditDisplayPriority(
        right.record.roles[0] ?? "",
      );

    return priorityDifference !== 0
      ? priorityDifference
      : left.sourceIndex - right.sourceIndex;
  });
  const showSortNames =
    editMode
      ? records.some(
          (record) =>
            record.sortName.trim(),
        ) || records.length > 0
      : [
          ...groupedLocalRecords,
          ...groupedInheritedRecords,
        ].some(
          (record) =>
            record.sortNames.length > 0,
        );
  const incompleteCount =
    records.filter(
      (record) =>
        !record.name.trim() ||
        !record.role.trim(),
    ).length;
  const releaseOverrideKeys =
    new Set(
      releaseDefaultRecords.map((record) =>
        technicalCreditOverrideKey(
          record.role,
        ),
      ),
    );

  const renderReadOnlyRecord = (
    record: GroupedPersonRoleDisplay,
    inherited: boolean,
  ) => (
    <div
      key={`${inherited ? "inherited" : "local"}:${record.key}`}
      className="performer-record-row is-read-only is-grouped-display"
    >
      <span>
        {record.roles.length > 0
          ? record.roles.join(", ")
          : "(role not entered)"}
      </span>
      <span>
        {record.name ||
          "(name not entered)"}
        {inherited && (
          <small className="metadata-provenance-note metadata-inherited-note technical-credit-inherited-note">
            Inherited from release
          </small>
        )}
      </span>
    </div>
  );

  return (
    <div className="performer-record-editor technical-credit-record-editor">
      <div className="performer-record-toolbar">
        <div>
          <div className="credit-pair-help-heading">
            <strong>
              {isReleaseCreditEditor
                ? "Release technical credit role and name"
                : "Technical credit role and name"}
            </strong>
            <MetadataFieldPairControls
              title={
                isReleaseCreditEditor
                  ? "Release technical credit role and name"
                  : "Technical credit role and name"
              }
              description={
                isReleaseCreditEditor
                  ? "Release-level recording, mixing, and mastering credits become defaults for every track. Add one record per credited person and role."
                  : "Track-level technical credits override matching release defaults by role. Unrelated release roles continue to inherit."
              }
              nameField={nameField}
              namePath={`${genericContributorPath}.name`}
              roleField={roleField}
              rolePath={`${genericContributorPath}.role`}
              nameGuidance="Enter the credited person's name exactly as supplied by the contributor, liner notes, or release documentation."
              roleGuidance={
                isReleaseCreditEditor
                  ? "Use one recording, mixing, or mastering role per record. These credits are inherited by tracks until a track supplies an override for the same role."
                  : "Use one recording, mixing, or mastering role per record. A track-level role replaces the matching release default while other release credits remain inherited."
              }
              nameExample="Nathan Brenton"
              roleExample="recorded by"
              commonRoleValues={technicalRoleOptions}
              fieldOrder="role-name"
            />
          </div>
          <p>
            {isReleaseCreditEditor
              ? "Set release-wide defaults, then tailor only the tracks that differ."
              : "Track credits override matching release defaults; all other release credits remain inherited."}
          </p>

          {editMode &&
            incompleteCount > 0 && (
            <p className="performer-validation-message">
              {incompleteCount} incomplete{" "}
              {incompleteCount === 1
                ? "record needs"
                : "records need"}{" "}
              both a name and role before saving.
            </p>
          )}
        </div>

        {editMode && (
          <button
            type="button"
            className="performer-add-button"
            disabled={records.length >= 500}
            onClick={() => addRecord()}
          >
            <span aria-hidden="true">+</span>
            <span>Add technical credit</span>
          </button>
        )}
      </div>

      {editMode ? (
        <>
          {records.length === 0 ? (
            <div className="performer-empty-state">
              <p>
                {isReleaseCreditEditor
                  ? "No release-level recording, mixing, or mastering credits have been added."
                  : inheritedRecords.length > 0
                    ? "This track currently uses all release-level technical-credit defaults."
                    : "No recording, mixing, or mastering credits have been added."}
              </p>

              <button
                type="button"
                className="performer-add-button"
                onClick={() => addRecord()}
              >
                <span aria-hidden="true">+</span>
                <span>
                  {isReleaseCreditEditor
                    ? "Add first release credit"
                    : "Add track override"}
                </span>
              </button>
            </div>
          ) : (
            <>
              <div className="performer-record-column-headings">
                <div>
                  <strong>
                    Recording, mixing or mastering role
                  </strong>
                </div>
                <div><strong>Name</strong></div>
                <span className="sr-only">
                  Record actions
                </span>
              </div>

              <div className="performer-record-list">
                {records.map(
                  (record, recordIndex) => {
                    const canRestoreRelease =
                      !isReleaseCreditEditor &&
                      releaseOverrideKeys.has(
                        technicalCreditOverrideKey(
                          record.role,
                        ),
                      );

                    return (
                      <div
                        key={record.key}
                        className={[
                          "performer-record-row",
                          !record.name.trim() ||
                          !record.role.trim()
                            ? "is-incomplete"
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        <label>
                          <span className="sr-only">
                            Technical credit {recordIndex + 1} role
                          </span>
                          <SelectOrCustomMetadataInput
                            value={record.role}
                            options={technicalRoleOptions}
                            selectLabel={`Select technical credit ${recordIndex + 1} role`}
                            customPlaceholder="Custom recording, mixing, or mastering role"
                            ariaInvalid={!record.role.trim()}
                            onChange={(nextRole) =>
                              updateRecord(
                                recordIndex,
                                { role: nextRole },
                              )
                            }
                          />
                        </label>

                        <label>
                          <span className="sr-only">
                            Technical credit {recordIndex + 1} name
                          </span>
                          <input
                            type="text"
                            value={record.name}
                            aria-invalid={!record.name.trim()}
                            placeholder="Credited person"
                            onChange={(event) =>
                              updateRecord(
                                recordIndex,
                                { name: event.target.value },
                              )
                            }
                          />
                        </label>

                        <div className="technical-credit-record-actions">
                          {canRestoreRelease && (
                            <button
                              type="button"
                              className="technical-credit-use-release-button"
                              title="Remove track override and restore the release credit"
                              onClick={() =>
                                restoreReleaseRole(
                                  record.role,
                                )
                              }
                            >
                              Use release credit
                            </button>
                          )}

                          <button
                            type="button"
                            className="performer-remove-button"
                            aria-label={`Remove technical credit ${recordIndex + 1}`}
                            title="Remove credited person and role"
                            onClick={() =>
                              removeRecord(recordIndex)
                            }
                          >
                            <span aria-hidden="true">−</span>
                          </button>
                        </div>
                      </div>
                    );
                  },
                )}
              </div>
            </>
          )}

          {!isReleaseCreditEditor &&
            inheritedRecords.length > 0 && (
            <section className="inherited-technical-credit-list">
              <header>
                <div>
                  <strong>Inherited release defaults</strong>
                  <p>
                    Override only the roles that differ on this track.
                  </p>
                </div>
              </header>

              {sortTechnicalCreditDisplayRecords(
                inheritedRecords,
              ).map((record, index) => (
                  <div
                    key={record.key}
                    className="inherited-technical-credit-row"
                  >
                    <span>{record.role}</span>
                    <span>{record.name}</span>
                    <button
                      type="button"
                      onClick={() =>
                        addRecord({
                          name: record.name,
                          role: record.role,
                          sortName: record.sortName,
                        })
                      }
                    >
                      Override
                    </button>
                  </div>
                ),
              )}
            </section>
          )}
        </>
      ) : (
        <>
          {readOnlyGroupedRecords.length === 0 ? (
            <div className="performer-empty-state">
              <p>
                No recording, mixing, or mastering credits have been added.
              </p>
            </div>
          ) : (
            <>
              <div className="performer-record-column-headings is-read-only">
                <div>
                  <strong>
                    Recording, mixing or mastering role
                  </strong>
                </div>
                <div><strong>Name</strong></div>
              </div>
              <div className="performer-record-list">
                {readOnlyGroupedRecords.map(
                  ({ record, inherited }) =>
                    renderReadOnlyRecord(
                      record,
                      inherited,
                    ),
                )}
              </div>
            </>
          )}
        </>
      )}

      {showSortNames &&
        records.length > 0 && (
        <details
          className="metadata-related-tags performer-related-tags"
          open={relatedOpen}
          onToggle={onRelatedToggle}
        >
          <summary>
            <span
              className="metadata-section-triangle"
              aria-hidden="true"
            />
            <span>Related tags</span>
          </summary>

          <div className="performer-sort-name-list">
            <header>
              <strong>
                Contributor sort names
              </strong>
              <MetadataFieldControls
                field={sortNameField}
                path={`${genericContributorPath}.sort_name`}
                valueType="string"
              />
            </header>

            {editMode
              ? records.map(
                  (record, recordIndex) => (
                    <label key={record.key}>
                      <span>
                        {record.name ||
                          `Technical credit ${recordIndex + 1}`}
                      </span>

                      <input
                        type="text"
                        value={record.sortName}
                        placeholder="Last, First"
                        onChange={(event) =>
                          updateRecord(
                            recordIndex,
                            {
                              sortName:
                                event.target.value,
                            },
                          )
                        }
                      />
                    </label>
                  ),
                )
              : groupedLocalRecords
                  .filter(
                    (record) =>
                      record.sortNames.length > 0,
                  )
                  .map((record) => (
                    <label key={record.key}>
                      <span>
                        {record.name ||
                          "(name not entered)"}
                      </span>
                      <span>
                        {record.sortNames.join(", ")}
                      </span>
                    </label>
                  ))}
          </div>
        </details>
      )}
    </div>
  );
}

function MetadataDocumentTable({
  document,
  releaseDocuments,
  editMode,
  canFinishEditing,
  onBeginEdit,
  onDoneEditing,
  draft,
  performerDraft,
  technicalCreditDraft,
  arrangementCreditDraft,
  writingCreditDraft,
  sampleRelationshipDraft,
  sampleClearanceDraft,
  onDraftValueChange,
  onPerformerDraftChange,
  onTechnicalCreditDraftChange,
  onArrangementCreditDraftChange,
  onWritingCreditDraftChange,
  onSampleRelationshipDraftChange,
  onSampleClearanceDraftChange,
  onCopyPerformerCredits,
  metadataRegistry,
  activeMetadataTab,
  saving,
  addingFields,
  removingFieldKey,
  onSave,
  onAddFields,
  onRemoveField,
}: {
  document: ParsedMetadataDocument;
  releaseDocuments: ParsedMetadataDocument[];
  editMode: boolean;
  canFinishEditing: boolean;
  onBeginEdit: () => void;
  onDoneEditing: () => void;
  draft: MetadataDraft;
  performerDraft:
    | PerformerRecordDraft[]
    | undefined;
  technicalCreditDraft:
    | PerformerRecordDraft[]
    | undefined;
  arrangementCreditDraft:
    | PerformerRecordDraft[]
    | undefined;
  writingCreditDraft:
    | WritingCreditRecordDraft[]
    | undefined;
  sampleRelationshipDraft:
    | SampleRelationshipRecordDraft[]
    | undefined;
  sampleClearanceDraft:
    | SampleClearanceRecordDraft[]
    | undefined;
  onDraftValueChange: (
    document: ParsedMetadataDocument,
    metadataPath: string,
    originalValue: EditableMetadataValue,
    nextValue: EditableMetadataValue,
  ) => void;
  onPerformerDraftChange: (
    records: PerformerRecordDraft[],
  ) => void;
  onTechnicalCreditDraftChange: (
    records: PerformerRecordDraft[],
  ) => void;
  onArrangementCreditDraftChange: (
    records: PerformerRecordDraft[],
  ) => void;
  onWritingCreditDraftChange: (
    records: WritingCreditRecordDraft[],
  ) => void;
  onSampleRelationshipDraftChange: (
    records: SampleRelationshipRecordDraft[],
  ) => void;
  onSampleClearanceDraftChange: (
    records: SampleClearanceRecordDraft[],
  ) => void;
  onCopyPerformerCredits: (
    records: PerformerRecordDraft[],
  ) => void;
  metadataRegistry: MetadataFieldDefinition[];
  activeMetadataTab: ReleaseMetadataTab;
  saving: boolean;
  addingFields: boolean;
  removingFieldKey: string | null;
  onSave: () => void;
  onAddFields: (
    document: ParsedMetadataDocument,
    fields: MetadataFieldDefinition[],
  ) => void;
  onRemoveField: (
    document: ParsedMetadataDocument,
    field: MetadataFieldDefinition,
  ) => void;
}) {
  const documentMetadataRegistry =
    buildDocumentMetadataRegistry(
      document,
      metadataRegistry,
    );
  const rows = filterPresentableMetadataRows(
    flattenMetadata(document.parsed),
    documentMetadataRegistry,
  );
  const [
    selectedMissingFieldPaths,
    setSelectedMissingFieldPaths,
  ] = useState<string[]>([]);
  const [
    pendingFieldRemoval,
    setPendingFieldRemoval,
  ] = useState<{
    field: MetadataFieldDefinition;
    row: FlattenedMetadataRow;
  } | null>(null);
  const [
    performerHelpOpen,
    setPerformerHelpOpen,
  ] = useState(false);
  const metadataSectionsRef =
    useRef<HTMLDivElement>(null);
  const pendingMetadataSectionViewport =
    useRef<{
      sectionId: string;
      viewportTop: number;
    } | null>(null);

  const findMetadataSection = (
    sectionId: string,
  ): HTMLDetailsElement | null => {
    const sections =
      metadataSectionsRef.current
        ?.querySelectorAll<HTMLDetailsElement>(
          "details[data-metadata-section]",
        );

    return sections
      ? Array.from(sections).find(
          (section) =>
            section.dataset.metadataSectionId ===
            sectionId,
        ) ?? null
      : null;
  };

  /*
   * Optional-field creation refreshes the canonical document. Preserve the
   * active disclosure's viewport position across both the loading render and
   * the refreshed-document render instead of relying on a fixed scroll value.
   */
  const preserveMetadataSectionViewport = (
    sectionId: string,
    action: () => void,
  ) => {
    const section =
      findMetadataSection(sectionId);

    if (section) {
      pendingMetadataSectionViewport.current = {
        sectionId,
        viewportTop:
          section.getBoundingClientRect().top,
      };
    }

    action();
  };

  useLayoutEffect(() => {
    const anchor =
      pendingMetadataSectionViewport.current;

    if (!anchor) {
      return;
    }

    const restoreViewport = () => {
      const section =
        findMetadataSection(
          anchor.sectionId,
        );

      if (!section) {
        return;
      }

      const offset =
        section.getBoundingClientRect().top -
        anchor.viewportTop;

      if (Math.abs(offset) > 0.5) {
        window.scrollBy({
          top: offset,
          left: 0,
          behavior: "auto",
        });
      }
    };

    restoreViewport();

    if (addingFields) {
      return;
    }

    const frame =
      window.requestAnimationFrame(() => {
        restoreViewport();
        pendingMetadataSectionViewport.current =
          null;
      });

    return () =>
      window.cancelAnimationFrame(frame);
  }, [addingFields, document.sha256]);

  /*
   * Each TOML document and category keeps an independent disclosure
   * map. The document path distinguishes Release from every Track,
   * while the active category keeps Overview separate from Artists,
   * Production, Raw TOML, and the other task-oriented views.
   */
  const metadataDisclosureStorageKey = [
    "metadata-editor",
    "metadata-section-state",
    "v2",
    activeMetadataTab,
  ].join(":");

  const readMetadataDisclosureState = (
    storageKey: string,
  ): Record<string, boolean> => {
    try {
      const storedValue =
        window.localStorage.getItem(
          storageKey,
        );

      if (!storedValue) {
        return {};
      }

      const parsedValue = JSON.parse(
        storedValue,
      ) as unknown;

      if (
        !parsedValue ||
        typeof parsedValue !== "object" ||
        Array.isArray(parsedValue)
      ) {
        return {};
      }

      return Object.fromEntries(
        Object.entries(parsedValue).filter(
          (
            entry,
          ): entry is [string, boolean] =>
            typeof entry[1] === "boolean",
        ),
      );
    } catch {
      return {};
    }
  };

  const [
    metadataSectionOpenState,
    setMetadataSectionOpenState,
  ] = useState<Record<string, boolean>>(
    () =>
      readMetadataDisclosureState(
        metadataDisclosureStorageKey,
      ),
  );

  useEffect(() => {
    setMetadataSectionOpenState(
      readMetadataDisclosureState(
        metadataDisclosureStorageKey,
      ),
    );
  }, [metadataDisclosureStorageKey]);

  const storeMetadataDisclosureState = (
    nextState: Record<string, boolean>,
  ) => {
    try {
      window.localStorage.setItem(
        metadataDisclosureStorageKey,
        JSON.stringify(nextState),
      );
    } catch {
      /*
       * Disclosure controls remain functional when storage is blocked
       * or unavailable; only cross-view persistence is skipped.
       */
    }
  };

  const updateMetadataSectionState = (
    sectionId: string,
    open: boolean,
  ) => {
    setMetadataSectionOpenState(
      (currentState) => {
        if (
          currentState[sectionId] === open
        ) {
          return currentState;
        }

        const nextState = {
          ...currentState,
          [sectionId]: open,
        };

        storeMetadataDisclosureState(
          nextState,
        );

        return nextState;
      },
    );
  };

  const handleMetadataSectionToggle = (
    sectionId: string,
    event: React.SyntheticEvent<
      HTMLDetailsElement
    >,
  ) => {
    updateMetadataSectionState(
      sectionId,
      event.currentTarget.open,
    );
  };

  const handleMetadataSectionClick = (
    event: React.MouseEvent<HTMLElement>,
  ) => {
    if (!event.altKey) {
      return;
    }

    event.preventDefault();

    const details =
      event.currentTarget.closest(
        "details",
      );

    if (!(details instanceof HTMLDetailsElement)) {
      return;
    }

    const shouldOpen = !details.open;
    const nextState = {
      ...metadataSectionOpenState,
    };

    metadataSectionsRef.current
      ?.querySelectorAll<HTMLDetailsElement>(
        "details[data-metadata-section]",
      )
      .forEach((section) => {
        const sectionId =
          section.dataset.metadataSectionId;

        if (sectionId) {
          nextState[sectionId] =
            shouldOpen;
        }
      });

    setMetadataSectionOpenState(
      nextState,
    );
    storeMetadataDisclosureState(
      nextState,
    );
  };

  const renderSectionEditButton = () => {
    if (editMode && !canFinishEditing) {
      // Dirty drafts keep the explicit Save/Discard controls in the status bar.
      return null;
    }

    return (
      <button
        type="button"
        className="metadata-section-edit-button"
        disabled={saving || addingFields}
        onClick={(event) => {
          // A nested button must not toggle its parent <details> disclosure.
          event.preventDefault();
          event.stopPropagation();

          if (editMode) {
            onDoneEditing();
            return;
          }

          onBeginEdit();
        }}
      >
        {editMode
          ? "Done editing"
          : "Edit metadata"}
      </button>
    );
  };

  const releaseLanguageValue =
    findMetadataValueAcrossDocuments(
      releaseDocuments,
      "release.language",
    );
  const effectiveTrackLanguage =
    document.scope === "track"
      ? resolveEffectiveTrackLanguage({
          trackLanguage:
            readDocumentDraftString(
              document,
              "track.language",
              draft,
            ),
          releaseLanguage:
            typeof releaseLanguageValue ===
            "string"
              ? releaseLanguageValue
              : "",
        }).value
      : "";

  const inheritedOnlyRows =
    buildMissingInheritedMetadataRows(
      document,
      releaseDocuments,
      documentMetadataRegistry,
      metadataStorageRoleForFilename(
        document.filename,
      ),
    );
  const inheritedOnlyPaths = new Set(
    inheritedOnlyRows.map(
      (row) => row.path,
    ),
  );

  const allGroupedRows = [
    ...rows.map(
      (row, sourceIndex) => {
        const fieldDefinition =
          findRegisteredMetadataField(
            documentMetadataRegistry,
            row.path,
          );

        return {
          row,
          fieldDefinition,
          group:
            resolveMetadataRowGroup(
              rows,
              row,
              fieldDefinition,
            ),
          sourceIndex,
          inheritedOnly: false,
        };
      },
    ),
    ...inheritedOnlyRows.map(
      (row, inheritedIndex) => {
        const fieldDefinition =
          findRegisteredMetadataField(
            documentMetadataRegistry,
            row.path,
          );

        return {
          row,
          fieldDefinition,
          group:
            resolveMetadataRowGroup(
              rows,
              row,
              fieldDefinition,
            ),
          sourceIndex:
            rows.length + inheritedIndex,
          inheritedOnly: true,
        };
      },
    ),
  ];

  const groupedRows =
    activeMetadataTab === "settings"
      ? allGroupedRows
      : allGroupedRows.filter(
          ({ row, group }) =>
            metadataRowMatchesTab(
              row.path,
              group,
              activeMetadataTab,
            ),
        );

  const existingPaths =
    new Set(
      rows.map((row) => row.path),
    );
  const allMissingCategoryFields =
    documentMetadataRegistry
      .filter(
        (field) =>
          field.scope === document.scope &&
          field.storageFileRole ===
            metadataStorageRoleForFilename(
              document.filename,
            ) &&
          !field.repeatable &&
          !field.tomlPath.includes("[]") &&
          !existingPaths.has(
            field.tomlPath,
          ) &&
          !inheritedOnlyPaths.has(
            field.tomlPath,
          ) &&
          metadataRowMatchesTab(
            field.tomlPath,
            field.presentation?.group ??
              "Developer / Advanced",
            activeMetadataTab,
          ),
      )
      .sort(
        (left, right) =>
          (
            left.presentation?.order ??
            Number.MAX_SAFE_INTEGER
          ) -
          (
            right.presentation?.order ??
            Number.MAX_SAFE_INTEGER
          ),
      );

  /*
   * Musical-analysis fields are important track metadata, so keep them
   * visible in Overview even before optional TOML paths have been created.
   */
  const showDefaultTrackOverviewFields =
    shouldShowDefaultTrackOverviewFields({
      scope: document.scope,
      filename: document.filename,
      activeTab: activeMetadataTab,
    });
  const defaultTrackOverviewMissingFields =
    showDefaultTrackOverviewFields
      ? allMissingCategoryFields.filter(
          (field) =>
            isDefaultTrackOverviewFieldPath(
              field.tomlPath,
            ),
        )
      : [];
  const defaultTrackIdentityMissingFields =
    showDefaultTrackOverviewFields
      ? allMissingCategoryFields.filter(
          (field) =>
            isDefaultTrackIdentityFieldPath(
              field.tomlPath,
            ),
        )
      : [];
  const defaultLyricsLanguageMissingFields =
    document.scope === "track" &&
    document.filename === "track.toml" &&
    activeMetadataTab === "lyrics"
      ? allMissingCategoryFields.filter(
          (field) =>
            field.tomlPath ===
              "track.text.lyrics_language",
        )
      : [];

  const showDefaultRightsFields =
    shouldShowDefaultRightsFields({
      scope: document.scope,
      filename: document.filename,
      activeTab: activeMetadataTab,
    });
  const defaultRightsMissingFields =
    showDefaultRightsFields
      ? allMissingCategoryFields.filter(
          (field) =>
            isDefaultRightsFieldPath(
              document.scope,
              field.tomlPath,
            ),
        )
      : [];

  const showDefaultProductionContextFields =
    activeMetadataTab === "recording" &&
    (
      document.filename ===
        "release-production-notes.toml" ||
      document.filename ===
        "track-production-notes.toml"
    );
  const defaultProductionContextMissingFields =
    showDefaultProductionContextFields
      ? allMissingCategoryFields.filter(
          (field) =>
            Boolean(
              findProductionContextField(
                field.tomlPath,
              ),
            ),
        )
      : [];

  const missingCategoryFields =
    allMissingCategoryFields.filter(
      (field) =>
        (
          !isDefaultTrackOverviewFieldPath(
            field.tomlPath,
          ) &&
          !isDefaultTrackIdentityFieldPath(
            field.tomlPath,
          ) &&
          field.tomlPath !==
            "track.text.lyrics_language" &&
          !(
            showDefaultRightsFields &&
            isDefaultRightsFieldPath(
              document.scope,
              field.tomlPath,
            )
          ) &&
          !(
            showDefaultProductionContextFields &&
            Boolean(
              findProductionContextField(
                field.tomlPath,
              ),
            )
          )
        ) ||
        (
          !showDefaultTrackOverviewFields &&
          activeMetadataTab !== "lyrics" &&
          !showDefaultRightsFields &&
          !showDefaultProductionContextFields
        ),
    );

  const supportsPerformerRecords =
    activeMetadataTab === "credits" &&
    (
      (
        document.scope === "track" &&
        document.filename ===
          "track-credits.toml"
      ) ||
      (
        document.scope === "release" &&
        document.filename ===
          "release.toml"
      )
    );
  const savedPerformerRecords =
    readPerformerRecords(document);
  const releasePerformerRecords =
    document.scope === "track"
      ? releaseDocuments.flatMap(
          (releaseDocument) =>
            releaseDocument.filename ===
              "release.toml"
              ? readPerformerRecords(
                  releaseDocument,
                )
              : [],
        )
      : [];
  const localPerformerRecords =
    performerDraft ??
    savedPerformerRecords;
  const effectivePerformerState =
    document.scope === "track"
      ? resolveEffectivePerformerRecords(
          releasePerformerRecords,
          localPerformerRecords,
        )
      : {
          mode: "track" as const,
          effective:
            localPerformerRecords,
        };
  const performerRecords =
    effectivePerformerState.effective;
  const performersInheritedFromRelease =
    document.scope === "track" &&
    effectivePerformerState.mode ===
      "release" &&
    releasePerformerRecords.length > 0;
  const performerBasePath =
    document.scope === "release"
      ? "release.credits.performers"
      : "track.performers";
  const performerNameField =
    findRegisteredMetadataField(
      documentMetadataRegistry,
      `${performerBasePath}[0].name`,
    );
  const performerRoleField =
    findRegisteredMetadataField(
      documentMetadataRegistry,
      `${performerBasePath}[0].role`,
    );
  const performerHelpProps: MetadataFieldPairHelpProps = {
    title: document.scope === "release"
      ? "Release performers"
      : "Track performers",
    description:
      document.scope === "release"
        ? "Set the performer baseline for the release. Tracks inherit these paired name/role records until a track creates a local performer override."
        : "Track performers inherit the release baseline while the local performer array is empty. Customize the track to remove, edit, or add individual performers.",
    nameField: performerNameField,
    namePath: `${performerBasePath}[].name`,
    roleField: performerRoleField,
    rolePath: `${performerBasePath}[].role`,
    nameGuidance:
      "Enter the performer name exactly as supplied by the artist, liner notes, or release documentation.",
    roleGuidance:
      "Enter one performed role per record. Add another record with the same name when the performer has another instrument or vocal role.",
    nameExample: "Nathan Brenton",
    roleExample: "vocals",
    commonRoleValues:
      performerRoleField?.editor?.options ??
      performerRoleField?.presentation?.commonValues ??
      [],
  };
  const releasePrimaryArtistValue =
    findMetadataValueAcrossDocuments(
      releaseDocuments,
      "release.primary_artist.name",
    );
  const releasePrimaryArtistName =
    typeof releasePrimaryArtistValue ===
    "string"
      ? releasePrimaryArtistValue
      : "";
  const supportsTechnicalCreditRecords =
    activeMetadataTab === "recording" &&
    (
      (
        document.scope === "track" &&
        document.filename ===
          "track-credits.toml"
      ) ||
      (
        document.scope === "release" &&
        document.filename ===
          "release.toml"
      )
    );
  const supportsArrangementCreditRecords =
    activeMetadataTab === "credits" &&
    (
      (
        document.scope === "track" &&
        document.filename ===
          "track-credits.toml"
      ) ||
      (
        document.scope === "release" &&
        document.filename ===
          "release.toml"
      )
    );
  const supportsWritingCreditRecords =
    activeMetadataTab === "credits" &&
    (
      (
        document.scope === "track" &&
        document.filename === "track-credits.toml"
      ) ||
      (
        document.scope === "release" &&
        document.filename === "release.toml"
      )
    );
  const supportsSampleRelationshipRecords =
    activeMetadataTab === "credits" &&
    document.scope === "track" &&
    document.filename === "track-credits.toml";
  const supportsSampleClearanceRecords =
    activeMetadataTab === "rights" &&
    document.scope === "track" &&
    document.filename === "track-credits.toml";
  const technicalCreditRecords =
    technicalCreditDraft ??
    readTechnicalCreditRecords(
      document,
    );
  const releaseTechnicalCreditRecords =
    document.scope === "track"
      ? releaseDocuments.flatMap(
          (releaseDocument) =>
            releaseDocument.filename ===
            "release.toml"
              ? readTechnicalCreditRecords(
                  releaseDocument,
                )
              : [],
        )
      : [];
  const mergedTechnicalCredits =
    document.scope === "track"
      ? mergeInheritedTechnicalCredits(
          releaseTechnicalCreditRecords,
          technicalCreditRecords,
        )
      : {
          effective:
            technicalCreditRecords,
          inherited: [] as
            PerformerRecordDraft[],
        };
  const effectiveTechnicalCreditRecords =
    mergedTechnicalCredits.effective;
  const inheritedTechnicalCreditRecords =
    mergedTechnicalCredits.inherited;
  const releaseTechnicalContributorIndexes =
    new Set(
      document.scope === "release"
        ? technicalCreditRecords.flatMap(
            (record) =>
              record.sourceIndex === null
                ? []
                : [record.sourceIndex],
          )
        : [],
    );
  const arrangementCreditRecords =
    arrangementCreditDraft ??
    readArrangementCreditRecords(
      document,
    );
  const releaseArrangementCreditRecords =
    document.scope === "track"
      ? releaseDocuments.flatMap(
          (releaseDocument) =>
            releaseDocument.filename ===
            "release.toml"
              ? readArrangementCreditRecords(
                  releaseDocument,
                )
              : [],
        )
      : [];
  const mergedArrangementCredits =
    document.scope === "track"
      ? mergeInheritedArrangementCredits(
          releaseArrangementCreditRecords,
          arrangementCreditRecords,
        )
      : {
          effective:
            arrangementCreditRecords,
          inherited: [] as
            PerformerRecordDraft[],
        };
  const effectiveArrangementCreditRecords =
    mergedArrangementCredits.effective;
  const inheritedArrangementCreditRecords =
    mergedArrangementCredits.inherited;
  const releaseArrangementContributorIndexes =
    new Set(
      document.scope === "release"
        ? arrangementCreditRecords.flatMap(
            (record) =>
              record.sourceIndex === null
                ? []
                : [record.sourceIndex],
          )
        : [],
    );
  const writingCreditRecords =
    writingCreditDraft ??
    readWritingCreditRecords(document);
  const releaseWritingCreditRecords =
    document.scope === "track"
      ? releaseDocuments.flatMap((releaseDocument) =>
          releaseDocument.filename === "release.toml"
            ? readWritingCreditRecords(releaseDocument)
            : [],
        )
      : [];
  const mergedWritingCredits =
    document.scope === "track"
      ? mergeInheritedWritingCredits(
          releaseWritingCreditRecords,
          writingCreditRecords,
        )
      : {
          effective: writingCreditRecords,
          inherited: [] as WritingCreditRecordDraft[],
        };
  const effectiveWritingCreditRecords =
    mergedWritingCredits.effective;
  const inheritedWritingCreditRecords =
    mergedWritingCredits.inherited;
  const groupedWritingCredits =
    groupPersonRoleDisplayRecords(
      sortWritingCreditDisplayRecords(
        effectiveWritingCreditRecords.map((record) => ({
          key: record.key,
          name: record.name,
          role: record.role,
          sortName: record.sortName,
          family: record.family,
        })),
      ),
    );
  const sampleRelationshipRecords =
    sampleRelationshipDraft ??
    readSampleRelationshipRecords(document);
  const sampleClearanceRecords =
    sampleClearanceDraft ??
    readSampleClearanceRecords(document);
  const groupedPerformerRecords =
    groupPersonRoleDisplayRecords(
      performerRecords.map((record) => ({
        key: record.key,
        name: record.name,
        role: record.role,
        sortName: record.sortName,
      })),
    );

  const numberingRows =
    groupedRows
      .filter(
        ({ row }) =>
          isTrackDiscNumberingPath(
            row.path,
          ) &&
          row.path !==
            "track.identifiers.discogs_track_position",
      )
      .sort(
        (left, right) =>
          (left.fieldDefinition
            ?.presentation?.order ??
            Number.MAX_SAFE_INTEGER) -
          (right.fieldDefinition
            ?.presentation?.order ??
            Number.MAX_SAFE_INTEGER),
      );

  const relatedNumberingRows =
    groupedRows.filter(
      ({ row }) =>
        row.path ===
          "track.identifiers.discogs_track_position",
    );

  const findNumberingRow = (
    path: string,
  ) =>
    numberingRows.find(
      ({ row }) => row.path === path,
    );

  const trackNumberItem =
    findNumberingRow(
      "track.numbering.track_number",
    );
  const trackTotalItem =
    findNumberingRow(
      "track.numbering.track_total",
    ) ??
    findNumberingRow(
      "release.numbering.track_total",
    );
  const discNumberItem =
    findNumberingRow(
      "track.numbering.disc_number",
    );
  const discTotalItem =
    findNumberingRow(
      "track.numbering.disc_total",
    ) ??
    findNumberingRow(
      "release.numbering.disc_total",
    );

  const isReleaseNumbering =
    document.scope === "release";

  const numberingDisplayValue = (
    item:
      | (typeof numberingRows)[number]
      | undefined,
  ): EditableMetadataValue | "—" => {
    if (!item) {
      return "—";
    }

    const draftKey = buildDocumentDraftKey(
      document,
      item.row.path,
    );

    return draft[draftKey] ?? item.row.value;
  };

  const standardRows =
    groupedRows
      .filter(
        ({ row }) =>
          !isTrackDiscNumberingPath(
            row.path,
          ),
      )
      .sort((left, right) => {
        const groupDifference =
          (metadataGroupRank.get(
            left.group as
              typeof metadataGroupOrder[number],
          ) ??
            Number.MAX_SAFE_INTEGER) -
          (metadataGroupRank.get(
            right.group as
              typeof metadataGroupOrder[number],
          ) ??
            Number.MAX_SAFE_INTEGER);

        if (groupDifference !== 0) {
          return groupDifference;
        }

        const inferPathOrder = (
          path: string,
        ): number => {
          const preferredTrackOverviewOrder =
            new Map<string, number>([
              ["track.title", 10],
              ["track.version", 20],
              ["track.subtitle", 30],
              ["track.display_title", 40],
              ["track.sort_title", 45],
              ["track.explicit", 50],
              ["track.classification.genres", 100],
              ["track.classification.styles", 110],
              ["track.classification.moods", 120],
              ["track.classification.tags", 130],
              ["track.classification.instrumental", 200],
              ["track.classification.cover", 210],
              ["track.classification.live", 220],
              ["track.classification.remix", 230],
              ["track.classification.remaster", 240],
              ["track.identifiers.isrc", 300],
              ["track.identifiers.iswc", 310],
            ]);

          const preferredOrder =
            preferredTrackOverviewOrder.get(
              path,
            );

          if (preferredOrder !== undefined) {
            return preferredOrder;
          }

          if (
            /\.name$/.test(path)
          ) {
            return 10;
          }

          if (
            /\.sort_name$/.test(path)
          ) {
            return 20;
          }

          if (
            /\.(role|type|status)$/.test(
              path,
            )
          ) {
            return 30;
          }

          if (
            /\.(label|publisher|copyright|phonographic_copyright|license)/.test(
              path,
            )
          ) {
            return 40;
          }

          if (
            /\.(recorded_start|recorded_end|original_release|release|mixed|mastered|composed|arranged|remixed|remastered)$/.test(
              path,
            )
          ) {
            return 50;
          }

          return Number.MAX_SAFE_INTEGER;
        };

        const orderDifference =
          (left.fieldDefinition
            ?.presentation?.order ??
            inferPathOrder(
              left.row.path,
            )) -
          (right.fieldDefinition
            ?.presentation?.order ??
            inferPathOrder(
              right.row.path,
            ));

        return orderDifference !== 0
          ? orderDifference
          : left.sourceIndex -
              right.sourceIndex;
      })
      .map((item, index, items) => ({
        ...item,
        startsGroup:
          index === 0 ||
          item.group !==
            items[index - 1].group,
      })); 

  const groupedArrangementCredits =
    groupPersonRoleDisplayRecords(
      sortArrangementCreditDisplayRecords(
        effectiveArrangementCreditRecords.map(
          (record) => ({
            key: record.key,
            name: record.name,
            role: record.role,
            sortName: record.sortName,
          }),
        ),
      ),
    );

  const releaseContributorRecords =
    Array.from(
      standardRows.reduce<
        Map<number, ReleaseContributorRecord>
      >((records, item) => {
        const contributorIndex =
          getReleaseContributorRecordIndex(
            item.row.path,
          );

        if (
          contributorIndex === null ||
          releaseTechnicalContributorIndexes.has(
            contributorIndex,
          ) ||
          releaseArrangementContributorIndexes.has(
            contributorIndex,
          )
        ) {
          return records;
        }

        const existing =
          records.get(contributorIndex);

        if (existing) {
          existing.rows.push(item);
        } else {
          records.set(contributorIndex, {
            index: contributorIndex,
            rows: [item],
          });
        }

        return records;
      }, new Map()),
    )
      .map(([, record]) => record)
      .sort(
        (left, right) =>
          left.index - right.index,
      );

  const groupedEngineeringCredits =
    groupPersonRoleDisplayRecords(
      effectiveTechnicalCreditRecords.map(
        (record) => ({
          key: record.key,
          name: record.name,
          role: record.role,
          sortName: record.sortName,
        }),
      ),
    );

  const standardSections =
    standardRows.reduce<
      Array<{
        group: string;
        rows: Array<
          (typeof standardRows)[number]
        >;
      }>
    >((sections, item) => {
      const current =
        sections[sections.length - 1];

      if (
        !current ||
        current.group !== item.group
      ) {
        sections.push({
          group: item.group,
          rows: [item],
        });
      } else {
        current.rows.push(item);
      }

      return sections;
    }, []);

  const visibleStandardSections =
    standardSections
      .map((section) => ({
        ...section,
        rows: section.rows.filter(
          ({ row, group }) => {
            const trackContributorIndex =
              getTrackContributorRecordIndex(
                row.path,
              );
            const releaseContributorIndex =
              getReleaseContributorRecordIndex(
                row.path,
              );

            const isManagedTechnicalContributor =
              supportsTechnicalCreditRecords &&
              (
                (
                  trackContributorIndex !== null &&
                  engineeringContributorGroups.has(
                    group,
                  )
                ) ||
                (
                  releaseContributorIndex !== null &&
                  releaseTechnicalContributorIndexes.has(
                    releaseContributorIndex,
                  )
                )
              );
            const isManagedArrangementContributor =
              supportsArrangementCreditRecords &&
              (
                (
                  trackContributorIndex !== null &&
                  group ===
                    "Arrangement & Orchestration"
                ) ||
                (
                  releaseContributorIndex !== null &&
                  releaseArrangementContributorIndexes.has(
                    releaseContributorIndex,
                  )
                )
              );
            const isManagedWritingCredit =
              supportsWritingCreditRecords &&
              /^(track|release\.credits)\.(songwriters|composers|lyricists)\[\d+\]\./.test(
                row.path,
              );
            const isManagedSampleRelationship =
              supportsSampleRelationshipRecords &&
              /^track\.samples\[\d+\]\./.test(row.path);
            const isManagedSampleClearance =
              supportsSampleClearanceRecords &&
              /^track\.sample_clearances\[\d+\]\./.test(row.path);

            return !(
              isManagedTechnicalContributor ||
              isManagedArrangementContributor ||
              isManagedWritingCredit ||
              isManagedSampleRelationship ||
              isManagedSampleClearance
            );
          },
        ),
      }))
      .filter(
        (section) =>
          section.rows.length > 0,
      );

  let displayStandardSections =
    supportsPerformerRecords &&
    !visibleStandardSections.some(
      (section) =>
        section.group ===
          "Performers",
    )
      ? [
          ...visibleStandardSections,
          {
            group: "Performers",
            rows: [],
          },
        ]
      : visibleStandardSections;

  if (
    supportsWritingCreditRecords &&
    !displayStandardSections.some(
      (section) =>
        section.group === "Songwriting & Composition",
    )
  ) {
    const writingRank =
      metadataGroupRank.get(
        "Songwriting & Composition",
      ) ?? Number.MAX_SAFE_INTEGER;
    const insertionIndex =
      displayStandardSections.findIndex(
        (section) =>
          (
            metadataGroupRank.get(
              section.group as
                typeof metadataGroupOrder[number],
            ) ?? Number.MAX_SAFE_INTEGER
          ) > writingRank,
      );
    const normalizedInsertionIndex =
      insertionIndex >= 0
        ? insertionIndex
        : displayStandardSections.length;

    displayStandardSections = [
      ...displayStandardSections.slice(
        0,
        normalizedInsertionIndex,
      ),
      {
        group: "Songwriting & Composition",
        rows: [],
      },
      ...displayStandardSections.slice(
        normalizedInsertionIndex,
      ),
    ];
  }

  if (
    supportsSampleRelationshipRecords &&
    !displayStandardSections.some(
      (section) => section.group === "Samples & Interpolations",
    )
  ) {
    const sampleRank =
      metadataGroupRank.get("Samples & Interpolations") ??
      Number.MAX_SAFE_INTEGER;
    const insertionIndex = displayStandardSections.findIndex(
      (section) =>
        (metadataGroupRank.get(
          section.group as typeof metadataGroupOrder[number],
        ) ?? Number.MAX_SAFE_INTEGER) > sampleRank,
    );
    const index = insertionIndex >= 0
      ? insertionIndex
      : displayStandardSections.length;
    displayStandardSections = [
      ...displayStandardSections.slice(0, index),
      { group: "Samples & Interpolations", rows: [] },
      ...displayStandardSections.slice(index),
    ];
  }

  if (
    supportsSampleClearanceRecords &&
    !displayStandardSections.some(
      (section) => section.group === "Sample Clearance",
    )
  ) {
    const clearanceRank =
      metadataGroupRank.get("Sample Clearance") ??
      Number.MAX_SAFE_INTEGER;
    const insertionIndex = displayStandardSections.findIndex(
      (section) =>
        (metadataGroupRank.get(
          section.group as typeof metadataGroupOrder[number],
        ) ?? Number.MAX_SAFE_INTEGER) > clearanceRank,
    );
    const index = insertionIndex >= 0
      ? insertionIndex
      : displayStandardSections.length;
    displayStandardSections = [
      ...displayStandardSections.slice(0, index),
      { group: "Sample Clearance", rows: [] },
      ...displayStandardSections.slice(index),
    ];
  }

  if (
    supportsArrangementCreditRecords &&
    !displayStandardSections.some(
      (section) =>
        section.group ===
          "Arrangement & Orchestration",
    )
  ) {
    const arrangementRank =
      metadataGroupRank.get(
        "Arrangement & Orchestration",
      ) ?? Number.MAX_SAFE_INTEGER;
    const insertionIndex =
      displayStandardSections.findIndex(
        (section) =>
          (
            metadataGroupRank.get(
              section.group as
                typeof metadataGroupOrder[number],
            ) ??
            Number.MAX_SAFE_INTEGER
          ) > arrangementRank,
      );
    const normalizedInsertionIndex =
      insertionIndex >= 0
        ? insertionIndex
        : displayStandardSections.length;

    displayStandardSections = [
      ...displayStandardSections.slice(
        0,
        normalizedInsertionIndex,
      ),
      {
        group:
          "Arrangement & Orchestration",
        rows: [],
      },
      ...displayStandardSections.slice(
        normalizedInsertionIndex,
      ),
    ];
  }

  if (
    defaultTrackOverviewMissingFields.length >
      0 &&
    !displayStandardSections.some(
      (section) =>
        section.group ===
          "Musical Analysis",
    )
  ) {
    const musicalAnalysisRank =
      metadataGroupRank.get(
        "Musical Analysis",
      ) ?? Number.MAX_SAFE_INTEGER;
    const insertionIndex =
      displayStandardSections.findIndex(
        (section) =>
          (
            metadataGroupRank.get(
              section.group as
                typeof metadataGroupOrder[number],
            ) ??
            Number.MAX_SAFE_INTEGER
          ) > musicalAnalysisRank,
      );
    const normalizedInsertionIndex =
      insertionIndex >= 0
        ? insertionIndex
        : displayStandardSections.length;

    displayStandardSections = [
      ...displayStandardSections.slice(
        0,
        normalizedInsertionIndex,
      ),
      {
        group: "Musical Analysis",
        rows: [],
      },
      ...displayStandardSections.slice(
        normalizedInsertionIndex,
      ),
    ];
  }

  if (
    defaultLyricsLanguageMissingFields.length >
      0 &&
    !displayStandardSections.some(
      (section) =>
        section.group ===
          "Language & Writing System",
    )
  ) {
    const languageGroupRank =
      metadataGroupRank.get(
        "Language & Writing System",
      ) ?? Number.MAX_SAFE_INTEGER;
    const insertionIndex =
      displayStandardSections.findIndex(
        (section) =>
          (
            metadataGroupRank.get(
              section.group as
                typeof metadataGroupOrder[number],
            ) ??
            Number.MAX_SAFE_INTEGER
          ) > languageGroupRank,
      );
    const normalizedInsertionIndex =
      insertionIndex >= 0
        ? insertionIndex
        : displayStandardSections.length;

    displayStandardSections = [
      ...displayStandardSections.slice(
        0,
        normalizedInsertionIndex,
      ),
      {
        group: "Language & Writing System",
        rows: [],
      },
      ...displayStandardSections.slice(
        normalizedInsertionIndex,
      ),
    ];
  }

  if (defaultProductionContextMissingFields.length > 0) {
    for (const group of [
      "Production",
      "Recording",
      "Editing",
    ] as const) {
      const hasMissingGroupFields =
        defaultProductionContextMissingFields.some(
          (field) =>
            field.presentation?.group === group,
        );

      if (
        !hasMissingGroupFields ||
        displayStandardSections.some(
          (section) =>
            section.group === group,
        )
      ) {
        continue;
      }

      const groupRank =
        metadataGroupRank.get(group) ??
        Number.MAX_SAFE_INTEGER;
      const insertionIndex =
        displayStandardSections.findIndex(
          (section) =>
            (
              metadataGroupRank.get(
                section.group as
                  typeof metadataGroupOrder[number],
              ) ??
              Number.MAX_SAFE_INTEGER
            ) > groupRank,
        );
      const normalizedInsertionIndex =
        insertionIndex >= 0
          ? insertionIndex
          : displayStandardSections.length;

      displayStandardSections = [
        ...displayStandardSections.slice(
          0,
          normalizedInsertionIndex,
        ),
        {
          group,
          rows: [],
        },
        ...displayStandardSections.slice(
          normalizedInsertionIndex,
        ),
      ];
    }
  }

  if (
    defaultRightsMissingFields.length > 0 &&
    !displayStandardSections.some(
      (section) =>
        section.group ===
          "Music Business & Rights",
    )
  ) {
    const rightsRank =
      metadataGroupRank.get(
        "Music Business & Rights",
      ) ?? Number.MAX_SAFE_INTEGER;
    const insertionIndex =
      displayStandardSections.findIndex(
        (section) =>
          (
            metadataGroupRank.get(
              section.group as
                typeof metadataGroupOrder[number],
            ) ??
            Number.MAX_SAFE_INTEGER
          ) > rightsRank,
      );
    const normalizedInsertionIndex =
      insertionIndex >= 0
        ? insertionIndex
        : displayStandardSections.length;

    displayStandardSections = [
      ...displayStandardSections.slice(
        0,
        normalizedInsertionIndex,
      ),
      {
        group: "Music Business & Rights",
        rows: [],
      },
      ...displayStandardSections.slice(
        normalizedInsertionIndex,
      ),
    ];
  }

  if (
    supportsTechnicalCreditRecords
  ) {
    const summarySection = {
      group: engineeringCreditSummaryGroup,
      rows: [] as Array<
        (typeof standardRows)[number]
      >,
    };
    const technicalAudioIndex =
      displayStandardSections.findIndex(
        (section) =>
          section.group ===
            "Technical Audio",
      );
    const insertionIndex =
      technicalAudioIndex >= 0
        ? technicalAudioIndex
        : displayStandardSections.length;

    displayStandardSections = [
      ...displayStandardSections.slice(
        0,
        insertionIndex,
      ),
      summarySection,
      ...displayStandardSections.slice(
        insertionIndex,
      ),
    ];
  }


  const renderMetadataRow = ({
    row,
    fieldDefinition,
    inheritedOnly,
  }: (typeof groupedRows)[number]) => {
    const inherited =
      resolveInheritedReleaseValue(
        document,
        row,
        releaseDocuments,
      );
    const artistNamePath =
      artistNamePathForSortNamePath(
        row.path,
      );
    const generatedArtistSortName =
      !inherited &&
      artistNamePath &&
      typeof row.value === "string" &&
      !row.value.trim()
        ? generateArtistSortName(
            readDocumentDraftString(
              document,
              artistNamePath,
              draft,
            ),
          ).value
        : "";

    return (
    <div
      key={row.path}
      className={[
        "metadata-table-row",
        /\[\d+\]/.test(row.path)
          ? "indexed-metadata-row"
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-metadata-path={row.path}
      tabIndex={-1}
    >
      <div className="metadata-key">
        <div className="metadata-key-heading">
          <strong>
            <MetadataFieldLabel
              label={
                fieldDefinition?.label
              }
              path={row.path}
            />
          </strong>

          <MetadataFieldControls
            field={fieldDefinition}
            path={row.path}
            valueType={row.valueType}
          />

          {editMode &&
            !inheritedOnly &&
            fieldDefinition &&
            !fieldDefinition.required &&
            fieldDefinition.tomlPath ===
              row.path &&
            !row.path.includes("[") &&
            [
              "string",
              "number",
              "boolean",
              "string-array",
            ].includes(row.valueType) && (
              <button
                type="button"
                className="metadata-field-remove-control"
                aria-label={`Remove ${fieldDefinition.label} field`}
                title={`Remove ${fieldDefinition.label} field`}
                disabled={
                  saving ||
                  addingFields ||
                  removingFieldKey !== null
                }
                onClick={() =>
                  setPendingFieldRemoval({
                    field: fieldDefinition,
                    row,
                  })
                }
              >
                {removingFieldKey ===
                buildDocumentDraftKey(
                  document,
                  fieldDefinition.tomlPath,
                )
                  ? "…"
                  : "×"}
              </button>
            )}
        </div>
      </div>

      {inheritedOnly && editMode &&
      inherited && fieldDefinition ? (
        <div className="metadata-inherited-override-field">
          <span className="metadata-value">
            <span>
              {formatMetadataValue(
                inherited.value,
              )}
            </span>
            <small
              className="metadata-provenance-note metadata-inherited-note"
              title={`Inherited from ${inherited.sourcePath}`}
            >
              Inherited from release
            </small>
          </span>

          <button
            type="button"
            className="metadata-inherited-override-button"
            disabled={saving || addingFields}
            onClick={() =>
              onAddFields(
                document,
                [fieldDefinition],
              )
            }
          >
            {addingFields
              ? "Preparing override…"
              : "Create track override"}
          </button>
        </div>
      ) : (
        <MetadataValueCell
          document={document}
          row={row}
          field={fieldDefinition}
          inheritedValue={
            inherited?.value
          }
          inheritedSourcePath={
            inherited?.sourcePath
          }
          generatedFallbackValue={
            row.path ===
              "track.text.lyrics_language"
              ? effectiveTrackLanguage
              : generatedArtistSortName ||
                  undefined
          }
          generatedFallbackNote={
            row.path ===
              "track.text.lyrics_language"
              ? "Generated from Track Language"
              : generatedArtistSortName
                ? "Generated from Artist Name"
                : undefined
          }
          editMode={editMode}
          draft={draft}
          onDraftValueChange={
            onDraftValueChange
          }
        />
      )}
    </div>
    );
  };

  const renderDefaultMissingField = (
    field: MetadataFieldDefinition,
  ) => {
    const initialValue =
      getInitialMetadataFieldValue(
        field,
        document,
        draft,
        releaseDocuments,
      );
    const generatedSortTitle =
      field.tomlPath === "track.sort_title"
        ? generateTrackSortTitle({
            title: readDocumentDraftString(
              document,
              "track.title",
              draft,
            ),
            version: readDocumentDraftString(
              document,
              "track.version",
              draft,
            ),
            displayTitle: readDocumentDraftString(
              document,
              "track.display_title",
              draft,
            ),
          })
        : null;
    const presentation =
      field.tomlPath === "track.sort_title"
        ? {
            generatedValue:
              generatedSortTitle?.value || null,
            generatedNote:
              generatedSortTitle?.source
                ? `Generated from ${generatedSortTitle.source}`
                : null,
            actionLabel: "Override Sort Title",
          }
        : field.tomlPath ===
            "track.text.lyrics_language"
          ? {
              generatedValue:
                effectiveTrackLanguage || null,
              generatedNote:
                effectiveTrackLanguage
                  ? "Generated from Track Language"
                  : null,
              actionLabel:
                effectiveTrackLanguage
                  ? "Override Lyrics Language"
                  : "Add Lyrics Language",
            }
          : getMissingTrackOverviewFieldPresentation({
              path: field.tomlPath,
              label: field.label,
              initialValue,
            });

    return (
      <div
        key={field.tomlPath}
        className="metadata-table-row metadata-default-missing-row"
      >
        <div className="metadata-key">
          <div className="metadata-key-heading">
            <strong>{field.label}</strong>

            <MetadataFieldControls
              field={field}
              path={field.tomlPath}
              valueType={field.valueType}
            />
          </div>
        </div>

        <div
          className={[
            "metadata-default-missing-value",
            presentation.generatedValue
              ? "has-derived-value"
              : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {presentation.generatedValue && (
            <span className="metadata-value metadata-derived-default-value">
              <span>{presentation.generatedValue}</span>
              <small className="metadata-provenance-note metadata-derived-note">
                {presentation.generatedNote}
              </small>
            </span>
          )}

          {editMode ? (
            <button
              type="button"
              className="metadata-default-field-add-button"
              disabled={saving || addingFields}
              onClick={() =>
                preserveMetadataSectionViewport(
                  field.presentation?.group ??
                    "Musical Analysis",
                  () =>
                    onAddFields(
                      document,
                      [field],
                    ),
                )
              }
            >
              {addingFields
                ? "Adding field…"
                : presentation.actionLabel}
            </button>
          ) : !presentation.generatedValue ? (
            <span className="metadata-default-missing-placeholder">
              (not set)
            </span>
          ) : null}
        </div>
      </div>
    );
  };

  const renderSectionPrimaryRows = (
    section: (typeof displayStandardSections)[number],
  ) => {
    const existingRows =
      section.rows.filter(
        ({ row }) =>
          !isPerformerRecordPath(
            row.path,
          ) &&
          getReleaseContributorRecordIndex(
            row.path,
          ) === null &&
          !isRelatedMetadataTagPath(
            row.path,
          ),
      );

    if (
      ["Production", "Recording", "Editing"].includes(
        section.group,
      ) &&
      defaultProductionContextMissingFields.some(
        (field) =>
          field.presentation?.group ===
            section.group,
      )
    ) {
      const missingFields =
        defaultProductionContextMissingFields.filter(
          (field) =>
            field.presentation?.group ===
              section.group,
        );

      return [
        ...existingRows.map((item) => ({
          order:
            item.fieldDefinition
              ?.presentation?.order ??
            Number.MAX_SAFE_INTEGER,
          sourceIndex: item.sourceIndex,
          content: renderMetadataRow(item),
        })),
        ...missingFields.map(
          (field, missingIndex) => ({
            order:
              field.presentation?.order ??
              Number.MAX_SAFE_INTEGER,
            sourceIndex:
              rows.length + missingIndex,
            content:
              renderDefaultMissingField(
                field,
              ),
          }),
        ),
      ]
        .sort(
          (left, right) =>
            left.order - right.order ||
            left.sourceIndex -
              right.sourceIndex,
        )
        .map(({ content }) => content);
    }

    if (
      section.group ===
        "Music Business & Rights" &&
      defaultRightsMissingFields.length > 0
    ) {
      return [
        ...existingRows.map((item) => ({
          order:
            item.fieldDefinition
              ?.presentation?.order ??
            Number.MAX_SAFE_INTEGER,
          sourceIndex: item.sourceIndex,
          content: renderMetadataRow(item),
        })),
        ...defaultRightsMissingFields.map(
          (field, missingIndex) => ({
            order:
              field.presentation?.order ??
              Number.MAX_SAFE_INTEGER,
            sourceIndex:
              rows.length + missingIndex,
            content:
              renderDefaultMissingField(
                field,
              ),
          }),
        ),
      ]
        .sort(
          (left, right) =>
            left.order - right.order ||
            left.sourceIndex -
              right.sourceIndex,
        )
        .map(({ content }) => content);
    }

    if (
      section.group ===
        "Language & Writing System" &&
      defaultLyricsLanguageMissingFields.length >
        0
    ) {
      return [
        ...existingRows.map((item) => ({
          order:
            item.fieldDefinition
              ?.presentation?.order ??
            Number.MAX_SAFE_INTEGER,
          sourceIndex: item.sourceIndex,
          content: renderMetadataRow(item),
        })),
        ...defaultLyricsLanguageMissingFields.map(
          (field, missingIndex) => ({
            order:
              field.presentation?.order ??
              Number.MAX_SAFE_INTEGER,
            sourceIndex:
              rows.length + missingIndex,
            content:
              renderDefaultMissingField(
                field,
              ),
          }),
        ),
      ]
        .sort(
          (left, right) =>
            left.order - right.order ||
            left.sourceIndex -
              right.sourceIndex,
        )
        .map(({ content }) => content);
    }

    if (
      section.group !==
      "Musical Analysis"
    ) {
      return existingRows.map(
        renderMetadataRow,
      );
    }

    /*
     * Present and missing analysis fields share one ordered slot list. A
     * verified Add operation therefore replaces its synthetic row in place.
     */
    return [
      ...existingRows.map((item) => ({
        path: item.row.path,
        content: renderMetadataRow(item),
      })),
      ...defaultTrackOverviewMissingFields.map(
        (field) => ({
          path: field.tomlPath,
          content:
            renderDefaultMissingField(
              field,
            ),
        }),
      ),
    ]
      .sort(
        (left, right) =>
          getDefaultTrackOverviewFieldOrder(
            left.path,
          ) -
          getDefaultTrackOverviewFieldOrder(
            right.path,
          ),
      )
      .map(({ content }) => content);
  };

  const documentChangeCount =
    getDocumentDraftChanges(
      document,
      draft,
    ).length +
    (performerDraft !== undefined
      ? 1
      : 0) +
    (technicalCreditDraft !==
      undefined
      ? 1
      : 0) +
    (arrangementCreditDraft !==
      undefined
      ? 1
      : 0) +
    (writingCreditDraft !== undefined
      ? 1
      : 0) +
    (sampleRelationshipDraft !== undefined
      ? 1
      : 0) +
    (sampleClearanceDraft !== undefined
      ? 1
      : 0);

  const isSettingsDocument =
    /settings/i.test(document.filename);

  if (
    activeMetadataTab === "settings" &&
    !isSettingsDocument
  ) {
    return null;
  }

  if (
    activeMetadataTab !== "raw" &&
    groupedRows.length === 0 &&
    defaultTrackOverviewMissingFields.length ===
      0 &&
    defaultTrackIdentityMissingFields.length ===
      0 &&
    defaultLyricsLanguageMissingFields.length ===
      0 &&
    !(
      editMode &&
      missingCategoryFields.length > 0
    ) &&
    !supportsPerformerRecords &&
    !supportsTechnicalCreditRecords &&
    !supportsArrangementCreditRecords &&
    !supportsWritingCreditRecords &&
    !supportsSampleRelationshipRecords &&
    !supportsSampleClearanceRecords
  ) {
    return null;
  }

  if (activeMetadataTab === "raw") {
    return (
      <article className="metadata-document-table raw-only-document">
        <header>
          <div>
            <h3>{document.filename}</h3>
            <code>{document.relativePath}</code>
          </div>
        </header>

        <pre className="raw-toml-panel">
          <code>{document.content}</code>
        </pre>
      </article>
    );
  }

  const hasIdentitySection =
    displayStandardSections.some(
      (section) =>
        section.group ===
        "Release & Track Identity",
    );
  const hasDatesSection =
    displayStandardSections.some(
      (section) =>
        section.group === "Dates",
    );

  const numberingSection =
    numberingRows.length > 0 ? (
          <details
            className="metadata-section metadata-numbering-group"
            data-metadata-section
            data-metadata-section-id="track-disc-numbering"
            open={
              metadataSectionOpenState[
                "track-disc-numbering"
              ] ?? true
            }
            onToggle={(event) =>
              handleMetadataSectionToggle(
                "track-disc-numbering",
                event,
              )
            }
          >
            <summary
              onClick={
                handleMetadataSectionClick
              }
            >
              <span
                className="metadata-section-triangle"
                aria-hidden="true"
              />

              <div>
                <div className="metadata-numbering-title">
                  <h4>
                    Track &amp; Disc Numbering
                  </h4>

                  <MetadataFieldControls
                    field={
                      trackNumberItem
                        ?.fieldDefinition ??
                      trackTotalItem
                        ?.fieldDefinition ??
                      discNumberItem
                        ?.fieldDefinition ??
                      discTotalItem
                        ?.fieldDefinition
                    }
                    path={
                      trackNumberItem?.row.path ??
                      trackTotalItem?.row.path ??
                      discNumberItem?.row.path ??
                      discTotalItem?.row.path ??
                      "track.numbering"
                    }
                    valueType={
                      trackNumberItem
                        ?.row.valueType ??
                      trackTotalItem
                        ?.row.valueType ??
                      discNumberItem
                        ?.row.valueType ??
                      discTotalItem
                        ?.row.valueType ??
                      "number"
                    }
                  />
                </div>

              </div>

              <span className="metadata-section-summary-actions">
                {!isReleaseNumbering && (
                  <span className="metadata-numbering-summary">
                    Track {String(
                      numberingDisplayValue(
                        trackNumberItem,
                      ),
                    )} of {String(
                      numberingDisplayValue(
                        trackTotalItem,
                      ),
                    )}
                    {" · "}
                    Disc {String(
                      numberingDisplayValue(
                        discNumberItem,
                      ),
                    )} of {String(
                      numberingDisplayValue(
                        discTotalItem,
                      ),
                    )}
                  </span>
                )}

                {renderSectionEditButton()}
              </span>
            </summary>

            <div className="metadata-numbering-pairs">
              <div className="metadata-numbering-pair">
                <div className="metadata-numbering-pair-label">
                  <strong>
                    {isReleaseNumbering
                      ? "Tracks"
                      : "Track"}
                  </strong>

                </div>

                <div className="metadata-numbering-fraction">
                  {!isReleaseNumbering &&
                    trackNumberItem && (
                      <MetadataValueCell
                        document={document}
                        row={
                          trackNumberItem.row
                        }
                        editMode={editMode}
                        draft={draft}
                        onDraftValueChange={
                          onDraftValueChange
                        }
                      />
                    )}

                  {!isReleaseNumbering && (
                    <span
                      className="metadata-numbering-divider"
                      aria-hidden="true"
                    >
                      /
                    </span>
                  )}

                  {trackTotalItem && (
                    <MetadataValueCell
                      document={document}
                      row={trackTotalItem.row}
                      editMode={editMode}
                      draft={draft}
                      onDraftValueChange={
                        onDraftValueChange
                      }
                    />
                  )}

                  {isReleaseNumbering && (
                    <small>total</small>
                  )}
                </div>
              </div>

              <div className="metadata-numbering-pair">
                <div className="metadata-numbering-pair-label">
                  <strong>
                    {isReleaseNumbering
                      ? "Discs"
                      : "Disc"}
                  </strong>

                </div>

                <div className="metadata-numbering-fraction">
                  {!isReleaseNumbering &&
                    discNumberItem && (
                      <MetadataValueCell
                        document={document}
                        row={discNumberItem.row}
                        editMode={editMode}
                        draft={draft}
                        onDraftValueChange={
                          onDraftValueChange
                        }
                      />
                    )}

                  {!isReleaseNumbering && (
                    <span
                      className="metadata-numbering-divider"
                      aria-hidden="true"
                    >
                      /
                    </span>
                  )}

                  {discTotalItem && (
                    <MetadataValueCell
                      document={document}
                      row={discTotalItem.row}
                      editMode={editMode}
                      draft={draft}
                      onDraftValueChange={
                        onDraftValueChange
                      }
                    />
                  )}

                  {isReleaseNumbering && (
                    <small>total</small>
                  )}
                </div>
              </div>
            </div>

            {relatedNumberingRows.length > 0 && (
              <details
                className="metadata-related-tags metadata-numbering-related-tags"
                open={
                  metadataSectionOpenState[
                    "Track & Disc Numbering:related"
                  ] ?? false
                }
                onToggle={(event) =>
                  handleMetadataSectionToggle(
                    "Track & Disc Numbering:related",
                    event,
                  )
                }
              >
                <summary>
                  <span
                    className="metadata-section-triangle"
                    aria-hidden="true"
                  />
                  <span>Related tags</span>
                </summary>

                <div className="metadata-related-tags-body">
                  {relatedNumberingRows.map(
                    renderMetadataRow,
                  )}
                </div>
              </details>
            )}
          </details>
    ) : null;

  return (
    <article
      className="metadata-document-table"
      data-metadata-document-path={document.relativePath}
      tabIndex={-1}
    >
      {editMode && (
        <header className="document-edit-actions">
          <div className="document-save-controls">
            <span
              className={
                documentChangeCount > 0
                  ? "badge preview"
                  : "badge complete"
              }
            >
              {documentChangeCount > 0
                ? `${documentChangeCount} modified`
                : "No changes"}
            </span>

            <button
              type="button"
              disabled={
                saving ||
                documentChangeCount === 0
              }
              onClick={onSave}
            >
              {saving
                ? "Saving…"
                : "Save changes"}
            </button>
          </div>
        </header>
      )}

      {editMode &&
        missingCategoryFields.length > 0 && (
        <section className="missing-metadata-fields">
          <header>
            <div>
              <span className="eyebrow">
                Add metadata fields
              </span>
              <h3>
                Available fields for this category
              </h3>
              <p>
                Select only the fields you need.
                New fields are created in{" "}
                <code>{document.filename}</code>.
              </p>
            </div>
          </header>

          <div className="missing-metadata-field-list">
            {missingCategoryFields.map(
              (field) => (
                <label
                  key={field.tomlPath}
                  className="missing-metadata-field-option"
                >
                  <input
                    type="checkbox"
                    checked={selectedMissingFieldPaths.includes(
                      field.tomlPath,
                    )}
                    onChange={(event) =>
                      setSelectedMissingFieldPaths(
                        (current) =>
                          event.target.checked
                            ? [
                                ...current,
                                field.tomlPath,
                              ]
                            : current.filter(
                                (path) =>
                                  path !==
                                  field.tomlPath,
                              ),
                      )
                    }
                  />

                  <span>
                    <strong>
                      {field.label}
                    </strong>
                    <small>
                      {field.description}
                    </small>
                  </span>
                </label>
              ),
            )}
          </div>

          <div className="missing-metadata-field-actions">
            <button
              type="button"
              disabled={
                selectedMissingFieldPaths.length === 0 ||
                addingFields ||
                saving
              }
              onClick={() =>
                onAddFields(
                  document,
                  missingCategoryFields.filter(
                    (field) =>
                      selectedMissingFieldPaths.includes(
                        field.tomlPath,
                      ),
                  ),
                )
              }
            >
              {addingFields
                ? "Adding fields…"
                : `Add selected fields (${selectedMissingFieldPaths.length})`}
            </button>
          </div>
        </section>
      )}

      <div className="metadata-table-header">
        <span>Metadata key</span>
        <span>Value</span>
      </div>

      <div
        ref={metadataSectionsRef}
        className="metadata-table-body"
      >
        {displayStandardSections.map(
          (section) => (
            <Fragment key={section.group}>
              {!hasIdentitySection &&
                section.group === "Dates" &&
                numberingSection}

              <details
              className="metadata-section"
              data-metadata-section
              data-metadata-section-id={
                section.group
              }
              open={
                metadataSectionOpenState[
                  section.group
                ] ?? true
              }
              onToggle={(event) =>
                handleMetadataSectionToggle(
                  section.group,
                  event,
                )
              }
            >
              <summary
                onClick={
                  handleMetadataSectionClick
                }
              >
                <span
                  className="metadata-section-triangle"
                  aria-hidden="true"
                />

                <span className="metadata-section-heading">
                  <strong>
                    {section.group}
                  </strong>

                  {section.group === "Performers" && (
                    <button
                      type="button"
                      className="metadata-field-control"
                      aria-label="Help and field information for Performers"
                      title="Help for Performers"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setPerformerHelpOpen(true);
                      }}
                    >
                      ?
                    </button>
                  )}
                </span>

                <span className="metadata-section-summary-actions">
                  <small>
                    {section.group ===
                    unmappedMetadataGroup
                      ? `${document.filename} · ${section.rows.length} ${
                          section.rows.length === 1
                            ? "field"
                            : "fields"
                        }`
                      : section.group ===
                    "Performers"
                      ? editMode
                        ? `${performerRecords.length} ${
                            performerRecords.length === 1
                              ? "credit"
                              : "credits"
                          }`
                        : `${groupedPerformerRecords.length} ${
                            groupedPerformerRecords.length === 1
                              ? "performer"
                              : "performers"
                          }`
                      : section.group ===
                          "Songwriting & Composition" &&
                        supportsWritingCreditRecords
                        ? editMode
                          ? `${writingCreditRecords.length} ${
                              writingCreditRecords.length === 1
                                ? "credit"
                                : "credits"
                            }`
                          : `${groupedWritingCredits.length} ${
                              groupedWritingCredits.length === 1
                                ? "person"
                                : "people"
                            }`
                      : section.group ===
                          "Samples & Interpolations" &&
                        supportsSampleRelationshipRecords
                        ? `${sampleRelationshipRecords.length} ${
                            sampleRelationshipRecords.length === 1
                              ? "source"
                              : "sources"
                          }`
                      : section.group ===
                          "Sample Clearance" &&
                        supportsSampleClearanceRecords
                        ? `${sampleClearanceRecords.length} ${
                            sampleClearanceRecords.length === 1
                              ? "record"
                              : "records"
                          }`
                      : section.group ===
                          "Arrangement & Orchestration" &&
                        supportsArrangementCreditRecords
                        ? editMode
                          ? `${arrangementCreditRecords.length} ${
                              arrangementCreditRecords.length === 1
                                ? "credit"
                                : "credits"
                            }`
                          : `${groupedArrangementCredits.length} ${
                              groupedArrangementCredits.length === 1
                                ? "person"
                                : "people"
                            }`
                      : section.group ===
                          engineeringCreditSummaryGroup
                        ? editMode
                          ? `${technicalCreditRecords.length} ${
                              technicalCreditRecords.length === 1
                                ? "credit"
                                : "credits"
                            }`
                          : `${groupedEngineeringCredits.length} ${
                              groupedEngineeringCredits.length === 1
                                ? "person"
                                : "people"
                            }`
                        : section.group ===
                            "Release & Track Identity" &&
                          defaultTrackIdentityMissingFields.length >
                            0
                          ? `${section.rows.length} of ${
                              section.rows.length +
                              defaultTrackIdentityMissingFields.length
                            } fields`
                        : section.group ===
                            "Musical Analysis" &&
                          defaultTrackOverviewMissingFields.length >
                            0
                          ? `${section.rows.length} of ${
                              section.rows.length +
                              defaultTrackOverviewMissingFields.length
                            } fields`
                        : section.group ===
                            "Language & Writing System" &&
                          defaultLyricsLanguageMissingFields.length >
                            0
                          ? `${section.rows.length} of ${
                              section.rows.length +
                              defaultLyricsLanguageMissingFields.length
                            } fields`
                        : [
                            "Production",
                            "Recording",
                            "Editing",
                          ].includes(section.group) &&
                          defaultProductionContextMissingFields.some(
                            (field) =>
                              field.presentation?.group ===
                              section.group,
                          )
                          ? `${section.rows.length} of ${
                              section.rows.length +
                              defaultProductionContextMissingFields.filter(
                                (field) =>
                                  field.presentation?.group ===
                                  section.group,
                              ).length
                            } fields`
                        : section.group ===
                            "Music Business & Rights" &&
                          defaultRightsMissingFields.length > 0
                          ? `${section.rows.length} of ${
                              section.rows.length +
                              defaultRightsMissingFields.length
                            } fields`
                          : `${section.rows.length} ${
                              section.rows.length === 1
                                ? "field"
                                : "fields"
                            }`}
                  </small>

                  {section.group === "Performers" &&
                    supportsPerformerRecords &&
                    savedPerformerRecords.length > 0 && (
                      <button
                        type="button"
                        className="metadata-section-copy-button"
                        disabled={
                          performerDraft !== undefined ||
                          (editMode &&
                            !canFinishEditing)
                        }
                        title={
                          performerDraft !== undefined ||
                          (editMode &&
                            !canFinishEditing)
                            ? "Save or discard browser edits before copying performer credits."
                            : document.scope === "release"
                              ? "Copy selected release performer credits into track-level overrides"
                              : "Copy selected saved performer credits to other tracks in this release"
                        }
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          onCopyPerformerCredits(
                            savedPerformerRecords,
                          );
                        }}
                      >
                        Copy credits
                      </button>
                    )}

                  {renderSectionEditButton()}
                </span>
              </summary>

              <div className="metadata-section-rows">
                {section.group ===
                  engineeringCreditSummaryGroup && (
                  <TechnicalCreditRecordEditor
                    document={document}
                    records={
                      technicalCreditRecords
                    }
                    inheritedRecords={
                      inheritedTechnicalCreditRecords
                    }
                    releaseDefaultRecords={
                      releaseTechnicalCreditRecords
                    }
                    editMode={editMode}
                    metadataRegistry={
                      documentMetadataRegistry
                    }
                    relatedOpen={
                      metadataSectionOpenState[
                        `${engineeringCreditSummaryGroup}:related`
                      ] ?? false
                    }
                    onRelatedToggle={(event) =>
                      handleMetadataSectionToggle(
                        `${engineeringCreditSummaryGroup}:related`,
                        event,
                      )
                    }
                    onChange={
                      onTechnicalCreditDraftChange
                    }
                  />
                )}

                {section.group ===
                  "Songwriting & Composition" &&
                  supportsWritingCreditRecords && (
                  <WritingCreditRecordEditor
                    document={document}
                    records={writingCreditRecords}
                    inheritedRecords={
                      inheritedWritingCreditRecords
                    }
                    releaseDefaultRecords={
                      releaseWritingCreditRecords
                    }
                    editMode={editMode}
                    metadataRegistry={
                      documentMetadataRegistry
                    }
                    relatedOpen={
                      metadataSectionOpenState[
                        "Songwriting & Composition:related"
                      ] ?? false
                    }
                    onRelatedToggle={(event) =>
                      handleMetadataSectionToggle(
                        "Songwriting & Composition:related",
                        event,
                      )
                    }
                    onChange={
                      onWritingCreditDraftChange
                    }
                  />
                )}

                {section.group ===
                  "Samples & Interpolations" &&
                  supportsSampleRelationshipRecords && (
                  <Suspense
                    fallback={
                      <p className="metadata-record-empty-state">
                        Loading sample relationship editor…
                      </p>
                    }
                  >
                    <LazySampleRelationshipRecordEditor
                      records={sampleRelationshipRecords}
                      editMode={editMode}
                      onChange={onSampleRelationshipDraftChange}
                    />
                  </Suspense>
                )}

                {section.group ===
                  "Sample Clearance" &&
                  supportsSampleClearanceRecords && (
                  <Suspense
                    fallback={
                      <p className="metadata-record-empty-state">
                        Loading sample clearance editor…
                      </p>
                    }
                  >
                    <LazySampleClearanceRecordEditor
                      records={sampleClearanceRecords}
                      sampleCount={sampleRelationshipRecords.length}
                      editMode={editMode}
                      onChange={onSampleClearanceDraftChange}
                    />
                  </Suspense>
                )}

                {section.group ===
                  "Arrangement & Orchestration" &&
                  supportsArrangementCreditRecords && (
                  <ArrangementCreditRecordEditor
                    document={document}
                    records={
                      arrangementCreditRecords
                    }
                    inheritedRecords={
                      inheritedArrangementCreditRecords
                    }
                    releaseDefaultRecords={
                      releaseArrangementCreditRecords
                    }
                    editMode={editMode}
                    metadataRegistry={
                      documentMetadataRegistry
                    }
                    relatedOpen={
                      metadataSectionOpenState[
                        "Arrangement & Orchestration:related"
                      ] ?? false
                    }
                    onRelatedToggle={(event) =>
                      handleMetadataSectionToggle(
                        "Arrangement & Orchestration:related",
                        event,
                      )
                    }
                    onChange={
                      onArrangementCreditDraftChange
                    }
                  />
                )}

                {section.group ===
                  "Performers" && (
                  <PerformerRecordEditor
                    document={document}
                    records={
                      performerRecords
                    }
                    releasePrimaryArtistName={
                      releasePrimaryArtistName
                    }
                    releaseDefaultRecords={
                      releasePerformerRecords
                    }
                    inheritedFromRelease={
                      performersInheritedFromRelease
                    }
                    editMode={editMode}
                    metadataRegistry={
                      documentMetadataRegistry
                    }
                    relatedOpen={
                      metadataSectionOpenState[
                        "Performers:related"
                      ] ?? false
                    }
                    onRelatedToggle={(event) =>
                      handleMetadataSectionToggle(
                        "Performers:related",
                        event,
                      )
                    }
                    onChange={
                      onPerformerDraftChange
                    }
                    onCustomizeTrack={
                      document.scope === "track"
                        ? () =>
                            onPerformerDraftChange(
                              createTrackPerformerOverride(
                                releasePerformerRecords,
                              ),
                            )
                        : undefined
                    }
                    onUseRelease={
                      document.scope === "track"
                        ? () => {
                            if (
                              localPerformerRecords.length > 0 &&
                              !window.confirm(
                                "Remove this track's local performer override and use the release performers?",
                              )
                            ) {
                              return;
                            }

                            onPerformerDraftChange([]);
                          }
                        : undefined
                    }
                  />
                )}

                {section.group ===
                  unmappedMetadataGroup && (
                  <div className="metadata-unmapped-guidance">
                    <strong>
                      Preserved from {document.filename}
                    </strong>
                    <p>
                      These authored fields are not yet registered with a
                      dedicated editor. Their canonical paths remain visible
                      and their values are preserved unchanged.
                    </p>
                  </div>
                )}

                {renderSectionPrimaryRows(
                  section,
                )}

                {section.group ===
                  "Release & Track Identity" &&
                  defaultTrackIdentityMissingFields.map(
                    renderDefaultMissingField,
                  )}

                {section.rows.some(
                  ({ row }) =>
                    !isPerformerRecordPath(
                      row.path,
                    ) &&
                    getReleaseContributorRecordIndex(
                      row.path,
                    ) === null &&
                    isRelatedMetadataTagPath(
                      row.path,
                    ),
                ) && (
                  <details
                    className="metadata-related-tags"
                    open={
                      metadataSectionOpenState[
                        `${section.group}:related`
                      ] ?? false
                    }
                    onToggle={(event) =>
                      handleMetadataSectionToggle(
                        `${section.group}:related`,
                        event,
                      )
                    }
                  >
                    <summary>
                      <span
                        className="metadata-section-triangle"
                        aria-hidden="true"
                      />
                      <span>Related tags</span>
                    </summary>

                    <div className="metadata-related-tags-body">
                      {section.rows
                        .filter(
                          ({ row }) =>
                            !isPerformerRecordPath(
                              row.path,
                            ) &&
                            getReleaseContributorRecordIndex(
                              row.path,
                            ) === null &&
                            isRelatedMetadataTagPath(
                              row.path,
                            ),
                        )
                        .map(
                          renderMetadataRow,
                        )}
                    </div>
                  </details>
                )}

                {section.group === "Artists" &&
                  releaseContributorRecords.length >
                    0 && (
                    <div className="release-contributor-list">
                      {releaseContributorRecords.map(
                        (record) => {
                          const orderedRows =
                            [...record.rows].sort(
                              (left, right) => {
                                const order = (
                                  path: string,
                                ) => {
                                  switch (
                                    getReleaseContributorLeaf(
                                      path,
                                    )
                                  ) {
                                    case "name":
                                      return 10;
                                    case "role":
                                      return 20;
                                    case "sort_name":
                                      return 30;
                                    default:
                                      return 40;
                                  }
                                };

                                return (
                                  order(
                                    left.row.path,
                                  ) -
                                  order(
                                    right.row.path,
                                  )
                                );
                              },
                            );

                          const primaryRows =
                            orderedRows.filter(
                              ({ row }) =>
                                getReleaseContributorLeaf(
                                  row.path,
                                ) !==
                                "sort_name",
                            );

                          const advancedRows =
                            orderedRows.filter(
                              ({ row }) =>
                                getReleaseContributorLeaf(
                                  row.path,
                                ) ===
                                "sort_name",
                            );

                          return (
                            <article
                              key={record.index}
                              className="release-contributor-card"
                            >
                              <header>
                                <div>
                                  <span className="eyebrow">
                                    Release contributor
                                  </span>
                                  <h5>
                                    Contributor{" "}
                                    {record.index + 1}
                                  </h5>
                                </div>
                              </header>

                              <div className="release-contributor-fields">
                                {primaryRows.map(
                                  ({
                                    row,
                                    fieldDefinition,
                                  }) => {
                                    const leaf =
                                      getReleaseContributorLeaf(
                                        row.path,
                                      );

                                    return (
                                      <div
                                        key={row.path}
                                        className="release-contributor-field"
                                      >
                                        <div className="release-contributor-field-label">
                                          <strong>
                                            {getContributorFieldLabel(
                                              leaf,
                                            )}
                                          </strong>

                                          <MetadataFieldControls
                                            field={
                                              fieldDefinition
                                            }
                                            path={
                                              row.path
                                            }
                                            valueType={
                                              row.valueType
                                            }
                                          />
                                        </div>

                                        <MetadataValueCell
                                          document={
                                            document
                                          }
                                          row={row}
                                          field={
                                            fieldDefinition
                                          }
                                          editMode={
                                            editMode
                                          }
                                          draft={
                                            draft
                                          }
                                          onDraftValueChange={
                                            onDraftValueChange
                                          }
                                        />
                                      </div>
                                    );
                                  },
                                )}
                              </div>

                              {advancedRows.length >
                                0 && (
                                <details className="release-contributor-advanced">
                                  <summary>
                                    Advanced
                                  </summary>

                                  <p>
                                    Sort name controls
                                    alphabetical ordering.
                                    Leave it blank when the
                                    display name already sorts
                                    correctly.
                                  </p>

                                  <div className="release-contributor-fields">
                                    {advancedRows.map(
                                      ({
                                        row,
                                        fieldDefinition,
                                      }) => (
                                        <div
                                          key={
                                            row.path
                                          }
                                          className="release-contributor-field"
                                        >
                                          <div className="release-contributor-field-label">
                                            <strong>
                                              Sort name
                                            </strong>

                                            <MetadataFieldControls
                                              field={
                                                fieldDefinition
                                              }
                                              path={
                                                row.path
                                              }
                                              valueType={
                                                row.valueType
                                              }
                                            />
                                          </div>

                                          <MetadataValueCell
                                            document={
                                              document
                                            }
                                            row={
                                              row
                                            }
                                            field={
                                              fieldDefinition
                                            }
                                            editMode={
                                              editMode
                                            }
                                            draft={
                                              draft
                                            }
                                            onDraftValueChange={
                                              onDraftValueChange
                                            }
                                          />
                                        </div>
                                      ),
                                    )}
                                  </div>
                                </details>
                              )}
                            </article>
                          );
                        },
                      )}
                    </div>
                  )}
              </div>
              </details>

              {section.group ===
                "Release & Track Identity" &&
                numberingSection}
            </Fragment>
          ),
        )}

        {!hasIdentitySection &&
          !hasDatesSection &&
          numberingSection}
      </div>

      {performerHelpOpen && (
        <MetadataFieldPairHelpModal
          {...performerHelpProps}
          onClose={() =>
            setPerformerHelpOpen(false)
          }
        />
      )}

      {pendingFieldRemoval && (
        <MetadataFieldModal
          title={`Remove ${pendingFieldRemoval.field.label}?`}
          onClose={() =>
            setPendingFieldRemoval(null)
          }
        >
          <section className="metadata-field-removal-confirmation">
            <p>
              This removes the optional field from
              <code>{document.filename}</code>. A verified backup is
              created before the TOML document is replaced.
            </p>

            <dl>
              <div>
                <dt>Canonical path</dt>
                <dd>
                  <code>
                    {pendingFieldRemoval.field.tomlPath}
                  </code>
                </dd>
              </div>
              <div>
                <dt>Current value</dt>
                <dd>
                  {isBlankMetadataValue(
                    pendingFieldRemoval.row.value,
                  )
                    ? "Blank"
                    : "This field contains a value"}
                </dd>
              </div>
            </dl>

            <p className="metadata-field-removal-warning">
              Removing a populated field also removes its local value.
              Inherited release values are not deleted.
            </p>

            <div className="metadata-field-removal-actions">
              <button
                type="button"
                onClick={() =>
                  setPendingFieldRemoval(null)
                }
              >
                Cancel
              </button>
              <button
                type="button"
                className="danger-button"
                disabled={
                  removingFieldKey !== null
                }
                onClick={() => {
                  const field =
                    pendingFieldRemoval.field;

                  setPendingFieldRemoval(null);
                  onRemoveField(
                    document,
                    field,
                  );
                }}
              >
                Remove field
              </button>
            </div>
          </section>
        </MetadataFieldModal>
      )}

    </article>
  );
}

function GenerationPlanPanel({
  plan,
  generationScope,
  selectedTrackId,
  tracks,
  confirmationText,
  creationLoading,
  creationError,
  creationMessage,
  onGenerationScopeChange,
  onSelectedTrackIdChange,
  onConfirmationTextChange,
  onCreate,
}: {
  plan: MetadataGenerationPlan;
  generationScope: MetadataGenerationScope;
  selectedTrackId: string;
  tracks: TrackScanResult[];
  confirmationText: string;
  creationLoading: boolean;
  creationError: string | null;
  creationMessage: string | null;
  onGenerationScopeChange: (
    scope: MetadataGenerationScope,
  ) => void;
  onSelectedTrackIdChange: (
    trackId: string,
  ) => void;
  onConfirmationTextChange: (
    value: string,
  ) => void;
  onCreate: () => void;
}) {
  return (
    <section className="generation-plan-panel">
      <div className="preview-heading">
        <div>
          <p className="card-type">
            Read-only safety check
          </p>
          <h3>Metadata generation plan</h3>
        </div>

        <span className="badge preview">
          No files will be written
        </span>
      </div>

      <section className="scope-controls">
        <label>
          Generation scope
          <select
            value={generationScope}
            onChange={(event) =>
              onGenerationScopeChange(
                event.target
                  .value as MetadataGenerationScope,
              )
            }
          >
            <option value="all">
              Release and all tracks
            </option>
            <option value="release">
              Release metadata only
            </option>
            <option value="track">
              Selected track only
            </option>
          </select>
        </label>

        {generationScope === "track" && (
          <label>
            Track
            <select
              value={selectedTrackId}
              onChange={(event) =>
                onSelectedTrackIdChange(
                  event.target.value,
                )
              }
            >
              {tracks.map((track) => (
                <option
                  key={track.id}
                  value={track.id}
                >
                  {track.id}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>

      <div className="plan-summary">
        <section>
          <span>May create</span>
          <strong>{plan.summary.createCount}</strong>
        </section>

        <section>
          <span>Blocked</span>
          <strong>{plan.summary.blockedCount}</strong>
        </section>
      </div>

      <div className="plan-items">
        {plan.items.map((item) => (
          <article
            key={item.relativePath}
            className={`plan-item ${item.action}`}
          >
            <div>
              <strong>{item.filename}</strong>
              <code>{item.relativePath}</code>
              <p>{item.reason}</p>
            </div>

            <div className="plan-item-status">
              <span
                className={
                  item.action === "create"
                    ? "badge complete"
                    : "badge missing"
                }
              >
                {item.action === "create"
                  ? "Create"
                  : "Blocked"}
              </span>

              <span
                className={
                  item.validated
                    ? "validation-status valid"
                    : "validation-status invalid"
                }
              >
                {item.validated
                  ? "TOML validated"
                  : "Invalid TOML"}
              </span>
            </div>
          </article>
        ))}
      </div>

      {plan.warnings.length > 0 && (
        <div className="preview-warnings">
          <h4>Plan warnings</h4>

          <ul>
            {plan.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <section className="creation-controls">
        <div>
          <p className="card-type">
            Explicit write confirmation
          </p>
          <h4>Create missing metadata files</h4>
          <p>
            Existing files will not be replaced. Enter
            the exact phrase below to enable creation:
          </p>
          <code>CREATE_MISSING_METADATA</code>
        </div>

        <label>
          Confirmation phrase
          <input
            type="text"
            value={confirmationText}
            disabled={
              creationLoading ||
              plan.summary.createCount === 0
            }
            autoComplete="off"
            spellCheck={false}
            onChange={(event) =>
              onConfirmationTextChange(
                event.target.value,
              )
            }
          />
        </label>

        <button
          type="button"
          className="create-button"
          disabled={
            creationLoading ||
            plan.summary.createCount === 0 ||
            confirmationText !==
              "CREATE_MISSING_METADATA"
          }
          onClick={onCreate}
        >
          {creationLoading
            ? "Creating metadata…"
            : plan.summary.createCount === 0
              ? "No missing files to create"
              : generationScope === "release"
                ? `Create ${plan.summary.createCount} release files`
                : generationScope === "track"
                  ? `Create ${plan.summary.createCount} track files`
                  : `Create ${plan.summary.createCount} missing files`}
        </button>

        {creationError && (
          <p className="message error">
            {creationError}
          </p>
        )}

        {creationMessage && (
          <p className="message success">
            {creationMessage}
          </p>
        )}
      </section>
    </section>
  );
}

function GeneratedTomlPanel({
  preview,
}: {
  preview: GeneratedMetadataPreview;
}) {
  return (
    <section className="generated-panel">
      <div className="preview-heading">
        <div>
          <p className="card-type">
            In-memory rendering
          </p>
          <h3>Generated TOML preview</h3>
        </div>

        <span className="badge preview">
          No files will be written
        </span>
      </div>

      <p className="generated-summary">
        {preview.documents.length} documents rendered
        and validated.
      </p>

      <div className="generated-document-list">
        {preview.documents.map((document) => (
          <details
            key={document.relativePath}
            className="generated-document"
          >
            <summary>
              <span>
                <strong>{document.filename}</strong>
                <code>{document.relativePath}</code>
              </span>

              <span
                className={
                  document.validated
                    ? "badge complete"
                    : "badge missing"
                }
              >
                {document.validated
                  ? "Validated"
                  : "Invalid"}
              </span>
            </summary>

            <pre>
              <code>{document.content}</code>
            </pre>
          </details>
        ))}
      </div>

      {preview.warnings.length > 0 && (
        <div className="preview-warnings">
          <h4>Generation warnings</h4>

          <ul>
            {preview.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function MetadataPreviewPanel({
  preview,
}: {
  preview: LibraryMetadataPreview;
}) {
  return (
    <section className="preview-panel">
      <div className="preview-heading">
        <div>
          <p className="card-type">
            Read-only preview
          </p>
          <h3>Inferred metadata</h3>
        </div>

        <span className="badge preview">
          No files will be written
        </span>
      </div>

      <section className="detail-grid">
        <PreviewGroup
          title="Release"
          values={[
            ["Release ID", preview.release.releaseId],
            ["Release date", preview.release.releaseDate],
            ["Release title", preview.release.releaseTitle],
            [
              "Artwork master",
              preview.release.artworkMasterPath,
            ],
          ]}
        />

        <section className="preview-track-list">
          <h4>Tracks</h4>

          {preview.tracks.map((track) => (
            <PreviewGroup
              key={track.trackId.value}
              title={track.trackId.value}
              values={[
                ["Artist", track.artistName],
                ["Track number", track.trackNumber],
                ["Track title", track.trackTitle],
                ["Track version", track.trackVersion],
                [
                  "Display title",
                  track.trackDisplayTitle,
                ],
                ["Audio master", track.audioMasterPath],
                ["Artwork master", track.artworkMasterPath],
              ]}
            />
          ))}
        </section>
      </section>

      {preview.warnings.length > 0 && (
        <div className="preview-warnings">
          <h4>Preview warnings</h4>

          <ul>
            {preview.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function PreviewGroup({
  title,
  values,
}: {
  title: string;
  values: Array<
    [
      string,
      InferredValue<string | number> | undefined,
    ]
  >;
}) {
  return (
    <section className="panel">
      <h4>{title}</h4>

      <dl className="preview-values">
        {values.map(([label, inferredValue]) => (
          <div key={label}>
            <dt>{label}</dt>

            <dd>
              {inferredValue ? (
                <>
                  <strong>
                    {inferredValue.value}
                  </strong>
                  <small>
                    Source: {inferredValue.source}
                  </small>
                </>
              ) : (
                <span className="not-inferred">
                  Not inferred
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function MetadataPanel({
  title,
  files,
}: {
  title: string;
  files: MetadataFileStatus[];
}) {
  return (
    <section className="panel">
      <h4>{title}</h4>

      <ul className="status-list">
        {files.map((file) => (
          <li key={file.relativePath}>
            <span
              className={
                file.exists
                  ? "status-dot present"
                  : "status-dot missing"
              }
              aria-hidden="true"
            />

            <div>
              <strong>{file.filename}</strong>
              <code>{file.relativePath}</code>
            </div>

            <span
              className={
                file.exists
                  ? "status-text present"
                  : "status-text missing"
              }
            >
              {file.exists
                ? "Present"
                : "Missing"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function artworkAssetUrl(
  relativePath: string,
): string {
  return `/api/library/artwork?${new URLSearchParams({
    path: relativePath,
  }).toString()}`;
}

function ArtworkGallery({
  release,
  activeDocumentGroup,
}: {
  release: ReleaseScanResult | null;
  activeDocumentGroup: string;
}) {
  const isTrackScope =
    activeDocumentGroup !== "release";
  const activeTrack = isTrackScope
    ? release?.tracks.find(
        (track) =>
          track.id === activeDocumentGroup,
      ) ?? null
    : null;
  const scope = isTrackScope
    ? "track"
    : "release";
  const items = buildArtworkGallery({
    scope,
    releaseArtwork:
      release?.artworkMasters ?? [],
    trackArtwork:
      activeTrack?.artworkMasters ?? [],
  });
  const inherited = items.some(
    (item) => item.inherited,
  );

  return (
    <section className="metadata-artwork-gallery-panel">
      <header className="metadata-artwork-gallery-header">
        <div>
          <span className="metadata-artwork-gallery-eyebrow">
            {scope === "release"
              ? "Release artwork"
              : "Track artwork"}
          </span>
          <h2>
            {scope === "release"
              ? "Available release artwork"
              : `Artwork for ${formatReleaseTitle(
                  activeTrack?.id ??
                    activeDocumentGroup,
                )}`}
          </h2>
          <p>
            {scope === "release"
              ? "Release-scoped artwork only. Track-specific images are intentionally excluded from this view."
              : inherited
                ? "No track-specific artwork was found. The release front artwork is shown as an inherited fallback."
                : "All artwork discovered inside this track is shown below."}
          </p>
        </div>

        <span className="metadata-artwork-gallery-count">
          {items.length} {items.length === 1
            ? "artwork file"
            : "artwork files"}
        </span>
      </header>

      {items.length === 0 ? (
        <div className="metadata-artwork-gallery-empty">
          <strong>No artwork detected</strong>
          <p>
            {scope === "release"
              ? "Add release artwork under an artwork role directory such as front, back, disc, booklet, or alternate."
              : "This track has no local artwork and no release front artwork is available to inherit."}
          </p>
        </div>
      ) : (
        <div className="metadata-artwork-gallery-grid">
          {items.map((item) => (
            <ArtworkGalleryCard
              key={`${item.source}:${item.asset.relativePath}`}
              item={item}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ArtworkGalleryCard({
  item,
}: {
  item: ArtworkGalleryItem;
}) {
  const [dimensions, setDimensions] =
    useState<string | null>(null);
  const assetUrl = artworkAssetUrl(
    item.asset.relativePath,
  );
  const extension = item.asset.extension
    .replace(/^\./, "")
    .toUpperCase() || "FILE";
  const sourceLabel =
    item.source === "track"
      ? "Track-specific artwork"
      : item.source === "release"
        ? "Release artwork"
        : "Release front fallback";

  return (
    <article
      className={[
        "metadata-artwork-card",
        item.inherited
          ? "is-inherited"
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <a
        className="metadata-artwork-preview"
        href={assetUrl}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open ${item.roleLabel} artwork: ${item.asset.filename}`}
      >
        {item.previewable ? (
          <img
            src={assetUrl}
            alt={`${item.roleLabel} artwork`}
            loading="lazy"
            onLoad={(event) => {
              const image = event.currentTarget;
              setDimensions(
                `${image.naturalWidth} × ${image.naturalHeight}`,
              );
            }}
          />
        ) : (
          <span className="metadata-artwork-preview-placeholder">
            <strong>{extension}</strong>
            <small>
              Open original to inspect
            </small>
          </span>
        )}
      </a>

      <div className="metadata-artwork-card-body">
        <header>
          <div>
            <span className="metadata-artwork-role">
              {item.roleLabel}
            </span>
            {item.inherited && (
              <small className="metadata-provenance-note metadata-inherited-note">
                Inherited from release
              </small>
            )}
          </div>
          <span className="metadata-artwork-format">
            {extension}
          </span>
        </header>

        <strong className="metadata-artwork-filename">
          {item.asset.filename}
        </strong>

        <dl className="metadata-artwork-facts">
          <div>
            <dt>Source</dt>
            <dd>{sourceLabel}</dd>
          </div>
          {dimensions && (
            <div>
              <dt>Dimensions</dt>
              <dd>{dimensions}</dd>
            </div>
          )}
        </dl>

        <code className="metadata-artwork-path">
          {item.asset.relativePath}
        </code>

        <a
          className="metadata-artwork-open-link"
          href={assetUrl}
          target="_blank"
          rel="noreferrer"
        >
          Open original
        </a>
      </div>
    </article>
  );
}

function AssetPanel({
  title,
  assets,
  emptyLabel,
}: {
  title: string;
  assets: DiscoveredAsset[];
  emptyLabel: string;
}) {
  return (
    <section className="panel">
      <h4>{title}</h4>

      {assets.length === 0 ? (
        <p className="empty-state">
          {emptyLabel}
        </p>
      ) : (
        <ul className="asset-list">
          {assets.map((asset) => (
            <li key={asset.relativePath}>
              <strong>{asset.filename}</strong>
              <code>{asset.relativePath}</code>
              <span>{asset.extension}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
