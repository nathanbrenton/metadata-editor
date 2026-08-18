import {
  createHash,
  randomUUID,
} from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import {
  assertPathWithinRoot,
} from "./media-root.js";
import {
  isIgnoredPublicationJunk,
} from "./publication-junk.js";

export const publishOperationsDirectoryName =
  ".metadata-editor-publish-operations";

export const publishServerInstanceId = randomUUID();

export type PublishOperationPhase =
  | "staging"
  | "validating"
  | "backing-up-release"
  | "promoting-release"
  | "backing-up-catalog"
  | "promoting-catalog"
  | "verifying"
  | "completed"
  | "failed";

export type PublishOperationState =
  | "running"
  | "completed"
  | "failed";

export type PublishOperationRecovery = {
  action:
    | "finalized-current"
    | "rolled-back";
  recoveredAt: string;
  note: string;
};

export type PublishOperationRecord = {
  schema: {
    name: "metadata-editor-publish-operation";
    version: 2;
  };
  operationId: string;
  serverInstanceId: string;
  releaseId: string;
  destinationReleaseRelativePath: string;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
  failedAt?: string;
  reviewedPlanFingerprint: string;
  sourceContentFingerprint: string;
  mode: "build" | "update" | "unpublish";
  state: PublishOperationState;
  phase: PublishOperationPhase;
  releasePreviouslyExisted: boolean;
  catalogPreviouslyExisted: boolean;
  resources?: number;
  artifacts?: {
    stagedCatalogSha256?: string;
    stagedPublicationManifestSha256?: string;
  };
  error?: string;
  recovery?: PublishOperationRecovery;
  phaseHistory: Array<{
    phase: PublishOperationPhase;
    at: string;
  }>;
};

export type PublishOperationDerivedState =
  | "running"
  | "interrupted"
  | "completed"
  | "failed"
  | "recovered";

export type PublishOperationRecoveryAction =
  | "none"
  | "finalize-current"
  | "rollback-safe"
  | "review-required";

export type PublishOperationSummary = {
  operationId: string;
  releaseId: string;
  mode: "build" | "update" | "unpublish";
  state: PublishOperationDerivedState;
  phase: string;
  startedAt: string;
  updatedAt?: string;
  completedAt?: string;
  failedAt?: string;
  reviewedPlanFingerprint?: string;
  resources?: number;
  recoveryAction: PublishOperationRecoveryAction;
  recoveryReason?: string;
  error?: string;
  legacy: boolean;
};

export type PublishOperationHistory = {
  serverInstanceId: string;
  operations: PublishOperationSummary[];
  interruptedCount: number;
  failedCount: number;
};

type LegacyOperationRecord = {
  schema?: {
    name?: string;
    version?: number;
  };
  operationId?: string;
  releaseId?: string;
  startedAt?: string;
  completedAt?: string;
  failedAt?: string;
  reviewedPlanFingerprint?: string;
  mode?: "build" | "update" | "unpublish";
  state?: string;
  resources?: number;
  error?: string;
};

type PackageIntegrityResult = {
  ok: boolean;
  reason: string;
  resourceCount: number;
  publishedAt?: string;
};

type RecoveryInspection = {
  action: PublishOperationRecoveryAction;
  reason: string;
};

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function rootPath(
  root: string,
  relativePath: string,
): string {
  return assertPathWithinRoot(
    root,
    path.resolve(
      root,
      ...relativePath
        .replaceAll("\\", "/")
        .split("/")
        .filter(Boolean),
    ),
  );
}

async function pathExists(
  candidatePath: string,
): Promise<boolean> {
  try {
    await lstat(candidatePath);
    return true;
  } catch (error) {
    if (isMissingFileError(error)) {
      return false;
    }

    throw error;
  }
}

async function sha256File(
  filePath: string,
): Promise<{ sha256: string; bytes: number }> {
  const content = await readFile(filePath);

  return {
    sha256: createHash("sha256")
      .update(content)
      .digest("hex"),
    bytes: content.length,
  };
}

async function readJsonFile(
  filePath: string,
): Promise<unknown> {
  return JSON.parse(
    await readFile(filePath, "utf8"),
  ) as unknown;
}

