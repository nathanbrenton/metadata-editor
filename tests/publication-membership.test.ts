import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildPublicReleaseUnpublishPlan,
  listPublicCatalogMembership,
  unpublishPublicRelease,
} from "../server/publication-membership.js";
import {
  listPublishOperations,
  publishOperationsRoot,
  recoverPublishOperation,
  writePublishOperationRecord,
  type PublishOperationRecord,
} from "../server/publish-operations.js";

async function exists(candidate: string): Promise<boolean> {
  try {
    await stat(candidate);
    return true;
  } catch (error) {
    return Boolean(
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code !== "ENOENT",
    );
  }
}

async function createPublishedFixture(): Promise<{
  root: string;
  releaseId: string;
  releaseRoot: string;
}> {
  const workspace = await mkdtemp(
    path.join(os.tmpdir(), "metadata-editor-unpublish-"),
  );
  const root = path.join(workspace, "published-media");
  await mkdir(root, { recursive: true });
  const releaseId = "2026-08-11_catalog-membership-test";
  const releaseRoot = path.join(
    root,
    "releases",
    releaseId,
  );
  await mkdir(
    path.join(releaseRoot, "tracks", "track-01", "stream"),
    { recursive: true },
  );
  await writeFile(
    path.join(releaseRoot, "release.json"),
    '{"title":"Catalog Membership Test"}\n',
  );
  await writeFile(
    path.join(releaseRoot, "tracks", "track-01", "track.json"),
    '{"title":"One"}\n',
  );
  await writeFile(
    path.join(releaseRoot, "tracks", "track-01", "stream", "index.m3u8"),
    "#EXTM3U\n",
  );
  await writeFile(
    path.join(releaseRoot, "publication-manifest.json"),
    `${JSON.stringify({
      releaseId,
      publishedAt: "2026-08-11T00:00:00.000Z",
      sourcePlanFingerprint: "plan-source",
      sourceContentFingerprint: "content-source",
    }, null, 2)}\n`,
  );
  await writeFile(
    path.join(root, "catalog.json"),
    `${JSON.stringify({
      schema: {
        name: "audio-player-catalog",
        version: 1,
      },
      generatedAt: "2026-08-11T00:00:00.000Z",
      releases: [
        {
          id: releaseId,
          href: `releases/${releaseId}/release.json`,
          title: "Catalog Membership Test",
          primaryArtist: "Test Artist",
        },
      ],
    }, null, 2)}\n`,
  );
  await writeFile(
    path.join(root, "deployment-manifest.json"),
    '{"old":"manifest"}\n',
  );

  return {
    root,
    releaseId,
    releaseRoot,
  };
}

test("plans and executes guarded public-release unpublish without touching canonical Library state", async () => {
  const fixture = await createPublishedFixture();

  try {
    const membership = await listPublicCatalogMembership(
      fixture.root,
    );
    assert.equal(membership.length, 1);
    assert.equal(membership[0]?.releaseId, fixture.releaseId);
    assert.equal(membership[0]?.releaseDirectoryExists, true);

    const plan = await buildPublicReleaseUnpublishPlan(
      fixture.root,
      fixture.releaseId,
    );
    assert.equal(plan.readOnly, true);
    assert.equal(plan.writesEnabled, false);
    assert.equal(plan.status, "ready");
    assert.equal(plan.confirmation, "UNPUBLISH_PUBLIC_RELEASE");
    assert.ok(plan.publicFiles.fileCount >= 4);
    assert.ok(plan.publicFiles.totalBytes > 0);
    assert.equal(plan.deploymentManifestWillNeedRefresh, true);

    const receipt = await unpublishPublicRelease(
      fixture.root,
      fixture.releaseId,
      {
        expectedPlanFingerprint: plan.planFingerprint,
        planGeneratedAt: plan.generatedAt,
        confirmation: plan.confirmation,
      },
    );

    assert.equal(receipt.mode, "unpublish");
    assert.equal(receipt.releaseId, fixture.releaseId);
    assert.equal(
      receipt.removedFileCount,
      plan.publicFiles.fileCount,
    );
    assert.equal(await exists(fixture.releaseRoot), false);

    const catalog = JSON.parse(
      await readFile(
        path.join(fixture.root, "catalog.json"),
        "utf8",
      ),
    ) as { releases: Array<{ id: string }> };
    assert.deepEqual(catalog.releases, []);

    // Unpublish intentionally does not rewrite deployment-manifest.json.
    // Its now-stale state is part of the subsequent verify/refresh gate.
    assert.equal(
      await readFile(
        path.join(fixture.root, "deployment-manifest.json"),
        "utf8",
      ),
      '{"old":"manifest"}\n',
    );

    const operations = await listPublishOperations(
      fixture.root,
      { releaseId: fixture.releaseId },
    );
    assert.equal(operations.operations[0]?.mode, "unpublish");
    assert.equal(operations.operations[0]?.state, "completed");
  } finally {
    await rm(path.dirname(fixture.root), {
      recursive: true,
      force: true,
    });
  }
});

