import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const navSource = await readFile(new URL("../src/WorkflowNavigation.tsx", import.meta.url), "utf8");
const locationSource = await readFile(new URL("../server/workflow-locations.ts", import.meta.url), "utf8");
const helpSource = await readFile(new URL("../src/WorkflowHelpView.tsx", import.meta.url), "utf8");

test("separates Library, Web Package, and Live in navigation", () => {
  assert.match(navSource, /label: "Library"[\s\S]*Private canonical source of truth/);
  assert.match(navSource, /label: "Web Package"[\s\S]*Hiplingo web app/);
  assert.match(navSource, /label: "Live"[\s\S]*Hiplingo visitors/);
  assert.match(locationSource, /id: "public-package"[\s\S]*Sanitized web-ready output prepared from the private Library/);
  assert.doesNotMatch(locationSource, /id: "production"/);
});

test("Web Package and Live reuse the guarded publication workspace with different modes", () => {
  assert.match(appSource, /mode=\{applicationView === "production" \? "production" : "public-package"\}/);
  assert.match(appSource, /Only releases marked Included are part of the exact Web Package/i);
  assert.match(appSource, /Compare the current Web Package with Hiplingo before deployment/i);
  assert.match(appSource, /loadDeploymentTargetStatus\("local-sandbox"\)/);
  assert.match(appSource, /Deployment destination/);
  assert.match(appSource, /Production deployment is CLI-only/);
  assert.match(appSource, /Check Production is read-only/i);
  assert.match(appSource, /hiplingo-prod:\/var\/www\/hiplingo\.com\/published-media/);
});

test("Workflow & Help names all three storage/publication boundaries", () => {
  assert.match(helpSource, /private canonical Library/);
  assert.match(helpSource, /generated Web Package/);
  assert.match(helpSource, /remote public state/);
});
