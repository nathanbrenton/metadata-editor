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
    /\.library-release-list--tiles \.library-release-card\s*\{[\s\S]*aspect-ratio:\s*1\s*\/\s*1\s*!important[\s\S]*overflow:\s*hidden\s*!important/,
  );

  assert.match(
    styles,
    /\.library-release-list--tiles \.release-artwork-tile > img\s*\{[\s\S]*width:\s*100%\s*!important[\s\S]*height:\s*100%\s*!important[\s\S]*object-fit:\s*cover\s*!important/,
  );

  assert.match(
    styles,
    /\.library-release-list--tiles \.release-summary\s*\{[\s\S]*position:\s*absolute\s*!important[\s\S]*bottom:\s*0/,
  );
});
