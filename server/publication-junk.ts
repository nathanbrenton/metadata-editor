import {
  lstat,
  readdir,
  rm,
} from "node:fs/promises";
import path from "node:path";

const ignoredPublicationJunkBasenames = new Set([
  ".DS_Store",
  "Thumbs.db",
  "desktop.ini",
  "__MACOSX",
]);

function isIgnoredPublicationJunkBasename(
  basename: string,
): boolean {
  const lower = basename.toLowerCase();

  return (
    ignoredPublicationJunkBasenames.has(basename) ||
    lower === "thumbs.db" ||
    lower === "desktop.ini" ||
    basename.startsWith("._") ||
    basename.endsWith("~") ||
    /^\..+\.sw[opx]$/i.test(basename)
  );
}

export function isIgnoredPublicationJunk(
  relativePath: string,
): boolean {
  const normalized = relativePath.replaceAll("\\", "/");
  const segments = normalized
    .split("/")
    .filter(Boolean);

  return segments.some((segment) =>
    isIgnoredPublicationJunkBasename(
      path.posix.basename(segment),
    ),
  );
}

export type PublicationJunkPruneResult = {
  removedCount: number;
};

export async function pruneIgnoredPublicationJunk(
  publishRoot: string,
): Promise<PublicationJunkPruneResult> {
  const root = path.resolve(publishRoot);
  let removedCount = 0;

  const walk = async (
    directoryPath: string,
    relativeDirectory: string,
  ): Promise<void> => {
    const entries = await readdir(directoryPath, {
      withFileTypes: true,
    });

    for (const entry of entries) {
      const relativePath = relativeDirectory
        ? path.posix.join(relativeDirectory, entry.name)
        : entry.name;
      const absolutePath = path.join(directoryPath, entry.name);

      if (isIgnoredPublicationJunk(relativePath)) {
        await rm(absolutePath, {
          recursive: true,
          force: true,
        });
        removedCount += 1;
        continue;
      }

      if (!entry.isDirectory() || entry.isSymbolicLink()) {
        continue;
      }

      const stats = await lstat(absolutePath);
      if (stats.isSymbolicLink() || !stats.isDirectory()) {
        continue;
      }

      await walk(absolutePath, relativePath);
    }
  };

  try {
    const rootStats = await lstat(root);
    if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) {
      return { removedCount: 0 };
    }
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return { removedCount: 0 };
    }
    throw error;
  }

  await walk(root, "");
  return { removedCount };
}
