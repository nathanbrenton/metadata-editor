import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const serverSource = await readFile(
  new URL("../server/index.ts", import.meta.url),
  "utf8",
);

test("Publish exposes guided preflight, preparation, and guarded package writes", () => {
  assert.match(appSource, /Choose a release row to open its preflight/);
  assert.match(appSource, /publish-release-row/);
  assert.match(appSource, /Publish preflight ·/);
  assert.match(appSource, /Technical package plan/);
  assert.match(appSource, /Publish public package/);
  assert.match(appSource, /Update public package/);
  assert.match(serverSource, /\/api\/publish\/plan/);
  assert.match(serverSource, /\/api\/publish\/prepare/);
  assert.match(serverSource, /\/api\/publish\/build/);
  assert.match(serverSource, /prepareReleaseMedia/);
  assert.match(serverSource, /publishReleasePackage/);
});

test("uses Publish for first publication and Update for later publication", () => {
  assert.match(
    appSource,
    /return publicReleaseAlreadyExists\(plan\)[\s\S]*?Update public package[\s\S]*?Publish public package/,
  );
  assert.doesNotMatch(
    appSource,
    /:\s*"Build public package"/,
  );
});

test("Publish readiness table groups source and public-media readiness", () => {
  assert.match(appSource, /<th scope="col">Release<\/th>/);
  assert.match(appSource, /<th scope="col">Sources<\/th>/);
  assert.match(appSource, /<th scope="col">Public media<\/th>/);
  assert.match(appSource, /<th scope="col">Status<\/th>/);
  assert.match(appSource, /<span>Metadata<\/span>/);
  assert.match(appSource, /<span>Masters<\/span>/);
  assert.match(appSource, /<span>Artwork<\/span>/);
  assert.match(appSource, /<span>Web stream<\/span>/);
  assert.match(appSource, /<span>Waveforms<\/span>/);
  assert.match(appSource, /Checked in preflight/);
  assert.doesNotMatch(appSource, /<th scope="col">Current guidance<\/th>/);
  assert.doesNotMatch(appSource, /<th scope="col">Publication<\/th>/);
  assert.doesNotMatch(appSource, />Dry-run only<\/span>/);
});

test("Publish readiness overview uses each release row as the preflight action", () => {
  const workspaceStart = appSource.indexOf(
    "function PublishWorkspace",
  );
  const workspaceEnd = appSource.indexOf(
    "function IngestView",
    workspaceStart,
  );

  assert.notEqual(workspaceStart, -1);
  assert.notEqual(workspaceEnd, -1);

  const publishWorkspaceSource = appSource.slice(
    workspaceStart,
    workspaceEnd,
  );

  const overviewStart = publishWorkspaceSource.indexOf(
    '<table className="workflow-workspace-table publish-readiness-table">',
  );
  const overviewEnd = publishWorkspaceSource.indexOf(
    "{selectedPlan && (",
    overviewStart,
  );

  assert.notEqual(overviewStart, -1);
  assert.notEqual(overviewEnd, -1);

  const readinessOverviewSource =
    publishWorkspaceSource.slice(
      overviewStart,
      overviewEnd,
    );

  assert.match(
    readinessOverviewSource,
    /"publish-release-row"/,
  );
  assert.match(
    readinessOverviewSource,
    /loadPublishPlan\(release\.id\)/,
  );
  assert.match(
    readinessOverviewSource,
    /event\.key === "Enter"/,
  );
  assert.match(
    readinessOverviewSource,
    /event\.key === " "/,
  );
  assert.doesNotMatch(
    readinessOverviewSource,
    /<th[^>]*>Next step<\/th>/,
  );
  assert.doesNotMatch(
    readinessOverviewSource,
    /Continue to preflight/,
  );
  assert.doesNotMatch(
    readinessOverviewSource,
    /publish-next-step-action/,
  );
});

test("Publish readiness rows include release artwork thumbnails", () => {
  const start = appSource.indexOf("function PublishWorkspace");
  const end = appSource.indexOf("function IngestView", start);

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  const publishWorkspaceSource = appSource.slice(start, end);

  assert.match(publishWorkspaceSource, /publish-release-thumbnail/);
  assert.match(publishWorkspaceSource, /selectReleaseFrontArtwork/);
  assert.match(publishWorkspaceSource, /selectPreferredReleaseArtwork/);
  assert.match(publishWorkspaceSource, /artworkPreviewUrl/);
  assert.match(publishWorkspaceSource, /No art/);
});

test("Publish preflight keeps technical detail collapsed behind one next-step result", () => {
  const start = appSource.indexOf("function publishPreflightHeadline");
  const end = appSource.indexOf("function IngestView", start);

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  const publishWorkspaceSource = appSource.slice(start, end);

  assert.match(publishWorkspaceSource, /publish-preflight-primary/);
  assert.match(publishWorkspaceSource, /publishPreflightHeadline/);
  assert.match(publishWorkspaceSource, /publishNextStepLabel/);
  assert.match(publishWorkspaceSource, /Resolve blockers/);
  assert.match(publishWorkspaceSource, /Prepare release/);
  assert.match(publishWorkspaceSource, /Publish public package/);
  assert.match(publishWorkspaceSource, /Update public package/);
  assert.match(publishWorkspaceSource, /HLS/);
  assert.match(publishWorkspaceSource, /selectedPlan\.webStreams/);
  assert.match(publishWorkspaceSource, /selectedPlan\.waveforms/);
  assert.match(publishWorkspaceSource, /Browser artwork/);
  assert.match(publishWorkspaceSource, /payload\.artworkCount/);
  assert.match(publishWorkspaceSource, /selectedPlan\.libraryPlayback/);
  assert.match(publishWorkspaceSource, /Prepare Library MP3s/);
  assert.match(publishWorkspaceSource, /canPrepareLibraryPlayback/);
  assert.doesNotMatch(publishWorkspaceSource, /<span>Playback<\/span>/);
  assert.match(publishWorkspaceSource, /<details className="publish-plan-disclosure publish-plan-issues">/);
  assert.match(publishWorkspaceSource, /<details className="publish-plan-disclosure publish-plan-items">/);
  assert.match(publishWorkspaceSource, /<details className="publish-plan-disclosure publish-plan-contract">/);
  assert.doesNotMatch(publishWorkspaceSource, /<details[^>]*\sopen(?:=|>)/);
  assert.match(publishWorkspaceSource, /canPreparePublishPlan/);
  assert.match(
    appSource,
    /hasMediaPreparationPublishBlockers/,
  );
  assert.match(
    appSource,
    /browser-artwork-preparation-required/,
  );
  assert.match(publishWorkspaceSource, /canBuildPublishPlan/);
  assert.match(publishWorkspaceSource, /prepareRelease/);
  assert.match(publishWorkspaceSource, /publishRelease/);
  assert.match(publishWorkspaceSource, /\/api\/publish\/prepare/);
  assert.match(publishWorkspaceSource, /\/api\/publish\/build/);
  assert.match(publishWorkspaceSource, /Preparing…/);
  assert.match(publishWorkspaceSource, /Publishing…/);
  assert.match(
    publishWorkspaceSource,
    /planFingerprint:\s*plan\.planFingerprint/,
  );
  assert.match(
    publishWorkspaceSource,
    /planGeneratedAt:\s*plan\.generatedAt/,
  );
});
