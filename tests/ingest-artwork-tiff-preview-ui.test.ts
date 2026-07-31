import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const builderSource = await readFile(
  new URL("../src/IngestReleaseBuilder.tsx", import.meta.url),
  "utf8",
);
const serverSource = await readFile(
  new URL("../server/ingest-artwork.ts", import.meta.url),
  "utf8",
);
const apiSource = await readFile(
  new URL("../server/index.ts", import.meta.url),
  "utf8",
);

test("shows TIFF artwork in Staging through a read-only PNG preview", () => {
  assert.match(
    builderSource,
    /stagingPreviewArtworkExtensions[\s\S]*"\.tif"[\s\S]*"\.tiff"/,
  );
  assert.match(builderSource, /TIFF → PNG preview/);
  assert.match(builderSource, /onError=\{\(\) =>[\s\S]*setPreviewFailed\(true\)/);
  assert.match(serverSource, /renderTiffArtworkPreview/);
  assert.match(serverSource, /contentType: "image\/png"/);
  assert.match(apiSource, /X-Ingest-Artwork-Preview-Source/);
});

test("keeps Staging artwork preview read-only", () => {
  assert.doesNotMatch(serverSource, /writeFile|rename|copyFile/);
  assert.match(serverSource, /assertPathWithinIngestRoot/);
  assert.match(serverSource, /Symbolic links cannot be previewed/);
});
