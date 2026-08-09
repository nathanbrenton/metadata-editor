import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("shows configured media roots under the four workflow stages", async () => {
  const source = await readFile(
    new URL("../src/WorkflowNavigation.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /workflow-location-scroll/);
  assert.match(source, /workflow-location-strip/);
  assert.match(source, /Workflow media locations/);
  assert.match(source, /Preflight only · no writes/);
  assert.match(source, /displayPath/);
});

test("explains the private-to-public publish storage boundary", async () => {
  const source = await readFile(
    new URL("../src/App.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /Private canonical source/);
  assert.match(source, /Sanitized public output/);
  assert.match(source, /nothing is copied yet/i);
});


test("keeps the location strip horizontally contained on narrower windows", async () => {
  const styles = await readFile(
    new URL("../src/styles.css", import.meta.url),
    "utf8",
  );

  assert.match(styles, /\.workflow-location-scroll\s*\{[\s\S]*?overflow-x:\s*auto/);
});
