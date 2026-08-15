import assert from "node:assert/strict";
import {
  readFile,
} from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const serverSource = await readFile(
  new URL("../server/index.ts", import.meta.url),
  "utf8",
);
const packageSource = JSON.parse(
  await readFile(
    new URL("../package.json", import.meta.url),
    "utf8",
  ),
) as {
  scripts?: Record<string, string>;
};
const helpSource = await readFile(
  new URL(
    "../src/workflow-help-content.ts",
    import.meta.url,
  ),
  "utf8",
);

test(
  "Live exposes a simplified read-only comparison with deployment details available on demand",
  () => {
    assert.match(appSource, /Live status/);
    assert.match(appSource, /Live target/);
    assert.match(appSource, /"Check Live"/);
    assert.match(
      appSource,
      /className="primary"[\s\S]*?loadDeploymentSyncPlan\(\)[\s\S]*?"Check Live"/,
    );
    assert.match(appSource, /Recheck Web Package/);
    assert.match(appSource, /changes to deploy/);
    assert.match(appSource, /Live is up to date/);
    assert.match(
      appSource,
      /deploymentAudit\.summary\.totalBytes/,
    );
    assert.match(
      appSource,
      /liveFullPackageUploadBytes/,
    );
    assert.match(
      appSource,
      /incremental upload size depends on changed files/,
    );
    assert.ok(
      appSource.indexOf('"Check Live"') <
        appSource.indexOf('className="publish-host-boundary"'),
      "Check Live should be elevated into the always-visible Live status header",
    );
    assert.match(
      appSource,
      /\/api\/publish\/deployment-sync-plan/,
    );
    assert.match(
      appSource,
      /deploymentTargetStatus\?\.deployCommand\.replace/,
    );
  },
);

test(
  "server exposes deployment target status and a plan-only sync route",
  () => {
    assert.match(
      serverSource,
      /\/api\/publish\/deployment-target/,
    );
    assert.match(
      serverSource,
      /\/api\/publish\/deployment-sync-plan/,
    );
    assert.doesNotMatch(
      serverSource,
      /\/api\/publish\/deployment-execute/,
    );
  },
);

test(
  "package scripts keep host planning separate from confirmed deployment and rollback",
  () => {
    assert.equal(
      packageSource.scripts?.[
        "plan:published-media-deploy"
      ],
      "tsx scripts/plan-published-media-deployment.ts",
    );
    assert.equal(
      packageSource.scripts?.["deploy:published-media"],
      "tsx scripts/deploy-published-media.ts",
    );
    assert.equal(
      packageSource.scripts?.["rollback:published-media"],
      "tsx scripts/rollback-published-media.ts",
    );
  },
);

test(
  "Workflow & Help documents the explicit target, reviewed fingerprint, and nginx boundary",
  () => {
    assert.match(
      helpSource,
      /PUBLISHED_MEDIA_DEPLOY_TARGET/,
    );
    assert.match(helpSource, /DEPLOY_PUBLISHED_MEDIA/);
    assert.match(helpSource, /ROLLBACK_PUBLISHED_MEDIA/);
    assert.match(
      helpSource,
      /does not modify nginx, DNS, TLS, or audio-player source/,
    );
  },
);
