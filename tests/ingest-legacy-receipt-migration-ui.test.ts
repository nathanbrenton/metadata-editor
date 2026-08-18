import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [builderSource, serverSource, sharedSource] = await Promise.all([
  readFile(new URL("../src/IngestReleaseBuilder.tsx", import.meta.url), "utf8"),
  readFile(new URL("../server/index.ts", import.meta.url), "utf8"),
  readFile(new URL("../shared/ingest-builder.ts", import.meta.url), "utf8"),
]);

test("legacy staging releases expose one guarded receipt migration action before update preview", () => {
  assert.match(sharedSource, /legacyReceiptMigration\?:/);
  assert.match(builderSource, /Migrate legacy receipt/);
  assert.match(builderSource, /expectedFingerprint: migration\.fingerprint/);
  assert.match(builderSource, /setGuidedStep\(4\)/);
  assert.match(builderSource, /targetStatus\?\.legacyReceiptMigration\?\.required === true/);
  assert.match(serverSource, /\/api\/ingest\/migrate-legacy-receipt/);
  assert.match(serverSource, /executeLegacyIngestReceiptMigration/);
});

test("already-migrated legacy releases expose a guarded artwork-baseline repair when canonical artwork was omitted", () => {
  assert.match(sharedSource, /legacyArtworkReceiptRepair\?:/);
  assert.match(builderSource, /Baseline current Library artwork/);
  assert.match(builderSource, /expectedFingerprint: repair\.fingerprint/);
  assert.match(builderSource, /Confirm the intended artwork replacement to continue/);
  assert.match(serverSource, /\/api\/ingest\/repair-legacy-artwork-receipt/);
  assert.match(serverSource, /executeLegacyArtworkReceiptRepair/);
});
