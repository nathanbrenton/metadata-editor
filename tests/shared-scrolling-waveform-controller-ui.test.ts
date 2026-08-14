import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const playerSource = await readFile(new URL("../src/PersistentLibraryPlayer.tsx", import.meta.url), "utf8");
const waveformCanvasSource = await readFile(new URL("../src/LibraryWaveformCanvas.tsx", import.meta.url), "utf8");

test("metadata-editor exposes its host-owned audio ref to the shared full waveform", () => {
  assert.match(playerSource, /audioRef: RefObject<HTMLAudioElement \| null>;/);
  assert.match(playerSource, /setScrubbing: \(isScrubbing: boolean\) => void;/);
  assert.match(playerSource, /isPlaying: isPlaying && !isScrubbing/);
  assert.match(playerSource, /setScrubbing: setIsScrubbing/);
});


test("metadata-editor delegates scrub behavior without host debug instrumentation", () => {
  assert.match(waveformCanvasSource, /MediaVisualizationSurface/);
  assert.match(waveformCanvasSource, /onScrubbingChange=\{onScrubbingChange\}/);
  assert.doesNotMatch(waveformCanvasSource, /scrubDebugLabel/);
});


test("persistent player exposes the shared analyser adapter", () => {
  assert.match(playerSource, /useMediaElementAnalyser/);
  assert.match(playerSource, /analyser: AnalyserNode \| null/);
  assert.match(playerSource, /ensureAnalyser: \(\) => Promise<AnalyserNode \| null>/);
});
