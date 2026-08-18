import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const workspaceSource = readFileSync(
  new URL(
    "../src/StagingLibraryBuildWorkspace.tsx",
    import.meta.url,
  ),
  "utf8",
);
const serverSource = readFileSync(
  new URL("../server/index.ts", import.meta.url),
  "utf8",
);
const helpSource = readFileSync(
  new URL(
    "../src/workflow-help-content.ts",
    import.meta.url,
  ),
  "utf8",
);

test("existing Staging releases can open candidate-free Build", () => {
  const staging = appSource.slice(
    appSource.indexOf("function StagingWorkspace"),
    appSource.indexOf("function assessPublishReadiness"),
  );

  assert.match(
    staging,
    /selectedBuildReleaseId/,
  );
  assert.match(
    staging,
    /<StagingLibraryBuildWorkspace/,
  );
  assert.match(
    staging,
    /className="staging-release-row staging-release-row--clickable"/,
  );
  assert.match(
    staging,
    /onClick=\{\(\) =>[\s\S]*?setSelectedBuildReleaseId\(release\.id\)/,
  );
  assert.match(
    staging,
    /event\.key === "Enter"[\s\S]*?event\.key === " "/,
  );
  assert.match(
    staging,
    /onLibraryChanged/,
  );
});

test("candidate-free Build previews and applies only Library waveforms", () => {
  assert.match(
    workspaceSource,
    /\/api\/staging\/library-build-plan/,
  );
  assert.match(
    workspaceSource,
    /\/api\/staging\/library-build/,
  );
  assert.match(
    workspaceSource,
    /create or refresh[\s\S]*?waveform-peaks\.wfp/i,
  );
  assert.match(
    workspaceSource,
    /does not[\s\S]*?replace masters[\s\S]*?metadata[\s\S]*?artwork[\s\S]*?numbering[\s\S]*?playback MP3s[\s\S]*?HLS/i,
  );
  assert.match(
    workspaceSource,
    /Build Library waveforms/,
  );
});

test("server exposes fingerprinted candidate-free Library Build routes", () => {
  assert.match(
    serverSource,
    /"\/api\/staging\/library-build-plan"/,
  );
  assert.match(
    serverSource,
    /buildStagingLibraryBuildPlan/,
  );
  assert.match(
    serverSource,
    /"\/api\/staging\/library-build"/,
  );
  assert.match(
    serverSource,
    /executeStagingLibraryBuild/,
  );
});

test("Workflow Help documents direct existing-release waveform repair", () => {
  assert.match(
    helpSource,
    /Click any existing release row to reopen its Build workspace without requiring a new Ingest candidate/,
  );
  assert.match(
    helpSource,
    /derivative-only plan/,
  );
});
