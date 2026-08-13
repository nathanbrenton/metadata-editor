import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const app = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const help = await readFile(
  new URL("../src/workflow-help-content.ts", import.meta.url),
  "utf8",
);

test("Web Package is the explicit release inclusion set for future Live deployment", () => {
  assert.match(app, /Choose releases for the Web Package/);
  assert.match(app, /useState<"included" \| "not-included" \| "all">\("included"\)/);
  assert.match(app, /Included \(\{publishFleet\?\.summary\.publicCatalogCount \?\? 0\}\)/);
  assert.match(app, /Not included \(\{publishFleet\?\.summary\.notPublishedCount \?\? 0\}\)/);
  assert.match(app, /All Library \(\{releases\.length\}\)/);
  assert.match(app, /Included in Web Package/);
  assert.match(app, /Only releases marked Included are part of the exact Web Package/);
  assert.match(app, /<span>Included<\/span>[\s\S]*publicCatalogCount/);
  assert.match(app, /<span>Not included<\/span>[\s\S]*notPublishedCount/);
  assert.match(app, /<th[^>]*>Public set<\/th>/);
  assert.match(app, /<th[^>]*>Package status<\/th>/);
  assert.match(app, /return \{ label: "Included", tone: "success" \};/);
  assert.match(app, /return \{ label: "Not included", tone: "preview" \};/);
  assert.match(app, /Add to Web Package/);
  assert.match(app, /Included in Web Package/);
  assert.match(app, /Review removal/);
  assert.match(help, /defaults to an Included-only view/);
  assert.match(help, /Public set is the authoritative publication-membership view/);
});

test("Live mirrors the Included Web Package set and emphasizes only Live-state differences", () => {
  assert.match(
    app,
    /mode === "production"[\s\S]*publicationState !== "not-published"/,
  );
  assert.match(app, /Included Web Package → Live/);
  assert.match(app, /same \{publishFleet\.summary\.publicCatalogCount\}-release set shown under/);
  assert.match(app, /<th scope="col">Included Web Package<\/th>/);
  assert.match(app, /<span className="badge success">Included<\/span>[\s\S]*<small>\{webPackageStatus\.label\}<\/small>/);
  assert.match(app, /\$\{workspaceReleases\.length\} included releases/);
  assert.match(help, /release list mirrors the exact Web Package → Included set/);
});
