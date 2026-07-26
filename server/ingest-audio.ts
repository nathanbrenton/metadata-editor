import {
  lstat,
  realpath,
} from "node:fs/promises";
import path from "node:path";

import {
  getAudioPreviewContentType,
} from "./audio-preview.js";
import {
  assertPathWithinIngestRoot,
} from "./ingest-root.js";

export type IngestAudioPreviewSource = {
  canonicalPath: string;
  extension: string;
  sizeBytes: number;
};

export async function resolveIngestAudioPreviewSource(
  ingestRoot: string,
  relativePath: string,
): Promise<IngestAudioPreviewSource> {
  const canonicalRoot = await realpath(ingestRoot);
  const candidatePath = assertPathWithinIngestRoot(
    canonicalRoot,
    path.join(canonicalRoot, relativePath),
  );
  const candidateStats = await lstat(candidatePath);

  if (candidateStats.isSymbolicLink()) {
    throw new Error(
      "Symbolic links cannot be previewed from the ingest drop.",
    );
  }

  if (!candidateStats.isFile()) {
    throw new Error(
      "Ingest audio preview target is not a regular file.",
    );
  }

  if (candidateStats.size <= 0) {
    throw new Error(
      "Ingest audio preview source is empty.",
    );
  }

  const extension = path
    .extname(relativePath)
    .toLowerCase();

  if (!getAudioPreviewContentType(extension)) {
    throw new Error(
      "Ingest source is not a recognized audio preview type.",
    );
  }

  const canonicalPath = await realpath(candidatePath);
  assertPathWithinIngestRoot(
    canonicalRoot,
    canonicalPath,
  );

  return {
    canonicalPath,
    extension,
    sizeBytes: candidateStats.size,
  };
}
