import type {
  RefObject,
} from "react";

import {
  MediaVisualizationSurface,
} from "@hiplingo/media-player";
import type {
  MediaWaveformPeak,
  WaveformColorMode,
} from "./media-waveform.js";

type LibraryWaveformCanvasProps = {
  peaks: MediaWaveformPeak[];
  colorMode: WaveformColorMode;
  audioRef: RefObject<HTMLAudioElement | null>;
  analyser: AnalyserNode | null;
  ensureAnalyser: () => Promise<AnalyserNode | null>;
  trackKey: string;
  sampleRate: number;
  isPlaying: boolean;
  peaksPerSecond: number;
  durationSeconds: number;
  currentTimeOverride?: number;
  onActivate?: () => void;
  onScrubbingChange?: (isScrubbing: boolean) => void;
};

export function LibraryWaveformCanvas({
  peaks,
  colorMode,
  audioRef,
  analyser,
  ensureAnalyser,
  trackKey,
  sampleRate,
  isPlaying,
  peaksPerSecond,
  durationSeconds,
  currentTimeOverride,
  onActivate,
  onScrubbingChange,
}: LibraryWaveformCanvasProps) {
  return (
    <MediaVisualizationSurface
      peaks={peaks}
      colorMode={colorMode}
      audioRef={audioRef}
      analyser={analyser}
      ensureAnalyser={ensureAnalyser}
      trackKey={trackKey}
      sampleRate={sampleRate}
      waveformIsPlaying={isPlaying}
      oscilloscopeIsPlaying={isPlaying}
      peaksPerSecond={peaksPerSecond}
      durationSeconds={durationSeconds}
      currentTimeOverride={currentTimeOverride}
      onActivate={onActivate}
      onScrubbingChange={onScrubbingChange}
      classNames={{
        root: "library-waveform-canvas",
        zoomControls: "library-waveform-zoom-controls",
        zoomButton: "library-waveform-zoom-button",
        zoomIncreaseButton:
          "library-waveform-zoom-button--increase",
        zoomDecreaseButton:
          "library-waveform-zoom-button--decrease",
      }}
    />
  );
}
