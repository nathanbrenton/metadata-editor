import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const planSource = readFileSync(
  new URL("../server/publish-plan.ts", import.meta.url),
  "utf8",
);
const writerSource = readFileSync(
  new URL("../server/publish-writer.ts", import.meta.url),
  "utf8",
);
const serverSource = readFileSync(
  new URL("../server/index.ts", import.meta.url),
  "utf8",
);
const appSource = readFileSync(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const helpSource = readFileSync(
  new URL("../src/workflow-help-content.ts", import.meta.url),
  "utf8",
);
const readmeSource = readFileSync(
  new URL("../README.md", import.meta.url),
  "utf8",
);

test("public package contract v6 plans ordered video metadata, poster, and HLS resources", () => {
  assert.match(planSource, /name: "audio-player-public-package";\s*version: 6;/);
  assert.match(planSource, /videoResources: \{/);
  assert.match(planSource, /poster: \{/);
  assert.match(planSource, /relativePath: "stream\/poster\.png"/);
  assert.match(planSource, /\| "video-metadata"/);
  assert.match(planSource, /\| "video-poster"/);
  assert.match(planSource, /\| "video-stream-manifest"/);
  assert.match(planSource, /\| "video-stream-init"/);
  assert.match(planSource, /\| "video-stream-segment"/);
  assert.match(planSource, /code: "video-web-stream-not-current"/);
  assert.match(planSource, /"videos",\s*video\.id/);
  assert.match(planSource, /"video\.json"/);
  assert.match(planSource, /videoStreams: \{/);
});

test("publisher generates richer video.json with poster and excludes canonical video internals", () => {
  assert.match(writerSource, /const videoMetadataFilename = "video\.json"/);
  assert.match(writerSource, /name: "media-player-video"/);
  assert.match(writerSource, /version: 3/);
  assert.match(writerSource, /description: video\.description/);
  assert.match(writerSource, /location: video\.location/);
  assert.match(writerSource, /director: video\.director/);
  assert.match(writerSource, /cameraOperator: video\.cameraOperator/);
  assert.match(writerSource, /displayOrder: video\.displayOrder/);
  assert.match(writerSource, /posterTimeSeconds/);
  assert.match(writerSource, /relatedTrackId: video\.relatedTrackId/);
  assert.match(writerSource, /poster: \{/);
  assert.match(writerSource, /videoResources\.poster\.relativePath/);
  assert.match(writerSource, /videos:\s*\[\.\.\.selectedVideos\(plan, release\)\]/);
  assert.match(writerSource, /plan\.publicSelection\.includeVideo/);
  assert.match(writerSource, /left\.displayOrder/);
  assert.match(writerSource, /lower\.startsWith\("video-master\."\)/);
  assert.match(writerSource, /"video\.toml"/);
  assert.match(writerSource, /videoStreamCount: reviewedPlan\.videoStreams\.currentCount/);
});

test("Publish UI prepares video media while batch preparation includes poster-aware video HLS", () => {
  assert.match(appSource, /function canPrepareVideoPublishPlan/);
  assert.match(appSource, /const prepareVideoRelease = useCallback\(async/);
  assert.match(appSource, /\/api\/publish\/prepare-video/);
  assert.match(appSource, /Prepare video media/);
  assert.match(appSource, /video HLS/);
  assert.match(appSource, /with poster/);
  assert.match(appSource, /Video \$\{prepareProgress\.videoIndex\} of/);

  assert.match(serverSource, /const videoNeedsPreparation =/);
  assert.match(serverSource, /buildVideoWebStreamPlan/);
  assert.match(serverSource, /prepareReleaseVideoWebStreams/);
  assert.match(serverSource, /videoReceipt/);
});

test("documentation records public video presentation resources while canonical masters stay private", () => {
  assert.match(helpSource, /public-package contract v6 publishes ordered sanitized video\.json, poster\.png/);
  assert.match(helpSource, /Prepare video media/);
  assert.match(readmeSource, /Publish contract v6 plans a host-ready audio\/video layout/);
  assert.match(readmeSource, /videos\/<video-id>\//);
  assert.match(readmeSource, /poster\.png/);
  assert.match(readmeSource, /private `stream-info\.json` preparation sidecars/);
});
