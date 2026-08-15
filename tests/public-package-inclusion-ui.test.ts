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

test("Web Package is the explicit release visibility set for future Live deployment", () => {
  assert.match(
    app,
    /useState<"included" \| "not-included" \| "all">\("all"\)/,
  );
  assert.match(app, /role="switch"/);
  assert.match(app, /publish-visibility-switch/);
  assert.match(
    app,
    /aria-checked=\{webPackageMembership\.label === "Included"\}/,
  );
  assert.match(app, /Private \/ Local by default/);
  assert.match(
    app,
    /Media prep<\/strong> only creates private derivatives and never changes visibility/,
  );
  assert.match(
    app,
    /Artist inclusion follows the Public release set automatically/,
  );
  assert.match(app, /Public means included in the local Web Package/);
  assert.match(
    app,
    /it does not mean the release has already been deployed/,
  );
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