async function atomicWriteJson(
  filePath: string,
  value: unknown,
): Promise<void> {
  await mkdir(path.dirname(filePath), {
    recursive: true,
  });
  const temporaryPath = `${filePath}.tmp-${randomUUID()}`;

  try {
    await writeFile(
      temporaryPath,
      `${JSON.stringify(value, null, 2)}\n`,
      "utf8",
    );
    await rename(temporaryPath, filePath);
  } finally {
    await rm(temporaryPath, {
      force: true,
    }).catch(() => undefined);
  }
}

export function publishOperationsRoot(
  publishRoot: string,
): string {
  return path.join(
    path.dirname(path.resolve(publishRoot)),
    publishOperationsDirectoryName,
  );
}

export async function writePublishOperationRecord(
  operationPath: string,
  record: PublishOperationRecord,
): Promise<void> {
  await atomicWriteJson(
    path.join(operationPath, "operation.json"),
    record,
  );
}

export function advancePublishOperation(
  record: PublishOperationRecord,
  phase: PublishOperationPhase,
  patch: Partial<PublishOperationRecord> = {},
): PublishOperationRecord {
  const now = new Date().toISOString();

  return {
    ...record,
    ...patch,
    phase,
    updatedAt: now,
    phaseHistory: [
      ...record.phaseHistory,
      {
        phase,
        at: now,
      },
    ],
  };
}

async function walkRegularFiles(
  root: string,
  relativePath = "",
): Promise<string[]> {
  const directory = rootPath(root, relativePath);
  const entries = await readdir(directory, {
    withFileTypes: true,
  });
  const files: string[] = [];

  for (const entry of entries) {
    const entryRelativePath = path.posix.join(
      relativePath,
      entry.name,
    );

    if (entry.isSymbolicLink()) {
      throw new Error(
        `Published package contains a symbolic link: ${entryRelativePath}`,
      );
    }

    if (isIgnoredPublicationJunk(entryRelativePath)) {
      continue;
    }

    if (entry.isDirectory()) {
      files.push(
        ...(await walkRegularFiles(
          root,
          entryRelativePath,
        )),
      );
      continue;
    }

    if (!entry.isFile()) {
      throw new Error(
        `Published package contains an unsupported filesystem entry: ${entryRelativePath}`,
      );
    }

    files.push(entryRelativePath);
  }

  return files.sort();
}

