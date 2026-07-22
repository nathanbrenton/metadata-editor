import assert from "node:assert/strict";
import test from "node:test";

import {
  commaSeparatedValues,
  suggestSampleCreditText,
} from "../src/sample-relationship.js";

test("suggests sample wording for a known source artist", () => {
  assert.equal(
    suggestSampleCreditText({
      relationshipType: "sample",
      sourceTitle: "When the Levee Breaks",
      sourceArtist: "Led Zeppelin",
      sourceWriters: [],
    }),
    "Contains samples from “When the Levee Breaks” as performed by Led Zeppelin.",
  );
});

test("suggests interpolation wording with source writers", () => {
  assert.equal(
    suggestSampleCreditText({
      relationshipType: "interpolation",
      sourceTitle: "Example Song",
      sourceArtist: "",
      sourceWriters: ["Writer One", "Writer Two"],
    }),
    "Contains an interpolation of “Example Song”, written by Writer One and Writer Two.",
  );
});

test("normalizes comma-separated writer and territory values", () => {
  assert.deepEqual(
    commaSeparatedValues("United States, Canada, , worldwide"),
    ["United States", "Canada", "worldwide"],
  );
});


test("suggests wording when the source artist is known but the exact recording is not", () => {
  assert.equal(
    suggestSampleCreditText({
      relationshipType: "unknown sample source",
      sourceTitle: "",
      sourceArtist: "Example Artist",
      sourceWriters: [],
    }),
    "Contains an unidentified sample associated with Example Artist.",
  );
});
