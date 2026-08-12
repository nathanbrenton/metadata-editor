import { MediaWaveformCanvas } from "./MediaWaveformCanvas.js";
import {
  WAVEFORM_COLOR_OPTIONS,
  type WaveformColorMode,
} from "./media-waveform.js";
import type {
  PersistentLibraryPlaybackController,
} from "./PersistentLibraryPlayer.js";

export function WaveformColorMenuCard({
  playback,
  colorMode,
  onColorModeChange,
}: {
  playback: PersistentLibraryPlaybackController;
  colorMode: WaveformColorMode;
  onColorModeChange: (mode: WaveformColorMode) => void;
}) {
  const progress =
    playback.duration > 0
      ? Math.max(
          0,
          Math.min(1, playback.currentTime / playback.duration),
        )
      : 0;

  return (
    <section className="menu-card menu-card--waveform-color">
      <h2>Waveform Color</h2>
      <MediaWaveformCanvas
        peaks={playback.waveform?.peaks ?? []}
        colorMode={colorMode}
        progress={progress}
        className="menu-waveform-preview"
        onSeek={
          playback.waveform && playback.duration > 0
            ? (nextProgress) =>
                playback.seek(nextProgress * playback.duration)
            : undefined
        }
        seekLabel="Seek current track from waveform color preview"
      />
      <div className="menu-waveform-actions">
        <select
          aria-label="Waveform color"
          value={colorMode}
          onChange={(event) =>
            onColorModeChange(
              event.target.value as WaveformColorMode,
            )
          }
        >
          {WAVEFORM_COLOR_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-label={playback.isPlaying ? "Pause track" : "Play track"}
          aria-pressed={playback.isPlaying}
          disabled={!playback.currentTrack}
          onClick={playback.togglePlayback}
        >
          {playback.isPlaying ? "❚❚" : "▶"}
        </button>
      </div>
      <p className="menu-meta">
        Applies to the persistent player and Library Waveform view.
      </p>
    </section>
  );
}
