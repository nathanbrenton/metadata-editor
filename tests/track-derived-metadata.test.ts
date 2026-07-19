import assert from "node:assert/strict";
import test from "node:test";
import { deriveTrackSaveChanges } from "../src/track-derived-metadata.js";

test("creates generated display title and Camelot values when missing", () => {
  const result = deriveTrackSaveChanges(new Map([
    ["track.title", "Angel"],
    ["track.version", "Original Mix"],
    ["track.audio.key", "F major"],
  ]), [{ path: "track.audio.bpm", value: 85 }]);
  assert.deepEqual(result.createChanges, [
    { path: "track.display_title", value: "Angel (Original Mix)" },
    { path: "track.audio.camelot_key", value: "7B" },
  ]);
});

test("updates generated derivatives but preserves custom values", () => {
  const result = deriveTrackSaveChanges(new Map([
    ["track.title", "Angel"], ["track.version", ""],
    ["track.display_title", "Custom Public Title"],
    ["track.audio.key", "F major"],
    ["track.audio.camelot_key", "Custom"],
  ]), [
    { path: "track.version", value: "Live" },
    { path: "track.audio.key", value: "A minor" },
  ]);
  assert.equal(result.changes.some((c) => c.path === "track.display_title"), false);
  assert.equal(result.changes.some((c) => c.path === "track.audio.camelot_key"), false);
});
