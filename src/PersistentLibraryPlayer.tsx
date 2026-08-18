import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type RefObject,
} from "react";

import {
  CompactNowPlayingBar,
  PersistentMediaElement,
  dedupePlaybackQueue,
  getPlaybackQueueCapabilities,
  getPlaybackQueueNeighbor,
  getPlayableMediaContext,
  type PlayableMediaItem,
  type MediaSourceAdapter,
  useSpacebarPlaybackShortcut,
  useMediaElementAnalyser,
  useMediaElementVolume,
  useMediaElementTimeline,
  useMediaElementPlaybackState,
  useMediaElementPlaybackEvents,
  useMediaSourceSession,
  usePersistentMediaElement,
  type PersistentMediaElementController,
} from "@hiplingo/media-player";
import {
  decodeMediaWaveformPayload,
  type MediaWaveformData,
  type WaveformColorMode,
} from "./media-waveform.js";

export type PersistentPlaybackTrack = PlayableMediaItem<string> & {
  releaseId?: string;
  trackId?: string;
};

export type PersistentPlaybackRequest = {
  trackKey: string;
  queue: PersistentPlaybackTrack[];
  autoplay: boolean;
};

const metadataPreviewSourceAdapter: MediaSourceAdapter<string> = {
  attach: ({ audio, source }) => {
    audio.pause();
    audio.src = source;
    audio.load();
    return true;
  },
  dispose: (audio) => {
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
  },
};

export type PersistentLibraryPlaybackController = {
  audioRef: RefObject<HTMLAudioElement | null>;
  mediaElement: PersistentMediaElementController;
  currentTrack: PersistentPlaybackTrack | null;
  queue: PersistentPlaybackTrack[];
  isPlaying: boolean;
  isLoading: boolean;
  error: string | null;
  volumePercent: number;
  currentTime: number;
  duration: number;
  waveform: MediaWaveformData | null;
  waveformLoading: boolean;
  waveformError: string | null;
  analyser: AnalyserNode | null;
  ensureAnalyser: () => Promise<AnalyserNode | null>;
  playQueue: (request: PersistentPlaybackRequest) => void;
  toggleTrack: (
    trackKey: string,
    queue: PersistentPlaybackTrack[],
  ) => void;
  togglePlayback: () => void;
  previous: () => void;
  next: () => void;
  setVolumePercent: (volumePercent: number) => void;
  seek: (seconds: number) => void;
  setScrubbing: (isScrubbing: boolean) => void;
  clearIfTrack: (
    releaseId: string,
    trackId: string,
  ) => void;
};

