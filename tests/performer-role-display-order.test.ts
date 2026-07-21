import assert from "node:assert/strict";
import test from "node:test";

import {
  getPerformerRoleDisplayPriority,
  sortPerformerRoleDisplayValues,
} from "../src/performer-role-display-order.js";

test("sorts performer roles by primitive instrument family", () => {
  assert.deepEqual(
    sortPerformerRoleDisplayValues([
      "Turntables",
      "Drum Sequencing",
      "Tambourine",
      "Bass",
      "Trumpet",
      "Clarinet",
      "Cello",
      "Mellotron",
      "Baritone Guitar",
      "Additional Vocals",
    ]),
    [
      "Additional Vocals",
      "Baritone Guitar",
      "Mellotron",
      "Cello",
      "Clarinet",
      "Trumpet",
      "Bass",
      "Tambourine",
      "Drum Sequencing",
      "Turntables",
    ],
  );
});

test("classifies compound bass roles into the intended families", () => {
  assert.ok(
    getPerformerRoleDisplayPriority("Double Bass") <
      getPerformerRoleDisplayPriority("Bass Guitar"),
  );
  assert.ok(
    getPerformerRoleDisplayPriority("Bass Clarinet") <
      getPerformerRoleDisplayPriority("Bass Guitar"),
  );
  assert.ok(
    getPerformerRoleDisplayPriority("Bass Guitar") <
      getPerformerRoleDisplayPriority("Bass Sequencing"),
  );
});

test("preserves authored order inside one family and for unknown roles", () => {
  assert.deepEqual(
    sortPerformerRoleDisplayValues([
      "Electric Guitar",
      "Acoustic Guitar",
      "Special Guest Noise",
      "Found Object",
    ]),
    [
      "Electric Guitar",
      "Acoustic Guitar",
      "Special Guest Noise",
      "Found Object",
    ],
  );
});
