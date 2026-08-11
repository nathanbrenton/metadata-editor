import {
  createHash,
  randomUUID,
} from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";

import {
  assertPathWithinRoot,
} from "./media-root.js";
import {
  advancePublishOperation,
  assertNoUnresolvedPublishOperation,
  publishOperationsRoot,
  publishServerInstanceId,
  verifyUnpublishedPackageIntegrity,
  writePublishOperationRecord,
  type PublishOperationRecord,
} from "./publish-operations.js";

const catalogFilename = "catalog.json";
const publicationManifestFilename = "publication-manifest.json";
const unpublishConfirmation = "UNPUBLISH_PUBLIC_RELEASE";

export type PublicCatalogMembership = {
  releaseId: string;
  title?: string;
  primaryArtist?: string;
  href: string;
  destinationReleaseRelativePath: string;
  releaseDirectoryExists: boolean;
};

export type PublicReleaseUnpublishIssue = {
  code: string;
  severity: "warning" | "blocked";
  relativePath: string;
  message: string;
};

export type PublicReleaseUnpublishPlan = {
  schema: {
    name: "metadata-editor-public-release-unpublish-plan";
    version: 1;
  };
  releaseId: string;
  generatedAt: string;
  readOnly: true;
  writesEnabled: false;
  confirmation: typeof unpublishConfirmation;
  destinationReleaseRelativePath: string;
  catalogEntry: PublicCatalogMembership | null;
  publication: {
    publishedAt?: string;
    sourcePlanFingerprint?: string;
    sourceContentFingerprint?: string;
  };
  publicFiles: {
    fileCount: number;
    totalBytes: number;
    treeFingerprint: string;
  };
  deploymentManifestWillNeedRefresh: boolean;
  status: "ready" | "blocked";
  issues: PublicReleaseUnpublishIssue[];
  planFingerprint: string;
};

export type PublicReleaseUnpublishReceipt = {
  releaseId: string;
  operationId: string;
  destinationRelativePath: string;
  mode: "unpublish";
  removedFileCount: number;
  removedBytes: number;
  completedAt: string;
  deploymentManifestRefreshRequired: true;
};

type CatalogEntry = {
  id: string;
  href: string;
  title?: string;
  primaryArtist?: string;
};

type PublicCatalog = {
  schema: {
    name: "audio-player-catalog";
    version: 1;
  };
  generatedAt: string;
  releases: CatalogEntry[];
};

type PublicationManifest = {
  releaseId?: string;
  publishedAt?: string;
  sourcePlanFingerprint?: string;
  sourceContentFingerprint?: string;
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

function assertReleaseId(releaseId: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,191}$/.test(releaseId)) {
    throw new Error(
      "Release id contains unsupported characters.",
    );
  }
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

