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

test("keeps release-header artwork release-scoped and front-specific", () => {
  assert.match(appSource, /selectReleaseFrontArtwork\(\s*release\.artworkMasters/);
  assert.match(appSource, /selectReleaseFrontArtwork\(\s*release\?\.artworkMasters/);
});

test("shows local track artwork thumbnails in Library sidebar rows", () => {
  assert.match(appSource, /scannedTrack\?\.artworkMasters/);
  assert.match(appSource, /track-navigation-artwork/);
  assert.match(appSource, /trackArtwork\.relativePath/);
  assert.match(styleSource, /\.track-navigation-artwork/);
  assert.match(styleSource, /object-fit:\s*cover/);
});

test("documents release and track artwork scope in Workflow Help", () => {
  assert.match(helpSource, /release header displays only explicit release-scoped front artwork/i);
  assert.match(helpSource, /local track-artwork thumbnails/i);
});
