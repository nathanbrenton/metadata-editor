import {
  link,
  lstat,
  open,
  readFile,
  realpath,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import {
  createHash,
  randomUUID,
} from "node:crypto";
import { parse } from "smol-toml";

import {
  assertPathWithinRoot,
} from "./media-root.js";
import type {
  MetadataCreationReceipt,
  MetadataCreationResult,
  MetadataGenerationPlan,
} from "./types.js";

async function pathExists(
  candidatePath: string,
): Promise<boolean> {
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

async function createFileAtomically(
  mediaRoot: string,
  relativePath: string,
  content: string,
): Promise<void> {
  // Validate the exact content immediately before writing.
  parse(content);

  /*
   * macOS may expose /var through the canonical /private/var path.
   * Compare canonical paths so legitimate in-root paths are not rejected.
   */
  const canonicalMediaRoot = await realpath(mediaRoot);

  const targetPath = assertPathWithinRoot(
    canonicalMediaRoot,
    path.join(canonicalMediaRoot, relativePath),
  );

  const parentPath = path.dirname(targetPath);
  const canonicalParent = await realpath(parentPath);

  // Resolving the parent prevents a symlinked directory from escaping.
  assertPathWithinRoot(
    canonicalMediaRoot,
    canonicalParent,
  );

  if (await pathExists(targetPath)) {
    throw new Error(
      `Refusing to overwrite existing file: ${relativePath}`,
    );
  }

  const temporaryPath = assertPathWithinRoot(
    canonicalMediaRoot,
    path.join(
      canonicalParent,
      `.${path.basename(targetPath)}.${randomUUID()}.tmp`,
    ),
  );

  let temporaryCreated = false;

  try {
    const temporaryFile = await open(
      temporaryPath,
      "wx",
      0o600,
    );

    temporaryCreated = true;

    try {
      await temporaryFile.writeFile(
        content,
        "utf8",
      );

      // Flush the completed temporary file before publishing it.
      await temporaryFile.sync();
    } finally {
      await temporaryFile.close();
    }

    /*
     * A hard link publishes the completed file atomically and fails
     * when the target already exists. Unlike rename(), it cannot
     * silently replace an existing metadata file.
     */
    await link(temporaryPath, targetPath);
    await unlink(temporaryPath);
    temporaryCreated = false;
  } finally {
    if (temporaryCreated) {
      await unlink(temporaryPath).catch(
        () => undefined,
      );
    }
  }
}

async function verifyCreatedFile(
  mediaRoot: string,
  relativePath: string,
): Promise<MetadataCreationReceipt> {
  const canonicalMediaRoot = await realpath(mediaRoot);

  const targetPath = assertPathWithinRoot(
    canonicalMediaRoot,
    path.join(canonicalMediaRoot, relativePath),
  );

  const content = await readFile(targetPath);

  // Verify the exact bytes published to disk still contain valid TOML.
  parse(content.toString("utf8"));

  return {
    relativePath,
    bytes: content.byteLength,
    sha256: createHash("sha256")
      .update(content)
      .digest("hex"),
    verifiedAt: new Date().toISOString(),
  };
}

export async function executeMetadataCreationPlan(
  mediaRoot: string,
  plan: MetadataGenerationPlan,
): Promise<MetadataCreationResult> {
  const created: string[] = [];
  const blocked: string[] = [];
  const receipts: MetadataCreationReceipt[] = [];

  for (const item of plan.items) {
    if (item.action === "blocked") {
      blocked.push(item.relativePath);
      continue;
    }

    if (!item.validated) {
      throw new Error(
        `Refusing to write invalid TOML: ${item.relativePath}`,
      );
    }

    await createFileAtomically(
      mediaRoot,
      item.relativePath,
      item.content,
    );

    created.push(item.relativePath);

    receipts.push(
      await verifyCreatedFile(
        mediaRoot,
        item.relativePath,
      ),
    );
  }

  return {
    releaseId: plan.releaseId,
    created,
    blocked,
    receipts,
    warnings: [...plan.warnings],
  };
}
