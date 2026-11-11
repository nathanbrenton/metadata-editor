import { hiplingoLogoUrl } from "@hiplingo/brand";
import {
  Fragment,
  lazy,
  useState,
} from "react";
import {
  buildLibraryVideoPosterUrl,
  buildLibraryVideoPreviewUrl,
  canPreviewLibraryVideoExtension,
} from "../video-preview.js";
import { selectReleaseFrontArtwork } from "../artwork-gallery.js";
import {
  readinessBadgeLabel,
  readinessTone,
  summarizeReleaseScanReadiness,
} from "../metadata-readiness.js";
import { ingestVideoTypeOptions } from "../../shared/ingest-builder.js";
import { resolveReleaseDisplayTitle } from "../release-display-title.js";
import {
  AssetPanel,
  GeneratedTomlPanel,
  GenerationPlanPanel,
  MetadataPanel,
  MetadataPreviewPanel,
  artworkPreviewUrl,
} from "./library-panels.js";
import type {
  GeneratedMetadataPreview,
  LibraryMetadataPreview,
  MediaTechnicalReleaseSummary,
  MetadataGenerationPlan,
  MetadataGenerationScope,
  ReleaseScanResult,
  ToastMessage,
  VideoMetadataEditorSnapshot,
} from "./types.js";
import {
  MediaFileSpecBadge,
  TechnicalHealthBadge,
} from "./technical-audit.js";
import {
  TrackMetadataSummary,
} from "./metadata-records.js";
import {
  formatDuration,
} from "./foundation.js";
import {
  formatReleaseTitle,
} from "./release-display.js";

function libraryMetadataReadinessLabel(
  readiness: {
    core: number;
    credits: number;
    supplemental: number;
  },
): string {
  const label = readinessBadgeLabel(readiness);

  return label === "Core complete"
    ? "Metadata complete"
    : label;
}

