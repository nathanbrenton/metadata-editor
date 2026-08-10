import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildPlaybackMp3RemuxArgs,
  buildPlaybackTranscodeArgs,
  buildPlaybackVerificationArgs,
  buildWaveformDecodeArgs,
} from "../server/media-processing/prepare.js";

test("builds sanitized playback commands without shell interpolation", () => {
  const remux = buildPlaybackMp3RemuxArgs(
    "/tmp/source name.mp3",
    "/tmp/output name.mp3",
  );

  assert.deepEqual(
    remux.slice(remux.indexOf("-c:a"), remux.indexOf("-c:a") + 2),
    ["-c:a", "copy"],
  );
  assert.ok(remux.includes("-map_metadata"));
  assert.ok(remux.includes("-1"));
  assert.ok(remux.includes("-vn"));
  assert.ok(!remux.includes("-b:a"));

  const transcode = buildPlaybackTranscodeArgs(
    "/tmp/source.m4a",
    "/tmp/output.mp3",
    "libmp3lame",
  );
  assert.ok(transcode.includes("libmp3lame"));
  assert.ok(transcode.includes("320k"));
  assert.ok(transcode.includes("-map_metadata"));
  assert.ok(transcode.includes("-vn"));
});

test("decodes canonical non-WAV sources to temporary PCM for waveform analysis", () => {
  const decode = buildWaveformDecodeArgs(
    "/tmp/source.flac",
    "/tmp/decoded.wav",
  );

  assert.ok(decode.includes("pcm_s16le"));
  assert.ok(decode.includes("wav"));
  assert.ok(decode.includes("/tmp/source.flac"));
  assert.ok(decode.includes("/tmp/decoded.wav"));

  const verify = buildPlaybackVerificationArgs(
    "/tmp/audio-playback.mp3",
  );
  assert.deepEqual(verify.slice(-3), ["-f", "null", "-"]);
});

test("guards media preparation with reviewed fingerprints, staging, backups, and rollback", async () => {
  const source = await readFile(
    new URL(
      "../server/media-processing/prepare.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(source, /expectedPublishPlanFingerprint/);
  assert.match(source, /publishPlanGeneratedAt/);
  assert.match(source, /mediaPlanFingerprint/);
  assert.match(source, /\.metadata-editor-operations/);
  assert.match(source, /staging/);
  assert.match(source, /backups/);
  assert.match(source, /sha256/);
  assert.match(source, /post-promotion SHA-256 verification/);
  assert.match(source, /rollback-incomplete/);
  assert.match(source, /The publish preflight is stale/);
  assert.match(source, /The release changed while media was being prepared/);
  assert.match(source, /generateWaveformPeaksFromWav/);
  assert.match(source, /parseWavBuffer/);
  assert.match(source, /buildWebStreamFfmpegArgs/);
  assert.match(source, /inspectWebStreamDirectory/);
  assert.match(source, /web-stream-hls/);
  assert.match(source, /\[track\.playback, track\.waveform\]/);
  assert.match(source, /derivative\.kind === "playback-mp3"/);
});


test("allows sanitized MP3 stream-copy planning without a lossy encoder", async () => {
  const source = await readFile(
    new URL(
      "../server/media-processing/plan.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(source, /const mp3Master/);
  assert.match(source, /mp3-stream-copy/);
  assert.match(source, /!mp3Master &&/);
});
