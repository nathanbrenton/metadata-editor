import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const builderSource = readFileSync(
  new URL("../src/IngestReleaseBuilder.tsx", import.meta.url),
  "utf8",
);
const serverSource = readFileSync(
  new URL("../server/ingest-builder.ts", import.meta.url),
  "utf8",
);
const sharedSource = readFileSync(
  new URL("../shared/ingest-builder.ts", import.meta.url),
  "utf8",
);
const helpSource = readFileSync(
  new URL("../src/workflow-help-content.ts", import.meta.url),
  "utf8",
);

test("Artwork & files exposes current Library artwork and one explicit replacement confirmation", () => {
  assert.match(builderSource, /existingArtwork=\{targetStatus\?\.existingArtwork \?\? \[\]\}/);
  assert.match(builderSource, /Current Library artwork/);
  assert.match(builderSource, /Confirm artwork replacement/);
  assert.match(builderSource, /replaceExisting: true/);
  assert.match(builderSource, /Existing Library track/);
  assert.match(builderSource, /libraryArtworkPreviewUrl/);
});

test("artwork revision state is explicit in the shared staging contract and server receipt inspection", () => {
  assert.match(sharedSource, /replaceExisting\?: boolean/);
  assert.match(sharedSource, /existingArtwork: IngestStagingArtworkTarget\[\]/);
  assert.match(serverSource, /Explicit canonical-artwork replacement/);
  assert.match(serverSource, /existingArtworkByStem/);
  assert.match(serverSource, /artwork-only|artwork revision/i);
});

test("Workflow & Help documents artwork-only revisions and canonical artwork replacement", () => {
  assert.match(helpSource, /artwork-only revision candidates/i);
  assert.match(helpSource, /current canonical Library front artwork/i);
  assert.match(helpSource, /Confirm artwork replacement/i);
  assert.match(helpSource, /No original audio needs to be resupplied/i);
});
