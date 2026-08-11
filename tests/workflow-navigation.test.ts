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

test("keeps metadata reference contextual and outside the primary workflow", () => {
  assert.doesNotMatch(navigationSource, /Tag Search/);
  assert.doesNotMatch(appSource, /Open Tag Search/);
  assert.doesNotMatch(
    appSource,
    /<h2>Metadata Reference<\/h2>/,
  );
  assert.match(
    appSource,
    /className="metadata-field-control"/,
  );
  assert.match(
    appSource,
    /Help and field information for/,
  );
});

test("renders desktop-first staging and publish workspaces", () => {
  assert.match(appSource, /function StagingWorkspace/);
  assert.match(appSource, /function PublishWorkspace/);
  assert.match(appSource, /Existing release workspaces/);
  assert.match(appSource, /<h3>Releases<\/h3>/);
  assert.match(
    styleSource,
    /\.application-tabs\.workflow-navigation\s*\{[\s\S]*grid-template-columns:\s*repeat\(4,/,
  );
  assert.match(
    styleSource,
    /\.publish-readiness-table\s*\{[^}]*min-width:\s*55rem;[^}]*table-layout:\s*fixed;/s,
  );
});


test("keeps the footer summary limited to media storage totals", () => {
  assert.match(appSource, /const footerSummary = useMemo/);
  assert.match(appSource, /`Library \$\{/);
  assert.match(appSource, /`Published \$\{/);
  assert.match(appSource, /sizeBytes/);
  assert.match(appSource, /Metadata Tag Info/);
  assert.match(appSource, /className="footer-summary"/);
});
