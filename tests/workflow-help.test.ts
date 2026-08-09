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
      ["publish", "partial"],
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


test("documents reviewed track-directory synchronization", () => {
  const library = workflowStages.find(
    ({ id }) => id === "library",
  );
  const text = [
    ...(library?.steps ?? []),
    library?.currentNote,
    ...workflowFaqItems.map(
      ({ question, answer }) =>
        `${question} ${answer}`,
    ),
  ].join(" ");

  assert.match(text, /saving numbering metadata does not move folders/i);
  assert.match(text, /server's exact dry-run plan/i);
  assert.match(text, /confirmation phrase/i);
  assert.match(text, /plan fingerprint/i);
});


test("documents temporary admin mode and Library release identity rows", () => {
  const library = workflowStages.find(
    ({ id }) => id === "library",
  );
  const combinedText = [
    library?.summary,
    ...workflowFaqItems.map(
      ({ question, answer }) =>
        `${question} ${answer}`,
    ),
  ].join(" ");

  assert.match(combinedText, /authored title and release artist/i);
  assert.match(combinedText, /every page load starts/i);
  assert.match(combinedText, /not written to browser storage/i);
});

test("documents bulk source-date tools in Staging", () => {
  const staging = workflowStages.find(
    ({ id }) => id === "staging",
  );
  const combinedText = [
    staging?.currentNote,
    ...(staging?.steps ?? []),
    ...workflowFaqItems.map(
      ({ question, answer }) =>
        `${question} ${answer}`,
    ),
  ].join(" ");

  assert.match(combinedText, /source-date tools/i);
  assert.match(
    combinedText,
    /Use checkboxes define the current source selection/i,
  );
  assert.doesNotMatch(combinedText, /Copy to selected/);
  assert.match(combinedText, /Missing sources are skipped/i);
});

test("documents Staging source preview and compact Review icons", () => {
  const staging = workflowStages.find(
    ({ id }) => id === "staging",
  );
  const combinedText = [
    staging?.currentNote,
    ...(staging?.steps ?? []),
    ...workflowFaqItems.map(
      ({ question, answer }) =>
        `${question} ${answer}`,
    ),
  ].join(" ");

  assert.match(combinedText, /play\/pause/i);
  assert.match(combinedText, /Tracks or Review/i);
  assert.match(combinedText, /read-only/i);
  assert.match(combinedText, /green check or red ×/i);
});

test("documents performer-credit destination range selection", () => {
  const library = workflowStages.find(
    ({ id }) => id === "library",
  );
  const combinedText = [
    ...(library?.steps ?? []),
    ...workflowFaqItems.map(
      ({ question, answer }) =>
        `${question} ${answer}`,
    ),
  ].join(" ");

  assert.match(combinedText, /inclusive destination range/i);
  assert.match(combinedText, /displayed disc\/track order/i);
  assert.match(combinedText, /Replace selection/i);
  assert.match(combinedText, /Add to selection/i);
  assert.match(combinedText, /Remove from selection/i);
  assert.match(combinedText, /duplicates are skipped/i);
});


test("documents Library sidebar keyboard navigation", () => {
  const library = workflowStages.find(
    ({ id }) => id === "library",
  );
  const combinedText = [
    library?.currentNote,
    ...(library?.steps ?? []),
  ].join(" ");

  assert.match(combinedText, /Arrow Up/i);
  assert.match(combinedText, /Arrow Down/i);
  assert.match(combinedText, /Release row/i);
  assert.match(combinedText, /editable fields/i);
  assert.match(combinedText, /sidebar remains sticky/i);
  assert.match(combinedText, /page's native vertical scroll/i);
  assert.match(combinedText, /hands off to the page/i);
  assert.match(combinedText, /only the sidebar scrolls/i);
});


test("documents Ingest Source files media previews", () => {
  const ingest = workflowStages.find(({ id }) => id === "ingest");
  const text = [
    ingest?.summary,
    ingest?.currentNote,
    ...(ingest?.steps ?? []),
  ].join(" ");

  assert.match(
    text,
    /visible columns compact.*Preview.*Filename.*Duration.*Size.*Details/i,
  );
  assert.match(text, /image rows show clickable thumbnails/i);
  assert.match(
    text,
    /audio rows provide play\/pause preview controls.*continue to the next available audio source/i,
  );
  assert.match(text, /probe provenance.*remain.*Details/i);
});
