import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);

test("weights workflow navigation by expected interaction frequency", () => {
  assert.match(
    styles,
    /\.workflow-navigation-region\s*\{[\s\S]*?--workflow-stage-columns:[\s\S]*?minmax\(11rem,\s*3fr\)[\s\S]*?minmax\(15rem,\s*5fr\)[\s\S]*?minmax\(20rem,\s*7fr\)[\s\S]*?minmax\(15rem,\s*4fr\)[\s\S]*?minmax\(13rem,\s*3fr\)/,
  );

  assert.match(
    styles,
    /\.application-tabs\.workflow-navigation\s*\{[\s\S]*?grid-template-columns:\s*var\(\s*--workflow-stage-columns/,
  );
});

test("does not render a dedicated workflow-location grid", () => {
  assert.doesNotMatch(
    styles,
    /\.workflow-location-strip/,
  );
});
