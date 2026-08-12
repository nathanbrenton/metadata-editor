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
const helpSource = await readFile(
  new URL("../src/workflow-help-content.ts", import.meta.url),
  "utf8",
);

test("loads technical media health once per Library scan and shares it across workspaces", () => {
  const requests = appSource.match(
    /fetch\("\/api\/library\/media-technical"/g,
  ) ?? [];

  assert.equal(requests.length, 1);
  assert.match(appSource, /const \[mediaTechnicalAudit, setMediaTechnicalAudit\]/);
  assert.match(appSource, /technicalAudit=\{mediaTechnicalAudit\}/);
  assert.match(appSource, /technicalByRelease=\{mediaTechnicalByRelease\}/);
});

test("surfaces compact advisory technical health in Library and Web Package", () => {
  assert.match(appSource, /function TechnicalHealthBadge/);
  assert.match(appSource, /function TechnicalAuditSummaryBadge/);
  assert.match(appSource, /Technical · \{label\}/);
  assert.match(
    appSource,
    /summary=\{technicalByRelease\.get\(selectedPlan\.releaseId\)\}/,
  );
  assert.match(
    appSource,
    /Advisory technical health only; this does not change Web Package readiness/,
  );
});

test("keeps the technical audit read-only and outside Publish gating", () => {
  assert.match(serverSource, /auditMediaLibraryTechnical/);
  assert.match(
    serverSource,
    /requestUrl\.pathname === "\/api\/library\/media-technical"/,
  );
  assert.match(
    helpSource,
    /technical media health[\s\S]*advisory[\s\S]*Publish gating/i,
  );
});