export async function verifyPublishedPackageIntegrity(
  publishRoot: string,
  releaseId: string,
  expectedPlanFingerprint?: string,
): Promise<PackageIntegrityResult> {
  const releaseRoot = rootPath(
    path.resolve(publishRoot),
    path.posix.join("releases", releaseId),
  );
  const manifestPath = path.join(
    releaseRoot,
    "publication-manifest.json",
  );

  try {
    const manifest = await readJsonFile(
      manifestPath,
    );

    if (!isRecord(manifest)) {
      return {
        ok: false,
        reason: "Publication manifest is not a JSON object.",
        resourceCount: 0,
      };
    }

    if (manifest.releaseId !== releaseId) {
      return {
        ok: false,
        reason: "Publication manifest release identity does not match the destination.",
        resourceCount: 0,
      };
    }

    if (
      expectedPlanFingerprint &&
      manifest.sourcePlanFingerprint !==
        expectedPlanFingerprint
    ) {
      return {
        ok: false,
        reason: "Published package was not produced by this publish operation.",
        resourceCount: 0,
      };
    }

    if (!Array.isArray(manifest.resources)) {
      return {
        ok: false,
        reason: "Publication manifest does not contain a resource list.",
        resourceCount: 0,
      };
    }

    const expectedFiles = new Set<string>([
      "publication-manifest.json",
    ]);

    for (const resource of manifest.resources) {
      if (
        !isRecord(resource) ||
        typeof resource.path !== "string" ||
        typeof resource.sha256 !== "string" ||
        typeof resource.bytes !== "number"
      ) {
        return {
          ok: false,
          reason: "Publication manifest contains an invalid resource record.",
          resourceCount: 0,
        };
      }

      const resourcePath = rootPath(
        releaseRoot,
        resource.path,
      );
      const stats = await lstat(resourcePath);

      if (stats.isSymbolicLink() || !stats.isFile()) {
        return {
          ok: false,
          reason: `Published resource is not a regular file: ${resource.path}`,
          resourceCount: manifest.resources.length,
        };
      }

      const digest = await sha256File(
        resourcePath,
      );

      if (
        digest.sha256 !== resource.sha256 ||
        digest.bytes !== resource.bytes
      ) {
        return {
          ok: false,
          reason: `Published resource failed hash verification: ${resource.path}`,
          resourceCount: manifest.resources.length,
        };
      }

      expectedFiles.add(resource.path);
    }

    const actualFiles = await walkRegularFiles(
      releaseRoot,
    );

    if (
      actualFiles.length !== expectedFiles.size ||
      actualFiles.some(
        (relativePath) =>
          !expectedFiles.has(relativePath),
      )
    ) {
      return {
        ok: false,
        reason: "Published release contains missing or unmanifested files.",
        resourceCount: manifest.resources.length,
      };
    }

    const catalog = await readJsonFile(
      rootPath(
        path.resolve(publishRoot),
        "catalog.json",
      ),
    );

    if (
      !isRecord(catalog) ||
      !Array.isArray(catalog.releases)
    ) {
      return {
        ok: false,
        reason: "Public catalog is missing or invalid.",
        resourceCount: manifest.resources.length,
      };
    }

    const matchingEntries = catalog.releases.filter(
      (entry): entry is Record<string, unknown> =>
        isRecord(entry) &&
        entry.id === releaseId,
    );

    if (matchingEntries.length !== 1) {
      return {
        ok: false,
        reason: "Public catalog does not contain exactly one matching release entry.",
        resourceCount: manifest.resources.length,
      };
    }

    const catalogEntry = matchingEntries[0];
    const expectedHref = path.posix.join(
      "releases",
      releaseId,
      "release.json",
    );

    if (catalogEntry.href !== expectedHref) {
      return {
        ok: false,
        reason: "Public catalog release href does not match the promoted release package.",
        resourceCount: manifest.resources.length,
      };
    }

    return {
      ok: true,
      reason: "Published release, manifest resources, and catalog entry verified.",
      resourceCount: manifest.resources.length,
      ...(typeof manifest.publishedAt === "string"
        ? { publishedAt: manifest.publishedAt }
        : {}),
    };
  } catch (error) {
    if (isMissingFileError(error)) {
      return {
        ok: false,
        reason: "Published package or one of its required files is missing.",
        resourceCount: 0,
      };
    }

    return {
      ok: false,
      reason:
        error instanceof Error
          ? error.message
          : "Unknown published-package verification failure.",
      resourceCount: 0,
    };
  }
}

export async function verifyUnpublishedPackageIntegrity(
  publishRoot: string,
  releaseId: string,
  expectedCatalogSha256?: string,
): Promise<PackageIntegrityResult> {
  const canonicalPublishRoot = path.resolve(
    publishRoot,
  );
  const releaseRoot = rootPath(
    canonicalPublishRoot,
    path.posix.join("releases", releaseId),
  );
  const catalogPath = rootPath(
    canonicalPublishRoot,
    "catalog.json",
  );

  try {
    if (await pathExists(releaseRoot)) {
      return {
        ok: false,
        reason:
          "Public release directory still exists after unpublish.",
        resourceCount: 0,
      };
    }

    if (!(await pathExists(catalogPath))) {
      return {
        ok: false,
        reason:
          "Public catalog is missing after unpublish.",
        resourceCount: 0,
      };
    }

    if (expectedCatalogSha256) {
      const digest = await sha256File(catalogPath);
      if (digest.sha256 !== expectedCatalogSha256) {
        return {
          ok: false,
          reason:
            "Public catalog does not match the reviewed unpublish operation.",
          resourceCount: 0,
        };
      }
    }

    const catalog = await readJsonFile(catalogPath);
    if (
      !isRecord(catalog) ||
      !Array.isArray(catalog.releases)
    ) {
      return {
        ok: false,
        reason:
          "Public catalog is missing or invalid after unpublish.",
        resourceCount: 0,
      };
    }

    const matchingEntries = catalog.releases.filter(
      (entry) =>
        isRecord(entry) &&
        entry.id === releaseId,
    );

    if (matchingEntries.length !== 0) {
      return {
        ok: false,
        reason:
          "Public catalog still contains the unpublished release.",
        resourceCount: 0,
      };
    }

    return {
      ok: true,
      reason:
        "Public release directory is absent and catalog membership is removed.",
      resourceCount: 0,
    };
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof Error
          ? error.message
          : "Unknown unpublish verification failure.",
      resourceCount: 0,
    };
  }
}

