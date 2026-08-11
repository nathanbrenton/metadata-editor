import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  auditPublishedMediaDeployment,
  writePublishedMediaDeploymentManifest,
} from "../server/published-media-deployment.js";

test("a valid zero-release catalog remains manifestable and deployable after the final release is unpublished", async () => {
  const workspace = await mkdtemp(
    path.join(os.tmpdir(), "metadata-editor-empty-public-snapshot-"),
  );
  const publishRoot = path.join(
    workspace,
    "published-media",
  );

  try {
    await mkdir(publishRoot, { recursive: true });
    await writeFile(
      path.join(publishRoot, "catalog.json"),
      `${JSON.stringify({
        schema: {
          name: "audio-player-catalog",
          version: 1,
        },
        generatedAt: "2026-08-11T02:30:00.000Z",
        releases: [],
      }, null, 2)}\n`,
    );

    const before = await auditPublishedMediaDeployment(
      publishRoot,
    );
    assert.equal(before.status, "warning");
    assert.equal(before.summary.catalogReleaseCount, 0);
    assert.equal(before.summary.releaseDirectoryCount, 0);
    assert.ok(before.candidateManifest);
    assert.equal(
      before.candidateManifest?.snapshot.releaseCount,
      0,
    );
    assert.match(
      before.issues.map((issue) => issue.code).join(" "),
      /deployment-manifest-missing/,
    );

    const after = await writePublishedMediaDeploymentManifest(
      publishRoot,
    );
    assert.equal(after.status, "ready");
    assert.equal(after.deployable, true);
    assert.equal(after.deploymentManifest.current, true);
    assert.equal(after.summary.catalogReleaseCount, 0);
    assert.equal(after.summary.releaseDirectoryCount, 0);
  } finally {
    await rm(workspace, {
      recursive: true,
      force: true,
    });
  }
});
