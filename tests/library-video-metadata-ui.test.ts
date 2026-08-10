import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const indexSource = readFileSync(
  new URL("../server/index.ts", import.meta.url),
  "utf8",
);
const helpSource = readFileSync(
  new URL("../src/workflow-help-content.ts", import.meta.url),
  "utf8",
);

test("authors canonical video title type and related-track metadata from Library", () => {
  assert.match(appSource, /Edit metadata/);
  assert.match(appSource, /Save video metadata/);
  assert.match(appSource, /Stable video ID/);
  assert.match(appSource, /Canonical master/);
  assert.match(appSource, /ingestVideoTypeOptions/);
});

test("uses dedicated guarded video metadata read and save routes", () => {
  assert.match(indexSource, /"\/api\/library\/video-metadata"/);
  assert.match(indexSource, /"\/api\/library\/save-video-metadata"/);
  assert.match(indexSource, /readVideoMetadataForEdit/);
  assert.match(indexSource, /saveVideoMetadataEdits/);
});

test("documents immutable video identity and canonical master path", () => {
  assert.match(
    helpSource,
    /Stable video ID and canonical master path stay read-only/,
  );
  assert.match(
    helpSource,
    /SHA-256 concurrency check, timestamped backup, validated temporary write, and atomic replacement/,
  );
});
