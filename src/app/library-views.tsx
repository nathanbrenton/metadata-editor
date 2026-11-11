import { hiplingoLogoUrl } from "@hiplingo/brand";
import {
  ProvenanceBadge,
  resolveReleaseProvenance,
  resolveTrackProvenance,
} from "@hiplingo/media-player";
import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  buildAudioPreviewUrl,
  getAudioPreviewSourceLabel,
  trackHasAudioPreview,
} from "../audio-preview.js";
import type {
  PersistentLibraryPlaybackController,
  PersistentPlaybackTrack,
} from "../PersistentLibraryPlayer.js";
import type { WaveformColorMode } from "../media-waveform.js";
import { buildLibraryWaveformUrl } from "../library-waveform.js";
import { HiplingoPreviewPanel } from "../HiplingoPreviewPanel.js";
import { findMetadataValueAcrossDocuments } from "../release-inheritance.js";
import {
  selectPreferredReleaseArtwork,
  selectReleaseFrontArtwork,
} from "../artwork-gallery.js";
import { resolveReleaseDisplayTitle } from "../release-display-title.js";
import type {
  ArtistAssetScanResult,
  ArtistPhotoCandidate,
  ArtistScanResult,
  MediaTechnicalAuditState,
  MediaTechnicalReleaseSummary,
  ReleaseMetadataDetail,
  ReleaseScanResult,
  ToastMessage,
} from "./types.js";
import {
  type LibraryEntityView,
  buildIngestArtworkPreviewUrl,
} from "./ingest-views.js";
import {
  LibraryWaveformView,
  formatByteSize,
  formatDuration,
} from "./foundation.js";
import {
  ReleaseCard,
} from "./ReleaseCard.js";
import {
  TechnicalAuditSummaryBadge,
} from "./technical-audit.js";
import {
  artworkPreviewUrl,
} from "./library-panels.js";
import {
  formatReleaseDate,
  formatReleaseTitle,
  readTrackDisplayTitle,
} from "./release-display.js";

function LibraryEntitySwitcher({
  value,
  onChange,
  loading,
  onRescan,
}: {
  value: LibraryEntityView;
  onChange: (value: LibraryEntityView) => void;
  loading: boolean;
  onRescan: () => void;
}) {
  return (
    <div className="library-entity-switcher">
      <div
        className="library-entity-switcher__views"
        role="group"
        aria-label="Library entity"
      >
        <button
          type="button"
          aria-pressed={value === "releases"}
          onClick={() => onChange("releases")}
        >
          Releases
        </button>
        <button
          type="button"
          aria-pressed={value === "artists"}
          onClick={() => onChange("artists")}
        >
          Artists
        </button>
      </div>

      <button
        type="button"
        className="library-entity-switcher__rescan"
        disabled={loading}
        onClick={onRescan}
        title="Rescan the canonical Library from disk. Use this after external filesystem changes or when you need to force reconciliation."
      >
        {loading ? "Rescanning…" : "Rescan Library"}
      </button>
    </div>
  );
}

