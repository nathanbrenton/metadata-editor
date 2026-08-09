import {
  constants,
} from "node:fs";
import {
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import {
  createHash,
  randomUUID,
} from "node:crypto";
import path from "node:path";

import {
  parse,
  stringify,
} from "smol-toml";

import {
  assertPathWithinRoot,
  toLibraryRelativePath,
} from "./media-root.js";
import type {
  ReleaseScanResult,
} from "./types.js";

export const releaseRenameConfirmation =
  "RENAME_RELEASE_DIRECTORY";

export type ReleaseRenamePlanItem = {
  kind: "directory" | "toml" | "receipt";
  relativePath: string;
  targetRelativePath: string;
  action: "rename" | "update" | "unchanged" | "blocked";
  reason: string;
};

export type ReleaseRenamePlan = {
  releaseId: string;
  targetReleaseId: string;
  currentTitle: string;
  targetTitle: string;
  sourceRelativePath: string;
  targetRelativePath: string;
  confirmation: typeof releaseRenameConfirmation;
  generatedAt: string;
  items: ReleaseRenamePlanItem[];
  summary: {
    renameCount: number;
    updateCount: number;
    unchangedCount: number;
    blockedCount: number;
  };
  fingerprint: string;
};

export type ReleaseRenameReceipt = {
  previousReleaseId: string;
  releaseId: string;
  previousRelativePath: string;
  relativePath: string;
  operationId: string | null;
  manifestRelativePath: string | null;
  updatedFiles: string[];
  completedAt: string;
};

type PreparedTextUpdate = {
  sourceRelativePath: string;
  targetRelativePath: string;
  sourcePath: string;
  targetPath: string;
  content: string;
  sha256: string;
};

type PreparedReleaseRename = {
  plan: ReleaseRenamePlan;
  sourcePath: string;
  targetPath: string;
  releasesRoot: string;
  updates: PreparedTextUpdate[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function normalizeReleaseId(value: string): string {
  const normalized = value.trim();

  if (
    !normalized ||
    normalized === "." ||
    normalized === ".." ||
    path.basename(normalized) !== normalized ||
    normalized.includes("/") ||
    normalized.includes("\\") ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(normalized)
  ) {
    throw new Error(
      "Release directory ID must contain only letters, numbers, periods, underscores, and hyphens, and cannot contain a path separator.",
    );
  }

  return normalized;
}

function normalizeTitle(value: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error("Release title is required.");
  }

  if (normalized.length > 500) {
    throw new Error("Release title exceeds 500 characters.");
  }

  return normalized;
}

async function pathExists(candidatePath: string): Promise<boolean> {
  try {
    await lstat(candidatePath);
    return true;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return false;
    }

    throw error;
  }
}

async function assertRealDirectory(
  mediaRoot: string,
  directoryPath: string,
): Promise<void> {
  const confined = assertPathWithinRoot(mediaRoot, directoryPath);
  const stats = await lstat(confined);

  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error(
      `Expected a real directory: ${toLibraryRelativePath(mediaRoot, confined)}`,
    );
  }
}

async function collectTomlFiles(
  mediaRoot: string,
  rootPath: string,
): Promise<string[]> {
  const result: string[] = [];

  async function walk(directoryPath: string): Promise<void> {
    const entries = await readdir(directoryPath, {
      withFileTypes: true,
    });

    for (const entry of entries) {
      if (
        entry.name === ".metadata-editor-operations" ||
        entry.name.startsWith(".metadata-editor-release-rename-")
      ) {
        continue;
      }

      const entryPath = assertPathWithinRoot(
        mediaRoot,
        path.join(directoryPath, entry.name),
      );

      if (entry.isSymbolicLink()) {
        throw new Error(
          `Release rename will not traverse symbolic links: ${toLibraryRelativePath(mediaRoot, entryPath)}`,
        );
      }

      if (entry.isDirectory()) {
        await walk(entryPath);
      } else if (
        entry.isFile() &&
        entry.name.toLowerCase().endsWith(".toml")
      ) {
        result.push(entryPath);
      }
    }
  }

  await walk(rootPath);
  result.sort((left, right) => left.localeCompare(right));
  return result;
}

