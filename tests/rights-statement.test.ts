import assert from "node:assert/strict";
import test from "node:test";

import {
  formatGuidedRightsStatement,
  getRightsStatementSymbol,
  parseGuidedRightsStatement,
} from "../src/rights-statement.js";

test("maps guided rights fields to the correct symbol", () => {
  assert.equal(
    getRightsStatementSymbol(
      "release.rights.copyright",
    ),
    "©",
  );
  assert.equal(
    getRightsStatementSymbol(
      "track.rights.phonographic_copyright",
    ),
    "℗",
  );
  assert.equal(
    getRightsStatementSymbol(
      "track.rights.publisher",
    ),
    null,
  );
});

test("parses standard copyright and phonographic statements", () => {
  assert.deepEqual(
    parseGuidedRightsStatement(
      "© 2026 Example Records",
      "©",
    ),
    {
      year: "2026",
      holder: "Example Records",
    },
  );
  assert.deepEqual(
    parseGuidedRightsStatement(
      "℗ 2009 Example Records",
      "℗",
    ),
    {
      year: "2009",
      holder: "Example Records",
    },
  );
});

test("keeps sequential year keystrokes in the year field", () => {
  let value = "";

  for (const digit of "2026") {
    const parts =
      parseGuidedRightsStatement(
        value,
        "©",
      );

    if (!parts) {
      throw new Error(
        "Expected an editable guided rights statement.",
      );
    }

    value = formatGuidedRightsStatement(
      "©",
      `${parts.year}${digit}`,
      parts.holder,
    );
  }

  assert.equal(value, "© 2026");
  assert.deepEqual(
    parseGuidedRightsStatement(
      value,
      "©",
    ),
    {
      year: "2026",
      holder: "",
    },
  );
});

test("accepts keyboard-friendly symbol aliases", () => {
  assert.deepEqual(
    parseGuidedRightsStatement(
      "(C) 2026 Example Publishing",
      "©",
    ),
    {
      year: "2026",
      holder: "Example Publishing",
    },
  );
  assert.deepEqual(
    parseGuidedRightsStatement(
      "(P) 2026 Example Records",
      "℗",
    ),
    {
      year: "2026",
      holder: "Example Records",
    },
  );
});

test("preserves nonstandard authored statements as custom values", () => {
  assert.equal(
    parseGuidedRightsStatement(
      "Lyrics © 2026 Jane Doe",
      "©",
    ),
    null,
  );
  assert.equal(
    parseGuidedRightsStatement(
      "All rights controlled by Example Music",
      "©",
    ),
    null,
  );
});

test("formats guided values without requiring symbol entry", () => {
  assert.equal(
    formatGuidedRightsStatement(
      "©",
      "2026",
      "Example Records",
    ),
    "© 2026 Example Records",
  );
  assert.equal(
    formatGuidedRightsStatement(
      "℗",
      "2026",
      "Example Records",
    ),
    "℗ 2026 Example Records",
  );
  assert.equal(
    formatGuidedRightsStatement(
      "©",
      "",
      "",
    ),
    "",
  );
});