function isPublishOperationRecord(
  value: unknown,
): value is PublishOperationRecord {
  return (
    isRecord(value) &&
    isRecord(value.schema) &&
    value.schema.name ===
      "metadata-editor-publish-operation" &&
    value.schema.version === 2 &&
    typeof value.operationId === "string" &&
    typeof value.serverInstanceId === "string" &&
    typeof value.releaseId === "string" &&
    typeof value.destinationReleaseRelativePath === "string" &&
    typeof value.startedAt === "string" &&
    typeof value.updatedAt === "string" &&
    typeof value.reviewedPlanFingerprint === "string" &&
    typeof value.sourceContentFingerprint === "string" &&
    (value.mode === "build" ||
      value.mode === "update" ||
      value.mode === "unpublish") &&
    (value.state === "running" ||
      value.state === "completed" ||
      value.state === "failed") &&
    Array.isArray(value.phaseHistory)
  );
}

async function readOperationRecord(
  operationPath: string,
): Promise<PublishOperationRecord | LegacyOperationRecord> {
  const parsed = await readJsonFile(
    path.join(operationPath, "operation.json"),
  );

  if (isPublishOperationRecord(parsed)) {
    return parsed;
  }

  if (!isRecord(parsed)) {
    throw new Error(
      "Publish operation record is not a JSON object.",
    );
  }

  return parsed as LegacyOperationRecord;
}

async function targetReleaseBelongsToOperation(
  publishRoot: string,
  record: PublishOperationRecord,
): Promise<boolean> {
  const manifestPath = rootPath(
    path.resolve(publishRoot),
    path.posix.join(
      record.destinationReleaseRelativePath,
      "publication-manifest.json",
    ),
  );

  try {
    const manifest = await readJsonFile(
      manifestPath,
    );

    return (
      isRecord(manifest) &&
      manifest.releaseId === record.releaseId &&
      manifest.sourcePlanFingerprint ===
        record.reviewedPlanFingerprint
    );
  } catch (error) {
    if (isMissingFileError(error)) {
      return false;
    }

    throw error;
  }
}

async function targetCatalogBelongsToOperation(
  publishRoot: string,
  record: PublishOperationRecord,
): Promise<boolean> {
  const expected =
    record.artifacts?.stagedCatalogSha256;

  if (!expected) {
    return false;
  }

  const catalogPath = rootPath(
    path.resolve(publishRoot),
    "catalog.json",
  );

  try {
    return (
      await sha256File(catalogPath)
    ).sha256 === expected;
  } catch (error) {
    if (isMissingFileError(error)) {
      return false;
    }

    throw error;
  }
}

async function inspectRollbackSafety(
  publishRoot: string,
  operationPath: string,
  record: PublishOperationRecord,
): Promise<RecoveryInspection> {
  const targetReleasePath = rootPath(
    path.resolve(publishRoot),
    record.destinationReleaseRelativePath,
  );
  const targetCatalogPath = rootPath(
    path.resolve(publishRoot),
    "catalog.json",
  );
  const backupReleasePath = path.join(
    operationPath,
    "backup-release",
  );
  const backupCatalogPath = path.join(
    operationPath,
    "backup-catalog.json",
  );

  const [
    targetReleaseExists,
    targetCatalogExists,
    backupReleaseExists,
    backupCatalogExists,
    targetReleaseIsOperation,
    targetCatalogIsOperation,
  ] = await Promise.all([
    pathExists(targetReleasePath),
    pathExists(targetCatalogPath),
    pathExists(backupReleasePath),
    pathExists(backupCatalogPath),
    targetReleaseBelongsToOperation(
      publishRoot,
      record,
    ),
    targetCatalogBelongsToOperation(
      publishRoot,
      record,
    ),
  ]);

  if (record.releasePreviouslyExisted) {
    if (!targetReleaseExists && !backupReleaseExists) {
      return {
        action: "review-required",
        reason: "The previous public release is missing and no operation backup is available.",
      };
    }

    if (
      backupReleaseExists &&
      targetReleaseExists &&
      !targetReleaseIsOperation
    ) {
      return {
        action: "review-required",
        reason: "Both a release backup and an unattributed current release exist.",
      };
    }
  } else if (
    targetReleaseExists &&
    !targetReleaseIsOperation
  ) {
    return {
      action: "review-required",
      reason: "A public release exists but cannot be attributed to the interrupted operation.",
    };
  }

  if (record.catalogPreviouslyExisted) {
    if (!targetCatalogExists && !backupCatalogExists) {
      return {
        action: "review-required",
        reason: "The previous public catalog is missing and no operation backup is available.",
      };
    }

    if (
      backupCatalogExists &&
      targetCatalogExists &&
      !targetCatalogIsOperation
    ) {
      return {
        action: "review-required",
        reason: "Both a catalog backup and an unattributed current catalog exist.",
      };
    }
  } else if (
    targetCatalogExists &&
    !targetCatalogIsOperation
  ) {
    return {
      action: "review-required",
      reason: "A public catalog exists but cannot be attributed to the interrupted operation.",
    };
  }

  return {
    action: "rollback-safe",
    reason: "The interrupted operation has sufficient attribution and backup evidence for a guarded rollback.",
  };
}

