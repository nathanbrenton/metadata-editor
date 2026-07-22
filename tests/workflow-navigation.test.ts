import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const navigationSource = readFileSync(
  new URL("../src/WorkflowNavigation.tsx", import.meta.url),
  "utf8",
);
const styleSource = readFileSync(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);

test("defines the four primary workflow tabs in lifecycle order", () => {
  const orderedIds = Array.from(
    navigationSource.matchAll(/id: "(ingest|staging|library|publish)"/g),
    (match) => match[1],
  );

  assert.deepEqual(orderedIds, [
    "ingest",
    "staging",
    "library",
    "publish",
  ]);
  assert.match(navigationSource, /step: 1/);
  assert.match(navigationSource, /step: 2/);
  assert.match(navigationSource, /step: 3/);
  assert.match(navigationSource, /step: 4/);
});

test("uses workflow tabs instead of a standalone header ingest action", () => {
  assert.match(appSource, /<WorkflowNavigation/);
  assert.doesNotMatch(
    appSource,
    /className="primary-button"[\s\S]{0,240}>\s*Ingest\s*</,
  );
  assert.match(navigationSource, /Find and inspect source assets/);
  assert.match(navigationSource, /Build or update a release workspace/);
  assert.match(navigationSource, /Author metadata and prepare media/);
  assert.match(navigationSource, /Preflight and deploy releases/);
});

test("keeps Tag Search outside the primary four-step workflow", () => {
  assert.doesNotMatch(navigationSource, /Tag Search/);
  assert.match(appSource, /Open Tag Search/);
  assert.match(appSource, /Metadata Reference/);
});

test("renders desktop-first staging and publish workspaces", () => {
  assert.match(appSource, /function StagingWorkspace/);
  assert.match(appSource, /function PublishWorkspace/);
  assert.match(appSource, /Existing release workspaces/);
  assert.match(appSource, /Release readiness overview/);
  assert.match(
    styleSource,
    /\.application-tabs\.workflow-navigation\s*\{[\s\S]*grid-template-columns:\s*repeat\(4,/,
  );
  assert.match(
    styleSource,
    /\.publish-readiness-table\s*\{[\s\S]*min-width:\s*104rem/,
  );
});


test("moves tab-specific summaries into the sticky footer", () => {
  assert.match(appSource, /const footerSummary = useMemo/);
  assert.match(appSource, /Drop point \$\{ingestScan\.configuredRoot\}/);
  assert.match(appSource, /ffprobe \$\{/);
  assert.match(appSource, /MediaInfo \$\{/);
  assert.match(appSource, /publishing disabled/);
  assert.match(appSource, /className="footer-summary"/);
  assert.doesNotMatch(appSource, />\s*Drop summary\s*</);
  assert.doesNotMatch(appSource, /ingest-safety-banner/);
  assert.match(
    styleSource,
    /\.footer-summary\s*\{[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s,
  );
});
