import assert from "node:assert/strict";
import test from "node:test";

import {
  prioritizeReleaseArtistDisplay,
} from "../src/performer-display-order.js";

test(
  "places the release artist before other performers",
  () => {
    const records = [
      {
        name: "Eric Brenton",
        roles: ["Additional Guitar"],
      },
      {
        name: "Nathan Brenton",
        roles: ["Vocals", "Guitars"],
      },
    ];

    assert.deepEqual(
      prioritizeReleaseArtistDisplay(
        records,
        "Nathan Brenton",
      ).map((record) => record.name),
      ["Nathan Brenton", "Eric Brenton"],
    );
  },
);

test(
  "matches release artist names case-insensitively with normalized spaces",
  () => {
    const records = [
      { name: "Guest Artist" },
      { name: "  NATHAN   BRENTON " },
    ];

    assert.deepEqual(
      prioritizeReleaseArtistDisplay(
        records,
        "Nathan Brenton",
      ).map((record) => record.name),
      ["  NATHAN   BRENTON ", "Guest Artist"],
    );
  },
);

test(
  "preserves source order when the release artist is absent",
  () => {
    const records = [
      { name: "Eric Brenton" },
      { name: "Guest Artist" },
    ];
    const result =
      prioritizeReleaseArtistDisplay(
        records,
        "Nathan Brenton",
      );

    assert.deepEqual(result, records);
    assert.notEqual(result, records);
  },
);
