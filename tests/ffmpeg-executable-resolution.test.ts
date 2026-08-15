import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFfmpegExecutableCandidates,
} from "../server/ffmpeg-capabilities.js";

test("explicit metadata-editor FFmpeg override is authoritative", () => {
  assert.deepEqual(
    buildFfmpegExecutableCandidates(
      "darwin",
      {
        METADATA_EDITOR_FFMPEG:
          "/custom/tools/ffmpeg",
        HOMEBREW_PREFIX:
          "/opt/homebrew",
      },
    ),
    ["/custom/tools/ffmpeg"],
  );
});

test("macOS prefers Homebrew ffmpeg-full before ordinary ffmpeg", () => {
  assert.deepEqual(
    buildFfmpegExecutableCandidates(
      "darwin",
      {
        HOMEBREW_PREFIX:
          "/opt/homebrew",
      },
    ),
    [
      "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg",
      "/usr/local/opt/ffmpeg-full/bin/ffmpeg",
      "ffmpeg",
    ],
  );
});

test("macOS default prefixes are still tried when HOMEBREW_PREFIX is absent", () => {
  assert.deepEqual(
    buildFfmpegExecutableCandidates(
      "darwin",
      {},
    ),
    [
      "/opt/homebrew/opt/ffmpeg-full/bin/ffmpeg",
      "/usr/local/opt/ffmpeg-full/bin/ffmpeg",
      "ffmpeg",
    ],
  );
});

test("Linux uses ordinary ffmpeg unless explicitly overridden", () => {
  assert.deepEqual(
    buildFfmpegExecutableCandidates(
      "linux",
      {},
    ),
    ["ffmpeg"],
  );

  assert.deepEqual(
    buildFfmpegExecutableCandidates(
      "linux",
      {
        METADATA_EDITOR_FFMPEG:
          "/srv/tools/ffmpeg",
      },
    ),
    ["/srv/tools/ffmpeg"],
  );
});
