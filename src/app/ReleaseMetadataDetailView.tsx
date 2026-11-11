import { hiplingoLogoUrl } from "@hiplingo/brand";
import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { flattenMetadata } from "../metadata-flattener.js";
import {
  buildAudioPreviewUrl,
  getAudioPreviewSourceLabel,
  getPlayableTrackIds,
  trackHasAudioPreview,
} from "../audio-preview.js";
import type {
  PersistentLibraryPlaybackController,
  PersistentPlaybackTrack,
} from "../PersistentLibraryPlayer.js";
import type { WaveformColorMode } from "../media-waveform.js";
import { buildLibraryWaveformUrl } from "../library-waveform.js";
import type {
  SampleClearanceRecordDraft,
  SampleRelationshipRecordDraft,
} from "../sample-relationship.js";
import {
  clearMetadataActivityLog,
  prependMetadataActivityEntry,
  readMetadataActivityLog,
  writeMetadataActivityLog,
  type MetadataActivityEntry,
} from "../activity-log.js";
import { findMetadataValueAcrossDocuments } from "../release-inheritance.js";
import {
  deriveTrackSaveChanges,
  deriveTrackTitleDraftChanges,
} from "../track-derived-metadata.js";
import {
  creditSortNamePathForNamePath,
  synchronizeCreditSortName,
} from "../credit-sort-name.js";
import {
  formatTrackDisplayTitle,
  inferTrackTitleMetadata,
  recommendedTrackVersionOptions,
} from "../../shared/track-title.js";
import {
  selectPreferredReleaseArtwork,
  selectReleaseFrontArtwork,
} from "../artwork-gallery.js";
import {
  buildMetadataReadiness,
  readinessBadgeLabel,
  summarizeMissingMetadataDocuments,
  type MissingMetadataDocument,
  type RequiredFieldIssue,
} from "../metadata-readiness.js";
import {
  addReadinessSkip,
  readReadinessSkips,
  removeReadinessSkip,
  writeReadinessSkips,
} from "../readiness-skips.js";
import {
  WorkflowNavigation,
  type WorkflowApplicationView,
  type WorkflowLocationDisplay,
} from "../WorkflowNavigation.js";
import { buildTrackNavigationOrder } from "../track-navigation-order.js";
import { buildTrackDirectoryIdForNumber } from "../../shared/track-directory-naming.js";
import { buildReleaseDirectoryId } from "../../shared/ingest-builder.js";
import { resolveReleaseDisplayTitle } from "../release-display-title.js";
import {
  getAdjacentMetadataSidebarId,
  getMetadataSidebarScrollTop,
  normalizeMetadataSidebarWheelDelta,
  planMetadataSidebarWheelHandoff,
} from "../metadata-sidebar-navigation.js";
import {
  type ArrangementCreditDraftMap,
  type EditableMetadataValue,
  type MetadataDraft,
  type PerformerCopyResponse,
  type PerformerCopySource,
  type PerformerDraftMap,
  type PerformerRecordDraft,
  type SampleClearanceDraftMap,
  type SampleRelationshipDraftMap,
  type ScalarMetadataSaveReceipt,
  type TechnicalCreditDraftMap,
  type TrackDirectoryRenamePlan,
  type TrackDirectoryRenameReceipt,
  type WritingCreditDraftMap,
  type WritingCreditRecordDraft,
  buildDocumentDraftKey,
  createMetadataActivityEntry,
  createPerformerCopyActivityEntry,
  getArrangementContributorPath,
  getDocumentDraftChanges,
  getDocumentSaveChanges,
  getPerformerPath,
  getTechnicalContributorPath,
  getWritingCreditBasePath,
  isEditableMetadataValue,
  isTrackTitleDraftPath,
  metadataValuesEqual,
  performerRecordsEqual,
  readArrangementCreditRecords,
  readDocumentDraftString,
  readEffectiveTrackNavigationInteger,
  readManagedArrangementCreditSourceIndexes,
  readManagedTechnicalCreditSourceIndexes,
  readPerformerRecords,
  readSampleClearanceRecords,
  readSampleRelationshipRecords,
  readTechnicalCreditRecords,
  readWritingCreditRecords,
  removeDocumentDraftChanges,
  sampleClearanceRecordsEqual,
  sampleRelationshipRecordsEqual,
  serializeArrangementCreditRecords,
  serializePerformerRecords,
  serializeSampleClearanceRecords,
  serializeSampleRelationshipRecords,
  serializeTechnicalCreditRecords,
  serializeWritingCreditRecords,
  writingCreditRecordsEqual,
} from "./metadata-records.js";
import {
  ArtworkGallery,
  artworkPreviewUrl,
} from "./library-panels.js";
import {
  LazyWaveformColorMenuCard,
  formatDuration,
} from "./foundation.js";
import type {
  MediaTechnicalAuditState,
  MediaTechnicalReleaseSummary,
  MetadataEditorFocusTarget,
  MetadataFieldDefinition,
  MetadataFileStatus,
  ParsedMetadataDocument,
  PublishPlan,
  ReadinessNavigationTarget,
  ReleaseMetadataDetail,
  ReleaseMetadataTab,
  ReleaseRenamePlan,
  ReleaseRenameReceipt,
  ReleaseScanResult,
  StarterMetadataDraft,
  ToastMessage,
  TrackScanResult,
} from "./types.js";
import {
  MetadataActivityLogModal,
  MetadataFieldModal,
  MetadataReadinessWorkItem,
  PerformerCreditCopyModal,
  ReadinessNavBadge,
} from "./metadata-field-guidance.js";
import {
  MetadataDocumentSection,
  SelectOrCustomMetadataInput,
  getInitialMetadataFieldValue,
} from "./metadata-value-cells.js";
import {
  TechnicalHealthBadge,
  TechnicalReleaseInspector,
} from "./technical-audit.js";
import {
  formatReleaseDate,
  formatReleaseTitle,
  inferCommonReleaseArtist,
  inferTrackSummary,
  readTrackDisplayTitle,
} from "./release-display.js";
import {
  libraryHealthBucket,
  libraryHealthCompactLabel,
  libraryHealthTitle,
  libraryHealthTone,
  summarizeLibraryHealthIssues,
} from "./PublishWorkspace.js";

const METADATA_SIDEBAR_WIDTH_STORAGE_KEY =
  "metadata-editor.library-sidebar-width-rem";

const DEFAULT_METADATA_SIDEBAR_WIDTH_REM = 20;

const MIN_METADATA_SIDEBAR_WIDTH_REM = 15;

const MAX_METADATA_SIDEBAR_WIDTH_REM = 32;

const METADATA_SIDEBAR_WIDTH_STEP_REM = 1;

function clampMetadataSidebarWidth(
  widthRem: number,
): number {
  if (!Number.isFinite(widthRem)) {
    return DEFAULT_METADATA_SIDEBAR_WIDTH_REM;
  }

  return Math.min(
    MAX_METADATA_SIDEBAR_WIDTH_REM,
    Math.max(
      MIN_METADATA_SIDEBAR_WIDTH_REM,
      widthRem,
    ),
  );
}

function readMetadataSidebarWidth(
  storage: Storage,
): number {
  const stored = Number.parseFloat(
    storage.getItem(
      METADATA_SIDEBAR_WIDTH_STORAGE_KEY,
    ) ?? "",
  );

  return clampMetadataSidebarWidth(stored);
}

