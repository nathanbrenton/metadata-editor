import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  listPublishOperations,
  publishOperationsRoot,
  recoverPublishOperation,
  writePublishOperationRecord,
  type PublishOperationRecord,
} from "../server/publish-operations.js";

async function missing(
  candidatePath: string,
): Promise<boolean> {
  try {
    await access(candidatePath);
    return false;
  } catch (error) {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    );
  }
}

test("interrupted v2 publish with no promoted public state offers guarded rollback", async () => {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "publish-operation-v2-"),
  );
  const publishRoot = path.join(
    temporaryRoot,
    "published-media",
  );
  const releaseId = "2026-08-10_interrupted";
  const operationId = "previous-server-operation";
  const operationPath = path.join(
    publishOperationsRoot(publishRoot),
    operationId,
  );
  const stagePath = path.join(
    operationPath,
    "stage-release",
  );
  const now = "2026-08-10T20:00:00.000Z";

  try {
    await mkdir(stagePath, { recursive: true });
    await writeFile(
      path.join(stagePath, "staged.txt"),
      "staged",
    );

    const record: PublishOperationRecord = {
      schema: {
        name: "metadata-editor-publish-operation",
        version: 2,
      },
      operationId,
      serverInstanceId: "previous-server-instance",
      releaseId,
      destinationReleaseRelativePath:
        `releases/${releaseId}`,
      startedAt: now,
      updatedAt: now,
      reviewedPlanFingerprint: "a".repeat(64),
      sourceContentFingerprint: "b".repeat(64),
      mode: "build",
      state: "running",
      phase: "staging",
      releasePreviouslyExisted: false,
      catalogPreviouslyExisted: false,
      phaseHistory: [
        {
          phase: "staging",
          at: now,
        },
      ],
    };

    await writePublishOperationRecord(
      operationPath,
      record,
    );

    const before = await listPublishOperations(
      publishRoot,
      {
        releaseId,
      },
    );
    assert.equal(before.interruptedCount, 1);
    assert.equal(before.operations[0]?.state, "interrupted");
    assert.equal(
      before.operations[0]?.recoveryAction,
      "rollback-safe",
    );

    const recovered = await recoverPublishOperation(
      publishRoot,
      operationId,
    );
    assert.equal(recovered.state, "recovered");
    assert.match(
      recovered.recoveryReason ?? "",
      /rolled back/i,
    );
    assert.equal(await missing(stagePath), true);

    const stored = JSON.parse(
      await readFile(
        path.join(operationPath, "operation.json"),
        "utf8",
      ),
    ) as Record<string, any>;
    assert.equal(stored.state, "failed");
    assert.equal(stored.phase, "failed");
    assert.equal(stored.recovery.action, "rolled-back");
  } finally {
    await rm(temporaryRoot, {
      recursive: true,
      force: true,
    });
  }
});


test("interrupted v2 publish finalizes an already-promoted verified package", async () => {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "publish-operation-finalize-"),
  );
  const publishRoot = path.join(
    temporaryRoot,
    "published-media",
  );
  const releaseId = "2026-08-10_promoted";
  const operationId = "previous-server-promoted";
  const operationPath = path.join(
    publishOperationsRoot(publishRoot),
    operationId,
  );
  const releaseRoot = path.join(
    publishRoot,
    "releases",
    releaseId,
  );
  const planFingerprint = "d".repeat(64);
  const now = "2026-08-10T20:10:00.000Z";

  try {
    await mkdir(releaseRoot, { recursive: true });
    await mkdir(operationPath, { recursive: true });

    const releaseJson = `${JSON.stringify({
      schema: { name: "audio-player-release", version: 2 },
      id: releaseId,
      tracks: [],
    }, null, 2)}\n`;
    await writeFile(
      path.join(releaseRoot, "release.json"),
      releaseJson,
    );
    const releaseSha256 = createHash("sha256")
      .update(Buffer.from(releaseJson))
      .digest("hex");

    await writeFile(
      path.join(releaseRoot, "publication-manifest.json"),
      `${JSON.stringify({
        schema: {
          name: "metadata-editor-publication-manifest",
          version: 2,
        },
        releaseId,
        publishedAt: now,
        sourcePlanFingerprint: planFingerprint,
        sourceContentFingerprint: "e".repeat(64),
        resources: [
          {
            kind: "release-metadata",
            path: "release.json",
            sha256: releaseSha256,
            bytes: Buffer.byteLength(releaseJson),
          },
        ],
      }, null, 2)}\n`,
    );
    await writeFile(
      path.join(publishRoot, "catalog.json"),
      `${JSON.stringify({
        schema: {
          name: "audio-player-catalog",
          version: 1,
        },
        generatedAt: now,
        releases: [
          {
            id: releaseId,
            href: `releases/${releaseId}/release.json`,
          },
        ],
      }, null, 2)}\n`,
    );

    const record: PublishOperationRecord = {
      schema: {
        name: "metadata-editor-publish-operation",
        version: 2,
      },
      operationId,
      serverInstanceId: "previous-server-instance",
      releaseId,
      destinationReleaseRelativePath:
        `releases/${releaseId}`,
      startedAt: now,
      updatedAt: now,
      reviewedPlanFingerprint: planFingerprint,
      sourceContentFingerprint: "e".repeat(64),
      mode: "build",
      state: "running",
      phase: "verifying",
      releasePreviouslyExisted: false,
      catalogPreviouslyExisted: false,
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
      publishRoot,
      { releaseId },
    );
    assert.equal(before.operations[0]?.state, "interrupted");
    assert.equal(
      before.operations[0]?.recoveryAction,
      "finalize-current",
    );

    const recovered = await recoverPublishOperation(
      publishRoot,
      operationId,
    );
    assert.equal(recovered.state, "recovered");
    assert.match(
      recovered.recoveryReason ?? "",
      /finalized/i,
    );

    const stored = JSON.parse(
      await readFile(
        path.join(operationPath, "operation.json"),
        "utf8",
      ),
    ) as Record<string, any>;
    assert.equal(stored.state, "completed");
    assert.equal(stored.phase, "completed");
    assert.equal(
      stored.recovery.action,
      "finalized-current",
    );
  } finally {
    await rm(temporaryRoot, {
      recursive: true,
      force: true,
    });
  }
});

test("legacy non-terminal publish operations remain visible but require review", async () => {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "publish-operation-v1-"),
  );
  const publishRoot = path.join(
    temporaryRoot,
    "published-media",
  );
  const operationId = "legacy-operation";
  const operationPath = path.join(
    publishOperationsRoot(publishRoot),
    operationId,
  );

  try {
    await mkdir(operationPath, { recursive: true });
    await writeFile(
      path.join(operationPath, "operation.json"),
      `${JSON.stringify({
        schema: {
          name: "metadata-editor-publish-operation",
          version: 1,
        },
        operationId,
        releaseId: "2026-08-10_legacy",
        startedAt: "2026-08-10T19:00:00.000Z",
        reviewedPlanFingerprint: "c".repeat(64),
        mode: "build",
        state: "staging",
      }, null, 2)}\n`,
    );

    const history = await listPublishOperations(
      publishRoot,
    );
    assert.equal(history.interruptedCount, 1);
    assert.equal(history.operations[0]?.legacy, true);
    assert.equal(
      history.operations[0]?.recoveryAction,
      "review-required",
    );
    await assert.rejects(
      recoverPublishOperation(
        publishRoot,
        operationId,
      ),
      /legacy publish operations require manual review/i,
    );
  } finally {
    await rm(temporaryRoot, {
      recursive: true,
      force: true,
    });
  }
});
