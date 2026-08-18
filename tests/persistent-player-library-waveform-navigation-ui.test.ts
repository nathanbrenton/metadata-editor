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

test("footer artwork opens the current track Waveform view", () => {
  assert.match(
    playerSource,
    /onOpenLibraryWaveform\?: \(\) => void/,
  );
  assert.match(playerSource, /onArtworkClick=\{/);
  assert.match(
    playerSource,
    /track\?\.releaseId && onOpenLibraryWaveform/,
  );
  assert.match(
    playerSource,
    /\? onOpenLibraryWaveform\s*:\s*undefined/,
  );
  assert.match(
    playerSource,
    /artworkActionLabel="Open current track in Library Waveform view"/,
  );
  assert.doesNotMatch(
    playerSource,
    /persistent-library-player__waveform-view-button/,
  );
  assert.doesNotMatch(
    playerSource,
    />\s*Release waveform\s*</,
  );
});

test("footer shortcut opens the main Library Waveform without a second selection model", () => {
  assert.match(
    appSource,
    /const openCurrentTrackInLibraryWaveform/,
  );
  assert.match(
    appSource,
    /setLibraryEntityView\("releases"\)/,
  );
  assert.match(
    appSource,
    /setLibraryReleaseViewMode\("waveform"\)/,
  );
  assert.match(
    appSource,
    /navigateWorkflowView\("library"\)/,
  );
  assert.match(
    appSource,
    /onOpenLibraryWaveform=\{\s*openCurrentTrackInLibraryWaveform\s*\}/,
  );
  assert.doesNotMatch(
    appSource,
    /LibraryWaveformNavigationRequest|libraryWaveformNavigationRequest|navigationRequest=\{/,
  );
  assert.match(
    waveformSource,
    /const track = playback\.currentTrack;/,
  );
  assert.doesNotMatch(
    waveformSource,
    /LibraryWaveformNavigationRequest|navigationRequest|selectedReleaseId|selectedTrackId/,
  );
});

test("documentation identifies footer artwork as a current-track Waveform shortcut", () => {
  assert.match(
    helpSource,
    /opens the Waveform view for that same persistent current track/,
  );
  assert.match(
    readmeSource,
    /footer artwork is the temporary Waveform shortcut for Library-backed current tracks/,
  );
  assert.doesNotMatch(
    readmeSource,
    /previous\/next release browsing|single-release Waveform viewer/,
  );
});