function updateTomlDocument(
  document: unknown,
  filename: string,
  targetReleaseId: string,
  targetTitle: string,
): boolean {
  if (!isRecord(document)) {
    throw new Error(`${filename} must contain a TOML table.`);
  }

  let changed = false;

  if (filename === "release.toml") {
    if (!isRecord(document.release)) {
      throw new Error(
        "release.toml must contain a [release] table before the release can be renamed.",
      );
    }

    if (document.release.id !== targetReleaseId) {
      document.release.id = targetReleaseId;
      changed = true;
    }

    if (document.release.title !== targetTitle) {
      document.release.title = targetTitle;
      changed = true;
    }
  }

  if (isRecord(document.release_reference)) {
    if (
      document.release_reference.release_id !==
      targetReleaseId
    ) {
      document.release_reference.release_id =
        targetReleaseId;
      changed = true;
    }
  }

  return changed;
}

function updateReceiptDocument(
  value: unknown,
  sourceRelativePath: string,
  targetRelativePath: string,
  targetReleaseId: string,
  targetTitle: string,
): boolean {
  if (!isRecord(value)) {
    throw new Error("ingest-receipt.json must contain an object.");
  }

  let changed = false;

  if (isRecord(value.release)) {
    if (value.release.id !== targetReleaseId) {
      value.release.id = targetReleaseId;
      changed = true;
    }

    if (value.release.relativePath !== targetRelativePath) {
      value.release.relativePath = targetRelativePath;
      changed = true;
    }

    if (value.release.title !== targetTitle) {
      value.release.title = targetTitle;
      changed = true;
    }
  }

  const replaceReleasePrefix = (candidate: unknown): unknown => {
    if (typeof candidate === "string") {
      if (candidate === sourceRelativePath) {
        changed = true;
        return targetRelativePath;
      }

      if (candidate.startsWith(`${sourceRelativePath}/`)) {
        changed = true;
        return `${targetRelativePath}${candidate.slice(sourceRelativePath.length)}`;
      }

      return candidate;
    }

    if (Array.isArray(candidate)) {
      return candidate.map(replaceReleasePrefix);
    }

    if (isRecord(candidate)) {
      for (const [key, item] of Object.entries(candidate)) {
        candidate[key] = replaceReleasePrefix(item);
      }
    }

    return candidate;
  };

  replaceReleasePrefix(value);
  return changed;
}

function hashText(content: string): string {
  return createHash("sha256")
    .update(content)
    .digest("hex");
}

function summarize(
  items: ReleaseRenamePlanItem[],
): ReleaseRenamePlan["summary"] {
  return {
    renameCount: items.filter((item) => item.action === "rename").length,
    updateCount: items.filter((item) => item.action === "update").length,
    unchangedCount: items.filter((item) => item.action === "unchanged").length,
    blockedCount: items.filter((item) => item.action === "blocked").length,
  };
}

function fingerprintPlan(
  plan: Omit<ReleaseRenamePlan, "fingerprint" | "generatedAt" | "summary" | "confirmation">,
  updates: PreparedTextUpdate[],
): string {
  return createHash("sha256")
    .update(JSON.stringify({
      releaseId: plan.releaseId,
      targetReleaseId: plan.targetReleaseId,
      targetTitle: plan.targetTitle,
      sourceRelativePath: plan.sourceRelativePath,
      targetRelativePath: plan.targetRelativePath,
      items: plan.items.map((item) => ({
        kind: item.kind,
        relativePath: item.relativePath,
        targetRelativePath: item.targetRelativePath,
        action: item.action,
        reason: item.reason,
      })),
      updates: updates.map((update) => ({
        sourceRelativePath: update.sourceRelativePath,
        targetRelativePath: update.targetRelativePath,
        sha256: update.sha256,
      })),
    }))
    .digest("hex");
}

