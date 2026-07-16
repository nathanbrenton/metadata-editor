import {
  lstat,
  readFile,
  realpath,
} from "node:fs/promises";
import path from "node:path";
import { parse } from "smol-toml";

import {
  assertPathWithinRoot,
} from "./media-root.js";
import type {
  MetadataFileStatus,
  ParsedMetadataDocument,
  ReleaseMetadataDetail,
  ReleaseScanResult,
} from "./types.js";

async function readMetadataDocument(
  mediaRoot: string,
  file: MetadataFileStatus,
  scope: "release" | "track",
  trackId?: string,
): Promise<ParsedMetadataDocument | null> {
  if (!file.exists) {
    return null;
  }

  const canonicalMediaRoot =
    await realpath(mediaRoot);

  const candidatePath = assertPathWithinRoot(
    canonicalMediaRoot,
    path.join(
      canonicalMediaRoot,
      file.relativePath,
    ),
  );

  const stats = await lstat(candidatePath);

  if (
    !stats.isFile() ||
    stats.isSymbolicLink()
  ) {
    throw new Error(
      `Metadata path is not a regular file: ${file.relativePath}`,
    );
  }

  /*
   * Resolve the actual file path so a symlinked parent directory cannot
   * redirect reads outside the configured media root.
   */
  const canonicalFilePath =
    await realpath(candidatePath);

  assertPathWithinRoot(
    canonicalMediaRoot,
    canonicalFilePath,
  );

  const content = await readFile(
    canonicalFilePath,
    "utf8",
  );

  const parsed = parse(content);

  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    throw new Error(
      `Expected TOML document object: ${file.relativePath}`,
    );
  }

  return {
    filename: file.filename,
    relativePath: file.relativePath,
    scope,
    ...(trackId ? { trackId } : {}),
    content,
    parsed: parsed as Record<string, unknown>,
  };
}

export async function readReleaseMetadataDetail(
  mediaRoot: string,
  release: ReleaseScanResult,
): Promise<ReleaseMetadataDetail> {
  const documents: ParsedMetadataDocument[] =
    [];
  const missingFiles: MetadataFileStatus[] =
    [];
  const warnings: string[] = [];

  for (const file of release.metadataFiles) {
    if (!file.exists) {
      missingFiles.push(file);
      continue;
    }

    try {
      const document =
        await readMetadataDocument(
          mediaRoot,
          file,
          "release",
        );

      if (document) {
        documents.push(document);
      }
    } catch (error) {
      warnings.push(
        error instanceof Error
          ? `${file.relativePath}: ${error.message}`
          : `${file.relativePath}: unknown read error`,
      );
    }
  }

  for (const track of release.tracks) {
    for (const file of track.metadataFiles) {
      if (!file.exists) {
        missingFiles.push(file);
        continue;
      }

      try {
        const document =
          await readMetadataDocument(
            mediaRoot,
            file,
            "track",
            track.id,
          );

        if (document) {
          documents.push(document);
        }
      } catch (error) {
        warnings.push(
          error instanceof Error
            ? `${file.relativePath}: ${error.message}`
            : `${file.relativePath}: unknown read error`,
        );
      }
    }
  }

  return {
    releaseId: release.id,
    releaseRelativePath:
      release.relativePath,
    documents,
    missingFiles,
    warnings,
  };
}
