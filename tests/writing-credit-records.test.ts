import assert from "node:assert/strict";
import test from "node:test";

import {
  applyWritingCreditRecords,
} from "../server/metadata-change-set.js";

test("writes songwriter, composer, and lyricist records into separate arrays", () => {
  const result = applyWritingCreditRecords(
    {
      track: {
        composers: [
          {
            name: "Old Name",
            role: "composer",
            ipi: "123",
          },
        ],
      },
    },
    [
      {
        family: "songwriters",
        sourceFamily: null,
        sourceIndex: null,
        name: "Nathan Brenton",
        role: "written by",
        sortName: "Brenton, Nathan",
      },
      {
        family: "composers",
        sourceFamily: "composers",
        sourceIndex: 0,
        name: "Kateri Lirio",
        role: "music by",
        sortName: "Lirio, Kateri",
      },
      {
        family: "lyricists",
        sourceFamily: null,
        sourceIndex: null,
        name: "Travis Leaming",
        role: "lyrics by",
        sortName: "",
      },
    ],
  ) as {
    track: {
      songwriters: Array<Record<string, unknown>>;
      composers: Array<Record<string, unknown>>;
      lyricists: Array<Record<string, unknown>>;
    };
  };

  assert.deepEqual(result.track.songwriters, [
    {
      name: "Nathan Brenton",
      role: "written by",
      sort_name: "Brenton, Nathan",
    },
  ]);
  assert.deepEqual(result.track.composers, [
    {
      name: "Kateri Lirio",
      role: "music by",
      sort_name: "Lirio, Kateri",
      ipi: "123",
    },
  ]);
  assert.deepEqual(result.track.lyricists, [
    {
      name: "Travis Leaming",
      role: "lyrics by",
    },
  ]);
});

test("preserves absent writing arrays when no records target them", () => {
  const result = applyWritingCreditRecords(
    { release: { credits: {} } },
    [],
    "release.credits",
  );

  assert.deepEqual(result, {
    release: { credits: {} },
  });
});


test("preserves identifiers when a writing role moves between families", () => {
  const result = applyWritingCreditRecords(
    {
      track: {
        composers: [
          {
            name: "Nathan Brenton",
            role: "composer",
            ipi: "123456789",
          },
        ],
      },
    },
    [
      {
        family: "lyricists",
        sourceFamily: "composers",
        sourceIndex: 0,
        name: "Nathan Brenton",
        role: "lyrics by",
        sortName: "Brenton, Nathan",
      },
    ],
  ) as {
    track: {
      composers: Array<Record<string, unknown>>;
      lyricists: Array<Record<string, unknown>>;
    };
  };

  assert.deepEqual(result.track.composers, []);
  assert.deepEqual(result.track.lyricists, [
    {
      name: "Nathan Brenton",
      role: "lyrics by",
      sort_name: "Brenton, Nathan",
      ipi: "123456789",
    },
  ]);
});
