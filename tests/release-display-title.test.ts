import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  resolveReleaseDisplayTitle,
} from "../src/release-display-title.js";

const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);

test("preserves the exact casing of an authored release title", () => {
  assert.equal(
    resolveReleaseDisplayTitle(
      "Indoor Lightning EP",
      "Indoor Lightning Ep",
    ),
    "Indoor Lightning EP",
  );
});

test("preserves authored punctuation and spacing", () => {
  assert.equal(
    resolveReleaseDisplayTitle(
      "i/o: LIVE — Part II",
      "I O Live Part Ii",
    ),
    "i/o: LIVE — Part II",
  );
});

test("falls back when the release title is missing or blank", () => {
  assert.equal(
    resolveReleaseDisplayTitle(
      undefined,
      "Indoor Lightning Ep",
    ),
    "Indoor Lightning Ep",
  );
  assert.equal(
    resolveReleaseDisplayTitle(
      "   ",
      "Indoor Lightning Ep",
    ),
    "Indoor Lightning Ep",
  );
});

test("uses the authored release title in the detail header and release sidebar", () => {
  assert.match(
    appSource,
    /readDocumentDraftString\([\s\S]*?"release\.title"[\s\S]*?draft/,
  );
  assert.match(
    appSource,
    /<h1>\{releaseDisplayTitle\}<\/h1>/,
  );
  assert.match(
    appSource,
    /<small>\{releaseDisplayTitle\}<\/small>/,
  );
});
