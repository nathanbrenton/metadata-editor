import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMediaTechnicalInventory,
  parseFfprobeTechnical,
} from "../server/media-technical-audit.js";

test("parses audio master technical characteristics", () => {
  const result = parseFfprobeTechnical(
    "audio-master",
    {
      format: {
        format_name: "wav",
        duration: "12.5",
        bit_rate: "2304000",
      },
      streams: [
        {
          codec_type: "audio",
          codec_name: "pcm_s24le",
          sample_rate: "48000",
          channels: 2,
          sample_fmt: "s32",
          bits_per_raw_sample: "24",
        },
      ],
    },
  );

  assert.equal(result.codec, "pcm_s24le");
  assert.equal(result.sampleRate, 48000);
  assert.equal(result.channels, 2);
  assert.equal(result.bitDepth, 24);
});


test("treats zero compressed-audio bit depth as unknown", () => {
  const result = parseFfprobeTechnical(
    "audio-master",
    {
      format: {
        format_name: "mov,mp4,m4a,3gp,3g2,mj2",
      },
      streams: [
        {
          codec_type: "audio",
          codec_name: "aac",
          sample_rate: "48000",
          channels: 2,
          sample_fmt: "fltp",
          bits_per_sample: 0,
          bits_per_raw_sample: "0",
        },
      ],
    },
  );

  assert.equal(result.codec, "aac");
  assert.equal(result.sampleRate, 48000);
  assert.equal(result.bitDepth, undefined);
});

test("parses video dimensions and codec details", () => {
  const result = parseFfprobeTechnical(
    "video-master",
    {
      format: {
        format_name: "mov,mp4,m4a,3gp,3g2,mj2",
      },
      streams: [
        {
          codec_type: "video",
          codec_name: "h264",
          profile: "High",
          width: 1920,
          height: 1080,
          pix_fmt: "yuv420p",
          r_frame_rate: "30000/1001",
        },
      ],
    },
  );

  assert.equal(result.codec, "h264");
  assert.equal(result.profile, "High");
  assert.equal(result.width, 1920);
  assert.equal(result.height, 1080);
  assert.equal(result.pixelFormat, "yuv420p");
});


test("aggregates observed technical characteristics for concise audit output", () => {
  const inventory = buildMediaTechnicalInventory([
    {
      role: "audio-master",
      relativePath: "tracks/01/audio-master.wav",
      extension: ".wav",
      formatClass: "preferred",
      canonicalFilename: "audio-master.wav",
      canonicalName: true,
      technical: {
        codec: "pcm_s24le",
        sampleRate: 48000,
        bitDepth: 24,
        sampleFormat: "s32",
        channels: 2,
      },
    },
    {
      role: "audio-master",
      relativePath: "tracks/02/audio-master.wav",
      extension: ".wav",
      formatClass: "preferred",
      canonicalFilename: "audio-master.wav",
      canonicalName: true,
      technical: {
        codec: "pcm_s24le",
        sampleRate: 48000,
        bitDepth: 24,
        sampleFormat: "s32",
        channels: 2,
      },
    },
    {
      role: "artwork-master",
      relativePath: "artwork/front/artwork-master.png",
      extension: ".png",
      formatClass: "preferred",
      canonicalFilename: "artwork-master.png",
      canonicalName: true,
      technical: {
        codec: "png",
        width: 1080,
        height: 1080,
        pixelFormat: "rgb24",
      },
    },
    {
      role: "video-master",
      relativePath: "videos/v1/video-master.mp4",
      extension: ".mp4",
      formatClass: "preferred",
      canonicalFilename: "video-master.mp4",
      canonicalName: true,
      technical: {
        codec: "h264",
        profile: "Main",
        width: 1080,
        height: 1920,
        pixelFormat: "yuv420p",
        frameRate: "30/1",
      },
    },
  ]);

  assert.deepEqual(inventory.audio.codecs, [
    { value: "pcm_s24le", count: 2 },
  ]);
  assert.deepEqual(inventory.audio.sampleRates, [
    { value: "48000 Hz", count: 2 },
  ]);
  assert.deepEqual(inventory.audio.bitDepths, [
    { value: "24-bit", count: 2 },
  ]);
  assert.deepEqual(inventory.artwork.dimensions, [
    { value: "1080×1080", count: 1 },
  ]);
  assert.deepEqual(inventory.video.profiles, [
    { value: "Main", count: 1 },
  ]);
  assert.deepEqual(inventory.video.frameRates, [
    { value: "30/1", count: 1 },
  ]);
});

