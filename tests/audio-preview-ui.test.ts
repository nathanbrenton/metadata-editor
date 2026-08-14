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
const styleSource = await readFile(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);
const serverSource = await readFile(
  new URL("../server/index.ts", import.meta.url),
  "utf8",
);

test("renders sidebar preview controls through one persistent application player", () => {
  assert.match(
    appSource,
    /metadata-track-preview-button/,
  );
  assert.match(
    appSource,
    /<PersistentLibraryPlayerBar/,
  );
  assert.match(
    playerSource,
    /ariaLabel="Persistent media player"/,
  );
  assert.match(
    playerSource,
    /volume:\s*\{[\s\S]*volumePercent: playback\.volumePercent,[\s\S]*setVolumePercent: playback\.setVolumePercent,/,
  );
  assert.match(
    playerSource,
    /controller=\{\{[\s\S]*transport:\s*\{/,
  );
  assert.match(
    playerSource,
    /canPrevious,/,
  );
  assert.match(
    playerSource,
    /previous: playback\.previous/,
  );
  assert.match(
    playerSource,
    /canNext,/,
  );
  assert.match(
    playerSource,
    /next: playback\.next/,
  );
});

test("keeps persistent playback mounted above workspace navigation and advances within the queue", () => {
  assert.match(
    appSource,
    /const libraryPlayback =\s*usePersistentLibraryPlayback\(\)/,
  );
  assert.match(
    playerSource,
    /const mediaElement = usePersistentMediaElement\(\)/,
  );
  assert.match(
    playerSource,
    /addEventListener\("ended", handleEnded\)/,
  );
  assert.match(
    playerSource,
    /queueRef\.current\[currentIndex \+ 1\]/,
  );
  assert.match(
    playerSource,
    /getPlaybackQueueNeighbor\(/,
  );
  assert.doesNotMatch(
    playerSource,
    /detail\.releaseId/,
  );
});

test("keeps persistent preview controls desktop-oriented and independently styled", () => {
  assert.match(
    styleSource,
    /\.persistent-library-player\s*\{/,
  );
  assert.match(
    styleSource,
    /grid-template-columns:/,
  );
  assert.match(
    styleSource,
    /main:has\(\.persistent-library-player\)/,
  );
  assert.match(
    styleSource,
    /\.metadata-document-nav-item\s*\{/,
  );
  assert.match(
    styleSource,
    /\.metadata-track-preview-button\s*\{/,
  );
});

test("serves direct MP3 ranges and FFmpeg-transcoded previews through one identifier route", () => {
  assert.match(
    serverSource,
    /\/api\/library\/audio-preview/,
  );
  assert.match(serverSource, /Accept-Ranges/);
  assert.match(serverSource, /Content-Range/);
  assert.match(
    serverSource,
    /selectTrackAudioPreview/,
  );
  assert.match(
    serverSource,
    /sendTranscodedAudioPreview/,
  );
  assert.match(
    serverSource,
    /X-Audio-Preview-Delivery/,
  );
  assert.match(
    serverSource,
    /buildAudioPreviewTranscodeArgs/,
  );
});
