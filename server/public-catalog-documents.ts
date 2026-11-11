import { lstat, readFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import path from "node:path";

/*
 * catalog.json embeds each member release's public release.json and
 * track.json documents so a player can render the whole catalog from one
 * request. The per-release files remain the source of truth; the embedded
 * copies are regenerated with every catalog build and are verified against
 * the files before deployment.
 */
export type CatalogEmbeddedDocuments = {
  release: unknown;
  /* Keyed by track ID, mirroring release.json `tracks[].id`. */
  tracks: Record<string, unknown>;
};

const releaseMetadataFilename = "release.json";

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

async function readRegularJsonFile(
  filePath: string,
): Promise<unknown> {
  const stats = await lstat(filePath);

  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new Error(
      `Published metadata is not a regular file: ${filePath}`,
    );
  }

  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}

function resolveInsideRelease(
  releaseDirectory: string,
  href: string,
): string {
  const normalized = path.posix.normalize(href);

  if (
    !normalized ||
    normalized.startsWith("..") ||
    path.posix.isAbsolute(normalized)
  ) {
    throw new Error(
      `Published track href escapes its release package: ${href}`,
    );
  }

  return path.join(releaseDirectory, ...normalized.split("/"));
}

/*
 * Reads the track documents a published (or staged) release.json refers
 * to. `releaseDocument` is the already-parsed release.json from
 * `releaseDirectory`.
 */
export async function readReleaseCatalogDocuments(
  releaseDirectory: string,
  releaseDocument: unknown,
): Promise<CatalogEmbeddedDocuments> {
  const references =
    isRecord(releaseDocument) &&
    Array.isArray(releaseDocument.tracks)
      ? releaseDocument.tracks
      : [];
  const tracks: Record<string, unknown> = {};

  for (const reference of references) {
    if (
      !isRecord(reference) ||
      typeof reference.id !== "string" ||
      typeof reference.href !== "string"
    ) {
      continue;
    }

    tracks[reference.id] = await readRegularJsonFile(
      resolveInsideRelease(releaseDirectory, reference.href),
    );
  }

  return {
    release: releaseDocument,
    tracks,
  };
}

/*
 * Returns the IDs of catalog members whose embedded documents no longer
 * match the published files. Entries without embedded documents (catalogs
 * written before embedding existed) are not stale: players fall back to
 * the per-release files for them.
 */
export async function findStaleCatalogDocuments(
  publishRoot: string,
  catalog: unknown,
): Promise<string[]> {
  const entries =
    isRecord(catalog) && Array.isArray(catalog.releases)
      ? catalog.releases
      : [];
  const stale: string[] = [];

  for (const entry of entries) {
    if (
      !isRecord(entry) ||
      typeof entry.id !== "string" ||
      !isRecord(entry.documents)
    ) {
      continue;
    }

    const releaseDirectory = path.join(
      publishRoot,
      "releases",
      entry.id,
    );

    try {
      const current = await readReleaseCatalogDocuments(
        releaseDirectory,
        await readRegularJsonFile(
          path.join(releaseDirectory, releaseMetadataFilename),
        ),
      );

      if (!isDeepStrictEqual(current, entry.documents)) {
        stale.push(entry.id);
      }
    } catch {
      stale.push(entry.id);
    }
  }

  return stale;
}
