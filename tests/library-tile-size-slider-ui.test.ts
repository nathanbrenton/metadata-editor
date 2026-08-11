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
const helpSource = await readFile(
  new URL("../src/workflow-help-content.ts", import.meta.url),
  "utf8",
);

test("Library Tiles exposes a reset-on-refresh tile-size slider only in Tiles view", () => {
  assert.doesNotMatch(
    appSource,
    /LIBRARY_TILE_SIZE_STORAGE_KEY/,
  );
  assert.doesNotMatch(
    appSource,
    /function readLibraryTileSizeRem/,
  );
  assert.match(
    appSource,
    /const LIBRARY_TILE_SIZE_STEP_REM = 0\.25;/,
  );
  assert.match(
    appSource,
    /const LIBRARY_TILE_SIZE_DEFAULT_REM = 16;/,
  );
  assert.match(appSource, /const \[tileSizeRem, setTileSizeRem\]/);
  assert.match(
    appSource,
    /useState<number>\(LIBRARY_TILE_SIZE_DEFAULT_REM\)/,
  );
  assert.match(appSource, /\{viewMode === "tiles" && \(/);
  assert.match(appSource, /className="library-tile-size-control"/);
  assert.match(appSource, /type="range"/);
  assert.match(appSource, /aria-label="Library tile size"/);
  assert.match(
    appSource,
    /step=\{LIBRARY_TILE_SIZE_STEP_REM\}/,
  );
  assert.match(
    appSource,
    /gridTemplateColumns:[\s\S]*minmax\(\$\{tileSizeRem\}rem, 1fr\)/,
  );
});

test("Library Tile size slider keeps the square Tiles layout untouched", () => {
  assert.match(
    styleSource,
    /\/\* Library square Tiles view v4 \*\//,
  );
  assert.match(
    styleSource,
    /\.library-release-list--tiles \.library-release-card\s*\{[\s\S]*aspect-ratio:\s*1\s*\/\s*1\s*!important/,
  );
  assert.match(styleSource, /\.library-tile-size-control\s*\{/);
});

test("Workflow Help documents the reset-on-refresh Tile size behavior without changing Rows or Cards", () => {
  assert.match(helpSource, /starts at 16rem on each browser load/);
  assert.match(helpSource, /resets on refresh instead of being persisted/);
  assert.match(helpSource, /without changing Rows or Cards/);
});
