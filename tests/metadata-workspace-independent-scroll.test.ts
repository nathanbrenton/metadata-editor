import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);

test("keeps the desktop track sidebar independently scrollable while metadata follows the page", () => {
  assert.match(
    styles,
    /@media \(min-width: 48\.001rem\)[\s\S]*?\.release-metadata-workspace \{[\s\S]*?height: auto;[\s\S]*?align-items: start;[\s\S]*?overflow: visible;/,
  );
  assert.match(
    styles,
    /\.metadata-document-tabs \{[\s\S]*?position: sticky;[\s\S]*?max-height: calc\(100vh - 9rem\);[\s\S]*?overflow-y: auto;[\s\S]*?overscroll-behavior: contain;/,
  );
  assert.match(
    styles,
    /\.release-metadata-content \{[\s\S]*?max-height: none;[\s\S]*?overflow-x: auto;[\s\S]*?overflow-y: visible;/,
  );
});

test("keeps the compact layout in natural document flow", () => {
  assert.match(
    styles,
    /@media \(max-width: 48rem\)[\s\S]*?\.release-metadata-workspace \{[\s\S]*?display: block;/,
  );
  assert.match(
    styles,
    /@media \(max-width: 48rem\)[\s\S]*?\.metadata-document-tabs \{[\s\S]*?position: static;[\s\S]*?overflow-x: auto;/,
  );
});
