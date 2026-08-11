import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);

test("Library tile sizing offers finer increments and starts near the middle", () => {
  assert.match(
    appSource,
    /const LIBRARY_TILE_SIZE_MIN_REM = 9;/,
  );
  assert.match(
    appSource,
    /const LIBRARY_TILE_SIZE_MAX_REM = 24;/,
  );
  assert.match(
    appSource,
    /const LIBRARY_TILE_SIZE_STEP_REM = 0\.25;/,
  );
  assert.match(
    appSource,
    /const LIBRARY_TILE_SIZE_DEFAULT_REM = 16;/,
  );
  assert.match(
    appSource,
    /step=\{LIBRARY_TILE_SIZE_STEP_REM\}/,
  );
});

test("Library tile sizing resets to its default after a browser refresh", () => {
  assert.match(
    appSource,
    /useState<number>\(LIBRARY_TILE_SIZE_DEFAULT_REM\)/,
  );
  assert.doesNotMatch(
    appSource,
    /metadata-editor\.library-tile-size-rem/,
  );
  assert.doesNotMatch(
    appSource,
    /readLibraryTileSizeRem/,
  );
});
