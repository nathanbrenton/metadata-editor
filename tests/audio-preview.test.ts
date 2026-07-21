import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAudioPreviewTranscodeArgs,
  getAudioPreviewContentType,
  getAudioPreviewDeliveryMode,
  parseSingleByteRange,
  selectAudioPreviewMp3Encoder,
  selectTrackAudioPreview,
} from "../server/audio-preview.js";
import {
  buildAudioPreviewUrl,
  getAdjacentPlayableTrackId,
  getAudioPreviewSourceLabel,
  getPlayableTrackIds,
  trackHasAudioPreview,
} from "../src/audio-preview.js";
import type {
  DiscoveredAsset,
  FfmpegCapabilities,
  TrackScanResult,
} from "../server/types.js";

const master: DiscoveredAsset = {
  filename: "audio-master.wav",
  relativePath:
    "releases/example/tracks/track-1/audio-master.wav",
  extension: ".wav",
};

const playback: DiscoveredAsset = {
  filename: "audio-playback.mp3",
  relativePath:
    "releases/example/tracks/track-1/audio-playback.mp3",
  extension: ".mp3",
};

function makeTrack(
  overrides: Partial<TrackScanResult> = {},
): TrackScanResult {
  return {
    id: "track-1",
    relativePath:
      "releases/example/tracks/track-1",
    metadataFiles: [],
    audioMasters: [master],
    playbackAudio: [],
    artworkMasters: [],
    ...overrides,
  };
}

test("prefers generated playback audio over the archival master", () => {
  const selection = selectTrackAudioPreview(
    makeTrack({ playbackAudio: [playback] }),
  );

  assert.equal(selection.sourceKind, "playback");
  assert.equal(selection.asset, playback);
});

test("falls back to one unambiguous audio master", () => {
  const selection = selectTrackAudioPreview(
    makeTrack(),
  );

  assert.equal(selection.sourceKind, "master");
  assert.equal(selection.asset, master);
});

test("rejects missing and ambiguous preview sources", () => {
  assert.throws(
    () =>
      selectTrackAudioPreview(
        makeTrack({ audioMasters: [] }),
      ),
    /No audio preview source/,
  );
  assert.throws(
    () =>
      selectTrackAudioPreview(
        makeTrack({
          playbackAudio: [playback, playback],
        }),
      ),
    /Multiple playback audio/,
  );
  assert.throws(
    () =>
      selectTrackAudioPreview(
        makeTrack({
          audioMasters: [master, master],
        }),
      ),
    /Multiple audio masters/,
  );
});

test("parses full, open-ended, and suffix byte ranges", () => {
  assert.deepEqual(
    parseSingleByteRange("bytes=10-19", 100),
    { start: 10, end: 19 },
  );
  assert.deepEqual(
    parseSingleByteRange("bytes=90-", 100),
    { start: 90, end: 99 },
  );
  assert.deepEqual(
    parseSingleByteRange("bytes=-10", 100),
    { start: 90, end: 99 },
  );
  assert.equal(
    parseSingleByteRange(undefined, 100),
    null,
  );
});

test("rejects invalid or multiple byte ranges", () => {
  assert.throws(
    () =>
      parseSingleByteRange(
        "bytes=100-110",
        100,
      ),
    /outside the file/,
  );
  assert.throws(
    () =>
      parseSingleByteRange(
        "bytes=0-1,3-4",
        100,
      ),
    /Only one bytes range/,
  );
});

test("exposes expected audio content types", () => {
  assert.equal(
    getAudioPreviewContentType(".MP3"),
    "audio/mpeg",
  );
  assert.equal(
    getAudioPreviewContentType(".m4a"),
    "audio/mp4",
  );
});

test("builds a playable track sequence and wraps transport navigation", () => {
  const tracks = [
    makeTrack({ id: "one" }),
    makeTrack({
      id: "blocked",
      audioMasters: [],
    }),
    makeTrack({
      id: "two",
      playbackAudio: [playback],
    }),
  ];

  assert.equal(trackHasAudioPreview(tracks[0]), true);
  assert.equal(trackHasAudioPreview(tracks[1]), false);
  assert.deepEqual(
    getPlayableTrackIds(tracks),
    ["one", "two"],
  );
  assert.equal(
    getAdjacentPlayableTrackId(
      ["one", "two"],
      "one",
      -1,
    ),
    "two",
  );
  assert.equal(
    getAdjacentPlayableTrackId(
      ["one", "two"],
      "two",
      1,
    ),
    "one",
  );
});

test("builds a confined identifier-based preview URL", () => {
  assert.equal(
    buildAudioPreviewUrl(
      "2018 release",
      "artist/track",
    ),
    "/api/library/audio-preview?release=2018+release&track=artist%2Ftrack",
  );
});


test("serves MP3 directly and live-transcodes other recognized sources", () => {
  assert.equal(
    getAudioPreviewDeliveryMode(".MP3"),
    "direct",
  );
  assert.equal(
    getAudioPreviewDeliveryMode(".aif"),
    "transcoded",
  );
  assert.equal(
    getAudioPreviewDeliveryMode(".flac"),
    "transcoded",
  );
});

test("selects an available MP3 encoder and builds a pipe-safe preview command", () => {
  const capabilities: FfmpegCapabilities = {
    available: true,
    executable: "ffmpeg",
    version: "test",
    encoders: ["libmp3lame"],
    checkedAt: "2026-07-21T00:00:00.000Z",
    containers: [
      {
        container: "mp3",
        status: "ready",
        preferredEncoder: "libmp3lame",
        selectedEncoder: "libmp3lame",
        fallbackEncoders: ["mp3"],
        note: "ready",
      },
    ],
  };

  assert.equal(
    selectAudioPreviewMp3Encoder(
      capabilities,
    ),
    "libmp3lame",
  );

  const args =
    buildAudioPreviewTranscodeArgs(
      "/library/audio-master.aif",
      "libmp3lame",
    );

  assert.deepEqual(
    args.slice(-4),
    ["192k", "-f", "mp3", "pipe:1"],
  );
  assert.ok(
    args.includes(
      "/library/audio-master.aif",
    ),
  );
  assert.ok(args.includes("-nostdin"));
  assert.ok(args.includes("-map_metadata"));
});

test("rejects live transcoding when FFmpeg or an MP3 encoder is unavailable", () => {
  const unavailable: FfmpegCapabilities = {
    available: false,
    executable: "ffmpeg",
    encoders: [],
    checkedAt: "2026-07-21T00:00:00.000Z",
    containers: [],
    error: "not found",
  };

  assert.throws(
    () =>
      selectAudioPreviewMp3Encoder(
        unavailable,
      ),
    /not found/,
  );
});

test("labels direct and live-transcoded preview sources", () => {
  assert.equal(
    getAudioPreviewSourceLabel(
      makeTrack({
        playbackAudio: [playback],
      }),
    ),
    "Playback audio",
  );
  assert.equal(
    getAudioPreviewSourceLabel(
      makeTrack({
        audioMasters: [
          {
            ...master,
            filename: "audio-master.aif",
            relativePath:
              "releases/example/tracks/track-1/audio-master.aif",
            extension: ".aif",
          },
        ],
      }),
    ),
    "Audio master · live MP3 preview",
  );
});
