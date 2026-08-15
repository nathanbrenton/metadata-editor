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
  verifyPublishedPackageIntegrity,
} from "./publish-operations.js";
import {
  verifyPublishedArtistSnapshot,
} from "./artist-publication.js";
import {
  assertPathWithinRoot,
} from "./media-root.js";

export type PublishedMediaDeploymentIssue = {
  code: string;
  severity: "warning" | "blocked";
  relativePath: string;
  message: string;
};

export type PublishedMediaDeploymentFile = {
  path: string;
  sha256: string;
  bytes: number;
};

export type PublishedMediaDeploymentRelease = {
  releaseId: string;
  href: string;
  publishedAt?: string;
  contractVersion?: number;
  sourceContentFingerprint?: string;
  publicationManifest: PublishedMediaDeploymentFile;
  resourceCount: number;
  resourceBytes: number;
  integrity: "ready" | "blocked";
  integrityReason: string;
};

export type PublishedMediaDeploymentManifest = {
  schema: {
    name: "metadata-editor-published-media-deployment-manifest";
    version: 1;
  };
  generatedAt: string;
  publicPackageContract: {
    name: "audio-player-public-package";
    versions: number[];
  };
  catalog: PublishedMediaDeploymentFile;
  releases: PublishedMediaDeploymentRelease[];
  files: PublishedMediaDeploymentFile[];
  snapshot: {
    releaseCount: number;
    fileCount: number;
    totalBytes: number;
    contentFingerprint: string;
  };
};

export type PublishedMediaDeploymentAudit = {
  schema: {
    name: "metadata-editor-published-media-deployment-audit";
    version: 1;
  };
  generatedAt: string;
  publishRoot: string;
  status: "empty" | "ready" | "warning" | "blocked";
  deployable: boolean;
  issues: PublishedMediaDeploymentIssue[];
  catalog: {
    exists: boolean;
    releaseCount: number;
    sha256?: string;
    bytes?: number;
  };
  deploymentManifest: {
    exists: boolean;
    current: boolean;
    generatedAt?: string;
    sha256?: string;
    bytes?: number;
    contentFingerprint?: string;
  };
  releases: PublishedMediaDeploymentRelease[];
  summary: {
    catalogReleaseCount: number;
    releaseDirectoryCount: number;
    readyReleaseCount: number;
    blockedReleaseCount: number;
    fileCount: number;
    totalBytes: number;
    warningCount: number;
    blockedCount: number;
  };
  candidateManifest?: PublishedMediaDeploymentManifest;
};

const catalogFilename = "catalog.json";
const deploymentManifestFilename = "deployment-manifest.json";
const releasesDirectoryName = "releases";
const artistsDirectoryName = "artists";
const artistCatalogFilename = "artists.json";
const artistManifestFilename =
  "artist-publication-manifest.json";
const allowedRootNames = new Set([
  catalogFilename,
  deploymentManifestFilename,
  releasesDirectoryName,
  artistsDirectoryName,
  artistCatalogFilename,
  artistManifestFilename,
]);

const forbiddenPublicBasenames = new Set([
  "release.toml",
  "release-settings.toml",
  "release-production-notes.toml",
  "track.toml",
  "track-credits.toml",
  "track-production-notes.toml",
  "ingest-receipt.json",
  "stream-info.json",
  "audio-playback.mp3",
  "video.toml",
]);

function isForbiddenPublicPath(
  relativePath: string,
): boolean {
  const basename = path.posix.basename(
    relativePath.replaceAll("\\", "/"),
  );
  const lower = basename.toLowerCase();
  return (
    forbiddenPublicBasenames.has(lower) ||
    lower.startsWith("audio-master.") ||
    lower.startsWith("video-master.") ||
    lower.startsWith("distribution-master.") ||
    lower.endsWith(".toml") ||
    lower.endsWith(".tif") ||
    lower.endsWith(".tiff")
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

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
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
): Promise<PublishedMediaDeploymentFile> {
  const content = await readFile(filePath);

  return {
    path: "",
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
        `Published media contains a symbolic link: ${entryRelativePath}`,
      );
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
        `Published media contains an unsupported filesystem entry: ${entryRelativePath}`,
      );
    }

    files.push(entryRelativePath);
  }

  return files.sort();
}

