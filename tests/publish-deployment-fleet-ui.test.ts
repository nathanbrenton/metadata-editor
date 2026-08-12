import assert from "node:assert/strict";
import {
  readFile,
} from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  fileURLToPath,
} from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const appSource = await readFile(
  path.join(root, "src/App.tsx"),
  "utf8",
);
const serverSource = await readFile(
  path.join(root, "server/index.ts"),
  "utf8",
);
const helpSource = await readFile(
  path.join(root, "src/workflow-help-content.ts"),
  "utf8",
);
const packageJson = JSON.parse(
  await readFile(
    path.join(root, "package.json"),
    "utf8",
  ),
) as {
  scripts?: Record<string, string>;
};

test(
  "Web Package workspace keeps fleet verification and package-index controls",
  () => {
    assert.match(
      appSource,
      /Web Package status/,
    );
    assert.match(
      appSource,
      /publish-deployment-overview/,
    );
    assert.match(
      appSource,
      /Refresh status/,
    );
    assert.match(
      appSource,
      /Create package index/,
    );
    assert.match(
      appSource,
      /\/api\/publish\/fleet/,
    );
    assert.match(
      appSource,
      /\/api\/publish\/deployment-manifest/,
    );
  },
);

test(
  "server exposes read-only fleet and deployment audit plus guarded manifest refresh",
  () => {
    assert.match(
      serverSource,
      /\/api\/publish\/fleet/,
    );
    assert.match(
      serverSource,
      /\/api\/publish\/deployment-audit/,
    );
    assert.match(
      serverSource,
      /\/api\/publish\/deployment-manifest/,
    );
    assert.match(
      serverSource,
      /operation\.state === "running"/,
    );
    assert.match(
      serverSource,
      /history\.interruptedCount > 0/,
    );
  },
);

test(
  "deployment verification, manifest generation, and staging are available as explicit CLI steps",
  () => {
    assert.equal(
      packageJson.scripts?.["verify:published-media"],
      "tsx scripts/verify-published-media.ts",
    );
    assert.equal(
      packageJson.scripts?.["manifest:published-media"],
      "tsx scripts/write-published-media-deployment-manifest.ts",
    );
    assert.equal(
      packageJson.scripts?.["stage:published-media"],
      "tsx scripts/stage-published-media.ts",
    );
  },
);

test(
  "Workflow Help documents verification and deployment-manifest staging boundary",
  () => {
    assert.match(
      helpSource,
      /deployment-manifest\.json/,
    );
    assert.match(
      helpSource,
      /verify:published-media/,
    );
    assert.match(
      helpSource,
      /stage:published-media/,
    );
  },
);
