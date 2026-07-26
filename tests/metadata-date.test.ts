import assert from "node:assert/strict";
import test from "node:test";

import {
  getCalendarInputValue,
  getLegacyCalendarDateValue,
  isCalendarDateMetadataPath,
  isCompleteIsoCalendarDate,
} from "../src/metadata-date.js";

test("accepts only complete valid ISO calendar dates", () => {
  assert.equal(isCompleteIsoCalendarDate("2026-07-26"), true);
  assert.equal(isCompleteIsoCalendarDate("2024-02-29"), true);
  assert.equal(isCompleteIsoCalendarDate("2023-02-29"), false);
  assert.equal(isCompleteIsoCalendarDate("2026-07"), false);
  assert.equal(isCompleteIsoCalendarDate("2026"), false);
});

test("projects complete dates into native calendar inputs without erasing legacy values", () => {
  assert.equal(getCalendarInputValue("2026-07-26"), "2026-07-26");
  assert.equal(getCalendarInputValue("2026-07"), "");
  assert.equal(getLegacyCalendarDateValue("2026-07"), "2026-07");
  assert.equal(getLegacyCalendarDateValue("2026-07-26"), null);
});

test("recognizes registered and supplemental date metadata paths", () => {
  assert.equal(isCalendarDateMetadataPath("release.dates.release"), true);
  assert.equal(isCalendarDateMetadataPath("track.dates.original_release"), true);
  assert.equal(isCalendarDateMetadataPath("production.recording.source_date"), true);
  assert.equal(isCalendarDateMetadataPath("track.sample_clearances[0].expiration_date"), true);
  assert.equal(isCalendarDateMetadataPath("release.title", "date"), true);
  assert.equal(isCalendarDateMetadataPath("release.title", "string"), false);
});
