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

test("opens Publish preflight from the whole release row without an action column", () => {
  const workspaceStart = appSource.indexOf(
    "function PublishWorkspace",
  );
  const workspaceEnd = appSource.indexOf(
    "function IngestView",
    workspaceStart,
  );

  assert.notEqual(workspaceStart, -1);
  assert.notEqual(workspaceEnd, -1);

  const publishWorkspaceSource = appSource.slice(
    workspaceStart,
    workspaceEnd,
  );

  const overviewStart = publishWorkspaceSource.indexOf(
    "<h3>Release readiness overview</h3>",
  );
  const overviewEnd = publishWorkspaceSource.indexOf(
    "{selectedPlan && (",
    overviewStart,
  );

  assert.notEqual(overviewStart, -1);
  assert.notEqual(overviewEnd, -1);

  const readinessOverviewSource =
    publishWorkspaceSource.slice(
      overviewStart,
      overviewEnd,
    );

  assert.match(
    readinessOverviewSource,
    /"publish-release-row"/,
  );
  assert.match(
    readinessOverviewSource,
    /loadPublishPlan\(release\.id\)/,
  );
  assert.match(
    readinessOverviewSource,
    /event\.key === "Enter"/,
  );
  assert.match(
    readinessOverviewSource,
    /event\.key === " "/,
  );
  assert.doesNotMatch(
    readinessOverviewSource,
    /<th[^>]*>Next step<\/th>/,
  );
  assert.doesNotMatch(
    readinessOverviewSource,
    /Continue to preflight/,
  );
});

test("renders Publish preflight in the reusable wide modal", () => {
  assert.match(appSource, /title=\{`Publish preflight ·/);
  assert.match(appSource, /variant="wide"/);
  assert.match(appSource, /closeDisabled=\{prepareLoading \|\| publishLoading\}/);
  assert.match(appSource, /publish-plan-panel publish-plan-modal/);
  assert.match(stylesSource, /metadata-field-modal--wide/);
});

test("modal supports Escape close, upper-right close, backdrop close, and focus return", () => {
  assert.match(appSource, /event\.key === "Escape"/);
  assert.match(appSource, /metadata-field-modal-close/);
  assert.match(appSource, /event\.target ===[\s\S]*?event\.currentTarget/);
  assert.match(appSource, /previousFocusRef\.current\?\.focus\(\)/);
});

test("Workflow and Help documents the modal Publish interaction", () => {
  assert.match(helpSource, /whole row opens preflight/);
  assert.match(helpSource, /wide modal/);
  assert.match(helpSource, /closes with Escape/);
  assert.match(helpSource, /returns keyboard focus/);
});