async function prepareReleaseRename(
  mediaRoot: string,
  release: ReleaseScanResult,
  requestedReleaseId: string,
  requestedTitle: string,
): Promise<PreparedReleaseRename> {
  const targetReleaseId = normalizeReleaseId(requestedReleaseId);
  const targetTitle = normalizeTitle(requestedTitle);
  const sourcePath = assertPathWithinRoot(
    mediaRoot,
    path.join(mediaRoot, release.relativePath),
  );
  await assertRealDirectory(mediaRoot, sourcePath);

  const releasesRoot = assertPathWithinRoot(
    mediaRoot,
    path.dirname(sourcePath),
  );
  await assertRealDirectory(mediaRoot, releasesRoot);

  const targetPath = assertPathWithinRoot(
    mediaRoot,
    path.join(releasesRoot, targetReleaseId),
  );
  const sourceRelativePath = toLibraryRelativePath(
    mediaRoot,
    sourcePath,
  );
  const targetRelativePath = toLibraryRelativePath(
    mediaRoot,
    targetPath,
  );
  const items: ReleaseRenamePlanItem[] = [];
  const updates: PreparedTextUpdate[] = [];

  const siblingEntries = await readdir(releasesRoot, {
    withFileTypes: true,
  });
  const targetCasefold = targetReleaseId.toLocaleLowerCase("en-US");
  const conflictingEntry = siblingEntries.find(
    (entry) =>
      entry.name.toLocaleLowerCase("en-US") === targetCasefold &&
      entry.name !== release.id,
  );

  if (conflictingEntry) {
    items.push({
      kind: "directory",
      relativePath: sourceRelativePath,
      targetRelativePath,
      action: "blocked",
      reason:
        `Target release directory already exists and will not be overwritten: ${conflictingEntry.name}`,
    });
  } else if (targetReleaseId === release.id) {
    items.push({
      kind: "directory",
      relativePath: sourceRelativePath,
      targetRelativePath,
      action: "unchanged",
      reason: "Release directory ID is unchanged.",
    });
  } else {
    items.push({
      kind: "directory",
      relativePath: sourceRelativePath,
      targetRelativePath,
      action: "rename",
      reason:
        "The canonical release directory will be moved after metadata updates are validated and backed up.",
    });
  }

  const tomlFiles = await collectTomlFiles(mediaRoot, sourcePath);
  const hasReleaseToml = tomlFiles.some(
    (filePath) => path.basename(filePath) === "release.toml",
  );

  if (!hasReleaseToml) {
    items.push({
      kind: "toml",
      relativePath: `${sourceRelativePath}/release.toml`,
      targetRelativePath: `${targetRelativePath}/release.toml`,
      action: "blocked",
      reason:
        "release.toml is required so the canonical release ID and title can be synchronized.",
    });
  }

  for (const filePath of tomlFiles) {
    const sourceRelative = toLibraryRelativePath(mediaRoot, filePath);
    const suffix = sourceRelative.slice(sourceRelativePath.length);
    const targetRelative = `${targetRelativePath}${suffix}`;
    const content = await readFile(filePath, "utf8");
    const document = parse(content);
    const changed = updateTomlDocument(
      document,
      path.basename(filePath),
      targetReleaseId,
      targetTitle,
    );

    if (!changed) {
      items.push({
        kind: "toml",
        relativePath: sourceRelative,
        targetRelativePath: targetRelative,
        action: "unchanged",
        reason: "No release identity values require updating in this TOML document.",
      });
      continue;
    }

    const nextContent = `${stringify(document).trimEnd()}\n`;
    parse(nextContent);
    updates.push({
      sourceRelativePath: sourceRelative,
      targetRelativePath: targetRelative,
      sourcePath: filePath,
      targetPath: assertPathWithinRoot(
        mediaRoot,
        path.join(mediaRoot, targetRelative),
      ),
      content: nextContent,
      sha256: hashText(content),
    });
    items.push({
      kind: "toml",
      relativePath: sourceRelative,
      targetRelativePath: targetRelative,
      action: "update",
      reason:
        path.basename(filePath) === "release.toml"
          ? "Update release.id and release.title."
          : "Update release_reference.release_id.",
    });
  }

  const receiptPath = assertPathWithinRoot(
    mediaRoot,
    path.join(sourcePath, "ingest-receipt.json"),
  );

  if (await pathExists(receiptPath)) {
    const receiptStats = await lstat(receiptPath);

    if (!receiptStats.isFile() || receiptStats.isSymbolicLink()) {
      items.push({
        kind: "receipt",
        relativePath: `${sourceRelativePath}/ingest-receipt.json`,
        targetRelativePath: `${targetRelativePath}/ingest-receipt.json`,
        action: "blocked",
        reason: "ingest-receipt.json must be a regular file.",
      });
    } else {
      const content = await readFile(receiptPath, "utf8");
      const receipt = JSON.parse(content) as unknown;
      const changed = updateReceiptDocument(
        receipt,
        sourceRelativePath,
        targetRelativePath,
        targetReleaseId,
        targetTitle,
      );
      const sourceRelative = `${sourceRelativePath}/ingest-receipt.json`;
      const targetRelative = `${targetRelativePath}/ingest-receipt.json`;

      if (changed) {
        const nextContent = `${JSON.stringify(receipt, null, 2)}\n`;
        JSON.parse(nextContent);
        updates.push({
          sourceRelativePath: sourceRelative,
          targetRelativePath: targetRelative,
          sourcePath: receiptPath,
          targetPath: assertPathWithinRoot(
            mediaRoot,
            path.join(mediaRoot, targetRelative),
          ),
          content: nextContent,
          sha256: hashText(content),
        });
        items.push({
          kind: "receipt",
          relativePath: sourceRelative,
          targetRelativePath: targetRelative,
          action: "update",
          reason:
            "Update the staging receipt release identity and release-relative destination paths.",
        });
      } else {
        items.push({
          kind: "receipt",
          relativePath: sourceRelative,
          targetRelativePath: targetRelative,
          action: "unchanged",
          reason: "The ingest receipt already uses the requested release identity.",
        });
      }
    }
  }

  const planWithoutDerived = {
    releaseId: release.id,
    targetReleaseId,
    currentTitle: release.releaseTitle ?? "",
    targetTitle,
    sourceRelativePath,
    targetRelativePath,
    items,
  };
  const summary = summarize(items);

  return {
    sourcePath,
    targetPath,
    releasesRoot,
    updates,
    plan: {
      ...planWithoutDerived,
      confirmation: releaseRenameConfirmation,
      generatedAt: new Date().toISOString(),
      summary,
      fingerprint: fingerprintPlan(
        planWithoutDerived,
        updates,
      ),
    },
  };
}

