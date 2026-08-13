import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const builderSource = readFileSync(
  new URL("../src/IngestReleaseBuilder.tsx", import.meta.url),
  "utf8",
);
const helpSource = readFileSync(
  new URL("../src/workflow-help-content.ts", import.meta.url),
  "utf8",
);

test("advanced artwork keeps preserved Library tracks targetable", () => {
  assert.match(
    builderSource,
    /existingTracks: IngestStagingTargetStatus\["existingTracks"\]/,
  );
  assert.match(
    builderSource,
    /existingTrackSourcePaths\.has\([\s\S]*?track\.sourceRelativePath/,
  );
  assert.match(
    builderSource,
    /!track\.include[\s\S]*?!existingLibraryTrack/,
  );
  assert.match(
    builderSource,
    /Existing Library track preserved in this update; it remains available for artwork assignment/,
  );
  assert.match(
    builderSource,
    /" · Existing Library"/,
  );
  assert.match(
    builderSource,
    /existingTracks=\{existingTracks\}/,
  );
  assert.match(
    helpSource,
    /preserved existing Library tracks remain selectable/i,
  );
});

test("advanced artwork still disables excluded candidate-only tracks", () => {
  assert.match(
    builderSource,
    /const trackDisabled =[\s\S]*?disabled[\s\S]*?!track\.include[\s\S]*?!existingLibraryTrack/,
  );
});
