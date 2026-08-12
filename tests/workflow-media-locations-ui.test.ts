import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("shows configured media roots as workflow-tab hover details", async () => {
  const source = await readFile(
    new URL("../src/WorkflowNavigation.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /locationById/);
  assert.match(
    source,
    /title=\{[\s\S]*?location[\s\S]*?location\.label[\s\S]*?location\.displayPath[\s\S]*?location\.purpose/,
  );
  assert.match(source, /displayPath/);
  assert.doesNotMatch(source, /workflow-location-strip/);
});

test("explains the private Library to Web Package storage boundary", async () => {
  const source = await readFile(
    new URL("../src/App.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /Library/);
  assert.match(source, /Web-ready output/);
  assert.match(source, /"media-library"/);
  assert.match(source, /"published-media"/);
  assert.doesNotMatch(source, /Validated snapshot output/i);
});


test("does not reserve a second workflow row for media paths", async () => {
  const styles = await readFile(
    new URL("../src/styles.css", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(styles, /\.workflow-location-strip/);
  assert.doesNotMatch(styles, /\.workflow-location-scroll/);
});
