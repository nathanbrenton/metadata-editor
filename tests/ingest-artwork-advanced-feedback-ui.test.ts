import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const builderSource = readFileSync(
  new URL("../src/IngestReleaseBuilder.tsx", import.meta.url),
  "utf8",
);
const helpSource = readFileSync(
  new URL("../src/workflow-help-content.ts", import.meta.url),
  "utf8",
);

test("advanced artwork role and scope changes confirm immediately", () => {
  assert.match(
    builderSource,
    /artworkRoleLabel\(assignment\.role\)/,
  );
  assert.match(
    builderSource,
    /advancedAssignmentChanged[\s\S]*?previous\.scope[\s\S]*?previous\.role/,
  );
  assert.match(
    builderSource,
    /assignment updated: \$\{assignmentLabel\(advancedAssignmentChanged, tracks\)\}[\s\S]*?"success"/,
  );
  assert.match(
    helpSource,
    /Role and scope selections[\s\S]*?success toast/i,
  );
});

test("advanced artwork add button is clearly a row-creation action", () => {
  assert.match(
    builderSource,
    /asset\.artworkAssignments\.length > 0[\s\S]*?"Add another assignment"[\s\S]*?"Add artwork assignment"/,
  );
});
