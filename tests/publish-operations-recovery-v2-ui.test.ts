import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const app = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const server = await readFile(
  new URL("../server/index.ts", import.meta.url),
  "utf8",
);
const writer = await readFile(
  new URL("../server/publish-writer.ts", import.meta.url),
  "utf8",
);
const operations = await readFile(
  new URL("../server/publish-operations.ts", import.meta.url),
  "utf8",
);
const help = await readFile(
  new URL("../src/workflow-help-content.ts", import.meta.url),
  "utf8",
);

test("Publish writer journals v2 phases and verifies promoted package plus catalog", () => {
  assert.match(writer, /version:\s*2/);
  assert.match(writer, /phase:\s*"staging"/);
  for (const phase of [
    "validating",
    "backing-up-release",
    "promoting-release",
    "backing-up-catalog",
    "promoting-catalog",
    "verifying",
    "completed",
  ]) {
    assert.match(writer, new RegExp(`journal\\("${phase}"`));
  }
  assert.match(writer, /verifyPublishedPackageIntegrity/);
  assert.match(writer, /assertNoUnresolvedPublishOperation/);
  assert.match(operations, /publication-manifest\.json/);
  assert.match(operations, /Public catalog does not contain exactly one matching release entry/);
});

test("Publish API exposes operation history, guarded recovery, and sequential batch preparation", () => {
  assert.match(server, /\/api\/publish\/operations/);
  assert.match(server, /\/api\/publish\/recover/);
  assert.match(server, /\/api\/publish\/prepare-batch/);
  assert.match(server, /for \(const releaseId of releaseIds\)/);
  assert.match(server, /interrupted operation.*detected from a previous server instance/s);
});

test("Web Package UI surfaces interrupted operations and keeps package builds release-scoped", () => {
  assert.match(app, /Web Package history/);
  assert.match(app, /Interrupted/);
  assert.match(app, /Package build failed/);
  assert.match(app, /Verify & finalize/);
  assert.match(app, /Guarded rollback/);
  assert.match(app, /Prepare selected \(/);
  assert.match(app, /Web Package preparation remains per release/);
  assert.match(app, /Recover interrupted package build/);
});

test("Workflow Help documents journaled recovery and batch preparation boundaries", () => {
  assert.match(help, /Web Package Operations & Recovery v2/);
  assert.match(help, /server-instance identity/);
  assert.match(help, /guarded rollback/);
  assert.match(help, /sequential private derivative preparation/);
  assert.match(help, /public publishing remains deliberate and release-scoped/);
});
