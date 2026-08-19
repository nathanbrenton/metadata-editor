import assert from "node:assert/strict";
import test from "node:test";

import {
  getVideoPreviewContentType,
  selectVideoPreviewMaster,
} from "../server/video-preview.js";
import {
  buildLibraryVideoPreviewUrl,
  canPreviewLibraryVideoExtension,
} from "../src/video-preview.js";

test("recognizes browser-direct canonical video containers", () => {
  assert.equal(getVideoPreviewContentType(".mp4"), "video/mp4");
  assert.equal(getVideoPreviewContentType("m4v"), "video/mp4");
  assert.equal(getVideoPreviewContentType(".mov"), "video/quicktime");
  assert.equal(getVideoPreviewContentType(".webm"), "video/webm");
  assert.equal(getVideoPreviewContentType(".mkv"), undefined);
  assert.equal(canPreviewLibraryVideoExtension(".webm"), true);
  assert.equal(canPreviewLibraryVideoExtension("mkv"), false);
});

test("selects exactly one canonical video master", () => {
  const master = {
    filename: "video-master.mp4",
    relativePath:
      "releases/example/videos/video_example/video-master.mp4",
    extension: ".mp4",
  };

  assert.deepEqual(
    selectVideoPreviewMaster({
      id: "video_example",
      relativePath:
        "releases/example/videos/video_example",
      metadataFiles: [],
      videoMasters: [master],
    }),
    master,
  );

  assert.throws(
    () =>
      selectVideoPreviewMaster({
        id: "video_example",
        relativePath:
          "releases/example/videos/video_example",
        metadataFiles: [],
        videoMasters: [],
      }),
    /No canonical video master/,
  );
});

test("builds an encoded Library video preview URL", () => {
  assert.equal(
    buildLibraryVideoPreviewUrl(
      "2026-08-09_example release",
      "video_take 1",
    ),
    "/api/library/video-preview?release=2026-08-09_example+release&video=video_take+1",
  );
});
