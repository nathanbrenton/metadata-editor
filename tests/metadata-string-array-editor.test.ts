import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);

test("preserves spaces and trailing newlines while editing string-array metadata", () => {
  const editorFunctionMatch = appSource.match(
    /function editorTextToStringArray\([\s\S]*?\n}\n\nfunction normalizeStringArrayEditorValue/,
  );

  assert.ok(editorFunctionMatch);
  assert.match(
    editorFunctionMatch[0],
    /return value\.split\("\\n"\);/,
  );
  assert.doesNotMatch(
    editorFunctionMatch[0],
    /\.map\(\(entry\) => entry\.trim\(\)\)/,
  );
  assert.doesNotMatch(
    editorFunctionMatch[0],
    /\.filter\(/,
  );
});

test("normalizes string-array whitespace only after editing or before save", () => {
  assert.match(
    appSource,
    /function normalizeStringArrayEditorValue\([\s\S]*?\.map\(\(entry\) => entry\.trim\(\)\)[\s\S]*?\.filter/,
  );
  assert.match(
    appSource,
    /onBlur=\{\(event\) =>[\s\S]*?normalizeStringArrayEditorValue\(/,
  );
  assert.match(
    appSource,
    /value: Array\.isArray\(value\)[\s\S]*?entry\.trim\(\)[\s\S]*?entry\.length > 0/,
  );
});

test("keeps the generic string-array editor one-value-per-line", () => {
  assert.match(appSource, /placeholder="One value per line"/);
  assert.match(appSource, /stringArrayToEditorText\(/);
  assert.match(appSource, /editorTextToStringArray\(/);
});
