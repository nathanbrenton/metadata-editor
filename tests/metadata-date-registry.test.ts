import assert from "node:assert/strict";
import test from "node:test";

import { metadataFieldRegistry } from "../server/metadata-registry.js";

const datePaths = new Set(
  metadataFieldRegistry
    .filter((field) => field.valueType === "date")
    .map((field) => field.tomlPath),
);

test("registers canonical release, track, and clearance dates as date fields", () => {
  assert.equal(datePaths.has("release.dates.release"), true);
  assert.equal(datePaths.has("release.dates.original_release"), true);
  assert.equal(datePaths.has("track.dates.release"), true);
  assert.equal(datePaths.has("track.dates.original_release"), true);
  assert.equal(datePaths.has("track.sample_clearances[].expiration_date"), true);
});
