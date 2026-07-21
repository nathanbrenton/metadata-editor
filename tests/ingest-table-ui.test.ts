import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const styleSource = readFileSync(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);

test("presents ingest candidates and inspection data as semantic tables", () => {
  assert.match(
    appSource,
    /function IngestCandidateTable\(/,
  );
  assert.match(
    appSource,
    /className="ingest-table ingest-candidate-table"/,
  );
  assert.match(
    appSource,
    /className="ingest-table ingest-evidence-table"/,
  );
  assert.match(
    appSource,
    /className="ingest-table ingest-source-table"/,
  );
  assert.match(
    appSource,
    /<th scope="col">Inference confidence<\/th>/,
  );
  assert.doesNotMatch(
    appSource,
    /function IngestCandidateCard\(/,
  );
});

test("keeps wide ingest tables scrollable with a sticky identity column", () => {
  assert.match(
    styleSource,
    /\.ingest-table-scroll\s*\{[^}]*overflow-x:\s*auto;/s,
  );
  assert.match(
    styleSource,
    /\.ingest-sticky-column\s*\{[^}]*position:\s*sticky;[^}]*left:\s*0;/s,
  );
});

test("makes each ingest candidate row mouse and keyboard actionable", () => {
  assert.match(
    appSource,
    /className={`ingest-candidate-row\$\{/,
  );
  assert.match(
    appSource,
    /tabIndex=\{disabled \? -1 : 0\}/,
  );
  assert.match(
    appSource,
    /aria-label={`Inspect \$\{candidate\.displayTitle\}`}/,
  );
  assert.match(
    appSource,
    /event\.key === "Enter"[\s\S]*event\.key === " "/,
  );
  assert.match(
    appSource,
    /event\.stopPropagation\(\);[\s\S]*onInspect\(candidate\.id\);/,
  );
  assert.match(
    styleSource,
    /\.ingest-candidate-row:not\(\.is-disabled\)\s*\{[^}]*cursor:\s*pointer;/s,
  );
  assert.match(
    styleSource,
    /\.ingest-candidate-row:not\(\.is-disabled\):focus-visible\s*>\s*th,/,
  );
});
