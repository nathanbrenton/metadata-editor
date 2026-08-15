import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);

test("workflow refresh controls live with the workspace they affect", () => {
  const pageHeader = appSource.match(
    /<header className="page-header">[\s\S]*?<\/header>/,
  )?.[0];

  assert.ok(pageHeader);
  assert.doesNotMatch(
    pageHeader,
    /Refresh Ingest|Refresh inputs|Refresh Library|Rescan Library/,
  );

  assert.match(
    appSource,
    /function IngestView[\s\S]*?Refresh Ingest/,
  );
  assert.match(
    appSource,
    /function StagingWorkspace[\s\S]*?Refresh inputs/,
  );
  assert.match(
    appSource,
    /library-workspace-local-actions[\s\S]*?Rescan Library/,
  );
});

test("publication headers omit the technical storage diagram by default", () => {
  assert.doesNotMatch(
    appSource,
    /className="publish-header-storage-boundary"/,
  );
  assert.match(
    appSource,
    /<details className="publish-package-details">[\s\S]*?Web Package root/,
  );
  assert.match(
    appSource,
    /<details className="publish-live-connection-details">/,
  );
});

test("Live treats a valid deployment diff as neutral work to deploy", () => {
  assert.match(appSource, /"Changes to deploy"/);
  assert.doesNotMatch(appSource, /"Changes ready"/);
});