function deploymentContentFingerprint(
  files: readonly PublishedMediaDeploymentFile[],
): string {
  const canonical = files
    .map((file) => ({
      path: file.path,
      sha256: file.sha256,
      bytes: file.bytes,
    }))
    .sort((left, right) =>
      left.path.localeCompare(right.path),
    );

  return createHash("sha256")
    .update(JSON.stringify(canonical))
    .digest("hex");
}

function normalizeManifestForComparison(
  value: unknown,
): PublishedMediaDeploymentManifest | null {
  if (!isRecord(value)) {
    return null;
  }

  const schema = value.schema;
  const snapshot = value.snapshot;
  const catalog = value.catalog;
  const files = value.files;
  const releases = value.releases;

  if (
    !isRecord(schema) ||
    schema.name !==
      "metadata-editor-published-media-deployment-manifest" ||
    schema.version !== 1 ||
    typeof value.generatedAt !== "string" ||
    !isRecord(snapshot) ||
    typeof snapshot.contentFingerprint !== "string" ||
    !isRecord(catalog) ||
    !Array.isArray(files) ||
    !Array.isArray(releases)
  ) {
    return null;
  }

  const normalizedFiles: PublishedMediaDeploymentFile[] = [];
  for (const file of files) {
    if (
      !isRecord(file) ||
      typeof file.path !== "string" ||
      !file.path ||
      typeof file.sha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(file.sha256) ||
      typeof file.bytes !== "number" ||
      !Number.isSafeInteger(file.bytes) ||
      file.bytes < 0
    ) {
      return null;
    }

    normalizedFiles.push({
      path: file.path,
      sha256: file.sha256,
      bytes: file.bytes,
    });
  }

  if (
    deploymentContentFingerprint(normalizedFiles) !==
      snapshot.contentFingerprint
  ) {
    return null;
  }

  return value as PublishedMediaDeploymentManifest;
}

async function inspectReleaseDirectoryNames(
  publishRoot: string,
): Promise<string[]> {
  const releasesRoot = rootPath(
    publishRoot,
    releasesDirectoryName,
  );

  if (!(await pathExists(releasesRoot))) {
    return [];
  }

  const stats = await lstat(releasesRoot);
  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error(
      "Published releases root is not a regular directory.",
    );
  }

  const entries = await readdir(releasesRoot, {
    withFileTypes: true,
  });
  const releaseIds: string[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    if (entry.isSymbolicLink() || !entry.isDirectory()) {
      throw new Error(
        `Published releases root contains an unsupported entry: ${entry.name}`,
      );
    }

    releaseIds.push(entry.name);
  }

  return releaseIds.sort((left, right) =>
    left.localeCompare(right, undefined, {
      numeric: true,
    }),
  );
}

function catalogReleaseIds(
  catalog: unknown,
): Array<{ id: string; href: string }> | null {
  if (!isRecord(catalog) || !Array.isArray(catalog.releases)) {
    return null;
  }

  const entries: Array<{ id: string; href: string }> = [];
  for (const entry of catalog.releases) {
    if (
      !isRecord(entry) ||
      typeof entry.id !== "string" ||
      !entry.id.trim() ||
      typeof entry.href !== "string" ||
      !entry.href.trim()
    ) {
      return null;
    }

    entries.push({
      id: entry.id,
      href: entry.href,
    });
  }

  return entries;
}

function publicationManifestSummary(
  releaseId: string,
  manifest: unknown,
  manifestFile: PublishedMediaDeploymentFile,
  integrity: "ready" | "blocked",
  integrityReason: string,
): PublishedMediaDeploymentRelease {
  const record = isRecord(manifest) ? manifest : {};
  const contract = isRecord(record.contract)
    ? record.contract
    : {};
  const resources = Array.isArray(record.resources)
    ? record.resources
    : [];
  let resourceBytes = 0;

  for (const resource of resources) {
    if (
      isRecord(resource) &&
      typeof resource.bytes === "number"
    ) {
      resourceBytes += resource.bytes;
    }
  }

  return {
    releaseId,
    href: path.posix.join(
      releasesDirectoryName,
      releaseId,
      "release.json",
    ),
    ...(typeof record.publishedAt === "string"
      ? { publishedAt: record.publishedAt }
      : {}),
    ...(typeof contract.version === "number"
      ? { contractVersion: contract.version }
      : {}),
    ...(typeof record.sourceContentFingerprint === "string"
      ? {
          sourceContentFingerprint:
            record.sourceContentFingerprint,
        }
      : {}),
    publicationManifest: manifestFile,
    resourceCount: resources.length,
    resourceBytes,
    integrity,
    integrityReason,
  };
}

