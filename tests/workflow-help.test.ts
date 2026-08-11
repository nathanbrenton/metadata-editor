import assert from "node:assert/strict";
import test from "node:test";

import {
  workflowFaqItems,
  workflowPath,
  workflowStages,
} from "../src/workflow-help-content.js";

test("documents the current four-workspace product flow", () => {
  assert.equal(
    workflowPath,
    "Ingest → Staging → Library → Publish",
  );
  assert.deepEqual(
    workflowStages.map(({ id }) => id),
    ["ingest", "staging", "library", "publish"],
  );
});

test("retains detailed feature reference while the rendered guide stays concise", () => {
  const text = [
    ...workflowStages.flatMap(
      ({ summary, steps, currentNote }) => [
        summary,
        ...steps,
        currentNote,
      ],
    ),
    ...workflowFaqItems.flatMap(
      ({ question, answer }) => [
        question,
        answer,
      ],
    ),
  ].join(" ");

  assert.match(text, /media-library root/i);
  assert.match(text, /published-media/i);
  assert.match(text, /preferred happy-path formats/i);
  assert.match(text, /Field-level provenance chips/i);
  assert.match(text, /audit:file-spec/i);
  assert.match(text, /audit:media-technical/i);
});