function ReleaseCard({
  release,
  onLibraryChanged,
  onOpenRelease,
  showAdminTools,
  onNotify,
  technicalSummary,
  technicalLoading,
  technicalError,
}: {
  release: ReleaseScanResult;
  onLibraryChanged: () => Promise<void>;
  onOpenRelease: () => void;
  showAdminTools: boolean;
  onNotify: (
    message: string,
    tone?: ToastMessage["tone"],
  ) => void;
  technicalSummary?: MediaTechnicalReleaseSummary;
  technicalLoading: boolean;
  technicalError: string | null;
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
  const [videoPreviewId, setVideoPreviewId] =
    useState<string | null>(null);
  const [videoPreviewErrorId, setVideoPreviewErrorId] =
    useState<string | null>(null);
  const [videoEditorId, setVideoEditorId] =
    useState<string | null>(null);
  const [videoEditorDraft, setVideoEditorDraft] =
    useState<VideoMetadataEditorSnapshot | null>(null);
  const [videoEditorLoading, setVideoEditorLoading] =
    useState(false);
  const [videoEditorSaving, setVideoEditorSaving] =
    useState(false);
  const [videoEditorError, setVideoEditorError] =
    useState<string | null>(null);

  const openVideoMetadataEditor = async (
    videoId: string,
  ) => {
    setVideoPreviewId(null);
    setVideoPreviewErrorId(null);
    setVideoEditorId(videoId);
    setVideoEditorDraft(null);
    setVideoEditorError(null);
    setVideoEditorLoading(true);

    try {
      const query = new URLSearchParams({
        release: release.id,
        video: videoId,
      });
      const response = await fetch(
        `/api/library/video-metadata?${query.toString()}`,
      );
      const payload = (await response.json()) as
        | VideoMetadataEditorSnapshot
        | { error?: string };

      if (!response.ok || !("originalSha256" in payload)) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : `Video metadata load failed: HTTP ${response.status}`,
        );
      }

      setVideoEditorDraft(payload);
    } catch (error) {
      setVideoEditorError(
        error instanceof Error
          ? error.message
          : "Unable to load video metadata",
      );
    } finally {
      setVideoEditorLoading(false);
    }
  };

  const saveVideoMetadataEditor = async () => {
    if (!videoEditorDraft) {
      return;
    }

    const title = videoEditorDraft.title.trim();
    const videoType =
      videoEditorDraft.videoType.trim();

    if (!title || !videoType) {
      setVideoEditorError(
        "Video title and type are required.",
      );
      return;
    }

    setVideoEditorSaving(true);
    setVideoEditorError(null);

    try {
      const response = await fetch(
        "/api/library/save-video-metadata",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            releaseId: release.id,
            videoId: videoEditorDraft.videoId,
            originalSha256:
              videoEditorDraft.originalSha256,
            title,
            videoType,
            description: videoEditorDraft.description,
            date: videoEditorDraft.date,
            location: videoEditorDraft.location,
            director: videoEditorDraft.director,
            cameraOperator: videoEditorDraft.cameraOperator,
            displayOrder:
              videoEditorDraft.displayOrder,
            posterTimeSeconds:
              videoEditorDraft.posterTimeSeconds,
            relatedTrackId:
              videoEditorDraft.relatedTrackId,
          }),
        },
      );
      const payload = (await response.json()) as {
        savedSha256?: string;
        error?: string;
      };

      if (!response.ok || !payload.savedSha256) {
        throw new Error(
          payload.error ??
            `Video metadata save failed: HTTP ${response.status}`,
        );
      }

      setVideoEditorId(null);
      setVideoEditorDraft(null);
      onNotify(
        "Video metadata updated.",
        "success",
      );
      await onLibraryChanged();
    } catch (error) {
      setVideoEditorError(
        error instanceof Error
          ? error.message
          : "Unable to save video metadata",
      );
    } finally {
      setVideoEditorSaving(false);
    }
  };

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
    selectReleaseFrontArtwork(
      release.artworkMasters,
    );
  const releaseDisplayTitle =
    resolveReleaseDisplayTitle(
      release.releaseTitle,
      formatReleaseTitle(release.id),
    );
  const releaseArtistName =
    release.primaryArtistName?.trim() ?? "";
  const releaseRuntimeLabel =
    technicalSummary?.durationSeconds !== undefined
      ? formatDuration(technicalSummary.durationSeconds)
      : null;

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
          onClick={onOpenRelease}
          aria-label={`Open release ${releaseDisplayTitle}`}
        >
          <span
            className="release-artwork-tile"
            aria-hidden="true"
          >
            {releaseArtwork ? (
              <img
                src={artworkPreviewUrl(
                  releaseArtwork.relativePath,
                )}
                alt=""
                loading="lazy"
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

          <span className="release-summary">
            <strong className="release-title">
              {releaseDisplayTitle}
            </strong>

            <span
              className={`release-artist${
                releaseArtistName
                  ? ""
                  : " missing"
              }`}
            >
              {releaseArtistName || "Artist not set"}
            </span>

            <span className="release-subtitle">
              {releaseDateLabel}
              {" · "}
              {release.tracks.length}{" "}
              {release.tracks.length === 1
                ? "track"
                : "tracks"}
              {release.videos.length > 0 && (
                <>
                  {" · "}
                  {release.videos.length}{" "}
                  {release.videos.length === 1
                    ? "video"
                    : "videos"}
                </>
              )}
              {releaseRuntimeLabel && (
                <>
                  {" · "}
                  <span title="Total release run time">
                    {releaseRuntimeLabel}
                  </span>
                </>
              )}
            </span>
          </span>
        </button>

        <span
          className="library-tile-details-tooltip"
          role="tooltip"
        >
          <span className="library-tile-tooltip-kicker">
            Release details
          </span>
          <strong className="library-tile-tooltip-title">
            {releaseDisplayTitle}
          </strong>
          <span>
            Artist · {releaseArtistName || "Artist not set"}
          </span>
          <span>
            {releaseDateLabel}
            {" · "}
            {release.tracks.length}{" "}
            {release.tracks.length === 1 ? "track" : "tracks"}
            {release.videos.length > 0 && (
              <>
                {" · "}
                {release.videos.length}{" "}
                {release.videos.length === 1 ? "video" : "videos"}
              </>
            )}
            {releaseRuntimeLabel && (
              <>
                {" · "}
                <span title="Total release run time">
                  {releaseRuntimeLabel}
                </span>
              </>
            )}
          </span>

          <span className="library-tile-tooltip-divider" />

          <small>
            <span>Library</span>
            <code>{release.relativePath}</code>
          </small>
          <small>
            <span>Artwork</span>
            <code>
              {releaseArtwork?.relativePath ?? "No release artwork"}
            </code>
          </small>

          <span className="library-tile-tooltip-status-heading">
            Health &amp; provenance
          </span>
        </span>

        <div className="release-status-actions">
          <MediaFileSpecBadge release={release} prefix />

          <TechnicalHealthBadge
            summary={technicalSummary}
            loading={technicalLoading}
            error={technicalError}
          />

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
            {libraryMetadataReadinessLabel(
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

        </div>
      </header>

      {release.videos.length > 0 && (
        <details className="library-video-disclosure">
          <summary>
            <span>Videos</span>
            <small>
              {release.videos.length}{" "}
              {release.videos.length === 1
                ? "video"
                : "videos"}
            </small>
          </summary>

          <div className="library-video-list">
            {[...release.videos]
              .sort((left, right) => {
                const leftOrder =
                  left.displayOrder ?? Number.MAX_SAFE_INTEGER;
                const rightOrder =
                  right.displayOrder ?? Number.MAX_SAFE_INTEGER;

                return (
                  leftOrder - rightOrder ||
                  (left.title ?? left.id).localeCompare(
                    right.title ?? right.id,
                  ) ||
                  left.id.localeCompare(right.id)
                );
              })
              .map((video) => {
              const master = video.videoMasters[0];
              const normalizedVideoType =
                video.videoType?.trim() ?? "";
              const videoType = normalizedVideoType
                ? normalizedVideoType.replaceAll("_", " ")
                : "Type not set";
              const previewSupported =
                video.videoMasters.length === 1 &&
                Boolean(master) &&
                canPreviewLibraryVideoExtension(
                  master?.extension ?? "",
                );
              const previewOpen =
                videoPreviewId === video.id;
              const editorOpen =
                videoEditorId === video.id;

              return (
                <Fragment key={video.relativePath}>
                  <div
                    className="library-video-row"
                  >
                    <span className="library-video-poster">
                      <img
                        src={buildLibraryVideoPosterUrl(
                          release.id,
                          video.id,
                        )}
                        alt=""
                        loading="lazy"
                        onError={(event) => {
                          event.currentTarget.hidden = true;
                        }}
                      />
                      <span aria-hidden="true">
                        {video.displayOrder
                          ? `#${video.displayOrder}`
                          : "VID"}
                      </span>
                    </span>
                    <span className="library-video-identity">
                      <strong>
                        {video.title?.trim() || video.id}
                      </strong>
                      <small>{video.id}</small>
                      <small>
                        Poster ·{" "}
                        {video.posterTimeSeconds === undefined
                          ? "automatic"
                          : `${video.posterTimeSeconds}s`}
                      </small>
                    </span>
                    <span className="library-video-type">
                      {videoType}
                    </span>
                    <span className="library-video-relation">
                      {video.relatedTrackId
                        ? <>Related · <code>{video.relatedTrackId}</code></>
                        : "Release-level"}
                    </span>
                    <button
                      type="button"
                      className="library-video-preview-toggle"
                      disabled={!previewSupported}
                      title={
                        previewSupported
                          ? previewOpen
                            ? "Hide the read-only canonical video preview"
                            : "Preview the canonical video master without creating a derivative"
                          : video.videoMasters.length !== 1
                            ? "Preview requires exactly one canonical video master"
                            : "Browser-direct preview currently supports MP4, M4V, MOV, and WebM masters"
                      }
                      onClick={() => {
                        setVideoEditorId(null);
                        setVideoEditorDraft(null);
                        setVideoEditorError(null);
                        setVideoPreviewErrorId(null);
                        setVideoPreviewId(
                          previewOpen
                            ? null
                            : video.id,
                        );
                      }}
                    >
                      {previewOpen
                        ? "Hide preview"
                        : "Preview"}
                    </button>
                    <button
                      type="button"
                      className="library-video-edit-toggle"
                      aria-expanded={editorOpen}
                      onClick={() => {
                        if (editorOpen) {
                          setVideoEditorId(null);
                          setVideoEditorDraft(null);
                          setVideoEditorError(null);
                          return;
                        }

                        void openVideoMetadataEditor(
                          video.id,
                        );
                      }}
                    >
                      {editorOpen
                        ? "Cancel edit"
                        : "Edit metadata"}
                    </button>
                    <span
                      className={`badge ${
                        video.videoMasters.length === 1
                          ? "complete"
                          : "warning"
                      }`}
                      title={
                        master
                          ? master.filename
                          : "No canonical video master detected"
                      }
                    >
                      {video.videoMasters.length === 1
                        ? "Master"
                        : video.videoMasters.length === 0
                          ? "Missing master"
                          : `${video.videoMasters.length} masters`}
                    </span>
                  </div>

                  {previewOpen && master && (
                    <div className="library-video-preview-panel">
                      <video
                        className="library-video-preview-player"
                        controls
                        playsInline
                        preload="metadata"
                        src={buildLibraryVideoPreviewUrl(
                          release.id,
                          video.id,
                        )}
                        aria-label={`Preview ${video.title?.trim() || video.id}`}
                        onLoadedMetadata={() =>
                          setVideoPreviewErrorId(null)
                        }
                        onError={() =>
                          setVideoPreviewErrorId(video.id)
                        }
                      />
                      <div className="library-video-preview-copy">
                        <strong>
                          Read-only canonical master preview
                        </strong>
                        <small>
                          No video derivative is generated. Browser playback still depends on the codecs inside the canonical container.
                        </small>
                        {videoPreviewErrorId === video.id && (
                          <small className="metadata-error">
                            This browser could not play the canonical master directly. The Library master is unchanged; a later video-derivative milestone can provide a browser-compatible preview.
                          </small>
                        )}
                      </div>
                    </div>
                  )}

                  {editorOpen && (
                    <div className="library-video-editor-panel">
                      {videoEditorLoading ? (
                        <p className="metadata-empty-value">
                          Loading video metadata…
                        </p>
                      ) : videoEditorDraft ? (
                        <>
                          <div className="library-video-editor-fields">
                            <label>
                              <span>Title</span>
                              <input
                                type="text"
                                value={videoEditorDraft.title}
                                disabled={videoEditorSaving}
                                onChange={(event) =>
                                  setVideoEditorDraft((current) =>
                                    current
                                      ? {
                                          ...current,
                                          title: event.target.value,
                                        }
                                      : current,
                                  )
                                }
                              />
                            </label>

                            <label>
                              <span>Type</span>
                              <input
                                type="text"
                                list={`library-video-type-options-${release.id}`}
                                value={videoEditorDraft.videoType}
                                disabled={videoEditorSaving}
                                onChange={(event) =>
                                  setVideoEditorDraft((current) =>
                                    current
                                      ? {
                                          ...current,
                                          videoType: event.target.value,
                                        }
                                      : current,
                                  )
                                }
                              />
                            </label>

                            <label className="library-video-editor-wide-field">
                              <span>Description</span>
                              <textarea
                                rows={3}
                                value={videoEditorDraft.description}
                                disabled={videoEditorSaving}
                                onChange={(event) =>
                                  setVideoEditorDraft((current) =>
                                    current
                                      ? {
                                          ...current,
                                          description: event.target.value,
                                        }
                                      : current,
                                  )
                                }
                              />
                            </label>

                            <label>
                              <span>Date</span>
                              <input
                                type="date"
                                value={videoEditorDraft.date}
                                disabled={videoEditorSaving}
                                onChange={(event) =>
                                  setVideoEditorDraft((current) =>
                                    current
                                      ? { ...current, date: event.target.value }
                                      : current,
                                  )
                                }
                              />
                            </label>

                            <label>
                              <span>Location</span>
                              <input
                                type="text"
                                value={videoEditorDraft.location}
                                disabled={videoEditorSaving}
                                onChange={(event) =>
                                  setVideoEditorDraft((current) =>
                                    current
                                      ? { ...current, location: event.target.value }
                                      : current,
                                  )
                                }
                              />
                            </label>

                            <label>
                              <span>Director</span>
                              <input
                                type="text"
                                value={videoEditorDraft.director}
                                disabled={videoEditorSaving}
                                onChange={(event) =>
                                  setVideoEditorDraft((current) =>
                                    current
                                      ? { ...current, director: event.target.value }
                                      : current,
                                  )
                                }
                              />
                            </label>

                            <label>
                              <span>Camera operator</span>
                              <input
                                type="text"
                                value={videoEditorDraft.cameraOperator}
                                disabled={videoEditorSaving}
                                onChange={(event) =>
                                  setVideoEditorDraft((current) =>
                                    current
                                      ? { ...current, cameraOperator: event.target.value }
                                      : current,
                                  )
                                }
                              />
                            </label>

                            <label>
                              <span>Display order</span>
                              <input
                                type="number"
                                min={1}
                                step={1}
                                value={videoEditorDraft.displayOrder}
                                disabled={videoEditorSaving}
                                onChange={(event) =>
                                  setVideoEditorDraft((current) =>
                                    current
                                      ? {
                                          ...current,
                                          displayOrder:
                                            Math.max(
                                              1,
                                              Number.parseInt(
                                                event.target.value || "1",
                                                10,
                                              ),
                                            ),
                                        }
                                      : current,
                                  )
                                }
                              />
                            </label>

                            <label>
                              <span>Poster frame · seconds</span>
                              <input
                                type="number"
                                min={0}
                                step={0.1}
                                placeholder="Automatic"
                                value={
                                  videoEditorDraft.posterTimeSeconds ??
                                  ""
                                }
                                disabled={videoEditorSaving}
                                onChange={(event) =>
                                  setVideoEditorDraft((current) =>
                                    current
                                      ? {
                                          ...current,
                                          posterTimeSeconds:
                                            event.target.value === ""
                                              ? null
                                              : Math.max(
                                                  0,
                                                  Number.parseFloat(
                                                    event.target.value,
                                                  ),
                                                ),
                                        }
                                      : current,
                                  )
                                }
                              />
                              <small>
                                Leave blank for automatic poster selection.
                              </small>
                            </label>

                            <label>
                              <span>Related track</span>
                              <select
                                value={videoEditorDraft.relatedTrackId}
                                disabled={videoEditorSaving}
                                onChange={(event) =>
                                  setVideoEditorDraft((current) =>
                                    current
                                      ? {
                                          ...current,
                                          relatedTrackId: event.target.value,
                                        }
                                      : current,
                                  )
                                }
                              >
                                <option value="">
                                  Release-level only
                                </option>
                                {release.tracks.map((track) => (
                                  <option
                                    key={track.id}
                                    value={track.id}
                                  >
                                    {track.id}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </div>

                          <div className="library-video-editor-reference">
                            <span>
                              Stable video ID · <code>{videoEditorDraft.videoId}</code>
                            </span>
                            <span>
                              Canonical master · <code>{videoEditorDraft.masterPath}</code>
                            </span>
                            <small>
                              Stable identity and canonical master path are intentionally read-only here.
                            </small>
                          </div>

                          {videoEditorError && (
                            <p className="metadata-error">
                              {videoEditorError}
                            </p>
                          )}

                          <div className="library-video-editor-actions">
                            <button
                              type="button"
                              className="primary-button"
                              disabled={videoEditorSaving}
                              onClick={() =>
                                void saveVideoMetadataEditor()
                              }
                            >
                              {videoEditorSaving
                                ? "Saving…"
                                : "Save video metadata"}
                            </button>
                            <button
                              type="button"
                              disabled={videoEditorSaving}
                              onClick={() => {
                                setVideoEditorId(null);
                                setVideoEditorDraft(null);
                                setVideoEditorError(null);
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        </>
                      ) : (
                        <p className="metadata-error">
                          {videoEditorError ??
                            "Unable to load video metadata."}
                        </p>
                      )}
                    </div>
                  )}
                </Fragment>
              );
            })}

            <datalist
              id={`library-video-type-options-${release.id}`}
            >
              {ingestVideoTypeOptions.map((value) => (
                <option key={value} value={value} />
              ))}
            </datalist>
          </div>
        </details>
      )}

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
                <span>Video Assets</span>
                <small>
                  {release.videos.length} videos
                </small>
              </summary>

              <div className="library-disclosure-content asset-stack">
                {release.videos.length === 0 ? (
                  <p className="empty-state">
                    No canonical videos detected.
                  </p>
                ) : (
                  release.videos.map((video) => (
                    <AssetPanel
                      key={video.relativePath}
                      title={`${video.title?.trim() || video.id} video master`}
                      assets={video.videoMasters}
                      emptyLabel="No video master detected"
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

export {
  libraryMetadataReadinessLabel,
  ReleaseCard,
};
