import {
  lstat,
  readFile,
  realpath,
} from "node:fs/promises";
import path from "node:path";

import {
  assertPathWithinIngestRoot,
} from "./ingest-root.js";
import {
  getLibraryArtworkPreviewMode,
  renderTiffArtworkPreview,
  type LibraryArtworkPreviewMode,
} from "./library-artwork-preview.js";

const maximumDirectIngestArtworkPreviewBytes =
  64 * 1024 * 1024;
const maximumTiffIngestArtworkSourceBytes =
  512 * 1024 * 1024;

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
  source:
    | Exclude<LibraryArtworkPreviewMode, "unsupported">
    | "embedded-extraction";
};

export function getIngestArtworkPreviewMode(
  relativePath: string,
): LibraryArtworkPreviewMode {
  return getLibraryArtworkPreviewMode(
    path.extname(relativePath),
  );
}

export function isIngestArtworkPreviewExtension(
  relativePath: string,
): boolean {
  return (
    getIngestArtworkPreviewMode(relativePath) !==
    "unsupported"
  );
}

export async function readIngestArtworkPreview(
  ingestRoot: string,
  relativePath: string,
): Promise<IngestArtworkPreview> {
  const extension = path
    .extname(relativePath)
    .toLowerCase();
  const previewMode =
    getIngestArtworkPreviewMode(relativePath);

  if (previewMode === "unsupported") {
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

  const maximumSourceBytes =
    previewMode === "tiff-transcode"
      ? maximumTiffIngestArtworkSourceBytes
      : maximumDirectIngestArtworkPreviewBytes;

  if (candidateStats.size > maximumSourceBytes) {
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

  if (previewMode === "tiff-transcode") {
    return {
      contentType: "image/png",
      bytes: await renderTiffArtworkPreview(
        canonicalPath,
      ),
      source: previewMode,
    };
  }

  const contentType =
    ingestArtworkPreviewContentTypes.get(
      extension,
    );

  if (!contentType) {
    throw new Error(
      "Artwork preview content type is unavailable.",
    );
  }

  return {
    contentType,
    bytes: await readFile(canonicalPath),
    source: previewMode,
  };
}

export async function readEmbeddedIngestArtworkPreview(
  ingestRoot: string,
  audioSourceRelativePath: string,
  streamIndex: number,
  codecName?: string,
): Promise<IngestArtworkPreview> {
  const canonicalRoot = await realpath(ingestRoot);
  const candidatePath = assertPathWithinIngestRoot(
    canonicalRoot,
    path.join(canonicalRoot, audioSourceRelativePath),
  );
  const stats = await lstat(candidatePath);

  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error("Embedded artwork audio source is not a regular file.");
  }

  const canonicalPath = await realpath(candidatePath);
  assertPathWithinIngestRoot(canonicalRoot, canonicalPath);
  const { extractEmbeddedArtwork } = await import("./embedded-artwork.js");
  const extracted = await extractEmbeddedArtwork(
    canonicalPath,
    streamIndex,
    codecName,
  );

  return {
    contentType: extracted.contentType,
    bytes: extracted.bytes,
    source: "embedded-extraction",
  };
}