async function writeJson(
  filePath: string,
  value: unknown,
): Promise<void> {
  await mkdir(path.dirname(filePath), {
    recursive: true,
  });
  await writeFile(
    filePath,
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

async function readCatalog(
  publishRoot: string,
): Promise<PublicCatalog | null> {
  const catalogPath = rootPath(
    path.resolve(publishRoot),
    catalogFilename,
  );

  try {
    const value = JSON.parse(
      await readFile(catalogPath, "utf8"),
    ) as unknown;

    if (
      !isRecord(value) ||
      !isRecord(value.schema) ||
      value.schema.name !== "audio-player-catalog" ||
      value.schema.version !== 1 ||
      typeof value.generatedAt !== "string" ||
      !Array.isArray(value.releases)
    ) {
      throw new Error(
        "Public catalog is not a valid audio-player catalog v1 document.",
      );
    }

    const releases: CatalogEntry[] = [];
    for (const item of value.releases) {
      if (
        !isRecord(item) ||
        typeof item.id !== "string" ||
        typeof item.href !== "string"
      ) {
        throw new Error(
          "Public catalog contains an invalid release entry.",
        );
      }

      releases.push({
        id: item.id,
        href: item.href,
        ...(typeof item.title === "string"
          ? { title: item.title }
          : {}),
        ...(typeof item.primaryArtist === "string"
          ? { primaryArtist: item.primaryArtist }
          : {}),
      });
    }

    return {
      schema: {
        name: "audio-player-catalog",
        version: 1,
      },
      generatedAt: value.generatedAt,
      releases,
    };
  } catch (error) {
    if (isMissingFileError(error)) {
      return null;
    }

    throw error;
  }
}

async function hashReleaseTree(
  releaseRoot: string,
): Promise<{
  fileCount: number;
  totalBytes: number;
  treeFingerprint: string;
}> {
  const entries: Array<{
    path: string;
    sha256: string;
    bytes: number;
  }> = [];

  const walk = async (
    directory: string,
    prefix = "",
  ): Promise<void> => {
    const children = await readdir(directory, {
      withFileTypes: true,
    });
    children.sort((left, right) =>
      left.name.localeCompare(right.name),
    );

    for (const child of children) {
      if (child.isSymbolicLink()) {
        throw new Error(
          `Public release contains a symbolic link and cannot be safely unpublished: ${path.posix.join(prefix, child.name)}`,
        );
      }

      const childPath = path.join(
        directory,
        child.name,
      );
      const relativePath = path.posix.join(
        prefix,
        child.name,
      );

      if (child.isDirectory()) {
        await walk(childPath, relativePath);
        continue;
      }

      if (!child.isFile()) {
        throw new Error(
          `Public release contains an unsupported filesystem entry: ${relativePath}`,
        );
      }

      const digest = await sha256File(childPath);
      entries.push({
        path: relativePath,
        ...digest,
      });
    }
  };

  await walk(releaseRoot);

  return {
    fileCount: entries.length,
    totalBytes: entries.reduce(
      (total, entry) => total + entry.bytes,
      0,
    ),
    treeFingerprint: createHash("sha256")
      .update(JSON.stringify(entries))
      .digest("hex"),
  };
}

export async function listPublicCatalogMembership(
  publishRoot: string,
): Promise<PublicCatalogMembership[]> {
  const canonicalPublishRoot = path.resolve(
    publishRoot,
  );
  const catalog = await readCatalog(
    canonicalPublishRoot,
  );

  if (!catalog) {
    return [];
  }

  const memberships: PublicCatalogMembership[] = [];

  for (const entry of catalog.releases) {
    const destinationReleaseRelativePath =
      path.posix.join("releases", entry.id);
    const releasePath = rootPath(
      canonicalPublishRoot,
      destinationReleaseRelativePath,
    );

    memberships.push({
      releaseId: entry.id,
      href: entry.href,
      destinationReleaseRelativePath,
      releaseDirectoryExists:
        await pathExists(releasePath),
      ...(entry.title ? { title: entry.title } : {}),
      ...(entry.primaryArtist
        ? { primaryArtist: entry.primaryArtist }
        : {}),
    });
  }

  memberships.sort((left, right) =>
    left.releaseId.localeCompare(
      right.releaseId,
      undefined,
      { numeric: true },
    ),
  );

  return memberships;
}

export async function buildPublicReleaseUnpublishPlan(
  publishRoot: string,
  releaseId: string,
  options: {
    generatedAt?: string;
  } = {},
): Promise<PublicReleaseUnpublishPlan> {
  assertReleaseId(releaseId);
  const generatedAt =
    options.generatedAt ?? new Date().toISOString();
  const canonicalPublishRoot = path.resolve(
    publishRoot,
  );
  const destinationReleaseRelativePath =
    path.posix.join("releases", releaseId);
  const targetReleasePath = rootPath(
    canonicalPublishRoot,
    destinationReleaseRelativePath,
  );
  const targetCatalogPath = rootPath(
    canonicalPublishRoot,
    catalogFilename,
  );
  const issues: PublicReleaseUnpublishIssue[] = [];

  let catalog: PublicCatalog | null = null;
  try {
    catalog = await readCatalog(
      canonicalPublishRoot,
    );
  } catch (error) {
    issues.push({
      code: "public-catalog-invalid",
      severity: "blocked",
      relativePath: catalogFilename,
      message:
        error instanceof Error
          ? error.message
          : "Public catalog could not be read.",
    });
  }

  const matchingEntries =
    catalog?.releases.filter(
      (entry) => entry.id === releaseId,
    ) ?? [];

  if (matchingEntries.length !== 1) {
    issues.push({
      code:
        matchingEntries.length === 0
          ? "public-catalog-membership-missing"
          : "public-catalog-membership-duplicate",
      severity: "blocked",
      relativePath: catalogFilename,
      message:
        matchingEntries.length === 0
          ? "Release is not currently a member of the public catalog."
          : "Public catalog contains duplicate membership for this release.",
    });
  }

  let releaseDirectoryExists = false;
  let publicFiles = {
    fileCount: 0,
    totalBytes: 0,
    treeFingerprint: "",
  };

  try {
    const releaseStats = await lstat(
      targetReleasePath,
    );
    releaseDirectoryExists = true;
    if (
      releaseStats.isSymbolicLink() ||
      !releaseStats.isDirectory()
    ) {
      issues.push({
        code: "public-release-target-unsafe",
        severity: "blocked",
        relativePath:
          destinationReleaseRelativePath,
        message:
          "Public release target is not a regular directory.",
      });
    } else {
      publicFiles = await hashReleaseTree(
        targetReleasePath,
      );
    }
  } catch (error) {
    if (isMissingFileError(error)) {
      issues.push({
        code: "public-release-directory-missing",
        severity: "blocked",
        relativePath:
          destinationReleaseRelativePath,
        message:
          "Public catalog references this release, but its public release directory is missing.",
      });
    } else {
      issues.push({
        code: "public-release-read-failed",
        severity: "blocked",
        relativePath:
          destinationReleaseRelativePath,
        message:
          error instanceof Error
            ? error.message
            : "Public release directory could not be inspected.",
      });
    }
  }

  let publication: PublicReleaseUnpublishPlan["publication"] = {};
  if (releaseDirectoryExists) {
    try {
      const manifestValue = JSON.parse(
        await readFile(
          path.join(
            targetReleasePath,
            publicationManifestFilename,
          ),
          "utf8",
        ),
      ) as PublicationManifest;

      if (
        manifestValue.releaseId &&
        manifestValue.releaseId !== releaseId
      ) {
        issues.push({
          code: "publication-manifest-release-mismatch",
          severity: "blocked",
          relativePath: path.posix.join(
            destinationReleaseRelativePath,
            publicationManifestFilename,
          ),
          message:
            "Publication manifest identifies a different release.",
        });
      }

      publication = {
        ...(typeof manifestValue.publishedAt === "string"
          ? { publishedAt: manifestValue.publishedAt }
          : {}),
        ...(typeof manifestValue.sourcePlanFingerprint === "string"
          ? {
              sourcePlanFingerprint:
                manifestValue.sourcePlanFingerprint,
            }
          : {}),
        ...(typeof manifestValue.sourceContentFingerprint === "string"
          ? {
              sourceContentFingerprint:
                manifestValue.sourceContentFingerprint,
            }
          : {}),
      };
    } catch (error) {
      issues.push({
        code: "publication-manifest-unreadable",
        severity: "warning",
        relativePath: path.posix.join(
          destinationReleaseRelativePath,
          publicationManifestFilename,
        ),
        message:
          "Publication manifest could not be read. The complete public release tree is still fingerprinted before removal.",
      });
    }
  }

  const catalogEntry =
    matchingEntries.length === 1
      ? {
          releaseId,
          href: matchingEntries[0].href,
          destinationReleaseRelativePath,
          releaseDirectoryExists,
          ...(matchingEntries[0].title
            ? { title: matchingEntries[0].title }
            : {}),
          ...(matchingEntries[0].primaryArtist
            ? {
                primaryArtist:
                  matchingEntries[0].primaryArtist,
              }
            : {}),
        }
      : null;

  let catalogSha256 = "";
  try {
    catalogSha256 = (
      await sha256File(targetCatalogPath)
    ).sha256;
  } catch (error) {
    if (!isMissingFileError(error)) {
      throw error;
    }
  }

  const fingerprintInput = {
    releaseId,
    destinationReleaseRelativePath,
    catalogSha256,
    catalogEntry,
    publicFiles,
    publication,
  };
  const planFingerprint = createHash("sha256")
    .update(JSON.stringify(fingerprintInput))
    .digest("hex");

  return {
    schema: {
      name: "metadata-editor-public-release-unpublish-plan",
      version: 1,
    },
    releaseId,
    generatedAt,
    readOnly: true,
    writesEnabled: false,
    confirmation: unpublishConfirmation,
    destinationReleaseRelativePath,
    catalogEntry,
    publication,
    publicFiles,
    deploymentManifestWillNeedRefresh: true,
    status: issues.some(
      (issue) => issue.severity === "blocked",
    )
      ? "blocked"
      : "ready",
    issues,
    planFingerprint,
  };
}

export async function unpublishPublicRelease(
  publishRoot: string,
  releaseId: string,
  options: {
    expectedPlanFingerprint: string;
    planGeneratedAt: string;
    confirmation: string;
  },
): Promise<PublicReleaseUnpublishReceipt> {
  assertReleaseId(releaseId);

  if (options.confirmation !== unpublishConfirmation) {
    throw new Error(
      `Unpublish confirmation must be exactly ${unpublishConfirmation}.`,
    );
  }

  const reviewedPlan =
    await buildPublicReleaseUnpublishPlan(
      publishRoot,
      releaseId,
      {
        generatedAt: options.planGeneratedAt,
      },
    );

  if (
    reviewedPlan.planFingerprint !==
    options.expectedPlanFingerprint
  ) {
    throw new Error(
      "Public release or catalog changed since the unpublish plan was reviewed. Refresh the unpublish plan and try again.",
    );
  }

  if (reviewedPlan.status !== "ready") {
    throw new Error(
      `Public release cannot be unpublished: ${reviewedPlan.issues.map((issue) => issue.message).join("; ")}`,
    );
  }

  const canonicalPublishRoot = await realpath(
    path.resolve(publishRoot),
  );
  await assertNoUnresolvedPublishOperation(
    canonicalPublishRoot,
    releaseId,
  );

  const operationsRoot = publishOperationsRoot(
    canonicalPublishRoot,
  );
  await mkdir(operationsRoot, {
    recursive: true,
  });
  const canonicalOperationsRoot = await realpath(
    operationsRoot,
  );
  const operationId =
    `${Date.now()}-${randomUUID()}`;
  const operationPath = rootPath(
    canonicalOperationsRoot,
    operationId,
  );
  const targetReleasePath = rootPath(
    canonicalPublishRoot,
    reviewedPlan.destinationReleaseRelativePath,
  );
  const targetCatalogPath = rootPath(
    canonicalPublishRoot,
    catalogFilename,
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

  const startedAt = new Date().toISOString();
  let releaseBackedUp = false;
  let catalogBackedUp = false;
  let catalogPromoted = false;

  await mkdir(operationPath, {
    recursive: false,
  });

  let operationRecord: PublishOperationRecord = {
    schema: {
      name: "metadata-editor-publish-operation",
      version: 2,
    },
    operationId,
    serverInstanceId: publishServerInstanceId,
    releaseId,
    destinationReleaseRelativePath:
      reviewedPlan.destinationReleaseRelativePath,
    startedAt,
    updatedAt: startedAt,
    reviewedPlanFingerprint:
      reviewedPlan.planFingerprint,
    sourceContentFingerprint:
      reviewedPlan.publicFiles.treeFingerprint,
    mode: "unpublish",
    state: "running",
    phase: "staging",
    releasePreviouslyExisted: true,
    catalogPreviouslyExisted: true,
    phaseHistory: [
      {
        phase: "staging",
        at: startedAt,
      },
    ],
  };

  const journal = async (
    phase: PublishOperationRecord["phase"],
    patch: Partial<PublishOperationRecord> = {},
  ): Promise<void> => {
    operationRecord = advancePublishOperation(
      operationRecord,
      phase,
      patch,
    );
    await writePublishOperationRecord(
      operationPath,
      operationRecord,
    );
  };

  await writePublishOperationRecord(
    operationPath,
    operationRecord,
  );

  try {
    const catalog = await readCatalog(
      canonicalPublishRoot,
    );
    if (!catalog) {
      throw new Error(
        "Public catalog disappeared before unpublish staging.",
      );
    }

    const nextCatalog: PublicCatalog = {
      ...catalog,
      generatedAt: startedAt,
      releases: catalog.releases.filter(
        (entry) => entry.id !== releaseId,
      ),
    };

    if (
      nextCatalog.releases.length !==
      catalog.releases.length - 1
    ) {
      throw new Error(
        "Public catalog membership changed before unpublish staging.",
      );
    }

    await writeJson(
      stagedCatalogPath,
      nextCatalog,
    );
    const stagedCatalogSha256 = (
      await sha256File(stagedCatalogPath)
    ).sha256;

    await journal("validating", {
      artifacts: {
        stagedCatalogSha256,
      },
    });

    const promotionPlan =
      await buildPublicReleaseUnpublishPlan(
        canonicalPublishRoot,
        releaseId,
        {
          generatedAt:
            options.planGeneratedAt,
        },
      );

    if (
      promotionPlan.planFingerprint !==
      reviewedPlan.planFingerprint
    ) {
      throw new Error(
        "Public release or catalog changed while the unpublish operation was being staged. Refresh the unpublish plan and try again.",
      );
    }

    await journal("backing-up-release");
    const releaseStats = await lstat(
      targetReleasePath,
    );
    if (
      releaseStats.isSymbolicLink() ||
      !releaseStats.isDirectory()
    ) {
      throw new Error(
        "Public release target is no longer a regular directory.",
      );
    }
    await rename(
      targetReleasePath,
      backupReleasePath,
    );
    releaseBackedUp = true;

    await journal("backing-up-catalog");
    const catalogStats = await lstat(
      targetCatalogPath,
    );
    if (
      catalogStats.isSymbolicLink() ||
      !catalogStats.isFile()
    ) {
      throw new Error(
        "Public catalog target is no longer a regular file.",
      );
    }
    await rename(
      targetCatalogPath,
      backupCatalogPath,
    );
    catalogBackedUp = true;

    await journal("promoting-catalog");
    await rename(
      stagedCatalogPath,
      targetCatalogPath,
    );
    catalogPromoted = true;

    await journal("verifying");
    const integrity =
      await verifyUnpublishedPackageIntegrity(
        canonicalPublishRoot,
        releaseId,
        stagedCatalogSha256,
      );

    if (!integrity.ok) {
      throw new Error(
        `Post-unpublish integrity verification failed: ${integrity.reason}`,
      );
    }

    const completedAt = new Date().toISOString();
    await journal("completed", {
      state: "completed",
      completedAt,
      resources:
        reviewedPlan.publicFiles.fileCount,
    });

    return {
      releaseId,
      operationId,
      destinationRelativePath:
        reviewedPlan.destinationReleaseRelativePath,
      mode: "unpublish",
      removedFileCount:
        reviewedPlan.publicFiles.fileCount,
      removedBytes:
        reviewedPlan.publicFiles.totalBytes,
      completedAt,
      deploymentManifestRefreshRequired: true,
    };
  } catch (error) {
    if (catalogPromoted) {
      await rm(targetCatalogPath, {
        force: true,
      }).catch(() => undefined);
      catalogPromoted = false;
    }

    if (catalogBackedUp) {
      await rename(
        backupCatalogPath,
        targetCatalogPath,
      ).catch(() => undefined);
    }

    if (releaseBackedUp) {
      await rename(
        backupReleasePath,
        targetReleasePath,
      ).catch(() => undefined);
    }

    await journal("failed", {
      state: "failed",
      failedAt: new Date().toISOString(),
      error:
        error instanceof Error
          ? error.message
          : "Unknown unpublish error",
    }).catch(() => undefined);

    throw error;
  }
}
