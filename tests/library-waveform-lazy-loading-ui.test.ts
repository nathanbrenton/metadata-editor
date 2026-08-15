import assert from "node:assert/strict";
import {
  readFile,
} from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL(
    "../src/App.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("defers the optional Library Waveform browser out of the initial application chunk", () => {
  assert.doesNotMatch(
    appSource,
    /import \{[\s\S]*LibraryWaveformView,[\s\S]*from "\.\/LibraryWaveformView\.js"/,
  );
  assert.match(
    appSource,
    /import type \{[\s\S]*LibraryWaveformNavigationRequest[\s\S]*from "\.\/LibraryWaveformView\.js"/,
  );
  assert.match(
    appSource,
    /const LibraryWaveformView = lazy\(async \(\) => \{[\s\S]*import\([\s\S]*"\.\/LibraryWaveformView\.js"/,
  );
  assert.match(
    appSource,
    /<Suspense[\s\S]*Loading Waveform view…[\s\S]*<LibraryWaveformView/,
  );
});