async function buildCandidateManifest(
  publishRoot: string,
  generatedAt: string,
  catalogFile: PublishedMediaDeploymentFile,
  releases: readonly PublishedMediaDeploymentRelease[],
): Promise<PublishedMediaDeploymentManifest> {
  const filePaths = await walkRegularFiles(publishRoot);
  const deploymentFiles = filePaths
    .filter(
      (relativePath) =>
        relativePath !== deploymentManifestFilename,
    );
  const files: PublishedMediaDeploymentFile[] = [];

  for (const relativePath of deploymentFiles) {
    const digest = await sha256File(
      rootPath(publishRoot, relativePath),
    );
    files.push({
      ...digest,
      path: relativePath,
    });
  }

  files.sort((left, right) =>
    left.path.localeCompare(right.path),
  );
  const totalBytes = files.reduce(
    (total, file) => total + file.bytes,
    0,
  );
  const versions = Array.from(
    new Set(
      releases
        .map((release) => release.contractVersion)
        .filter(
          (version): version is number =>
            typeof version === "number",
        ),
    ),
  ).sort((left, right) => left - right);

  return {
    schema: {
      name: "metadata-editor-published-media-deployment-manifest",
      version: 1,
    },
    generatedAt,
    publicPackageContract: {
      name: "audio-player-public-package",
      versions,
    },
    catalog: catalogFile,
    releases: [...releases].sort((left, right) =>
      left.releaseId.localeCompare(
        right.releaseId,
        undefined,
        { numeric: true },
      ),
    ),
    files,
    snapshot: {
      releaseCount: releases.length,
      fileCount: files.length,
      totalBytes,
      contentFingerprint:
        deploymentContentFingerprint(files),
    },
  };
}

