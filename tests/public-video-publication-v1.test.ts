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

test("public package contract v3 plans sanitized video metadata and HLS resources", () => {
  assert.match(planSource, /name: "audio-player-public-package";\s*version: 3;/);
  assert.match(planSource, /videoResources: \{/);
  assert.match(planSource, /\| "video-metadata"/);
  assert.match(planSource, /\| "video-stream-manifest"/);
  assert.match(planSource, /\| "video-stream-init"/);
  assert.match(planSource, /\| "video-stream-segment"/);
  assert.match(planSource, /code: "video-web-stream-not-current"/);
  assert.match(planSource, /"videos",\s*video\.id/);
  assert.match(planSource, /"video\.json"/);
  assert.match(planSource, /videoStreams: \{/);
});

test("publisher generates video.json, relates it from release.json, and excludes canonical video internals", () => {
  assert.match(writerSource, /const videoMetadataFilename = "video\.json"/);
  assert.match(writerSource, /name: "media-player-video"/);
  assert.match(writerSource, /relatedTrackId: video\.relatedTrackId/);
  assert.match(writerSource, /videos:\s*\(release\.videos \?\? \[\]\)\.map/);
  assert.match(writerSource, /lower\.startsWith\("video-master\."\)/);
  assert.match(writerSource, /"video\.toml"/);
  assert.match(writerSource, /videoStreamCount: reviewedPlan\.videoStreams\.currentCount/);
});

test("Publish UI separates audio and video preparation while batch preparation includes video HLS", () => {
  assert.match(appSource, /function canPrepareVideoPublishPlan/);
  assert.match(appSource, /const prepareVideoRelease = useCallback\(async/);
  assert.match(appSource, /\/api\/publish\/prepare-video/);
  assert.match(appSource, /Prepare video streams/);
  assert.match(appSource, /Video stream/);
  assert.match(appSource, /Video \$\{prepareProgress\.videoIndex\} of/);

  assert.match(serverSource, /const videoNeedsPreparation =/);
  assert.match(serverSource, /buildVideoWebStreamPlan/);
  assert.match(serverSource, /prepareReleaseVideoWebStreams/);
  assert.match(serverSource, /videoReceipt/);
});

test("documentation records public video publication while keeping canonical masters private", () => {
  assert.match(helpSource, /public-package contract v3 publishes only sanitized video\.json/);
  assert.match(helpSource, /Prepare video streams/);
  assert.match(readmeSource, /Publish contract v3 plans a host-ready audio\/video layout/);
  assert.match(readmeSource, /videos\/<video-id>\//);
  assert.match(readmeSource, /private `stream-info\.json` preparation sidecars/);
});
