import assert from "node:assert/strict";
import test from "node:test";

import {
  VIDEO_WEB_STREAM_DIRECTORY,
  VIDEO_WEB_STREAM_INFO_FILENAME,
  VIDEO_WEB_STREAM_INIT_FILENAME,
  VIDEO_WEB_STREAM_PLAYLIST_FILENAME,
  VIDEO_WEB_STREAM_POSTER_FILENAME,
  VIDEO_WEB_STREAM_SEGMENT_DURATION_SECONDS,
  VIDEO_WEB_STREAM_SEGMENT_PATTERN,
  buildVideoPosterFfmpegArgs,
  buildVideoWebStreamInfo,
  buildVideoWebStreamPaths,
  buildVideoWebStreamProfile,
  hashVideoWebStreamProfile,
  hashVideoWebStreamSourceIdentity,
} from "../server/media-processing/video-web-stream.js";

test("defines deterministic 720p H.264/AAC HLS plus poster video delivery profile", () => {
  const profile = buildVideoWebStreamProfile();

  assert.equal(profile.version, 3);
  assert.equal(profile.protocol, "hls");
  assert.equal(profile.rendition, "single");

  assert.deepEqual(profile.video, {
    codec: "h264",
    encoder: "libx264",
    profile: "high",
    level: "4.1",
    pixelFormat: "yuv420p",
    preset: "medium",
    crf: 20,
    maxRateKbps: 4500,
    bufferSizeKbps: 9000,
    resolutionPolicy: "fit-within-no-upscale",
    maxWidth: 1280,
    maxHeight: 720,
    frameRatePolicy: "preserve-source-up-to-limit",
    maxFrameRate: 60,
    keyframeIntervalSeconds: 3,
  });

  assert.deepEqual(profile.audio, {
    presencePolicy: "include-if-present",
    codec: "aac",
    codecProfile: "aac_low",
    bitrateKbps: 192,
    channels: 2,
    sampleRatePolicy: "preserve-source",
  });

  assert.deepEqual(profile.poster, {
    filename: "poster.png",
    format: "png",
    framePolicy: "auto-or-authored-seek",
    thumbnailFrames: 120,
    maxWidth: 1280,
    maxHeight: 720,
  });

  assert.deepEqual(profile.playlist, {
    type: "vod",
    segmentType: "fmp4",
    segmentDurationSeconds: 3,
    independentSegments: true,
    playlistFilename: "index.m3u8",
    initFilename: "init.mp4",
    segmentPattern: "segment-%05d.m4s",
  });

  assert.equal(VIDEO_WEB_STREAM_SEGMENT_DURATION_SECONDS, 3);
});

test("keeps the private video stream layout parallel to audio HLS with one poster", () => {
  const paths = buildVideoWebStreamPaths({
    relativePath:
      "releases/2026-08-09_example/videos/video_example",
  });

  assert.equal(VIDEO_WEB_STREAM_DIRECTORY, "stream");
  assert.equal(VIDEO_WEB_STREAM_PLAYLIST_FILENAME, "index.m3u8");
  assert.equal(VIDEO_WEB_STREAM_INIT_FILENAME, "init.mp4");
  assert.equal(VIDEO_WEB_STREAM_INFO_FILENAME, "stream-info.json");
  assert.equal(VIDEO_WEB_STREAM_POSTER_FILENAME, "poster.png");
  assert.equal(VIDEO_WEB_STREAM_SEGMENT_PATTERN, "segment-%05d.m4s");
  assert.deepEqual(paths, {
    directoryRelativePath:
      "releases/2026-08-09_example/videos/video_example/stream",
    manifestRelativePath:
      "releases/2026-08-09_example/videos/video_example/stream/index.m3u8",
    profileInfoRelativePath:
      "releases/2026-08-09_example/videos/video_example/stream/stream-info.json",
  });
});

