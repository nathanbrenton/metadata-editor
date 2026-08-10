import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const builderSource = readFileSync(
  new URL("../src/IngestReleaseBuilder.tsx", import.meta.url),
  "utf8",
);
const stylesSource = readFileSync(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);
const helpSource = readFileSync(
  new URL("../src/workflow-help-content.ts", import.meta.url),
  "utf8",
);

test("keeps Staging track source and state columns compact", () => {
  const start = builderSource.indexOf(
    "function TrackDraftTable(",
  );
  const end = builderSource.indexOf(
    "function VideoDraftTable(",
    start,
  );

  assert.ok(start >= 0);
  assert.ok(end > start);

  const trackTableSource = builderSource.slice(
    start,
    end,
  );

  assert.match(
    trackTableSource,
    /ingest-track-source-audio-icon/,
  );
  assert.match(
    trackTableSource,
    /title=\{track\.sourceRelativePath\}/,
  );
  assert.match(
    trackTableSource,
    />\s*State\s*<\/th>/,
  );
  assert.doesNotMatch(
    trackTableSource,
    />\s*Source state\s*<\/th>/,
  );
  assert.match(
    trackTableSource,
    /<SourceReviewCell/,
  );
  assert.match(
    builderSource,
    /ingest-source-state-indicator/,
  );
  assert.match(builderSource, /symbol: "✓"/);
  assert.match(builderSource, /symbol: "×"/);
  assert.match(
    stylesSource,
    /ingest-track-source-column[\s\S]*?width: 4rem/,
  );
  assert.match(
    stylesSource,
    /ingest-track-preview-column[\s\S]*?width: 4\.8rem/,
  );
});

test("documents compact source hover and sync-style state indicators", () => {
  assert.match(helpSource, /music-file icon whose full path appears on hover/);
  assert.match(helpSource, /State uses sync-style status indicators/);
});
