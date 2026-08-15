import assert from "node:assert/strict";
import {
  readFile,
} from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL(
    "../src/App.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("defers the Staging Library build workspace out of the initial application chunk", () => {
  assert.doesNotMatch(
    appSource,
    /import \{[\s\S]*StagingLibraryBuildWorkspace[\s\S]*from "\.\/StagingLibraryBuildWorkspace\.js"/,
  );
  assert.match(
    appSource,
    /const StagingLibraryBuildWorkspace = lazy\(async \(\) => \{[\s\S]*import\([\s\S]*"\.\/StagingLibraryBuildWorkspace\.js"/,
  );
  assert.match(
    appSource,
    /<Suspense[\s\S]*Loading Staging build workspace…[\s\S]*<StagingLibraryBuildWorkspace/,
  );
});
