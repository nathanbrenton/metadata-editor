import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTrackDirectoryIdForNumber,
  parseTrackDirectoryId,
} from "../shared/track-directory-naming.js";

test("parses and renumbers the artist_number_title directory convention", () => {
  assert.deepEqual(
    parseTrackDirectoryId(
      "crazy-eights_01_good-afternoon-take-1",
    ),
    {
      prefix: "crazy-eights",
      numberText: "01",
      suffix: "good-afternoon-take-1",
      trackNumber: 1,
    },
  );

  assert.equal(
    buildTrackDirectoryIdForNumber(
      "crazy-eights_01_good-afternoon-take-1",
      7,
    ),
    "crazy-eights_07_good-afternoon-take-1",
  );
});

test("retains three-digit numbering width and rejects unsafe values", () => {
  assert.equal(
    buildTrackDirectoryIdForNumber(
      "artist_007_title",
      12,
    ),
    "artist_012_title",
  );
  assert.equal(
    buildTrackDirectoryIdForNumber(
      "artist_01_title",
      100,
    ),
    "artist_100_title",
  );
  assert.equal(
    buildTrackDirectoryIdForNumber(
      "custom-directory",
      2,
    ),
    null,
  );
  assert.equal(
    buildTrackDirectoryIdForNumber(
      "artist_01_title",
      1000,
    ),
    null,
  );
});
