import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("offers a dry-run-first guarded release identity and directory rename", async () => {
  const source = await readFile(
    new URL("../src/App.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /Review release rename/);
  assert.match(source, /Preview release rename plan/);
  assert.match(source, /RENAME_RELEASE_DIRECTORY/);
  assert.match(source, /apply-release-rename/);
  assert.match(source, /Use date \+ title ID/);
  assert.match(source, /usesGuardedReleaseIdentity/);
  assert.match(source, /folder, references, receipt, and release ID stay synchronized/);
});
