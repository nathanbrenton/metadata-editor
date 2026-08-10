import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const indexSource = readFileSync(
  new URL("../server/index.ts", import.meta.url),
  "utf8",
);
const helpSource = readFileSync(
  new URL("../src/workflow-help-content.ts", import.meta.url),
  "utf8",
);

test("offers one read-only Library video preview at a time", () => {
  assert.match(appSource, /videoPreviewId/);
  assert.match(appSource, /Hide preview/);
  assert.match(appSource, /Read-only canonical master preview/);
  assert.match(appSource, /<video/);
  assert.match(appSource, /preload="metadata"/);
  assert.match(appSource, /playsInline/);
});

test("serves Library video previews through a guarded byte-range endpoint", () => {
  assert.match(indexSource, /"\/api\/library\/video-preview"/);
  assert.match(indexSource, /parseSingleByteRange/);
  assert.match(indexSource, /Accept-Ranges/);
  assert.match(indexSource, /canonical-video-master/);
  assert.match(indexSource, /assertPathWithinRoot/);
});

test("documents that Library video preview does not generate a derivative", () => {
  assert.match(
    helpSource,
    /previewed read-only from the Library without generating a derivative/,
  );
  assert.match(
    helpSource,
    /codec support still depends on the browser/,
  );
});
