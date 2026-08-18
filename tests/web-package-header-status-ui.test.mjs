import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);

test("Web Package header reduces advisory status badges to actionable severity", () => {
  const componentStart = appSource.indexOf(
    "function TechnicalAuditSummaryBadge",
  );
  assert.notEqual(componentStart, -1);

  const componentEnd = appSource.indexOf(
    "function technicalInventoryEntryLabel",
    componentStart,
  );
  assert.notEqual(componentEnd, -1);

  const component = appSource.slice(componentStart, componentEnd);

  assert.match(component, /presentation\?: "standard" \| "web-package-header"/);
  assert.match(component, /"1 technical note"/);
  assert.match(component, /technical notes/);
  assert.match(component, /className="badge preview technical-contract-badge"/);
  assert.match(component, /"1 technical block"/);
  assert.match(component, /className="badge error technical-contract-badge"/);
  assert.match(
    component,
    /Non-blocking technical advisory; Web Package readiness is unchanged\./,
  );
});

test("Web Package header removes the redundant Ready Check read-only warning badge", () => {
  const workspaceStart = appSource.indexOf(
    '<section className={`workflow-workspace publish-workspace',
  );
  assert.notEqual(workspaceStart, -1);

  const workspaceHeaderEnd = appSource.indexOf(
    "</header>",
    workspaceStart,
  );
  assert.notEqual(workspaceHeaderEnd, -1);

  const header = appSource.slice(workspaceStart, workspaceHeaderEnd);

  assert.match(header, /presentation="web-package-header"/);
  assert.doesNotMatch(header, /Ready Check · read-only/);
  assert.doesNotMatch(header, /className="badge warning publish-read-only-status"/);
  assert.match(
    header,
    /Target comparison · read-only/,
    "Live target comparison remains explicitly read-only",
  );
});
