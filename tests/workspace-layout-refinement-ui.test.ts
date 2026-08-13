import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const styles = await readFile(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);
const helpSource = await readFile(
  new URL("../src/workflow-help-content.ts", import.meta.url),
  "utf8",
);

test("visually integrates the workflow navigation with the application header", () => {
  assert.match(styles, /\.page-header ~ \.workflow-navigation-region/);
  assert.match(
    styles,
    /\.page-header ~ \.workflow-navigation-region \.application-tabs\.workflow-navigation/,
  );
});

test("Staging uses artwork-first rows with hover paths and compact readiness workflow columns", () => {
  assert.match(appSource, /staging-artwork-column/);
  assert.match(appSource, /staging-release-artwork/);
  assert.match(appSource, /Library path: \$\{release\.relativePath\}/);
  assert.match(appSource, /<th scope="col">Metadata<\/th>/);
  assert.match(appSource, /<th scope="col">Update mode<\/th>/);
  const stagingTableStart = appSource.indexOf(
    '<table className="workflow-workspace-table staging-release-table">',
  );
  assert.notEqual(stagingTableStart, -1);

  const stagingTableEnd = appSource.indexOf(
    "</table>",
    stagingTableStart,
  );
  assert.notEqual(stagingTableEnd, -1);

  const stagingTableSource = appSource.slice(
    stagingTableStart,
    stagingTableEnd,
  );

  assert.doesNotMatch(
    stagingTableSource,
    /<th scope="col" className="action-column">/,
  );
  assert.match(appSource, /className="staging-release-row staging-release-row--clickable"/);
  assert.match(appSource, /onClick=\{\(\) =>[\s\S]*?setSelectedBuildReleaseId\(release\.id\)/);
});

test("Library persists sorting and uses icon view controls with columnar rows", () => {
  assert.match(appSource, /metadata-editor\.library-release-sort/);
  assert.match(appSource, /Sort by/);
  assert.match(appSource, /LibraryReleaseViewIcon/);
  assert.match(appSource, /sortedReleases\.map/);
  assert.match(styles, /\.library-release-list--rows \.release-summary/);
  assert.match(styles, /grid-template-columns:[\s\S]*?minmax\(11rem, 1\.2fr\)/);
});

test("Publish labels the release table concisely", () => {
  assert.match(appSource, /<header className="publish-release-list-header">/);
  assert.match(appSource, /Included in Web Package/);
  assert.doesNotMatch(appSource, /<h3>Release readiness overview<\/h3>/);
});

test("footer stays in normal page flow", () => {
  const refinementStart = styles.indexOf(
    "/* Workspace layout refinement: integrated header, staging rows, library controls, flow footer */",
  );
  assert.notEqual(refinementStart, -1);
  const refinement = styles.slice(refinementStart);

  assert.match(refinement, /\.app-footer\s*\{[\s\S]*?position:\s*static/);
  assert.match(appSource, /<footer className="app-footer">/);
});
