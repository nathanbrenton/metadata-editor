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

test("Web Package exposes guided Ready Check, preparation, and guarded package writes", () => {
  assert.match(appSource, /Ready Check is read-only/);
  assert.match(appSource, /publish-release-row/);
  assert.match(appSource, /Web Package Ready Check ·/);
  assert.match(appSource, /Technical package plan/);
  assert.match(appSource, /Prepare for Web/);
  assert.match(appSource, /Update Web Package/);
  assert.match(serverSource, /\/api\/publish\/plan/);
  assert.match(serverSource, /\/api\/publish\/prepare/);
  assert.match(serverSource, /\/api\/publish\/build/);
  assert.match(serverSource, /prepareReleaseMedia/);
  assert.match(serverSource, /publishReleasePackage/);
});

test("uses Publish for first publication and Update for later publication", () => {
  assert.match(
    appSource,
    /return publicReleaseAlreadyExists\(plan\)[\s\S]*?Update Web Package[\s\S]*?Prepare for Web/,
  );
  assert.doesNotMatch(
    appSource,
    /:\s*"Build public package"/,
  );
});

test("Web Package readiness table combines readiness and package state", () => {
  assert.match(appSource, /<th scope="col">Release<\/th>/);
  assert.match(appSource, /<th scope="col">Ready<\/th>/);
  assert.match(appSource, /<th scope="col">Web Package<\/th>/);
  assert.match(appSource, /webPackageReleaseStatus/);
  assert.match(appSource, /waveform checked in Ready Check/);
  assert.doesNotMatch(appSource, /<th scope="col">Current guidance<\/th>/);
  assert.doesNotMatch(appSource, /<th scope="col">Publication<\/th>/);
  assert.doesNotMatch(appSource, />Dry-run only<\/span>/);
});

test("Web Package readiness overview uses each release row as the Ready Check action", () => {
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
    '{selectedPlan && mode === "public-package" && (',
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
    /Continue to Ready Check/,
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

test("Web Package Ready Check keeps technical detail collapsed behind one next-step result", () => {
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
  assert.match(publishWorkspaceSource, /Prepare for Web/);
  assert.match(publishWorkspaceSource, /Update Web Package/);
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
  assert.match(publishWorkspaceSource, /Building…/);
  assert.match(
    publishWorkspaceSource,
    /planFingerprint:\s*plan\.planFingerprint/,
  );
  assert.match(
    publishWorkspaceSource,
    /planGeneratedAt:\s*plan\.generatedAt/,
  );
});
