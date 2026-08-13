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

test("Staging Build shows the final resulting track set during updates", () => {
  assert.match(
    builderSource,
    /const preservedExistingTracks =[^;]*[\s\S]*?operation === "update"/,
  );
  assert.match(
    builderSource,
    /const resultingTrackCount =[\s\S]*?includedTracks\.length[\s\S]*?preservedExistingTracks\.length/,
  );
  assert.match(
    builderSource,
    /const reviewTrackOrder =[\s\S]*?kind: "preserved" as const[\s\S]*?kind: "candidate" as const/,
  );
  assert.match(
    builderSource,
    /tracks total · \$\{newCandidateTrackCount\} new · \$\{preservedExistingTracks\.length\} preserved/,
  );
  assert.match(
    builderSource,
    /className="ingest-review-track-row--preserved"/,
  );
  assert.match(
    builderSource,
    /Existing Library source/,
  );
  assert.match(
    builderSource,
    /<span className="badge complete">\s*Preserved\s*<\/span>/,
  );
  assert.match(
    builderSource,
    /candidateExistingTrack[\s\S]*?"Existing Library"[\s\S]*?"New"/,
  );
  assert.match(
    builderSource,
    /candidateExistingTrack && \([\s\S]*?Modified/,
  );
});

test("preserved Review rows are visually de-emphasized and provenance is visible", () => {
  assert.match(
    styleSource,
    /\.ingest-review-track-row--preserved\s*\{[\s\S]*?background:/,
  );
  assert.match(
    styleSource,
    /\.ingest-review-track-provenance\s*\{/,
  );
});

test("Workflow & Help documents final-state provenance for existing-release updates", () => {
  assert.match(
    helpSource,
    /final resulting track set/i,
  );
  assert.match(
    helpSource,
    /Existing Library \/ Preserved/,
  );
  assert.match(
    helpSource,
    /Existing Library \/ Modified/,
  );
});