export async function auditPublishedMediaDeployment(
  publishRoot: string,
  generatedAt = new Date().toISOString(),
): Promise<PublishedMediaDeploymentAudit> {
  const canonicalPublishRoot = path.resolve(publishRoot);
  const issues: PublishedMediaDeploymentIssue[] = [];

  if (!(await pathExists(canonicalPublishRoot))) {
    return {
      schema: {
        name: "metadata-editor-published-media-deployment-audit",
        version: 1,
      },
      generatedAt,
      publishRoot: canonicalPublishRoot,
      status: "empty",
      deployable: false,
      issues: [
        {
          code: "publish-root-missing",
          severity: "warning",
          relativePath: ".",
          message:
            "Published-media root does not exist yet; publish at least one release before building a deployment snapshot.",
        },
      ],
      catalog: {
        exists: false,
        releaseCount: 0,
      },
      deploymentManifest: {
        exists: false,
        current: false,
      },
      releases: [],
      summary: {
        catalogReleaseCount: 0,
        releaseDirectoryCount: 0,
        readyReleaseCount: 0,
        blockedReleaseCount: 0,
        fileCount: 0,
        totalBytes: 0,
        warningCount: 1,
        blockedCount: 0,
      },
    };
  }

  const rootStats = await lstat(canonicalPublishRoot);
  if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) {
    throw new Error(
      `Configured published-media root is not a regular directory: ${canonicalPublishRoot}`,
    );
  }

  const rootEntries = await readdir(canonicalPublishRoot, {
    withFileTypes: true,
  });
  for (const entry of rootEntries) {
    if (entry.isSymbolicLink()) {
      issues.push({
        code: "root-symbolic-link",
        severity: "blocked",
        relativePath: entry.name,
        message:
          "Published-media root may not contain symbolic links.",
      });
      continue;
    }

    if (!allowedRootNames.has(entry.name)) {
      issues.push({
        code: "unexpected-root-entry",
        severity: "blocked",
        relativePath: entry.name,
        message:
          "Published-media contains an unexpected root entry. Deployment output may contain only release-package files plus the verified Artist Web Package.",
      });
    }
  }

  try {
    const publicFiles = await walkRegularFiles(
      canonicalPublishRoot,
    );
    for (const relativePath of publicFiles) {
      if (isForbiddenPublicPath(relativePath)) {
        issues.push({
          code: "private-public-resource",
          severity: "blocked",
          relativePath,
          message:
            "Private, archival, or canonical-master content is not allowed in the deployment snapshot.",
        });
      }
    }
  } catch (error) {
    issues.push({
      code: "public-tree-invalid",
      severity: "blocked",
      relativePath: ".",
      message:
        error instanceof Error
          ? error.message
          : "Published-media tree contains an unsupported filesystem entry.",
    });
  }

  const catalogPath = rootPath(
    canonicalPublishRoot,
    catalogFilename,
  );
  const catalogExists = await pathExists(catalogPath);
  let catalogEntries: Array<{ id: string; href: string }> = [];
  let catalogFile: PublishedMediaDeploymentFile | undefined;

  if (!catalogExists) {
    issues.push({
      code: "catalog-missing",
      severity: "blocked",
      relativePath: catalogFilename,
      message:
        "Published-media is missing catalog.json.",
    });
  } else {
    const catalogStats = await lstat(catalogPath);
    if (catalogStats.isSymbolicLink() || !catalogStats.isFile()) {
      issues.push({
        code: "catalog-not-file",
        severity: "blocked",
        relativePath: catalogFilename,
        message:
          "Public catalog is not a regular file.",
      });
    } else {
      const parsedCatalog = await readJsonFile(catalogPath);
      const parsedEntries = catalogReleaseIds(parsedCatalog);
      if (!parsedEntries) {
        issues.push({
          code: "catalog-invalid",
          severity: "blocked",
          relativePath: catalogFilename,
          message:
            "Public catalog is not a valid audio-player catalog release index.",
        });
      } else {
        catalogEntries = parsedEntries;
      }
      const digest = await sha256File(catalogPath);
      catalogFile = {
        ...digest,
        path: catalogFilename,
      };
    }
  }

  let releaseDirectoryNames: string[] = [];
  try {
    releaseDirectoryNames =
      await inspectReleaseDirectoryNames(
        canonicalPublishRoot,
      );
  } catch (error) {
    issues.push({
      code: "releases-root-invalid",
      severity: "blocked",
      relativePath: releasesDirectoryName,
      message:
        error instanceof Error
          ? error.message
          : "Published releases root is invalid.",
    });
  }

  const catalogIds = catalogEntries.map((entry) => entry.id);
  const duplicateCatalogIds = catalogIds.filter(
    (releaseId, index) =>
      catalogIds.indexOf(releaseId) !== index,
  );
  for (const releaseId of new Set(duplicateCatalogIds)) {
    issues.push({
      code: "catalog-duplicate-release",
      severity: "blocked",
      relativePath: catalogFilename,
      message:
        `Public catalog contains duplicate release ID ${releaseId}.`,
    });
  }

  const catalogIdSet = new Set(catalogIds);
  const directoryIdSet = new Set(releaseDirectoryNames);

  for (const releaseId of catalogIdSet) {
    if (!directoryIdSet.has(releaseId)) {
      issues.push({
        code: "catalog-release-missing-directory",
        severity: "blocked",
        relativePath: path.posix.join(
          releasesDirectoryName,
          releaseId,
        ),
        message:
          `Catalog references ${releaseId}, but its published release directory is missing.`,
      });
    }
  }

  for (const releaseId of directoryIdSet) {
    if (!catalogIdSet.has(releaseId)) {
      issues.push({
        code: "orphan-release-directory",
        severity: "blocked",
        relativePath: path.posix.join(
          releasesDirectoryName,
          releaseId,
        ),
        message:
          `Published release ${releaseId} exists on disk but is absent from catalog.json.`,
      });
    }
  }

  const releases: PublishedMediaDeploymentRelease[] = [];

  for (const releaseId of releaseDirectoryNames) {
    const manifestRelativePath = path.posix.join(
      releasesDirectoryName,
      releaseId,
      "publication-manifest.json",
    );
    const manifestPath = rootPath(
      canonicalPublishRoot,
      manifestRelativePath,
    );
    let manifest: unknown = {};
    let manifestFile: PublishedMediaDeploymentFile = {
      path: manifestRelativePath,
      sha256: "",
      bytes: 0,
    };

    try {
      const stats = await lstat(manifestPath);
      if (stats.isSymbolicLink() || !stats.isFile()) {
        throw new Error(
          "Publication manifest is not a regular file.",
        );
      }
      manifest = await readJsonFile(manifestPath);
      const digest = await sha256File(manifestPath);
      manifestFile = {
        ...digest,
        path: manifestRelativePath,
      };
    } catch (error) {
      issues.push({
        code: "publication-manifest-invalid",
        severity: "blocked",
        relativePath: manifestRelativePath,
        message:
          error instanceof Error
            ? error.message
            : "Publication manifest is unavailable.",
      });
      releases.push(
        publicationManifestSummary(
          releaseId,
          manifest,
          manifestFile,
          "blocked",
          "Publication manifest could not be read.",
        ),
      );
      continue;
    }

    const catalogEntry = catalogEntries.find(
      (entry) => entry.id === releaseId,
    );
    const expectedHref = path.posix.join(
      releasesDirectoryName,
      releaseId,
      "release.json",
    );
    if (catalogEntry && catalogEntry.href !== expectedHref) {
      issues.push({
        code: "catalog-release-href-mismatch",
        severity: "blocked",
        relativePath: catalogFilename,
        message:
          `Catalog href for ${releaseId} does not match ${expectedHref}.`,
      });
    }

    let integrity: Awaited<
      ReturnType<typeof verifyPublishedPackageIntegrity>
    >;
    try {
      integrity = await verifyPublishedPackageIntegrity(
        canonicalPublishRoot,
        releaseId,
      );
    } catch (error) {
      integrity = {
        ok: false,
        reason:
          error instanceof Error
            ? error.message
            : "Published release integrity verification failed.",
        resourceCount: 0,
      };
    }

    if (!integrity.ok) {
      issues.push({
        code: "release-integrity-failed",
        severity: "blocked",
        relativePath: path.posix.join(
          releasesDirectoryName,
          releaseId,
        ),
        message:
          `${releaseId}: ${integrity.reason}`,
      });
    }

    releases.push(
      publicationManifestSummary(
        releaseId,
        manifest,
        manifestFile,
        integrity.ok ? "ready" : "blocked",
        integrity.reason,
      ),
    );
  }

  const artistVerification =
    await verifyPublishedArtistSnapshot(
      canonicalPublishRoot,
    );
  if (
    artistVerification.exists &&
    !artistVerification.ok
  ) {
    issues.push({
      code: "artist-package-integrity-failed",
      severity: "blocked",
      relativePath: artistsDirectoryName,
      message:
        `Artist Web Package failed integrity verification: ${artistVerification.reason}`,
    });
  }

  let candidateManifest: PublishedMediaDeploymentManifest | undefined;
  if (
    catalogFile &&
    issues.every((issue) => issue.severity !== "blocked")
  ) {
    candidateManifest = await buildCandidateManifest(
      canonicalPublishRoot,
      generatedAt,
      catalogFile,
      releases,
    );
  }

  const deploymentManifestPath = rootPath(
    canonicalPublishRoot,
    deploymentManifestFilename,
  );
  const deploymentManifestExists =
    await pathExists(deploymentManifestPath);
  let deploymentManifestDigest:
    | PublishedMediaDeploymentFile
    | undefined;
  let deploymentManifestValue:
    | PublishedMediaDeploymentManifest
    | null = null;

  if (deploymentManifestExists) {
    try {
      const stats = await lstat(deploymentManifestPath);
      if (stats.isSymbolicLink() || !stats.isFile()) {
        throw new Error(
          "Deployment manifest is not a regular file.",
        );
      }
      deploymentManifestValue =
        normalizeManifestForComparison(
          await readJsonFile(deploymentManifestPath),
        );
      if (!deploymentManifestValue) {
        throw new Error(
          "Deployment manifest schema is invalid.",
        );
      }
      deploymentManifestDigest = await sha256File(
        deploymentManifestPath,
      );
    } catch (error) {
      issues.push({
        code: "deployment-manifest-invalid",
        severity: "warning",
        relativePath: deploymentManifestFilename,
        message:
          error instanceof Error
            ? error.message
            : "Deployment manifest is invalid.",
      });
    }
  }

  const manifestCurrent = Boolean(
    candidateManifest &&
    deploymentManifestValue &&
    deploymentManifestValue.snapshot.contentFingerprint ===
      candidateManifest.snapshot.contentFingerprint,
  );

  if (
    candidateManifest &&
    (!deploymentManifestExists || !manifestCurrent)
  ) {
    issues.push({
      code: deploymentManifestExists
        ? "deployment-manifest-stale"
        : "deployment-manifest-missing",
      severity: "warning",
      relativePath: deploymentManifestFilename,
      message: deploymentManifestExists
        ? "Deployment manifest is stale and must be refreshed before deployment."
        : "Deployment manifest has not been generated yet.",
    });
  }

  const warningCount = issues.filter(
    (issue) => issue.severity === "warning",
  ).length;
  const blockedCount = issues.filter(
    (issue) => issue.severity === "blocked",
  ).length;
  const readyReleaseCount = releases.filter(
    (release) => release.integrity === "ready",
  ).length;
  const blockedReleaseCount = releases.length - readyReleaseCount;
  const fileCount = candidateManifest?.snapshot.fileCount ?? 0;
  const totalBytes = candidateManifest?.snapshot.totalBytes ?? 0;
  // A present, valid catalog with zero releases is an intentional empty
  // public snapshot (for example after unpublishing the final release), not
  // an uninitialized published-media root. It must remain manifestable and
  // deployable so remote targets can receive an all-release removal.
  const status: PublishedMediaDeploymentAudit["status"] =
    blockedCount > 0
      ? "blocked"
      : warningCount > 0
        ? "warning"
        : "ready";

  return {
    schema: {
      name: "metadata-editor-published-media-deployment-audit",
      version: 1,
    },
    generatedAt,
    publishRoot: canonicalPublishRoot,
    status,
    deployable:
      status === "ready" && manifestCurrent,
    issues,
    catalog: {
      exists: catalogExists,
      releaseCount: catalogEntries.length,
      ...(catalogFile
        ? {
            sha256: catalogFile.sha256,
            bytes: catalogFile.bytes,
          }
        : {}),
    },
    deploymentManifest: {
      exists: deploymentManifestExists,
      current: manifestCurrent,
      ...(deploymentManifestValue
        ? {
            generatedAt:
              deploymentManifestValue.generatedAt,
            contentFingerprint:
              deploymentManifestValue.snapshot
                .contentFingerprint,
          }
        : {}),
      ...(deploymentManifestDigest
        ? {
            sha256: deploymentManifestDigest.sha256,
            bytes: deploymentManifestDigest.bytes,
          }
        : {}),
    },
    releases,
    summary: {
      catalogReleaseCount: catalogEntries.length,
      releaseDirectoryCount:
        releaseDirectoryNames.length,
      readyReleaseCount,
      blockedReleaseCount,
      fileCount,
      totalBytes,
      warningCount,
      blockedCount,
    },
    ...(candidateManifest
      ? { candidateManifest }
      : {}),
  };
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

