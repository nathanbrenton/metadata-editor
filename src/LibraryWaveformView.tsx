import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  buildAudioPreviewUrl,
  getAudioPreviewSourceLabel,
  trackHasAudioPreview,
} from "./audio-preview.js";
import {
  selectPreferredReleaseArtwork,
  selectReleaseFrontArtwork,
} from "./artwork-gallery.js";
import { LibraryWaveformCanvas } from "./LibraryWaveformCanvas.js";
import {
  buildLibraryWaveformUrl,
  parseLibraryWaveformData,
  type LibraryWaveformData,
} from "./library-waveform.js";
import type {
  WaveformColorMode,
} from "./media-waveform.js";
import {
  type PersistentLibraryPlaybackController,
  type PersistentPlaybackTrack,
} from "./PersistentLibraryPlayer.js";
import {
  resolveReleaseDisplayTitle,
} from "./release-display-title.js";
import {
  buildTrackNavigationOrder,
} from "./track-navigation-order.js";
import {
  formatTrackDisplayTitle,
} from "../shared/track-title.js";

type LibraryWaveformAsset = {
  filename: string;
  relativePath: string;
  extension: string;
};

type LibraryWaveformTrackScan = {
  id: string;
  audioMasters: LibraryWaveformAsset[];
  playbackAudio?: LibraryWaveformAsset[];
  artworkMasters: LibraryWaveformAsset[];
};

type LibraryWaveformReleaseScan = {
  id: string;
  releaseTitle?: string;
  primaryArtistName?: string;
  releaseDate?: string;
  artworkMasters: LibraryWaveformAsset[];
  tracks: LibraryWaveformTrackScan[];
};

type LibraryWaveformDocument = {
  filename: string;
  scope: "release" | "track";
  trackId?: string;
  parsed: Record<string, unknown>;
};

type LibraryWaveformReleaseDetail = {
  releaseId: string;
  documents: LibraryWaveformDocument[];
};

export type LibraryWaveformNavigationRequest = {
  releaseId: string;
  requestId: number;
};

type LibraryWaveformViewProps = {
  releases: LibraryWaveformReleaseScan[];
  playback: PersistentLibraryPlaybackController;
  colorMode: WaveformColorMode;
  releaseDurationSecondsById: ReadonlyMap<string, number>;
  navigationRequest?: LibraryWaveformNavigationRequest | null;
  onOpenMetadata: (releaseId: string) => void;
};

