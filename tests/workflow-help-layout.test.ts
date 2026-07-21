import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const viewSource = readFileSync(
  new URL("../src/WorkflowHelpView.tsx", import.meta.url),
  "utf8",
);
const styleSource = readFileSync(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);

test("uses desktop-first tables instead of workflow card grids", () => {
  assert.match(viewSource, /workflow-stage-table/);
  assert.match(viewSource, /Adjustment|Operator steps/);
  assert.doesNotMatch(viewSource, /workflow-stage-card/);
  assert.match(
    styleSource,
    /\.workflow-stage-table\s*\{[^}]*min-width:\s*82rem/s,
  );
  assert.match(
    styleSource,
    /\.workflow-table-scroll\s*\{[^}]*overflow-x:\s*auto/s,
  );
});
