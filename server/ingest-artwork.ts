import {
  lstat,
  readFile,
  realpath,
} from "node:fs/promises";
import path from "node:path";

import {
  assertPathWithinIngestRoot,
} from "./ingest-root.js";

const maximumIngestArtworkPreviewBytes =
  64 * 1024 * 1024;

const ingestArtworkPreviewContentTypes =
  new Map([
    [".avif", "image/avif"],
    [".gif", "image/gif"],
    [".jpeg", "image/jpeg"],
    [".jpg", "image/jpeg"],
    [".png", "image/png"],
    [".webp", "image/webp"],
  ]);

export type IngestArtworkPreview = {
  contentType: string;
  bytes: Buffer;
};

export function isIngestArtworkPreviewExtension(
  relativePath: string,
): boolean {
  return ingestArtworkPreviewContentTypes.has(
    path.extname(relativePath).toLowerCase(),
  );
}

export async function readIngestArtworkPreview(
  ingestRoot: string,
  relativePath: string,
): Promise<IngestArtworkPreview> {
  const extension = path
    .extname(relativePath)
    .toLowerCase();
  const contentType =
    ingestArtworkPreviewContentTypes.get(
      extension,
    );

  if (!contentType) {
    throw new Error(
      "Artwork type cannot be previewed safely in the browser.",
    );
  }

  const canonicalRoot = await realpath(
    ingestRoot,
  );
  const candidatePath =
    assertPathWithinIngestRoot(
      canonicalRoot,
      path.join(
        canonicalRoot,
        relativePath,
      ),
    );
  const candidateStats = await lstat(
    candidatePath,
  );

  if (candidateStats.isSymbolicLink()) {
    throw new Error(
      "Symbolic links cannot be previewed from the ingest drop.",
    );
  }

  if (!candidateStats.isFile()) {
    throw new Error(
      "Ingest artwork preview target is not a file.",
    );
  }

  if (
    candidateStats.size >
    maximumIngestArtworkPreviewBytes
  ) {
    throw new Error(
      "Artwork preview exceeds the local preview size limit.",
    );
  }

  const canonicalPath = await realpath(
    candidatePath,
  );
  assertPathWithinIngestRoot(
    canonicalRoot,
    canonicalPath,
  );

  return {
    contentType,
    bytes: await readFile(canonicalPath),
  };
}
