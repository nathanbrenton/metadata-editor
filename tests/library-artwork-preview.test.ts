import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTiffArtworkPreviewArgs,
  getLibraryArtworkPreviewMode,
} from "../server/library-artwork-preview.js";

test("selects direct and TIFF-transcoded artwork preview modes", () => {
  assert.equal(getLibraryArtworkPreviewMode(".png"), "direct");
  assert.equal(getLibraryArtworkPreviewMode("tiff"), "tiff-transcode");
  assert.equal(getLibraryArtworkPreviewMode(".pdf"), "unsupported");
});

test("builds a shell-free one-frame TIFF to PNG preview command", () => {
  const inputPath = "/tmp/artwork with spaces;safe.tif";
  const args = buildTiffArtworkPreviewArgs(inputPath);

  assert.equal(args.includes(inputPath), true);
  assert.deepEqual(args.slice(-4), ["image2pipe", "-vcodec", "png", "pipe:1"]);
  assert.equal(args.includes("-frames:v"), true);
  assert.equal(args.includes("1"), true);
});
