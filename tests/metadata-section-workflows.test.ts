import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);

test(
  "presents production, recording, and editing as separate sections",
  () => {
    assert.match(
      appSource,
      /"Production",\s*"Recording",\s*"Editing"/,
    );
    assert.doesNotMatch(
      appSource,
      /"Recording and Editing"/,
    );
  },
);

test(
  "offers release performer inheritance and reversible track customization",
  () => {
    assert.match(
      appSource,
      /Inherited from release/,
    );
    assert.match(
      appSource,
      /Customize performers for this track/,
    );
    assert.match(
      appSource,
      /Use release performers/,
    );
    assert.match(
      appSource,
      /release\.credits\.performers/,
    );
  },
);

test(
  "keeps missing business and rights fields available for creation",
  () => {
    assert.match(
      appSource,
      /defaultRightsMissingFields/,
    );
    assert.match(
      appSource,
      /Music Business & Rights/,
    );
  },
);
