import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const styles = await readFile(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);

test("Library keeps navigation and rescan together in one toolbar", () => {
  assert.match(
    appSource,
    /function LibraryEntitySwitcher[\s\S]*?library-entity-switcher__views[\s\S]*?Releases[\s\S]*?Artists[\s\S]*?library-entity-switcher__rescan[\s\S]*?Rescan Library/,
  );
  assert.doesNotMatch(
    appSource,
    /library-workspace-local-actions/,
  );
  assert.match(
    styles,
    /\.library-entity-switcher\s*\{[\s\S]*?width:\s*100%;[\s\S]*?justify-content:\s*space-between;/,
  );
});

test("Library release overview puts Edit metadata in the release card", () => {
  const overviewStart = appSource.indexOf(
    'function LibraryReleaseOverview',
  );
  const overviewEnd = appSource.indexOf(
    'function LibraryArtistRoster',
  );

  assert.notEqual(overviewStart, -1);
  assert.notEqual(overviewEnd, -1);

  const overviewSource = appSource.slice(
    overviewStart,
    overviewEnd,
  );

  assert.doesNotMatch(
    overviewSource,
    /library-release-overview-toolbar/,
  );
  assert.match(
    overviewSource,
    /library-release-overview-copy-header[\s\S]*?Edit metadata/,
  );
  assert.match(
    styles,
    /\.library-release-overview-copy-header\s*\{[\s\S]*?justify-content:\s*space-between;/,
  );
  assert.match(
    styles,
    /\.library-release-overview-edit\s*\{[\s\S]*?margin-left:\s*auto;/,
  );
});
