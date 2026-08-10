import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const styles = await readFile(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);
const helpSource = await readFile(
  new URL("../src/workflow-help-content.ts", import.meta.url),
  "utf8",
);

test("Staging defaults to newest release date and keeps the path hover on release text", () => {
  const staging = appSource.slice(
    appSource.indexOf("function StagingWorkspace"),
    appSource.indexOf("function assessPublishReadiness"),
  );

  assert.match(staging, /useState<LibraryReleaseSortMode>\("date-desc"\)/);
  assert.match(staging, /sortedReleases\.map/);
  assert.match(staging, /Release date · newest/);
  assert.match(
    staging,
    /<span[\s\S]*?className="staging-release-identity"[\s\S]*?title=\{`Library path: \$\{release\.relativePath\}`\}/,
  );
  assert.match(
    staging,
    /<th scope="row">[\s\S]*?<span[\s\S]*?className="staging-release-identity"[\s\S]*?title=\{`Library path: \$\{release\.relativePath\}`\}/,
  );
  assert.match(styles, /\.staging-release-table\s*\{[\s\S]*?min-width:\s*0/);
});

test("Library defaults to expanded cards sorted by newest release date", () => {
  assert.match(
    appSource,
    /function readLibraryReleaseViewMode\(\)[\s\S]*?return "cards";/,
  );
  assert.match(
    appSource,
    /function readLibraryReleaseSortMode\(\)[\s\S]*?return "date-desc";/,
  );
});

test("Publish defaults to newest release date and renders a sort selector", () => {
  const publish = appSource.slice(
    appSource.indexOf("function PublishWorkspace"),
    appSource.indexOf("type LibraryReleaseViewMode"),
  );

  assert.match(publish, /useState<LibraryReleaseSortMode>\("date-desc"\)/);
  assert.match(publish, /sortedReleases\.map/);
  assert.match(publish, /workspace-release-sort-control/);
  assert.match(publish, /Release date · newest/);
});

test("Workflow help documents the file-spec tier distinction", () => {
  assert.match(helpSource, /preferred happy-path formats/i);
  assert.match(helpSource, /broader accepted compatibility formats/i);
  assert.match(helpSource, /JSON and TXT/i);
});