function LibraryReleaseOverview({
  detail,
  release,
  artists,
  technicalSummary,
  playback,
  onEditMetadata,
  onOpenArtist,
}: {
  detail: ReleaseMetadataDetail;
  release: ReleaseScanResult | null;
  artists: ArtistScanResult[];
  technicalSummary?: MediaTechnicalReleaseSummary;
  playback: PersistentLibraryPlaybackController;
  onEditMetadata: () => void;
  onOpenArtist: (artistId: string) => void;
}) {
  const [selectedTrackKey, setSelectedTrackKey] =
    useState<string | null>(playback.currentTrack?.key ?? null);

  const [hiplingoPreviewOpen, setHiplingoPreviewOpen] =
    useState(false);

  useEffect(() => {
    setSelectedTrackKey(playback.currentTrack?.key ?? null);
  }, [playback.currentTrack?.key, release?.id]);

  if (!release) {
    return (
      <section className="library-release-overview">
        <p className="message error">
          This release is no longer present in the current Library scan.
        </p>
      </section>
    );
  }

  const releaseArtwork = selectReleaseFrontArtwork(
    release.artworkMasters,
  );
  const releaseDisplayTitle = resolveReleaseDisplayTitle(
    release.releaseTitle,
    formatReleaseTitle(release.id),
  );
  const releaseArtistName =
    release.primaryArtistName?.trim() || "Artist not set";
  const releaseArtist =
    artists.find(
      (artist) =>
        artist.id === release.primaryArtistId ||
        (
          !release.primaryArtistId &&
          release.primaryArtistName?.trim() &&
          artist.displayName === release.primaryArtistName.trim()
        ),
    ) ?? null;
  const releaseDescriptionValue =
    findMetadataValueAcrossDocuments(
      detail.documents,
      "release.description",
    );
  const releaseDescription =
    typeof releaseDescriptionValue === "string"
      ? releaseDescriptionValue.trim()
      : "";
  const releaseRuntimeLabel =
    technicalSummary?.durationSeconds !== undefined
      ? formatDuration(technicalSummary.durationSeconds)
      : null;
  const releaseDateLabel = release.releaseDate
    ? release.releaseDate.slice(0, 10)
    : formatReleaseDate(release.id);
  /*
   * Provenance bubbles use the same shared resolver as Hiplingo, so the
   * Library shows exactly what the public site will show after publishing.
   */
  const releaseProvenanceMetadata =
    detail.documents.find(
      (document) =>
        document.scope === "release" &&
        document.filename === "release.toml",
    )?.parsed.release;
  const trackProvenanceMetadata = (trackId: string) =>
    detail.documents.find(
      (document) =>
        document.trackId === trackId &&
        document.filename === "track.toml",
    )?.parsed.track;
  const releaseProvenance = resolveReleaseProvenance(
    releaseProvenanceMetadata,
    release.tracks.map((track) =>
      trackProvenanceMetadata(track.id),
    ),
  );

  const playableTracks = release.tracks.filter(
    trackHasAudioPreview,
  );

  const playbackQueue: PersistentPlaybackTrack[] =
    playableTracks.map((track) => {
      const trackDocuments = detail.documents.filter(
        (document) => document.trackId === track.id,
      );
      const trackArtwork = selectPreferredReleaseArtwork(
        track.artworkMasters,
      );
      const effectiveArtwork =
        trackArtwork ?? releaseArtwork;

      return {
        key: `${release.id}::${track.id}`,
        source: buildAudioPreviewUrl(
          release.id,
          track.id,
        ),
        waveformUrl: buildLibraryWaveformUrl(
          release.id,
          track.id,
        ),
        releaseId: release.id,
        trackId: track.id,
        title: readTrackDisplayTitle(
          track.id,
          trackDocuments,
          formatReleaseTitle(track.id),
        ),
        artist:
          release.primaryArtistName?.trim() || null,
        releaseTitle: releaseDisplayTitle,
        detail: getAudioPreviewSourceLabel(track),
        artworkUrl: effectiveArtwork
          ? artworkPreviewUrl(
              effectiveArtwork.relativePath,
            )
          : null,
      };
    });

  return (
    <section className="library-release-overview">
      <section className="library-release-overview-hero">
        <div className="library-release-overview-artwork">
          {releaseArtwork ? (
            <img
              src={artworkPreviewUrl(
                releaseArtwork.relativePath,
              )}
              alt={`Artwork for ${releaseDisplayTitle}`}
            />
          ) : (
            <img
              className="hiplingo-artwork-fallback"
              src={hiplingoLogoUrl}
              alt=""
              aria-hidden="true"
            />
          )}
        </div>

        <div className="library-release-overview-copy">
          <div className="library-release-overview-copy-header">
            <div>
              <h1>{releaseDisplayTitle}</h1>
              <p className="library-release-overview-artist">
                {releaseArtist ? (
                  <button
                    type="button"
                    className="library-release-overview-artist-link"
                    onClick={() => onOpenArtist(releaseArtist.id)}
                    title={`Open ${releaseArtist.displayName} in Library Artists`}
                  >
                    {releaseArtistName}
                  </button>
                ) : (
                  <span
                    title={
                      release.primaryArtistName
                        ? "No canonical Artist profile is registered for this release yet."
                        : "This release does not declare a primary Artist."
                    }
                  >
                    {releaseArtistName}
                  </span>
                )}
              </p>
            </div>

            <div className="library-release-overview-actions">
              <button
                type="button"
                className="library-release-overview-preview"
                aria-expanded={hiplingoPreviewOpen}
                onClick={() =>
                  setHiplingoPreviewOpen((open) => !open)
                }
              >
                {hiplingoPreviewOpen
                  ? "Hide Hiplingo preview"
                  : "Preview in Hiplingo"}
              </button>

              <button
                type="button"
                className="primary-button library-release-overview-edit"
                onClick={onEditMetadata}
              >
                Edit metadata
              </button>
            </div>
          </div>

          <div className="library-release-overview-facts">
            {release.releaseType && (
              <span>{release.releaseType}</span>
            )}
            <span>{releaseDateLabel}</span>
            <span>
              {release.tracks.length}{" "}
              {release.tracks.length === 1
                ? "track"
                : "tracks"}
            </span>
            {releaseRuntimeLabel && (
              <span>{releaseRuntimeLabel}</span>
            )}
          </div>

          <div className="library-release-overview-provenance">
            {releaseProvenance ? (
              <ProvenanceBadge
                provenance={releaseProvenance}
                variant="full"
              />
            ) : (
              <small className="library-provenance-untagged">
                Provenance not tagged — no Human / AI bubble will be published.
              </small>
            )}
          </div>

          {releaseDescription ? (
            <p className="library-release-overview-description">
              {releaseDescription}
            </p>
          ) : (
            <p className="library-release-overview-description is-empty">
              No public release description has been authored yet.
            </p>
          )}
        </div>
      </section>

      {hiplingoPreviewOpen && (
        <HiplingoPreviewPanel
          releaseId={release.id}
          releaseTitle={releaseDisplayTitle}
          selectedTrackKey={selectedTrackKey}
        />
      )}

      <section className="library-release-overview-tracks">
        <header>
          <div>
            <h2>Tracks</h2>
            <p>
              Browse the release here. Detailed metadata remains behind Edit metadata.
            </p>
          </div>
        </header>

        <ol>
          {release.tracks.map((track, index) => {
            const trackDocuments =
              detail.documents.filter(
                (document) =>
                  document.trackId === track.id,
              );

            const trackProvenance = resolveTrackProvenance(
              trackProvenanceMetadata(track.id),
              releaseProvenanceMetadata,
            );
            const title = readTrackDisplayTitle(
              track.id,
              trackDocuments,
              formatReleaseTitle(track.id),
            );

            const trackArtwork =
              selectPreferredReleaseArtwork(
                track.artworkMasters,
              );

            const effectiveArtwork =
              trackArtwork ?? releaseArtwork;

            const playable =
              trackHasAudioPreview(track);
            const trackKey =
              `${release.id}::${track.id}`;

            const isCurrent =
              playback.currentTrack?.key ===
              trackKey;

            const isPlaying =
              isCurrent && playback.isPlaying;

            const isSelected =
              selectedTrackKey === trackKey;

            return (
              <li
                key={track.id}
                data-playable={playable ? "true" : "false"}
                data-selected={isSelected ? "true" : "false"}
                data-playing={isPlaying ? "true" : "false"}
                onClick={
                  playable
                    ? () => setSelectedTrackKey(trackKey)
                    : undefined
                }
                onDoubleClick={
                  playable
                    ? (event) => {
                        event.preventDefault();
                        setSelectedTrackKey(trackKey);

                        if (isCurrent) {
                          if (!playback.isPlaying) {
                            playback.togglePlayback();
                          }
                          return;
                        }

                        playback.playQueue({
                          trackKey,
                          queue: playbackQueue,
                          autoplay: true,
                        });
                      }
                    : undefined
                }
              >
                <span className="library-release-overview-track-number">
                  {index + 1}
                </span>

                <button
                  type="button"
                  className={[
                    "library-release-overview-track-artwork",
                    "library-release-overview-track-artwork-button",
                    isSelected ? "is-selected" : "",
                    isPlaying ? "is-playing" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  disabled={!playable}
                  aria-label={`${isPlaying ? "Pause" : "Play"} ${title}`}
                  title={
                    playable
                      ? `${isPlaying ? "Pause" : "Play"} ${title}`
                      : "Playback unavailable"
                  }
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelectedTrackKey(trackKey);
                    playback.toggleTrack(
                      trackKey,
                      playbackQueue,
                    );
                  }}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                  }}
                >
                  {effectiveArtwork ? (
                    <img
                      src={artworkPreviewUrl(
                        effectiveArtwork.relativePath,
                      )}
                      alt=""
                      aria-hidden="true"
                    />
                  ) : (
                    <img
                      className="hiplingo-artwork-fallback"
                      src={hiplingoLogoUrl}
                      alt=""
                      aria-hidden="true"
                    />
                  )}

                  {playable && (
                    <span
                      className="library-release-overview-track-play-indicator"
                      aria-hidden="true"
                    >
                      {isPlaying ? "Ⅱ" : "▶"}
                    </span>
                  )}
                </button>

                <span className="library-release-overview-track-copy">
                  <strong>{title}</strong>
                  <small>
                    {playable
                      ? isPlaying
                        ? "Playing"
                        : isSelected
                          ? "Selected"
                          : "Playback audio"
                      : "Playback unavailable"}
                  </small>
                </span>

                {trackProvenance ? (
                  <ProvenanceBadge provenance={trackProvenance} />
                ) : (
                  <small className="library-provenance-untagged">
                    Not tagged
                  </small>
                )}
              </li>
            );
          })}
        </ol>
      </section>
    </section>
  );
}

