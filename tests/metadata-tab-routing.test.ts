import assert from "node:assert/strict";
import test from "node:test";

import {
  metadataRowMatchesNotesTab,
} from "../src/metadata-tab-routing.js";

test("keeps artwork descriptions out of Production and Text Notes", () => {
  assert.equal(
    metadataRowMatchesNotesTab(
      "release.artwork[0].description",
      "Artwork",
    ),
    false,
  );
});

test("keeps ordinary imported descriptions and notes visible", () => {
  assert.equal(
    metadataRowMatchesNotesTab(
      "production.notes",
      "Production",
    ),
    true,
  );
  assert.equal(
    metadataRowMatchesNotesTab(
      "release.text.description",
      "Text and Notes",
    ),
    true,
  );
});
