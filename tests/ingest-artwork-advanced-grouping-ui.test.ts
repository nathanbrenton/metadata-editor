import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const styleSource = readFileSync(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);
const helpSource = readFileSync(
  new URL("../src/workflow-help-content.ts", import.meta.url),
  "utf8",
);

test("advanced artwork sources are visually separated as distinct groups", () => {
  assert.match(
    styleSource,
    /\.ingest-artwork-advanced-grid\s*\{[\s\S]*?gap:\s*0;/,
  );
  assert.match(
    styleSource,
    /\.ingest-artwork-advanced-item\s*\{[\s\S]*?border-top:\s*1px solid #3b454e;[\s\S]*?padding:\s*1\.2rem 0;/,
  );
  assert.match(
    styleSource,
    /\.ingest-artwork-advanced-item:first-child\s*\{[\s\S]*?border-top:\s*0;/,
  );
  assert.match(
    helpSource,
    /source-level dividers and spacing/i,
  );
});
