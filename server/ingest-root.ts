import {
  lstat,
  realpath,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

export const defaultIngestRoot = "../ingest-drop";

export async function resolveIngestRoot(
  configuredRoot =
    process.env.INGEST_ROOT ?? defaultIngestRoot,
): Promise<string> {
  const candidate = path.resolve(
    projectRoot,
    configuredRoot,
  );

  return realpath(candidate);
}

export function assertPathWithinIngestRoot(
  ingestRoot: string,
  candidatePath: string,
): string {
  const resolvedRoot = path.resolve(ingestRoot);
  const resolvedCandidate = path.resolve(candidatePath);
  const relative = path.relative(
    resolvedRoot,
    resolvedCandidate,
  );

  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(
      `Path escapes configured ingest root: ${resolvedCandidate}`,
    );
  }

  return resolvedCandidate;
}

export async function resolveIngestCandidate(
  ingestRoot: string,
  candidateId: string,
): Promise<string> {
  if (
    !candidateId ||
    candidateId === "." ||
    candidateId === ".." ||
    candidateId.includes("/") ||
    candidateId.includes("\\") ||
    path.basename(candidateId) !== candidateId
  ) {
    throw new Error("Invalid ingest candidate identifier");
  }

  const candidatePath = assertPathWithinIngestRoot(
    ingestRoot,
    path.join(ingestRoot, candidateId),
  );
  const stats = await lstat(candidatePath);

  if (stats.isSymbolicLink()) {
    throw new Error(
      "Symbolic links are not valid ingest candidates",
    );
  }

  const canonicalPath = await realpath(candidatePath);
  assertPathWithinIngestRoot(
    ingestRoot,
    canonicalPath,
  );

  return canonicalPath;
}

export function toIngestRelativePath(
  ingestRoot: string,
  candidatePath: string,
): string {
  const confinedPath = assertPathWithinIngestRoot(
    ingestRoot,
    candidatePath,
  );

  return path
    .relative(ingestRoot, confinedPath)
    .split(path.sep)
    .join("/");
}
