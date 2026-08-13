import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const builderSource = readFileSync(
  new URL("../src/IngestReleaseBuilder.tsx", import.meta.url),
  "utf8",
);
const styleSource = readFileSync(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);
const helpSource = readFileSync(
  new URL("../src/workflow-help-content.ts", import.meta.url),
  "utf8",
);

test("advanced artwork source readiness is distinct from assignment state", () => {
  assert.match(
    builderSource,
    /status\?\.state === "unchanged"[\s\S]*?ingest-artwork-source-ready-label[\s\S]*?Source ready/,
  );
  assert.match(
    builderSource,
    /This does not indicate an artwork assignment/,
  );
  assert.match(
    helpSource,
    /Source ready[\s\S]*?does not mean the artwork has been assigned/i,
  );
});

test("new advanced artwork assignments remain drafts until Apply assignment", () => {
  assert.match(
    builderSource,
    /const \[draftAssignment, setDraftAssignment\]/,
  );
  assert.match(
    builderSource,
    /New artwork assignment/,
  );
  assert.match(
    builderSource,
    /Not applied/,
  );
  assert.match(
    builderSource,
    /Apply assignment/,
  );
  assert.match(
    builderSource,
    />\s*Cancel\s*</,
  );
  assert.match(
    builderSource,
    /artworkAssignments:\s*\[\s*\.\.\.asset\.artworkAssignments,\s*draftAssignment,/,
  );
  assert.match(
    helpSource,
    /opens an unapplied draft[\s\S]*?Apply assignment[\s\S]*?Cancel/i,
  );
});

test("applying a new advanced artwork assignment produces a success toast", () => {
  assert.match(
    builderSource,
    /newlyAppliedAssignment[\s\S]*?!asset\.artworkAssignments\.some/,
  );
  assert.match(
    builderSource,
    /assigned: \$\{assignmentLabel\(newlyAppliedAssignment, tracks\)\}[\s\S]*?"success"/,
  );
});

test("track-level draft assignments require at least one included track", () => {
  assert.match(
    builderSource,
    /draftNeedsTrack[\s\S]*?draftAssignment\?\.scope === "track"[\s\S]*?trackSourceRelativePaths\.length === 0/,
  );
  assert.match(
    builderSource,
    /Select at least one available track before[\s\S]*?applying a track-level assignment/,
  );
});

test("explicit artwork draft controls have dedicated styling", () => {
  assert.match(
    styleSource,
    /\.ingest-artwork-assignment-draft\s*\{/,
  );
  assert.match(
    styleSource,
    /\.ingest-artwork-assignment-draft-actions\s*\{/,
  );
  assert.match(
    styleSource,
    /\.ingest-artwork-source-ready-label\s*\{/,
  );
});
