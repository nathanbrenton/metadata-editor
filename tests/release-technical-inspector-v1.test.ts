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

test("release technical summary carries inventory needed by the UI inspector", () => {
  assert.match(appSource, /type MediaTechnicalInventory = \{/);
  assert.match(
    appSource,
    /type MediaTechnicalReleaseSummary = \{[\s\S]*inventory: MediaTechnicalInventory;[\s\S]*summary: \{/,
  );
  assert.match(appSource, /function TechnicalReleaseInspector/);
  assert.match(appSource, /Canonical master inspection/);
});

test("Library release detail exposes technical health inside the release health workflow", () => {
  assert.match(
    appSource,
    /<ReleaseMetadataDetailView[\s\S]*technicalAudit=\{mediaTechnicalAudit\}[\s\S]*technicalSummary=\{mediaTechnicalByRelease\.get\(/,
  );
  assert.match(
    appSource,
    /aria-label="Release health details"[\s\S]*<TechnicalReleaseInspector[\s\S]*summary=\{technicalSummary\}/,
  );
  assert.match(
    appSource,
    /metadata-health-summary[\s\S]*<TechnicalHealthBadge[\s\S]*summary=\{technicalSummary\}/,
  );
});

test("Web Package Ready Check reuses the same per-release technical inspector without changing gating", () => {
  assert.match(
    appSource,
    /<TechnicalReleaseInspector[\s\S]*summary=\{technicalByRelease\.get\(selectedPlan\.releaseId\)\}[\s\S]*compact/,
  );

  const canBuild = appSource.match(
    /function canBuildPublishPlan\([\s\S]*?\n\}/,
  )?.[0] ?? "";
  assert.ok(canBuild.length > 0);
  assert.doesNotMatch(canBuild, /technical/i);
});

test("technical inventory uses dense desktop columns and collapses on narrower layouts", () => {
  assert.match(
    styles,
    /\.technical-release-domains[\s\S]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/,
  );
  assert.match(
    styles,
    /@media \(max-width: 980px\)[\s\S]*\.technical-release-domains[\s\S]*grid-template-columns:\s*1fr/,
  );
});
