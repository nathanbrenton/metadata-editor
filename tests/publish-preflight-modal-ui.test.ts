import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const stylesSource = readFileSync(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);
const helpSource = readFileSync(
  new URL("../src/workflow-help-content.ts", import.meta.url),
  "utf8",
);

test("opens Web Package review from explicit visibility and package controls instead of the whole row", () => {
  const tableStart = appSource.indexOf(
    '<table className="workflow-workspace-table publish-readiness-table">',
  );
  const tableEnd = appSource.indexOf("<details", tableStart);

  assert.notEqual(tableStart, -1);
  assert.notEqual(tableEnd, -1);

  const table = appSource.slice(tableStart, tableEnd);

  assert.match(table, /role="switch"/);
  assert.match(table, /Review package/);
  assert.match(
    table,
    /openPublishPlan\(release\.id, "package"\)/,
  );
  assert.match(table, /"make-private"/);
  assert.match(table, /"make-public"/);
  assert.doesNotMatch(
    table,
    /onClick=\{\(\) => \{\s*if \(mode === "public-package"[\s\S]*?loadPublishPlan\(release\.id\)/,
  );
});

test("renders directional Web Package review in the reusable wide modal", () => {
  assert.match(appSource, /<MetadataFieldModal/);
  assert.match(appSource, /selectedPlanIntent === "make-public"/);
  assert.match(appSource, /"Review before making public"/);
  assert.match(appSource, /selectedPlanIntent === "make-private"/);
  assert.match(appSource, /"Review before making private"/);
  assert.match(appSource, /"Web Package Ready Check"/);
  assert.match(appSource, /setSelectedPlanIntent\("package"\)/);
});

test("modal supports Escape close, upper-right close, backdrop close, and focus return", () => {
  assert.match(appSource, /event\.key === "Escape"/);
  assert.match(appSource, /metadata-field-modal-close/);
  assert.match(appSource, /event\.target ===[\s\S]*?event\.currentTarget/);
  assert.match(appSource, /previousFocusRef\.current\?\.focus\(\)/);
});

test("Workflow and Help documents the modal Publish interaction", () => {
  assert.match(helpSource, /visibility slider or Package Status review opens Ready Check/);
  assert.match(helpSource, /wide modal/);
  assert.match(helpSource, /closes with Escape/);
  assert.match(helpSource, /returns keyboard focus/);
});
