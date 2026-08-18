import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const waveformSource = await readFile(
  new URL("../src/LibraryWaveformView.tsx", import.meta.url),
  "utf8",
);
const canvasSource = await readFile(
  new URL("../src/LibraryWaveformCanvas.tsx", import.meta.url),
  "utf8",
);
const helpSource = await readFile(
  new URL("../src/workflow-help-content.ts", import.meta.url),
  "utf8",
);

test("Library Waveform follows the persistent Now Playing track", () => {
  assert.match(
    waveformSource,
    /const track = playback\.currentTrack;/,
  );
  assert.match(
    waveformSource,
    /const waveform = playback\.waveform;/,
  );
  assert.match(
    waveformSource,
    /trackKey=\{track\.key\}/,
  );
  assert.match(
    waveformSource,
    /isPlaying=\{playback\.isPlaying\}/,
  );
  assert.match(
    waveformSource,
    /onScrubbingChange=\{playback\.setScrubbing\}/,
  );

  assert.doesNotMatch(
    waveformSource,
    /selectedReleaseId/,
  );
  assert.doesNotMatch(
    waveformSource,
    /selectedTrackId/,
  );
  assert.doesNotMatch(
    waveformSource,
    /Previous release/,
  );
  assert.doesNotMatch(
    waveformSource,
    /Next release/,
  );
  assert.doesNotMatch(
    waveformSource,
    /library-waveform-track-list/,
  );
  assert.doesNotMatch(
    waveformSource,
    /Open metadata/,
  );
});

test("Library Waveform keeps the shared Hiplingo visualization surface", () => {
  assert.match(
    waveformSource,
    /<LibraryWaveformCanvas/,
  );
  assert.match(
    canvasSource,
    /MediaVisualizationSurface/,
  );
  assert.match(
    canvasSource,
    /@hiplingo\/media-player/,
  );
});

test("Library Waveform has a guided empty state before track selection", () => {
  assert.match(
    waveformSource,
    /Choose a track from the Library/,
  );
  assert.match(
    waveformSource,
    /Rows, Cards, Tiles, or a Release page/,
  );
  assert.match(
    waveformSource,
    /Follows Now Playing/,
  );
});

test("Workflow Help documents one current-track authority", () => {
  assert.match(
    helpSource,
    /persistent application-shell player as the single current-track authority/,
  );
  assert.match(
    helpSource,
    /cannot represent different tracks/,
  );
  assert.match(
    helpSource,
    /audible scrub/,
  );
});
