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

test("Web Package exposes directional review, preparation, and guarded package writes", () => {
  assert.match(appSource, /selectedPlanIntent === "make-public"/);
  assert.match(appSource, /"Review before making public"/);
  assert.match(appSource, /"Review before making private"/);
  assert.match(appSource, /"Web Package Ready Check"/);
  assert.match(appSource, /canPreparePublishPlan\(selectedPlan\)/);
  assert.match(appSource, /canPrepareVideoPublishPlan\(selectedPlan\)/);
  assert.match(appSource, /void publishRelease\(selectedPlan\)/);
  assert.match(appSource, /Make Public/);
  assert.match(appSource, /Make Private/);
});

test("uses Publish for first publication and Update for later publication", () => {
  assert.match(
    appSource,
    /return publicReleaseAlreadyExists\(plan\)[\s\S]*?Update Web Package[\s\S]*?Make Public/,
  );
  assert.doesNotMatch(
    appSource,
    /:\s*"Build public package"/,
  );
});

test("Web Package table makes explicit Public and Private visibility", () => {
  assert.match(appSource, /role="switch"/);
  assert.match(
    appSource,
    /aria-checked=\{webPackageMembership\.label === "Included"\}/,
  );
  assert.match(appSource, /Private \/ Local/);
  assert.match(appSource, /Selected for a future Live deployment/);
  assert.match(
    appSource,
    /Library only · not in the public Web Package/,
  );
  assert.match(
    appSource,
    /Visibility:<\/strong> releases are <strong>Private \/ Local by default<\/strong>/,
  );
  assert.match(
    appSource,
    /Public means included in the local Web Package and eligible for a future Live deployment/,
  );
});

test("Web Package readiness overview uses explicit package review instead of row clicks", () => {
  const tableStart = appSource.indexOf(
    '<table className="workflow-workspace-table publish-readiness-table">',
  );
  const tableEnd = appSource.indexOf("<details", tableStart);

  assert.notEqual(tableStart, -1);
  assert.notEqual(tableEnd, -1);

  const table = appSource.slice(tableStart, tableEnd);

  assert.match(table, /role="switch"/);
  assert.match(table, /Review package/);
  assert.match(
    table,
    /openPublishPlan\(release\.id, "package"\)/,
  );
  assert.doesNotMatch(
    table,
    /onClick=\{\(\) => \{\s*if \(mode === "public-package"[\s\S]*?loadPublishPlan\(release\.id\)/,
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
  assert.match(publishWorkspaceSource, /Make Public/);
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
