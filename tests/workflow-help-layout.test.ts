import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../src/WorkflowHelpView.tsx", import.meta.url),
  "utf8",
);

test("renders a compact four-workspace guide instead of the full feature-reference corpus", () => {
  assert.match(source, /Four workspaces/);
  assert.match(source, /What matters/);
  assert.match(source, /Common questions/);
  assert.match(source, /audit:media-technical/);
  assert.doesNotMatch(source, /workflowStages\.map/);
  assert.doesNotMatch(source, /workflowFaqItems\.map/);
  assert.doesNotMatch(source, /Implementation status matters/);
});
