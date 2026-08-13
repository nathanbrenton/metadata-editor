import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workspaceSource = readFileSync(
  new URL(
    "../src/StagingLibraryBuildWorkspace.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("existing-release Staging Build keeps the write gate in the workspace header", () => {
  const headerStart = workspaceSource.indexOf(
    '<header className="workflow-workspace-header staging-library-build-header">',
  );
  assert.notEqual(headerStart, -1);

  const headerEnd = workspaceSource.indexOf(
    "</header>",
    headerStart,
  );
  assert.notEqual(headerEnd, -1);

  const headerSource = workspaceSource.slice(
    headerStart,
    headerEnd,
  );

  assert.match(
    headerSource,
    /staging-library-build-header-confirmation/,
  );
  assert.match(
    headerSource,
    /Confirm waveform JSON-only build/,
  );
  assert.match(
    headerSource,
    /Build Library waveforms/,
  );
  assert.match(headerSource, /Back to Staging/);
  assert.match(headerSource, /Open in Library/);
  assert.doesNotMatch(
    workspaceSource,
    /staging-library-build-readiness/,
  );
});