export async function writePublishedMediaDeploymentManifest(
  publishRoot: string,
): Promise<PublishedMediaDeploymentAudit> {
  const before = await auditPublishedMediaDeployment(
    publishRoot,
  );

  if (!before.candidateManifest) {
    throw new Error(
      "Deployment manifest cannot be written until the published-media snapshot passes integrity verification.",
    );
  }

  if (before.summary.blockedCount > 0) {
    throw new Error(
      `Deployment manifest cannot be written while ${before.summary.blockedCount} blocking deployment issue${before.summary.blockedCount === 1 ? " remains" : "s remain"}.`,
    );
  }

  const refreshed = await auditPublishedMediaDeployment(
    publishRoot,
    before.candidateManifest.generatedAt,
  );
  if (
    !refreshed.candidateManifest ||
    refreshed.candidateManifest.snapshot.contentFingerprint !==
      before.candidateManifest.snapshot.contentFingerprint
  ) {
    throw new Error(
      "Published-media changed while the deployment manifest was being reviewed. Refresh and try again.",
    );
  }

  await atomicWriteJson(
    rootPath(
      path.resolve(publishRoot),
      deploymentManifestFilename,
    ),
    refreshed.candidateManifest,
  );

  const after = await auditPublishedMediaDeployment(
    publishRoot,
  );
  if (!after.deployable) {
    throw new Error(
      "Deployment manifest was written, but the resulting snapshot did not pass final verification.",
    );
  }

  return after;
}