test("hashes profile and source identity independently for freshness", () => {
  const profile = buildVideoWebStreamProfile();
  const profileSha256 = hashVideoWebStreamProfile(profile);
  const source = {
    relativePath:
      "releases/2026-08-09_example/videos/video_example/video-master.mp4",
    sizeBytes: 123456,
    modifiedAt: "2026-08-09T20:00:00.000Z",
    posterTimeSeconds: 12.5,
  };
  const sourceFingerprint = hashVideoWebStreamSourceIdentity(source);

  assert.match(profileSha256, /^[a-f0-9]{64}$/);
  assert.match(sourceFingerprint, /^[a-f0-9]{64}$/);
  assert.notEqual(
    sourceFingerprint,
    hashVideoWebStreamSourceIdentity({
      ...source,
      sizeBytes: source.sizeBytes + 1,
    }),
  );
  assert.notEqual(
    sourceFingerprint,
    hashVideoWebStreamSourceIdentity({
      ...source,
      posterTimeSeconds: 13,
    }),
  );
  assert.notEqual(
    profileSha256,
    hashVideoWebStreamProfile({
      ...profile,
      video: {
        ...profile.video,
        crf: 21,
      },
    }),
  );

  const info = buildVideoWebStreamInfo(
    "video_example",
    source,
    {
      ...profile,
      sha256: profileSha256,
    },
    "2026-08-09T21:00:00.000Z",
  );

  assert.equal(info.schema.name, "metadata-editor-video-web-stream");
  assert.equal(info.schema.version, 1);
  assert.equal(info.videoId, "video_example");
  assert.equal(info.source.fingerprint, sourceFingerprint);
  assert.equal(info.profile.sha256, profileSha256);
});

test("builds deterministic HLS and poster FFmpeg arguments", async () => {
  const {
    buildVideoWebStreamFfmpegArgs,
    buildVideoWebStreamVerificationArgs,
  } = await import(
    "../server/media-processing/video-web-stream.js"
  );
  const args = buildVideoWebStreamFfmpegArgs(
    "/tmp/source video.mp4",
    "/tmp/video stream",
  );

  assert.ok(args.includes("0:v:0"));
  assert.ok(args.includes("0:a:0?"));
  assert.ok(args.includes("libx264"));
  assert.ok(args.includes("high"));
  assert.ok(args.includes("4.1"));
  assert.ok(args.includes("yuv420p"));
  assert.ok(args.includes("20"));
  assert.ok(args.includes("4500k"));
  assert.ok(args.includes("9000k"));
  assert.ok(args.includes("aac"));
  assert.ok(args.includes("192k"));
  assert.ok(args.includes("independent_segments"));
  assert.ok(
    args.some((arg) => arg.includes("min(source_fps,60)")),
  );
  assert.ok(
    args.some((arg) =>
      arg.includes("force_original_aspect_ratio=decrease"),
    ),
  );
  assert.ok(args.includes("expr:gte(t,n_forced*3)"));

  const posterArgs = buildVideoPosterFfmpegArgs(
    "/tmp/source video.mp4",
    "/tmp/video stream",
  );
  assert.ok(posterArgs.includes("0:v:0"));
  assert.ok(posterArgs.includes("-an"));
  assert.ok(posterArgs.includes("-frames:v"));
  assert.ok(posterArgs.includes("1"));
  assert.ok(
    posterArgs.some((arg) =>
      arg.includes("thumbnail=120") &&
      arg.includes("force_original_aspect_ratio=decrease"),
    ),
  );
  assert.ok(
    posterArgs.at(-1)?.endsWith("/tmp/video stream/poster.png"),
  );

  const authoredPosterArgs = buildVideoPosterFfmpegArgs(
    "/tmp/source video.mp4",
    "/tmp/video stream",
    undefined,
    12.5,
  );
  assert.ok(authoredPosterArgs.includes("-ss"));
  assert.ok(authoredPosterArgs.includes("12.5"));
  assert.equal(
    authoredPosterArgs.some((arg) => arg.includes("thumbnail=120")),
    false,
  );

  const verify = buildVideoWebStreamVerificationArgs(
    "/tmp/video stream/index.m3u8",
  );
  assert.deepEqual(
    verify.slice(-7),
    [
      "-map",
      "0:v:0",
      "-map",
      "0:a:0?",
      "-f",
      "null",
      "-",
    ],
  );
});
