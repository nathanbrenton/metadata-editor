import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  contributorRoleOptions,
  writingContributorRoleOptions,
} from "../server/metadata-vocabularies.js";

const appSource = readFileSync(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);

const expectedRoles = [
  "written by",
  "songwriter",
  "composer",
  "music by",
  "lyricist",
  "lyrics by",
  "words by",
] as const;

test("offers guided songwriting and composition roles", () => {
  for (const role of expectedRoles) {
    assert.equal(
      writingContributorRoleOptions.includes(role),
      true,
      role,
    );
    assert.equal(
      contributorRoleOptions.includes(role),
      true,
      role,
    );
  }
});

test("mounts a dedicated songwriting editor in the credits tab", () => {
  assert.match(
    appSource,
    /function WritingCreditRecordEditor\(/,
  );
  assert.match(
    appSource,
    /section\.group ===\s*"Songwriting & Composition"[\s\S]*<WritingCreditRecordEditor/,
  );
  assert.match(
    appSource,
    /mergeInheritedWritingCredits\(/,
  );
  assert.match(
    appSource,
    /writingCredits:\s*serializeWritingCreditRecords/,
  );
});

test("creates missing track credits in the selected credit family", () => {
  assert.match(
    appSource,
    /pendingInitialWritingCreditPath/,
  );
  assert.match(
    appSource,
    /onCreateTrackCreditsDocument\(\s*missingTrackCreditsFile,\s*"writing"/,
  );
  assert.match(
    appSource,
    /Add songwriting credits/,
  );
});

test("copies an inherited family before track-level editing", () => {
  assert.match(
    appSource,
    /const overrideReleaseFamily =/,
  );
  assert.match(
    appSource,
    /familyDefaults\.map[\s\S]*sourceFamily: null[\s\S]*sourceIndex: null/,
  );
  assert.match(
    appSource,
    /Override category/,
  );
});
