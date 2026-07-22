import assert from "node:assert/strict";
import test from "node:test";

import {
  workflowDerivativeStatuses,
  workflowFaqItems,
  workflowLifecycleStatuses,
  workflowPath,
  workflowStages,
  workflowTroubleshootingItems,
} from "../src/workflow-help-content.js";


test("defines the maintained four-tab release workflow", () => {
  assert.equal(
    workflowPath,
    "Ingest → Staging → Library → Publish",
  );
  assert.deepEqual(
    workflowStages.map(({ id }) => id),
    [
      "ingest",
      "staging",
      "library",
      "publish",
    ],
  );
});


test("does not present unfinished write stages as available", () => {
  assert.deepEqual(
    workflowStages.map(
      ({ id, availability }) => [
        id,
        availability,
      ],
    ),
    [
      ["ingest", "available"],
      ["staging", "available"],
      ["library", "partial"],
      ["publish", "planned"],
    ],
  );
});


test("documents release lifecycle and media derivative statuses", () => {
  assert.deepEqual(
    workflowLifecycleStatuses.map(
      ({ term }) => term,
    ),
    ["Draft", "Ready", "Published", "Withdrawn"],
  );
  assert.deepEqual(
    workflowDerivativeStatuses.map(
      ({ term }) => term,
    ),
    ["Current", "Missing", "Stale", "Blocked"],
  );
});


test("explains the private canonical and public deployment boundary", () => {
  const combinedText = [
    ...workflowFaqItems.map(({ answer }) => answer),
    ...workflowStages.map(
      ({ summary, currentNote }) =>
        `${summary} ${currentNote}`,
    ),
  ].join(" ");

  assert.match(combinedText, /private canonical/i);
  assert.match(combinedText, /public/i);
  assert.match(combinedText, /copy/i);
});


test("documents incremental staging updates and track reordering", () => {
  const staging = workflowStages.find(
    ({ id }) => id === "staging",
  );
  const text = [
    staging?.summary,
    staging?.currentNote,
    ...(staging?.steps ?? []),
    ...workflowFaqItems.map(({ answer }) => answer),
  ].join(" ");

  assert.match(text, /incremental/i);
  assert.match(text, /reorder|arrange/i);
  assert.match(text, /stable track IDs/i);
  assert.match(text, /preserv/i);
});


test("includes operational troubleshooting for media preparation", () => {
  const titles = workflowTroubleshootingItems.map(
    ({ title }) => title,
  );

  assert.ok(
    titles.some((title) => /Blocked/.test(title)),
  );
  assert.ok(
    titles.some((title) => /Stale/.test(title)),
  );
  assert.ok(
    titles.some((title) => /FFmpeg/.test(title)),
  );
});


test("documents release audio preview controls", () => {
  const library = workflowStages.find(
    ({ id }) => id === "library",
  );
  const combinedText = [
    library?.currentNote,
    ...(library?.steps ?? []),
    ...workflowFaqItems.map(
      ({ question, answer }) =>
        `${question} ${answer}`,
    ),
    ...workflowTroubleshootingItems.map(
      ({ title, description }) =>
        `${title} ${description}`,
    ),
  ].join(" ");

  assert.match(combinedText, /audio preview/i);
  assert.match(combinedText, /audio-playback\.mp3/i);
  assert.match(combinedText, /sidebar|transport/i);
});


test("documents the active-tab summary in the sticky footer", () => {
  const combinedText = workflowFaqItems
    .map(({ question, answer }) =>
      `${question} ${answer}`,
    )
    .join(" ");

  assert.match(combinedText, /sticky footer/i);
  assert.match(combinedText, /Ingest displays the drop point/i);
  assert.match(combinedText, /Publish displays readiness counts/i);
});
