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

test("Publish keeps technical storage roots out of the default Step 4 header", () => {
  const publish = appSource.slice(
    appSource.indexOf("function PublishWorkspace"),
    appSource.indexOf("type LibraryReleaseViewMode"),
  );

  assert.match(
    publish,
    /Step 4 · Web Package/,
  );
  assert.match(
    publish,
    /presentation="web-package-header"/,
  );
  assert.doesNotMatch(
    publish,
    /Ready Check · read-only/,
  );
  assert.doesNotMatch(
    publish,
    /className="publish-header-storage-boundary"/,
  );
  assert.match(
    publish,
    /<details className="publish-package-details">[\s\S]*?Web Package root/,
  );
  assert.match(
    publish,
    /<details className="publish-live-connection-details">/,
  );
  assert.doesNotMatch(
    publish,
    /<section className="publish-location-boundary"/,
  );
  assert.match(
    styles,
    /\.publish-package-location-detail/,
  );
  assert.match(
    styles,
    /\.publish-live-connection-details/,
  );
});

test("Ingest format guidance exposes the canonical Library filename", () => {
  assert.match(appSource, /canonicalMediaMasterFilename/);
  assert.match(
    appSource,
    /Canonical Library filename: \$\{canonicalFilename\}/,
  );
});
