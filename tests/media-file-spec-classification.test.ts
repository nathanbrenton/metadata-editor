import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyMediaMasterExtension,
  classifyMetadataFileExtension,
  normalizeMediaFileExtension,
} from "../shared/media-file-spec.js";

test("normalizes extension spelling and case before classification", () => {
  assert.equal(normalizeMediaFileExtension("WAV"), ".wav");
  assert.equal(normalizeMediaFileExtension(".TiFf"), ".tiff");
  assert.equal(normalizeMediaFileExtension("  MP4  "), ".mp4");
  assert.equal(normalizeMediaFileExtension(""), "");
});

test("classifies preferred and compatibility-only master formats", () => {
  assert.equal(
    classifyMediaMasterExtension("audio-master", ".wav"),
    "preferred",
  );
  assert.equal(
    classifyMediaMasterExtension("audio-master", ".aac"),
    "compatible",
  );
  assert.equal(
    classifyMediaMasterExtension("artwork-master", ".webp"),
    "compatible",
  );
  assert.equal(
    classifyMediaMasterExtension("video-master", ".mov"),
    "preferred",
  );
  assert.equal(
    classifyMediaMasterExtension("video-master", ".xyz"),
    "unsupported",
  );
});

test("keeps canonical metadata, recognized sidecars, and candidate evidence distinct", () => {
  assert.equal(
    classifyMetadataFileExtension(".toml"),
    "canonical",
  );
  assert.equal(
    classifyMetadataFileExtension(".ffmetadata"),
    "recognized-sidecar",
  );
  assert.equal(
    classifyMetadataFileExtension(".json"),
    "candidate-evidence",
  );
  assert.equal(
    classifyMetadataFileExtension(".txt"),
    "candidate-evidence",
  );
});
