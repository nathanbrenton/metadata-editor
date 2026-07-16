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
import type {
  ReleaseScanResult,
  EditableMetadataValue,
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

function isEditableMetadataValue(
  value: unknown,
): value is EditableMetadataValue {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    (
      Array.isArray(value) &&
      value.every(
        (entry) => typeof entry === "string",
      )
    )
  );
}

function describeEditableType(
  value: EditableMetadataValue,
): string {
  return Array.isArray(value)
    ? "string-array"
    : typeof value;
}

function validateMetadataPath(
  metadataPath: string,
): string[] {
  const segments = metadataPath.split(".");

  if (
    segments.length === 0 ||
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment === "__proto__" ||
        segment === "prototype" ||
        segment === "constructor",
    )
  ) {
    throw new Error(
      `Invalid metadata path: ${metadataPath}`,
    );
  }

  return segments;
}

function applyScalarChange(
  document: Record<string, unknown>,
  change: MetadataValueChange,
): void {
  if (!isEditableMetadataValue(change.value)) {
    throw new Error(
      `Only scalar values and string arrays may be saved: ${change.path}`,
    );
  }

  const segments = validateMetadataPath(
    change.path,
  );

  let current: Record<string, unknown> =
    document;

  for (
    let index = 0;
    index < segments.length - 1;
    index += 1
  ) {
    const segment = segments[index];
    const nextValue = current[segment];

    if (
      typeof nextValue !== "object" ||
      nextValue === null ||
      Array.isArray(nextValue)
    ) {
      throw new Error(
        `Metadata path does not reference a table: ${change.path}`,
      );
    }

    current =
      nextValue as Record<string, unknown>;
  }

  const finalSegment =
    segments[segments.length - 1];

  if (
    !Object.prototype.hasOwnProperty.call(
      current,
      finalSegment,
    )
  ) {
    throw new Error(
      `Metadata path does not exist: ${change.path}`,
    );
  }

  const originalValue = current[finalSegment];

  if (!isEditableMetadataValue(originalValue)) {
    throw new Error(
      `Metadata path is not an editable scalar or string array: ${change.path}`,
    );
  }

  if (
    describeEditableType(originalValue) !==
    describeEditableType(change.value)
  ) {
    throw new Error(
      `Metadata type mismatch at ${change.path}: expected ${describeEditableType(originalValue)}`,
    );
  }

  if (
    typeof change.value === "number" &&
    !Number.isFinite(change.value)
  ) {
    throw new Error(
      `Metadata number must be finite: ${change.path}`,
    );
  }

  current[finalSegment] = change.value;
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
    parsed as Record<string, unknown>;

  for (const change of changes) {
    applyScalarChange(
      updatedDocument,
      change,
    );
  }

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
