import {
  LibraryWaveformCanvas,
} from "./LibraryWaveformCanvas.js";
import type {
  WaveformColorMode,
} from "./media-waveform.js";
import type {
  PersistentLibraryPlaybackController,
} from "./PersistentLibraryPlayer.js";

function formatReleaseRuntime(
  durationSeconds: number,
): string {
  const totalSeconds = Math.max(
    0,
    Math.round(durationSeconds),
  );
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor(
    (totalSeconds % 3600) / 60,
  );
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

type LibraryWaveformViewProps = {
  playback: PersistentLibraryPlaybackController;
  colorMode: WaveformColorMode;
  releaseDurationSecondsById: ReadonlyMap<string, number>;
};

export function LibraryWaveformView({
  playback,
  colorMode,
  releaseDurationSecondsById,
}: LibraryWaveformViewProps) {
  const track = playback.currentTrack;
  const waveform = playback.waveform;

  if (!track) {
    return (
      <section
        className="library-waveform-view library-waveform-now-playing-empty"
        aria-label="Library Waveform view"
      >
        <span className="eyebrow">Now Playing waveform</span>
        <h2>Choose a track from the Library</h2>
        <p>
          Use Rows, Cards, Tiles, or a Release page to choose a track.
          Waveform follows the persistent player instead of maintaining
          a separate Library selection.
        </p>
      </section>
    );
  }

  const releaseTitle =
    track.releaseTitle?.trim() || "Release";
  const artist =
    track.artist?.trim() || "Artist not set";
  const releaseDurationSeconds =
    track.releaseId
      ? releaseDurationSecondsById.get(track.releaseId)
      : undefined;
  const releaseRuntimeLabel =
    typeof releaseDurationSeconds === "number" &&
    Number.isFinite(releaseDurationSeconds)
      ? formatReleaseRuntime(releaseDurationSeconds)
      : null;

  return (
    <section
      className="library-waveform-view"
      aria-label="Library Waveform view"
    >
      <header
        className="library-waveform-toolbar library-waveform-toolbar--now-playing"
      >
        <div className="library-waveform-now-playing-heading">
          <span className="eyebrow">Now Playing waveform</span>
          <strong>{track.title}</strong>
          <small>
            {artist} · {releaseTitle}
            {releaseRuntimeLabel ? ` · ${releaseRuntimeLabel}` : ""}
          </small>
        </div>

        <span
          className="badge complete library-waveform-follow-badge"
          title="This visualization always follows the persistent footer player."
        >
          Follows Now Playing
        </span>
      </header>

      <div className="library-waveform-stage">
        <aside className="library-waveform-release-panel">
          <div className="library-waveform-artwork">
            {track.artworkUrl ? (
              <img
                src={track.artworkUrl}
                alt={`Artwork for ${track.title}`}
              />
            ) : (
              <span>No artwork</span>
            )}
          </div>

          <div className="library-waveform-release-copy">
            <h2>{releaseTitle}</h2>
            <p>{artist}</p>
            <small>Current track · {track.title}</small>
          </div>
        </aside>

        <section className="library-waveform-player-panel">
          <header className="library-waveform-track-header">
            <div>
              <span>Current track</span>
              <h3>{track.title}</h3>
              <small>
                {track.detail?.trim() || "Playback audio"}
              </small>
            </div>

            <button
              type="button"
              className="library-waveform-play-button"
              aria-pressed={playback.isPlaying}
              onClick={playback.togglePlayback}
            >
              {playback.isPlaying ? "Pause" : "Play"}
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
                trackKey={track.key}
                sampleRate={waveform.sampleRate}
                isPlaying={playback.isPlaying}
                peaksPerSecond={waveform.peaksPerSecond}
                durationSeconds={waveform.durationSeconds}
                onScrubbingChange={playback.setScrubbing}
              />
            ) : playback.waveformLoading ? (
              <p>Loading waveform…</p>
            ) : (
              <p>
                {playback.waveformError ??
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
                <span>
                  {waveform.sampleRate.toLocaleString()} Hz
                </span>
                <span>{waveform.bitsPerSample}-bit</span>
                <span>
                  {waveform.sourceChannels === 1
                    ? "Mono"
                    : waveform.sourceChannels === 2
                      ? "Stereo"
                      : `${waveform.sourceChannels} channels`}
                </span>
                <span>
                  {waveform.peaksPerSecond} peaks/s
                </span>
              </>
            ) : (
              <span>Waveform technical details</span>
            )}
          </div>

          <p className="library-waveform-follow-note">
            Track selection lives in the Library browser and Release
            pages. This surface always follows the persistent
            Now Playing track.
          </p>
        </section>
      </div>
    </section>
  );
}
