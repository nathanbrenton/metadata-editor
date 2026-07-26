import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const serverSource = await readFile(new URL("../server/index.ts", import.meta.url), "utf8");

test("uses the preview endpoint for library artwork while preserving original links", () => {
  assert.match(appSource, /function artworkPreviewUrl/);
  assert.match(appSource, /\/api\/library\/artwork-preview/);
  assert.match(appSource, /Read-only PNG from TIFF/);
  assert.match(appSource, /function artworkAssetUrl/);
});

test("exposes a confined read-only library artwork preview route", () => {
  assert.match(serverSource, /"\/api\/library\/artwork-preview"/);
  assert.match(serverSource, /renderTiffArtworkPreview/);
  assert.match(serverSource, /X-Artwork-Preview-Source/);
  assert.match(serverSource, /assertPathWithinRoot/);
});