test("summarizes technical health without inventing quality thresholds", async () => {
  const {
    summarizeMediaTechnicalRelease,
  } = await import(
    "../server/media-technical-audit.js"
  );

  const ready = summarizeMediaTechnicalRelease(
    "ready-release",
    [
      {
        role: "audio-master",
        relativePath: "tracks/01/audio-master.wav",
        extension: ".wav",
        formatClass: "preferred",
        canonicalFilename: "audio-master.wav",
        canonicalName: true,
        technical: {
          codec: "pcm_s16le",
          sampleRate: 44100,
          bitDepth: 16,
          channels: 2,
        },
      },
      {
        role: "audio-master",
        relativePath: "tracks/02/audio-master.wav",
        extension: ".wav",
        formatClass: "preferred",
        canonicalFilename: "audio-master.wav",
        canonicalName: true,
        technical: {
          codec: "pcm_s16le",
          sampleRate: 44100,
          bitDepth: 16,
          channels: 2,
        },
      },
    ],
  );

  assert.equal(ready.health, "ready");
  assert.deepEqual(ready.issues, []);

  const review = summarizeMediaTechnicalRelease(
    "mixed-release",
    [
      {
        role: "audio-master",
        relativePath: "tracks/01/audio-master.wav",
        extension: ".wav",
        formatClass: "preferred",
        canonicalFilename: "audio-master.wav",
        canonicalName: true,
        technical: {
          codec: "pcm_s24le",
          sampleRate: 48000,
          bitDepth: 24,
          channels: 2,
        },
      },
      {
        role: "audio-master",
        relativePath: "tracks/02/audio-master.wav",
        extension: ".wav",
        formatClass: "preferred",
        canonicalFilename: "audio-master.wav",
        canonicalName: true,
        technical: {
          codec: "pcm_s16le",
          sampleRate: 44100,
          bitDepth: 16,
          channels: 1,
        },
      },
    ],
  );

  assert.equal(review.health, "review");
  assert.deepEqual(
    review.issues.map((issue) => issue.code),
    [
      "mixed-audio-sample-rate",
      "mixed-audio-bit-depth",
      "mixed-audio-channels",
    ],
  );
});

test("blocks technical health when a canonical master cannot be inspected", async () => {
  const {
    summarizeMediaTechnicalRelease,
  } = await import(
    "../server/media-technical-audit.js"
  );

  const summary = summarizeMediaTechnicalRelease(
    "broken-release",
    [
      {
        role: "video-master",
        relativePath: "videos/v1/video-master.mp4",
        extension: ".mp4",
        formatClass: "preferred",
        canonicalFilename: "video-master.mp4",
        canonicalName: true,
        probeError: "ffprobe failed",
      },
    ],
  );

  assert.equal(summary.health, "blocked");
  assert.equal(summary.issues[0]?.code, "probe-failed");
});

test("builds an advisory preservation contract without converting accepted sources", async () => {
  const {
    buildMediaTechnicalContract,
  } = await import(
    "../server/media-technical-audit.js"
  );

  const contract = buildMediaTechnicalContract([
    {
      role: "audio-master",
      relativePath: "tracks/01/audio-master.wav",
      extension: ".wav",
      formatClass: "preferred",
      canonicalFilename: "audio-master.wav",
      canonicalName: true,
      technical: {
        codec: "pcm_s24le",
        sampleRate: 48000,
        bitDepth: 24,
        channels: 2,
      },
    },
    {
      role: "audio-master",
      relativePath: "tracks/02/audio-master.m4a",
      extension: ".m4a",
      formatClass: "compatible",
      canonicalFilename: "audio-master.m4a",
      canonicalName: true,
      technical: {
        codec: "alac",
        sampleRate: 48000,
        channels: 2,
      },
    },
    {
      role: "audio-master",
      relativePath: "tracks/03/audio-master.mp3",
      extension: ".mp3",
      formatClass: "compatible",
      canonicalFilename: "audio-master.mp3",
      canonicalName: true,
      technical: {
        codec: "mp3",
        sampleRate: 44100,
        channels: 2,
      },
    },
    {
      role: "artwork-master",
      relativePath: "artwork/front/artwork-master.tif",
      extension: ".tif",
      formatClass: "preferred",
      canonicalFilename: "artwork-master.tif",
      canonicalName: true,
      technical: {
        codec: "tiff",
        width: 1080,
        height: 1080,
      },
    },
    {
      role: "artwork-master",
      relativePath: "tracks/01/artwork/front/artwork-master.jpg",
      extension: ".jpg",
      formatClass: "compatible",
      canonicalFilename: "artwork-master.jpg",
      canonicalName: true,
      technical: {
        codec: "mjpeg",
        width: 1448,
        height: 1086,
      },
    },
    {
      role: "video-master",
      relativePath: "videos/v1/video-master.mp4",
      extension: ".mp4",
      formatClass: "preferred",
      canonicalFilename: "video-master.mp4",
      canonicalName: true,
      technical: {
        codec: "h264",
        profile: "Main",
        width: 1080,
        height: 1920,
        frameRate: "30/1",
      },
    },
  ]);

  assert.equal(contract.version, 1);
  assert.equal(contract.advisory, true);
  assert.equal(contract.publishGating, false);
  assert.deepEqual(contract.audio, {
    total: 3,
    preferredLossless: 1,
    compatibleLossless: 1,
    sourcePreservedLossy: 1,
    review: 0,
  });
  assert.deepEqual(contract.artwork.geometry, {
    square: 1,
    landscape: 1,
    portrait: 0,
    unknown: 0,
  });
  assert.equal(contract.video.policy, "inventory-only");
  assert.equal(
    contract.video.codecProfileThresholdDefined,
    false,
  );
});
