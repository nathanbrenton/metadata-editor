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
  "Live exposes a destination-aware read-only comparison with deployment details available on demand",
  () => {
    assert.match(appSource, /Live status/);
    assert.match(appSource, /Selected destination/);
    assert.match(appSource, /Deployment destination/);
    assert.match(appSource, /`Check \${activeDeploymentProfileLabel}`/);
    assert.match(
      appSource,
      /className="primary"[\s\S]*?loadDeploymentSyncPlan\(\)[\s\S]*?activeDeploymentProfileLabel/,
    );
    assert.match(appSource, /Recheck Web Package/);
    assert.match(appSource, /changes to deploy/);
    assert.match(appSource, /is up to date/);
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
      appSource.indexOf('`Check ${activeDeploymentProfileLabel}`') <
        appSource.indexOf('className="publish-host-boundary"'),
      "destination-aware Check action should stay above technical connection details",
    );
    assert.match(appSource, /Production deployment is CLI-only/);
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
