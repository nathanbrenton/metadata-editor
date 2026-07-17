import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyContainerCapabilities,
  detectFfmpegCapabilities,
  parseFfmpegEncoders,
  parseFfmpegVersion,
} from "../server/ffmpeg-capabilities.js";

test(
  "parses an FFmpeg version line",
  () => {
    assert.equal(
      parseFfmpegVersion(
        "ffmpeg version 7.1.1 Copyright",
      ),
      "7.1.1",
    );
    assert.equal(
      parseFfmpegVersion(
        "not ffmpeg output",
      ),
      null,
    );
  },
);

test(
  "parses encoder names from FFmpeg output",
  () => {
    const encoders =
      parseFfmpegEncoders(`
 Encoders:
 V..... = Video
 A..... = Audio
 A....D aac                  AAC
 A....D flac                 FLAC
 A....D libmp3lame           MP3
`);

    assert.deepEqual(encoders, [
      "aac",
      "flac",
      "libmp3lame",
    ]);
  },
);

test(
  "classifies preferred, fallback, and unsupported encoders",
  () => {
    const capabilities =
      classifyContainerCapabilities([
        "libmp3lame",
        "flac",
        "aac",
        "vorbis",
        "pcm_s16le",
      ]);

    assert.equal(
      capabilities.find(
        (item) =>
          item.container === "mp3",
      )?.status,
      "ready",
    );
    assert.equal(
      capabilities.find(
        (item) =>
          item.container ===
          "ogg-vorbis",
      )?.status,
      "fallback-required",
    );
    assert.equal(
      capabilities.find(
        (item) =>
          item.container === "wav",
      )?.selectedEncoder,
      "pcm_s16le",
    );
    assert.equal(
      capabilities.find(
        (item) =>
          item.container === "opus",
      )?.status,
      "unsupported",
    );
  },
);

test(
  "returns capabilities from a command runner",
  async () => {
    const result =
      await detectFfmpegCapabilities(
        async (_file, args) => {
          if (
            args.includes("-version")
          ) {
            return {
              stdout:
                "ffmpeg version test-build\n",
              stderr: "",
            };
          }

          return {
            stdout:
              " A....D aac AAC\n A....D flac FLAC\n",
            stderr: "",
          };
        },
      );

    assert.equal(result.available, true);
    assert.equal(
      result.version,
      "test-build",
    );
    assert.deepEqual(
      result.encoders,
      ["aac", "flac"],
    );
  },
);

test(
  "reports an unavailable FFmpeg executable",
  async () => {
    const result =
      await detectFfmpegCapabilities(
        async () => {
          throw new Error("ENOENT");
        },
      );

    assert.equal(
      result.available,
      false,
    );
    assert.match(
      result.error ?? "",
      /ENOENT/,
    );
    assert.ok(
      result.containers.every(
        (item) =>
          item.status === "unsupported",
      ),
    );
  },
);
