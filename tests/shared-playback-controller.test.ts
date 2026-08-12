import assert from "node:assert/strict";
import test from "node:test";

import {
  dedupePlaybackQueue,
  getPlaybackQueueCapabilities,
  getPlaybackQueueIndex,
  getPlaybackQueueNeighbor,
} from "@hiplingo/media-player";

const queue = [
  { key: "track-a", title: "A" },
  { key: "track-b", title: "B" },
  { key: "track-c", title: "C" },
];

test("shared queue helpers preserve order while removing duplicate keys", () => {
  assert.deepEqual(
    dedupePlaybackQueue([
      queue[0],
      queue[1],
      queue[0],
      queue[2],
      queue[1],
    ]),
    queue,
  );

  assert.deepEqual(
    dedupePlaybackQueue(["a", "b", "a", "c"]),
    ["a", "b", "c"],
  );
});

test("shared queue helpers resolve stable positions and bounded neighbors", () => {
  assert.equal(getPlaybackQueueIndex(queue, "track-b"), 1);
  assert.equal(getPlaybackQueueIndex(queue, "missing"), -1);
  assert.equal(
    getPlaybackQueueNeighbor(queue, "track-b", -1)?.key,
    "track-a",
  );
  assert.equal(
    getPlaybackQueueNeighbor(queue, "track-b", 1)?.key,
    "track-c",
  );
  assert.equal(
    getPlaybackQueueNeighbor(queue, "track-a", -1),
    null,
  );
  assert.equal(
    getPlaybackQueueNeighbor(queue, "track-c", 1),
    null,
  );
});

test("shared queue capabilities describe non-wrapping transport boundaries", () => {
  assert.deepEqual(
    getPlaybackQueueCapabilities(queue, "track-a"),
    { canPrevious: false, canNext: true },
  );
  assert.deepEqual(
    getPlaybackQueueCapabilities(queue, "track-b"),
    { canPrevious: true, canNext: true },
  );
  assert.deepEqual(
    getPlaybackQueueCapabilities(queue, "track-c"),
    { canPrevious: true, canNext: false },
  );
  assert.deepEqual(
    getPlaybackQueueCapabilities(queue, "missing"),
    { canPrevious: false, canNext: false },
  );
});
