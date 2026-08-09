import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const serverSource = await readFile(
  new URL("../server/index.ts", import.meta.url),
  "utf8",
);

test("Publish exposes exact read-only preflight and package destinations", () => {
  assert.match(appSource, /Review preflight/);
  assert.match(appSource, /Exact publish preflight/);
  assert.match(appSource, /Player-facing package plan/);
  assert.match(appSource, /writes disabled/i);
  assert.match(serverSource, /\/api\/publish\/plan/);
});

test("Publish readiness table uses compact media-count labels", () => {
  assert.match(
    appSource,
    /<th scope="col">Audio masters<\/th>/,
  );
  assert.match(
    appSource,
    /<th scope="col">Playback media<\/th>/,
  );
  assert.match(
    appSource,
    /<th scope="col">Artwork Sources<\/th>/,
  );
  assert.doesNotMatch(
    appSource,
    /\$\{readyMasters\}\/\$\{release\.tracks\.length\} unambiguous/,
  );
  assert.doesNotMatch(
    appSource,
    /\$\{playbackCount\}\/\$\{release\.tracks\.length\} available/,
  );
  assert.doesNotMatch(
    appSource,
    /\$\{artworkCount\} source/,
  );
});
