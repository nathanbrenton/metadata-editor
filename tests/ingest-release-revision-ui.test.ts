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

test("Build blocks ambiguous audio collisions and offers explicit replacement resolution", () => {
  assert.match(builderSource, /unresolvedTrackReplacementConflicts/);
  assert.match(builderSource, /Track replacement required/);
  assert.match(builderSource, /Confirm the existing master to replace/);
  assert.match(
    builderSource,
    /Replacement is[\s\S]*?never inferred automatically/,
  );
  assert.match(builderSource, /replacementTrackId: target\.id/);
  assert.match(
    builderSource,
    /Preserve \{target\.id\}; replace canonical audio only/,
  );
  assert.match(
    builderSource,
    /unresolvedTrackReplacementConflicts\.length > 0/,
  );
});

test("canonical-audio replacement invalidates playback streams and schedules waveform regeneration", () => {
  assert.match(serverSource, /Explicit canonical-audio replacement/);
  assert.match(serverSource, /audio-playback\.mp3/);
  assert.match(serverSource, /prepareStagingWaveforms/);
  assert.match(serverSource, /waveform-peaks\.wfp/);
  assert.match(serverSource, /`\$\{track\.relativePath\}\/stream`/);
  assert.match(serverSource, /Choose Replace canonical audio/);
});

test("Workflow & Help documents disposable revision candidates and Build-time waveform regeneration", () => {
  assert.match(helpSource, /tracks that are absent from the current ingest candidate are preserved automatically/i);
  assert.match(helpSource, /Replace canonical audio/i);
  assert.match(helpSource, /regenerates waveform-peaks\.wfp/i);
});


test("Build keeps explicit audio-master replacement confirmation visible and makes the next action obvious", () => {
  assert.match(builderSource, /confirmedTrackReplacements/);
  assert.match(builderSource, /Audio master replacement confirmed/);
  assert.match(builderSource, /Replacement target locked/);
  assert.match(builderSource, /Next: Preview replacement update\./);
  assert.match(builderSource, /Preview replacement update/);
  assert.match(builderSource, /Preserve stable ID \{target\.id\}/);
});
