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

test("keeps detailed ingest inference evidence collapsed by default", () => {
  assert.match(
    appSource,
    /<details className="ingest-evidence-disclosure">[\s\S]*?<summary>[\s\S]*?Inference evidence[\s\S]*?<IngestEvidenceTable/,
  );
  assert.doesNotMatch(
    appSource,
    /<details className="ingest-evidence-disclosure"\s+open/,
  );
  assert.match(
    styleSource,
    /\.ingest-evidence-disclosure\[open\][\s\S]*?transform:\s*rotate\(90deg\)/,
  );
});