export async function buildReleaseRenamePlan(
  mediaRoot: string,
  release: ReleaseScanResult,
  targetReleaseId: string,
  targetTitle: string,
): Promise<ReleaseRenamePlan> {
  return (
    await prepareReleaseRename(
      mediaRoot,
      release,
      targetReleaseId,
      targetTitle,
    )
  ).plan;
}

async function writeFileAtomically(
  mediaRoot: string,
  targetPath: string,
  content: string,
): Promise<void> {
  const confined = assertPathWithinRoot(mediaRoot, targetPath);
  const temporaryPath = assertPathWithinRoot(
    mediaRoot,
    path.join(
      path.dirname(confined),
      `.${path.basename(confined)}.release-rename-${randomUUID()}.tmp`,
    ),
  );
  const file = await open(temporaryPath, "wx", 0o600);

  try {
    await file.writeFile(content, "utf8");
    await file.sync();
  } finally {
    await file.close();
  }

  try {
    await rename(temporaryPath, confined);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

async function writeManifest(
  mediaRoot: string,
  manifestPath: string,
  value: unknown,
  exclusive: boolean,
): Promise<void> {
  const content = `${JSON.stringify(value, null, 2)}\n`;

  if (exclusive) {
    const file = await open(manifestPath, "wx", 0o600);

    try {
      await file.writeFile(content, "utf8");
      await file.sync();
    } finally {
      await file.close();
    }

    return;
  }

  await writeFileAtomically(mediaRoot, manifestPath, content);
}

export async function executeReleaseRenamePlan(
  mediaRoot: string,
  release: ReleaseScanResult,
  targetReleaseId: string,
  targetTitle: string,
  confirmation: string,
  expectedFingerprint: string,
): Promise<ReleaseRenameReceipt> {
  if (confirmation !== releaseRenameConfirmation) {
    throw new Error(
      `Confirmation must be ${releaseRenameConfirmation}.`,
    );
  }

  const prepared = await prepareReleaseRename(
    mediaRoot,
    release,
    targetReleaseId,
    targetTitle,
  );
  const { plan } = prepared;

  if (!expectedFingerprint || expectedFingerprint !== plan.fingerprint) {
    throw new Error(
      "Release rename plan changed. Review the latest dry-run plan before applying it.",
    );
  }

  if (plan.summary.blockedCount > 0) {
    throw new Error(
      `Release rename is blocked. ${plan.items
        .filter((item) => item.action === "blocked")
        .map((item) => item.reason)
        .join(" ")}`,
    );
  }

  if (plan.summary.renameCount === 0 && plan.summary.updateCount === 0) {
    return {
      previousReleaseId: release.id,
      releaseId: release.id,
      previousRelativePath: release.relativePath,
      relativePath: release.relativePath,
      operationId: null,
      manifestRelativePath: null,
      updatedFiles: [],
      completedAt: new Date().toISOString(),
    };
  }

  const lockPath = assertPathWithinRoot(
    mediaRoot,
    path.join(prepared.releasesRoot, ".metadata-editor-release-rename.lock"),
  );
  let lockFile: Awaited<ReturnType<typeof open>>;

  try {
    lockFile = await open(lockPath, "wx", 0o600);
  } catch (error) {
    if (await pathExists(lockPath)) {
      throw new Error("Another release rename operation is already running.");
    }

    throw error;
  }

  const operationId = randomUUID();
  // Keep operation artifacts outside releases/ so the Library scanner never
  // mistakes manifests or backups for a canonical release.
  const operationsRoot = assertPathWithinRoot(
    mediaRoot,
    path.join(mediaRoot, ".metadata-editor-operations"),
  );
  const operationRoot = assertPathWithinRoot(
    mediaRoot,
    path.join(operationsRoot, `release-rename-${operationId}`),
  );
  const backupRoot = assertPathWithinRoot(
    mediaRoot,
    path.join(operationRoot, "backups"),
  );
  const manifestPath = assertPathWithinRoot(
    mediaRoot,
    path.join(operationRoot, "manifest.json"),
  );
  let currentReleasePath = prepared.sourcePath;

  try {
    await mkdir(operationsRoot, { recursive: true, mode: 0o700 });
    await mkdir(operationRoot, { recursive: false, mode: 0o700 });
    await mkdir(backupRoot, { recursive: false, mode: 0o700 });

    const manifestBase = {
      schemaVersion: 1,
      operationId,
      operation: "release-rename",
      status: "planned",
      createdAt: new Date().toISOString(),
      plan,
    };
    await writeManifest(mediaRoot, manifestPath, manifestBase, true);

    for (const [index, update] of prepared.updates.entries()) {
      const currentContent = await readFile(update.sourcePath, "utf8");

      if (hashText(currentContent) !== update.sha256) {
        throw new Error(
          `Release metadata changed after review: ${update.sourceRelativePath}`,
        );
      }

      const backupPath = assertPathWithinRoot(
        mediaRoot,
        path.join(
          backupRoot,
          `${String(index + 1).padStart(3, "0")}-${path.basename(update.sourcePath)}`,
        ),
      );
      await copyFile(update.sourcePath, backupPath, constants.COPYFILE_EXCL);
      await writeFileAtomically(mediaRoot, update.sourcePath, update.content);
    }

    if (plan.summary.renameCount > 0) {
      const temporaryPath = assertPathWithinRoot(
        mediaRoot,
        path.join(
          prepared.releasesRoot,
          `.metadata-editor-release-rename-${operationId}`,
        ),
      );

      if (await pathExists(temporaryPath)) {
        throw new Error("Temporary release rename path already exists.");
      }

      await rename(prepared.sourcePath, temporaryPath);
      currentReleasePath = temporaryPath;

      if (await pathExists(prepared.targetPath)) {
        throw new Error(
          `Target release directory appeared during the operation and will not be overwritten: ${plan.targetRelativePath}`,
        );
      }

      await rename(temporaryPath, prepared.targetPath);
      currentReleasePath = prepared.targetPath;
    }

    const completedAt = new Date().toISOString();
    const updatedFiles = prepared.updates.map(
      (update) => update.targetRelativePath,
    );

    await writeManifest(
      mediaRoot,
      manifestPath,
      {
        ...manifestBase,
        status: "completed",
        completedAt,
        updatedFiles,
      },
      false,
    );

    return {
      previousReleaseId: release.id,
      releaseId: plan.targetReleaseId,
      previousRelativePath: plan.sourceRelativePath,
      relativePath: plan.targetRelativePath,
      operationId,
      manifestRelativePath: toLibraryRelativePath(mediaRoot, manifestPath),
      updatedFiles,
      completedAt,
    };
  } catch (error) {
    const rollbackErrors: string[] = [];

    if (
      currentReleasePath !== prepared.sourcePath &&
      await pathExists(currentReleasePath)
    ) {
      try {
        if (await pathExists(prepared.sourcePath)) {
          throw new Error(
            `Original release directory reappeared during rollback: ${plan.sourceRelativePath}`,
          );
        }

        await rename(currentReleasePath, prepared.sourcePath);
        currentReleasePath = prepared.sourcePath;
      } catch (rollbackError) {
        rollbackErrors.push(
          rollbackError instanceof Error
            ? rollbackError.message
            : String(rollbackError),
        );
      }
    }

    if (await pathExists(prepared.sourcePath)) {
      for (const [index, update] of prepared.updates.entries()) {
        const backupPath = assertPathWithinRoot(
          mediaRoot,
          path.join(
            backupRoot,
            `${String(index + 1).padStart(3, "0")}-${path.basename(update.sourcePath)}`,
          ),
        );
        const restoredPath = assertPathWithinRoot(
          mediaRoot,
          path.join(
            prepared.sourcePath,
            path.relative(prepared.sourcePath, update.sourcePath),
          ),
        );

        try {
          if (await pathExists(backupPath)) {
            await writeFileAtomically(
              mediaRoot,
              restoredPath,
              await readFile(backupPath, "utf8"),
            );
          }
        } catch (rollbackError) {
          rollbackErrors.push(
            rollbackError instanceof Error
              ? rollbackError.message
              : String(rollbackError),
          );
        }
      }
    }

    try {
      await writeManifest(
        mediaRoot,
        manifestPath,
        {
          schemaVersion: 1,
          operationId,
          operation: "release-rename",
          status: "rolled-back",
          failedAt: new Date().toISOString(),
          error: error instanceof Error ? error.message : String(error),
          rollbackErrors,
          plan,
        },
        false,
      );
    } catch (manifestError) {
      rollbackErrors.push(
        manifestError instanceof Error
          ? manifestError.message
          : String(manifestError),
      );
    }

    const baseMessage = error instanceof Error ? error.message : String(error);
    throw new Error(
      rollbackErrors.length > 0
        ? `${baseMessage} Rollback also reported: ${rollbackErrors.join(" ")}`
        : `${baseMessage} The operation was rolled back.`,
    );
  } finally {
    await lockFile.close();
    await rm(lockPath, { force: true });
  }
}
