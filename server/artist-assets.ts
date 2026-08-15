import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  constants,
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import { parse, stringify } from "smol-toml";

import {
  isIngestArtworkPreviewExtension,
} from "./ingest-artwork.js";
import {
  assertPathWithinIngestRoot,
  toIngestRelativePath,
} from "./ingest-root.js";
import {
  scanArtistLibrary,
} from "./artist-library.js";
import {
  assertPathWithinRoot,
  toLibraryRelativePath,
} from "./media-root.js";

export type ArtistPhotoCandidate = {
  relativePath: string;
  filename: string;
  extension: string;
  sizeBytes: number;
  modifiedAt: string;
};

export type ImportedArtistPhoto = {
  artistId: string;
  assetId: string;
  relativePath: string;
  primaryAssetId: string;
  sourceRelativePath: string;
  sourceFilename: string;
  sha256: string;
  backupRelativePath: string;
};

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

async function hashFile(
  candidatePath: string,
): Promise<string> {
  return await new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(candidatePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function collectPhotoCandidates(
  ingestRoot: string,
  directoryPath: string,
  output: ArtistPhotoCandidate[],
): Promise<void> {
  const entries = await readdir(directoryPath, {
    withFileTypes: true,
  });

  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    const candidatePath = assertPathWithinIngestRoot(
      ingestRoot,
      path.join(directoryPath, entry.name),
    );

    if (entry.isSymbolicLink()) {
      continue;
    }

    if (entry.isDirectory()) {
      await collectPhotoCandidates(
        ingestRoot,
        candidatePath,
        output,
      );
      continue;
    }

    if (
      !entry.isFile() ||
      !isIngestArtworkPreviewExtension(entry.name)
    ) {
      continue;
    }

    const fileStatus = await stat(candidatePath);
    output.push({
      relativePath: toIngestRelativePath(
        ingestRoot,
        candidatePath,
      ),
      filename: entry.name,
      extension: path.extname(entry.name).toLowerCase(),
      sizeBytes: fileStatus.size,
      modifiedAt: fileStatus.mtime.toISOString(),
    });
  }
}

export async function listArtistPhotoCandidates(
  ingestRoot: string,
): Promise<ArtistPhotoCandidate[]> {
  const canonicalIngestRoot = await realpath(ingestRoot);
  const candidates: ArtistPhotoCandidate[] = [];
  await collectPhotoCandidates(
    canonicalIngestRoot,
    canonicalIngestRoot,
    candidates,
  );

  candidates.sort((left, right) =>
    left.relativePath.localeCompare(
      right.relativePath,
      undefined,
      { sensitivity: "base" },
    ),
  );

  return candidates;
}

async function resolveArtistMetadataPath(
  mediaRoot: string,
  artistId: string,
): Promise<{
  canonicalMediaRoot: string;
  artistSlug: string;
  artistDirectory: string;
  metadataPath: string;
}> {
  const canonicalMediaRoot = await realpath(mediaRoot);
  const scanned = await scanArtistLibrary(
    canonicalMediaRoot,
  );
  const artist = scanned.artists.find(
    (candidate) => candidate.id === artistId,
  );

  if (!artist) {
    throw new Error(`Unknown canonical Artist ID ${artistId}`);
  }

  const artistDirectory = assertPathWithinRoot(
    canonicalMediaRoot,
    path.join(
      canonicalMediaRoot,
      ...artist.relativePath.split("/"),
    ),
  );
  const metadataPath = assertPathWithinRoot(
    artistDirectory,
    path.join(artistDirectory, "artist.toml"),
  );
  const canonicalArtistDirectory = await realpath(
    artistDirectory,
  );
  const canonicalMetadataPath = await realpath(
    metadataPath,
  );

  assertPathWithinRoot(
    canonicalMediaRoot,
    canonicalArtistDirectory,
  );
  assertPathWithinRoot(
    canonicalArtistDirectory,
    canonicalMetadataPath,
  );

  return {
    canonicalMediaRoot,
    artistSlug: artist.slug,
    artistDirectory: canonicalArtistDirectory,
    metadataPath: canonicalMetadataPath,
  };
}

async function readArtistDocument(
  metadataPath: string,
): Promise<Record<string, unknown>> {
  const parsed = parse(
    await readFile(metadataPath, "utf8"),
  );

  if (!isRecord(parsed) || !isRecord(parsed.artist)) {
    throw new Error("artist.toml is missing its artist table");
  }

  return parsed;
}

async function writeArtistDocument(
  canonicalMediaRoot: string,
  artistDirectory: string,
  metadataPath: string,
  document: Record<string, unknown>,
): Promise<string> {
  const content = `${stringify(document).trimEnd()}\n`;
  parse(content);

  const backupDirectory = assertPathWithinRoot(
    canonicalMediaRoot,
    path.join(artistDirectory, ".metadata-backups"),
  );
  await mkdir(backupDirectory, {
    recursive: true,
    mode: 0o700,
  });
  const canonicalBackupDirectory = await realpath(
    backupDirectory,
  );
  assertPathWithinRoot(
    artistDirectory,
    canonicalBackupDirectory,
  );

  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-");
  const backupPath = assertPathWithinRoot(
    canonicalBackupDirectory,
    path.join(
      canonicalBackupDirectory,
      `artist.toml.artist-assets-${stamp}-${randomUUID()}.bak`,
    ),
  );
  await copyFile(
    metadataPath,
    backupPath,
    constants.COPYFILE_EXCL,
  );

  const temporaryPath = assertPathWithinRoot(
    artistDirectory,
    path.join(
      artistDirectory,
      `.artist.toml.artist-assets-${randomUUID()}.tmp`,
    ),
  );
  let temporaryCreated = false;

  try {
    const handle = await open(
      temporaryPath,
      "wx",
      0o600,
    );
    temporaryCreated = true;
    try {
      await handle.writeFile(content, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }

    await rename(temporaryPath, metadataPath);
    temporaryCreated = false;
  } finally {
    if (temporaryCreated) {
      await unlink(temporaryPath).catch(
        () => undefined,
      );
    }
  }

  parse(await readFile(metadataPath, "utf8"));
  return toLibraryRelativePath(
    canonicalMediaRoot,
    backupPath,
  );
}

export async function saveArtistBio(
  mediaRoot: string,
  input: {
    artistId: string;
    bio: string;
  },
): Promise<{
  artistId: string;
  bio: string;
  changed: boolean;
  backupRelativePath?: string;
}> {
  const normalizedBio = input.bio
    .replace(/\r\n?/g, "\n")
    .trim();

  if (normalizedBio.length > 2400) {
    throw new Error(
      "Artist bio must be 2400 characters or fewer.",
    );
  }

  const {
    canonicalMediaRoot,
    artistDirectory,
    metadataPath,
  } = await resolveArtistMetadataPath(
    mediaRoot,
    input.artistId,
  );
  const document =
    await readArtistDocument(metadataPath);
  const artistTable =
    document.artist as Record<string, unknown>;
  const previousBio =
    readNonBlankString(artistTable.bio) ?? "";

  if (previousBio === normalizedBio) {
    return {
      artistId: input.artistId,
      bio: normalizedBio,
      changed: false,
    };
  }

  if (normalizedBio) {
    artistTable.bio = normalizedBio;
  } else {
    delete artistTable.bio;
  }

  const backupRelativePath =
    await writeArtistDocument(
      canonicalMediaRoot,
      artistDirectory,
      metadataPath,
      document,
    );

  return {
    artistId: input.artistId,
    bio: normalizedBio,
    changed: true,
    backupRelativePath,
  };
}

function readArtistAssets(
  artistTable: Record<string, unknown>,
): Array<Record<string, unknown>> {
  return Array.isArray(artistTable.assets)
    ? artistTable.assets.filter(isRecord)
    : [];
}

async function allocateAssetIdentity(
  artistDirectory: string,
  assets: Array<Record<string, unknown>>,
): Promise<{
  assetId: string;
  assetDirectory: string;
}> {
  const used = new Set(
    assets
      .map((asset) => readNonBlankString(asset.id))
      .filter((value): value is string => Boolean(value)),
  );

  for (let index = 1; index <= 9999; index += 1) {
    const assetId = `asset-${String(index).padStart(3, "0")}`;
    if (used.has(assetId)) {
      continue;
    }

    const assetDirectory = path.join(
      artistDirectory,
      assetId,
    );
    try {
      await lstat(assetDirectory);
      continue;
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return { assetId, assetDirectory };
      }
      throw error;
    }
  }

  throw new Error("No available Artist asset IDs remain");
}

async function resolveIngestPhotoSource(
  ingestRoot: string,
  sourceRelativePath: string,
): Promise<{
  canonicalIngestRoot: string;
  canonicalSourcePath: string;
  sourceFilename: string;
  extension: string;
}> {
  if (!sourceRelativePath.trim()) {
    throw new Error("Artist photo source path is required");
  }

  if (!isIngestArtworkPreviewExtension(sourceRelativePath)) {
    throw new Error(
      "Artist photo source type is not supported by the safe ingest preview pipeline",
    );
  }

  const canonicalIngestRoot = await realpath(ingestRoot);
  const sourcePath = assertPathWithinIngestRoot(
    canonicalIngestRoot,
    path.join(canonicalIngestRoot, sourceRelativePath),
  );
  const sourceStatus = await lstat(sourcePath);
  if (!sourceStatus.isFile() || sourceStatus.isSymbolicLink()) {
    throw new Error(
      "Artist photo source must be a regular non-symlink file",
    );
  }

  const canonicalSourcePath = await realpath(sourcePath);
  assertPathWithinIngestRoot(
    canonicalIngestRoot,
    canonicalSourcePath,
  );

  return {
    canonicalIngestRoot,
    canonicalSourcePath,
    sourceFilename: path.basename(canonicalSourcePath),
    extension: path.extname(canonicalSourcePath).toLowerCase(),
  };
}

export async function importArtistPhoto(
  mediaRoot: string,
  ingestRoot: string,
  input: {
    artistId: string;
    sourceRelativePath: string;
    setPrimary?: boolean;
  },
): Promise<ImportedArtistPhoto> {
  const artistId = input.artistId.trim();
  if (!artistId) {
    throw new Error("Artist ID is required");
  }

  const source = await resolveIngestPhotoSource(
    ingestRoot,
    input.sourceRelativePath,
  );
  const {
    canonicalMediaRoot,
    artistDirectory,
    metadataPath,
  } = await resolveArtistMetadataPath(
    mediaRoot,
    artistId,
  );
  const document = await readArtistDocument(
    metadataPath,
  );
  const artistTable = document.artist as Record<string, unknown>;
  const assets = readArtistAssets(artistTable);
  const sourceSha256 = await hashFile(
    source.canonicalSourcePath,
  );

  const duplicate = assets.find(
    (asset) => asset.sha256 === sourceSha256,
  );
  if (duplicate) {
    throw new Error(
      `This Artist already contains the same source bytes as ${String(duplicate.id ?? "an existing asset")}`,
    );
  }

  const assetsRoot = assertPathWithinRoot(
    artistDirectory,
    path.join(artistDirectory, "assets"),
  );
  await mkdir(assetsRoot, {
    recursive: true,
    mode: 0o700,
  });
  const canonicalAssetsRoot = await realpath(assetsRoot);
  assertPathWithinRoot(
    artistDirectory,
    canonicalAssetsRoot,
  );

  const { assetId, assetDirectory } =
    await allocateAssetIdentity(
      canonicalAssetsRoot,
      assets,
    );
  const confinedAssetDirectory = assertPathWithinRoot(
    artistDirectory,
    assetDirectory,
  );
  await mkdir(confinedAssetDirectory, {
    recursive: false,
    mode: 0o700,
  });

  const masterFilename = `master${source.extension}`;
  const masterPath = assertPathWithinRoot(
    confinedAssetDirectory,
    path.join(confinedAssetDirectory, masterFilename),
  );
  let copied = false;

  try {
    await copyFile(
      source.canonicalSourcePath,
      masterPath,
      constants.COPYFILE_EXCL,
    );
    copied = true;

    const destinationSha256 = await hashFile(masterPath);
    if (destinationSha256 !== sourceSha256) {
      throw new Error(
        "Artist photo copy verification failed",
      );
    }

    const artistRelativeMasterPath = path
      .relative(artistDirectory, masterPath)
      .split(path.sep)
      .join("/");
    const nextAsset: Record<string, unknown> = {
      id: assetId,
      kind: "photo",
      master_path: artistRelativeMasterPath,
      source_filename: source.sourceFilename,
      sha256: sourceSha256,
    };
    artistTable.assets = [
      ...assets,
      nextAsset,
    ];

    const currentPrimary = readNonBlankString(
      artistTable.primary_asset_id,
    );
    const primaryAssetId =
      input.setPrimary || !currentPrimary
        ? assetId
        : currentPrimary;
    artistTable.primary_asset_id = primaryAssetId;

    const backupRelativePath = await writeArtistDocument(
      canonicalMediaRoot,
      artistDirectory,
      metadataPath,
      document,
    );

    return {
      artistId,
      assetId,
      relativePath: toLibraryRelativePath(
        canonicalMediaRoot,
        masterPath,
      ),
      primaryAssetId,
      sourceRelativePath: toIngestRelativePath(
        source.canonicalIngestRoot,
        source.canonicalSourcePath,
      ),
      sourceFilename: source.sourceFilename,
      sha256: sourceSha256,
      backupRelativePath,
    };
  } catch (error) {
    if (copied) {
      await unlink(masterPath).catch(() => undefined);
    }
    await rm(confinedAssetDirectory, {
      recursive: false,
      force: true,
    }).catch(() => undefined);
    throw error;
  }
}

export async function setPrimaryArtistPhoto(
  mediaRoot: string,
  input: {
    artistId: string;
    assetId: string;
  },
): Promise<{
  artistId: string;
  primaryAssetId: string;
  backupRelativePath: string;
}> {
  const artistId = input.artistId.trim();
  const assetId = input.assetId.trim();
  if (!artistId || !assetId) {
    throw new Error("Artist ID and asset ID are required");
  }

  const {
    canonicalMediaRoot,
    artistDirectory,
    metadataPath,
  } = await resolveArtistMetadataPath(
    mediaRoot,
    artistId,
  );
  const document = await readArtistDocument(
    metadataPath,
  );
  const artistTable = document.artist as Record<string, unknown>;
  const assets = readArtistAssets(artistTable);
  const target = assets.find(
    (asset) => asset.id === assetId,
  );

  if (!target) {
    throw new Error(
      `Artist asset ${assetId} is not declared for ${artistId}`,
    );
  }
  if (target.kind !== "photo") {
    throw new Error(
      `Artist asset ${assetId} is not a photo`,
    );
  }

  const masterPath = readNonBlankString(target.master_path);
  if (!masterPath) {
    throw new Error(
      `Artist asset ${assetId} does not declare a master path`,
    );
  }
  const candidateMasterPath = assertPathWithinRoot(
    artistDirectory,
    path.join(
      artistDirectory,
      ...masterPath.split("/"),
    ),
  );
  const masterStatus = await lstat(candidateMasterPath).catch(
    () => null,
  );
  if (
    !masterStatus ||
    !masterStatus.isFile() ||
    masterStatus.isSymbolicLink()
  ) {
    throw new Error(
      `Artist asset ${assetId} does not have a regular canonical source file`,
    );
  }
  const canonicalMasterPath = await realpath(
    candidateMasterPath,
  );
  assertPathWithinRoot(
    artistDirectory,
    canonicalMasterPath,
  );

  const currentPrimary = readNonBlankString(
    artistTable.primary_asset_id,
  );
  if (currentPrimary === assetId) {
    return {
      artistId,
      primaryAssetId: assetId,
      backupRelativePath: "",
    };
  }

  artistTable.primary_asset_id = assetId;
  const backupRelativePath = await writeArtistDocument(
    canonicalMediaRoot,
    artistDirectory,
    metadataPath,
    document,
  );

  return {
    artistId,
    primaryAssetId: assetId,
    backupRelativePath,
  };
}
export async function removeArtistPhoto(
  mediaRoot: string,
  input: {
    artistId: string;
    assetId: string;
  },
): Promise<{
  artistId: string;
  removedAssetId: string;
  archivedRelativePath: string;
  backupRelativePath: string;
}> {
  const artistId = input.artistId.trim();
  const assetId = input.assetId.trim();
  if (!artistId || !assetId) {
    throw new Error("Artist ID and asset ID are required");
  }

  const {
    canonicalMediaRoot,
    artistDirectory,
    metadataPath,
  } = await resolveArtistMetadataPath(
    mediaRoot,
    artistId,
  );
  const document = await readArtistDocument(
    metadataPath,
  );
  const artistTable = document.artist as Record<string, unknown>;
  const assets = readArtistAssets(artistTable);
  const target = assets.find(
    (asset) => asset.id === assetId,
  );

  if (!target) {
    throw new Error(
      `Artist asset ${assetId} is not declared for ${artistId}`,
    );
  }
  if (target.kind !== "photo") {
    throw new Error(
      `Artist asset ${assetId} is not a photo`,
    );
  }

  const currentPrimary = readNonBlankString(
    artistTable.primary_asset_id,
  );

  const masterPath = readNonBlankString(target.master_path);
  if (!masterPath) {
    throw new Error(
      `Artist asset ${assetId} does not declare a master path`,
    );
  }

  const expectedAssetDirectory = assertPathWithinRoot(
    artistDirectory,
    path.join(
      artistDirectory,
      "assets",
      assetId,
    ),
  );
  const assetStatus = await lstat(
    expectedAssetDirectory,
  ).catch(() => null);
  if (
    !assetStatus ||
    !assetStatus.isDirectory() ||
    assetStatus.isSymbolicLink()
  ) {
    throw new Error(
      `Artist asset ${assetId} does not have a regular canonical asset directory`,
    );
  }

  const canonicalAssetDirectory = await realpath(
    expectedAssetDirectory,
  );
  assertPathWithinRoot(
    artistDirectory,
    canonicalAssetDirectory,
  );

  const candidateMasterPath = assertPathWithinRoot(
    canonicalAssetDirectory,
    path.join(
      artistDirectory,
      ...masterPath.split("/"),
    ),
  );
  const masterStatus = await lstat(
    candidateMasterPath,
  ).catch(() => null);
  if (
    !masterStatus ||
    !masterStatus.isFile() ||
    masterStatus.isSymbolicLink()
  ) {
    throw new Error(
      `Artist asset ${assetId} does not have a regular canonical source file`,
    );
  }
  const canonicalMasterPath = await realpath(
    candidateMasterPath,
  );
  assertPathWithinRoot(
    canonicalAssetDirectory,
    canonicalMasterPath,
  );

  const trashRoot = assertPathWithinRoot(
    artistDirectory,
    path.join(
      artistDirectory,
      ".asset-trash",
    ),
  );
  await mkdir(trashRoot, {
    recursive: true,
    mode: 0o700,
  });
  const canonicalTrashRoot = await realpath(
    trashRoot,
  );
  assertPathWithinRoot(
    artistDirectory,
    canonicalTrashRoot,
  );

  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-");
  const archivePath = assertPathWithinRoot(
    canonicalTrashRoot,
    path.join(
      canonicalTrashRoot,
      `${assetId}-${stamp}-${randomUUID()}`,
    ),
  );

  let assetArchived = false;
  let metadataCommitted = false;

  try {
    await rename(
      canonicalAssetDirectory,
      archivePath,
    );
    assetArchived = true;

    artistTable.assets = assets.filter(
      (asset) => asset.id !== assetId,
    );
    if (currentPrimary === assetId) {
      delete artistTable.primary_asset_id;
    }

    const backupRelativePath =
      await writeArtistDocument(
        canonicalMediaRoot,
        artistDirectory,
        metadataPath,
        document,
      );
    metadataCommitted = true;

    return {
      artistId,
      removedAssetId: assetId,
      archivedRelativePath:
        toLibraryRelativePath(
          canonicalMediaRoot,
          archivePath,
        ),
      backupRelativePath,
    };
  } catch (error) {
    if (assetArchived && !metadataCommitted) {
      await rename(
        archivePath,
        canonicalAssetDirectory,
      ).catch(() => undefined);
    }
    throw error;
  }
}
