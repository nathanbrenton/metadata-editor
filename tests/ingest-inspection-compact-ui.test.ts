import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const styleSource = await readFile(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);

test("keeps candidate readiness inside the Candidate Inspection header", () => {
  const start = appSource.indexOf(
    '<header\n        className="ingest-view-header ingest-inspection-header"',
  );
  const end = appSource.indexOf("</header>", start);

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  const header = appSource.slice(start, end);
  assert.match(header, /ingest-candidate-health/);
  assert.match(header, /Ingest readiness:/);
  assert.doesNotMatch(appSource, /ingest-readiness-feedback/);
  assert.match(
    styleSource,
    /\.ingest-inspection-header\s*\{[\s\S]*?grid-template-columns:/,
  );
});

test("gives Target release its own compact card before Inferred metadata", () => {
  const target = appSource.indexOf(
    "ingest-target-release-card",
  );
  const inferred = appSource.indexOf(
    'id="candidate-evidence-heading"',
  );

  assert.ok(target >= 0);
  assert.ok(inferred > target);
  assert.match(appSource, /className="hover-help-label"/);
  assert.match(appSource, /New release suggested/);
  assert.match(appSource, /ingest-target-suggested-badge/);
});

test("sorts Ingest source files by Name by default with useful alternatives", () => {
  assert.match(
    appSource,
    /useState<IngestSourceSort>\("name"\)/,
  );
  assert.match(appSource, /<option value="name">Name<\/option>/);
  assert.match(appSource, /<option value="type">Type<\/option>/);
  assert.match(appSource, /Size · largest/);
  assert.match(appSource, /Size · smallest/);
  assert.match(appSource, /Duration · longest/);
  assert.match(appSource, /sortedSourceFiles\.map/);
});
