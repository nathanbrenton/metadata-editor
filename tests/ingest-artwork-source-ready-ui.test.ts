import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const builderSource = readFileSync(
  new URL("../src/IngestReleaseBuilder.tsx", import.meta.url),
  "utf8",
);
const helpSource = readFileSync(
  new URL("../src/workflow-help-content.ts", import.meta.url),
  "utf8",
);

test("advanced artwork unchanged sources show Source ready without the review-state icon", () => {
  assert.match(
    builderSource,
    /status\?\.state !== "unchanged" && \([\s\S]*?<SourceReviewCell[\s\S]*?status=\{status\}[\s\S]*?\)\}/,
  );
  assert.match(
    builderSource,
    /status\?\.state === "unchanged" && \([\s\S]*?ingest-artwork-source-ready-label[\s\S]*?Source ready/,
  );
  assert.match(
    helpSource,
    /standalone success icon is intentionally omitted/i,
  );
});

test("advanced artwork still keeps review-state controls for non-unchanged sources", () => {
  assert.match(
    builderSource,
    /status\?\.state !== "unchanged" && \([\s\S]*?<SourceReviewCell/,
  );
});
