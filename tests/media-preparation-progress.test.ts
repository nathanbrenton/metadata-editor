import assert from "node:assert/strict";
import test from "node:test";

import {
  forgetMediaPreparationProgress,
  readMediaPreparationProgress,
  recordMediaPreparationProgress,
  scheduleMediaPreparationProgressCleanup,
} from "../server/media-processing/progress.js";

const progress = {
  operationId: "media-preparation-test",
  releaseId: "2026-08-09_release",
  status: "running" as const,
  phase: "waveform-peaks" as const,
  message: "3. Example: generating waveform peaks…",
  completedUnits: 4,
  totalUnits: 12,
  trackCount: 4,
  trackId: "artist_03_example",
  trackLabel: "3. Example",
  trackIndex: 3,
  updatedAt: "2026-08-09T23:00:00.000Z",
};

test("stores isolated media-preparation progress snapshots", () => {
  recordMediaPreparationProgress(progress);

  const stored = readMediaPreparationProgress(
    progress.operationId,
  );
  assert.deepEqual(stored, progress);
  assert.notEqual(stored, progress);

  forgetMediaPreparationProgress(progress.operationId);
  assert.equal(
    readMediaPreparationProgress(progress.operationId),
    undefined,
  );
});

test("cleans terminal preparation progress after a bounded delay", async () => {
  recordMediaPreparationProgress({
    ...progress,
    operationId: "media-preparation-cleanup-test",
  });
  scheduleMediaPreparationProgressCleanup(
    "media-preparation-cleanup-test",
    5,
  );

  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(
    readMediaPreparationProgress(
      "media-preparation-cleanup-test",
    ),
    undefined,
  );
});
