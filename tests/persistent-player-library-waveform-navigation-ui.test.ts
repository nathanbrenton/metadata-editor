import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const playerSource = await readFile(
  new URL("../src/PersistentLibraryPlayer.tsx", import.meta.url),
  "utf8",
);
const waveformSource = await readFile(
  new URL("../src/LibraryWaveformView.tsx", import.meta.url),
  "utf8",
);
const helpSource = await readFile(
  new URL("../src/workflow-help-content.ts", import.meta.url),
  "utf8",
);
const readmeSource = await readFile(
  new URL("../README.md", import.meta.url),
  "utf8",
);

test("footer artwork opens the current release Waveform view", () => {
  assert.match(
    playerSource,
    /onOpenLibraryWaveform\?: \(releaseId: string\) => void/,
  );
  assert.match(playerSource, /onArtworkClick=\{/);
  assert.match(
    playerSource,
    /artworkActionLabel="Open current release in Library Waveform view"/,
  );
  assert.match(
    playerSource,
    /onOpenLibraryWaveform\(track\.releaseId!\)/,
  );
  assert.doesNotMatch(
    playerSource,
    /persistent-library-player__waveform-view-button/,
  );
  assert.doesNotMatch(playerSource, />\s*Release waveform\s*</);
});

test("footer shortcut returns to Library Waveform view for the active release", () => {
  assert.match(
    appSource,
    /type LibraryWaveformNavigationRequest/,
  );
  assert.match(
    appSource,
    /libraryWaveformNavigationRequestIdRef\.current \+= 1/,
  );
  assert.match(
    appSource,
    /const openCurrentReleaseInLibraryWaveform/,
  );
  assert.match(appSource, /navigateWorkflowView\("library"\)/);
  assert.match(
    appSource,
    /waveformNavigationRequest=\{[\s\S]*libraryWaveformNavigationRequest/,
  );
  assert.match(
    appSource,
    /onViewModeChange\("waveform"\)/,
  );
  assert.doesNotMatch(
    appSource,
    /metadata-editor\.library-release-view/,
  );
  assert.match(
    appSource,
    /navigationRequest=\{waveformNavigationRequest\}/,
  );
  assert.match(
    waveformSource,
    /export type LibraryWaveformNavigationRequest/,
  );
  assert.match(
    waveformSource,
    /navigationRequest\?\.requestId/,
  );
  assert.match(
    waveformSource,
    /setSelectedReleaseId\(releaseId\)/,
  );
});

test("documentation identifies footer artwork as the temporary Waveform shortcut", () => {
  assert.match(helpSource, /footer artwork itself is the temporary explicit shortcut/);
  assert.match(helpSource, /opens that release in the single-release Waveform view/);
  assert.match(readmeSource, /footer artwork is the temporary Waveform shortcut/);
});
