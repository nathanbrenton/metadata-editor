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
const prepareSource = readFileSync(
  new URL("../server/media-processing/prepare.ts", import.meta.url),
  "utf8",
);
const videoPrepareSource = readFileSync(
  new URL("../server/media-processing/video-prepare.ts", import.meta.url),
  "utf8",
);
const serverSource = readFileSync(
  new URL("../server/index.ts", import.meta.url),
  "utf8",
);
const scannerSource = readFileSync(
  new URL("../server/scanner.ts", import.meta.url),
  "utf8",
);
const appSource = readFileSync(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const deploymentSource = readFileSync(
  new URL("../server/published-media-deployment.ts", import.meta.url),
  "utf8",
);
const publishOperationsSource = readFileSync(
  new URL("../server/publish-operations.ts", import.meta.url),
  "utf8",
);
const publicationJunkSource = readFileSync(
  new URL("../server/publication-junk.ts", import.meta.url),
  "utf8",
);

test("public selection gates publish planning and complete-snapshot writing", () => {
  assert.match(planSource, /readReleasePublicationSettings/);
  assert.match(planSource, /includedTrackIds = new Set/);
  assert.match(planSource, /publicationSettings\.includeVideo/);
  assert.match(planSource, /selectedDerivativeItems/);
  assert.match(planSource, /selectedWebStreamItems/);
  assert.match(planSource, /includedVideoIds/);
  assert.match(writerSource, /selectedTracks\(plan, release\)/);
  assert.match(writerSource, /selectedVideos\(plan, release\)/);
  assert.match(writerSource, /publicReleaseMetadata\(/);
});

test("Ready Check persists public selection through the guarded release-settings API", () => {
  assert.match(serverSource, /\/api\/publish\/release-settings/);
  assert.match(serverSource, /saveReleasePublicationSettings/);
  assert.match(appSource, /savePublicationSelection/);
  assert.match(appSource, /Public media selection/);
  assert.match(appSource, /Include video assets in Web Package/);
  assert.match(appSource, /includedTrackIds/);
  assert.match(scannerSource, /readTrackLibraryIdentity/);
  assert.match(scannerSource, /trackNumber/);
  assert.match(scannerSource, /discNumber/);
  assert.match(appSource, /publicTrackSelectionLabel/);
  assert.match(appSource, /track\.title/);
});

test("publication preparation scopes expensive work to selected public members", () => {
  assert.match(prepareSource, /reviewedPlan\.publicSelection\.includedTrackIds/);
  assert.match(prepareSource, /preparationTrackIds/);
  assert.match(videoPrepareSource, /includedVideoIds\?: string\[\]/);
  assert.match(videoPrepareSource, /selectedItems/);
  assert.match(serverSource, /plan\.publicSelection\.includedVideoIds/);
});

test("deployment snapshots and package integrity share the same junk exclusion rule", () => {
  assert.match(deploymentSource, /isIgnoredPublicationJunk/);
  assert.match(publishOperationsSource, /isIgnoredPublicationJunk/);
  assert.match(publicationJunkSource, /Thumbs\.db/);
  assert.match(publicationJunkSource, /__MACOSX/);
  assert.match(publicationJunkSource, /basename\.startsWith\("\._"\)/);
  assert.match(publicationJunkSource, /basename\.endsWith\("~"\)/);
  assert.match(publicationJunkSource, /\\\.sw\[opx\]/);
  assert.match(publicationJunkSource, /segments\.some/);
});
