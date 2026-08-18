import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const playerSource = await readFile(
  new URL("../src/PersistentLibraryPlayer.tsx", import.meta.url),
  "utf8",
);
const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const stagingSource = await readFile(
  new URL("../src/IngestReleaseBuilder.tsx", import.meta.url),
  "utf8",
);

test("metadata-editor normalizes private playback items through the shared media contract", () => {
  assert.match(playerSource, /type PersistentPlaybackTrack = PlayableMediaItem<string>/);
  assert.match(playerSource, /audio\.src = source/);
  assert.match(
    playerSource,
    /useMediaSourceSession\(\s*audioRef,\s*metadataPreviewSourceAdapter,/,
  );
  assert.match(
    playerSource,
    /attachMediaSource\(\{[\s\S]*source: track\.source/,
  );
  assert.match(
    playerSource,
    /track\s*\?\s*getPlayableMediaContext\(track\)/,
  );
  assert.match(
    playerSource,
    /detail=\{track\?\.detail \?\? "Local media preview"\}/,
  );

  assert.match(appSource, /source: buildAudioPreviewUrl\(/);
  assert.match(appSource, /source: buildIngestAudioPreviewUrl\(/);
  assert.match(appSource, /artist: releaseArtist \|\| null/);
  assert.match(appSource, /releaseTitle,/);
  assert.match(appSource, /detail:\s*getAudioPreviewSourceLabel/);

  assert.match(stagingSource, /source: buildIngestAudioPreviewUrl\(/);
  assert.match(stagingSource, /releaseTitle: currentInspection\.candidate\.displayTitle/);
  assert.match(appSource, /waveformUrl: buildLibraryWaveformUrl\(/);

  assert.doesNotMatch(playerSource, /sourceUrl/);
  assert.doesNotMatch(playerSource, /subtitle:/);
  assert.doesNotMatch(playerSource, /sourceLabel:/);
});