test("rejects stale reviewed unpublish plans before removing public content", async () => {
  const fixture = await createPublishedFixture();

  try {
    const plan = await buildPublicReleaseUnpublishPlan(
      fixture.root,
      fixture.releaseId,
    );

    await writeFile(
      path.join(fixture.releaseRoot, "release.json"),
      '{"title":"Changed after review"}\n',
    );

    await assert.rejects(
      unpublishPublicRelease(
        fixture.root,
        fixture.releaseId,
        {
          expectedPlanFingerprint: plan.planFingerprint,
          planGeneratedAt: plan.generatedAt,
          confirmation: plan.confirmation,
        },
      ),
      /changed since the unpublish plan was reviewed/i,
    );

    assert.equal(await exists(fixture.releaseRoot), true);
    const catalog = JSON.parse(
      await readFile(
        path.join(fixture.root, "catalog.json"),
        "utf8",
      ),
    ) as { releases: Array<{ id: string }> };
    assert.equal(catalog.releases[0]?.id, fixture.releaseId);
  } finally {
    await rm(path.dirname(fixture.root), {
      recursive: true,
      force: true,
    });
  }
});


test("interrupted unpublish finalizes when the public removal and staged catalog already verify", async () => {
  const fixture = await createPublishedFixture();

  try {
    const plan = await buildPublicReleaseUnpublishPlan(
      fixture.root,
      fixture.releaseId,
    );
    const operationsRoot = publishOperationsRoot(
      fixture.root,
    );
    const operationId = "previous-server-unpublish-promoted";
    const operationPath = path.join(
      operationsRoot,
      operationId,
    );
    const backupReleasePath = path.join(
      operationPath,
      "backup-release",
    );
    const backupCatalogPath = path.join(
      operationPath,
      "backup-catalog.json",
    );
    await mkdir(operationPath, { recursive: true });
    await rename(fixture.releaseRoot, backupReleasePath);
    await rename(
      path.join(fixture.root, "catalog.json"),
      backupCatalogPath,
    );

    const promotedCatalog = `${JSON.stringify({
      schema: {
        name: "audio-player-catalog",
        version: 1,
      },
      generatedAt: "2026-08-11T02:00:00.000Z",
      releases: [],
    }, null, 2)}\n`;
    await writeFile(
      path.join(fixture.root, "catalog.json"),
      promotedCatalog,
    );
    const stagedCatalogSha256 = createHash("sha256")
      .update(Buffer.from(promotedCatalog))
      .digest("hex");
    const now = "2026-08-11T02:00:00.000Z";
    const record: PublishOperationRecord = {
      schema: {
        name: "metadata-editor-publish-operation",
        version: 2,
      },
      operationId,
      serverInstanceId: "previous-server-instance",
      releaseId: fixture.releaseId,
      destinationReleaseRelativePath:
        `releases/${fixture.releaseId}`,
      startedAt: now,
      updatedAt: now,
      reviewedPlanFingerprint: plan.planFingerprint,
      sourceContentFingerprint:
        plan.publicFiles.treeFingerprint,
      mode: "unpublish",
      state: "running",
      phase: "verifying",
      releasePreviouslyExisted: true,
      catalogPreviouslyExisted: true,
      artifacts: {
        stagedCatalogSha256,
      },
      phaseHistory: [
        { phase: "staging", at: now },
        { phase: "verifying", at: now },
      ],
    };
    await writePublishOperationRecord(
      operationPath,
      record,
    );

    const before = await listPublishOperations(
      fixture.root,
      { releaseId: fixture.releaseId },
    );
    assert.equal(before.operations[0]?.mode, "unpublish");
    assert.equal(before.operations[0]?.state, "interrupted");
    assert.equal(
      before.operations[0]?.recoveryAction,
      "finalize-current",
    );

    const recovered = await recoverPublishOperation(
      fixture.root,
      operationId,
    );
    assert.equal(recovered.state, "recovered");
    assert.match(
      recovered.recoveryReason ?? "",
      /unpublish operation was finalized/i,
    );
    assert.equal(await exists(fixture.releaseRoot), false);
  } finally {
    await rm(path.dirname(fixture.root), {
      recursive: true,
      force: true,
    });
  }
});
