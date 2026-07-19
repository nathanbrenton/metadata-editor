import assert from "node:assert/strict";
import test from "node:test";

import {
  contributorRoleOptions,
  isTechnicalContributorRole,
  technicalContributorRoleOptions,
} from "../server/metadata-vocabularies.js";
import {
  isTechnicalContributorRoleValue,
} from "../src/technical-credit-role.js";

const editorialRoles = [
  "editor",
  "edited by",
  "editing by",
] as const;

test(
  "offers editorial roles in the technical-credit dropdown vocabulary",
  () => {
    for (const role of editorialRoles) {
      assert.equal(
        technicalContributorRoleOptions.includes(role),
        true,
        role,
      );
      assert.equal(
        contributorRoleOptions.includes(role),
        true,
        role,
      );
    }
  },
);

test(
  "keeps editorial roles visible and valid after refresh",
  () => {
    for (const role of [
      ...editorialRoles,
      "Editor",
      "Edited By",
      "Editing By",
    ]) {
      assert.equal(
        isTechnicalContributorRole(role),
        true,
        role,
      );
      assert.equal(
        isTechnicalContributorRoleValue(role),
        true,
        role,
      );
    }
  },
);
