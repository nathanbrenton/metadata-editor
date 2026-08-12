import { MediaWaveformCanvas } from "./MediaWaveformCanvas.js";
import type {
  MediaWaveformPeak,
  WaveformColorMode,
} from "./media-waveform.js";

type LibraryWaveformCanvasProps = {
  peaks: MediaWaveformPeak[];
  colorMode: WaveformColorMode;
  progress: number;
  onSeek?: (progress: number) => void;
};

export function LibraryWaveformCanvas({
  peaks,
  colorMode,
  progress,
  onSeek,
}: LibraryWaveformCanvasProps) {
  return (
    <MediaWaveformCanvas
      peaks={peaks}
      colorMode={colorMode}
      progress={progress}
      onSeek={onSeek}
      className="library-waveform-canvas"
      seekLabel="Seek within selected Library track"
    />
  );
}