async function inspectRecovery(
  publishRoot: string,
  operationPath: string,
  record: PublishOperationRecord,
): Promise<RecoveryInspection> {
  const integrity =
    record.mode === "unpublish"
      ? await verifyUnpublishedPackageIntegrity(
          publishRoot,
          record.releaseId,
          record.artifacts?.stagedCatalogSha256,
        )
      : await verifyPublishedPackageIntegrity(
          publishRoot,
          record.releaseId,
          record.reviewedPlanFingerprint,
        );

  if (integrity.ok) {
    return {
      action: "finalize-current",
      reason:
        record.mode === "unpublish"
          ? "The public release is absent and catalog membership already matches this interrupted unpublish operation."
          : "The promoted release and catalog already verify against this interrupted operation.",
    };
  }

  return inspectRollbackSafety(
    publishRoot,
    operationPath,
    record,
  );
}

function legacyDerivedState(
  record: LegacyOperationRecord,
): PublishOperationDerivedState {
  if (record.state === "completed") {
    return "completed";
  }

  if (record.state === "failed") {
    return "failed";
  }

  return "interrupted";
}

async function summarizeOperation(
  publishRoot: string,
  operationPath: string,
  record: PublishOperationRecord | LegacyOperationRecord,
): Promise<PublishOperationSummary> {
  if (!isPublishOperationRecord(record)) {
    const state = legacyDerivedState(record);

    return {
      operationId:
        record.operationId ?? path.basename(operationPath),
      releaseId: record.releaseId ?? "unknown-release",
      mode:
        record.mode === "unpublish"
          ? "unpublish"
          : record.mode === "update"
            ? "update"
            : "build",
      state,
      phase: record.state ?? "unknown",
      startedAt: record.startedAt ?? "",
      ...(record.completedAt
        ? { completedAt: record.completedAt }
        : {}),
      ...(record.failedAt
        ? { failedAt: record.failedAt }
        : {}),
      ...(record.reviewedPlanFingerprint
        ? {
            reviewedPlanFingerprint:
              record.reviewedPlanFingerprint,
          }
        : {}),
      ...(typeof record.resources === "number"
        ? { resources: record.resources }
        : {}),
      ...(record.error ? { error: record.error } : {}),
      recoveryAction:
        state === "interrupted"
          ? "review-required"
          : "none",
      ...(state === "interrupted"
        ? {
            recoveryReason:
              "Legacy v1 operation lacks the attribution evidence required for automatic recovery.",
          }
        : {}),
      legacy: true,
    };
  }

  const state: PublishOperationDerivedState =
    record.recovery
      ? "recovered"
      : record.state === "completed"
        ? "completed"
        : record.state === "failed"
          ? "failed"
          : record.serverInstanceId ===
              publishServerInstanceId
            ? "running"
            : "interrupted";

  let recoveryAction: PublishOperationRecoveryAction =
    "none";
  let recoveryReason: string | undefined;

  if (state === "interrupted") {
    const inspection = await inspectRecovery(
      publishRoot,
      operationPath,
      record,
    );
    recoveryAction = inspection.action;
    recoveryReason = inspection.reason;
  }

  return {
    operationId: record.operationId,
    releaseId: record.releaseId,
    mode: record.mode,
    state,
    phase: record.phase,
    startedAt: record.startedAt,
    updatedAt: record.updatedAt,
    ...(record.completedAt
      ? { completedAt: record.completedAt }
      : {}),
    ...(record.failedAt
      ? { failedAt: record.failedAt }
      : {}),
    reviewedPlanFingerprint:
      record.reviewedPlanFingerprint,
    ...(typeof record.resources === "number"
      ? { resources: record.resources }
      : {}),
    ...(record.error ? { error: record.error } : {}),
    recoveryAction,
    ...(recoveryReason
      ? { recoveryReason }
      : record.recovery
        ? { recoveryReason: record.recovery.note }
        : {}),
    legacy: false,
  };
}

