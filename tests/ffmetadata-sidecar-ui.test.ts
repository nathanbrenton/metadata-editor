import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const builderSource = readFileSync(
  new URL("../src/IngestReleaseBuilder.tsx", import.meta.url),
  "utf8",
);
const helpSource = readFileSync(
  new URL("../src/workflow-help-content.ts", import.meta.url),
  "utf8",
);

test("shows parsed FFmetadata details in Ingest", () => {
  assert.match(appSource, /Metadata sidecar/);
  assert.match(appSource, /Paired audio/);
  assert.match(appSource, /Canonical suggestions/);
  assert.match(appSource, /Preserved but not mapped yet/);
});

test("compares sidecar evidence against Staging and existing Library metadata", () => {
  assert.match(builderSource, /Metadata sidecar evidence/);
  assert.match(builderSource, /Sidecars are evidence, not authority/);
  assert.match(builderSource, /Matches current/);
  assert.match(builderSource, /Differs from current/);
  assert.match(builderSource, /Review current list/);
});

test("documents reusable sidecars for later release revisions", () => {
  assert.match(helpSource, /Can I add an old metadata sidecar after a release is already in the Library/);
  assert.match(helpSource, /reusable evidence rather than one-time creation inputs/);
  assert.match(helpSource, /never silently overwrites authored Library metadata/);
});