export function usePersistentLibraryPlayback(): PersistentLibraryPlaybackController {
  const mediaElement = usePersistentMediaElement();
  const { audioRef } = mediaElement;
  const queueRef = useRef<PersistentPlaybackTrack[]>([]);
  const currentTrackRef = useRef<PersistentPlaybackTrack | null>(null);
  const loadTrackRef = useRef<
    ((track: PersistentPlaybackTrack, autoplay: boolean) => void) | null
  >(null);

  const [currentTrack, setCurrentTrack] =
    useState<PersistentPlaybackTrack | null>(null);
  const [queue, setQueue] =
    useState<PersistentPlaybackTrack[]>([]);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waveform, setWaveform] =
    useState<MediaWaveformData | null>(null);
  const [waveformLoading, setWaveformLoading] = useState(false);
  const [waveformError, setWaveformError] =
    useState<string | null>(null);

  const {
    analyser,
    ensureAnalyser,
  } = useMediaElementAnalyser(
    audioRef,
    currentTrack?.key,
  );
  const {
    volumePercent,
    setVolumePercent,
  } = useMediaElementVolume(audioRef);
  const {
    currentTime,
    duration,
    reset: resetTimeline,
    syncCurrentTime,
    syncDuration,
    seek,
  } = useMediaElementTimeline(audioRef);
  const playbackState =
    useMediaElementPlaybackState(audioRef);
  const {
    isPlaying,
    isLoading,
    setPlaying: setIsPlaying,
    setLoading: setIsLoading,
  } = playbackState;
  const {
    handlePlay,
    handlePause,
    handleWaiting,
    handleCanPlay,
    handleError: handlePlaybackError,
  } = useMediaElementPlaybackEvents(playbackState);
  const {
    attach: attachMediaSource,
    dispose: disposeMediaSource,
    isCurrent: isCurrentMediaSource,
  } = useMediaSourceSession(
    audioRef,
    metadataPreviewSourceAdapter,
  );

  const setCurrent = useCallback(
    (track: PersistentPlaybackTrack | null) => {
      currentTrackRef.current = track;
      setCurrentTrack(track);
    },
    [],
  );

  const loadTrack = useCallback(
    (track: PersistentPlaybackTrack, autoplay: boolean) => {
      const audio = audioRef.current;

      if (!audio) {
        return;
      }

      setError(null);
      setCurrent(track);

      if (!isCurrentMediaSource(track.key)) {
        void attachMediaSource({
          mediaKey: track.key,
          source: track.source,
          autoplay,
        });
        resetTimeline();
        setIsLoading(true);
      }

      if (!autoplay) {
        audio.pause();
        return;
      }

      /*
       * Hiplingo already attaches its Web Audio media/analyser graph
       * before playback begins. Do the same through the shared adapter
       * so Firefox's prepared-MP3 path does not require visiting
       * Oscilloscope before responsive audible scrubbing is available.
       */
      void ensureAnalyser();

      void audio.play().catch((playError) => {
        setIsPlaying(false);
        setIsLoading(false);
        setError(
          playError instanceof Error
            ? playError.message
            : "Audio preview could not start.",
        );
      });
    },
    [
      attachMediaSource,
      ensureAnalyser,
      isCurrentMediaSource,
      resetTimeline,
      setCurrent,
    ],
  );

  loadTrackRef.current = loadTrack;

  useEffect(() => {
    const audio = audioRef.current;

    if (!audio) {
      return;
    }

    const handleTimeUpdate = () => {
      syncCurrentTime(audio);
    };
    const handleDuration = () => {
      syncDuration(audio);
    };
    const handleError = () => {
      handlePlaybackError();
      setError(
        "The selected source could not be decoded or transcoded for preview. Confirm FFmpeg is available, or generate audio-playback.mp3.",
      );
    };
    const handleEnded = () => {
      setIsPlaying(false);
      setIsLoading(false);

      const active = currentTrackRef.current;
      if (!active) {
        return;
      }

      const currentIndex = queueRef.current.findIndex(
        (track) => track.key === active.key,
      );
      const nextTrack = queueRef.current[currentIndex + 1];

      if (nextTrack) {
        loadTrackRef.current?.(nextTrack, true);
      }
    };

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("waiting", handleWaiting);
    audio.addEventListener("canplay", handleCanPlay);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("durationchange", handleDuration);
    audio.addEventListener("loadedmetadata", handleDuration);
    audio.addEventListener("error", handleError);
    audio.addEventListener("ended", handleEnded);

    return () => {
      disposeMediaSource();
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("waiting", handleWaiting);
      audio.removeEventListener("canplay", handleCanPlay);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("durationchange", handleDuration);
      audio.removeEventListener("loadedmetadata", handleDuration);
      audio.removeEventListener("error", handleError);
      audio.removeEventListener("ended", handleEnded);
    };
  }, [
    disposeMediaSource,
    handleCanPlay,
    handlePause,
    handlePlay,
    handlePlaybackError,
    handleWaiting,
    syncCurrentTime,
    syncDuration,
  ]);

  useEffect(() => {
    const waveformUrl = currentTrack?.waveformUrl?.trim();

    if (!waveformUrl) {
      setWaveform(null);
      setWaveformLoading(false);
      setWaveformError(null);
      return;
    }

    const controller = new AbortController();
    setWaveform(null);
    setWaveformLoading(true);
    setWaveformError(null);

    void fetch(waveformUrl, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;

          throw new Error(
            payload?.error ??
              "Waveform data is not available for this source.",
          );
        }

        setWaveform(
          decodeMediaWaveformPayload(
            await response.arrayBuffer(),
          ),
        );
      })
      .catch((waveformLoadError) => {
        if (controller.signal.aborted) {
          return;
        }

        setWaveform(null);
        setWaveformError(
          waveformLoadError instanceof Error
            ? waveformLoadError.message
            : "Unable to load waveform data.",
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setWaveformLoading(false);
        }
      });

    return () => controller.abort();
  }, [currentTrack?.waveformUrl]);

  const playQueue = useCallback(
    (request: PersistentPlaybackRequest) => {
      const uniqueQueue = dedupePlaybackQueue(request.queue);
      const target =
        uniqueQueue.find(
          (track) => track.key === request.trackKey,
        ) ?? uniqueQueue[0];

      if (!target) {
        return;
      }

      queueRef.current = uniqueQueue;
      setQueue(uniqueQueue);
      loadTrack(target, request.autoplay);
    },
    [loadTrack],
  );

  const toggleTrack = useCallback(
    (
      trackKey: string,
      nextQueue: PersistentPlaybackTrack[],
    ) => {
      const audio = audioRef.current;
      const active = currentTrackRef.current;

      if (active?.key === trackKey && audio) {
        if (audio.paused) {
          void ensureAnalyser();

          void audio.play().catch((playError) => {
            setError(
              playError instanceof Error
                ? playError.message
                : "Audio preview could not start.",
            );
          });
        } else {
          audio.pause();
        }
        return;
      }

      playQueue({
        trackKey,
        queue: nextQueue,
        autoplay: true,
      });
    },
    [ensureAnalyser, playQueue],
  );

  const move = useCallback(
    (direction: -1 | 1) => {
      const active = currentTrackRef.current;
      if (!active) {
        return;
      }

      const destination = getPlaybackQueueNeighbor(
        queueRef.current,
        active.key,
        direction,
      );

      if (!destination) {
        return;
      }

      const audio = audioRef.current;
      loadTrack(
        destination,
        Boolean(audio && !audio.paused),
      );
    },
    [loadTrack],
  );

  const togglePlayback = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrackRef.current) {
      return;
    }

    if (audio.paused) {
      void ensureAnalyser();

      void audio.play().catch((playError) => {
        setError(
          playError instanceof Error
            ? playError.message
            : "Audio preview could not start.",
        );
      });
    } else {
      audio.pause();
    }
  }, [ensureAnalyser]);

  useSpacebarPlaybackShortcut({
    onToggle: togglePlayback,
    canToggle: () => Boolean(currentTrackRef.current),
  });

  const clearIfTrack = useCallback(
    (releaseId: string, trackId: string) => {
      const active = currentTrackRef.current;
      if (
        !active ||
        active.releaseId !== releaseId ||
        active.trackId !== trackId
      ) {
        return;
      }

      disposeMediaSource();
      queueRef.current = [];
      setQueue([]);
      setCurrent(null);
      resetTimeline();
      setError(null);
      setIsLoading(false);
    },
    [disposeMediaSource, resetTimeline, setCurrent],
  );

  return {
    audioRef,
    mediaElement,
    currentTrack,
    queue,
    isPlaying: isPlaying && !isScrubbing,
    isLoading,
    error,
    volumePercent,
    currentTime,
    duration,
    waveform,
    waveformLoading,
    waveformError,
    analyser,
    ensureAnalyser,
    playQueue,
    toggleTrack,
    togglePlayback,
    previous: () => move(-1),
    next: () => move(1),
    setVolumePercent,
    seek,
    setScrubbing: setIsScrubbing,
    clearIfTrack,
  };
}

