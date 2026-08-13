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
const locationsSource = await readFile(
  new URL(
    "../server/workflow-locations.ts",
    import.meta.url,
  ),
  "utf8",
);

test("enables one reviewed Web Package prepare or update action", () => {
  assert.match(
    appSource,
    /function canBuildPublishPlan/,
  );
  assert.match(
    appSource,
    /return publicReleaseAlreadyExists\(plan\)[\s\S]*?Update Web Package[\s\S]*?Add to Web Package/,
  );
  assert.match(
    appSource,
    /fetch\(\s*"\/api\/publish\/build"/,
  );
  assert.match(
    appSource,
    /canPreparePublishPlan\(selectedPlan\)[\s\S]*?publishRelease\(selectedPlan\)/,
  );
  assert.match(
    appSource,
    /Existing Included releases are replaced as a unit so obsolete files cannot survive an update/i,
  );
});

test("exposes the guarded public-package endpoint and write-enabled location", () => {
  assert.match(
    serverSource,
    /requestUrl\.pathname === "\/api\/publish\/build"/,
  );
  assert.match(
    serverSource,
    /publishReleasePackage\(/,
  );
  assert.match(
    serverSource,
    /planFingerprint[\s\S]*?planGeneratedAt/,
  );
  assert.match(
    locationsSource,
    /publishState: "available"/,
  );
  assert.match(
    locationsSource,
    /label: "Web Package"[\s\S]*?writeEnabled: true/,
  );
});
