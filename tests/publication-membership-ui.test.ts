import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const serverSource = await readFile(
  new URL("../server/index.ts", import.meta.url),
  "utf8",
);
const fleetSource = await readFile(
  new URL("../server/publish-fleet.ts", import.meta.url),
  "utf8",
);
const helpSource = await readFile(
  new URL("../src/workflow-help-content.ts", import.meta.url),
  "utf8",
);
const helpViewSource = await readFile(
  new URL("../src/WorkflowHelpView.tsx", import.meta.url),
  "utf8",
);

test("Publish exposes guarded release-scoped unpublish instead of deployment-level partial selection", () => {
  assert.match(appSource, /Review unpublish/);
  assert.match(appSource, /UNPUBLISH_PUBLIC_RELEASE/);
  assert.match(appSource, /canonical Library release, masters, metadata, and private derivatives remain unchanged/i);
  assert.match(serverSource, /\/api\/publish\/unpublish-plan/);
  assert.match(serverSource, /\/api\/publish\/unpublish/);
});

test("fleet surfaces public catalog members missing from the active Library without auto-deleting them", () => {
  assert.match(fleetSource, /publicationState: "published-only"/);
  assert.match(fleetSource, /libraryPresent: false/);
  assert.match(appSource, /Published-only/);
  assert.match(appSource, /will never remove them automatically/i);
});

test("Workflow Help documents unpublish and track-removal propagation", () => {
  assert.match(helpSource, /How do I remove a release from the public catalog without deleting the Library release\?/);
  assert.match(helpSource, /What does Published-only mean in the Publish fleet\?/);
  assert.match(helpSource, /If I remove a track from a Library release, how does that disappear from the website\?/);
  assert.match(helpViewSource, /How do I remove a release from the public catalog\?/);
  assert.match(helpViewSource, /What does Published-only mean\?/);
});
