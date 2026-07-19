import assert from "node:assert/strict";
import test from "node:test";

import {
  getTechnicalCreditDisplayPriority,
  isTechnicalContributorRoleValue,
  sortTechnicalCreditDisplayRecords,
} from "../src/technical-credit-role.js";

test("recognizes saved primary liner-note role variants", () => {
  for (const role of [
    "Recorded By",
    "recorded by",
    "Mixed By",
    "mixed by",
    "Mastered By",
    "mastered by",
  ]) {
    assert.equal(
      isTechnicalContributorRoleValue(role),
      true,
      role,
    );
  }
});

test("recognizes supported engineering terminology", () => {
  for (const role of [
    "Recording Engineer",
    "Tracking Engineer",
    "Assistant Recording Engineer",
    "Mix Engineer",
    "Mixing Engineer",
    "Mixer",
    "Assistant Mix Engineer",
    "Mastering Engineer",
    "Remastering Engineer",
    "Mastering Assistant",
  ]) {
    assert.equal(
      isTechnicalContributorRoleValue(role),
      true,
      role,
    );
  }
});

test("rejects unrelated contributor roles", () => {
  for (const role of [
    "Producer",
    "Songwriter",
    "Guitar",
    "Photography",
    "",
  ]) {
    assert.equal(
      isTechnicalContributorRoleValue(role),
      false,
      role,
    );
  }
});

test("sorts recording before mixing and mastering", () => {
  const records = [
    { name: "Kateri Lirio", role: "Mixed By" },
    { name: "Kateri Lirio", role: "Mastered By" },
    { name: "Nathan Brenton", role: "Recorded By" },
  ];

  assert.deepEqual(
    sortTechnicalCreditDisplayRecords(records).map(
      ({ role }) => role,
    ),
    ["Recorded By", "Mixed By", "Mastered By"],
  );
});

test("keeps authored order stable within one technical role family", () => {
  const records = [
    { name: "Second", role: "Assistant Mix Engineer" },
    { name: "First", role: "Mixed By" },
  ];

  assert.deepEqual(
    sortTechnicalCreditDisplayRecords(records).map(
      ({ name }) => name,
    ),
    ["Second", "First"],
  );
});

test("places generic and custom technical roles after primary families", () => {
  assert.ok(
    getTechnicalCreditDisplayPriority("Recorded By") <
      getTechnicalCreditDisplayPriority("Mixed By"),
  );
  assert.ok(
    getTechnicalCreditDisplayPriority("Mixed By") <
      getTechnicalCreditDisplayPriority("Mastered By"),
  );
  assert.ok(
    getTechnicalCreditDisplayPriority("Mastered By") <
      getTechnicalCreditDisplayPriority("Audio Engineer"),
  );
  assert.ok(
    getTechnicalCreditDisplayPriority("Audio Engineer") <
      getTechnicalCreditDisplayPriority("Custom Technical Role"),
  );
});
