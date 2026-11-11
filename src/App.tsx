import "@hiplingo/media-player/compact-now-playing-bar.css";
import "@hiplingo/media-player/listener-metadata-viewer.css";
import "@hiplingo/media-player/provenance-badge.css";
import "./listener-metadata-viewer-host.css";
import { hiplingoLogoUrl } from "@hiplingo/brand";
import {
  ListenerMetadataViewer,
  type ListenerMetadataRelease,
  type ListenerMetadataTrack,
  type MetadataVerbosity,
} from "@hiplingo/media-player";
import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { buildLibraryMetadataPreview } from "./library-metadata-preview.js";
import {
  PersistentLibraryPlayerBar,
  usePersistentLibraryPlayback,
} from "./PersistentLibraryPlayer.js";
import {
  WAVEFORM_COLOR_OPTIONS,
  type WaveformColorMode,
} from "./media-waveform.js";
import { summarizeReleaseScanReadiness } from "./metadata-readiness.js";
import type {
  IngestCandidateInspection,
  IngestScanResult,
} from "../shared/ingest-types.js";
import {
  WorkflowNavigation,
  type WorkflowApplicationView,
} from "./WorkflowNavigation.js";
import { resolveReleaseDisplayTitle } from "./release-display-title.js";
import { mergeIngestIdentityEvidence } from "./ingest-identity-source.js";
import type {
  ApplicationView,
  IngestStagingIdentitySeed,
  InterfaceAccentMode,
  LibraryScanResult,
  MediaTechnicalAuditResult,
  MediaTechnicalAuditState,
  MetadataEditorFocusTarget,
  MetadataFieldDefinition,
  MetadataRegistryResponse,
  PendingMetadataFocusRequest,
  ReleaseMetadataDetail,
  ToastMessage,
  WorkflowHelpReturnTarget,
  WorkflowLocationWithSize,
  WorkflowLocationsResponse,
} from "./app/types.js";
import {
  INTERFACE_ACCENT_OPTIONS,
  INTERFACE_ACCENT_STORAGE_KEY,
  LazyScannerWarningPanel,
  LazyWaveformColorMenuCard,
  LazyWorkflowHelpView,
  formatByteSize,
} from "./app/foundation.js";
import {
  IngestView,
  type LibraryEntityView,
} from "./app/ingest-views.js";
import {
  LibraryArtistRoster,
  LibraryEntitySwitcher,
  LibraryReleaseBrowser,
  LibraryReleaseOverview,
  type LibraryReleaseViewMode,
} from "./app/library-views.js";
import {
  MetadataCompatibilityView,
} from "./app/MetadataCompatibilityView.js";
import {
  PublishWorkspace,
} from "./app/PublishWorkspace.js";
import {
  ReleaseMetadataDetailView,
} from "./app/ReleaseMetadataDetailView.js";
import {
  StagingWorkspace,
} from "./app/StagingWorkspace.js";
import {
  formatReleaseTitle,
} from "./app/release-display.js";

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
  const [ingestIdentityOverride, setIngestIdentityOverride] =
    useState<IngestStagingIdentitySeed | null>(null);
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
  const [workflowLocations, setWorkflowLocations] =
    useState<WorkflowLocationWithSize[]>([]);
  const [mediaTechnicalAudit, setMediaTechnicalAudit] =
    useState<MediaTechnicalAuditState>({
      result: null,
      loading: false,
      error: null,
    });
  const [applicationView, setApplicationView] =
    useState<ApplicationView>("library");
  const [libraryReleaseViewMode, setLibraryReleaseViewMode] =
    useState<LibraryReleaseViewMode>("tiles");
  const [artistReleaseViewMode, setArtistReleaseViewMode] =
    useState<LibraryReleaseViewMode>("tiles");
  const [selectedReleaseDetailMode, setSelectedReleaseDetailMode] =
    useState<"overview" | "metadata">("overview");
  const [
    pendingMetadataFocus,
    setPendingMetadataFocus,
  ] = useState<PendingMetadataFocusRequest | null>(
    null,
  );
  const [libraryEntityView, setLibraryEntityView] =
    useState<LibraryEntityView>("releases");
  const [selectedLibraryArtistId, setSelectedLibraryArtistId] =
    useState<string | null>(null);
  const libraryPlayback =
    usePersistentLibraryPlayback();

  const metadataPreviewButtonRef =
    useRef<HTMLButtonElement | null>(null);

  const [
    libraryMetadataPreviewOpen,
    setLibraryMetadataPreviewOpen,
  ] = useState(false);

  const [
    libraryMetadataPreviewVerbosity,
    setLibraryMetadataPreviewVerbosity,
  ] = useState<MetadataVerbosity>(
    "summary",
  );

  const [
    libraryMetadataPreviewLoading,
    setLibraryMetadataPreviewLoading,
  ] = useState(false);

  const [
    libraryMetadataPreviewData,
    setLibraryMetadataPreviewData,
  ] = useState<{
    release: ListenerMetadataRelease;
    track: ListenerMetadataTrack;
  } | null>(null);
  const [waveformColorMode, setWaveformColorMode] =
    useState<WaveformColorMode>(() => {
      try {
        const stored = window.localStorage.getItem(
          "metadata-editor.waveform-color-v1",
        );
        return WAVEFORM_COLOR_OPTIONS.some(
          (option) => option.value === stored,
        )
          ? stored as WaveformColorMode
          : "3band";
      } catch {
        return "3band";
      }
    });
  const [interfaceAccentMode, setInterfaceAccentMode] =
    useState<InterfaceAccentMode>(() => {
      try {
        const stored = window.localStorage.getItem(
          INTERFACE_ACCENT_STORAGE_KEY,
        );
        return INTERFACE_ACCENT_OPTIONS.some(
          (option) => option.value === stored,
        )
          ? stored as InterfaceAccentMode
          : "gray";
      } catch {
        return "gray";
      }
    });
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
        }, 4200);
    },
    [],
  );

  const dismissToast = useCallback(() => {
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }

    setToast(null);
  }, []);

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
  const chooseWaveformColorMode = (mode: WaveformColorMode) => {
    setWaveformColorMode(mode);
    try {
      window.localStorage.setItem(
        "metadata-editor.waveform-color-v1",
        mode,
      );
    } catch {
      // Waveform color persistence is optional UI convenience.
    }
  };
  const chooseInterfaceAccentMode = (mode: InterfaceAccentMode) => {
    setInterfaceAccentMode(mode);
    try {
      window.localStorage.setItem(
        INTERFACE_ACCENT_STORAGE_KEY,
        mode,
      );
    } catch {
      // Accent persistence is optional UI convenience.
    }
  };

  useLayoutEffect(() => {
    document.documentElement.dataset.interfaceAccent =
      interfaceAccentMode;
  }, [interfaceAccentMode]);
  // Admin mode is opt-in and never survives a page load or restored page.
  const [showAdminTools, setShowAdminTools] =
    useState(false);

  useLayoutEffect(() => {
    setShowAdminTools(false);

    try {
      window.localStorage.removeItem(
        "metadata-editor.show-admin-tools-v2",
      );
      window.sessionStorage.removeItem(
        "metadata-editor.show-admin-tools-v2",
      );
    } catch {
      // Browser storage may be unavailable; the in-memory default is still off.
    }
  }, []);

  useEffect(() => {
    const disableAdminToolsOnPageRestore = () => {
      setShowAdminTools(false);
    };

    window.addEventListener(
      "pageshow",
      disableAdminToolsOnPageRestore,
    );

    return () => {
      window.removeEventListener(
        "pageshow",
        disableAdminToolsOnPageRestore,
      );
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    void fetch("/api/workflow/locations")
      .then(async (response) => {
        const result = (await response.json()) as
          | WorkflowLocationsResponse
          | { error?: string };

        if (!response.ok) {
          throw new Error(
            "error" in result
              ? result.error ?? `Workflow location request failed: HTTP ${response.status}`
              : `Workflow location request failed: HTTP ${response.status}`,
          );
        }

        if (!cancelled) {
          setWorkflowLocations(
            (result as WorkflowLocationsResponse).locations,
          );
        }
      })
      .catch(() => {
        if (!cancelled) {
          setWorkflowLocations([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [scan?.scannedAt]);

  useEffect(() => {
    if (!scan || scan.releases.length === 0) {
      setMediaTechnicalAudit({
        result: null,
        loading: false,
        error: null,
      });
      return;
    }

    const controller = new AbortController();

    setMediaTechnicalAudit((current) => ({
      ...current,
      loading: true,
      error: null,
    }));

    void fetch("/api/library/media-technical", {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = (await response.json()) as
          | MediaTechnicalAuditResult
          | { error?: string };

        if (
          !response.ok ||
          !("healthSummary" in payload) ||
          !("contract" in payload)
        ) {
          throw new Error(
            "error" in payload && payload.error
              ? payload.error
              : "Unable to load technical media health.",
          );
        }

        setMediaTechnicalAudit({
          result: payload,
          loading: false,
          error: null,
        });
      })
      .catch((technicalError) => {
        if (controller.signal.aborted) {
          return;
        }

        setMediaTechnicalAudit({
          result: null,
          loading: false,
          error:
            technicalError instanceof Error
              ? technicalError.message
              : "Unable to load technical media health.",
        });
      });

    return () => controller.abort();
  }, [scan?.scannedAt]);

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

  const openReleaseOverview = useCallback(async (
    releaseId: string,
  ) => {
    setSelectedReleaseDetailMode("overview");
    await openReleaseDetail(releaseId);
  }, [openReleaseDetail]);

  const openReleaseMetadata = useCallback(async (
    releaseId: string,
  ) => {
    setSelectedReleaseDetailMode("metadata");
    await openReleaseDetail(releaseId);
  }, [openReleaseDetail]);


  const openCurrentTrackMetadataPreview =
    useCallback(async () => {
      const currentTrack =
        libraryPlayback.currentTrack;

      if (
        !currentTrack?.releaseId ||
        !currentTrack.trackId
      ) {
        return;
      }

      const release =
        scan?.releases.find(
          (candidate) =>
            candidate.id ===
            currentTrack.releaseId,
        );

      if (!release) {
        notify(
          "Track metadata preview is available for Library-backed tracks.",
          "info",
        );
        return;
      }

      setLibraryMetadataPreviewLoading(
        true,
      );

      try {
        let detail =
          selectedReleaseDetail
            ?.releaseId ===
          release.id
            ? selectedReleaseDetail
            : null;

        if (!detail) {
          const query =
            new URLSearchParams({
              release:
                release.id,
            });

          const response =
            await fetch(
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

          detail =
            result as
              ReleaseMetadataDetail;
        }

        const preview =
          buildLibraryMetadataPreview({
            detail,
            release: {
              id:
                release.id,
              title:
                resolveReleaseDisplayTitle(
                  release.releaseTitle,
                  formatReleaseTitle(
                    release.id,
                  ),
                ),
              artist:
                release.primaryArtistName
                  ?.trim() ||
                null,
              releaseDate:
                release.releaseDate
                  ?.slice(0, 10) ??
                null,
            },
            trackId:
              currentTrack.trackId,
            trackTitle:
              currentTrack.title,
            trackArtist:
              currentTrack.artist ??
              null,
            waveform:
              libraryPlayback.waveform
                ? {
                    sampleRate:
                      libraryPlayback
                        .waveform
                        .sampleRate,
                    sourceChannels:
                      libraryPlayback
                        .waveform
                        .sourceChannels,
                    bitsPerSample:
                      libraryPlayback
                        .waveform
                        .bitsPerSample,
                    peaksPerSecond:
                      libraryPlayback
                        .waveform
                        .peaksPerSecond,
                    durationSeconds:
                      libraryPlayback
                        .waveform
                        .durationSeconds,
                  }
                : null,
          });

        setLibraryMetadataPreviewVerbosity(
          "summary",
        );

        setLibraryMetadataPreviewData(
          preview,
        );

        setLibraryMetadataPreviewOpen(
          true,
        );
      } catch (previewError) {
        notify(
          previewError
            instanceof Error
            ? previewError.message
            : "Unable to prepare the public-style metadata preview.",
          "error",
        );
      } finally {
        setLibraryMetadataPreviewLoading(
          false,
        );
      }
    }, [
      libraryPlayback.currentTrack,
      libraryPlayback.waveform,
      notify,
      scan,
      selectedReleaseDetail,
    ]);

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
    setIngestIdentityOverride(null);
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

  const openCurrentTrackInLibraryWaveform = useCallback(() => {
    setLibraryEntityView("releases");
    setLibraryReleaseViewMode("waveform");
    navigateWorkflowView("library");
  }, [navigateWorkflowView]);

  const returnToLibraryContext = useCallback(() => {
    setWorkflowHelpReturnTarget(null);
    setSelectedReleaseDetail(null);
    setApplicationView("library");
    setMenuOpen(false);
  }, []);

  const returnToLibraryHome = useCallback(() => {
    setWorkflowHelpReturnTarget(null);
    setSelectedReleaseDetail(null);
    setSelectedLibraryArtistId(null);
    setLibraryEntityView("releases");
    setApplicationView("library");
    setMenuOpen(false);
  }, []);

  const openReleaseInLibrary = useCallback(async (
    releaseId: string,
  ) => {
    // A release destination always belongs to the Releases browser. Do not
    // carry a previously selected Artists subview across a Staging → Library
    // handoff or other direct release navigation.
    setLibraryEntityView("releases");
    setSelectedLibraryArtistId(null);
    setApplicationView("library");
    setSelectedReleaseDetail(null);
    await openReleaseMetadata(releaseId);
  }, [openReleaseMetadata]);

  const openReleaseOverviewInLibrary = useCallback(async (
    releaseId: string,
  ) => {
    setLibraryEntityView("releases");
    setSelectedLibraryArtistId(null);
    setApplicationView("library");
    setSelectedReleaseDetail(null);
    await openReleaseOverview(releaseId);
  }, [openReleaseOverview]);

  const openReleaseMetadataAtTarget = useCallback(async (
    releaseId: string,
    target: MetadataEditorFocusTarget,
  ) => {
    setPendingMetadataFocus({
      releaseId,
      ...target,
    });
    await openReleaseInLibrary(releaseId);
  }, [openReleaseInLibrary]);

  const openArtistInLibrary = useCallback((
    artistId: string,
  ) => {
    setSelectedReleaseDetail(null);
    setSelectedReleaseDetailMode("overview");
    setLibraryEntityView("artists");
    setSelectedLibraryArtistId(artistId);
    setApplicationView("library");
    setMenuOpen(false);
  }, []);

  const clearPendingMetadataFocus =
    useCallback(() => {
      setPendingMetadataFocus(null);
    }, []);

  const summary = useMemo(() => {
    if (!scan) {
      return null;
    }

    let trackCount = 0;
    let videoCount = 0;
    let missingCoreMetadataCount = 0;
    let missingCreditMetadataCount = 0;
    let missingSupplementalMetadataCount = 0;
    let audioMasterCount = 0;
    let artworkMasterCount = 0;

    for (const release of scan.releases) {
      trackCount += release.tracks.length;
      videoCount += release.videos.length;
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
      videoCount,
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

  const mediaTechnicalByRelease = useMemo(
    () =>
      new Map(
        mediaTechnicalAudit.result?.releases.map(
          (release) => [release.releaseId, release] as const,
        ) ?? [],
      ),
    [mediaTechnicalAudit.result],
  );

  const footerSummary = useMemo(() => {
    const librarySize = workflowLocations.find(
      (location) => location.id === "library",
    )?.sizeBytes;
    const publishedSize = workflowLocations.find(
      (location) => location.id === "public-package",
    )?.sizeBytes;

    return [
      `Library ${
        librarySize === undefined
          ? "size unavailable"
          : formatByteSize(librarySize)
      }`,
      `Web Package ${
        publishedSize === undefined
          ? "size unavailable"
          : formatByteSize(publishedSize)
      }`,
    ].join(" · ");
  }, [workflowLocations]);

  return (
    <main>
      {selectedReleaseDetail &&
      selectedReleaseDetailMode === "metadata" ? (
        <ReleaseMetadataDetailView
          detail={selectedReleaseDetail}
          release={
            scan?.releases.find(
              (release) =>
                release.id ===
                selectedReleaseDetail.releaseId,
            ) ?? null
          }
          technicalAudit={mediaTechnicalAudit}
          technicalSummary={mediaTechnicalByRelease.get(
            selectedReleaseDetail.releaseId,
          )}
          metadataRegistry={metadataRegistry}
          showAdminTools={showAdminTools}
          onShowAdminToolsChange={
            setShowAdminTools
          }
          onNotify={notify}
          workflowLocations={workflowLocations}
          onBack={returnToLibraryContext}
          onReleaseRenamed={async (releaseId) => {
            await refreshLibrary();
            await openReleaseDetail(releaseId);
          }}
          onRefresh={async () => {
            const releaseId =
              selectedReleaseDetail.releaseId;

            await Promise.all([
              refreshLibrary(),
              openReleaseDetail(releaseId),
            ]);
          }}
          onOpenWorkflowHelp={openWorkflowHelp}
          onNavigateWorkflow={navigateWorkflowView}
          playback={libraryPlayback}
          waveformColorMode={waveformColorMode}
          onWaveformColorModeChange={chooseWaveformColorMode}
          initialFocusTarget={
            pendingMetadataFocus?.releaseId ===
            selectedReleaseDetail.releaseId
              ? pendingMetadataFocus
              : null
          }
          onInitialFocusHandled={
            clearPendingMetadataFocus
          }
        />
      ) : (
        <>
          <header className="page-header">
            <div className="page-header-branding">
              <button
                type="button"
                className="page-header-brand"
                title="Back to Library"
                aria-label="Hiplingo · Back to Library"
                onClick={returnToLibraryHome}
              >
                <img
                  className="hiplingo-logo"
                  src={hiplingoLogoUrl}
                  alt=""
                  aria-hidden="true"
                />
              </button>
              <div className="page-header-title">
                <h1>
                  {applicationView === "help"
                    ? "Workflow & Help"
                    : applicationView === "compatibility"
                      ? "Metadata Tag Search"
                      : "Metadata Editor"}
                </h1>
              </div>
            </div>

            <div className="page-header-actions">
              {(applicationView === "library" ||
                applicationView === "public-package" ||
                applicationView === "production") &&
                scan && (
                  <p className="scan-time">
                    Library scan:{" "}
                    {new Date(
                      scan.scannedAt,
                    ).toLocaleString()}
                  </p>
                )}

              {applicationView === "ingest" &&
                ingestScan && (
                  <p className="scan-time">
                    Drop scan:{" "}
                    {new Date(
                      ingestScan.scannedAt,
                    ).toLocaleString()}
                  </p>
                )}

              {applicationView === "staging" &&
                (ingestScan || scan) && (
                  <p className="scan-time">
                    Inputs:{" "}
                    {ingestScan
                      ? `drop ${new Date(
                          ingestScan.scannedAt,
                        ).toLocaleTimeString()}`
                      : "drop not scanned"}
                    {" · "}
                    {scan
                      ? `Library ${new Date(
                          scan.scannedAt,
                        ).toLocaleTimeString()}`
                      : "Library not scanned"}
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
                  playback={libraryPlayback}
                  colorMode={waveformColorMode}
                  onColorModeChange={chooseWaveformColorMode}
                />
              </Suspense>

              <section className="menu-card menu-card--interface-accent">
                <div className="menu-interface-accent-heading">
                  <h2>Browsing Accent</h2>
                  <span className="menu-beta-badge">Beta</span>
                </div>
                <label className="menu-interface-accent-control">
                  <span>Library row color</span>
                  <select
                    aria-label="Library browsing accent"
                    value={interfaceAccentMode}
                    onChange={(event) =>
                      chooseInterfaceAccentMode(
                        event.target.value as InterfaceAccentMode,
                      )
                    }
                  >
                    {INTERFACE_ACCENT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="menu-meta">
                  Gray is the default. Applies to hover, selected,
                  and playing states in Library release tracks.
                </p>
              </section>

              <section className="menu-card">
                <h2>Admin</h2>
                <label className="admin-toggle">
                  <input
                    type="checkbox"
                    autoComplete="off"
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
                  Disabled by default on every page load.
                  Enable temporarily for troubleshooting controls,
                  source paths, settings, and raw TOML.
                </p>
              </section>
            </aside>
          )}

          <WorkflowNavigation
            locations={workflowLocations}
            activeView={
              applicationView === "ingest" ||
              applicationView === "staging" ||
              applicationView === "library" ||
              applicationView === "public-package" ||
              applicationView === "production"
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
              releases={scan?.releases ?? []}
              identitySeed={ingestIdentityOverride}
              error={ingestError}
              inspection={ingestInspection}
              inspectionError={
                ingestInspectionError
              }
              inspectionLoading={
                ingestInspectionLoading
              }
              refreshing={ingestLoading}
              onRefresh={() =>
                void refreshIngest(true)
              }
              onInspect={(candidateId) =>
                void inspectCandidate(candidateId)
              }
              onBackToCandidates={() => {
                setIngestInspection(null);
                setIngestIdentityOverride(null);
              }}
              playback={libraryPlayback}
              onOpenStaging={(identityOverride) => {
                setIngestIdentityOverride(identityOverride);
                setIngestInspection((current) =>
                  current
                    ? {
                        ...current,
                        candidate: {
                          ...current.candidate,
                          evidence:
                            mergeIngestIdentityEvidence(
                              current.candidate.evidence,
                              identityOverride,
                            ),
                        },
                      }
                    : current,
                );
                navigateWorkflowView("staging");
              }}
            />
          ) : applicationView === "staging" ? (
            <StagingWorkspace
              inspection={ingestInspection}
              identitySeed={ingestIdentityOverride}
              releases={scan?.releases ?? []}
              artists={scan?.artists ?? []}
              metadataRegistry={metadataRegistry}
              inspectionError={
                ingestInspectionError
              }
              inputsRefreshing={ingestLoading || loading}
              onRefreshInputs={() => {
                void Promise.all([
                  refreshIngest(false),
                  refreshLibrary(false),
                ]);
              }}
              onChooseCandidate={() =>
                navigateWorkflowView("ingest")
              }
              onBackToInspection={() =>
                navigateWorkflowView("ingest")
              }
              onEditReleaseMetadata={(releaseId) =>
                void openReleaseInLibrary(releaseId)
              }
              onEditMetadataTarget={(releaseId, target) =>
                void openReleaseMetadataAtTarget(
                  releaseId,
                  target,
                )
              }
              onOpenArtist={openArtistInLibrary}
              onOpenRelease={(releaseId) =>
                void openReleaseOverviewInLibrary(
                  releaseId,
                )
              }
              onLibraryChanged={() =>
                refreshLibrary(true)
              }
              onReleaseCreated={async (
                releaseId,
              ) => {
                setIngestInspection(null);
                setIngestIdentityOverride(null);
                await refreshLibrary();
                await openReleaseInLibrary(
                  releaseId,
                );
              }}
              onNotify={notify}
              playback={libraryPlayback}
            />
          ) : applicationView === "public-package" ||
              applicationView === "production" ? (
            <PublishWorkspace
              mode={applicationView === "production" ? "production" : "public-package"}
              releases={scan?.releases ?? []}
              workflowLocations={workflowLocations}
              loading={loading}
              error={error}
              onRefresh={() =>
                void refreshLibrary(true)
              }
              onNotify={notify}
              technicalAudit={mediaTechnicalAudit}
              technicalByRelease={mediaTechnicalByRelease}
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
                    <Suspense fallback={null}>
                      <LazyScannerWarningPanel
                        warnings={scan.warnings}
                      />
                    </Suspense>
                  )}

                  <LibraryEntitySwitcher
                    value={libraryEntityView}
                    onChange={(nextView) => {
                      setLibraryEntityView(nextView);
                      setSelectedReleaseDetail(null);
                      setDetailError(null);
                    }}
                    loading={loading}
                    onRescan={() =>
                      void refreshLibrary(true)
                    }
                  />

                  {selectedReleaseDetail &&
                  selectedReleaseDetailMode === "overview" ? (
                    <LibraryReleaseOverview
                      detail={selectedReleaseDetail}
                      release={
                        scan.releases.find(
                          (release) =>
                            release.id === selectedReleaseDetail.releaseId,
                        ) ?? null
                      }
                      artists={scan.artists}
                      technicalSummary={mediaTechnicalByRelease.get(
                        selectedReleaseDetail.releaseId,
                      )}
                      playback={libraryPlayback}
                      onEditMetadata={() =>
                        setSelectedReleaseDetailMode("metadata")
                      }
                      onOpenArtist={openArtistInLibrary}
                    />
                  ) : libraryEntityView === "artists" ? (
                    <LibraryArtistRoster
                      artists={scan.artists}
                      releases={scan.releases}
                      selectedArtistId={selectedLibraryArtistId}
                      onSelectedArtistIdChange={setSelectedLibraryArtistId}
                      onLibraryChanged={() => refreshLibrary()}
                      onOpenRelease={(releaseId) => {
                        void openReleaseOverview(releaseId);
                      }}
                      onNotify={notify}
                      showAdminTools={showAdminTools}
                      technicalAudit={mediaTechnicalAudit}
                      technicalByRelease={mediaTechnicalByRelease}
                      playback={libraryPlayback}
                      waveformColorMode={waveformColorMode}
                      viewMode={artistReleaseViewMode}
                      onViewModeChange={setArtistReleaseViewMode}
                    />
                  ) : (
                    <LibraryReleaseBrowser
                      releases={scan.releases}
                      onLibraryChanged={refreshLibrary}
                      onOpenRelease={(releaseId) =>
                        void openReleaseOverview(releaseId)
                      }
                      showAdminTools={showAdminTools}
                      onNotify={notify}
                      technicalAudit={mediaTechnicalAudit}
                      technicalByRelease={mediaTechnicalByRelease}
                      playback={libraryPlayback}
                      waveformColorMode={waveformColorMode}
                      viewMode={libraryReleaseViewMode}
                      onViewModeChange={setLibraryReleaseViewMode}
                    />
                  )}

                </>
              )}

              {detailError && (
                <p className="message error">
                  {detailError}
                </p>
              )}

              {detailLoading && (
                <p className="message">
                  Loading release…
                </p>
              )}
            </>
          )}
        </>
      )}
      <ListenerMetadataViewer
        isOpen={
          libraryMetadataPreviewOpen
        }
        verbosity={
          libraryMetadataPreviewVerbosity
        }
        onVerbosityChange={
          setLibraryMetadataPreviewVerbosity
        }
        audiophileMode={false}
        developerMode={false}
        release={
          libraryMetadataPreviewData
            ?.release ??
          null
        }
        track={
          libraryMetadataPreviewData
            ?.track ??
          null
        }
        triggerRef={
          metadataPreviewButtonRef
        }
        onClose={() =>
          setLibraryMetadataPreviewOpen(
            false,
          )
        }
      />

      <PersistentLibraryPlayerBar
        playback={libraryPlayback}
        colorMode={waveformColorMode}
        onOpenLibraryWaveform={
          openCurrentTrackInLibraryWaveform
        }
        metadataButtonRef={
          metadataPreviewButtonRef
        }
        metadataPreviewAvailable={
          Boolean(
            libraryPlayback
              .currentTrack
              ?.releaseId &&
            libraryPlayback
              .currentTrack
              .trackId &&
            scan?.releases.some(
              (release) =>
                release.id ===
                libraryPlayback
                  .currentTrack
                  ?.releaseId,
            ),
          )
        }
        metadataPreviewLoading={
          libraryMetadataPreviewLoading
        }
        onOpenMetadataPreview={
          openCurrentTrackMetadataPreview
        }
      />

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
          {(!selectedReleaseDetail ||
            selectedReleaseDetailMode === "overview") && (
            <>
              <button
                type="button"
                className="footer-link-button"
                onClick={openWorkflowHelp}
              >
                Workflow &amp; Help
              </button>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                className="footer-link-button"
                onClick={() => {
                  setSelectedReleaseDetail(null);
                  setApplicationView("compatibility");
                  setMenuOpen(false);
                }}
              >
                Metadata Tag Info
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
          aria-live={
            toast.tone === "error"
              ? "assertive"
              : "polite"
          }
          aria-atomic="true"
        >
          <span>{toast.message}</span>
          <button
            type="button"
            className="toast-dismiss"
            aria-label="Dismiss notification"
            onClick={dismissToast}
          >
            ×
          </button>
        </div>
      )}
    </main>
  );
}
