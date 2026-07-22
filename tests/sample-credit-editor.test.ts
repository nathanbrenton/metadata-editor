import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);

const sampleEditorSource = readFileSync(
  new URL("../src/SampleRecordEditors.tsx", import.meta.url),
  "utf8",
);

test("routes structured sample relationships to Artists, Performers & Writers", () => {
  assert.match(
    appSource,
    /group ===\s*"Samples & Interpolations"[\s\S]*<LazySampleRelationshipRecordEditor/,
  );
  assert.match(
    appSource,
    /activeMetadataTab === "credits"[\s\S]*supportsSampleRelationshipRecords/,
  );
});

test("routes private sample clearance to Label, Publishing & Copyright", () => {
  assert.match(
    appSource,
    /group ===\s*"Sample Clearance"[\s\S]*<LazySampleClearanceRecordEditor/,
  );
  assert.match(
    appSource,
    /activeMetadataTab === "rights"[\s\S]*supportsSampleClearanceRecords/,
  );
  assert.match(appSource, /Editor-only administrative data/);
});

test("does not create release-level blanket sample inheritance", () => {
  assert.match(
    appSource,
    /supportsSampleRelationshipRecords =\s*activeMetadataTab === "credits" &&\s*document\.scope === "track"/,
  );
});


test("lazy-loads form-heavy sample editors outside the initial bundle", () => {
  assert.match(
    appSource,
    /lazy\(async \(\) =>[\s\S]*import\([\s\S]*SampleRecordEditors\.js/,
  );
  assert.match(
    sampleEditorSource,
    /export function SampleRelationshipRecordEditor/,
  );
  assert.match(
    sampleEditorSource,
    /export function SampleClearanceRecordEditor/,
  );
  assert.doesNotMatch(
    appSource,
    /function SampleRelationshipRecordEditor\(/,
  );
});
