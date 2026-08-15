import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const waveformSource = await readFile(
  new URL("../src/LibraryWaveformView.tsx", import.meta.url),
  "utf8",
);
const playerSource = await readFile(
  new URL("../src/PersistentLibraryPlayer.tsx", import.meta.url),
  "utf8",
);

test("shows total release run time in Library release views and selected-release sidebar only", () => {
  assert.match(appSource, /technicalSummary\?\.durationSeconds/);
  assert.match(appSource, /title="Total release run time"/);
  assert.match(appSource, /Run time · \{releaseRuntimeLabel\}/);
  assert.match(
    appSource,
    /releaseDurationSecondsById=\{new Map\([\s\S]*summary\.durationSeconds/,
  );
  assert.match(waveformSource, /releaseDurationSecondsById/);
  assert.match(waveformSource, /releaseRuntimeLabel \? ` · \${releaseRuntimeLabel}`/);
  assert.doesNotMatch(playerSource, /Total release run time|Run time ·|releaseRuntimeLabel/);
});
