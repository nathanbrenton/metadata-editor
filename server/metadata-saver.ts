import {
  constants,
  copyFile,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  unlink,
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
import {
  applyMetadataChanges,
} from "./metadata-change-set.js";
import type {
  ReleaseScanResult,
  MetadataValueChange,
  ScalarMetadataSaveReceipt,
} from "./types.js";

function hashContent(
  content: string | Buffer,
): string {
  return createHash("sha256")
    .update(content)
    .digest("hex");
}

function findAllowedMetadataPath(
  release: ReleaseScanResult,
  relativePath: string,
): boolean {
  if (
    release.metadataFiles.some(
      (file) =>
        file.exists &&
        file.relativePath === relativePath,
    )
  ) {
    return true;
  }

  return release.tracks.some((track) =>
    track.metadataFiles.some(
      (file) =>
        file.exists &&
        file.relativePath === relativePath,
    ),
  );
}

function buildBackupFilename(
  filename: string,
): string {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-");

  return `${filename}.${timestamp}.bak`;
}

export async function saveScalarMetadataChanges(
  mediaRoot: string,
  release: ReleaseScanResult,
  relativePath: string,
  originalSha256: string,
  changes: MetadataValueChange[],
): Promise<ScalarMetadataSaveReceipt> {
  if (!/^[a-f0-9]{64}$/.test(originalSha256)) {
    throw new Error(
      "originalSha256 must be a SHA-256 hash",
    );
  }

  if (changes.length === 0) {
    throw new Error(
      "At least one scalar metadata change is required",
    );
  }

  if (
    !findAllowedMetadataPath(
      release,
      relativePath,
    )
  ) {
    throw new Error(
      "Target is not an existing metadata file in the selected release",
    );
  }

  const canonicalMediaRoot =
    await realpath(mediaRoot);

  const targetPath = assertPathWithinRoot(
    canonicalMediaRoot,
    path.join(
      canonicalMediaRoot,
      relativePath,
    ),
  );

  const canonicalTargetPath =
    await realpath(targetPath);

  assertPathWithinRoot(
    canonicalMediaRoot,
    canonicalTargetPath,
  );

  const originalContent = await readFile(
    canonicalTargetPath,
  );

  const currentSha256 =
    hashContent(originalContent);

  if (currentSha256 !== originalSha256) {
    throw new Error(
      "Metadata file changed externally; refresh before saving",
    );
  }

  const parsed = parse(
    originalContent.toString("utf8"),
  );

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    throw new Error(
      "Expected a TOML document object",
    );
  }

  const updatedDocument =
    applyMetadataChanges(
      parsed,
      changes,
    );

  const updatedContent =
    `${stringify(updatedDocument).trimEnd()}\n`;

  // Validate the exact replacement content.
  parse(updatedContent);

  const parentPath =
    path.dirname(canonicalTargetPath);

  const backupDirectory =
    assertPathWithinRoot(
      canonicalMediaRoot,
      path.join(
        parentPath,
        ".metadata-backups",
      ),
    );

  await mkdir(backupDirectory, {
    recursive: true,
    mode: 0o700,
  });

  const canonicalBackupDirectory =
    await realpath(backupDirectory);

  assertPathWithinRoot(
    canonicalMediaRoot,
    canonicalBackupDirectory,
  );

  const backupPath =
    assertPathWithinRoot(
      canonicalMediaRoot,
      path.join(
        canonicalBackupDirectory,
        buildBackupFilename(
          path.basename(canonicalTargetPath),
        ),
      ),
    );

  /*
   * COPYFILE_EXCL prevents accidental replacement if a timestamp
   * collision occurs.
   */
  await copyFile(
    canonicalTargetPath,
    backupPath,
    constants.COPYFILE_EXCL,
  );

  const temporaryPath =
    assertPathWithinRoot(
      canonicalMediaRoot,
      path.join(
        parentPath,
        `.${path.basename(canonicalTargetPath)}.${randomUUID()}.tmp`,
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
        updatedContent,
        "utf8",
      );
      await temporaryFile.sync();
    } finally {
      await temporaryFile.close();
    }

    /*
     * Recheck immediately before replacement to narrow the race window.
     */
    const preReplaceContent =
      await readFile(canonicalTargetPath);

    if (
      hashContent(preReplaceContent) !==
      originalSha256
    ) {
      throw new Error(
        "Metadata file changed externally during save",
      );
    }

    await rename(
      temporaryPath,
      canonicalTargetPath,
    );

    temporaryCreated = false;
  } finally {
    if (temporaryCreated) {
      await unlink(temporaryPath).catch(
        () => undefined,
      );
    }
  }

  const savedContent = await readFile(
    canonicalTargetPath,
  );

  parse(savedContent.toString("utf8"));

  return {
    relativePath,
    backupRelativePath:
      toLibraryRelativePath(
        canonicalMediaRoot,
        backupPath,
      ),
    previousSha256: currentSha256,
    savedSha256:
      hashContent(savedContent),
    bytes: savedContent.byteLength,
    savedAt: new Date().toISOString(),
  };
}
