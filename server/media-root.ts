import { realpath } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

export async function resolveMediaRoot(
  configuredRoot =
    process.env.MEDIA_LIBRARY_ROOT ?? "../demo-media",
): Promise<string> {
  const candidate = path.resolve(projectRoot, configuredRoot);

  // Canonicalizing the root also verifies that it currently exists.
  return realpath(candidate);
}

export function assertPathWithinRoot(
  mediaRoot: string,
  candidatePath: string,
): string {
  const resolvedRoot = path.resolve(mediaRoot);
  const resolvedCandidate = path.resolve(candidatePath);
  const relative = path.relative(resolvedRoot, resolvedCandidate);

  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(
      `Path escapes configured media root: ${resolvedCandidate}`,
    );
  }

  return resolvedCandidate;
}

export function toLibraryRelativePath(
  mediaRoot: string,
  candidatePath: string,
): string {
  const confinedPath = assertPathWithinRoot(
    mediaRoot,
    candidatePath,
  );

  return path
    .relative(mediaRoot, confinedPath)
    .split(path.sep)
    .join("/");
}
