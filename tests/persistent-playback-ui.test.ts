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

test("accepts guarded host preview URLs through the shared source-adapter contract without coupling to public HLS", () => {
  assert.match(
    playerSource,
    /const metadataPreviewSourceAdapter: MediaSourceAdapter<string>/,
  );
  assert.match(
    playerSource,
    /audio\.src = source/,
  );
  assert.match(
    playerSource,
    /attachMediaSource\(\{[\s\S]*source: track\.source/,
  );
  assert.match(
    appSource,
    /source: buildAudioPreviewUrl\(/,
  );
  assert.match(
    appSource,
    /source: buildIngestAudioPreviewUrl\(/,
  );
  assert.doesNotMatch(playerSource, /buildAudioPreviewUrl|buildIngestAudioPreviewUrl/);
  assert.doesNotMatch(playerSource, /hls\.js|Hls\b/);
  assert.doesNotMatch(playerSource, /published-media/);
  assert.match(playerSource, /type PersistentPlaybackTrack = PlayableMediaItem<string>/);
  assert.match(playerSource, /getPlayableMediaContext\(track\)/);
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
  assert.match(playerSource, /usePersistentMediaElement\(\)/);
  assert.match(playerSource, /<PersistentMediaElement/);
  assert.match(helpSource, /Space is reserved for transport outside actual text-entry fields/);
});


test("persistent footer accepts host-provided waveform URLs and renders the shared waveform surface", () => {
  assert.match(playerSource, /type PersistentPlaybackTrack = PlayableMediaItem<string>/);
  assert.match(playerSource, /currentTrack\?\.waveformUrl\?\.trim\(\)/);
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
  assert.match(appSource, /<LazyWaveformColorMenuCard/);
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

  assert.match(packageSource, /"@hiplingo\/media-player": "file:\.\.\/packages\/media-player"/);
  assert.match(rendererSource, /@hiplingo\/media-player/);
  assert.doesNotMatch(rendererSource, /getContext\("2d"\)/);
  assert.match(waveformSource, /WAVEFORM_COLOR_OPTIONS/);
  assert.match(waveformSource, /from "@hiplingo\/media-player"/);
});

test("persistent footer consumes the shared compact Now Playing presentation", () => {
  assert.match(playerSource, /CompactNowPlayingBar/);
  assert.match(playerSource, /from "@hiplingo\/media-player"/);
  assert.match(playerSource, /waveformPeaks=\{playback\.waveform\?\.peaks \?\? null\}/);
  assert.match(playerSource, /controller=\{\{/);
  assert.match(playerSource, /toggle: playback\.togglePlayback/);
  assert.match(playerSource, /controller=\{\{/);
  assert.match(playerSource, /onArtworkClick=\{/);
  assert.match(
    playerSource,
    /artworkActionLabel="Open current release in Library Waveform view"/,
  );
  assert.doesNotMatch(playerSource, /endControls=\{/);
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
  assert.match(playerSource, /controller=\{\{/);
  assert.match(playerSource, /previous: playback\.previous/);
  assert.match(playerSource, /next: playback\.next/);
  assert.doesNotMatch(playerSource, /queueRef\.current\[currentIndex \+ direction\]/);
});

test("persistent footer is visible before the first playback selection", () => {
  assert.doesNotMatch(
    playerSource,
    /if \(!track\) \{\s*return null;\s*\}/,
  );
  assert.match(
    playerSource,
    /title=\{track\?\.title \?\? "Ready to preview"\}/,
  );
  assert.match(
    playerSource,
    /Choose a track in Ingest, Staging, or Library/,
  );
  assert.match(
    playerSource,
    /canToggle: Boolean\(track\)/,
  );
  assert.match(
    helpSource,
    /player footer is always visible/,
  );
});

test("persistent footer consumes the shared volume interaction and perceptual curve", async () => {
  const sharedVolumeSource = await readFile(
    new URL(
      "../../packages/media-player/src/MediaVolumeControl.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  const sharedVolumeLifecycle = await readFile(
    new URL(
      "../../packages/media-player/src/useMediaElementVolume.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(playerSource, /useMediaElementVolume\(audioRef\)/);
  assert.doesNotMatch(playerSource, /volumePercentToGain/);
  assert.doesNotMatch(playerSource, /clampVolumePercent/);
  assert.doesNotMatch(
    playerSource,
    /audio\.volume = volumePercentToGain\(volumePercent\)/,
  );
  assert.match(
    sharedVolumeLifecycle,
    /audio\.volume =[\s\S]*volumePercentToGain\(volumePercent\)/,
  );
  assert.match(playerSource, /volumePercent: playback\.volumePercent/);
  assert.match(playerSource, /setVolumePercent: playback\.setVolumePercent/);
  assert.match(
    playerSource,
    /volumeControl: "persistent-library-player__volume-control"/,
  );
  assert.doesNotMatch(
    playerSource,
    /PersistentPlayerVolumeControl|PersistentPlayerVolumeIcon|normalizedVolumeToGain/,
  );
  assert.match(sharedVolumeSource, /data-shared-volume-control="true"/);
  assert.match(sharedVolumeSource, /aria-haspopup="true"/);
  assert.match(sharedVolumeSource, /max="100"/);
  assert.match(sharedVolumeSource, /return normalized \* normalized/);
  assert.match(
    styleSource,
    /\.persistent-library-player__volume-popup/,
  );
  assert.match(styleSource, /rotate\(-90deg\)/);
});

test("persistent playback initializes the shared media analyser before playback starts", () => {
  assert.match(playerSource, /useMediaElementAnalyser/);
  assert.match(
    playerSource,
    /if \(!autoplay\)[\s\S]*void ensureAnalyser\(\);[\s\S]*void audio\.play\(\)/,
  );
  assert.match(
    playerSource,
    /if \(active\?\.key === trackKey && audio\)[\s\S]*if \(audio\.paused\)[\s\S]*void ensureAnalyser\(\);[\s\S]*void audio\.play\(\)/,
  );
  assert.match(
    playerSource,
    /const togglePlayback = useCallback\([\s\S]*if \(audio\.paused\)[\s\S]*void ensureAnalyser\(\);[\s\S]*void audio\.play\(\)/,
  );
});

test("persistent footer supplies one shared shell controller", () => {
  assert.match(playerSource, /controller=\{\{/);
  assert.match(playerSource, /transport: \{/);
  assert.match(playerSource, /volume: \{/);
  assert.match(playerSource, /volumePercent: playback\.volumePercent/);
  assert.match(playerSource, /setVolumePercent: playback\.setVolumePercent/);
});

test("persistent Library timeline state and seeking come from the shared media-element timeline", async () => {
  const sharedTimeline = await readFile(
    new URL(
      "../../packages/media-player/src/useMediaElementTimeline.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(playerSource, /useMediaElementTimeline\(audioRef\)/);
  assert.doesNotMatch(playerSource, /const \[currentTime, setCurrentTime\]/);
  assert.doesNotMatch(playerSource, /const \[duration, setDuration\]/);
  assert.doesNotMatch(playerSource, /const seek = useCallback/);
  assert.match(playerSource, /syncCurrentTime\(audio\)/);
  assert.match(playerSource, /syncDuration\(audio\)/);
  assert.match(sharedTimeline, /media\.currentTime = nextTime/);
  assert.match(sharedTimeline, /Number\.isFinite\(media\.duration\)/);
});

test("persistent Library play and loading state come from the shared media-element state", async () => {
  const sharedPlaybackState = await readFile(
    new URL(
      "../../packages/media-player/src/useMediaElementPlaybackState.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(playerSource, /useMediaElementPlaybackState\(audioRef\)/);
  assert.doesNotMatch(
    playerSource,
    /const \[isPlaying, setIsPlaying\] = useState\(false\)/,
  );
  assert.doesNotMatch(
    playerSource,
    /const \[isLoading, setIsLoading\] = useState\(false\)/,
  );
  assert.match(
    sharedPlaybackState,
    /const \[isPlaying, setIsPlaying\] = useState\(false\)/,
  );
  assert.match(
    sharedPlaybackState,
    /const \[isLoading, setIsLoading\] = useState\(false\)/,
  );
  assert.match(playerSource, /audio\.addEventListener\("play", handlePlay\)/);
  assert.match(playerSource, /audio\.addEventListener\("waiting", handleWaiting\)/);
  assert.match(playerSource, /audio\.addEventListener\("ended", handleEnded\)/);
});

test("persistent Library ordinary media events use the shared transition handlers", async () => {
  const sharedPlaybackEvents = await readFile(
    new URL(
      "../../packages/media-player/src/useMediaElementPlaybackEvents.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(playerSource, /useMediaElementPlaybackEvents\(playbackState\)/);
  assert.doesNotMatch(
    playerSource,
    /const handlePlay = \(\) => \{[\s\S]*setIsPlaying\(true\)/,
  );
  assert.match(playerSource, /audio\.addEventListener\("play", handlePlay\)/);
  assert.match(playerSource, /audio\.addEventListener\("pause", handlePause\)/);
  assert.match(playerSource, /audio\.addEventListener\("waiting", handleWaiting\)/);
  assert.match(playerSource, /audio\.addEventListener\("canplay", handleCanPlay\)/);
  assert.match(playerSource, /handlePlaybackError\(\)/);
  assert.match(playerSource, /audio\.addEventListener\("ended", handleEnded\)/);
  assert.match(playerSource, /loadTrackRef\.current\?\.\(nextTrack, true\)/);
  assert.match(sharedPlaybackEvents, /setPlaying\(true\)/);
  assert.match(sharedPlaybackEvents, /setLoading\(true\)/);
  assert.doesNotMatch(sharedPlaybackEvents, /handleEnded/);
});

test("persistent Library source attachment implements the shared host-neutral adapter contract", async () => {
  const sharedSourceAdapter = await readFile(
    new URL(
      "../../packages/media-player/src/media-source-adapter.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(
    sharedSourceAdapter,
    /export type MediaSourceAdapter<TSource>/,
  );
  assert.match(
    sharedSourceAdapter,
    /source: TSource/,
  );
  assert.doesNotMatch(
    sharedSourceAdapter,
    /hls\.js|HlsRuntime|buildAudioPreviewUrl|published-media/,
  );
  assert.match(
    playerSource,
    /const metadataPreviewSourceAdapter: MediaSourceAdapter<string>/,
  );
  assert.match(
    playerSource,
    /useMediaSourceSession\(/,
  );
  assert.match(
    playerSource,
    /attachMediaSource\(\{/,
  );
  assert.match(
    playerSource,
    /disposeMediaSource\(\)/,
  );
  assert.match(
    playerSource,
    /isCurrentMediaSource\(track\.key\)/,
  );
  assert.doesNotMatch(playerSource, /loadedTrackKeyRef/);
  assert.match(
    playerSource,
    /void ensureAnalyser\(\);[\s\S]*void audio\.play\(\)/,
  );
});

test("persistent Library uses shared source-session orchestration while keeping preview implementation local", async () => {
  const sharedSourceSession = await readFile(
    new URL(
      "../../packages/media-player/src/useMediaSourceSession.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(playerSource, /useMediaSourceSession\(/);
  assert.match(playerSource, /attachMediaSource\(\{/);
  assert.match(playerSource, /disposeMediaSource\(\)/);
  assert.match(playerSource, /isCurrentMediaSource\(track\.key\)/);
  assert.doesNotMatch(playerSource, /loadedTrackKeyRef/);
  assert.match(playerSource, /audio\.src = source/);
  assert.match(sharedSourceSession, /currentMediaKeyRef/);
  assert.match(sharedSourceSession, /adapterRef\.current\.attach/);
  assert.doesNotMatch(
    sharedSourceSession,
    /buildAudioPreviewUrl|published-media|hls\.js|audio\.src\s*=/,
  );
});

test("persistent Library media element is rendered and owned through the shared package", async () => {
  const persistentElement = await readFile(
    new URL(
      "../../packages/media-player/src/PersistentMediaElement.tsx",
      import.meta.url,
    ),
    "utf8",
  );
  const sourceSession = await readFile(
    new URL(
      "../../packages/media-player/src/useMediaSourceSession.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(playerSource, /const mediaElement = usePersistentMediaElement\(\)/);
  assert.match(playerSource, /mediaElement: PersistentMediaElementController/);
  assert.match(playerSource, /<PersistentMediaElement/);
  assert.match(playerSource, /controller=\{playback\.mediaElement\}/);
  assert.doesNotMatch(playerSource, /const audio = new Audio\(\)/);
  assert.doesNotMatch(
    playerSource,
    /audioRef\.current = audio|audioRef\.current = null/,
  );
  assert.match(persistentElement, /ref=\{controller\.bindAudioElement\}/);
  assert.match(sourceSession, /attachedAudioRef/);
});
