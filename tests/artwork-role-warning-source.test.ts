import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const scannerSource = await readFile(
  new URL("../server/scanner.ts", import.meta.url),
  "utf8",
);
const validatorSource = await readFile(
  new URL("../server/library-validator.ts", import.meta.url),
  "utf8",
);

test("scanner warnings compare only competing primary artwork masters", () => {
  assert.match(
    scannerSource,
    /const primaryReleaseArtworkMasters =/,
  );
  assert.match(
    scannerSource,
    /primaryReleaseArtworkMasters\.length > 1/,
  );
  assert.match(
    scannerSource,
    /const primaryTrackArtworkMasters =/,
  );
  assert.match(
    scannerSource,
    /primaryTrackArtworkMasters\.length > 1/,
  );
});

test("Library health compares only competing primary artwork masters", () => {
  assert.match(
    validatorSource,
    /const primaryReleaseArtworkMasters =/,
  );
  assert.match(
    validatorSource,
    /primaryReleaseArtworkMasters\.length > 1/,
  );
  assert.match(
    validatorSource,
    /Multiple primary release artwork masters were detected:/,
  );
  assert.match(
    validatorSource,
    /const primaryTrackArtworkMasters =/,
  );
  assert.match(
    validatorSource,
    /primaryTrackArtworkMasters\.length > 1/,
  );
});
