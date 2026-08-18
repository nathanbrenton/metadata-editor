import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyPublicationV1File,
  summarizePublicationV1Files,
} from "../server/publication-v1-audit.js";

test("classifies the v1 public package by storage role", () => {
  assert.equal(
    classifyPublicationV1File(
      "releases/release-1/tracks/track-1/stream/segment-00001.m4s",
    ),
    "audio-hls",
  );
  assert.equal(
    classifyPublicationV1File(
      "releases/release-1/tracks/track-1/waveform-peaks.wfp",
    ),
    "waveforms",
  );
  assert.equal(
    classifyPublicationV1File(
      "releases/release-1/tracks/track-1/waveform-peaks.json",
    ),
    "waveforms",
  );
  assert.equal(
    classifyPublicationV1File(
      "releases/release-1/videos/video-1/stream/poster.png",
    ),
    "video",
  );
  assert.equal(
    classifyPublicationV1File(
      "releases/release-1/artwork/front.png",
    ),
    "artwork-images",
  );
  assert.equal(
    classifyPublicationV1File(
      "releases/release-1/release.json",
    ),
    "metadata",
  );
});

test("summarizes publication storage without lowering waveform resolution", () => {
  const summary = summarizePublicationV1Files([
    {
      path: "releases/r/tracks/t/stream/index.m3u8",
      bytes: 10,
    },
    {
      path: "releases/r/tracks/t/stream/segment-00001.m4s",
      bytes: 90,
    },
    {
      path: "releases/r/tracks/t/waveform-peaks.wfp",
      bytes: 40,
    },
    {
      path: "releases/r/artwork/front.webp",
      bytes: 20,
    },
    {
      path: "catalog.json",
      bytes: 5,
    },
  ]);

  const byCategory = new Map(
    summary.map((item) => [item.category, item]),
  );
  assert.deepEqual(byCategory.get("audio-hls"), {
    category: "audio-hls",
    fileCount: 2,
    bytes: 100,
  });
  assert.deepEqual(byCategory.get("waveforms"), {
    category: "waveforms",
    fileCount: 1,
    bytes: 40,
  });
  assert.deepEqual(byCategory.get("artwork-images"), {
    category: "artwork-images",
    fileCount: 1,
    bytes: 20,
  });
});
