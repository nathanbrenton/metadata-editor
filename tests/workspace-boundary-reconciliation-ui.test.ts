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

test("Staging keeps Choose ingest candidate inside the explicit Ingest candidate card", () => {
  const staging = appSource.slice(
    appSource.indexOf("function StagingWorkspace"),
    appSource.indexOf("function assessPublishReadiness"),
  );

  assert.match(staging, /No Ingest candidate selected/);
  assert.doesNotMatch(
    staging,
    /<strong>No candidate selected<\/strong>/,
  );
  assert.match(
    staging,
    /staging-ingest-candidate-notice[\s\S]*?Choose ingest candidate/,
  );

  const header = staging.slice(
    staging.indexOf(
      '<header className="workflow-workspace-header">',
    ),
    staging.indexOf("</header>") + "</header>".length,
  );

  assert.doesNotMatch(header, /Choose ingest candidate/);
});

test("Publish embeds its blue-private amber-public boundary inside the Step 4 header", () => {
  const publish = appSource.slice(
    appSource.indexOf("function PublishWorkspace"),
    appSource.indexOf("type LibraryReleaseViewMode"),
  );

  assert.match(
    publish,
    /Step 4 · Publish[\s\S]*?publish-header-storage-boundary/,
  );
  assert.match(publish, /className="private"/);
  assert.match(publish, /className="planned"/);
  assert.doesNotMatch(
    publish,
    /<section className="publish-location-boundary"/,
  );
  assert.match(
    styles,
    /\.publish-header-storage-boundary > \.private/,
  );
  assert.match(
    styles,
    /\.publish-header-storage-boundary > \.planned/,
  );
});

test("Ingest format guidance exposes the canonical Library filename", () => {
  assert.match(appSource, /canonicalMediaMasterFilename/);
  assert.match(
    appSource,
    /Canonical Library filename: \$\{canonicalFilename\}/,
  );
});
