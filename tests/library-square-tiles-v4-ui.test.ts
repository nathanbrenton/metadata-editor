import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);

test("Library Tiles renders each release as a square artwork-first card", () => {
  assert.match(
    styles,
    /\.library-release-list--tiles \.library-release-card\s*\{[\s\S]*aspect-ratio:\s*1\s*\/\s*1[\s\S]*overflow:\s*hidden/,
  );

  assert.match(
    styles,
    /\.library-release-list--tiles \.release-artwork-tile > img\s*\{[\s\S]*width:\s*100%\s*!important[\s\S]*height:\s*100%\s*!important[\s\S]*object-fit:\s*cover\s*!important/,
  );

  assert.match(
    styles,
    /\.library-release-list--tiles \.release-summary\s*\{[\s\S]*position:\s*absolute[\s\S]*bottom:\s*0/,
  );
});

test("Library Tiles keeps one consolidated component block with minimal important overrides", () => {
  const start = styles.indexOf("/* Library Tiles view */");
  const end = styles.indexOf(
    "/* Publish operations & recovery */",
    start,
  );

  assert.notEqual(start, -1);
  assert.ok(end > start);

  const tileStyles = styles.slice(start, end);
  assert.equal(
    (tileStyles.match(/!important/g) ?? []).length,
    3,
    "Tiles should reserve !important only for full-card image precedence",
  );

  assert.doesNotMatch(
    styles,
    /grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(14rem,\s*1fr\)\)/,
  );
  assert.doesNotMatch(
    styles,
    /\.release-artwork-tile\s+(?:strong|small)/,
  );
  assert.doesNotMatch(
    styles,
    /\.release-artwork-tile:not\(:has\(img\)\)/,
  );
});
