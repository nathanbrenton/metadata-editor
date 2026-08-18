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

test("Live promotes deployment destination ahead of status details", () => {
  const destinationIndex = appSource.indexOf(
    'aria-labelledby="live-deployment-destination-heading"',
  );
  const statusIndex = appSource.indexOf(
    'className="publish-deployment-overview-header"',
  );

  assert.notEqual(destinationIndex, -1);
  assert.notEqual(statusIndex, -1);
  assert.ok(
    destinationIndex < statusIndex,
    "Deployment destination should appear before Live status",
  );

  assert.doesNotMatch(
    appSource,
    /Local sandbox is the safe rehearsal target and supports browser deployment/,
  );
  assert.match(
    appSource,
    /<h3[\s\S]*?id="live-deployment-destination-heading"[\s\S]*?>[\s\S]*?Deployment destination[\s\S]*?<\/h3>/,
  );
  assert.match(
    appSource,
    /\{isSelected \? "Selected" : "Select"\}/,
  );
  assert.match(
    styles,
    /\.publish-deployment-profile-selector\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/,
  );
  assert.match(
    styles,
    /\.publish-deployment-profile-selector button\.active\s*\{[\s\S]*?border-color:\s*#7892a3;[\s\S]*?background:\s*#172128;/,
  );
  assert.doesNotMatch(
    styles,
    /\.publish-live-target-strip__copy\b/,
  );
  assert.doesNotMatch(
    styles,
    /\.publish-live-target-strip\s*\{[\s\S]*?margin-top:\s*0\.65rem;/,
  );
});
