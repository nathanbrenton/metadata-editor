import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const viteConfigSource = await readFile(
  new URL("../vite.config.ts", import.meta.url),
  "utf8",
);

test("splits third-party dependencies into a stable vendor chunk", () => {
  assert.match(viteConfigSource, /rolldownOptions/);
  assert.match(viteConfigSource, /codeSplitting/);
  assert.match(viteConfigSource, /name:\s*["']vendor["']/);
  assert.match(viteConfigSource, /test:\s*\/node_modules/);
});

test("does not hide bundle growth by raising Vite's warning threshold", () => {
  assert.doesNotMatch(viteConfigSource, /chunkSizeWarningLimit/);
});
