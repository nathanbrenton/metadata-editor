import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const previewSource = await readFile(
  new URL("../src/HiplingoPreviewPanel.tsx", import.meta.url),
  "utf8",
);
const styleSource = await readFile(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);

test("Library release overview can open the real Hiplingo renderer in-place", () => {
  assert.match(appSource, /HiplingoPreviewPanel/);
  assert.match(appSource, /Preview in Hiplingo/);
  assert.match(appSource, /selectedTrackKey=\{selectedTrackKey\}/);
  assert.match(previewSource, /http:\/\/127\.0\.0\.1:5173/);
  assert.match(previewSource, /VITE_HIPLINGO_PREVIEW_ORIGIN/);
  assert.match(previewSource, /Actual Hiplingo renderer · local package and live production/);
  assert.match(previewSource, /\["release", "Release"\]/);
  assert.match(previewSource, /\["releases", "Releases"\]/);
  assert.match(previewSource, /\["listen", "Listen"\]/);
  assert.match(previewSource, /\["desktop", "Desktop"\]/);
  assert.match(previewSource, /\["mobile", "Mobile"\]/);
  assert.match(previewSource, /<iframe/);
  assert.match(previewSource, /VITE_HIPLINGO_PUBLIC_ORIGIN/);
  assert.match(previewSource, /https:\/\/hiplingo\.com/);
  assert.match(previewSource, /\["single", "Single"\]/);
  assert.match(previewSource, /\["compare", "Split compare"\]/);
  assert.match(previewSource, />\s*Working\s*</);
  assert.match(previewSource, />\s*Web Package\s*</);
  assert.match(previewSource, />\s*Published\s*</);
  assert.match(previewSource, /Web Package ↔ Published/);
  assert.match(styleSource, /\.hiplingo-preview-panel/);
  assert.match(styleSource, /\.hiplingo-preview-panel__viewport--mobile/);
});

test("preview remains on the sanitized public-package boundary", () => {
  assert.match(previewSource, /Web Package/);
  assert.match(previewSource, /private Library files are never exposed/);
  assert.doesNotMatch(previewSource, /media-library/);
  assert.doesNotMatch(previewSource, /ingest-drop/);
  assert.match(previewSource, /Working Library preview will be enabled/);
  assert.match(previewSource, /Published\s+preview is read-only/);
});
