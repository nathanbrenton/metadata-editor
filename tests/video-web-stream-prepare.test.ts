import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("guards video preparation with reviewed plans, isolated staging, validation, promotion, and rollback", async () => {
  const source = await readFile(
    new URL(
      "../server/media-processing/video-prepare.ts",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(source, /expectedPlanFingerprint/);
  assert.match(source, /planGeneratedAt/);
  assert.match(source, /The video preparation plan is stale/);
  assert.match(source, /\.metadata-editor-operations/);
  assert.match(source, /buildVideoWebStreamFfmpegArgs/);
  assert.match(source, /buildVideoPosterFfmpegArgs/);
  assert.match(source, /inspectVideoWebStreamDirectory/);
  assert.match(source, /buildVideoWebStreamVerificationArgs/);
  assert.match(source, /canonical video release changed/);
  assert.match(source, /post-promotion SHA-256 verification/);
  assert.match(source, /backups/);
  assert.match(source, /rollback-incomplete/);
  assert.match(source, /video-web-stream-hls/);
});

test("exposes read-only video planning and reviewed preparation endpoints", async () => {
  const source = await readFile(
    new URL("../server/index.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /"\/api\/publish\/video-plan"/);
  assert.match(source, /buildVideoWebStreamPlan/);
  assert.match(source, /"\/api\/publish\/prepare-video"/);
  assert.match(source, /prepareReleaseVideoWebStreams/);
  assert.match(source, /recordMediaPreparationProgress/);
});
