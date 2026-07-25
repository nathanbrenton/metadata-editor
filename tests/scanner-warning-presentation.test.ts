import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const panelSource = await readFile(
  new URL("../src/ScannerWarningPanel.tsx", import.meta.url),
  "utf8",
);
const styleSource = await readFile(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);

test("lazy-loads scanner warnings with an amber count and guidance", () => {
  assert.match(appSource, /LazyScannerWarningPanel/);
  assert.match(appSource, /\.\/ScannerWarningPanel\.js/);
  assert.match(panelSource, /scanner-warning-panel/);
  assert.match(panelSource, /scanner-warning-count/);
  assert.match(panelSource, /non-blocking library conditions/);
  assert.match(styleSource, /\.scanner-warning-panel\s*\{/);
  assert.match(styleSource, /border-color:\s*#8a6124/);
  assert.match(styleSource, /box-shadow:\s*inset 0\.25rem 0 0 #d89a3d/);
});
