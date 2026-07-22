import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  arrangementContributorRoleOptions,
  contributorRoleOptions,
  isArrangementContributorRole,
} from "../server/metadata-vocabularies.js";

const appSource = readFileSync(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);

const expectedRoles = [
  "arranger",
  "string arranger",
  "vocal arranger",
  "horn arranger",
  "orchestrator",
] as const;

test(
  "offers common arrangement and orchestration roles in the contributor vocabulary",
  () => {
    for (const role of expectedRoles) {
      assert.equal(
        arrangementContributorRoleOptions.includes(role),
        true,
        role,
      );
      assert.equal(
        contributorRoleOptions.includes(role),
        true,
        role,
      );
      assert.equal(
        isArrangementContributorRole(role),
        true,
        role,
      );
    }

    assert.equal(
      isArrangementContributorRole("conductor"),
      false,
    );
  },
);

test(
  "mounts a dedicated arrangement editor in the credits tab",
  () => {
    assert.match(
      appSource,
      /function ArrangementCreditRecordEditor\(/,
    );
    assert.match(
      appSource,
      /supportsArrangementCreditRecords[\s\S]*activeMetadataTab === "credits"/,
    );
    assert.match(
      appSource,
      /section\.group ===\s*"Arrangement & Orchestration"[\s\S]*<ArrangementCreditRecordEditor/,
    );
    assert.match(
      appSource,
      /mergeInheritedArrangementCredits\(/,
    );
    assert.match(
      appSource,
      /Track-level arrangement credits override matching release defaults by role/,
    );
  },
);

test(
  "creates the missing track credits document in the selected credit family",
  () => {
    assert.match(
      appSource,
      /pendingInitialArrangementCreditPath/,
    );
    assert.match(
      appSource,
      /onCreateTrackCreditsDocument\(\s*missingTrackCreditsFile,\s*"arrangement"/,
    );
    assert.match(
      appSource,
      /Add arrangement credits/,
    );
  },
);
