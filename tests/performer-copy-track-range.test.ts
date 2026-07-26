import assert from "node:assert/strict";
import test from "node:test";

import {
  applyTrackRangeSelection,
  getInclusiveTrackRange,
} from "../src/performer-copy-track-selection.js";

const trackOptions = [
  { trackId: "disc-1-track-1" },
  { trackId: "disc-1-track-2" },
  { trackId: "disc-1-track-3" },
  { trackId: "disc-2-track-1" },
  { trackId: "disc-2-track-2" },
];

test("selects an inclusive performer-copy destination range in displayed order", () => {
  assert.deepEqual(
    getInclusiveTrackRange(
      trackOptions,
      "disc-1-track-2",
      "disc-2-track-1",
    ),
    [
      "disc-1-track-2",
      "disc-1-track-3",
      "disc-2-track-1",
    ],
  );
});

test("normalizes reversed performer-copy range endpoints", () => {
  assert.deepEqual(
    getInclusiveTrackRange(
      trackOptions,
      "disc-2-track-1",
      "disc-1-track-2",
    ),
    [
      "disc-1-track-2",
      "disc-1-track-3",
      "disc-2-track-1",
    ],
  );
});

test("returns no range when either endpoint is unavailable", () => {
  assert.deepEqual(
    getInclusiveTrackRange(
      trackOptions,
      "missing",
      "disc-2-track-1",
    ),
    [],
  );
});

test("replaces destination selection with the chosen track range", () => {
  assert.deepEqual(
    applyTrackRangeSelection(
      trackOptions,
      ["disc-1-track-1", "stale-track"],
      ["disc-1-track-2", "disc-1-track-3"],
      "replace",
    ),
    ["disc-1-track-2", "disc-1-track-3"],
  );
});

test("adds a track range while preserving displayed order", () => {
  assert.deepEqual(
    applyTrackRangeSelection(
      trackOptions,
      ["disc-1-track-1", "disc-2-track-2"],
      ["disc-1-track-3", "disc-2-track-1"],
      "add",
    ),
    [
      "disc-1-track-1",
      "disc-1-track-3",
      "disc-2-track-1",
      "disc-2-track-2",
    ],
  );
});

test("removes a track range without selecting unrelated destinations", () => {
  assert.deepEqual(
    applyTrackRangeSelection(
      trackOptions,
      trackOptions.map((option) => option.trackId),
      ["disc-1-track-2", "disc-1-track-3"],
      "remove",
    ),
    [
      "disc-1-track-1",
      "disc-2-track-1",
      "disc-2-track-2",
    ],
  );
});
