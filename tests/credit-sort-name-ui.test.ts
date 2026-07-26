import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);

test(
  "projects generated sort names into managed credit editors",
  () => {
    assert.match(
      appSource,
      /sortName:\s*resolveCreditSortName\(/,
    );
    assert.match(
      appSource,
      /applyCreditRecordUpdates\(/,
    );
    assert.match(
      appSource,
      /Generated from Credit Name/,
    );
  },
);

test(
  "counts every saveable draft family in the global unsaved state",
  () => {
    for (const draftMap of [
      "performerDrafts",
      "technicalCreditDrafts",
      "arrangementCreditDrafts",
      "writingCreditDrafts",
      "sampleRelationshipDrafts",
      "sampleClearanceDrafts",
    ]) {
      assert.match(
        appSource,
        new RegExp(
          `Object\\.keys\\(${draftMap}\\)\\.length`,
        ),
      );
    }
  },
);
