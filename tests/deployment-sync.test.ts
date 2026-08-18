import assert from "node:assert/strict";
import {
  createHash,
} from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildPublishedMediaDeploymentSyncPlan,
  buildPublishedMediaDeploymentTargetStatus,
  executePublishedMediaDeployment,
  resolvePublishedMediaDeploymentTarget,
  rollbackPublishedMediaDeployment,
} from "../server/deployment-sync.js";
import {
  writePublishedMediaDeploymentManifest,
} from "../server/published-media-deployment.js";

function sha256(content: Buffer | string): string {
  return createHash("sha256")
    .update(content)
    .digest("hex");
}

async function writeJson(
  filePath: string,
  value: unknown,
): Promise<Buffer> {
  const content = Buffer.from(
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
  await mkdir(path.dirname(filePath), {
    recursive: true,
  });
  await writeFile(filePath, content);
  return content;
}

async function createPublishedFixture(): Promise<{
  root: string;
  catalogPath: string;
}> {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "metadata-editor-deploy-sync-"),
  );
  const releaseId = "2026-08-11_example-release";
  const releaseRoot = path.join(
    root,
    "releases",
    releaseId,
  );
  const releaseContent = await writeJson(
    path.join(releaseRoot, "release.json"),
    {
      schema: {
        name: "audio-player-release",
        version: 2,
      },
      id: releaseId,
      metadata: {
        title: "Example Release",
      },
      tracks: [],
    },
  );

  await writeJson(
    path.join(
      releaseRoot,
      "publication-manifest.json",
    ),
    {
      schema: {
        name: "metadata-editor-publication-manifest",
        version: 2,
      },
      contract: {
        name: "audio-player-public-package",
        version: 6,
      },
      releaseId,
      publishedAt: "2026-08-11T06:00:00.000Z",
      sourcePlanFingerprint: "plan-fingerprint",
      sourceContentFingerprint: "content-fingerprint",
      resources: [
        {
          kind: "release-metadata",
          path: "release.json",
          sha256: sha256(releaseContent),
          bytes: releaseContent.length,
        },
      ],
    },
  );

  const catalogPath = path.join(root, "catalog.json");
  await writeJson(catalogPath, {
    schema: {
      name: "audio-player-catalog",
      version: 1,
    },
    generatedAt: "2026-08-11T06:00:00.000Z",
    releases: [
      {
        id: releaseId,
        href: `releases/${releaseId}/release.json`,
        title: "Example Release",
      },
    ],
  });

  await writePublishedMediaDeploymentManifest(root);
  return { root, catalogPath };
}

function deploymentEnvironment(
  target: string,
  stateRoot: string,
): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PUBLISHED_MEDIA_DEPLOY_TARGET: `local:${target}`,
    PUBLISHED_MEDIA_DEPLOY_STATE_ROOT: stateRoot,
  };
}

test(
  "deployment target configuration is explicit and rejects unsafe broad destinations",
  async () => {
    assert.equal(
      resolvePublishedMediaDeploymentTarget(
        "/tmp/published-media",
        {},
      ),
      null,
    );

    assert.throws(
      () =>
        resolvePublishedMediaDeploymentTarget(
          "/tmp/published-media",
          {
            PUBLISHED_MEDIA_DEPLOY_TARGET: "local:/",
          },
        ),
      /unsafe local deployment target/,
    );

    assert.throws(
      () =>
        resolvePublishedMediaDeploymentTarget(
          "/tmp/published-media",
          {
            PUBLISHED_MEDIA_DEPLOY_TARGET:
              "ssh:example.com:/var/www",
          },
        ),
      /broad ssh deployment destination/,
    );
  },
);

test(
  "local target status is read without touching the deployment destination",
  async (t) => {
    const fixture = await createPublishedFixture();
    const temp = await mkdtemp(
      path.join(os.tmpdir(), "metadata-editor-deploy-target-"),
    );
    t.after(async () => {
      await rm(fixture.root, { recursive: true, force: true });
      await rm(temp, { recursive: true, force: true });
    });
    const target = path.join(temp, "web", "published-media");
    const stateRoot = path.join(temp, "state");
    const status =
      await buildPublishedMediaDeploymentTargetStatus(
        fixture.root,
        deploymentEnvironment(target, stateRoot),
      );

    assert.equal(status.configured, true);
    assert.equal(status.target?.kind, "local");
    assert.equal(status.target?.destinationPath, target);
    assert.match(
      status.deployCommand,
      /DEPLOY_PUBLISHED_MEDIA/,
    );
    await assert.rejects(
      readFile(path.join(target, "deployment-manifest.json")),
      /ENOENT/,
    );
  },
);

