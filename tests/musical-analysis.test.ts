import assert from "node:assert/strict";
import test from "node:test";
import { camelotKeyForMusicalKey, isValidTuningReference } from "../shared/musical-analysis.js";

test("maps ordinary and enharmonic keys to Camelot values", () => {
  assert.equal(camelotKeyForMusicalKey("F major"), "7B");
  assert.equal(camelotKeyForMusicalKey("F♯ minor"), "11A");
  assert.equal(camelotKeyForMusicalKey("A♭ major"), "4B");
  assert.equal(camelotKeyForMusicalKey("custom mode"), null);
});

test("accepts three-digit tuning references", () => {
  assert.equal(isValidTuningReference(440), true);
  assert.equal(isValidTuningReference(432.5), true);
  assert.equal(isValidTuningReference(99), false);
  assert.equal(isValidTuningReference(1000), false);
});