function ReleaseMetadataDetailView({
  detail,
  release,
  technicalAudit,
  technicalSummary,
  metadataRegistry,
  showAdminTools,
  onShowAdminToolsChange,
  onNotify,
  workflowLocations,
  onBack,
  onReleaseRenamed,
  onRefresh,
  onOpenWorkflowHelp,
  onNavigateWorkflow,
  playback,
  waveformColorMode,
  onWaveformColorModeChange,
  initialFocusTarget,
  onInitialFocusHandled,
}: {
  detail: ReleaseMetadataDetail;
  release: ReleaseScanResult | null;
  technicalAudit: MediaTechnicalAuditState;
  technicalSummary?: MediaTechnicalReleaseSummary;
  metadataRegistry: MetadataFieldDefinition[];
  showAdminTools: boolean;
  onShowAdminToolsChange: (
    visible: boolean,
  ) => void;
  onNotify: (
    message: string,
    tone?: ToastMessage["tone"],
  ) => void;
  workflowLocations: WorkflowLocationDisplay[];
  onBack: () => void;
  onReleaseRenamed: (releaseId: string) => void | Promise<void>;
  onRefresh: () => void | Promise<void>;
  onOpenWorkflowHelp: () => void;
  onNavigateWorkflow: (
    view: WorkflowApplicationView,
  ) => void;
  playback: PersistentLibraryPlaybackController;
  waveformColorMode: WaveformColorMode;
  onWaveformColorModeChange: (mode: WaveformColorMode) => void;
  initialFocusTarget: MetadataEditorFocusTarget | null;
  onInitialFocusHandled: () => void;
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
    synchronizingTrackDirectories,
    setSynchronizingTrackDirectories,
  ] = useState(false);
  const [
    trackDirectoryRenameReview,
    setTrackDirectoryRenameReview,
  ] = useState<TrackDirectoryRenamePlan | null>(
    null,
  );
  const [
    trackDirectoryRenameConfirmationInput,
    setTrackDirectoryRenameConfirmationInput,
  ] = useState("");
  const [releaseRenameOpen, setReleaseRenameOpen] =
    useState(false);
  const [releaseRenameTitle, setReleaseRenameTitle] =
    useState("");
  const [releaseRenameId, setReleaseRenameId] =
    useState("");
  const [releaseRenamePlan, setReleaseRenamePlan] =
    useState<ReleaseRenamePlan | null>(null);
  const [releaseRenameConfirmation, setReleaseRenameConfirmation] =
    useState("");
  const [releaseRenameLoading, setReleaseRenameLoading] =
    useState(false);
  const [releaseRenameError, setReleaseRenameError] =
    useState<string | null>(null);
  const [libraryHealthPlan, setLibraryHealthPlan] =
    useState<PublishPlan | null>(null);
  const [libraryHealthLoading, setLibraryHealthLoading] =
    useState(true);
  const [libraryHealthError, setLibraryHealthError] =
    useState<string | null>(null);
  const [libraryHealthOpen, setLibraryHealthOpen] =
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
  const metadataSidebarRef =
    useRef<HTMLElement>(null);
  const metadataSidebarResizeRef = useRef<{
    pointerId: number;
    startClientX: number;
    startWidthRem: number;
    rootRemPx: number;
    currentWidthRem: number;
  } | null>(null);
  const [
    metadataSidebarWidthRem,
    setMetadataSidebarWidthRem,
  ] = useState(() =>
    readMetadataSidebarWidth(
      window.localStorage,
    ),
  );

  useEffect(() => {
    if (!initialFocusTarget) {
      return;
    }

    setActiveDocumentGroup(
      initialFocusTarget.scopeId,
    );
    setActiveMetadataTab(
      initialFocusTarget.tab,
    );
    setEditMode(true);
    setReadinessTarget(null);

    let secondFrame = 0;
    const firstFrame =
      window.requestAnimationFrame(() => {
        secondFrame =
          window.requestAnimationFrame(() => {
            if (initialFocusTarget.tomlPath) {
              const row = Array.from(
                document.querySelectorAll<HTMLElement>(
                  "[data-metadata-path]",
                ),
              ).find(
                (candidate) =>
                  candidate.dataset.metadataPath ===
                  initialFocusTarget.tomlPath,
              );

              row?.scrollIntoView({
                block: "center",
                behavior: "smooth",
              });

              const addButton =
                row?.querySelector<HTMLButtonElement>(
                  ".metadata-default-field-add-button",
                );

              (addButton ?? row)?.focus({
                preventScroll: true,
              });
            }

            onInitialFocusHandled();
          });
      });

    return () => {
      window.cancelAnimationFrame(firstFrame);

      if (secondFrame) {
        window.cancelAnimationFrame(secondFrame);
      }
    };
  }, [
    detail.releaseId,
    initialFocusTarget,
    onInitialFocusHandled,
  ]);

  useEffect(() => {
    setTrackDirectoryRenameReview(null);
    setTrackDirectoryRenameConfirmationInput("");
    setReleaseRenameOpen(false);
    setReleaseRenamePlan(null);
    setReleaseRenameConfirmation("");
    setReleaseRenameError(null);
  }, [detail.releaseId]);

  const playbackIsForThisRelease =
    playback.currentTrack?.releaseId ===
    detail.releaseId;
  const audioPreviewTrackId =
    playbackIsForThisRelease
      ? playback.currentTrack?.trackId ?? null
      : null;
  const audioPreviewPlaying =
    playbackIsForThisRelease &&
    playback.isPlaying;
  const audioPreviewLoading =
    playbackIsForThisRelease &&
    playback.isLoading;
  useEffect(() => {
    const sidebar = metadataSidebarRef.current;

    if (!sidebar) {
      return;
    }

    const handleSidebarWheel = (
      event: WheelEvent,
    ) => {
      if (
        event.defaultPrevented ||
        event.ctrlKey ||
        event.shiftKey ||
        Math.abs(event.deltaX) >
          Math.abs(event.deltaY)
      ) {
        return;
      }

      const deltaY =
        normalizeMetadataSidebarWheelDelta({
          deltaY: event.deltaY,
          deltaMode: event.deltaMode,
          clientHeight: sidebar.clientHeight,
        });
      const plan =
        planMetadataSidebarWheelHandoff({
          scrollTop: sidebar.scrollTop,
          clientHeight: sidebar.clientHeight,
          scrollHeight: sidebar.scrollHeight,
          deltaY,
        });

      if (!plan.intercept) {
        return;
      }

      event.preventDefault();

      if (plan.sidebarDeltaY !== 0) {
        sidebar.scrollTop +=
          plan.sidebarDeltaY;
      }

      const pageScroller =
        document.scrollingElement;

      if (
        pageScroller &&
        plan.pageDeltaY !== 0
      ) {
        const maximumPageScrollTop = Math.max(
          0,
          pageScroller.scrollHeight -
            pageScroller.clientHeight,
        );

        pageScroller.scrollTop = Math.min(
          maximumPageScrollTop,
          Math.max(
            0,
            pageScroller.scrollTop +
              plan.pageDeltaY,
          ),
        );
      }
    };

    sidebar.addEventListener(
      "wheel",
      handleSidebarWheel,
      { passive: false },
    );

    return () => {
      sidebar.removeEventListener(
        "wheel",
        handleSidebarWheel,
      );
    };
  }, [detail.releaseId]);

  const persistMetadataSidebarWidth = (
    widthRem: number,
  ) => {
    const nextWidth =
      clampMetadataSidebarWidth(widthRem);

    setMetadataSidebarWidthRem(nextWidth);
    window.localStorage.setItem(
      METADATA_SIDEBAR_WIDTH_STORAGE_KEY,
      String(nextWidth),
    );
  };

  const resetMetadataSidebarWidth = () => {
    persistMetadataSidebarWidth(
      DEFAULT_METADATA_SIDEBAR_WIDTH_REM,
    );
  };

  const handleMetadataSidebarResizePointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (event.button !== 0) {
      return;
    }

    const rootRemPx =
      Number.parseFloat(
        window.getComputedStyle(
          document.documentElement,
        ).fontSize,
      ) || 16;

    metadataSidebarResizeRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startWidthRem: metadataSidebarWidthRem,
      rootRemPx,
      currentWidthRem: metadataSidebarWidthRem,
    };

    event.currentTarget.setPointerCapture(
      event.pointerId,
    );
    event.preventDefault();
  };

  const handleMetadataSidebarResizePointerMove = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const resize =
      metadataSidebarResizeRef.current;

    if (
      !resize ||
      resize.pointerId !== event.pointerId
    ) {
      return;
    }

    const nextWidth =
      clampMetadataSidebarWidth(
        resize.startWidthRem +
          (event.clientX -
            resize.startClientX) /
            resize.rootRemPx,
      );

    resize.currentWidthRem = nextWidth;
    setMetadataSidebarWidthRem(nextWidth);
  };

  const handleMetadataSidebarResizePointerEnd = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    const resize =
      metadataSidebarResizeRef.current;

    if (
      !resize ||
      resize.pointerId !== event.pointerId
    ) {
      return;
    }

    metadataSidebarResizeRef.current = null;

    if (
      event.currentTarget.hasPointerCapture(
        event.pointerId,
      )
    ) {
      event.currentTarget.releasePointerCapture(
        event.pointerId,
      );
    }

    persistMetadataSidebarWidth(
      resize.currentWidthRem,
    );
  };

  const handleMetadataSidebarResizeKeyDown = (
    event: React.KeyboardEvent<HTMLDivElement>,
  ) => {
    let nextWidth: number | null = null;

    if (event.key === "ArrowLeft") {
      nextWidth =
        metadataSidebarWidthRem -
        METADATA_SIDEBAR_WIDTH_STEP_REM;
    } else if (event.key === "ArrowRight") {
      nextWidth =
        metadataSidebarWidthRem +
        METADATA_SIDEBAR_WIDTH_STEP_REM;
    } else if (event.key === "Home") {
      nextWidth =
        DEFAULT_METADATA_SIDEBAR_WIDTH_REM;
    }

    if (nextWidth === null) {
      return;
    }

    event.preventDefault();
    persistMetadataSidebarWidth(nextWidth);
  };

  const metadataWorkspaceStyle = {
    "--metadata-sidebar-width":
      `${metadataSidebarWidthRem}rem`,
  } as CSSProperties;

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
    onNotify(
      `${file.filename} skipped in this browser`,
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
    Object.keys(performerDrafts).length +
    Object.keys(technicalCreditDrafts).length +
    Object.keys(arrangementCreditDrafts).length +
    Object.keys(writingCreditDrafts).length +
    Object.keys(sampleRelationshipDrafts).length +
    Object.keys(sampleClearanceDrafts).length;

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

      if (typeof nextValue === "string") {
        const creditSortNamePath =
          creditSortNamePathForNamePath(
            metadataPath,
          );

        if (
          creditSortNamePath &&
          originalValues.has(creditSortNamePath)
        ) {
          const previousName =
            readDocumentDraftString(
              document,
              metadataPath,
              currentDraft,
            );
          const currentSortName =
            readDocumentDraftString(
              document,
              creditSortNamePath,
              currentDraft,
            );
          const nextSortName =
            synchronizeCreditSortName({
              previousName,
              nextName: nextValue,
              currentSortName,
            });
          const sortDraftKey =
            buildDocumentDraftKey(
              document,
              creditSortNamePath,
            );
          const originalSortName =
            originalValues.get(
              creditSortNamePath,
            );

          if (
            originalSortName !== undefined &&
            metadataValuesEqual(
              nextSortName,
              originalSortName,
            )
          ) {
            delete nextDraft[sortDraftKey];
          } else {
            nextDraft[sortDraftKey] =
              nextSortName;
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

  const applyTrackDirectoryRenames = async (
    plan: TrackDirectoryRenamePlan,
    confirmation: string,
  ): Promise<TrackDirectoryRenameReceipt> => {
    setSynchronizingTrackDirectories(true);

    try {
      const response = await fetch(
        "/api/library/apply-track-directory-renames",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            releaseId: detail.releaseId,
            confirmation,
            planFingerprint: plan.fingerprint,
          }),
        },
      );
      const result = (await response.json()) as
        | TrackDirectoryRenameReceipt
        | { error?: string };

      if (!response.ok) {
        throw new Error(
          "error" in result
            ? result.error ??
                `Directory synchronization failed: HTTP ${response.status}`
            : `Directory synchronization failed: HTTP ${response.status}`,
        );
      }

      const receipt =
        result as TrackDirectoryRenameReceipt;
      const activeRename = receipt.renamed.find(
        (item) =>
          item.previousTrackId ===
          activeDocumentGroup,
      );
      if (activeRename) {
        setActiveDocumentGroup(
          activeRename.trackId,
        );
      }

      const activePlaybackTrack = playback.currentTrack;
      if (
        receipt.renamed.length > 0 &&
        activePlaybackTrack?.releaseId ===
          detail.releaseId &&
        activePlaybackTrack.trackId
      ) {
        playback.clearIfTrack(
          detail.releaseId,
          activePlaybackTrack.trackId,
        );
      }

      return receipt;
    } finally {
      setSynchronizingTrackDirectories(false);
    }
  };

  const synchronizePendingTrackDirectories = async () => {
    if (dirtyCount > 0) {
      setSaveError(
        "Save or discard browser metadata changes before reviewing directory names.",
      );
      return;
    }

    setSaveError(null);
    setSynchronizingTrackDirectories(true);

    try {
      const query = new URLSearchParams({
        release: detail.releaseId,
      });
      const response = await fetch(
        `/api/library/track-directory-rename-plan?${query.toString()}`,
      );
      const result = (await response.json()) as
        | TrackDirectoryRenamePlan
        | { error?: string };

      if (!response.ok) {
        throw new Error(
          "error" in result
            ? result.error ??
                `Directory plan failed: HTTP ${response.status}`
            : `Directory plan failed: HTTP ${response.status}`,
        );
      }

      const plan = result as TrackDirectoryRenamePlan;

      if (
        plan.summary.renameCount === 0 &&
        plan.summary.blockedCount === 0
      ) {
        onNotify(
          "Track directory names are already synchronized",
          "success",
        );
        return;
      }

      setTrackDirectoryRenameConfirmationInput("");
      setTrackDirectoryRenameReview(plan);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown track directory planning error";
      setSaveError(message);
      onNotify(
        "Track directory dry-run plan failed",
        "error",
      );
    } finally {
      setSynchronizingTrackDirectories(false);
    }
  };

  const confirmTrackDirectoryRenames = async () => {
    const plan = trackDirectoryRenameReview;

    if (!plan) {
      return;
    }

    if (
      trackDirectoryRenameConfirmationInput !==
      plan.confirmation
    ) {
      return;
    }

    setSaveError(null);

    try {
      const receipt =
        await applyTrackDirectoryRenames(
          plan,
          trackDirectoryRenameConfirmationInput,
        );
      setTrackDirectoryRenameReview(null);
      setTrackDirectoryRenameConfirmationInput("");
      await onRefresh();

      onNotify(
        receipt.renamedCount > 0
          ? `${receipt.renamedCount} track ${
              receipt.renamedCount === 1
                ? "directory"
                : "directories"
            } renamed and verified`
          : "Track directory names are already synchronized",
        "success",
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unknown track directory synchronization error";
      setSaveError(message);

      if (/plan changed/i.test(message)) {
        setTrackDirectoryRenameReview(null);
        setTrackDirectoryRenameConfirmationInput("");
      }

      onNotify(
        "Track directory synchronization failed",
        "error",
      );
    }
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

    const changesTrackNumber = changes.some(
      (change) =>
        change.path ===
        "track.numbering.track_number",
    );

    if (
      changesTrackNumber &&
      trackNumberDraftDocuments.length > 1
    ) {
      setSaveError(
        "Multiple track numbers are changing. Use Save edits so directory swaps are synchronized as one guarded operation.",
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

      const saveDetails = [
        synchronizedTrackFiles > 0
          ? `${synchronizedTrackFiles} track ${
              synchronizedTrackFiles === 1
                ? "file"
                : "files"
            } synchronized`
          : null,
        changesTrackNumber
          ? "directory synchronization pending"
          : null,
      ].filter(Boolean);

      onNotify(
        saveDetails.length > 0
          ? `Metadata saved and verified · ${saveDetails.join(" · ")}`
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
        writeVerified
          ? "Metadata saved; refresh failed"
          : "Metadata save failed",
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
    const hasTrackNumberChanges =
      changedDocuments.some((document) =>
        getDocumentSaveChanges(
          document,
          draft,
          releaseDocuments,
        ).changes.some(
          (change) =>
            change.path ===
            "track.numbering.track_number",
        ),
      );

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

      const saveDetails = [
        synchronizedTrackFiles > 0
          ? `${synchronizedTrackFiles} track ${
              synchronizedTrackFiles === 1
                ? "file"
                : "files"
            } synchronized`
          : null,
        hasTrackNumberChanges
          ? "directory synchronization pending"
          : null,
      ].filter(Boolean);

      onNotify(
        saveDetails.length > 0
          ? `${savedCount} ${fileLabel} saved and verified · ${saveDetails.join(" · ")}`
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

  useEffect(() => {
    const handleMetadataSidebarKeyDown = (
      event: KeyboardEvent,
    ) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        (event.key !== "ArrowUp" &&
          event.key !== "ArrowDown")
      ) {
        return;
      }

      if (
        document.querySelector(
          '[aria-modal="true"], dialog[open]',
        )
      ) {
        return;
      }

      const target = event.target;
      const targetElement =
        target instanceof Element
          ? target
          : null;

      if (
        targetElement?.closest(
          'input, textarea, select, [contenteditable="true"], [role="textbox"], [role="combobox"], [role="slider"]',
        )
      ) {
        return;
      }

      const interactiveTarget =
        targetElement?.closest(
          'button, a, summary, [role="button"], [role="tab"]',
        );
      const eventStartedInSidebar = Boolean(
        targetElement?.closest(
          '[data-metadata-sidebar-navigation="true"]',
        ),
      );

      if (interactiveTarget && !eventStartedInSidebar) {
        return;
      }

      const nextId = getAdjacentMetadataSidebarId(
        ["release", ...trackIds],
        activeDocumentGroup,
        event.key === "ArrowDown"
          ? "next"
          : "previous",
      );

      if (!nextId) {
        return;
      }

      event.preventDefault();
      setActiveDocumentGroup(nextId);

      window.requestAnimationFrame(() => {
        const destination = Array.from(
          document.querySelectorAll<HTMLElement>(
            "[data-metadata-navigation-id]",
          ),
        ).find(
          (element) =>
            element.dataset.metadataNavigationId ===
            nextId,
        );

        const sidebar = destination?.closest<HTMLElement>(
          '[data-metadata-sidebar-navigation="true"]',
        );

        if (destination && sidebar) {
          const nextScrollTop =
            getMetadataSidebarScrollTop({
              scrollTop: sidebar.scrollTop,
              clientHeight: sidebar.clientHeight,
              scrollHeight: sidebar.scrollHeight,
              itemTop: destination.offsetTop,
              itemHeight: destination.offsetHeight,
              edgePadding: 8,
            });

          if (nextScrollTop !== sidebar.scrollTop) {
            sidebar.scrollTo({
              top: nextScrollTop,
              behavior: "auto",
            });
          }
        }

        if (eventStartedInSidebar) {
          destination?.focus({
            preventScroll: true,
          });
        }
      });
    };

    window.addEventListener(
      "keydown",
      handleMetadataSidebarKeyDown,
    );

    return () => {
      window.removeEventListener(
        "keydown",
        handleMetadataSidebarKeyDown,
      );
    };
  }, [activeDocumentGroup, trackIds]);

  const trackNavigationById = new Map(
    trackNavigation.entries.map(
      (entry) => [entry.trackId, entry],
    ),
  );
  const pendingTrackDirectoryRenames =
    trackNavigation.entries.flatMap((entry) => {
      if (entry.trackNumber === null) {
        return [];
      }

      const targetId =
        buildTrackDirectoryIdForNumber(
          entry.trackId,
          entry.trackNumber,
        );

      return targetId && targetId !== entry.trackId
        ? [{
            previousTrackId: entry.trackId,
            trackId: targetId,
            trackNumber: entry.trackNumber,
          }]
        : [];
    });
  const trackDirectoryTargetGroups = new Map<
    string,
    Array<{ previousTrackId: string; trackId: string }>
  >();

  for (const entry of trackNavigation.entries) {
    const targetId =
      entry.trackNumber === null
        ? entry.trackId
        : buildTrackDirectoryIdForNumber(
            entry.trackId,
            entry.trackNumber,
          ) ?? entry.trackId;
    const targetKey = targetId.toLocaleLowerCase(
      "en-US",
    );
    const group =
      trackDirectoryTargetGroups.get(targetKey) ?? [];
    group.push({
      previousTrackId: entry.trackId,
      trackId: targetId,
    });
    trackDirectoryTargetGroups.set(
      targetKey,
      group,
    );
  }

  const trackDirectoryTargetConflicts = Array.from(
    trackDirectoryTargetGroups.values(),
  ).filter((group) => group.length > 1);
  const trackNumberDraftDocuments =
    detail.documents.filter(
      (document) =>
        document.scope === "track" &&
        getDocumentDraftChanges(
          document,
          draft,
        ).some(
          (change) =>
            change.path ===
            "track.numbering.track_number",
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
  const buildReleasePlaybackQueue =
    (): PersistentPlaybackTrack[] => {
      const releaseTitle =
        resolveReleaseDisplayTitle(
          release?.releaseTitle,
          formatReleaseTitle(detail.releaseId),
        );
      const releaseArtist =
        release?.primaryArtistName?.trim() ?? "";
      const releaseArtwork =
        selectReleaseFrontArtwork(
          release?.artworkMasters ?? [],
        );

      return playableTrackIds.flatMap((trackId) => {
        const scannedTrack = release?.tracks.find(
          (track) => track.id === trackId,
        );

        if (!scannedTrack) {
          return [];
        }

        const trackDocuments = detail.documents.filter(
          (document) => document.trackId === trackId,
        );
        const title = readTrackDisplayTitle(
          trackId,
          trackDocuments,
          formatReleaseTitle(trackId),
        );
        const trackArtwork =
          selectPreferredReleaseArtwork(
            scannedTrack.artworkMasters ?? [],
          );
        const effectiveArtwork =
          trackArtwork ?? releaseArtwork;

        return [{
          key: `${detail.releaseId}::${trackId}`,
          source: buildAudioPreviewUrl(
            detail.releaseId,
            trackId,
          ),
          waveformUrl: buildLibraryWaveformUrl(
            detail.releaseId,
            trackId,
          ),
          releaseId: detail.releaseId,
          trackId,
          title,
          artist: releaseArtist || null,
          releaseTitle,
          detail:
            getAudioPreviewSourceLabel(scannedTrack),
          artworkUrl: effectiveArtwork
            ? artworkPreviewUrl(
                effectiveArtwork.relativePath,
              )
            : null,
        }];
      });
    };

  const toggleAudioPreviewTrack = (
    trackId: string,
  ) => {
    const queue = buildReleasePlaybackQueue();
    playback.toggleTrack(
      `${detail.releaseId}::${trackId}`,
      queue,
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
    selectReleaseFrontArtwork(
      release?.artworkMasters ?? [],
    );
  const isMetadataEmpty =
    detail.documents.length === 0;
  const inferredReleaseTitle =
    formatReleaseTitle(detail.releaseId);
  const releaseTitleDocument =
    releaseDocuments.find(
      (document) =>
        document.filename === "release.toml",
    );
  const authoredReleaseTitle =
    releaseTitleDocument
      ? readDocumentDraftString(
          releaseTitleDocument,
          "release.title",
          draft,
        )
      : "";
  const releaseDisplayTitle =
    resolveReleaseDisplayTitle(
      authoredReleaseTitle,
      inferredReleaseTitle,
    );
  const releaseRuntimeLabel =
    technicalSummary?.durationSeconds !== undefined
      ? formatDuration(technicalSummary.durationSeconds)
      : null;
  const authoredReleaseDate = releaseTitleDocument
    ? readDocumentDraftString(
        releaseTitleDocument,
        "release.dates.release",
        draft,
      )
    : "";
  const releaseRenameDate =
    /^\d{4}-\d{2}-\d{2}$/.test(authoredReleaseDate)
      ? authoredReleaseDate
      : detail.releaseId.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? "";
  const releaseRenameSuggestedId =
    buildReleaseDirectoryId(
      releaseRenameDate,
      releaseRenameTitle || releaseDisplayTitle,
    );

  useEffect(() => {
    let cancelled = false;

    setLibraryHealthLoading(true);
    setLibraryHealthError(null);
    setLibraryHealthOpen(false);

    void fetch(
      `/api/publish/plan?release=${encodeURIComponent(detail.releaseId)}`,
    )
      .then(async (response) => {
        const payload = (await response.json()) as
          | PublishPlan
          | { error?: string };

        if (
          !response.ok ||
          !("releaseId" in payload)
        ) {
          throw new Error(
            "error" in payload && payload.error
              ? payload.error
              : "Unable to load Library health checks.",
          );
        }

        if (!cancelled) {
          setLibraryHealthPlan(payload);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setLibraryHealthPlan(null);
          setLibraryHealthError(
            error instanceof Error
              ? error.message
              : "Unable to load Library health checks.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLibraryHealthLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [detail.releaseId, detail.documents]);

  const libraryHealthIssues =
    libraryHealthPlan?.issues ?? [];
  const libraryHealthSummary =
    summarizeLibraryHealthIssues(
      libraryHealthIssues,
    );
  const releaseRenameChangedItems =
    releaseRenamePlan?.items.filter(
      (item) => item.action !== "unchanged",
    ) ?? [];
  const releaseRenameUnchangedItems =
    releaseRenamePlan?.items.filter(
      (item) => item.action === "unchanged",
    ) ?? [];

  const openReleaseRename = () => {
    if (dirtyCount > 0) {
      setSaveError(
        "Save or discard browser metadata changes before reviewing a release directory rename.",
      );
      return;
    }

    setReleaseRenameTitle(releaseDisplayTitle);
    setReleaseRenameId(detail.releaseId);
    setReleaseRenamePlan(null);
    setReleaseRenameConfirmation("");
    setReleaseRenameError(null);
    setReleaseRenameOpen(true);
    setDetailMenuOpen(false);
  };

  const previewReleaseRename = async () => {
    setReleaseRenameLoading(true);
    setReleaseRenameError(null);

    try {
      const response = await fetch(
        "/api/library/release-rename-plan",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            releaseId: detail.releaseId,
            targetReleaseId: releaseRenameId,
            targetTitle: releaseRenameTitle,
          }),
        },
      );
      const result = (await response.json()) as
        | ReleaseRenamePlan
        | { error?: string };

      if (!response.ok) {
        throw new Error(
          "error" in result
            ? result.error ?? `Release rename plan failed: HTTP ${response.status}`
            : `Release rename plan failed: HTTP ${response.status}`,
        );
      }

      setReleaseRenamePlan(result as ReleaseRenamePlan);
      setReleaseRenameConfirmation("");
    } catch (error) {
      setReleaseRenameError(
        error instanceof Error
          ? error.message
          : "Unknown release rename planning error",
      );
    } finally {
      setReleaseRenameLoading(false);
    }
  };

  const applyReleaseRename = async () => {
    if (!releaseRenamePlan) {
      return;
    }

    setReleaseRenameLoading(true);
    setReleaseRenameError(null);

    try {
      const response = await fetch(
        "/api/library/apply-release-rename",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            releaseId: detail.releaseId,
            targetReleaseId: releaseRenamePlan.targetReleaseId,
            targetTitle: releaseRenamePlan.targetTitle,
            confirmation: releaseRenameConfirmation,
            planFingerprint: releaseRenamePlan.fingerprint,
          }),
        },
      );
      const result = (await response.json()) as
        | ReleaseRenameReceipt
        | { error?: string };

      if (!response.ok) {
        throw new Error(
          "error" in result
            ? result.error ?? `Release rename failed: HTTP ${response.status}`
            : `Release rename failed: HTTP ${response.status}`,
        );
      }

      const receipt = result as ReleaseRenameReceipt;
      setReleaseRenameOpen(false);
      setReleaseRenamePlan(null);
      setReleaseRenameConfirmation("");
      onNotify(
        receipt.releaseId === receipt.previousReleaseId
          ? "Release metadata identity synchronized"
          : `Release renamed to ${receipt.releaseId}`,
        "success",
      );
      await onReleaseRenamed(receipt.releaseId);
    } catch (error) {
      setReleaseRenameError(
        error instanceof Error
          ? error.message
          : "Unknown release rename error",
      );
    } finally {
      setReleaseRenameLoading(false);
    }
  };

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

      const title = readTrackDisplayTitle(
        trackId,
        trackDocuments,
        inferredTitle,
      );
      const discNumber =
        navigationEntry?.effectiveDiscNumber ?? 1;

      return {
        trackId,
        label: `${discPrefix}Track ${trackNumber} — ${title}`,
        discNumber,
        trackNumber,
        title,
      };
    });

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
          : "Metadata complete";

  const metadataHealthTone =
    isMetadataEmpty
      ? "missing"
      : detail.warnings.length > 0
        ? "warning"
        : metadataReadiness?.actionableCount
          ? "preview"
          : "complete";

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

  const returnToLibrary = () => {
    if (
      dirtyCount > 0 &&
      !window.confirm(
        "Discard all unsaved metadata changes and return to the library?",
      )
    ) {
      return;
    }

    onBack();
  };

  const navigateFromRelease = (
    view: WorkflowApplicationView,
  ) => {
    if (view === "library") {
      returnToLibrary();
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

  return (
    <section className="metadata-detail">
      <header className="metadata-detail-header">
        <div className="metadata-detail-identity">
          <button
            type="button"
            className="page-header-brand metadata-detail-home-button"
            aria-label="Hiplingo · Back to Library"
            title="Back to Library"
            onClick={returnToLibrary}
          >
            <img
              className="hiplingo-logo"
              src={hiplingoLogoUrl}
              alt=""
              aria-hidden="true"
            />
          </button>

          <span
            className="metadata-detail-artwork"
            aria-hidden="true"
          >
            {releaseArtwork ? (
              <img
                src={artworkPreviewUrl(
                  releaseArtwork.relativePath,
                )}
                alt=""
              />
            ) : (
              <img
                className="hiplingo-artwork-fallback"
                src={hiplingoLogoUrl}
                alt=""
                aria-hidden="true"
              />
            )}
          </span>

          <div>
            <h1>{releaseDisplayTitle}</h1>

            <p className="metadata-detail-date">
              {releaseDateLabel}
            </p>

            <p className="metadata-detail-location">
              <span>Library</span>
              <code>
                {`${workflowLocations.find((location) => location.id === "library")?.displayPath ?? "Library root"}/${release?.relativePath ?? `releases/${detail.releaseId}`}`}
              </code>
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
                {detail.warnings.length} metadata warnings
              </span>

              <TechnicalHealthBadge
                summary={technicalSummary}
                loading={technicalAudit.loading}
                error={technicalAudit.error}
              />

              <button
                type="button"
                className={`library-health-toggle badge ${libraryHealthTone(
                  libraryHealthSummary,
                )}`}
                aria-expanded={libraryHealthOpen}
                disabled={libraryHealthLoading}
                title={
                  libraryHealthError ??
                  libraryHealthTitle(
                    libraryHealthSummary,
                  )
                }
                onClick={() =>
                  setLibraryHealthOpen(
                    (current) => !current,
                  )
                }
              >
                {libraryHealthLoading
                  ? "Checking health…"
                  : libraryHealthError
                    ? "Health unavailable"
                    : libraryHealthTitle(
                        libraryHealthSummary,
                      )}
              </button>
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
              <h2>Release identity &amp; directory</h2>
              <p>
                Review a guarded plan that synchronizes the release title,
                release ID, reference TOMLs, staging receipt, and the OS-level
                release directory without overwriting an existing target.
              </p>
              <button
                type="button"
                disabled={dirtyCount > 0}
                onClick={openReleaseRename}
              >
                Review release rename
              </button>
              {dirtyCount > 0 && (
                <p className="menu-meta">
                  Save or discard browser edits first.
                </p>
              )}
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

            <Suspense
              fallback={
                <section className="menu-card">
                  <p className="menu-meta">
                    Loading waveform controls…
                  </p>
                </section>
              }
            >
              <LazyWaveformColorMenuCard
                playback={playback}
                colorMode={waveformColorMode}
                onColorModeChange={onWaveformColorModeChange}
              />
            </Suspense>

            <section className="menu-card">
              <h2>Admin</h2>
              <label className="admin-toggle">
                <input
                  type="checkbox"
                  autoComplete="off"
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
                Disabled by default on every page load.
                Enable temporarily for troubleshooting controls,
                source paths, settings, and raw TOML.
              </p>
            </section>
          </aside>
        )}
      </header>

      {libraryHealthOpen && (
        <section
          className="library-health-panel"
          aria-label="Release health details"
        >
          <header className="library-health-panel-header">
            <div>
              <h2>Release health</h2>
              <p>
                Read-only checks from the same current release plan used by
                Web Package Ready Check. Health describes actionable state; source
                provenance remains separate.
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                navigateFromRelease("public-package")
              }
            >
              Open Web Package Ready Check
            </button>
          </header>

          <TechnicalReleaseInspector
            summary={technicalSummary}
            audit={technicalAudit}
          />

          <div className="library-health-bubbles">
            <span
              className={`badge ${
                libraryHealthSummary.blocked > 0
                  ? "missing"
                  : "success"
              }`}
            >
              {libraryHealthSummary.blocked} blocking issue
              {libraryHealthSummary.blocked === 1 ? "" : "s"}
            </span>
            <span
              className={`badge ${
                libraryHealthSummary.warning > 0
                  ? "warning"
                  : "success"
              }`}
            >
              {libraryHealthSummary.warning} warning
              {libraryHealthSummary.warning === 1 ? "" : "s"}
            </span>
            <span
              className={`badge ${
                libraryHealthSummary.preparation > 0
                  ? "preview"
                  : "success"
              }`}
            >
              {libraryHealthSummary.preparation} preparation item
              {libraryHealthSummary.preparation === 1 ? "" : "s"}
            </span>
          </div>

          {libraryHealthError ? (
            <p className="message warning">
              {libraryHealthError}
            </p>
          ) : libraryHealthIssues.length === 0 ? (
            <p className="library-health-empty">
              No current structural, warning, or preparation issues were found.
            </p>
          ) : (
            <div className="library-health-groups">
              {(
                [
                  ["blocked", "Blocking issues"],
                  ["warning", "Warnings"],
                  ["preparation", "Preparation / freshness"],
                ] as const
              ).map(([bucket, label]) => {
                const issues =
                  libraryHealthIssues.filter(
                    (issue) =>
                      libraryHealthBucket(issue) ===
                      bucket,
                  );

                if (issues.length === 0) {
                  return null;
                }

                return (
                  <details
                    key={bucket}
                    open={bucket === "blocked"}
                  >
                    <summary>
                      <span>{label}</span>
                      <small>{issues.length}</small>
                    </summary>
                    <ul>
                      {issues.map((issue, index) => (
                        <li
                          key={`${issue.code}:${issue.relativePath}:${index}`}
                        >
                          <span
                            className={`badge ${
                              bucket === "blocked"
                                ? "missing"
                                : bucket === "warning"
                                  ? "warning"
                                  : "preview"
                            }`}
                          >
                            {issue.code}
                          </span>
                          <div>
                            <strong>{issue.message}</strong>
                            <code>{issue.relativePath}</code>
                            {issue.suggestion && (
                              <small>
                                {issue.suggestion}
                              </small>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </details>
                );
              })}
            </div>
          )}
        </section>
      )}

      <WorkflowNavigation
        activeView="library"
        locations={workflowLocations}
        onNavigate={navigateFromRelease}
      />

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

      {(isMetadataEmpty || dirtyCount > 0) && (
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
            {isMetadataEmpty ? (
              <strong>Metadata setup required</strong>
            ) : (
              <>
                <span>
                  Unsaved changes:{" "}
                  <strong>{dirtyCount}</strong>
                </span>
                <span className="badge unsaved">
                  Unsaved browser changes
                </span>
              </>
            )}
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
            ) : (
              <>
                <button
                  type="button"
                  className="primary-action"
                  disabled={
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
              </>
            )}
          </div>
        </section>
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

      {pendingTrackDirectoryRenames.length > 0 && (
        <section
          className="track-directory-rename-notice"
          aria-label="Planned track directory renames"
        >
          <div className="track-directory-rename-heading">
            <div>
              <strong>
                Track directory names follow saved track numbers
              </strong>
              <span>
                {dirtyCount > 0
                  ? "Save edits first. Directory changes require a separate reviewed synchronization."
                  : "The saved numbering and directory sequence differ. Review the server dry-run plan before changing folders."}
              </span>
            </div>
            <button
              type="button"
              disabled={
                dirtyCount > 0 ||
                synchronizingTrackDirectories
              }
              onClick={() =>
                void synchronizePendingTrackDirectories()
              }
            >
              {synchronizingTrackDirectories
                ? "Loading dry-run plan…"
                : "Review directory rename plan"}
            </button>
          </div>

          <div className="track-directory-rename-table-wrap">
            <table className="track-directory-rename-table">
              <thead>
                <tr>
                  <th>Current directory</th>
                  <th>Planned directory</th>
                </tr>
              </thead>
              <tbody>
                {pendingTrackDirectoryRenames.map(
                  (item) => (
                    <tr key={item.previousTrackId}>
                      <td>
                        <code>{item.previousTrackId}</code>
                      </td>
                      <td>
                        <code>{item.trackId}</code>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>

          {trackDirectoryTargetConflicts.length > 0 && (
            <div
              className="track-directory-target-conflicts"
              role="alert"
            >
              <strong>Directory target collision</strong>
              <ul>
                {trackDirectoryTargetConflicts.map(
                  (group) => (
                    <li key={group[0]?.trackId}>
                      <code>{group[0]?.trackId}</code> would be used by {group.map(
                        (item) => item.previousTrackId,
                      ).join(", ")}
                    </li>
                  ),
                )}
              </ul>
            </div>
          )}

          <p>
            Saving metadata does not rename folders. Existing targets are never overwritten. Confirmed swaps use temporary names, an operation manifest, TOML backups, and rollback protection.
          </p>
        </section>
      )}

      {releaseRenameOpen && (
        <MetadataFieldModal
          title="Review release identity and directory"
          onClose={() => {
            if (releaseRenameLoading) return;
            setReleaseRenameOpen(false);
            setReleaseRenamePlan(null);
            setReleaseRenameConfirmation("");
            setReleaseRenameError(null);
          }}
        >
          <section className="release-rename-review metadata-field-full-width">
            <div className="release-rename-inputs">
              <label>
                <span>Release title</span>
                <input
                  type="text"
                  value={releaseRenameTitle}
                  disabled={releaseRenameLoading || releaseRenamePlan !== null}
                  onChange={(event) => {
                    setReleaseRenameTitle(event.target.value);
                    setReleaseRenamePlan(null);
                  }}
                />
              </label>

              <label>
                <span>Release directory ID</span>
                <input
                  type="text"
                  value={releaseRenameId}
                  disabled={releaseRenameLoading || releaseRenamePlan !== null}
                  spellCheck={false}
                  onChange={(event) => {
                    setReleaseRenameId(event.target.value);
                    setReleaseRenamePlan(null);
                  }}
                />
              </label>

              <button
                type="button"
                disabled={
                  releaseRenameLoading ||
                  releaseRenamePlan !== null ||
                  releaseRenameId === releaseRenameSuggestedId
                }
                onClick={() => setReleaseRenameId(releaseRenameSuggestedId)}
              >
                Use date + title ID
              </button>
            </div>

            <dl className="release-rename-path-summary">
              <div>
                <dt>Current</dt>
                <dd><code>{release?.relativePath ?? `releases/${detail.releaseId}`}</code></dd>
              </div>
              <div>
                <dt>Proposed</dt>
                <dd><code>{`releases/${releaseRenameId || "…"}`}</code></dd>
              </div>
            </dl>

            {!releaseRenamePlan ? (
              <>
                <p>
                  Previewing is read-only. The server checks case-insensitive
                  directory collisions, parses every TOML, and identifies the
                  staging receipt changes before any file is moved.
                </p>
                <div className="release-rename-actions">
                  <button
                    type="button"
                    disabled={releaseRenameLoading}
                    onClick={() => {
                      setReleaseRenameOpen(false);
                      setReleaseRenameError(null);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="primary-action"
                    disabled={
                      releaseRenameLoading ||
                      !releaseRenameTitle.trim() ||
                      !releaseRenameId.trim()
                    }
                    onClick={() => void previewReleaseRename()}
                  >
                    {releaseRenameLoading
                      ? "Building dry-run plan…"
                      : "Preview release rename plan"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="track-directory-rename-review-summary">
                  <div>
                    <strong>Server dry-run plan</strong>
                    <span>
                      {releaseRenamePlan.summary.renameCount} directory rename
                      {" · "}
                      {releaseRenamePlan.summary.updateCount} metadata update
                      {releaseRenamePlan.summary.updateCount === 1 ? "" : "s"}
                      {" · "}
                      {releaseRenamePlan.summary.blockedCount} blocked
                    </span>
                  </div>
                  <code title={releaseRenamePlan.fingerprint}>
                    Plan {releaseRenamePlan.fingerprint.slice(0, 12)}…
                  </code>
                </div>

                <section className="release-rename-change-set">
                  <header>
                    <div>
                      <h3>Changes</h3>
                      <p>
                        Only files that will move, change, or block the
                        operation are expanded here.
                      </p>
                    </div>
                    <span className="metadata-health-count">
                      {releaseRenameChangedItems.length} actionable
                    </span>
                  </header>

                  {releaseRenameChangedItems.length === 0 ? (
                    <p className="release-rename-no-changes">
                      ✓ No file or metadata changes are required.
                    </p>
                  ) : (
                    <div className="release-rename-change-list">
                      {releaseRenameChangedItems.map((item) => (
                        <article
                          key={`${item.kind}:${item.relativePath}`}
                          className={[
                            "release-rename-change-card",
                            item.action === "blocked"
                              ? "is-blocked"
                              : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          <div className="release-rename-change-card-heading">
                            <span
                              className={`badge ${
                                item.action === "blocked"
                                  ? "missing"
                                  : "preview"
                              }`}
                            >
                              {item.action}
                            </span>
                            <strong>{item.kind}</strong>
                          </div>

                          <div className="release-rename-change-paths">
                            <code>{item.relativePath}</code>
                            {item.targetRelativePath !==
                              item.relativePath && (
                              <>
                                <span aria-hidden="true">→</span>
                                <code>
                                  {item.targetRelativePath}
                                </code>
                              </>
                            )}
                          </div>

                          <p>{item.reason}</p>
                        </article>
                      ))}
                    </div>
                  )}
                </section>

                {releaseRenameUnchangedItems.length > 0 && (
                  <details className="release-rename-verified">
                    <summary>
                      <span>
                        ✓ Verified unchanged files
                      </span>
                      <small>
                        {releaseRenameUnchangedItems.length}
                      </small>
                    </summary>
                    <div>
                      <ul>
                        {releaseRenameUnchangedItems.map(
                          (item) => (
                            <li
                              key={`${item.kind}:${item.relativePath}`}
                            >
                              <code>
                                {item.relativePath}
                              </code>
                              <span>{item.reason}</span>
                            </li>
                          ),
                        )}
                      </ul>
                    </div>
                  </details>
                )}

                <details className="release-rename-technical-plan">
                  <summary>
                    <span>Technical plan details</span>
                    <small>
                      {releaseRenamePlan.items.length} items
                    </small>
                  </summary>
                  <div className="track-directory-rename-review-table-wrap">
                    <table className="track-directory-rename-review-table release-rename-plan-table">
                      <thead>
                        <tr>
                          <th>Kind</th>
                          <th>Action</th>
                          <th>Current</th>
                          <th>Target</th>
                          <th>Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {releaseRenamePlan.items.map((item) => (
                          <tr
                            key={`${item.kind}:${item.relativePath}`}
                            className={
                              item.action === "blocked"
                                ? "blocked"
                                : undefined
                            }
                          >
                            <td>{item.kind}</td>
                            <td>
                              <span
                                className={`badge ${
                                  item.action === "blocked"
                                    ? "blocked"
                                    : item.action === "unchanged"
                                      ? "optional"
                                      : "preview"
                                }`}
                              >
                                {item.action}
                              </span>
                            </td>
                            <td>
                              <code>{item.relativePath}</code>
                            </td>
                            <td>
                              <code>
                                {item.targetRelativePath}
                              </code>
                            </td>
                            <td>{item.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>

                <p>
                  Apply revalidates this exact plan, creates an operation
                  manifest and backups, updates release.id, release.title and
                  release_reference.release_id values, updates the staging
                  receipt, then performs the OS-level directory move. A failure
                  triggers rollback.
                </p>

                {releaseRenamePlan.summary.blockedCount > 0 ? (
                  <p className="message error" role="alert">
                    This plan is blocked. Resolve the listed issue and preview
                    a new plan.
                  </p>
                ) : (
                  <label className="track-directory-rename-confirmation">
                    <span>
                      Type <code>{releaseRenamePlan.confirmation}</code> to
                      confirm this filesystem operation.
                    </span>
                    <input
                      type="text"
                      value={releaseRenameConfirmation}
                      autoComplete="off"
                      spellCheck={false}
                      disabled={releaseRenameLoading}
                      onChange={(event) =>
                        setReleaseRenameConfirmation(event.target.value)
                      }
                    />
                  </label>
                )}

                <div className="release-rename-actions">
                  <button
                    type="button"
                    disabled={releaseRenameLoading}
                    onClick={() => {
                      setReleaseRenamePlan(null);
                      setReleaseRenameConfirmation("");
                      setReleaseRenameError(null);
                    }}
                  >
                    Edit proposal
                  </button>
                  <button
                    type="button"
                    className="primary-action"
                    disabled={
                      releaseRenameLoading ||
                      releaseRenamePlan.summary.blockedCount > 0 ||
                      releaseRenameConfirmation !== releaseRenamePlan.confirmation
                    }
                    onClick={() => void applyReleaseRename()}
                  >
                    {releaseRenameLoading
                      ? "Applying guarded release rename…"
                      : "Apply reviewed release rename"}
                  </button>
                </div>
              </>
            )}

            {releaseRenameError && (
              <p className="message error" role="alert">
                {releaseRenameError}
              </p>
            )}
          </section>
        </MetadataFieldModal>
      )}

      {trackDirectoryRenameReview && (
        <MetadataFieldModal
          title="Review track directory synchronization"
          onClose={() => {
            if (synchronizingTrackDirectories) return;
            setTrackDirectoryRenameReview(null);
            setTrackDirectoryRenameConfirmationInput("");
          }}
        >
          <section className="track-directory-rename-review metadata-field-full-width">
            <div className="track-directory-rename-review-summary">
              <div>
                <strong>Server dry-run plan</strong>
                <span>
                  {trackDirectoryRenameReview.summary.renameCount} rename{trackDirectoryRenameReview.summary.renameCount === 1 ? "" : "s"}
                  {" · "}
                  {trackDirectoryRenameReview.summary.blockedCount} blocked
                </span>
              </div>
              <code title={trackDirectoryRenameReview.fingerprint}>
                Plan {trackDirectoryRenameReview.fingerprint.slice(0, 12)}…
              </code>
            </div>

            <p>
              This exact plan will be revalidated immediately before any directory is moved. If the release changes, the server rejects the stale plan and requires another review.
            </p>

            <div className="track-directory-rename-review-table-wrap">
              <table className="track-directory-rename-review-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Current directory</th>
                    <th>Target directory</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {trackDirectoryRenameReview.items
                    .filter((item) => item.action !== "unchanged")
                    .map((item) => (
                      <tr
                        key={item.trackId}
                        className={item.action === "blocked" ? "blocked" : undefined}
                      >
                        <td>
                          <span className={`badge ${item.action === "blocked" ? "blocked" : "preview"}`}>
                            {item.action}
                          </span>
                        </td>
                        <td><code>{item.trackId}</code></td>
                        <td><code>{item.targetId}</code></td>
                        <td>{item.reason}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {trackDirectoryRenameReview.summary.blockedCount > 0 ? (
              <p className="message error" role="alert">
                This plan is blocked. Close the review, resolve the listed conflicts, and load a new dry-run plan.
              </p>
            ) : (
              <label className="track-directory-rename-confirmation">
                <span>
                  Type <code>{trackDirectoryRenameReview.confirmation}</code> to confirm this filesystem operation.
                </span>
                <input
                  type="text"
                  value={trackDirectoryRenameConfirmationInput}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={synchronizingTrackDirectories}
                  onChange={(event) =>
                    setTrackDirectoryRenameConfirmationInput(event.target.value)
                  }
                />
              </label>
            )}

            <div className="track-directory-rename-review-actions">
              <button
                type="button"
                disabled={synchronizingTrackDirectories}
                onClick={() => {
                  setTrackDirectoryRenameReview(null);
                  setTrackDirectoryRenameConfirmationInput("");
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-action"
                disabled={
                  synchronizingTrackDirectories ||
                  trackDirectoryRenameReview.summary.blockedCount > 0 ||
                  trackDirectoryRenameConfirmationInput !==
                    trackDirectoryRenameReview.confirmation
                }
                onClick={() => void confirmTrackDirectoryRenames()}
              >
                {synchronizingTrackDirectories
                  ? "Applying guarded rename…"
                  : "Apply reviewed directory renames"}
              </button>
            </div>
          </section>
        </MetadataFieldModal>
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

      <div
        className="release-metadata-workspace"
        style={metadataWorkspaceStyle}
      >
        <nav
          ref={metadataSidebarRef}
          className="metadata-document-tabs"
          aria-label="Metadata document groups"
          aria-keyshortcuts="ArrowUp ArrowDown"
          data-metadata-sidebar-navigation="true"
        >
        <button
          type="button"
          data-metadata-navigation-id="release"
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
            <small>{releaseDisplayTitle}</small>
            {releaseRuntimeLabel && (
              <small className="release-navigation-runtime">
                Run time · {releaseRuntimeLabel}
              </small>
            )}
          </span>

          {!libraryHealthLoading &&
            !libraryHealthError &&
            (libraryHealthSummary.blocked > 0 ||
              libraryHealthSummary.warning > 0 ||
              libraryHealthSummary.preparation > 0) && (
              <small
                className={`badge library-health-row-badge ${libraryHealthTone(
                  libraryHealthSummary,
                )}`}
                title={libraryHealthTitle(
                  libraryHealthSummary,
                )}
                aria-label={libraryHealthTitle(
                  libraryHealthSummary,
                )}
              >
                {libraryHealthCompactLabel(
                  libraryHealthSummary,
                )}
              </small>
            )}

          <ReadinessNavBadge
            scope={releaseReadinessScope}
            skippedPaths={skippedReadinessPathSet}
            showComplete
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
          const trackNumberLabel =
            navigationEntry &&
            navigationEntry.effectiveDiscNumber > 1
              ? `${navigationEntry.effectiveDiscNumber}.${trackNumber}.`
              : `${trackNumber}.`;
          const trackNavigationLabel =
            navigationEntry &&
            navigationEntry.effectiveDiscNumber > 1
              ? `Disc ${navigationEntry.effectiveDiscNumber}, track ${trackNumber}`
              : `Track ${trackNumber}`;
          const numberConflictTitle =
            navigationEntry?.hasNumberConflict
              ? `Duplicate track number ${trackNumber} on disc ${navigationEntry.effectiveDiscNumber}`
              : undefined;

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
          const trackHealthIssues =
            scannedTrack
              ? libraryHealthIssues.filter(
                  (issue) =>
                    issue.relativePath ===
                      scannedTrack.relativePath ||
                    issue.relativePath.startsWith(
                      `${scannedTrack.relativePath}/`,
                    ),
                )
              : [];
          const trackHealthSummary =
            summarizeLibraryHealthIssues(
              trackHealthIssues,
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
          const trackDisplayTitle =
            readTrackDisplayTitle(
              trackId,
              trackDocuments,
              inferredTracks.find(
                (track) =>
                  track.id === trackId,
              )?.displayTitle ??
                formatReleaseTitle(trackId),
            );
          const trackArtwork =
            selectPreferredReleaseArtwork(
              scannedTrack?.artworkMasters ?? [],
            );
          const effectiveTrackArtwork =
            trackArtwork ?? releaseArtwork;
          const trackArtworkIsInherited =
            !trackArtwork && Boolean(releaseArtwork);

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
                data-metadata-navigation-id={trackId}
                className="metadata-document-select track-document-select"
                aria-pressed={
                  activeDocumentGroup ===
                  trackId
                }
                title={trackId}
                aria-label={`${trackNumberLabel} ${trackDisplayTitle}`}
                onClick={() =>
                  setActiveDocumentGroup(
                    trackId,
                  )
                }
              >
                <span className="track-navigation-row">
                  <span
                    className={[
                      "track-navigation-artwork",
                      effectiveTrackArtwork ? "" : "is-empty",
                      trackArtworkIsInherited ? "is-inherited" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    role={effectiveTrackArtwork ? "img" : undefined}
                    aria-label={
                      effectiveTrackArtwork
                        ? trackArtworkIsInherited
                          ? "Inherited release artwork"
                          : "Track-specific artwork"
                        : undefined
                    }
                    title={
                      effectiveTrackArtwork
                        ? trackArtworkIsInherited
                          ? "Inherited release artwork"
                          : "Track-specific artwork"
                        : undefined
                    }
                  >
                    {effectiveTrackArtwork ? (
                      <img
                        src={artworkPreviewUrl(
                          effectiveTrackArtwork.relativePath,
                        )}
                        alt=""
                        loading="lazy"
                      />
                    ) : null}
                    {trackArtworkIsInherited && (
                      <small
                        className="track-navigation-artwork-scope"
                        aria-hidden="true"
                      >
                        R
                      </small>
                    )}
                  </span>

                  <span className="document-nav-label track-document-nav-label">
                    <span className="track-navigation-heading">
                      <span className="track-navigation-primary">
                        <strong className="track-navigation-number">
                          {trackNumberLabel}
                        </strong>
                        <span className="track-navigation-title">
                          {trackDisplayTitle}
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
                      </span>

                      <span
                        className="track-navigation-badges"
                        aria-label="Track status"
                      >
                        {!libraryHealthLoading &&
                          !libraryHealthError &&
                          trackHealthIssues.length > 0 && (
                            <small
                              className={`badge library-health-row-badge ${libraryHealthTone(
                                trackHealthSummary,
                              )}`}
                              title={libraryHealthTitle(
                                trackHealthSummary,
                              )}
                              aria-label={libraryHealthTitle(
                                trackHealthSummary,
                              )}
                            >
                              {libraryHealthCompactLabel(
                                trackHealthSummary,
                              )}
                            </small>
                          )}

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
                  </span>
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

        <div
          className="metadata-sidebar-resize-handle"
          role="separator"
          aria-label="Resize release and track sidebar"
          aria-orientation="vertical"
          aria-valuemin={MIN_METADATA_SIDEBAR_WIDTH_REM}
          aria-valuemax={MAX_METADATA_SIDEBAR_WIDTH_REM}
          aria-valuenow={metadataSidebarWidthRem}
          aria-valuetext={`${metadataSidebarWidthRem.toFixed(1)} rem`}
          aria-keyshortcuts="ArrowLeft ArrowRight Home"
          tabIndex={0}
          title="Drag to resize. Arrow keys adjust width; Home or double-click resets."
          onDoubleClick={resetMetadataSidebarWidth}
          onKeyDown={handleMetadataSidebarResizeKeyDown}
          onPointerDown={
            handleMetadataSidebarResizePointerDown
          }
          onPointerMove={
            handleMetadataSidebarResizePointerMove
          }
          onPointerUp={
            handleMetadataSidebarResizePointerEnd
          }
          onPointerCancel={
            handleMetadataSidebarResizePointerEnd
          }
        />

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

export {
  METADATA_SIDEBAR_WIDTH_STORAGE_KEY,
  DEFAULT_METADATA_SIDEBAR_WIDTH_REM,
  MIN_METADATA_SIDEBAR_WIDTH_REM,
  MAX_METADATA_SIDEBAR_WIDTH_REM,
  METADATA_SIDEBAR_WIDTH_STEP_REM,
  clampMetadataSidebarWidth,
  readMetadataSidebarWidth,
  ReleaseMetadataDetailView,
  type InferredTrackSummary,
};
