import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);

test("removes Workflow & Help cards from hamburger menus while preserving the guide itself", () => {
  assert.doesNotMatch(
    appSource,
    /className="menu-card workflow-menu-card"/,
  );
  assert.match(appSource, /LazyWorkflowHelpView/);
  assert.match(appSource, /Workflow &amp; Help/);
});


test("removes global Metadata Reference cards from both hamburger menus", () => {
  assert.doesNotMatch(
    appSource,
    /<h2>Metadata Reference<\/h2>/,
  );
  assert.doesNotMatch(
    appSource,
    /Open Tag Search/,
  );
});
