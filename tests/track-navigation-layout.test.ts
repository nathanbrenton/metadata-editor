import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);

const styleSource = await readFile(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);

test("groups track identity and status badges into a stable sidebar heading", () => {
  assert.match(appSource, /track-document-select/);
  assert.match(appSource, /track-navigation-heading/);
  assert.match(appSource, /track-navigation-badges/);
  assert.match(appSource, /track-navigation-title/);
});

test("prevents track numbers from breaking while allowing two title lines", () => {
  assert.match(
    styleSource,
    /\.track-navigation-number > span\s*\{[\s\S]*?white-space:\s*nowrap;/,
  );

  assert.match(
    styleSource,
    /\.track-navigation-title\s*\{[\s\S]*?-webkit-line-clamp:\s*2;/,
  );
});

test("gives the desktop sidebar enough room for track status and playback", () => {
  assert.match(
    styleSource,
    /minmax\(13\.5rem,\s*15\.5rem\)/,
  );

  assert.match(
    styleSource,
    /\.metadata-track-preview-button\s*\{[\s\S]*?min-height:\s*4\.15rem;/,
  );
});
