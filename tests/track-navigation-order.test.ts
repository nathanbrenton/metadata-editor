import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTrackNavigationOrder,
} from "../src/track-navigation-order.js";

test("sorts track navigation by disc and authored track number", () => {
  const result = buildTrackNavigationOrder([
    {
      trackId: "third",
      sourceIndex: 0,
      trackNumber: 3,
      discNumber: 1,
    },
    {
      trackId: "second-disc",
      sourceIndex: 1,
      trackNumber: 1,
      discNumber: 2,
    },
    {
      trackId: "first",
      sourceIndex: 2,
      trackNumber: 1,
      discNumber: 1,
    },
  ]);

  assert.deepEqual(
    result.entries.map((entry) => entry.trackId),
    ["first", "third", "second-disc"],
  );
});

test("keeps missing and duplicate numbers deterministic", () => {
  const result = buildTrackNavigationOrder([
    {
      trackId: "duplicate-a",
      sourceIndex: 0,
      trackNumber: 2,
      discNumber: 1,
    },
    {
      trackId: "missing",
      sourceIndex: 1,
      trackNumber: null,
      discNumber: 1,
    },
    {
      trackId: "duplicate-b",
      sourceIndex: 2,
      trackNumber: 2,
      discNumber: 1,
    },
  ]);

  assert.deepEqual(
    result.entries.map((entry) => entry.trackId),
    ["duplicate-a", "duplicate-b", "missing"],
  );
  assert.deepEqual(result.conflicts, [
    {
      discNumber: 1,
      trackNumber: 2,
      trackIds: [
        "duplicate-a",
        "duplicate-b",
      ],
    },
  ]);
  assert.equal(
    result.entries[0]?.hasNumberConflict,
    true,
  );
  assert.equal(
    result.entries[2]?.hasNumberConflict,
    false,
  );
});

test("allows the same track number on different discs", () => {
  const result = buildTrackNavigationOrder([
    {
      trackId: "disc-one",
      sourceIndex: 0,
      trackNumber: 1,
      discNumber: 1,
    },
    {
      trackId: "disc-two",
      sourceIndex: 1,
      trackNumber: 1,
      discNumber: 2,
    },
  ]);

  assert.deepEqual(result.conflicts, []);
});