test(
  "local deployment requires the reviewed plan fingerprint, verifies the promoted target, and becomes current",
  async (t) => {
    const fixture = await createPublishedFixture();
    const temp = await mkdtemp(
      path.join(os.tmpdir(), "metadata-editor-deploy-exec-"),
    );
    t.after(async () => {
      await rm(fixture.root, { recursive: true, force: true });
      await rm(temp, { recursive: true, force: true });
    });
    const target = path.join(temp, "web", "published-media");
    const stateRoot = path.join(temp, "state");
    await mkdir(path.dirname(target), { recursive: true });
    const environment = deploymentEnvironment(
      target,
      stateRoot,
    );
    const plan = await buildPublishedMediaDeploymentSyncPlan(
      fixture.root,
      environment,
    );

    assert.equal(plan.status, "changes");
    assert.ok(plan.summary.changeCount > 0);
    assert.equal(plan.targetManifest.exists, false);

    await assert.rejects(
      executePublishedMediaDeployment(fixture.root, {
        confirmation: "DEPLOY_PUBLISHED_MEDIA",
        planFingerprint: "stale-plan",
        environment,
      }),
      /plan fingerprint changed/i,
    );

    const receipt = await executePublishedMediaDeployment(
      fixture.root,
      {
        confirmation: "DEPLOY_PUBLISHED_MEDIA",
        planFingerprint: plan.planFingerprint,
        environment,
      },
    );
    assert.equal(receipt.state, "completed");
    assert.equal(
      receipt.sourceContentFingerprint,
      plan.sourceContentFingerprint,
    );

    const current = await buildPublishedMediaDeploymentSyncPlan(
      fixture.root,
      environment,
    );
    assert.equal(current.status, "current");
    assert.equal(current.summary.changeCount, 0);
    assert.equal(
      current.targetManifest.contentFingerprint,
      plan.sourceContentFingerprint,
    );
  },
);

test(
  "a second local deployment keeps one verified backup that can be explicitly rolled back",
  async (t) => {
    const fixture = await createPublishedFixture();
    const temp = await mkdtemp(
      path.join(os.tmpdir(), "metadata-editor-deploy-rollback-"),
    );
    t.after(async () => {
      await rm(fixture.root, { recursive: true, force: true });
      await rm(temp, { recursive: true, force: true });
    });
    const target = path.join(temp, "web", "published-media");
    const stateRoot = path.join(temp, "state");
    await mkdir(path.dirname(target), { recursive: true });
    const environment = deploymentEnvironment(
      target,
      stateRoot,
    );

    const firstPlan = await buildPublishedMediaDeploymentSyncPlan(
      fixture.root,
      environment,
    );
    await executePublishedMediaDeployment(fixture.root, {
      confirmation: "DEPLOY_PUBLISHED_MEDIA",
      planFingerprint: firstPlan.planFingerprint,
      environment,
    });

    const catalog = JSON.parse(
      await readFile(fixture.catalogPath, "utf8"),
    ) as {
      generatedAt: string;
      releases: Array<{ title: string }>;
    };
    catalog.generatedAt = "2026-08-11T07:00:00.000Z";
    catalog.releases[0]!.title = "Example Release Updated";
    await writeJson(fixture.catalogPath, catalog);
    await writePublishedMediaDeploymentManifest(fixture.root);

    const secondPlan = await buildPublishedMediaDeploymentSyncPlan(
      fixture.root,
      environment,
    );
    assert.equal(secondPlan.status, "changes");
    const secondReceipt =
      await executePublishedMediaDeployment(
        fixture.root,
        {
          confirmation: "DEPLOY_PUBLISHED_MEDIA",
          planFingerprint: secondPlan.planFingerprint,
          environment,
        },
      );
    assert.equal(
      secondReceipt.previousContentFingerprint,
      firstPlan.sourceContentFingerprint,
    );

    const rolledBack = await rollbackPublishedMediaDeployment(
      fixture.root,
      {
        confirmation: "ROLLBACK_PUBLISHED_MEDIA",
        environment,
      },
    );
    assert.equal(rolledBack.state, "rolled-back");

    const targetManifest = JSON.parse(
      await readFile(
        path.join(target, "deployment-manifest.json"),
        "utf8",
      ),
    ) as {
      snapshot: { contentFingerprint: string };
    };
    assert.equal(
      targetManifest.snapshot.contentFingerprint,
      firstPlan.sourceContentFingerprint,
    );
  },
);
