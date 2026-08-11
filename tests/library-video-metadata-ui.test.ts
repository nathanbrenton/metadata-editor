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

test("authors richer canonical video presentation metadata from Library", () => {
  assert.match(appSource, /Edit metadata/);
  assert.match(appSource, /Save video metadata/);
  assert.match(appSource, /Stable video ID/);
  assert.match(appSource, /Canonical master/);
  assert.match(appSource, /ingestVideoTypeOptions/);
  assert.match(appSource, />Description</);
  assert.match(appSource, /type="date"/);
  assert.match(appSource, />Location</);
  assert.match(appSource, />Director</);
  assert.match(appSource, />Camera operator</);
  assert.match(appSource, /videoEditorDraft\.cameraOperator/);
});

test("uses dedicated guarded video metadata read and save routes", () => {
  assert.match(indexSource, /"\/api\/library\/video-metadata"/);
  assert.match(indexSource, /"\/api\/library\/save-video-metadata"/);
  assert.match(indexSource, /readVideoMetadataForEdit/);
  assert.match(indexSource, /saveVideoMetadataEdits/);
  assert.match(indexSource, /cameraOperator/);
});

test("documents immutable video identity and richer editable presentation metadata", () => {
  assert.match(
    helpSource,
    /Stable video ID and canonical master path stay read-only/,
  );
  assert.match(
    helpSource,
    /description, date, location, director, camera operator/,
  );
  assert.match(
    helpSource,
    /SHA-256 concurrency check, timestamped backup, validated temporary write, and atomic replacement/,
  );
});
