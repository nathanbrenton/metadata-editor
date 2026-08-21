import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);

test("multiline metadata editor keeps textarea and helper content full width", () => {
  const start = styles.indexOf(".metadata-multiline-field {");
  const end = styles.indexOf(
    ".publish-package-location-detail",
    start,
  );

  assert.notEqual(start, -1);
  assert.ok(end > start);

  const block = styles.slice(start, end);

  assert.match(
    block,
    /grid-template-columns:\s*minmax\(0,\s*1fr\)/,
  );
  assert.match(
    block,
    /\.metadata-multiline-field textarea,[\s\S]*?\.metadata-multiline-field \.changed-indicator\s*\{[\s\S]*?grid-column:\s*1\s*\/\s*-1/,
  );
  assert.match(
    block,
    /\.metadata-multiline-help\s*\{[\s\S]*?line-height:\s*1\.45/,
  );
});

test("multiline metadata editor keeps modified status below the textarea", () => {
  const start = styles.indexOf(".metadata-multiline-field {");
  const end = styles.indexOf(
    ".publish-package-location-detail",
    start,
  );
  const block = styles.slice(start, end);

  assert.match(
    block,
    /\.metadata-multiline-field \.changed-indicator\s*\{[\s\S]*?justify-self:\s*start/,
  );
});