function formatReleaseRuntime(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(wholeSeconds / 60);
  const remainder = wholeSeconds % 60;

  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function titleCaseSlug(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function inferredReleaseTitle(releaseId: string): string {
  return titleCaseSlug(
    releaseId.replace(/^\d{4}-\d{2}-\d{2}_/, ""),
  );
}

function inferredTrackNumber(trackId: string): number | null {
  const match = trackId.match(/_(\d{1,3})_/);
  return match ? Number(match[1]) : null;
}

function readTrackRecord(
  detail: LibraryWaveformReleaseDetail | null,
  trackId: string,
): Record<string, unknown> | null {
  const document = detail?.documents.find(
    (candidate) =>
      candidate.scope === "track" &&
      candidate.trackId === trackId &&
      candidate.filename === "track.toml",
  );
  const value = document?.parsed.track;

  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : null;
}

function readTrackInteger(
  detail: LibraryWaveformReleaseDetail | null,
  trackId: string,
  field: "track_number" | "disc_number",
): number | null {
  const track = readTrackRecord(detail, trackId);
  const numbering = track?.numbering;

  if (typeof numbering !== "object" || numbering === null) {
    return null;
  }

  const value = (numbering as Record<string, unknown>)[field];

  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0
    ? value
    : null;
}

function readTrackDisplayTitle(
  detail: LibraryWaveformReleaseDetail | null,
  trackId: string,
): string {
  const track = readTrackRecord(detail, trackId);
  const displayTitle =
    typeof track?.display_title === "string"
      ? track.display_title.trim()
      : "";

  if (displayTitle) {
    return displayTitle;
  }

  const title =
    typeof track?.title === "string"
      ? track.title
      : "";
  const version =
    typeof track?.version === "string"
      ? track.version
      : "";
  const generated = formatTrackDisplayTitle(title, version);

  return generated || titleCaseSlug(trackId);
}

function formatReleaseDateLabel(release: LibraryWaveformReleaseScan): string {
  const raw = release.releaseDate?.trim() ||
    release.id.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ||
    "";

  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return "Release date not identified";
  }

  const date = new Date(`${raw}T12:00:00Z`);
  if (!Number.isFinite(date.getTime())) {
    return raw;
  }

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function artworkPreviewUrl(relativePath: string): string {
  return `/api/library/artwork-preview?${new URLSearchParams({
    path: relativePath,
  }).toString()}`;
}

function trackNumberLabel(
  discNumber: number,
  trackNumber: number | null,
): string {
  if (trackNumber === null) {
    return "—";
  }

  return discNumber > 1
    ? `${discNumber}.${trackNumber}`
    : String(trackNumber);
}

export function LibraryWaveformView({
  releases,
  playback,
  colorMode,
  releaseDurationSecondsById,
  navigationRequest,
  onOpenMetadata,
}: LibraryWaveformViewProps) {
  const activeLibraryReleaseId = playback.currentTrack?.releaseId;
  const [selectedReleaseId, setSelectedReleaseId] = useState(
    () =>
      releases.some((release) => release.id === activeLibraryReleaseId)
        ? activeLibraryReleaseId ?? ""
        : releases[0]?.id ?? "",
  );
  const [detail, setDetail] =
    useState<LibraryWaveformReleaseDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [selectedTrackId, setSelectedTrackId] = useState("");
  const [waveform, setWaveform] =
    useState<LibraryWaveformData | null>(null);
  const [waveformLoading, setWaveformLoading] = useState(false);
  const [waveformError, setWaveformError] = useState<string | null>(null);

  useEffect(() => {
    if (
      activeLibraryReleaseId &&
      releases.some((release) => release.id === activeLibraryReleaseId)
    ) {
      setSelectedReleaseId(activeLibraryReleaseId);
    }
  }, [activeLibraryReleaseId, releases]);

  useEffect(() => {
    const releaseId = navigationRequest?.releaseId;
    if (
      !releaseId ||
      !releases.some((release) => release.id === releaseId)
    ) {
      return;
    }

    setSelectedReleaseId(releaseId);
    setSelectedTrackId(
      playback.currentTrack?.releaseId === releaseId
        ? playback.currentTrack.trackId ?? ""
        : "",
    );
  }, [
    navigationRequest?.releaseId,
    navigationRequest?.requestId,
    playback.currentTrack?.releaseId,
    playback.currentTrack?.trackId,
    releases,
  ]);

  useEffect(() => {
    if (
      selectedReleaseId &&
      releases.some((release) => release.id === selectedReleaseId)
    ) {
      return;
    }

    setSelectedReleaseId(releases[0]?.id ?? "");
  }, [releases, selectedReleaseId]);

  const selectedRelease = releases.find(
    (release) => release.id === selectedReleaseId,
  ) ?? null;
  const selectedReleaseIndex = selectedRelease
    ? releases.findIndex((release) => release.id === selectedRelease.id)
    : -1;
  const previousRelease = selectedReleaseIndex > 0
    ? releases[selectedReleaseIndex - 1]
    : null;
  const nextRelease =
    selectedReleaseIndex >= 0 && selectedReleaseIndex < releases.length - 1
      ? releases[selectedReleaseIndex + 1]
      : null;

  const selectRelease = (releaseId: string) => {
    setSelectedReleaseId(releaseId);
    setSelectedTrackId("");
  };

  useEffect(() => {
    if (!selectedReleaseId) {
      setDetail(null);
      setDetailError(null);
      return;
    }

    const controller = new AbortController();
    setDetailLoading(true);
    setDetailError(null);

    void fetch(
      `/api/library/release-detail?${new URLSearchParams({
        release: selectedReleaseId,
      }).toString()}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        const payload = (await response.json()) as
          | LibraryWaveformReleaseDetail
          | { error?: string };

        if (!response.ok || !("documents" in payload)) {
          throw new Error(
            "error" in payload && payload.error
              ? payload.error
              : "Unable to load release metadata for Waveform view.",
          );
        }

        setDetail(payload);
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }

        setDetail(null);
        setDetailError(
          error instanceof Error
            ? error.message
            : "Unable to load release metadata for Waveform view.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setDetailLoading(false);
        }
      });

    return () => controller.abort();
  }, [selectedReleaseId]);

  const orderedTracks = useMemo(() => {
    if (!selectedRelease) {
      return [];
    }

    const navigation = buildTrackNavigationOrder(
      selectedRelease.tracks.map((track, sourceIndex) => ({
        trackId: track.id,
        sourceIndex,
        trackNumber:
          readTrackInteger(detail, track.id, "track_number") ??
          inferredTrackNumber(track.id),
        discNumber: readTrackInteger(detail, track.id, "disc_number"),
      })),
    );

    return navigation.entries.flatMap((entry) => {
      const track = selectedRelease.tracks.find(
        (candidate) => candidate.id === entry.trackId,
      );

      return track
        ? [{
            track,
            trackNumber: entry.trackNumber,
            discNumber: entry.effectiveDiscNumber,
          }]
        : [];
    });
  }, [detail, selectedRelease]);

  const releaseTitle = selectedRelease
    ? resolveReleaseDisplayTitle(
        selectedRelease.releaseTitle,
        inferredReleaseTitle(selectedRelease.id),
      )
    : "Library";
  const releaseArtist = selectedRelease?.primaryArtistName?.trim() ?? "";
  const releaseRuntimeSeconds = selectedRelease
    ? releaseDurationSecondsById.get(selectedRelease.id)
    : undefined;
  const releaseRuntimeLabel =
    releaseRuntimeSeconds !== undefined
      ? formatReleaseRuntime(releaseRuntimeSeconds)
      : null;
  const releaseArtwork = selectedRelease
    ? selectReleaseFrontArtwork(selectedRelease.artworkMasters) ??
      selectPreferredReleaseArtwork(selectedRelease.artworkMasters)
    : null;

  const queue = useMemo<PersistentPlaybackTrack[]>(() => {
    if (!selectedRelease) {
      return [];
    }

    return orderedTracks.flatMap(({ track }) => {
      if (!trackHasAudioPreview(track)) {
        return [];
      }

      const trackArtwork = selectPreferredReleaseArtwork(
        track.artworkMasters,
      );
      const effectiveArtwork = trackArtwork ?? releaseArtwork;

      return [{
        key: `${selectedRelease.id}::${track.id}`,
        source: buildAudioPreviewUrl(selectedRelease.id, track.id),
        waveformUrl: buildLibraryWaveformUrl(selectedRelease.id, track.id),
        releaseId: selectedRelease.id,
        trackId: track.id,
        title: readTrackDisplayTitle(detail, track.id),
        artist: releaseArtist || null,
        releaseTitle,
        detail: getAudioPreviewSourceLabel(track),
        artworkUrl: effectiveArtwork
          ? artworkPreviewUrl(effectiveArtwork.relativePath)
          : null,
      }];
    });
  }, [
    detail,
    orderedTracks,
    releaseArtist,
    releaseArtwork,
    releaseTitle,
    selectedRelease,
  ]);

  useEffect(() => {
    const activeTrackId =
      playback.currentTrack?.releaseId === selectedReleaseId
        ? playback.currentTrack.trackId
        : undefined;

    if (
      activeTrackId &&
      orderedTracks.some(({ track }) => track.id === activeTrackId)
    ) {
      setSelectedTrackId(activeTrackId);
      return;
    }

    if (
      selectedTrackId &&
      orderedTracks.some(({ track }) => track.id === selectedTrackId)
    ) {
      return;
    }

    setSelectedTrackId(
      orderedTracks.find(({ track }) => trackHasAudioPreview(track))?.track.id ??
      orderedTracks[0]?.track.id ??
      "",
    );
  }, [
    orderedTracks,
    playback.currentTrack,
    selectedReleaseId,
    selectedTrackId,
  ]);

  const selectedTrack = orderedTracks.find(
    ({ track }) => track.id === selectedTrackId,
  ) ?? null;
  const selectedQueueTrack = queue.find(
    (track) => track.trackId === selectedTrackId,
  ) ?? null;
  const selectedTrackIsActive = Boolean(
    selectedQueueTrack && playback.currentTrack?.key === selectedQueueTrack.key,
  );

  useEffect(() => {
    if (!selectedRelease || !selectedTrackId) {
      setWaveform(null);
      setWaveformLoading(false);
      setWaveformError(null);
      return;
    }

    if (selectedTrackIsActive) {
      setWaveform(playback.waveform);
      setWaveformLoading(playback.waveformLoading);
      setWaveformError(playback.waveformError);
      return;
    }

    const controller = new AbortController();
    setWaveform(null);
    setWaveformLoading(true);
    setWaveformError(null);

    void fetch(
      buildLibraryWaveformUrl(selectedRelease.id, selectedTrackId),
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(
            payload?.error ??
              "Waveform data is not prepared for this Library track.",
          );
        }

        setWaveform(
          parseLibraryWaveformData(await response.json()),
        );
      })
      .catch((error) => {
        if (controller.signal.aborted) {
          return;
        }

        setWaveformError(
          error instanceof Error
            ? error.message
            : "Unable to load waveform data.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setWaveformLoading(false);
        }
      });

    return () => controller.abort();
  }, [
    playback.waveform,
    playback.waveformError,
    playback.waveformLoading,
    selectedRelease,
    selectedTrackId,
    selectedTrackIsActive,
  ]);

  if (!selectedRelease) {
    return (
      <section className="library-waveform-view empty-state">
        No Library releases are available for Waveform view.
      </section>
    );
  }

  const selectedTitle = selectedTrack
    ? readTrackDisplayTitle(detail, selectedTrack.track.id)
    : "Choose a playable track";
  const selectedArtwork = selectedTrack
    ? selectPreferredReleaseArtwork(selectedTrack.track.artworkMasters) ??
      releaseArtwork
    : releaseArtwork;
  return (
    <section className="library-waveform-view" aria-label="Library Waveform view">
      <header className="library-waveform-toolbar">
        <div
          className="library-waveform-release-picker"
          aria-label="Browse Library releases"
        >
          <button
            type="button"
            className="library-waveform-release-nav"
            disabled={!previousRelease}
            aria-label="Previous release"
            title="Previous release"
            onClick={() => {
              if (previousRelease) {
                selectRelease(previousRelease.id);
              }
            }}
          >
            ‹
          </button>

          <label>
            <span>Release</span>
            <select
              value={selectedRelease.id}
              onChange={(event) => selectRelease(event.target.value)}
            >
              {releases.map((release) => (
                <option key={release.id} value={release.id}>
                  {resolveReleaseDisplayTitle(
                    release.releaseTitle,
                    inferredReleaseTitle(release.id),
                  )}
                  {release.primaryArtistName?.trim()
                    ? ` · ${release.primaryArtistName.trim()}`
                    : ""}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="library-waveform-release-nav"
            disabled={!nextRelease}
            aria-label="Next release"
            title="Next release"
            onClick={() => {
              if (nextRelease) {
                selectRelease(nextRelease.id);
              }
            }}
          >
            ›
          </button>
        </div>

        <button
          type="button"
          onClick={() => onOpenMetadata(selectedRelease.id)}
        >
          Open metadata
        </button>
      </header>

      <div className="library-waveform-stage">
        <aside className="library-waveform-release-panel">
          <div className="library-waveform-artwork">
            {selectedArtwork ? (
              <img
                src={artworkPreviewUrl(selectedArtwork.relativePath)}
                alt={`Artwork for ${releaseTitle}`}
              />
            ) : (
              <span>No artwork</span>
            )}
          </div>
          <div className="library-waveform-release-copy">
            <h2>{releaseTitle}</h2>
            <p>{releaseArtist || "Artist not set"}</p>
            <small>
              {formatReleaseDateLabel(selectedRelease)} · {selectedRelease.tracks.length}{" "}
              {selectedRelease.tracks.length === 1 ? "track" : "tracks"}
              {releaseRuntimeLabel ? ` · ${releaseRuntimeLabel}` : ""}
            </small>
          </div>
        </aside>

        <section className="library-waveform-player-panel">
          <header className="library-waveform-track-header">
            <div>
              <span>Selected track</span>
              <h3>{selectedTitle}</h3>
              {selectedQueueTrack ? (
                <small>{selectedQueueTrack.detail}</small>
              ) : (
                <small>Audio preview unavailable</small>
              )}
            </div>
            <button
              type="button"
              className="library-waveform-play-button"
              disabled={!selectedQueueTrack}
              aria-pressed={selectedTrackIsActive && playback.isPlaying}
              onClick={() => {
                if (selectedQueueTrack) {
                  playback.toggleTrack(selectedQueueTrack.key, queue);
                }
              }}
            >
              {selectedTrackIsActive && playback.isPlaying
                ? "Pause"
                : "Play"}
            </button>
          </header>

          <div className="library-waveform-display">
            {waveform ? (
              <LibraryWaveformCanvas
                peaks={waveform.peaks}
                colorMode={colorMode}
                audioRef={playback.audioRef}
                analyser={playback.analyser}
                ensureAnalyser={playback.ensureAnalyser}
                trackKey={
                  selectedQueueTrack?.key ??
                  `${selectedRelease.id}::${selectedTrackId}`
                }
                sampleRate={waveform.sampleRate}
                isPlaying={
                  selectedTrackIsActive && playback.isPlaying
                }
                peaksPerSecond={waveform.peaksPerSecond}
                durationSeconds={waveform.durationSeconds}
                currentTimeOverride={
                  selectedTrackIsActive ? undefined : 0
                }
                onActivate={() => {
                  if (
                    !selectedTrackIsActive &&
                    selectedQueueTrack
                  ) {
                    playback.playQueue({
                      trackKey: selectedQueueTrack.key,
                      queue,
                      autoplay: false,
                    });
                  }
                }}
                onScrubbingChange={playback.setScrubbing}
              />
            ) : waveformLoading ? (
              <p>Loading waveform…</p>
            ) : (
              <p>
                {waveformError ??
                  "Waveform data has not been prepared for this track."}
              </p>
            )}
          </div>

          <div
            className={`library-waveform-technical-line${
              waveform ? "" : " is-placeholder"
            }`}
            aria-hidden={waveform ? undefined : true}
          >
            {waveform ? (
              <>
                <span>{waveform.sampleRate.toLocaleString()} Hz</span>
                <span>{waveform.bitsPerSample}-bit</span>
                <span>
                  {waveform.sourceChannels === 1
                    ? "Mono"
                    : waveform.sourceChannels === 2
                      ? "Stereo"
                      : `${waveform.sourceChannels} channels`}
                </span>
                <span>{waveform.peaksPerSecond} peaks/s</span>
              </>
            ) : (
              <span>Waveform technical details</span>
            )}
          </div>

          {detailLoading && (
            <p className="library-waveform-detail-status">Loading track metadata…</p>
          )}
          {detailError && (
            <p className="library-waveform-detail-status error">{detailError}</p>
          )}

          <ol className="library-waveform-track-list">
            {orderedTracks.map(({ track, trackNumber, discNumber }) => {
              const queueTrack = queue.find(
                (candidate) => candidate.trackId === track.id,
              );
              const isSelected = track.id === selectedTrackId;
              const isActive = playback.currentTrack?.key === queueTrack?.key;

              return (
                <li key={track.id}>
                  <button
                    type="button"
                    className={isSelected ? "selected" : ""}
                    disabled={!queueTrack}
                    aria-current={isSelected ? "true" : undefined}
                    onClick={() => {
                      setSelectedTrackId(track.id);
                      if (queueTrack) {
                        playback.toggleTrack(queueTrack.key, queue);
                      }
                    }}
                  >
                    <span className="library-waveform-track-number">
                      {trackNumberLabel(discNumber, trackNumber)}
                    </span>
                    <span className="library-waveform-track-title">
                      {readTrackDisplayTitle(detail, track.id)}
                    </span>
                    <span className="library-waveform-track-state">
                      {!queueTrack
                        ? "Unavailable"
                        : isActive && playback.isPlaying
                          ? "Playing"
                          : isActive
                            ? "Paused"
                            : "Play"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </section>
  );
}
