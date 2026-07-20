import assert from "node:assert/strict";
import test from "node:test";

import {
  groupMatchingPerformerRoleSets,
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

const displayRecord = (
  key: string,
  name: string,
  roles: string[],
  sortNames: string[] = [],
) => ({
  key,
  name,
  roles,
  sortNames,
  sourceCount: roles.length,
});

test(
  "consolidates performers with identical complete role sets",
  () => {
    const result =
      groupMatchingPerformerRoleSets(
        [
          displayRecord(
            "kateri",
            "Kateri Lirio",
            ["Handclaps and stomps"],
          ),
          displayRecord(
            "ted",
            "Ted Atkins",
            ["handclaps   and stomps"],
          ),
        ],
        "Nathan Brenton",
      );

    assert.equal(result.length, 1);
    assert.equal(
      result[0]?.name,
      "Ted Atkins, Kateri Lirio",
    );
    assert.deepEqual(
      result[0]?.roles,
      ["Handclaps and stomps"],
    );
  },
);

test(
  "uses explicit sort names before surname fallback",
  () => {
    const result =
      groupMatchingPerformerRoleSets(
        [
          displayRecord(
            "alpha",
            "Alpha Person",
            ["Choir"],
            ["Zulu, Alpha"],
          ),
          displayRecord(
            "zulu",
            "Zulu Person",
            ["Choir"],
            ["Alpha, Zulu"],
          ),
        ],
        "",
      );

    assert.equal(
      result[0]?.name,
      "Zulu Person, Alpha Person",
    );
  },
);

test(
  "does not consolidate partially overlapping role sets",
  () => {
    const result =
      groupMatchingPerformerRoleSets(
        [
          displayRecord(
            "one",
            "Person One",
            ["Vocals", "Guitar"],
          ),
          displayRecord(
            "two",
            "Person Two",
            ["Guitar"],
          ),
        ],
        "",
      );

    assert.deepEqual(
      result.map((record) => record.name),
      ["Person One", "Person Two"],
    );
  },
);

test(
  "keeps the release artist role-set row first",
  () => {
    const result =
      groupMatchingPerformerRoleSets(
        [
          displayRecord(
            "guest",
            "Guest Artist",
            ["Handclaps"],
          ),
          displayRecord(
            "release",
            "Nathan Brenton",
            ["Vocals"],
          ),
        ],
        "Nathan Brenton",
      );

    assert.deepEqual(
      result.map((record) => record.name),
      ["Nathan Brenton", "Guest Artist"],
    );
  },
);