export async function listPublishOperations(
  publishRoot: string,
  options: {
    releaseId?: string;
    limit?: number;
  } = {},
): Promise<PublishOperationHistory> {
  const operationsRoot = publishOperationsRoot(
    publishRoot,
  );
  let entries: import("node:fs").Dirent[] = [];

  try {
    entries = await readdir(operationsRoot, {
      withFileTypes: true,
    });
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
  }

  const summaries: PublishOperationSummary[] = [];

  for (const entry of entries) {
    if (
      !entry.isDirectory() ||
      entry.isSymbolicLink() ||
      entry.name.startsWith(".")
    ) {
      continue;
    }

    const operationPath = path.join(
      operationsRoot,
      entry.name,
    );

    try {
      const record = await readOperationRecord(
        operationPath,
      );
      const releaseId =
        isPublishOperationRecord(record)
          ? record.releaseId
          : record.releaseId;

      if (
        options.releaseId &&
        releaseId !== options.releaseId
      ) {
        continue;
      }

      summaries.push(
        await summarizeOperation(
          publishRoot,
          operationPath,
          record,
        ),
      );
    } catch (error) {
      summaries.push({
        operationId: entry.name,
        releaseId: "unknown-release",
        mode: "build",
        state: "failed",
        phase: "unreadable",
        startedAt: "",
        recoveryAction: "review-required",
        recoveryReason:
          error instanceof Error
            ? error.message
            : "Unable to read publish operation.",
        legacy: true,
      });
    }
  }

  summaries.sort((left, right) =>
    right.startedAt.localeCompare(
      left.startedAt,
    ),
  );

  const latestByRelease = new Map<
    string,
    PublishOperationSummary
  >();
  for (const operation of summaries) {
    if (!latestByRelease.has(operation.releaseId)) {
      latestByRelease.set(
        operation.releaseId,
        operation,
      );
    }
  }

  const limited = summaries.slice(
    0,
    Math.max(1, Math.min(options.limit ?? 30, 200)),
  );
  const latestOperations = Array.from(
    latestByRelease.values(),
  );

  return {
    serverInstanceId: publishServerInstanceId,
    operations: limited,
    interruptedCount: latestOperations.filter(
      (operation) =>
        operation.state === "interrupted",
    ).length,
    failedCount: latestOperations.filter(
      (operation) =>
        operation.state === "failed",
    ).length,
  };
}

async function rollbackInterruptedOperation(
  publishRoot: string,
  operationPath: string,
  record: PublishOperationRecord,
): Promise<void> {
  const canonicalPublishRoot = path.resolve(
    publishRoot,
  );
  const targetReleasePath = rootPath(
    canonicalPublishRoot,
    record.destinationReleaseRelativePath,
  );
  const targetCatalogPath = rootPath(
    canonicalPublishRoot,
    "catalog.json",
  );
  const stageReleasePath = path.join(
    operationPath,
    "stage-release",
  );
  const stagedCatalogPath = path.join(
    operationPath,
    "catalog.json",
  );
  const backupReleasePath = path.join(
    operationPath,
    "backup-release",
  );
  const backupCatalogPath = path.join(
    operationPath,
    "backup-catalog.json",
  );

  const targetReleaseIsOperation =
    await targetReleaseBelongsToOperation(
      publishRoot,
      record,
    );
  const targetCatalogIsOperation =
    await targetCatalogBelongsToOperation(
      publishRoot,
      record,
    );

  if (await pathExists(backupCatalogPath)) {
    if (await pathExists(targetCatalogPath)) {
      if (!targetCatalogIsOperation) {
        throw new Error(
          "Guarded rollback refused to replace an unattributed public catalog.",
        );
      }
      await rm(targetCatalogPath, {
        force: true,
      });
    }

    await rename(
      backupCatalogPath,
      targetCatalogPath,
    );
  } else if (
    !record.catalogPreviouslyExisted &&
    targetCatalogIsOperation
  ) {
    await rm(targetCatalogPath, {
      force: true,
    });
  }

  if (await pathExists(backupReleasePath)) {
    if (await pathExists(targetReleasePath)) {
      if (!targetReleaseIsOperation) {
        throw new Error(
          "Guarded rollback refused to replace an unattributed public release.",
        );
      }
      await rm(targetReleasePath, {
        recursive: true,
        force: true,
      });
    }

    await rename(
      backupReleasePath,
      targetReleasePath,
    );
  } else if (
    !record.releasePreviouslyExisted &&
    targetReleaseIsOperation
  ) {
    await rm(targetReleasePath, {
      recursive: true,
      force: true,
    });
  }

  await rm(stageReleasePath, {
    recursive: true,
    force: true,
  });
  await rm(stagedCatalogPath, {
    force: true,
  });
}

