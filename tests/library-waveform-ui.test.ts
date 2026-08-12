import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const viewSource = await readFile(
  new URL("../src/LibraryWaveformView.tsx", import.meta.url),
  "utf8",
);
const canvasSource = await readFile(
  new URL("../src/LibraryWaveformCanvas.tsx", import.meta.url),
  "utf8",
);
const mediaCanvasSource = await readFile(
  new URL("../src/MediaWaveformCanvas.tsx", import.meta.url),
  "utf8",
);
const serverSource = await readFile(
  new URL("../server/index.ts", import.meta.url),
  "utf8",
);
const styleSource = await readFile(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);
const helpSource = await readFile(
  new URL("../src/workflow-help-content.ts", import.meta.url),
  "utf8",
);

test("Library adds a persisted Waveform view beside Rows Cards and Tiles", () => {
  assert.match(appSource, /\| "waveform";/);
  assert.match(
    appSource,
    /\["waveform", "Waveform", "Single-release artwork and waveform player"\]/,
  );
  assert.match(appSource, /<LibraryWaveformView/);
  assert.match(appSource, /playback=\{playback\}/);
});

test("Waveform view drives the existing persistent player instead of mounting another audio element", () => {
  assert.match(viewSource, /playback\.toggleTrack/);
  assert.match(viewSource, /playback\.seek/);
  assert.match(viewSource, /buildAudioPreviewUrl/);
  assert.doesNotMatch(viewSource, /new Audio\(/);
  assert.doesNotMatch(viewSource, /<audio\b/i);
});

test("Waveform view renders artwork authored track identity and generated multiband peaks", () => {
  assert.match(viewSource, /library-waveform-artwork/);
  assert.match(viewSource, /readTrackDisplayTitle/);
  assert.match(viewSource, /buildTrackNavigationOrder/);
  assert.match(viewSource, /buildLibraryWaveformUrl/);
  assert.match(canvasSource, /<MediaWaveformCanvas/);
  assert.match(
    mediaCanvasSource,
    /CompactWaveformCanvas as MediaWaveformCanvas/,
  );
  assert.match(mediaCanvasSource, /@hiplingo\/media-player/);
  assert.doesNotMatch(mediaCanvasSource, /getContext\("2d"\)/);
  assert.match(styleSource, /\.library-waveform-stage/);
});

test("Library waveform endpoint stays read-only and confined to the selected canonical track", () => {
  assert.match(serverSource, /async function sendLibraryWaveform/);
  assert.match(serverSource, /track\.relativePath/);
  assert.match(serverSource, /"waveform-peaks\.json"/);
  assert.match(serverSource, /assertPathWithinRoot/);
  assert.match(serverSource, /const canonicalPath = await realpath\(candidatePath\)/);
  assert.match(serverSource, /requestUrl\.pathname ===\s*"\/api\/library\/waveform"/);
  assert.match(serverSource, /"Cache-Control",\s*"private, no-store"/);
});

test("Workflow Help documents Waveform as a Library browser over the persistent player", () => {
  assert.match(helpSource, /Rows, Cards, Tiles, and Waveform views/);
  assert.match(helpSource, /Waveform focuses one release at a time/);
  assert.match(helpSource, /same persistent application-shell audio session/);
});

test("Waveform view browses adjacent releases without creating a second browser or player", () => {
  assert.match(viewSource, /const previousRelease =/);
  assert.match(viewSource, /const nextRelease =/);
  assert.match(viewSource, /aria-label="Previous release"/);
  assert.match(viewSource, /aria-label="Next release"/);
  assert.match(viewSource, /selectRelease\(previousRelease\.id\)/);
  assert.match(viewSource, /selectRelease\(nextRelease\.id\)/);
  assert.match(styleSource, /\.library-waveform-release-picker/);
  assert.match(helpSource, /previous\/next release browsing/);
});


test("Waveform view shares the application waveform color instead of owning another palette state", () => {
  assert.match(appSource, /waveformColorMode=\{waveformColorMode\}/);
  assert.match(viewSource, /colorMode: WaveformColorMode/);
  assert.match(viewSource, /colorMode=\{colorMode\}/);
  assert.doesNotMatch(viewSource, /useState<WaveformColorMode>/);
  assert.match(helpSource, /shares the application-level waveform color selection/);
});


test("Waveform view reuses the persistent player's peaks for the active track", () => {
  assert.match(viewSource, /if \(selectedTrackIsActive\) \{/);
  assert.match(viewSource, /setWaveform\(playback\.waveform\)/);
  assert.match(viewSource, /setWaveformLoading\(playback\.waveformLoading\)/);
  assert.match(viewSource, /setWaveformError\(playback\.waveformError\)/);
});
