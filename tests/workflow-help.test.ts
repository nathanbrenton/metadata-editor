import assert from "node:assert/strict";
import test from "node:test";

import {
  workflowFaqItems,
  workflowPath,
  workflowStages,
} from "../src/workflow-help-content.js";

test("documents the current five-workspace product flow", () => {
  assert.equal(
    workflowPath,
    "Ingest → Staging → Library → Web Package → Live",
  );
  assert.deepEqual(
    workflowStages.map(({ id }) => id),
    ["ingest", "staging", "library", "public-package", "production"],
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
  assert.match(text, /private canonical Library/i);
  assert.match(text, /Hiplingo visitors can currently access/i);
  assert.match(text, /preferred happy-path formats/i);
  assert.match(text, /Field-level provenance chips/i);
  assert.match(text, /audit:file-spec/i);
  assert.match(text, /audit:media-technical/i);
  assert.match(text, /first-class Artist identities/i);
  assert.match(text, /release artwork never substitutes for an Artist photo/i);
  assert.match(text, /copy high-quality photos from ingest-drop/i);
  assert.match(text, /select one authoritative Primary/i);
  assert.match(text, /U\+00A9 COPYRIGHT SIGN/i);
  assert.match(text, /U\+2117 SOUND RECORDING COPYRIGHT/i);
  assert.match(text, /strict UTF-8 without a BOM/i);
  assert.match(text, /FFprobe must read the exact Unicode value back/i);
});
