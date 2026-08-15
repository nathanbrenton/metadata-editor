import {
  lstat,
  readFile,
  readdir,
  realpath,
} from "node:fs/promises";
import path from "node:path";
import { parse } from "smol-toml";

import {
  assertPathWithinRoot,
  toLibraryRelativePath,
} from "./media-root.js";
import type {
  ArtistAssetScanResult,
  ArtistScanResult,
} from "./types.js";

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function readNonBlankString(
  value: unknown,
): string | undefined {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : undefined;
}

async function listArtistDirectories(
  artistsRoot: string,
): Promise<string[]> {
  let entries;

  try {
    entries = await readdir(artistsRoot, {
      withFileTypes: true,
    });
  } catch {
    return [];
  }

  return entries
    .filter(
      (entry) =>
        entry.isDirectory() &&
        !entry.isSymbolicLink() &&
        !entry.name.startsWith("."),
    )
    .map((entry) => entry.name)
    .sort((left, right) =>
      left.localeCompare(right, undefined, {
        sensitivity: "base",
      }),
    );
}

async function isRegularNonSymlinkFile(
  candidatePath: string,
): Promise<boolean> {
  try {
    const stats = await lstat(candidatePath);
    return stats.isFile() && !stats.isSymbolicLink();
  } catch {
    return false;
  }
}

async function scanArtist(
  mediaRoot: string,
  artistsRoot: string,
  directorySlug: string,
): Promise<{
  artist: ArtistScanResult | null;
  warnings: string[];
}> {
  const warnings: string[] = [];
  const artistPath = assertPathWithinRoot(
    mediaRoot,
    path.join(artistsRoot, directorySlug),
  );
  const documentPath = assertPathWithinRoot(
    artistPath,
    path.join(artistPath, "artist.toml"),
  );

  if (!(await isRegularNonSymlinkFile(documentPath))) {
    return {
      artist: null,
      warnings: [
        `artists/${directorySlug}: artist.toml is missing`,
      ],
    };
  }

  try {
    const canonicalMediaRoot = await realpath(mediaRoot);
    const canonicalArtistPath = await realpath(artistPath);
    const canonicalDocumentPath = await realpath(documentPath);

    assertPathWithinRoot(
      canonicalMediaRoot,
      canonicalArtistPath,
    );
    assertPathWithinRoot(
      canonicalArtistPath,
      canonicalDocumentPath,
    );

    const parsed = parse(
      await readFile(canonicalDocumentPath, "utf8"),
    );
    const schemaTable =
      isRecord(parsed) && isRecord(parsed.schema)
        ? parsed.schema
        : null;
    const artistTable =
      isRecord(parsed) && isRecord(parsed.artist)
        ? parsed.artist
        : null;

    if (
      !schemaTable ||
      schemaTable.name !== "artist-metadata" ||
      schemaTable.version !== 1
    ) {
      throw new Error(
        "schema must be artist-metadata version 1",
      );
    }

    if (!artistTable) {
      throw new Error("artist table is missing");
    }

    const id = readNonBlankString(artistTable.id);
    const slug = readNonBlankString(artistTable.slug);
    const displayName = readNonBlankString(
      artistTable.display_name,
    );
    const sortName = readNonBlankString(
      artistTable.sort_name,
    );
    const primaryAssetId = readNonBlankString(
      artistTable.primary_asset_id,
    );
    const bio = readNonBlankString(
      artistTable.bio,
    );

    if (!id || !slug || !displayName) {
      throw new Error(
        "artist.id, artist.slug, and artist.display_name are required",
      );
    }

    if (slug !== directorySlug) {
      warnings.push(
        `artists/${directorySlug}: artist.slug ${slug} does not match the directory slug`,
      );
    }

    const rawAssets = Array.isArray(artistTable.assets)
      ? artistTable.assets
      : [];
    const assets: ArtistAssetScanResult[] = [];

    for (const rawAsset of rawAssets) {
      if (!isRecord(rawAsset)) {
        continue;
      }

      const assetId = readNonBlankString(rawAsset.id);
      const kind = readNonBlankString(rawAsset.kind);
      const masterPath = readNonBlankString(rawAsset.master_path);

      if (!assetId || !kind || !masterPath) {
        warnings.push(
          `artists/${directorySlug}: ignored incomplete artist asset record`,
        );
        continue;
      }

      const assetPath = assertPathWithinRoot(
        canonicalArtistPath,
        path.join(
          canonicalArtistPath,
          ...masterPath.split("/"),
        ),
      );
      assertPathWithinRoot(canonicalMediaRoot, assetPath);

      const description = readNonBlankString(
        rawAsset.description,
      );
      const sourceFilename = readNonBlankString(
        rawAsset.source_filename,
      );
      const sha256 = readNonBlankString(
        rawAsset.sha256,
      );

      assets.push({
        id: assetId,
        kind,
        masterPath,
        relativePath: toLibraryRelativePath(
          canonicalMediaRoot,
          assetPath,
        ),
        exists: await isRegularNonSymlinkFile(assetPath),
        ...(description ? { description } : {}),
        ...(sourceFilename ? { sourceFilename } : {}),
        ...(sha256 ? { sha256 } : {}),
      });
    }

    const assetIdCounts = new Map<string, number>();
    for (const asset of assets) {
      assetIdCounts.set(
        asset.id,
        (assetIdCounts.get(asset.id) ?? 0) + 1,
      );
    }
    for (const [assetId, count] of assetIdCounts) {
      if (count > 1) {
        warnings.push(
          `artists/${directorySlug}: artist asset ID ${assetId} is declared ${count} times`,
        );
      }
    }

    if (
      primaryAssetId &&
      !assets.some((asset) => asset.id === primaryAssetId)
    ) {
      warnings.push(
        `artists/${directorySlug}: primary asset ${primaryAssetId} is not declared in artist.assets`,
      );
    }

    return {
      artist: {
        id,
        slug,
        displayName,
        ...(sortName ? { sortName } : {}),
        ...(bio ? { bio } : {}),
        ...(primaryAssetId ? { primaryAssetId } : {}),
        relativePath: toLibraryRelativePath(
          canonicalMediaRoot,
          canonicalArtistPath,
        ),
        metadataRelativePath: toLibraryRelativePath(
          canonicalMediaRoot,
          canonicalDocumentPath,
        ),
        assets,
      },
      warnings,
    };
  } catch (error) {
    return {
      artist: null,
      warnings: [
        `artists/${directorySlug}: ${
          error instanceof Error
            ? error.message
            : "artist metadata could not be read"
        }`,
      ],
    };
  }
}

