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
const waveformMenuSource = await readFile(
  new URL("../src/WaveformColorMenuCard.tsx", import.meta.url),
  "utf8",
);
const helpSource = await readFile(
  new URL("../src/workflow-help-content.ts", import.meta.url),
  "utf8",
);
const styleSource = await readFile(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);
const stagingSource = await readFile(
  new URL("../src/IngestReleaseBuilder.tsx", import.meta.url),
  "utf8",
);

test("owns guarded media playback at the application shell", () => {
  assert.match(
    appSource,
    /usePersistentLibraryPlayback/,
  );
  assert.match(
    appSource,
    /playback=\{libraryPlayback\}/,
  );
  assert.match(
    appSource,
    /<IngestView[\s\S]*playback=\{libraryPlayback\}/,
  );
  assert.match(
    appSource,
    /<PersistentLibraryPlayerBar[\s\S]*playback=\{libraryPlayback\}[\s\S]*colorMode=\{waveformColorMode\}/,
  );
  assert.doesNotMatch(
    appSource,
    /const audioPreviewRef =/,
  );
  assert.match(
    stagingSource,
    /playback: PersistentLibraryPlaybackController/,
  );
  assert.doesNotMatch(
    stagingSource,
    /new Audio\(\)|audioPreviewRef/,
  );
});

test("accepts guarded host preview URLs without coupling the player to Library or public HLS", () => {
  assert.match(
    playerSource,
    /audio\.src = track\.sourceUrl/,
  );
  assert.match(
    appSource,
    /sourceUrl: buildAudioPreviewUrl\(/,
  );
  assert.match(
    appSource,
    /sourceUrl: buildIngestAudioPreviewUrl\(/,
  );
  assert.doesNotMatch(playerSource, /buildAudioPreviewUrl|buildIngestAudioPreviewUrl/);
  assert.doesNotMatch(playerSource, /hls\.js|Hls\b/);
  assert.doesNotMatch(playerSource, /published-media/);
});

test("documents playback continuity across metadata-editor workspaces", () => {
  assert.match(
    helpSource,
    /one persistent application-level player/,
  );
  assert.match(
    helpSource,
    /Ingest, Staging, Library, Web Package, Live, Workflow & Help/,
  );
});

test("Space transport behavior is shared while metadata-editor keeps its own playback engine", () => {
  assert.match(playerSource, /useSpacebarPlaybackShortcut/);
  assert.match(playerSource, /from "@hiplingo\/media-player"/);
  assert.match(playerSource, /onToggle: togglePlayback/);
  assert.match(playerSource, /canToggle: \(\) => Boolean\(currentTrackRef\.current\)/);
  assert.doesNotMatch(playerSource, /event\.code !== "Space"/);
  assert.match(playerSource, /const audio = new Audio\(\)/);
  assert.match(helpSource, /Space is reserved for transport outside actual text-entry fields/);
});


test("persistent footer accepts host-provided waveform URLs and renders the shared waveform surface", () => {
  assert.match(playerSource, /waveformUrl\?: string \| null/);
  assert.match(playerSource, /fetch\(waveformUrl/);
  assert.match(playerSource, /parseMediaWaveformData/);
  assert.match(playerSource, /<CompactNowPlayingBar/);
  assert.match(playerSource, /waveformPeaks=\{playback\.waveform\?\.peaks \?\? null\}/);
  assert.match(playerSource, /waveform: "persistent-library-player__waveform"/);
  assert.match(appSource, /waveformUrl: buildLibraryWaveformUrl\(/);
  assert.doesNotMatch(playerSource, /buildLibraryWaveformUrl/);
});

test("application menu owns the waveform palette selector used by the footer", () => {
  assert.match(waveformMenuSource, /<h2>Waveform Color<\/h2>/);
  assert.match(waveformMenuSource, /WAVEFORM_COLOR_OPTIONS/);
  assert.match(waveformMenuSource, /value=\{colorMode\}/);
  assert.match(appSource, /<WaveformColorMenuCard/);
  assert.match(appSource, /colorMode=\{waveformColorMode\}/);
  assert.match(helpSource, /3Band, RGB, Blue, and Monochrome/);
});


test("persistent footer matches the wide metadata-editor canvas", () => {
  assert.match(
    styleSource,
    /\.persistent-library-player \{[\s\S]*width: min\(92rem, 100%\)/,
  );
  assert.match(styleSource, /\.persistent-library-player__waveform/);
  assert.match(helpSource, /fixed full-width player footer/);
});

test("waveform rendering and color vocabulary come from the shared Hiplingo media-player package", async () => {
  const packageSource = await readFile(
    new URL("../package.json", import.meta.url),
    "utf8",
  );
  const rendererSource = await readFile(
    new URL("../src/MediaWaveformCanvas.tsx", import.meta.url),
    "utf8",
  );
  const waveformSource = await readFile(
    new URL("../src/media-waveform.ts", import.meta.url),
    "utf8",
  );

  assert.match(packageSource, /"@hiplingo\/media-player": "file:\.\.\/audio-player\/packages\/media-player"/);
  assert.match(rendererSource, /@hiplingo\/media-player/);
  assert.doesNotMatch(rendererSource, /getContext\("2d"\)/);
  assert.match(waveformSource, /WAVEFORM_COLOR_OPTIONS/);
  assert.match(waveformSource, /from "@hiplingo\/media-player"/);
});

test("persistent footer consumes the shared compact Now Playing presentation", () => {
  assert.match(playerSource, /CompactNowPlayingBar/);
  assert.match(playerSource, /from "@hiplingo\/media-player"/);
  assert.match(playerSource, /waveformPeaks=\{playback\.waveform\?\.peaks \?\? null\}/);
  assert.match(playerSource, /transport=\{\{/);
  assert.match(playerSource, /toggle: playback\.togglePlayback/);
  assert.match(playerSource, /endControls=\{/);
  assert.doesNotMatch(playerSource, /MediaTransportIcon/);
  assert.doesNotMatch(playerSource, /formatPlaybackTime/);
  assert.doesNotMatch(playerSource, /⏮|⏭|❚❚/);
  assert.match(styleSource, /grid-template-areas:[\s\S]*"artwork identity time waveform transport volume"/);
  assert.match(styleSource, /\.persistent-library-player__transport-icon svg/);
  assert.match(helpSource, /compact Now Playing presentation structure come from the shared/);
});


test("persistent playback consumes shared queue navigation and transport controller primitives", () => {
  assert.match(playerSource, /dedupePlaybackQueue\(request\.queue\)/);
  assert.match(playerSource, /getPlaybackQueueNeighbor\(/);
  assert.match(playerSource, /getPlaybackQueueCapabilities\(/);
  assert.match(playerSource, /transport=\{\{/);
  assert.match(playerSource, /previous: playback\.previous/);
  assert.match(playerSource, /next: playback\.next/);
  assert.doesNotMatch(playerSource, /queueRef\.current\[currentIndex \+ direction\]/);
});
