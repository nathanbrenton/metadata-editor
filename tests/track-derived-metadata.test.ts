import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveTrackSaveChanges,
  deriveTrackTitleDraftChanges,
  generateTrackSortTitle,
} from "../src/track-derived-metadata.js";

test("creates generated display title and Camelot values when missing", () => {
  const result = deriveTrackSaveChanges(new Map([
    ["track.title", "Angel"],
    ["track.version", "Original Mix"],
    ["track.audio.key", "F major"],
  ]), [{ path: "track.audio.bpm", value: 85 }]);
  assert.deepEqual(result.createChanges, [
    { path: "track.display_title", value: "Angel (Original Mix)" },
    { path: "track.sort_title", value: "Angel (Original Mix)" },
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


test("generates a sort title from display title before base title", () => {
  assert.deepEqual(
    generateTrackSortTitle({
      title: "Nebula",
      version: "Original Mix",
      displayTitle: "Custom Display",
    }),
    {
      value: "Custom Display",
      source: "Track Display Title",
    },
  );

  assert.deepEqual(
    generateTrackSortTitle({
      title: "Angel",
      version: "",
      displayTitle: "",
    }),
    {
      value: "Angel",
      source: "Track Title",
    },
  );
});

test("creates and updates generated sort titles while preserving custom values", () => {
  const created = deriveTrackSaveChanges(
    new Map([
      ["track.title", "Nebula"],
      ["track.version", "Original Mix"],
      ["track.display_title", ""],
    ]),
    [{ path: "track.audio.bpm", value: 120 }],
  );

  assert.deepEqual(
    created.createChanges.filter(
      (change) =>
        change.path === "track.sort_title",
    ),
    [
      {
        path: "track.sort_title",
        value: "Nebula (Original Mix)",
      },
    ],
  );

  const updated = deriveTrackSaveChanges(
    new Map([
      ["track.title", "Angel"],
      ["track.version", ""],
      ["track.display_title", "Angel"],
      ["track.sort_title", "Angel"],
    ]),
    [
      { path: "track.title", value: "Signal" },
      { path: "track.display_title", value: "Signal" },
    ],
  );

  assert.deepEqual(
    updated.changes.find(
      (change) =>
        change.path === "track.sort_title",
    ),
    {
      path: "track.sort_title",
      value: "Signal",
    },
  );

  const custom = deriveTrackSaveChanges(
    new Map([
      ["track.title", "Angel"],
      ["track.version", ""],
      ["track.display_title", "Angel"],
      ["track.sort_title", "Angel, The"],
    ]),
    [{ path: "track.title", value: "Signal" }],
  );

  assert.equal(
    custom.changes.some(
      (change) =>
        change.path === "track.sort_title",
    ),
    false,
  );
});

test("updates generated display and sort titles immediately when track version changes", () => {
  assert.deepEqual(
    deriveTrackTitleDraftChanges({
      current: {
        title: "Good Afternoon",
        version: "Take 1",
        displayTitle: "Good Afternoon (Take 1)",
        sortTitle: "Good Afternoon (Take 1)",
      },
      changedPath: "track.version",
      nextValue: "Take 2",
    }),
    [
      {
        path: "track.display_title",
        value: "Good Afternoon (Take 2)",
      },
      {
        path: "track.sort_title",
        value: "Good Afternoon (Take 2)",
      },
    ],
  );
});

test("preserves individual display and sort title overrides during version changes", () => {
  assert.deepEqual(
    deriveTrackTitleDraftChanges({
      current: {
        title: "Good Afternoon",
        version: "Take 1",
        displayTitle: "Good Afternoon — First Take",
        sortTitle: "Afternoon, Good — First Take",
      },
      changedPath: "track.version",
      nextValue: "Take 2",
    }),
    [],
  );
});

test("keeps a generated sort title synchronized when display title is edited", () => {
  assert.deepEqual(
    deriveTrackTitleDraftChanges({
      current: {
        title: "Good Afternoon",
        version: "Take 1",
        displayTitle: "Good Afternoon (Take 1)",
        sortTitle: "Good Afternoon (Take 1)",
      },
      changedPath: "track.display_title",
      nextValue: "Good Afternoon — Take One",
    }),
    [
      {
        path: "track.sort_title",
        value: "Good Afternoon — Take One",
      },
    ],
  );
});
