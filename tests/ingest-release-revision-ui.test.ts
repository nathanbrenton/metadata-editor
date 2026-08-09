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

test("Staging exposes one explicit canonical-audio replacement choice for existing stable tracks", () => {
  assert.match(builderSource, /Revision action/);
  assert.match(builderSource, /Replace Track \{target\.number\}/);
  assert.match(builderSource, /Stable ID and authored metadata will be preserved/);
  assert.match(builderSource, /existingTracks=\{targetStatus\?\.existingTracks \?\? \[\]\}/);
  assert.match(sharedSource, /replacementTrackId\?: string/);
  assert.match(sharedSource, /existingTracks: IngestStagingTrackTarget\[\]/);
});

test("canonical-audio replacement invalidates generated derivatives instead of silently overwriting them", () => {
  assert.match(serverSource, /Explicit canonical-audio replacement/);
  assert.match(serverSource, /audio-playback\.mp3/);
  assert.match(serverSource, /waveform-peaks\.json/);
  assert.match(serverSource, /`\$\{track\.relativePath\}\/stream`/);
  assert.match(serverSource, /Choose Replace canonical audio/);
});

test("Workflow & Help documents disposable revision candidates and derivative regeneration", () => {
  assert.match(helpSource, /tracks that are absent from the current ingest candidate are preserved automatically/i);
  assert.match(helpSource, /Replace canonical audio/i);
  assert.match(helpSource, /Prepare release can regenerate/i);
});
