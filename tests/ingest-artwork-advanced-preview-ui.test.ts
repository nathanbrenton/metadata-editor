import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const builderSource = readFileSync(
  new URL("../src/IngestReleaseBuilder.tsx", import.meta.url),
  "utf8",
);
const styleSource = readFileSync(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);
const helpSource = readFileSync(
  new URL("../src/workflow-help-content.ts", import.meta.url),
  "utf8",
);

test("advanced artwork assignments repeat a compact source preview", () => {
  assert.match(
    builderSource,
    /className="ingest-artwork-advanced-preview"[\s\S]*?<ArtworkPreview[\s\S]*?sourceRelativePath=\{asset\.sourceRelativePath\}[\s\S]*?thumbnailOnly/,
  );
  assert.match(
    styleSource,
    /\.ingest-artwork-advanced-preview\s*\{[\s\S]*?width:\s*5\.5rem;[\s\S]*?height:\s*5\.5rem;/,
  );
  assert.match(
    helpSource,
    /repeats each source thumbnail beside its assignment controls/i,
  );
});
