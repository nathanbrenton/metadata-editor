import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultIngestOutputRoot,
} from "../server/ingest-builder.js";
import {
  defaultMediaLibraryRoot,
} from "../server/media-root.js";
import {
  workflowFaqItems,
} from "../src/workflow-help-content.js";

test("uses media-library as the shared default Staging and Library root", () => {
  assert.equal(defaultMediaLibraryRoot, "../media-library");
  assert.equal(defaultIngestOutputRoot, defaultMediaLibraryRoot);
});

test("documents disposable ingest sources and the canonical media-library", () => {
  const text = workflowFaqItems
    .map(({ question, answer }) => `${question} ${answer}`)
    .join(" ");

  assert.match(text, /media-library root/i);
  assert.match(text, /ingest candidate can be deleted/i);
  assert.match(text, /published-media is generated output/i);
});
