import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const app = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const styles = await readFile(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);
const help = await readFile(
  new URL("../src/workflow-help-content.ts", import.meta.url),
  "utf8",
);

test("Live elevates release-level removals before deployment", () => {
  assert.match(app, /const liveLeavingReleaseIds/);
  assert.match(app, /change\.action !== "remove"/);
  assert.match(app, /\^releases\\\/\(\[\^\/\]\+\)/);
  assert.match(app, /!workspaceReleases\.some/);
  assert.match(app, /<span>Leaving Live<\/span>/);
  assert.match(app, /aria-label="Releases leaving Live"/);
  assert.match(app, /Review before deploy/);
  assert.match(app, /No removal has been performed by Check Live/);
  assert.match(styles, /\.publish-live-leaving-alert/);
  assert.match(help, /release-level Leaving Live warning/);
});

test("publication review rows expose release dates and Web Package terminology", () => {
  assert.match(app, /className="publish-release-date"/);
  assert.match(app, /\{libraryReleaseSortDate\(release\)\}/);
  assert.match(app, /Ready Check result/);
  assert.match(app, /Remove from Web Package/);
  assert.match(app, /<dt>Web Package<\/dt>/);
  assert.doesNotMatch(app, />Preflight result</);
  assert.doesNotMatch(app, /\? "Unpublish"/);
  assert.match(help, /Make Public after Ready Check passes/);
  assert.match(help, /choose Make Private/);
});

test("publication review separates preparation selection from membership and keeps Live release-oriented", () => {
  assert.match(app, /const showBatchPreparationControls/);
  assert.match(app, /batchPreparationEligibleReleaseIds\.has\(release\.id\)/);
  assert.match(app, />\s*Media prep\s*<\/th>/);
  assert.match(app, /aria-label="No preparation needed"/);
  assert.match(app, /return \{ label: "Current", tone: "success" \}/);
  assert.match(app, /deploymentSyncPlan\?\.status === "changes"[\s\S]*?"Changes ready"/);
  assert.match(app, /mode === "production"[\s\S]*?"Refresh Web Package"/);
  assert.doesNotMatch(app, /summary\.changeCount\} file changes/);
  assert.match(help, /A labeled Media prep column appears only when/);
  assert.match(help, /Refresh Web Package in Live/);
});
