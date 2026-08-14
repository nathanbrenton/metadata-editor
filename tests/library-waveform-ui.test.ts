import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const viewSource = await readFile(new URL("../src/LibraryWaveformView.tsx", import.meta.url), "utf8");
const canvasSource = await readFile(new URL("../src/LibraryWaveformCanvas.tsx", import.meta.url), "utf8");
const serverSource = await readFile(new URL("../server/index.ts", import.meta.url), "utf8");
const styleSource = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const helpSource = await readFile(new URL("../src/workflow-help-content.ts", import.meta.url), "utf8");

test("Library keeps Waveform as an in-session view beside Rows Cards and Tiles", () => {
  assert.match(appSource, /\| "waveform";/);
  assert.match(appSource, /<LibraryWaveformView/);
  assert.match(appSource, /playback=\{playback\}/);
  assert.doesNotMatch(appSource, /metadata-editor\.library-release-view/);
});

test("Waveform view drives the existing persistent private player", () => {
  assert.match(viewSource, /playback\.toggleTrack/);
  assert.match(viewSource, /playback\.playQueue/);
  assert.match(viewSource, /buildAudioPreviewUrl/);
  assert.doesNotMatch(viewSource, /new Audio\(/);
  assert.doesNotMatch(viewSource, /<audio\b/i);
});

test("Library full waveform delegates to the shared Hiplingo visualization surface", () => {
  assert.match(canvasSource, /MediaVisualizationSurface/);
  assert.match(canvasSource, /@hiplingo\/media-player/);
  assert.match(canvasSource, /audioRef/);
  assert.match(canvasSource, /analyser/);
  assert.match(canvasSource, /ensureAnalyser/);
  assert.match(canvasSource, /peaksPerSecond/);
  assert.match(canvasSource, /durationSeconds/);
  assert.match(canvasSource, /onActivate/);
  assert.match(canvasSource, /onScrubbingChange/);
  assert.doesNotMatch(canvasSource, /ScrollingWaveformCanvas/);
  assert.doesNotMatch(canvasSource, /getContext\("2d"\)/);
  assert.match(viewSource, /audioRef=\{playback\.audioRef\}/);
  assert.match(viewSource, /autoplay: false/);
  assert.match(viewSource, /onScrubbingChange=\{playback\.setScrubbing\}/);
  assert.match(styleSource, /--waveform-canvas-height/);
});

test("Waveform view renders artwork authored identity and generated peaks", () => {
  assert.match(viewSource, /library-waveform-artwork/);
  assert.match(viewSource, /readTrackDisplayTitle/);
  assert.match(viewSource, /buildTrackNavigationOrder/);
  assert.match(viewSource, /buildLibraryWaveformUrl/);
  assert.match(styleSource, /\.library-waveform-stage/);
});

test("Library waveform endpoint remains read-only and canonical-root confined", () => {
  assert.match(serverSource, /async function sendLibraryWaveform/);
  assert.match(serverSource, /track\.relativePath/);
  assert.match(serverSource, /"waveform-peaks\.json"/);
  assert.match(serverSource, /assertPathWithinRoot/);
  assert.match(serverSource, /"Cache-Control",\s*"private, no-store"/);
});

test("Workflow Help documents Waveform over the persistent shared player", () => {
  assert.match(helpSource, /Rows, Cards, Tiles, and Waveform views/);
  assert.match(helpSource, /Artwork-First default on every fresh load or browser refresh/);
  assert.match(helpSource, /view mode is intentionally not persisted/);
  assert.match(helpSource, /same persistent application-shell audio session/);
  assert.match(helpSource, /Oscilloscope/);
});

test("Waveform view keeps adjacent release browsing and shared color state", () => {
  assert.match(viewSource, /const previousRelease =/);
  assert.match(viewSource, /const nextRelease =/);
  assert.match(viewSource, /aria-label="Previous release"/);
  assert.match(viewSource, /aria-label="Next release"/);
  assert.match(appSource, /waveformColorMode=\{waveformColorMode\}/);
  assert.match(viewSource, /colorMode: WaveformColorMode/);
  assert.doesNotMatch(viewSource, /useState<WaveformColorMode>/);
});

test("Waveform view reuses persistent-player peaks for the active track", () => {
  assert.match(viewSource, /if \(selectedTrackIsActive\) \{/);
  assert.match(viewSource, /setWaveform\(playback\.waveform\)/);
  assert.match(viewSource, /setWaveformLoading\(playback\.waveformLoading\)/);
  assert.match(viewSource, /setWaveformError\(playback\.waveformError\)/);
});


test("Library view mode survives in-app navigation but resets with App reload", () => {
  assert.match(
    appSource,
    /const \[libraryReleaseViewMode, setLibraryReleaseViewMode\] =\s*useState<LibraryReleaseViewMode>\("tiles"\);/,
  );
  assert.match(appSource, /viewMode=\{libraryReleaseViewMode\}/);
  assert.match(appSource, /onViewModeChange=\{setLibraryReleaseViewMode\}/);
  assert.doesNotMatch(
    appSource,
    /function LibraryReleaseBrowser[\s\S]*?useState<LibraryReleaseViewMode>\("tiles"\)/,
  );
});
test("Waveform view reserves visualization space while a new track loads", () => {
  assert.match(
    styleSource,
    /\.library-waveform-display\s*\{[\s\S]*--waveform-canvas-height:\s*clamp\(12rem,\s*22vw,\s*20rem\);[\s\S]*min-height:\s*calc\(var\(--waveform-canvas-height\)\s*\+\s*1\.6rem\);/,
  );
  assert.match(
    styleSource,
    /\.library-waveform-canvas\s*\{[\s\S]*min-height:\s*var\(--waveform-canvas-height\);/,
  );
  assert.match(
    viewSource,
    /waveform \? "" : " is-placeholder"/,
  );
  assert.match(
    styleSource,
    /\.library-waveform-technical-line\.is-placeholder\s*\{[\s\S]*visibility:\s*hidden;/,
  );
});


test("Library Waveform uses the shared visualization surface", () => {
  assert.match(canvasSource, /MediaVisualizationSurface/);
  assert.match(canvasSource, /analyser=\{analyser\}/);
  assert.match(canvasSource, /ensureAnalyser=\{ensureAnalyser\}/);
  assert.match(canvasSource, /waveformIsPlaying=\{isPlaying\}/);
  assert.match(canvasSource, /oscilloscopeIsPlaying=\{isPlaying\}/);
  assert.match(viewSource, /analyser=\{playback\.analyser\}/);
  assert.match(viewSource, /ensureAnalyser=\{playback\.ensureAnalyser\}/);
  assert.doesNotMatch(canvasSource, /useWaveformZoomController/);
  assert.doesNotMatch(canvasSource, /<OscilloscopeCanvas/);
  assert.doesNotMatch(canvasSource, /seedOscilloscopeFrame/);
  assert.match(styleSource, /\.library-waveform-zoom-controls/);
});

test("Waveform zoom chrome keeps plus top-right and minus bottom-right without forcing a readout", () => {
  assert.doesNotMatch(canvasSource, /showZoomReadout/);
  assert.doesNotMatch(canvasSource, /zoomReadout:/);
  assert.match(canvasSource, /zoomIncreaseButton:/);
  assert.match(canvasSource, /library-waveform-zoom-button--increase/);
  assert.match(canvasSource, /zoomDecreaseButton:/);
  assert.match(canvasSource, /library-waveform-zoom-button--decrease/);
  assert.match(
    styleSource,
    /\.library-waveform-zoom-button--increase\s*\{[\s\S]*top:\s*0\.55rem;/,
  );
  assert.match(
    styleSource,
    /\.library-waveform-zoom-button--decrease\s*\{[\s\S]*bottom:\s*0\.55rem;/,
  );
  assert.doesNotMatch(styleSource, /library-waveform-zoom-debug-value/);
});
