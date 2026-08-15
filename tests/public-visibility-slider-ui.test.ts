import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const app = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const membership = await readFile(
  new URL("../server/publication-membership.ts", import.meta.url),
  "utf8",
);
const help = await readFile(
  new URL("../src/workflow-help-content.ts", import.meta.url),
  "utf8",
);

test("Web Package visibility is an explicit slider with directional review", () => {
  assert.match(app, /role="switch"/);
  assert.match(app, /publish-visibility-switch/);
  assert.match(
    app,
    /aria-checked=\{webPackageMembership\.label === "Included"\}/,
  );
  assert.match(app, /Private \/ Local/);
  assert.match(app, /Review before making public/);
  assert.match(app, /Review before making private/);
  assert.match(app, /Make Public/);
  assert.match(app, /Make Private/);
  assert.match(
    app,
    /openPublishPlan\(\s*release\.id,[\s\S]*?"make-private"[\s\S]*?"make-public"/,
  );
  assert.match(
    app,
    /openPublishPlan\(release\.id, "package"\)/,
  );
});

test("release rows do not own visibility changes", () => {
  const tableStart = app.indexOf(
    '<table className="workflow-workspace-table publish-readiness-table">',
  );
  const historyStart = app.indexOf(
    '<details',
    tableStart,
  );
  assert.notEqual(tableStart, -1);
  assert.notEqual(historyStart, -1);

  const table = app.slice(tableStart, historyStart);
  assert.doesNotMatch(
    table,
    /onClick=\{\(\) => \{\s*if \(mode === "public-package"[\s\S]*?loadPublishPlan\(release\.id\)/,
  );
  assert.match(table, /role="switch"/);
  assert.match(table, /Review package/);
});

test("absence from catalog is private by default", () => {
  assert.match(
    membership,
    /if \(!catalog\) \{\s*return \[\];\s*\}/,
  );
  assert.match(
    help,
    /New Library releases remain Private \/ Local/,
  );
});