export function PersistentLibraryPlayerBar({
  playback,
  colorMode,
  onOpenLibraryWaveform,
  metadataButtonRef,
  metadataPreviewAvailable = false,
  metadataPreviewLoading = false,
  onOpenMetadataPreview,
}: {
  playback: PersistentLibraryPlaybackController;
  colorMode: WaveformColorMode;
  onOpenLibraryWaveform?: () => void;
  metadataButtonRef?: RefObject<
    HTMLButtonElement | null
  >;
  metadataPreviewAvailable?: boolean;
  metadataPreviewLoading?: boolean;
  onOpenMetadataPreview?: () => void;
}) {
  const track = playback.currentTrack;

  const { canPrevious, canNext } =
    getPlaybackQueueCapabilities(
      playback.queue,
      track?.key,
    );
  const duration = Math.max(0, playback.duration);
  const currentTime = Math.min(
    duration || playback.currentTime,
    Math.max(0, playback.currentTime),
  );
  return (
    <>
      <PersistentMediaElement
        controller={playback.mediaElement}
        preload="metadata"
        aria-hidden="true"
      />
      <CompactNowPlayingBar
      artworkUrl={track?.artworkUrl ?? null}
      onArtworkClick={
        track?.releaseId && onOpenLibraryWaveform
          ? onOpenLibraryWaveform
          : undefined
      }
      artworkActionLabel="Open current track in Library Waveform view"
      artworkFallback={<span>HL</span>}
      title={track?.title ?? "Ready to preview"}
      context={
        track
          ? getPlayableMediaContext(track)
          : "Choose a track in Ingest, Staging, or Library"
      }
      detail={track?.detail ?? "Local media preview"}
      controller={{
        transport: {
          currentTime: playback.currentTime,
          duration,
          isPlaying: playback.isPlaying,
          isLoading: playback.isLoading,
          canToggle: Boolean(track),
          canPrevious,
          canNext,
          previous: playback.previous,
          toggle: playback.togglePlayback,
          next: playback.next,
          seek: duration > 0 ? playback.seek : undefined,
        },
        volume: {
          volumePercent: playback.volumePercent,
          setVolumePercent: playback.setVolumePercent,
        },
      }}
      waveformPeaks={playback.waveform?.peaks ?? null}
      waveformColorMode={colorMode}
      waveformFallback={
        <input
          type="range"
          min="0"
          max={duration || 0}
          step="0.1"
          value={duration ? currentTime : 0}
          disabled={!duration}
          aria-label="Playback position"
          title={
            !track
              ? "Select a track to enable playback."
              : playback.waveformLoading
                ? "Loading waveform…"
                : playback.waveformError ??
                  "Waveform is not available for this source preview."
          }
          onChange={(event: ChangeEvent<HTMLInputElement>) =>
            playback.seek(Number(event.target.value))
          }
        />
      }
      endControls={
        onOpenMetadataPreview ? (
          <button
            ref={metadataButtonRef}
            type="button"
            className="persistent-library-player__metadata-button"
            aria-label="Preview current track metadata as presented on Hiplingo"
            title="Track information"
            disabled={
              !metadataPreviewAvailable ||
              metadataPreviewLoading
            }
            onClick={
              onOpenMetadataPreview
            }
          >
            <span aria-hidden="true">
              {metadataPreviewLoading
                ? "…"
                : "i"}
            </span>
          </button>
        ) : null
      }
      error={playback.error}
      ariaLabel="Persistent media player"
      classNames={{
        root: "persistent-library-player",
        artwork: "persistent-library-player__artwork",
        identity: "persistent-library-player__copy",
        title: "persistent-library-player__title",
        context: "persistent-library-player__context",
        detail: "persistent-library-player__source",
        time: "persistent-library-player__time",
        waveformRegion: "persistent-library-player__waveform-region",
        waveform: "persistent-library-player__waveform",
        transport: "persistent-library-player__transport",
        playButton: "persistent-library-player__play",
        transportIcon: "persistent-library-player__transport-icon",
        volumeControl: "persistent-library-player__volume-control",
        volumeButton: "persistent-library-player__volume-button",
        volumeIcon: "persistent-library-player__volume-icon",
        volumePopup: "persistent-library-player__volume-popup",
        volumeSlider: "persistent-library-player__volume-slider",
        endControls: "persistent-library-player__end-controls",
        error: "persistent-library-player__error",
      }}
      />
    </>
  );
}