export async function recoverPublishOperation(
  publishRoot: string,
  operationId: string,
): Promise<PublishOperationSummary> {
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,191}$/.test(
      operationId,
    )
  ) {
    throw new Error(
      "Publish operation id contains unsupported characters.",
    );
  }

  const operationsRoot = publishOperationsRoot(
    publishRoot,
  );
  const operationPath = rootPath(
    operationsRoot,
    operationId,
  );
  const record = await readOperationRecord(
    operationPath,
  );

  if (!isPublishOperationRecord(record)) {
    throw new Error(
      "Legacy publish operations require manual review; automatic recovery is unavailable.",
    );
  }

  if (
    record.state !== "running" ||
    record.serverInstanceId ===
      publishServerInstanceId
  ) {
    throw new Error(
      "Only interrupted operations from a previous server instance can be recovered.",
    );
  }

  const inspection = await inspectRecovery(
    publishRoot,
    operationPath,
    record,
  );

  if (inspection.action === "review-required") {
    throw new Error(
      `Automatic recovery requires review: ${inspection.reason}`,
    );
  }

  const recoveredAt = new Date().toISOString();
  let nextRecord: PublishOperationRecord;

  if (inspection.action === "finalize-current") {
    const integrity =
      record.mode === "unpublish"
        ? await verifyUnpublishedPackageIntegrity(
            publishRoot,
            record.releaseId,
            record.artifacts?.stagedCatalogSha256,
          )
        : await verifyPublishedPackageIntegrity(
            publishRoot,
            record.releaseId,
            record.reviewedPlanFingerprint,
          );

    if (!integrity.ok) {
      throw new Error(
        `Finalization verification failed: ${integrity.reason}`,
      );
    }

    nextRecord = advancePublishOperation(
      record,
      "completed",
      {
        state: "completed",
        completedAt: recoveredAt,
        resources: integrity.resourceCount,
        recovery: {
          action: "finalized-current",
          recoveredAt,
          note:
            record.mode === "unpublish"
              ? "Interrupted unpublish operation was finalized after public removal and catalog membership verified successfully."
              : "Interrupted operation was finalized after the already-promoted package and catalog verified successfully.",
        },
      },
    );
  } else {
    await rollbackInterruptedOperation(
      publishRoot,
      operationPath,
      record,
    );

    nextRecord = advancePublishOperation(
      record,
      "failed",
      {
        state: "failed",
        failedAt: recoveredAt,
        error:
          "Interrupted publish was recovered by restoring the pre-operation public state.",
        recovery: {
          action: "rolled-back",
          recoveredAt,
          note:
            "Interrupted operation was safely rolled back using operation attribution and backups.",
        },
      },
    );
  }

  await writePublishOperationRecord(
    operationPath,
    nextRecord,
  );

  return summarizeOperation(
    publishRoot,
    operationPath,
    nextRecord,
  );
}

export async function assertNoUnresolvedPublishOperation(
  publishRoot: string,
  releaseId: string,
): Promise<void> {
  const history = await listPublishOperations(
    publishRoot,
    {
      releaseId,
      limit: 20,
    },
  );
  const unresolved = history.operations[0];

  if (
    unresolved &&
    (
      unresolved.state === "interrupted" ||
      unresolved.state === "running"
    )
  ) {
    throw new Error(
      `Release has an unresolved ${unresolved.state} publish operation (${unresolved.operationId}). Recover or review that operation before publishing again.`,
    );
  }
}
