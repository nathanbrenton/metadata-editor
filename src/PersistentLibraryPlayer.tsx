import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

import {
  CompactNowPlayingBar,
  dedupePlaybackQueue,
  getPlaybackQueueCapabilities,
  getPlaybackQueueNeighbor,
  useSpacebarPlaybackShortcut,
} from "@hiplingo/media-player";
import {
  parseMediaWaveformData,
  type MediaWaveformData,
  type WaveformColorMode,
} from "./media-waveform.js";

export type PersistentPlaybackTrack = {
  key: string;
  sourceUrl: string;
  releaseId?: string;
  trackId?: string;
  title: string;
  subtitle: string;
  sourceLabel: string;
  artworkUrl?: string | null;
  waveformUrl?: string | null;
};

export type PersistentPlaybackRequest = {
  trackKey: string;
  queue: PersistentPlaybackTrack[];
  autoplay: boolean;
};

export type PersistentLibraryPlaybackController = {
  currentTrack: PersistentPlaybackTrack | null;
  queue: PersistentPlaybackTrack[];
  isPlaying: boolean;
  isLoading: boolean;
  error: string | null;
  volume: number;
  currentTime: number;
  duration: number;
  waveform: MediaWaveformData | null;
  waveformLoading: boolean;
  waveformError: string | null;
  playQueue: (request: PersistentPlaybackRequest) => void;
  toggleTrack: (
    trackKey: string,
    queue: PersistentPlaybackTrack[],
  ) => void;
  togglePlayback: () => void;
  previous: () => void;
  next: () => void;
  setVolume: (volume: number) => void;
  seek: (seconds: number) => void;
  clearIfTrack: (
    releaseId: string,
    trackId: string,
  ) => void;
};

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) {
    return 0.8;
  }

  return Math.min(1, Math.max(0, value));
}

export function usePersistentLibraryPlayback(): PersistentLibraryPlaybackController {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const loadedTrackKeyRef = useRef<string | null>(null);
  const queueRef = useRef<PersistentPlaybackTrack[]>([]);
  const currentTrackRef = useRef<PersistentPlaybackTrack | null>(null);
  const loadTrackRef = useRef<
    ((track: PersistentPlaybackTrack, autoplay: boolean) => void) | null
  >(null);

  const [currentTrack, setCurrentTrack] =
    useState<PersistentPlaybackTrack | null>(null);
  const [queue, setQueue] =
    useState<PersistentPlaybackTrack[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [volume, setVolumeState] = useState(0.8);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [waveform, setWaveform] =
    useState<MediaWaveformData | null>(null);
  const [waveformLoading, setWaveformLoading] = useState(false);
  const [waveformError, setWaveformError] =
    useState<string | null>(null);

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

      if (loadedTrackKeyRef.current !== track.key) {
        audio.pause();
        audio.src = track.sourceUrl;
        audio.load();
        loadedTrackKeyRef.current = track.key;
        setCurrentTime(0);
        setDuration(0);
        setIsLoading(true);
      }

      if (!autoplay) {
        audio.pause();
        return;
      }

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
    [setCurrent],
  );

  loadTrackRef.current = loadTrack;

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "metadata";
    audio.volume = volume;

    const handlePlay = () => {
      setIsPlaying(true);
      setIsLoading(false);
    };
    const handlePause = () => {
      setIsPlaying(false);
      setIsLoading(false);
    };
    const handleWaiting = () => setIsLoading(true);
    const handleCanPlay = () => setIsLoading(false);
    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };
    const handleDuration = () => {
      setDuration(
        Number.isFinite(audio.duration)
          ? audio.duration
          : 0,
      );
    };
    const handleError = () => {
      setIsPlaying(false);
      setIsLoading(false);
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
    audioRef.current = audio;

    return () => {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("waiting", handleWaiting);
      audio.removeEventListener("canplay", handleCanPlay);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("durationchange", handleDuration);
      audio.removeEventListener("loadedmetadata", handleDuration);
      audio.removeEventListener("error", handleError);
      audio.removeEventListener("ended", handleEnded);
      audioRef.current = null;
    };
  }, []);

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

        setWaveform(parseMediaWaveformData(await response.json()));
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

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = volume;
    }
  }, [volume]);

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
    [playQueue],
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
  }, []);

  useSpacebarPlaybackShortcut({
    onToggle: togglePlayback,
    canToggle: () => Boolean(currentTrackRef.current),
  });

  const setVolume = useCallback((nextVolume: number) => {
    setVolumeState(clampVolume(nextVolume));
  }, []);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(seconds)) {
      return;
    }

    const upperBound = Number.isFinite(audio.duration)
      ? audio.duration
      : Math.max(0, seconds);
    audio.currentTime = Math.min(
      upperBound,
      Math.max(0, seconds),
    );
    setCurrentTime(audio.currentTime);
  }, []);

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

      const audio = audioRef.current;
      audio?.pause();
      if (audio) {
        audio.removeAttribute("src");
        audio.load();
      }
      loadedTrackKeyRef.current = null;
      queueRef.current = [];
      setQueue([]);
      setCurrent(null);
      setCurrentTime(0);
      setDuration(0);
      setError(null);
      setIsLoading(false);
    },
    [setCurrent],
  );

  return {
    currentTrack,
    queue,
    isPlaying,
    isLoading,
    error,
    volume,
    currentTime,
    duration,
    waveform,
    waveformLoading,
    waveformError,
    playQueue,
    toggleTrack,
    togglePlayback,
    previous: () => move(-1),
    next: () => move(1),
    setVolume,
    seek,
    clearIfTrack,
  };
}

export function PersistentLibraryPlayerBar({
  playback,
  colorMode,
}: {
  playback: PersistentLibraryPlaybackController;
  colorMode: WaveformColorMode;
}) {
  const track = playback.currentTrack;

  if (!track) {
    return null;
  }

  const { canPrevious, canNext } =
    getPlaybackQueueCapabilities(
      playback.queue,
      track.key,
    );
  const duration = Math.max(0, playback.duration);
  const currentTime = Math.min(
    duration || playback.currentTime,
    Math.max(0, playback.currentTime),
  );
  return (
    <CompactNowPlayingBar
      artworkUrl={track.artworkUrl}
      artworkFallback={<span>HL</span>}
      title={track.title}
      context={track.subtitle}
      detail={track.sourceLabel}
      transport={{
        currentTime: playback.currentTime,
        duration,
        isPlaying: playback.isPlaying,
        isLoading: playback.isLoading,
        canPrevious,
        canNext,
        previous: playback.previous,
        toggle: playback.togglePlayback,
        next: playback.next,
        seek: duration > 0 ? playback.seek : undefined,
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
            playback.waveformLoading
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
        <label className="persistent-library-player__volume">
          <span>Volume</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={playback.volume}
            aria-label="Player volume"
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              playback.setVolume(Number(event.target.value))
            }
          />
        </label>
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
        error: "persistent-library-player__error",
      }}
    />
  );
}
