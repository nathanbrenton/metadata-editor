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


test("defines the maintained five-stage release workflow", () => {
  assert.equal(
    workflowPath,
    "Ingest → Author → Prepare → Preflight → Publish",
  );
  assert.deepEqual(
    workflowStages.map(({ id }) => id),
    [
      "ingest",
      "author",
      "prepare",
      "preflight",
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
      ["author", "available"],
      ["prepare", "partial"],
      ["preflight", "planned"],
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
  const ingest = workflowStages.find(
    ({ id }) => id === "ingest",
  );
  const text = [
    ingest?.summary,
    ingest?.currentNote,
    ...(ingest?.steps ?? []),
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
  const author = workflowStages.find(
    ({ id }) => id === "author",
  );
  const combinedText = [
    author?.currentNote,
    ...(author?.steps ?? []),
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