export async function scanArtistLibrary(
  mediaRoot: string,
): Promise<{
  artistsRoot: string;
  artists: ArtistScanResult[];
  warnings: string[];
}> {
  const artistsRoot = assertPathWithinRoot(
    mediaRoot,
    path.join(mediaRoot, "artists"),
  );
  const directorySlugs = await listArtistDirectories(
    artistsRoot,
  );
  const results = await Promise.all(
    directorySlugs.map((slug) =>
      scanArtist(mediaRoot, artistsRoot, slug),
    ),
  );

  const artists = results.flatMap(
    ({ artist }) => artist ? [artist] : [],
  );
  const warnings = results.flatMap(
    ({ warnings: artistWarnings }) => artistWarnings,
  );

  const idCounts = new Map<string, number>();
  for (const artist of artists) {
    idCounts.set(
      artist.id,
      (idCounts.get(artist.id) ?? 0) + 1,
    );
  }
  for (const [id, count] of idCounts) {
    if (count > 1) {
      warnings.push(
        `Artist ID ${id} is declared by ${count} artist records`,
      );
    }
  }

  artists.sort((left, right) =>
    left.displayName.localeCompare(
      right.displayName,
      undefined,
      { sensitivity: "base" },
    ),
  );

  return {
    artistsRoot,
    artists,
    warnings,
  };
}
