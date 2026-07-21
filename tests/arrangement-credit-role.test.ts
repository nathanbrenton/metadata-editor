import assert from "node:assert/strict";
import test from "node:test";

import {
  getArrangementCreditDisplayPriority,
  isArrangementContributorRoleValue,
  sortArrangementCreditDisplayRecords,
} from "../src/arrangement-credit-role.js";


test("recognizes arranger and orchestration role variants", () => {
  for (const role of [
    "arranger",
    "arranged by",
    "string arrangement",
    "vocal arranger",
    "orchestrator",
    "additional orchestration",
  ]) {
    assert.equal(
      isArrangementContributorRoleValue(role),
      true,
      role,
    );
  }

  assert.equal(
    isArrangementContributorRoleValue("conductor"),
    false,
  );
  assert.equal(
    isArrangementContributorRoleValue("recording engineer"),
    false,
  );
});


test("orders broad arrangements before specialized and orchestration roles", () => {
  const records = [
    { role: "orchestrator" },
    { role: "string arranger" },
    { role: "arranger" },
    { role: "vocal arranger" },
  ];

  assert.deepEqual(
    sortArrangementCreditDisplayRecords(records).map(
      ({ role }) => role,
    ),
    [
      "arranger",
      "vocal arranger",
      "string arranger",
      "orchestrator",
    ],
  );
  assert.ok(
    getArrangementCreditDisplayPriority("arranger") <
      getArrangementCreditDisplayPriority("orchestrator"),
  );
});
