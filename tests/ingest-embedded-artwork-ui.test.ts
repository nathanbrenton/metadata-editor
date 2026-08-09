import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/IngestReleaseBuilder.tsx", import.meta.url), "utf8");

test("shows embedded artwork in Staging Artwork & files with a preview", () => {
  assert.match(source, /Embedded cover/);
  assert.match(source, /embeddedArtwork=\{asset\.embeddedArtwork\}/);
  assert.match(source, /parameters\.set\("stream"/);
  assert.match(source, /Embedded artwork/);
});