function LibraryArtistRoster({
  artists,
  releases,
  selectedArtistId,
  onSelectedArtistIdChange,
  onLibraryChanged,
  onOpenRelease,
  onNotify,
  showAdminTools,
  technicalAudit,
  technicalByRelease,
  playback,
  waveformColorMode,
  viewMode,
  onViewModeChange,
}: {
  artists: ArtistScanResult[];
  releases: ReleaseScanResult[];
  selectedArtistId: string | null;
  onSelectedArtistIdChange: (artistId: string | null) => void;
  onLibraryChanged: () => Promise<void>;
  onOpenRelease: (releaseId: string) => void;
  onNotify: (
    message: string,
    tone?: ToastMessage["tone"],
  ) => void;
  showAdminTools: boolean;
  technicalAudit: MediaTechnicalAuditState;
  technicalByRelease: Map<
    string,
    MediaTechnicalReleaseSummary
  >;
  playback: PersistentLibraryPlaybackController;
  waveformColorMode: WaveformColorMode;
  viewMode: LibraryReleaseViewMode;
  onViewModeChange: (mode: LibraryReleaseViewMode) => void;
}) {
  const [photoPickerOpen, setPhotoPickerOpen] =
    useState(false);
  const [photoCandidates, setPhotoCandidates] =
    useState<ArtistPhotoCandidate[]>([]);
  const [photoCandidatesLoading, setPhotoCandidatesLoading] =
    useState(false);
  const [photoCandidatesError, setPhotoCandidatesError] =
    useState<string | null>(null);
  const [artistMutationKey, setArtistMutationKey] =
    useState<string | null>(null);
  const [makeImportedPhotoPrimary, setMakeImportedPhotoPrimary] =
    useState(false);
  const [artistBioDraft, setArtistBioDraft] =
    useState("");
  const [artistBioSaving, setArtistBioSaving] =
    useState(false);

  const releaseCountByArtist = useMemo(() => {
    const counts = new Map<string, number>();
    for (const release of releases) {
      if (!release.primaryArtistId) {
        continue;
      }
      counts.set(
        release.primaryArtistId,
        (counts.get(release.primaryArtistId) ?? 0) + 1,
      );
    }
    return counts;
  }, [releases]);

  const selectedArtist = selectedArtistId
    ? artists.find((artist) => artist.id === selectedArtistId) ?? null
    : null;

  const associatedReleases = useMemo(
    () => selectedArtist
      ? releases.filter(
          (release) =>
            release.primaryArtistId === selectedArtist.id,
        )
      : [],
    [releases, selectedArtist],
  );

  useEffect(() => {
    if (
      selectedArtistId &&
      !artists.some((artist) => artist.id === selectedArtistId)
    ) {
      onSelectedArtistIdChange(null);
    }
  }, [artists, selectedArtistId]);

  useEffect(() => {
    setArtistBioDraft(
      selectedArtist?.bio ?? "",
    );
  }, [
    selectedArtist?.bio,
    selectedArtist?.id,
  ]);

  const saveBio = async () => {
    if (!selectedArtist) {
      return;
    }

    setArtistBioSaving(true);

    try {
      const response = await fetch(
        "/api/library/save-artist-bio",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            artistId: selectedArtist.id,
            bio: artistBioDraft,
          }),
        },
      );
      const payload = (await response.json()) as
        | {
            artistId: string;
            bio: string;
            changed: boolean;
          }
        | { error?: string };

      if (
        !response.ok ||
        !("artistId" in payload)
      ) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Unable to save Artist bio.",
        );
      }

      await onLibraryChanged();
      onNotify(
        payload.changed
          ? `Artist bio updated for ${selectedArtist.displayName}`
          : `Artist bio already current for ${selectedArtist.displayName}`,
        "success",
      );
    } catch (bioError) {
      onNotify(
        bioError instanceof Error
          ? bioError.message
          : "Unable to save Artist bio.",
        "error",
      );
    } finally {
      setArtistBioSaving(false);
    }
  };

  const closePhotoPicker = () => {
    setPhotoPickerOpen(false);
    setPhotoCandidates([]);
    setPhotoCandidatesError(null);
  };

  const openPhotoPicker = async () => {
    if (!selectedArtist) {
      return;
    }

    setPhotoPickerOpen(true);
    setPhotoCandidatesLoading(true);
    setPhotoCandidatesError(null);
    setMakeImportedPhotoPrimary(
      !selectedArtist.primaryAssetId,
    );

    try {
      const response = await fetch(
        "/api/library/artist-photo-candidates",
      );
      const payload = (await response.json()) as
        | { candidates: ArtistPhotoCandidate[] }
        | { error?: string };

      if (!response.ok || !("candidates" in payload)) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Unable to load Artist photo candidates.",
        );
      }

      setPhotoCandidates(payload.candidates);
    } catch (candidateError) {
      setPhotoCandidatesError(
        candidateError instanceof Error
          ? candidateError.message
          : "Unable to load Artist photo candidates.",
      );
    } finally {
      setPhotoCandidatesLoading(false);
    }
  };

  const importPhoto = async (
    candidate: ArtistPhotoCandidate,
  ) => {
    if (!selectedArtist) {
      return;
    }

    const mutationKey = `import:${candidate.relativePath}`;
    setArtistMutationKey(mutationKey);

    try {
      const response = await fetch(
        "/api/library/import-artist-photo",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            artistId: selectedArtist.id,
            sourceRelativePath: candidate.relativePath,
            setPrimary: makeImportedPhotoPrimary,
          }),
        },
      );
      const payload = (await response.json()) as
        | { assetId: string; primaryAssetId: string }
        | { error?: string };

      if (!response.ok || !("assetId" in payload)) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Artist photo import failed.",
        );
      }

      await onLibraryChanged();
      closePhotoPicker();
      onNotify(
        `Added ${candidate.filename} to ${selectedArtist.displayName}`,
        "success",
      );
    } catch (importError) {
      onNotify(
        importError instanceof Error
          ? importError.message
          : "Artist photo import failed.",
        "error",
      );
    } finally {
      setArtistMutationKey(null);
    }
  };

  const choosePrimaryPhoto = async (
    asset: ArtistAssetScanResult,
  ) => {
    if (!selectedArtist) {
      return;
    }

    const mutationKey = `primary:${asset.id}`;
    setArtistMutationKey(mutationKey);

    try {
      const response = await fetch(
        "/api/library/set-primary-artist-photo",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            artistId: selectedArtist.id,
            assetId: asset.id,
          }),
        },
      );
      const payload = (await response.json()) as
        | { primaryAssetId: string }
        | { error?: string };

      if (!response.ok || !("primaryAssetId" in payload)) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Unable to change the primary Artist photo.",
        );
      }

      await onLibraryChanged();
      onNotify(
        `Primary Artist photo updated for ${selectedArtist.displayName}`,
        "success",
      );
    } catch (primaryError) {
      onNotify(
        primaryError instanceof Error
          ? primaryError.message
          : "Unable to change the primary Artist photo.",
        "error",
      );
    } finally {
      setArtistMutationKey(null);
    }
  };

  const removePhoto = async (
    asset: ArtistAssetScanResult,
  ) => {
    if (!selectedArtist) {
      return;
    }

    const label =
      asset.sourceFilename ?? asset.id;
    const removingPrimary =
      asset.id === selectedArtist.primaryAssetId;
    const reviewed = window.confirm(
      `Remove ${label} from ${selectedArtist.displayName}?\n\n` +
        (removingPrimary
          ? "This is the Primary Artist photo. Removing it will leave the Artist with no Primary photo until another one is selected or added.\n\n"
          : "") +
        "The canonical source will be archived inside the private Artist Library for recovery.",
    );
    if (!reviewed) {
      return;
    }

    const mutationKey = `remove:${asset.id}`;
    setArtistMutationKey(mutationKey);

    try {
      const response = await fetch(
        "/api/library/remove-artist-photo",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            artistId: selectedArtist.id,
            assetId: asset.id,
          }),
        },
      );
      const payload = (await response.json()) as
        | { removedAssetId: string }
        | { error?: string };

      if (!response.ok || !("removedAssetId" in payload)) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Unable to remove the Artist photo.",
        );
      }

      await onLibraryChanged();
      onNotify(
        `Removed ${label} from ${selectedArtist.displayName}`,
        "success",
      );
    } catch (removeError) {
      onNotify(
        removeError instanceof Error
          ? removeError.message
          : "Unable to remove the Artist photo.",
        "error",
      );
    } finally {
      setArtistMutationKey(null);
    }
  };

  if (selectedArtist) {
    const primaryAsset = selectedArtist.primaryAssetId
      ? selectedArtist.assets.find(
          (asset) => asset.id === selectedArtist.primaryAssetId,
        )
      : undefined;

    return (
      <section className="library-artist-browser library-artist-detail">
        <header className="library-artist-browser-toolbar">
          <div>
            <button
              type="button"
              className="secondary-button library-artist-back-button"
              onClick={() => {
                closePhotoPicker();
                onSelectedArtistIdChange(null);
              }}
            >
              ← All Artists
            </button>
            <strong>{selectedArtist.displayName}</strong>
          </div>
          <small>
            {selectedArtist.assets.length} photo{selectedArtist.assets.length === 1 ? "" : "s"}
            {" · "}
            {associatedReleases.length} release{associatedReleases.length === 1 ? "" : "s"}
          </small>
        </header>

        <section className="library-artist-detail-grid">
          <div className="library-artist-primary-panel">
            <h3>Primary Artist Photo</h3>
            <div className="library-artist-primary-photo">
              {primaryAsset?.exists ? (
                <img
                  src={artworkPreviewUrl(primaryAsset.relativePath)}
                  alt={`Primary Artist photo for ${selectedArtist.displayName}`}
                />
              ) : (
                <img
                  className="hiplingo-artwork-fallback"
                  src={hiplingoLogoUrl}
                  alt=""
                  aria-hidden="true"
                />
              )}
            </div>
            <div className="library-artist-identity-block">
              <strong>{selectedArtist.displayName}</strong>
              <code>{selectedArtist.id}</code>
              <small>{selectedArtist.slug}</small>
            </div>
          </div>

          <div className="library-artist-assets-panel">
            <header>
              <div>
                <h3>Artist Photos</h3>
                <p>
                  Artist-scoped canonical sources. Click an alternate photo to make it Primary.
                  Remove archives the private source for recovery and clears Primary when needed.
                </p>
              </div>
              <button
                type="button"
                className="primary-button"
                disabled={artistMutationKey !== null}
                onClick={() => void openPhotoPicker()}
              >
                Add Photo
              </button>
            </header>

            {selectedArtist.assets.length === 0 ? (
              <p className="library-artist-assets-empty">
                No Artist photos have been imported yet.
              </p>
            ) : (
              <div className="library-artist-asset-grid">
                {selectedArtist.assets.map((asset) => {
                  const isPrimary = asset.id === selectedArtist.primaryAssetId;
                  const primaryMutationKey = `primary:${asset.id}`;
                  const removeMutationKey = `remove:${asset.id}`;
                  const assetLabel =
                    asset.sourceFilename ?? asset.id;

                  return (
                    <article className="library-artist-asset-card" key={asset.id}>
                      {asset.exists && !isPrimary ? (
                        <button
                          type="button"
                          className="library-artist-asset-preview library-artist-asset-preview-button"
                          disabled={artistMutationKey !== null}
                          aria-label={`Make ${assetLabel} the Primary Artist photo for ${selectedArtist.displayName}`}
                          onClick={() => void choosePrimaryPhoto(asset)}
                        >
                          <img
                            src={artworkPreviewUrl(asset.relativePath)}
                            alt={assetLabel}
                            loading="lazy"
                          />
                        </button>
                      ) : (
                        <div className="library-artist-asset-preview">
                          {asset.exists ? (
                            <img
                              src={artworkPreviewUrl(asset.relativePath)}
                              alt={isPrimary
                                ? `Primary Artist photo for ${selectedArtist.displayName}`
                                : assetLabel}
                              loading="lazy"
                            />
                          ) : (
                            <span>Source missing</span>
                          )}
                        </div>
                      )}
                      <div className="library-artist-asset-copy">
                        <div>
                          <strong>{asset.id}</strong>
                          {isPrimary && <span className="badge">Primary</span>}
                        </div>
                        <small>{assetLabel}</small>
                        <div className="library-artist-asset-actions">
                          <small>
                            {isPrimary
                              ? "Primary Artist photo"
                              : artistMutationKey === primaryMutationKey
                                ? "Setting Primary…"
                                : "Click photo to make Primary"}
                          </small>
                          <button
                            type="button"
                            className="library-artist-asset-remove-button"
                            disabled={artistMutationKey !== null || !asset.exists}
                            onClick={() => void removePhoto(asset)}
                          >
                            {artistMutationKey === removeMutationKey
                              ? "Making private…"
                              : "Remove"}
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {photoPickerOpen && (
              <section className="library-artist-photo-picker">
                <header>
                  <div>
                    <strong>Add Artist Photo</strong>
                    <small>Choose an image currently in ingest-drop.</small>
                  </div>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={closePhotoPicker}
                    disabled={artistMutationKey !== null}
                  >
                    Close
                  </button>
                </header>

                <label className="library-artist-primary-toggle">
                  <input
                    type="checkbox"
                    checked={makeImportedPhotoPrimary}
                    disabled={!selectedArtist.primaryAssetId}
                    onChange={(event) =>
                      setMakeImportedPhotoPrimary(event.target.checked)
                    }
                  />
                  {selectedArtist.primaryAssetId
                    ? "Make imported photo Primary"
                    : "First Artist photo becomes Primary"}
                </label>
                <p className="library-artist-photo-picker-note">
                  The high-quality source is copied into the private Artist Library. The ingest-drop file is left untouched.
                </p>

                {photoCandidatesLoading ? (
                  <p className="message">Scanning ingest-drop images…</p>
                ) : photoCandidatesError ? (
                  <p className="message error">{photoCandidatesError}</p>
                ) : photoCandidates.length === 0 ? (
                  <p className="message">No previewable images are available in ingest-drop.</p>
                ) : (
                  <div className="library-artist-photo-candidate-grid">
                    {photoCandidates.map((candidate) => {
                      const mutationKey = `import:${candidate.relativePath}`;
                      return (
                        <article
                          className="library-artist-photo-candidate"
                          key={candidate.relativePath}
                        >
                          <button
                            type="button"
                            className="library-artist-photo-candidate-image-button"
                            disabled={artistMutationKey !== null}
                            aria-label={`Add ${candidate.filename} to ${selectedArtist.displayName}`}
                            onClick={() => void importPhoto(candidate)}
                          >
                            <img
                              src={buildIngestArtworkPreviewUrl(
                                candidate.relativePath,
                                candidate.modifiedAt,
                              )}
                              alt={candidate.filename}
                              loading="lazy"
                            />
                          </button>
                          <div>
                            <strong>{candidate.filename}</strong>
                            <small>{candidate.relativePath}</small>
                            <span>{formatByteSize(candidate.sizeBytes)}</span>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            )}
          </div>
        </section>

        <section className="library-artist-bio-editor">
          <header>
            <div>
              <h3>Artist Bio / Info</h3>
              <p>
                Short public-facing Artist context. Suggested length: about
                40–100 words. Leave blank to publish no bio section.
              </p>
            </div>
          </header>

          <textarea
            rows={7}
            maxLength={2400}
            value={artistBioDraft}
            disabled={artistBioSaving}
            placeholder="Who is the Artist, what do they sound or work like, and what is one meaningful context or career anchor?"
            spellCheck="true"
            onChange={(event) =>
              setArtistBioDraft(
                event.target.value,
              )
            }
          />

          <div className="library-artist-bio-editor__actions">
            <small>
              {
                artistBioDraft.trim()
                  ? artistBioDraft.trim().split(/\s+/).length
                  : 0
              } words
              {" · "}
              {artistBioDraft.length}/2400 characters
            </small>
            <button
              type="button"
              className="primary-button"
              disabled={
                artistBioSaving ||
                artistBioDraft.trim() ===
                  (selectedArtist.bio ?? "").trim()
              }
              onClick={() => void saveBio()}
            >
              {artistBioSaving
                ? "Saving bio…"
                : "Save Artist bio"}
            </button>
          </div>
        </section>

        <section className="library-artist-release-browser-section">
          {associatedReleases.length === 0 ? (
            <div className="library-artist-associated-releases">
              <h3>Associated Releases</h3>
              <p>No releases currently reference this Artist.</p>
            </div>
          ) : (
            <LibraryReleaseBrowser
              releases={associatedReleases}
              onLibraryChanged={onLibraryChanged}
              onOpenRelease={onOpenRelease}
              showAdminTools={showAdminTools}
              onNotify={onNotify}
              technicalAudit={technicalAudit}
              technicalByRelease={technicalByRelease}
              playback={playback}
              waveformColorMode={waveformColorMode}
              viewMode={viewMode}
              onViewModeChange={onViewModeChange}
              heading={`${selectedArtist.displayName} releases`}
              showTechnicalSummary={false}
            />
          )}
        </section>
      </section>
    );
  }

  return (
    <section className="library-artist-browser">
      <header className="library-artist-browser-toolbar">
        <div>
          <strong>Library artists</strong>
          <small>
            {artists.length} {artists.length === 1 ? "artist" : "artists"}
          </small>
        </div>
        <small>Canonical Artist identities · private Library</small>
      </header>

      {artists.length === 0 ? (
        <div className="library-artist-empty-state">
          <strong>No canonical Artists yet</strong>
          <p>
            Run the reviewed Artist migration before assigning photos.
            Release artwork is intentionally not used as an Artist-photo fallback.
          </p>
        </div>
      ) : (
        <section
          className="library-artist-roster"
          aria-label="Library artists"
        >
          {artists.map((artist) => {
            const primaryAsset = artist.primaryAssetId
              ? artist.assets.find(
                  (asset) => asset.id === artist.primaryAssetId,
                )
              : undefined;
            const associatedReleaseCount =
              releaseCountByArtist.get(artist.id) ?? 0;

            return (
              <button
                type="button"
                className="library-artist-card"
                key={artist.id}
                onClick={() => onSelectedArtistIdChange(artist.id)}
              >
                <div className="library-artist-photo-placeholder">
                  {primaryAsset?.exists ? (
                    <img
                      src={artworkPreviewUrl(primaryAsset.relativePath)}
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
                </div>
                <div className="library-artist-card-copy">
                  <strong>{artist.displayName}</strong>
                  <span>Associated releases: {associatedReleaseCount}</span>
                </div>
              </button>
            );
          })}
        </section>
      )}
    </section>
  );
}

type LibraryReleaseViewMode =
  | "rows"
  | "cards"
  | "tiles"
  | "waveform";

type LibraryReleaseSortMode =
  | "library"
  | "date-desc"
  | "date-asc"
  | "title"
  | "artist";

const LIBRARY_RELEASE_SORT_STORAGE_KEY =
  "metadata-editor.library-release-sort";

const LIBRARY_TILE_SIZE_MIN_REM = 9;

const LIBRARY_TILE_SIZE_MAX_REM = 24;

const LIBRARY_TILE_SIZE_STEP_REM = 0.25;

const LIBRARY_TILE_SIZE_DEFAULT_REM = 16;

function readLibraryReleaseSortMode(): LibraryReleaseSortMode {
  if (typeof window === "undefined") {
    return "date-desc";
  }

  try {
    const stored = window.localStorage.getItem(
      LIBRARY_RELEASE_SORT_STORAGE_KEY,
    );

    return stored === "library" ||
      stored === "date-desc" ||
      stored === "date-asc" ||
      stored === "title" ||
      stored === "artist"
      ? stored
      : "date-desc";
  } catch {
    return "date-desc";
  }
}

function libraryReleaseSortDate(
  release: ReleaseScanResult,
): string {
  const explicit = release.releaseDate?.trim();
  if (explicit) {
    return explicit.slice(0, 10);
  }

  return release.id.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? "";
}

function libraryReleaseSortTitle(
  release: ReleaseScanResult,
): string {
  return resolveReleaseDisplayTitle(
    release.releaseTitle,
    formatReleaseTitle(release.id),
  );
}

function sortLibraryReleases(
  releases: readonly ReleaseScanResult[],
  mode: LibraryReleaseSortMode,
): ReleaseScanResult[] {
  if (mode === "library") {
    return [...releases];
  }

  const sorted = [...releases];
  sorted.sort((a, b) => {
    if (mode === "title") {
      return libraryReleaseSortTitle(a).localeCompare(
        libraryReleaseSortTitle(b),
        undefined,
        { sensitivity: "base" },
      );
    }

    if (mode === "artist") {
      const aArtist = a.primaryArtistName?.trim() ?? "";
      const bArtist = b.primaryArtistName?.trim() ?? "";

      if (!aArtist && bArtist) return 1;
      if (aArtist && !bArtist) return -1;

      return aArtist.localeCompare(
        bArtist,
        undefined,
        { sensitivity: "base" },
      ) || libraryReleaseSortTitle(a).localeCompare(
        libraryReleaseSortTitle(b),
        undefined,
        { sensitivity: "base" },
      );
    }

    const aDate = libraryReleaseSortDate(a);
    const bDate = libraryReleaseSortDate(b);

    if (!aDate && bDate) return 1;
    if (aDate && !bDate) return -1;

    const comparison = aDate.localeCompare(bDate);
    return mode === "date-desc"
      ? -comparison
      : comparison;
  });

  return sorted;
}

function LibraryReleaseViewIcon({
  mode,
}: {
  mode: LibraryReleaseViewMode;
}) {
  if (mode === "rows") {
    return (
      <svg viewBox="0 0 18 18" aria-hidden="true">
        <rect x="1.5" y="2.5" width="3" height="3" rx="0.4" />
        <rect x="1.5" y="7.5" width="3" height="3" rx="0.4" />
        <rect x="1.5" y="12.5" width="3" height="3" rx="0.4" />
        <path d="M6 4h10M6 9h10M6 14h10" />
      </svg>
    );
  }

  if (mode === "cards") {
    return (
      <svg viewBox="0 0 18 18" aria-hidden="true">
        <rect x="1.5" y="2" width="15" height="5.5" rx="0.8" />
        <rect x="1.5" y="10.5" width="15" height="5.5" rx="0.8" />
      </svg>
    );
  }

  if (mode === "waveform") {
    return (
      <svg viewBox="0 0 18 18" aria-hidden="true">
        <path d="M1.5 9h2l1.4-4.5 2.1 9 2-7 2 5 1.8-8 1.7 5.5H16.5" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 18 18" aria-hidden="true">
      <rect x="1.5" y="1.5" width="6" height="6" rx="0.8" />
      <rect x="10.5" y="1.5" width="6" height="6" rx="0.8" />
      <rect x="1.5" y="10.5" width="6" height="6" rx="0.8" />
      <rect x="10.5" y="10.5" width="6" height="6" rx="0.8" />
    </svg>
  );
}

function LibraryReleaseBrowser({
  releases,
  onLibraryChanged,
  onOpenRelease,
  showAdminTools,
  onNotify,
  technicalAudit,
  technicalByRelease,
  playback,
  waveformColorMode,
  viewMode,
  onViewModeChange,
  heading = "Library releases",
  showTechnicalSummary = true,
}: {
  releases: ReleaseScanResult[];
  onLibraryChanged: () => Promise<void>;
  onOpenRelease: (releaseId: string) => void;
  showAdminTools: boolean;
  onNotify: (
    message: string,
    tone?: ToastMessage["tone"],
  ) => void;
  technicalAudit: MediaTechnicalAuditState;
  technicalByRelease: Map<
    string,
    MediaTechnicalReleaseSummary
  >;
  playback: PersistentLibraryPlaybackController;
  waveformColorMode: WaveformColorMode;
  viewMode: LibraryReleaseViewMode;
  onViewModeChange: (mode: LibraryReleaseViewMode) => void;
  heading?: string;
  showTechnicalSummary?: boolean;
}) {
  const [sortMode, setSortMode] =
    useState<LibraryReleaseSortMode>(
      readLibraryReleaseSortMode,
    );
  const [tileSizeRem, setTileSizeRem] =
    useState<number>(LIBRARY_TILE_SIZE_DEFAULT_REM);

  const sortedReleases = useMemo(
    () => sortLibraryReleases(releases, sortMode),
    [releases, sortMode],
  );

  const chooseSortMode = (
    mode: LibraryReleaseSortMode,
  ) => {
    setSortMode(mode);

    try {
      window.localStorage.setItem(
        LIBRARY_RELEASE_SORT_STORAGE_KEY,
        mode,
      );
    } catch {
      // Sort preference persistence is optional UI convenience.
    }
  };

  const chooseTileSizeRem = (
    nextValue: number,
  ) => {
    const clamped = Math.min(
      LIBRARY_TILE_SIZE_MAX_REM,
      Math.max(LIBRARY_TILE_SIZE_MIN_REM, nextValue),
    );

    setTileSizeRem(clamped);
  };

  const chooseViewMode = (
    mode: LibraryReleaseViewMode,
  ) => {
    onViewModeChange(mode);
  };

  return (
    <section className="library-release-browser">
      <header className="library-release-browser-toolbar">
        <div>
          {viewMode === "waveform" && (
            <button
              type="button"
              className="secondary-button library-waveform-release-back-button"
              onClick={() => chooseViewMode("tiles")}
              title="Return to artwork-first release tiles"
            >
              ← Releases
            </button>
          )}
          <strong>{heading}</strong>
          <small>
            {releases.length} {releases.length === 1 ? "release" : "releases"}
          </small>
          {showTechnicalSummary && (
            <TechnicalAuditSummaryBadge audit={technicalAudit} />
          )}
        </div>

        <div className="library-release-browser-controls">
          <label className="library-release-sort-control">
            <span>Sort by</span>
            <select
              value={sortMode}
              onChange={(event) =>
                chooseSortMode(
                  event.target.value as LibraryReleaseSortMode,
                )
              }
            >
              <option value="library">Library order</option>
              <option value="date-desc">Release date · newest</option>
              <option value="date-asc">Release date · oldest</option>
              <option value="title">Title · A–Z</option>
              <option value="artist">Artist · A–Z</option>
            </select>
          </label>

          {viewMode === "tiles" && (
            <label
              className="library-tile-size-control"
              title="Adjust Library tile size"
            >
              <span>Tile size</span>
              <input
                type="range"
                min={LIBRARY_TILE_SIZE_MIN_REM}
                max={LIBRARY_TILE_SIZE_MAX_REM}
                step={LIBRARY_TILE_SIZE_STEP_REM}
                value={tileSizeRem}
                aria-label="Library tile size"
                aria-valuetext={`${tileSizeRem} rem`}
                onChange={(event) =>
                  chooseTileSizeRem(
                    Number.parseFloat(event.target.value),
                  )
                }
              />
              <output>{tileSizeRem}rem</output>
            </label>
          )}

          <div
            className="library-release-view-switcher"
            role="group"
            aria-label="Library release view"
          >
            {(
              [
                ["rows", "Rows", "Dense column view"],
                ["cards", "Cards", "Expanded release cards"],
                ["tiles", "Tiles", "Artwork-first browsing"],
                ["waveform", "Waveform", "Now Playing waveform and oscilloscope"],
              ] as const
            ).map(([mode, label, description]) => (
              <button
                key={mode}
                type="button"
                aria-label={`${label} view`}
                aria-pressed={viewMode === mode}
                title={description}
                onClick={() => chooseViewMode(mode)}
              >
                <LibraryReleaseViewIcon mode={mode} />
              </button>
            ))}
          </div>
        </div>
      </header>

      {viewMode === "waveform" ? (
        <Suspense
          fallback={<p className="message">Loading Waveform view…</p>}
        >
          <LibraryWaveformView
            playback={playback}
            colorMode={waveformColorMode}
            releaseDurationSecondsById={new Map(
              [...technicalByRelease].flatMap(([releaseId, summary]) =>
                summary.durationSeconds !== undefined
                  ? [[releaseId, summary.durationSeconds] as const]
                  : [],
              ),
            )}
          />
        </Suspense>
      ) : (
        <section
          className={`release-list library-release-list library-release-list--${viewMode}`}
          aria-label={`Library releases in ${viewMode} view`}
          style={
            viewMode === "tiles"
              ? {
                  gridTemplateColumns:
                    `repeat(auto-fill, minmax(${tileSizeRem}rem, 1fr))`,
                }
              : undefined
          }
        >
          {sortedReleases.map((release) => (
            <ReleaseCard
              key={release.relativePath}
              release={release}
              onLibraryChanged={onLibraryChanged}
              onOpenRelease={() =>
                onOpenRelease(release.id)
              }
              showAdminTools={showAdminTools}
              onNotify={onNotify}
              technicalSummary={technicalByRelease.get(release.id)}
              technicalLoading={technicalAudit.loading}
              technicalError={technicalAudit.error}
            />
          ))}
        </section>
      )}
    </section>
  );
}

export {
  LibraryEntitySwitcher,
  LibraryReleaseOverview,
  LibraryArtistRoster,
  type LibraryReleaseViewMode,
  type LibraryReleaseSortMode,
  LIBRARY_RELEASE_SORT_STORAGE_KEY,
  LIBRARY_TILE_SIZE_MIN_REM,
  LIBRARY_TILE_SIZE_MAX_REM,
  LIBRARY_TILE_SIZE_STEP_REM,
  LIBRARY_TILE_SIZE_DEFAULT_REM,
  readLibraryReleaseSortMode,
  libraryReleaseSortDate,
  libraryReleaseSortTitle,
  sortLibraryReleases,
  LibraryReleaseViewIcon,
  LibraryReleaseBrowser,
};
