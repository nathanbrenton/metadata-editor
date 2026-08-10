import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyIngestExtension,
} from "../server/ingest-inference.js";

test("recognizes common video extensions before probe verification", () => {
  for (const extension of [
    ".mp4",
    ".mov",
    ".mkv",
    ".mxf",
    ".webm",
    ".m4v",
  ]) {
    assert.equal(
      classifyIngestExtension(extension),
      "video",
      extension,
    );
  }
});
