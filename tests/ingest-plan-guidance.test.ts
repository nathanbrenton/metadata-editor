import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sharedSource = readFileSync(new URL("../shared/ingest-builder.ts", import.meta.url), "utf8");
const serverSource = readFileSync(new URL("../server/ingest-builder.ts", import.meta.url), "utf8");
const builderSource = readFileSync(new URL("../src/IngestReleaseBuilder.tsx", import.meta.url), "utf8");
const helpSource = readFileSync(new URL("../src/workflow-help-content.ts", import.meta.url), "utf8");

test("keeps normal staging mechanics informational instead of warnings", () => {
  assert.match(sharedSource, /warnings: string\[\];[\s\S]*notes: string\[\];/);
  assert.match(serverSource, /warnings: \[\],[\s\S]*notes: operation === "create"/);
  assert.match(serverSource, /Staging generates and validates Library waveform-peaks\.wfp/);
  assert.doesNotMatch(serverSource, /initial audio-player source/);
});

test("shows staging mechanics in collapsed Build details", () => {
  assert.match(builderSource, /Staging behavior/);
  assert.match(builderSource, /preview\.notes\.map/);
  assert.match(builderSource, /Informational details about the normal staging operation\. No action is required\./);
});

test("documents the warning versus informational distinction", () => {
  assert.match(helpSource, /Normal Staging behavior is informational, not a warning/);
  assert.match(helpSource, /Private Library playback MP3s and website HLS streams remain separate derivatives/);
  assert.match(helpSource, /genuine warnings remain visible/i);
});
