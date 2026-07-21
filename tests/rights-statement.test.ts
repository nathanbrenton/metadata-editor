import assert from "node:assert/strict";
import test from "node:test";

import {
  formatGuidedCopyrightNotice,
  formatGuidedCopyrightNoticeValue,
  formatGuidedRightsStatement,
  getGuidedCopyrightNoticeConfig,
  getRightsStatementSymbol,
  isGuidedCopyrightNoticePath,
  parseGuidedCopyrightNotice,
  parseGuidedRightsStatement,
} from "../src/rights-statement.js";

test("maps fixed rights notices and free-form rights fields to the correct symbols", () => {
  assert.deepEqual(
    getGuidedCopyrightNoticeConfig(
      "release.rights.copyright",
    ),
    {
      prefix: "Copyright",
      symbol: "©",
      keyboardAlias: "(C)",
    },
  );
  assert.deepEqual(
    getGuidedCopyrightNoticeConfig(
      "track.rights.phonographic_copyright",
    ),
    {
      prefix: "Sound Recording Copyright",
      symbol: "℗",
      keyboardAlias: "(P)",
    },
  );
  assert.equal(
    getRightsStatementSymbol(
      "track.rights.phonographic_copyright",
    ),
    null,
  );
  assert.equal(
    getRightsStatementSymbol(
      "track.text.lyrics_copyright",
    ),
    "©",
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


test("formats guided copyright and sound-recording notices with fixed wording", () => {
  assert.equal(
    isGuidedCopyrightNoticePath(
      "release.rights.copyright",
    ),
    true,
  );
  assert.equal(
    isGuidedCopyrightNoticePath(
      "track.rights.copyright",
    ),
    true,
  );
  assert.equal(
    isGuidedCopyrightNoticePath(
      "release.rights.phonographic_copyright",
    ),
    true,
  );
  assert.equal(
    isGuidedCopyrightNoticePath(
      "track.rights.phonographic_copyright",
    ),
    true,
  );
  assert.equal(
    isGuidedCopyrightNoticePath(
      "track.text.lyrics_copyright",
    ),
    false,
  );
  assert.equal(
    formatGuidedCopyrightNotice(
      "Nathan Brenton and Kateri Lirio",
      "release.rights.copyright",
    ),
    "Copyright © Nathan Brenton and Kateri Lirio. All rights reserved.",
  );
  assert.equal(
    formatGuidedCopyrightNotice(
      "Nathan Brenton and Kateri Lirio",
      "release.rights.phonographic_copyright",
    ),
    "Sound Recording Copyright ℗ Nathan Brenton and Kateri Lirio. All rights reserved.",
  );
});

test("parses canonical and keyboard-friendly fixed notices", () => {
  assert.deepEqual(
    parseGuidedCopyrightNotice(
      "Copyright © Nathan Brenton and Kateri Lirio. All rights reserved.",
      "release.rights.copyright",
    ),
    {
      holder:
        "Nathan Brenton and Kateri Lirio",
    },
  );
  assert.deepEqual(
    parseGuidedCopyrightNotice(
      "Copyright (C) Nathan Brenton and Kateri Lirio. All rights reserved.",
      "track.rights.copyright",
    ),
    {
      holder:
        "Nathan Brenton and Kateri Lirio",
    },
  );
  assert.deepEqual(
    parseGuidedCopyrightNotice(
      "Sound Recording Copyright ℗ Example Records. All rights reserved.",
      "release.rights.phonographic_copyright",
    ),
    { holder: "Example Records" },
  );
  assert.deepEqual(
    parseGuidedCopyrightNotice(
      "Sound Recording Copyright (P) Example Records. All rights reserved.",
      "track.rights.phonographic_copyright",
    ),
    { holder: "Example Records" },
  );
  assert.deepEqual(
    parseGuidedCopyrightNotice(
      "",
      "release.rights.copyright",
    ),
    { holder: "" },
  );
  assert.equal(
    parseGuidedCopyrightNotice(
      "© 2016 Nathan Brenton",
      "release.rights.copyright",
    ),
    null,
  );
  assert.equal(
    parseGuidedCopyrightNotice(
      "℗ 2016 Example Records",
      "release.rights.phonographic_copyright",
    ),
    null,
  );
});

test("canonicalizes recognized legacy aliases for read-only display", () => {
  assert.equal(
    formatGuidedCopyrightNoticeValue(
      "release.rights.copyright",
      "Copyright (C) Nathan Brenton. All rights reserved.",
    ),
    "Copyright © Nathan Brenton. All rights reserved.",
  );
  assert.equal(
    formatGuidedCopyrightNoticeValue(
      "track.rights.phonographic_copyright",
      "Sound Recording Copyright (P) Example Records. All rights reserved.",
    ),
    "Sound Recording Copyright ℗ Example Records. All rights reserved.",
  );
  assert.equal(
    formatGuidedCopyrightNoticeValue(
      "release.rights.copyright",
      "All rights controlled by Example Music",
    ),
    null,
  );
});
