import {
  createHash,
  randomUUID,
} from "node:crypto";
import {
  createReadStream,
} from "node:fs";
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import {
  spawn,
} from "node:child_process";

import {
  scanArtistLibrary,
} from "./artist-library.js";
import {
  detectFfmpegCapabilities,
} from "./ffmpeg-capabilities.js";
import {
  assertPathWithinRoot,
} from "./media-root.js";
import type {
  ArtistScanResult,
  FfmpegCapabilities,
} from "./types.js";

const artistCatalogFilename = "artists.json";
const artistManifestFilename = "artist-publication-manifest.json";
const artistsDirectoryName = "artists";
const webpEncoder = "libwebp";

const supportedSourceExtensions = new Set([
  ".avif",
  ".gif",
  ".jpeg",
  ".jpg",
  ".png",
  ".tif",
  ".tiff",
  ".webp",
]);

export type ArtistPublicationProfile = {
  schema: {
    name: "metadata-editor-artist-web-profile";
    version: 1;
  };
  format: "webp";
  encoder: "libwebp";
  maxWidth: 1920;
  maxHeight: 1080;
  quality: 82;
  compressionLevel: 6;
  frameCount: 1;
  stripMetadata: true;
  crop: false;
  upscale: false;
};

export type ArtistPublicationIssue = {
  code: string;
  severity: "warning" | "blocked";
  artistId?: string;
  assetId?: string;
  message: string;
};

export type ArtistPublicationAssetPlan = {
  id: string;
  kind: "photo";
  sourceRelativePath: string;
  sourceSha256: string;
  sourceBytes: number;
  destinationRelativePath: string;
  description?: string;
};

export type ArtistPublicationArtistPlan = {
  id: string;
  slug: string;
  displayName: string;
  sortName?: string;
  primaryAssetId?: string;
  documentRelativePath: string;
  assets: ArtistPublicationAssetPlan[];
};

export type ArtistPublicationPlan = {
  schema: {
    name: "metadata-editor-artist-publication-plan";
    version: 1;
  };
  generatedAt: string;
  readOnly: true;
  writesEnabled: false;
  status: "ready" | "blocked";
  state:
    | "not-published"
    | "up-to-date"
    | "update-available"
    | "blocked";
  planFingerprint: string;
  sourceContentFingerprint: string;
  existingSourceContentFingerprint?: string;
  profile: ArtistPublicationProfile & {
    sha256: string;
  };
  artists: ArtistPublicationArtistPlan[];
  issues: ArtistPublicationIssue[];
  summary: {
    artistCount: number;
    photoCount: number;
    primaryPhotoCount: number;
    blockedCount: number;
    warningCount: number;
  };
};

export type ArtistPublicationResource = {
  path: string;
  sha256: string;
  bytes: number;
};

export type ArtistPublicationManifest = {
  schema: {
    name: "metadata-editor-artist-publication-manifest";
    version: 1;
  };
  publishedAt: string;
  sourceContentFingerprint: string;
  profile: ArtistPublicationProfile & {
    sha256: string;
  };
  resources: ArtistPublicationResource[];
};

export type ArtistPublicationReceipt = {
  mode: "build" | "update";
  artistCount: number;
  photoCount: number;
  resourceCount: number;
  completedAt: string;
  sourceContentFingerprint: string;
};

export type ArtistPublicationVerification = {
  exists: boolean;
  ok: boolean;
  reason: string;
  sourceContentFingerprint?: string;
  resourceCount: number;
  totalBytes: number;
};

export type ArtistPublicationProcessRunner = (
  executable: string,
  args: readonly string[],
) => Promise<void>;

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function rootPath(
  root: string,
  relativePath: string,
): string {
  return assertPathWithinRoot(
    root,
    path.resolve(
      root,
      ...relativePath
        .replaceAll("\\", "/")
        .split("/")
        .filter(Boolean),
    ),
  );
}

async function pathExists(
  candidatePath: string,
): Promise<boolean> {
  try {
    await lstat(candidatePath);
    return true;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return false;
    }
    throw error;
  }
}

async function hashFile(
  filePath: string,
): Promise<{ sha256: string; bytes: number }> {
  const stats = await lstat(filePath);
  if (
    stats.isSymbolicLink() ||
    !stats.isFile() ||
    stats.size <= 0
  ) {
    throw new Error(
      `Artist publication source is not a regular non-empty file: ${filePath}`,
    );
  }

  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });

  return {
    sha256: hash.digest("hex"),
    bytes: stats.size,
  };
}

async function ensureRegularSourceFile(
  mediaRoot: string,
  relativePath: string,
): Promise<string> {
  const canonicalRoot = await realpath(mediaRoot);
  const candidate = rootPath(
    canonicalRoot,
    relativePath,
  );
  const stats = await lstat(candidate);

  if (stats.isSymbolicLink() || !stats.isFile()) {
    throw new Error(
      `Artist publication source is not a regular non-symbolic file: ${relativePath}`,
    );
  }

  const canonicalFile = await realpath(candidate);
  assertPathWithinRoot(
    canonicalRoot,
    canonicalFile,
  );
  return canonicalFile;
}

async function writeJson(
  filePath: string,
  value: unknown,
): Promise<void> {
  await mkdir(path.dirname(filePath), {
    recursive: true,
  });
  await writeFile(
    filePath,
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
}

async function readJson(
  filePath: string,
): Promise<unknown> {
  return JSON.parse(
    await readFile(filePath, "utf8"),
  ) as unknown;
}

async function walkRegularFiles(
  root: string,
  directory = root,
): Promise<string[]> {
  const entries = await readdir(directory, {
    withFileTypes: true,
  });
  const files: string[] = [];

  for (const entry of entries) {
    const candidate = path.join(
      directory,
      entry.name,
    );

    if (entry.isSymbolicLink()) {
      throw new Error(
        `Artist Web Package may not contain symbolic links: ${path.relative(root, candidate)}`,
      );
    }

    if (entry.isDirectory()) {
      files.push(
        ...await walkRegularFiles(
          root,
          candidate,
        ),
      );
      continue;
    }

    if (!entry.isFile()) {
      throw new Error(
        `Artist Web Package contains an unsupported filesystem entry: ${path.relative(root, candidate)}`,
      );
    }

    files.push(
      path.relative(root, candidate)
        .split(path.sep)
        .join("/"),
    );
  }

  return files.sort((left, right) =>
    left.localeCompare(right),
  );
}

function hashObject(
  value: unknown,
): string {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

export function buildArtistPublicationProfile():
  ArtistPublicationProfile {
  return {
    schema: {
      name: "metadata-editor-artist-web-profile",
      version: 1,
    },
    format: "webp",
    encoder: webpEncoder,
    maxWidth: 1920,
    maxHeight: 1080,
    quality: 82,
    compressionLevel: 6,
    frameCount: 1,
    stripMetadata: true,
    crop: false,
    upscale: false,
  };
}

export function buildArtistWebpFfmpegArgs(
  inputPath: string,
  outputPath: string,
): string[] {
  return [
    "-v",
    "error",
    "-nostdin",
    "-y",
    "-i",
    inputPath,
    "-frames:v",
    "1",
    "-an",
    "-map_metadata",
    "-1",
    "-vf",
    "scale='min(iw,1920)':'min(ih,1080)':force_original_aspect_ratio=decrease",
    "-c:v",
    webpEncoder,
    "-quality",
    "82",
    "-compression_level",
    "6",
    outputPath,
  ];
}

export function buildArtistWebpVerificationArgs(
  outputPath: string,
): string[] {
  return [
    "-v",
    "error",
    "-nostdin",
    "-i",
    outputPath,
    "-frames:v",
    "1",
    "-f",
    "null",
    "-",
  ];
}

async function runProcess(
  executable: string,
  args: readonly string[],
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      executable,
      [...args],
      {
        stdio: [
          "ignore",
          "ignore",
          "pipe",
        ],
      },
    );
    let errorText = "";

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      errorText += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `FFmpeg Artist-photo conversion failed with exit code ${code}: ${errorText.trim()}`,
        ),
      );
    });
  });
}

function validSlug(
  value: string,
): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function validAssetId(
  value: string,
): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value);
}

function artistDocumentRelativePath(
  artist: ArtistScanResult,
): string {
  return path.posix.join(
    artistsDirectoryName,
    artist.slug,
    "artist.json",
  );
}

function artistAssetDestination(
  artist: ArtistScanResult,
  assetId: string,
): string {
  return path.posix.join(
    artistsDirectoryName,
    artist.slug,
    "assets",
    `${assetId}.webp`,
  );
}

async function existingManifestFingerprint(
  publishRoot: string,
): Promise<string | undefined> {
  const manifestPath = rootPath(
    path.resolve(publishRoot),
    artistManifestFilename,
  );

  if (!(await pathExists(manifestPath))) {
    return undefined;
  }

  try {
    const parsed = await readJson(manifestPath);
    if (
      isRecord(parsed) &&
      isRecord(parsed.schema) &&
      parsed.schema.name ===
        "metadata-editor-artist-publication-manifest" &&
      parsed.schema.version === 1 &&
      typeof parsed.sourceContentFingerprint === "string"
    ) {
      return parsed.sourceContentFingerprint;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

async function publicationRootHasAnyArtistEntry(
  publishRoot: string,
): Promise<boolean> {
  const root = path.resolve(publishRoot);
  const states = await Promise.all([
    pathExists(rootPath(root, artistCatalogFilename)),
    pathExists(rootPath(root, artistManifestFilename)),
    pathExists(rootPath(root, artistsDirectoryName)),
  ]);
  return states.some(Boolean);
}

export async function buildArtistPublicationPlan(
  mediaRoot: string,
  publishRoot: string,
  options: {
    ffmpegCapabilities?: FfmpegCapabilities;
    generatedAt?: string;
  } = {},
): Promise<ArtistPublicationPlan> {
  const generatedAt =
    options.generatedAt ??
    new Date().toISOString();
  const profile = buildArtistPublicationProfile();
  const profileSha256 = hashObject(profile);
  const library = await scanArtistLibrary(
    mediaRoot,
  );
  const issues: ArtistPublicationIssue[] =
    library.warnings.map((message) => ({
      code: "artist-library-warning",
      severity: "blocked" as const,
      message,
    }));
  const artists: ArtistPublicationArtistPlan[] = [];

  for (const artist of library.artists) {
    if (!validSlug(artist.slug)) {
      issues.push({
        code: "artist-slug-invalid",
        severity: "blocked",
        artistId: artist.id,
        message:
          `Artist ${artist.id} has a slug that is unsafe for the public URL contract: ${artist.slug}`,
      });
      continue;
    }

    const photoAssets = artist.assets.filter(
      (asset) => asset.kind === "photo",
    );
    const plannedAssets: ArtistPublicationAssetPlan[] = [];

    if (
      artist.primaryAssetId &&
      !photoAssets.some(
        (asset) => asset.id === artist.primaryAssetId,
      )
    ) {
      issues.push({
        code: "artist-primary-photo-invalid",
        severity: "blocked",
        artistId: artist.id,
        assetId: artist.primaryAssetId,
        message:
          `Artist ${artist.displayName} declares Primary asset ${artist.primaryAssetId}, but it is not a canonical photo asset.`,
      });
    }

    for (const asset of photoAssets) {
      if (!validAssetId(asset.id)) {
        issues.push({
          code: "artist-asset-id-invalid",
          severity: "blocked",
          artistId: artist.id,
          assetId: asset.id,
          message:
            `Artist photo asset ID ${asset.id} is unsafe for the public URL contract.`,
        });
        continue;
      }

      const extension = path.extname(
        asset.relativePath,
      ).toLowerCase();
      if (!supportedSourceExtensions.has(extension)) {
        issues.push({
          code: "artist-photo-format-unsupported",
          severity: "blocked",
          artistId: artist.id,
          assetId: asset.id,
          message:
            `Artist photo ${asset.id} uses unsupported canonical format ${extension || "(none)"}.`,
        });
        continue;
      }

      try {
        const source = await ensureRegularSourceFile(
          mediaRoot,
          asset.relativePath,
        );
        const digest = await hashFile(source);

        if (
          asset.sha256 &&
          asset.sha256 !== digest.sha256
        ) {
          issues.push({
            code: "artist-photo-source-changed",
            severity: "blocked",
            artistId: artist.id,
            assetId: asset.id,
            message:
              `Artist photo ${asset.id} no longer matches the SHA-256 recorded at import. Re-import or deliberately replace the canonical photo before publication.`,
          });
          continue;
        }

        plannedAssets.push({
          id: asset.id,
          kind: "photo",
          sourceRelativePath: asset.relativePath,
          sourceSha256: digest.sha256,
          sourceBytes: digest.bytes,
          destinationRelativePath:
            artistAssetDestination(
              artist,
              asset.id,
            ),
          ...(asset.description
            ? { description: asset.description }
            : {}),
        });
      } catch (error) {
        issues.push({
          code: "artist-photo-source-invalid",
          severity: "blocked",
          artistId: artist.id,
          assetId: asset.id,
          message:
            error instanceof Error
              ? error.message
              : `Artist photo ${asset.id} cannot be read safely.`,
        });
      }
    }

    artists.push({
      id: artist.id,
      slug: artist.slug,
      displayName: artist.displayName,
      ...(artist.sortName
        ? { sortName: artist.sortName }
        : {}),
      ...(artist.primaryAssetId
        ? { primaryAssetId: artist.primaryAssetId }
        : {}),
      documentRelativePath:
        artistDocumentRelativePath(artist),
      assets: plannedAssets,
    });
  }

  artists.sort((left, right) =>
    left.displayName.localeCompare(
      right.displayName,
      undefined,
      { sensitivity: "base" },
    ),
  );

  const sourceContentFingerprint = hashObject({
    schema:
      "metadata-editor-artist-publication-source-v1",
    profile: {
      ...profile,
      sha256: profileSha256,
    },
    artists: artists.map((artist) => ({
      id: artist.id,
      slug: artist.slug,
      displayName: artist.displayName,
      sortName: artist.sortName ?? null,
      primaryAssetId: artist.primaryAssetId ?? null,
      assets: artist.assets.map((asset) => ({
        id: asset.id,
        kind: asset.kind,
        sourceSha256: asset.sourceSha256,
        description: asset.description ?? null,
      })),
    })),
  });
  const existingSourceContentFingerprint =
    await existingManifestFingerprint(
      publishRoot,
    );
  const hasExistingArtistSnapshot =
    await publicationRootHasAnyArtistEntry(
      publishRoot,
    );
  const existingIntegrity = hasExistingArtistSnapshot
    ? await verifyPublishedArtistSnapshot(publishRoot)
    : {
        exists: false,
        ok: true,
        reason:
          "Artist Web Package has not been built yet.",
        resourceCount: 0,
        totalBytes: 0,
      };
  let state: ArtistPublicationPlan["state"];

  if (
    hasExistingArtistSnapshot &&
    existingIntegrity.ok &&
    existingSourceContentFingerprint ===
      sourceContentFingerprint
  ) {
    state = "up-to-date";
  } else if (hasExistingArtistSnapshot) {
    state = "update-available";
  } else {
    state = "not-published";
  }

  const photoCount = artists.reduce(
    (total, artist) =>
      total + artist.assets.length,
    0,
  );
  const capabilities =
    options.ffmpegCapabilities ??
    await detectFfmpegCapabilities();

  if (
    state !== "up-to-date" &&
    photoCount > 0 &&
    (
      !capabilities.available ||
      !capabilities.encoders.includes(webpEncoder)
    )
  ) {
    issues.push({
      code: "artist-webp-encoder-unavailable",
      severity: "blocked",
      message:
        "Artist Web Package requires FFmpeg with the libwebp encoder. The Artist publication contract does not silently fall back to PNG.",
    });
  }

  if (
    hasExistingArtistSnapshot &&
    !existingIntegrity.ok
  ) {
    issues.push({
      code: "artist-public-snapshot-invalid",
      severity: "warning",
      message:
        `The existing Artist Web Package needs replacement: ${existingIntegrity.reason}`,
    });
  }

  const blockedCount = issues.filter(
    (issue) => issue.severity === "blocked",
  ).length;
  const warningCount = issues.filter(
    (issue) => issue.severity === "warning",
  ).length;
  const status: ArtistPublicationPlan["status"] =
    blockedCount > 0 ? "blocked" : "ready";

  if (status === "blocked") {
    state = "blocked";
  }

  const planFingerprint = hashObject({
    schema:
      "metadata-editor-artist-publication-plan-v1",
    sourceContentFingerprint,
    state,
    status,
    profileSha256,
  });

  return {
    schema: {
      name: "metadata-editor-artist-publication-plan",
      version: 1,
    },
    generatedAt,
    readOnly: true,
    writesEnabled: false,
    status,
    state,
    planFingerprint,
    sourceContentFingerprint,
    ...(existingSourceContentFingerprint
      ? { existingSourceContentFingerprint }
      : {}),
    profile: {
      ...profile,
      sha256: profileSha256,
    },
    artists,
    issues,
    summary: {
      artistCount: artists.length,
      photoCount,
      primaryPhotoCount: artists.filter(
        (artist) => Boolean(artist.primaryAssetId),
      ).length,
      blockedCount,
      warningCount,
    },
  };
}

function publicArtistDocument(
  artist: ArtistPublicationArtistPlan,
): Record<string, unknown> {
  const primary = artist.primaryAssetId
    ? artist.assets.find(
        (asset) => asset.id === artist.primaryAssetId,
      )
    : undefined;

  return {
    schema: {
      name: "hiplingo-artist",
      version: 1,
    },
    id: artist.id,
    slug: artist.slug,
    displayName: artist.displayName,
    ...(artist.sortName
      ? { sortName: artist.sortName }
      : {}),
    ...(primary
      ? {
          primaryPhoto: {
            id: primary.id,
            href: path.posix.join(
              "assets",
              `${primary.id}.webp`,
            ),
          },
        }
      : {}),
    photos: artist.assets.map((asset) => ({
      id: asset.id,
      href: path.posix.join(
        "assets",
        `${asset.id}.webp`,
      ),
      primary: asset.id === artist.primaryAssetId,
      ...(asset.description
        ? { description: asset.description }
        : {}),
    })),
  };
}

function publicArtistCatalog(
  plan: ArtistPublicationPlan,
  generatedAt: string,
): Record<string, unknown> {
  return {
    schema: {
      name: "hiplingo-artist-catalog",
      version: 1,
    },
    generatedAt,
    artists: plan.artists.map((artist) => {
      const primary = artist.primaryAssetId
        ? artist.assets.find(
            (asset) => asset.id === artist.primaryAssetId,
          )
        : undefined;

      return {
        id: artist.id,
        slug: artist.slug,
        displayName: artist.displayName,
        href: path.posix.join(
          artistsDirectoryName,
          artist.slug,
          "artist.json",
        ),
        ...(primary
          ? {
              primaryPhoto: {
                href: path.posix.join(
                  artistsDirectoryName,
                  artist.slug,
                  "assets",
                  `${primary.id}.webp`,
                ),
              },
            }
          : {}),
      };
    }),
  };
}

function isSafeArtistPublicPath(
  relativePath: string,
): boolean {
  const normalized = relativePath.replaceAll("\\", "/");

  if (normalized === artistCatalogFilename) {
    return true;
  }

  const artistDocument = normalized.match(
    /^artists\/([a-z0-9]+(?:-[a-z0-9]+)*)\/artist\.json$/,
  );
  if (artistDocument) {
    return true;
  }

  const artistPhoto = normalized.match(
    /^artists\/([a-z0-9]+(?:-[a-z0-9]+)*)\/assets\/([A-Za-z0-9][A-Za-z0-9._-]{0,127})\.webp$/,
  );
  return Boolean(artistPhoto);
}

function containsPrivateArtistPublicationKey(
  value: unknown,
): boolean {
  if (Array.isArray(value)) {
    return value.some((item) =>
      containsPrivateArtistPublicationKey(item),
    );
  }
  if (!isRecord(value)) {
    return false;
  }

  const forbiddenKeys = new Set([
    "master_path",
    "masterPath",
    "source_filename",
    "sourceFilename",
    "source_sha256",
    "sourceSha256",
    "sha256",
    "metadataRelativePath",
    "relativePath",
  ]);

  return Object.entries(value).some(
    ([key, nested]) =>
      forbiddenKeys.has(key) ||
      containsPrivateArtistPublicationKey(nested),
  );
}

export async function verifyPublishedArtistSnapshot(
  publishRoot: string,
): Promise<ArtistPublicationVerification> {
  const root = path.resolve(publishRoot);
  const indexPath = rootPath(root, artistCatalogFilename);
  const manifestPath = rootPath(root, artistManifestFilename);
  const artistsPath = rootPath(root, artistsDirectoryName);
  const [indexExists, manifestExists, artistsExists] =
    await Promise.all([
      pathExists(indexPath),
      pathExists(manifestPath),
      pathExists(artistsPath),
    ]);
  const exists = indexExists || manifestExists || artistsExists;

  if (!exists) {
    return {
      exists: false,
      ok: true,
      reason: "Artist Web Package has not been built.",
      resourceCount: 0,
      totalBytes: 0,
    };
  }

  if (!indexExists || !manifestExists || !artistsExists) {
    return {
      exists: true,
      ok: false,
      reason:
        "Artist Web Package is partial; artists.json, artist-publication-manifest.json, and artists/ must be promoted as one snapshot.",
      resourceCount: 0,
      totalBytes: 0,
    };
  }

  try {
    const indexStats = await lstat(indexPath);
    const manifestStats = await lstat(manifestPath);
    const artistStats = await lstat(artistsPath);

    if (
      indexStats.isSymbolicLink() ||
      !indexStats.isFile() ||
      manifestStats.isSymbolicLink() ||
      !manifestStats.isFile() ||
      artistStats.isSymbolicLink() ||
      !artistStats.isDirectory()
    ) {
      throw new Error(
        "Artist Web Package contains an unsupported symbolic link or node type.",
      );
    }

    const manifest = await readJson(manifestPath);
    if (
      !isRecord(manifest) ||
      !isRecord(manifest.schema) ||
      manifest.schema.name !==
        "metadata-editor-artist-publication-manifest" ||
      manifest.schema.version !== 1 ||
      typeof manifest.sourceContentFingerprint !== "string" ||
      !Array.isArray(manifest.resources)
    ) {
      throw new Error(
        "Artist publication manifest schema is invalid.",
      );
    }

    const expected = new Map<
      string,
      ArtistPublicationResource
    >();

    for (const value of manifest.resources) {
      if (
        !isRecord(value) ||
        typeof value.path !== "string" ||
        typeof value.sha256 !== "string" ||
        typeof value.bytes !== "number" ||
        !isSafeArtistPublicPath(value.path)
      ) {
        throw new Error(
          "Artist publication manifest contains an invalid public resource.",
        );
      }

      if (expected.has(value.path)) {
        throw new Error(
          `Artist publication manifest repeats resource ${value.path}.`,
        );
      }

      expected.set(value.path, {
        path: value.path,
        sha256: value.sha256,
        bytes: value.bytes,
      });
    }

    const actualArtistFiles = await walkRegularFiles(artistsPath);
    const actual = [
      artistCatalogFilename,
      ...actualArtistFiles.map((relativePath) =>
        path.posix.join(
          artistsDirectoryName,
          relativePath,
        ),
      ),
    ].sort();

    if (
      actual.length !== expected.size ||
      actual.some((relativePath) => !expected.has(relativePath))
    ) {
      throw new Error(
        "Artist Web Package contains missing or unplanned public files.",
      );
    }

    let totalBytes = 0;
    for (const relativePath of actual) {
      const expectedResource = expected.get(relativePath);
      if (!expectedResource) {
        throw new Error(
          `Artist Web Package resource ${relativePath} is not manifest-controlled.`,
        );
      }

      const digest = await hashFile(rootPath(root, relativePath));
      if (
        digest.sha256 !== expectedResource.sha256 ||
        digest.bytes !== expectedResource.bytes
      ) {
        throw new Error(
          `Artist Web Package resource failed hash verification: ${relativePath}`,
        );
      }
      totalBytes += digest.bytes;
    }

    const indexValue = await readJson(indexPath);
    if (
      !isRecord(indexValue) ||
      !isRecord(indexValue.schema) ||
      indexValue.schema.name !== "hiplingo-artist-catalog" ||
      indexValue.schema.version !== 1 ||
      !Array.isArray(indexValue.artists)
    ) {
      throw new Error(
        "artists.json is not a valid Hiplingo Artist catalog.",
      );
    }

    const catalogArtistIds = new Set<string>();
    const catalogArtistSlugs = new Set<string>();

    for (const value of indexValue.artists) {
      if (
        !isRecord(value) ||
        typeof value.id !== "string" ||
        typeof value.slug !== "string" ||
        typeof value.displayName !== "string" ||
        typeof value.href !== "string" ||
        value.href !== path.posix.join(
          artistsDirectoryName,
          value.slug,
          "artist.json",
        ) ||
        !expected.has(value.href)
      ) {
        throw new Error(
          "artists.json contains an invalid Artist reference.",
        );
      }
      if (
        catalogArtistIds.has(value.id) ||
        catalogArtistSlugs.has(value.slug)
      ) {
        throw new Error(
          "artists.json contains a duplicate Artist ID or slug.",
        );
      }
      catalogArtistIds.add(value.id);
      catalogArtistSlugs.add(value.slug);

      const artistDocument = await readJson(
        rootPath(root, value.href),
      );
      if (
        !isRecord(artistDocument) ||
        !isRecord(artistDocument.schema) ||
        artistDocument.schema.name !== "hiplingo-artist" ||
        artistDocument.schema.version !== 1 ||
        artistDocument.id !== value.id ||
        artistDocument.slug !== value.slug ||
        artistDocument.displayName !== value.displayName ||
        !Array.isArray(artistDocument.photos) ||
        containsPrivateArtistPublicationKey(artistDocument)
      ) {
        throw new Error(
          `Published Artist document is invalid or contains private fields: ${value.href}`,
        );
      }

      const photoIds = new Set<string>();
      let primaryPhotoId: string | undefined;
      for (const photo of artistDocument.photos) {
        if (
          !isRecord(photo) ||
          typeof photo.id !== "string" ||
          typeof photo.href !== "string" ||
          typeof photo.primary !== "boolean" ||
          photo.href !== path.posix.join(
            "assets",
            `${photo.id}.webp`,
          ) ||
          !expected.has(
            path.posix.join(
              artistsDirectoryName,
              value.slug,
              photo.href,
            ),
          ) ||
          photoIds.has(photo.id)
        ) {
          throw new Error(
            `Published Artist photo reference is invalid: ${value.href}`,
          );
        }
        photoIds.add(photo.id);
        if (photo.primary) {
          if (primaryPhotoId) {
            throw new Error(
              `Published Artist declares more than one Primary photo: ${value.href}`,
            );
          }
          primaryPhotoId = photo.id;
        }
      }

      const primaryPhoto = artistDocument.primaryPhoto;
      if (primaryPhoto !== undefined) {
        if (
          !isRecord(primaryPhoto) ||
          typeof primaryPhoto.id !== "string" ||
          typeof primaryPhoto.href !== "string" ||
          primaryPhoto.id !== primaryPhotoId ||
          primaryPhoto.href !== path.posix.join(
            "assets",
            `${primaryPhoto.id}.webp`,
          )
        ) {
          throw new Error(
            `Published Artist Primary photo reference is invalid: ${value.href}`,
          );
        }
      } else if (primaryPhotoId) {
        throw new Error(
          `Published Artist photo is marked Primary without a primaryPhoto field: ${value.href}`,
        );
      }

      const catalogPrimary = value.primaryPhoto;
      if (catalogPrimary !== undefined) {
        if (
          !isRecord(catalogPrimary) ||
          typeof catalogPrimary.href !== "string" ||
          !primaryPhotoId ||
          catalogPrimary.href !== path.posix.join(
            artistsDirectoryName,
            value.slug,
            "assets",
            `${primaryPhotoId}.webp`,
          )
        ) {
          throw new Error(
            `artists.json contains an invalid Primary photo reference for ${value.id}.`,
          );
        }
      } else if (primaryPhotoId) {
        throw new Error(
          `artists.json omits the Primary photo reference for ${value.id}.`,
        );
      }
    }

    return {
      exists: true,
      ok: true,
      reason: "Artist Web Package verified.",
      sourceContentFingerprint:
        manifest.sourceContentFingerprint,
      resourceCount: expected.size,
      totalBytes,
    };
  } catch (error) {
    return {
      exists: true,
      ok: false,
      reason:
        error instanceof Error
          ? error.message
          : "Artist Web Package verification failed.",
      resourceCount: 0,
      totalBytes: 0,
    };
  }
}

export async function publishArtistPackage(
  mediaRoot: string,
  publishRoot: string,
  options: {
    expectedPlanFingerprint: string;
    planGeneratedAt: string;
    ffmpegCapabilities?: FfmpegCapabilities;
    processRunner?: ArtistPublicationProcessRunner;
    now?: () => Date;
  },
): Promise<ArtistPublicationReceipt> {
  if (
    !options.expectedPlanFingerprint ||
    !options.planGeneratedAt
  ) {
    throw new Error(
      "Artist publication requires the reviewed plan fingerprint and generation time.",
    );
  }

  const capabilities =
    options.ffmpegCapabilities ??
    await detectFfmpegCapabilities();
  const reviewedPlan = await buildArtistPublicationPlan(
    mediaRoot,
    publishRoot,
    {
      ffmpegCapabilities: capabilities,
      generatedAt: options.planGeneratedAt,
    },
  );

  if (
    reviewedPlan.planFingerprint !==
      options.expectedPlanFingerprint ||
    reviewedPlan.generatedAt !== options.planGeneratedAt
  ) {
    throw new Error(
      "The reviewed Artist publication plan is stale. Refresh Web Package status before writing.",
    );
  }

  if (reviewedPlan.status === "blocked") {
    throw new Error(
      "Artist publication is blocked by one or more canonical Artist-photo issues.",
    );
  }

  if (reviewedPlan.state === "up-to-date") {
    throw new Error(
      "Artist Web Package is already up to date.",
    );
  }

  if (
    reviewedPlan.summary.photoCount > 0 &&
    (
      !capabilities.available ||
      !capabilities.encoders.includes(webpEncoder)
    )
  ) {
    throw new Error(
      "FFmpeg libwebp is required to build the Artist Web Package.",
    );
  }

  const canonicalMediaRoot = await realpath(mediaRoot);
  const requestedPublishRoot = path.resolve(publishRoot);
  await mkdir(requestedPublishRoot, { recursive: true });
  const canonicalPublishRoot = await realpath(requestedPublishRoot);
  const operationRoot = path.join(
    path.dirname(canonicalPublishRoot),
    ".metadata-editor-artist-publication-operations",
    randomUUID(),
  );
  const stageRoot = path.join(operationRoot, "stage");
  const backupRoot = path.join(operationRoot, "backups");
  await mkdir(
    rootPath(stageRoot, artistsDirectoryName),
    { recursive: true },
  );
  await mkdir(backupRoot, { recursive: true });

  const run = options.processRunner ?? runProcess;
  const publishedAt =
    (options.now?.() ?? new Date()).toISOString();
  const promoted: string[] = [];
  const backedUp: string[] = [];
  const targetNames = [
    artistsDirectoryName,
    artistCatalogFilename,
    artistManifestFilename,
  ];

  try {
    for (const artist of reviewedPlan.artists) {
      for (const asset of artist.assets) {
        const source = await ensureRegularSourceFile(
          canonicalMediaRoot,
          asset.sourceRelativePath,
        );
        const sourceDigest = await hashFile(source);
        if (sourceDigest.sha256 !== asset.sourceSha256) {
          throw new Error(
            `Artist photo changed after review: ${asset.sourceRelativePath}`,
          );
        }

        const destination = rootPath(
          stageRoot,
          asset.destinationRelativePath,
        );
        await mkdir(path.dirname(destination), {
          recursive: true,
        });
        await run(
          capabilities.executable,
          buildArtistWebpFfmpegArgs(source, destination),
        );
        await run(
          capabilities.executable,
          buildArtistWebpVerificationArgs(destination),
        );
        await hashFile(destination);
      }

      await writeJson(
        rootPath(stageRoot, artist.documentRelativePath),
        publicArtistDocument(artist),
      );
    }

    await writeJson(
      rootPath(stageRoot, artistCatalogFilename),
      publicArtistCatalog(reviewedPlan, publishedAt),
    );

    const stagedPaths = await walkRegularFiles(stageRoot);
    const resources: ArtistPublicationResource[] = [];

    for (const relativePath of stagedPaths) {
      if (relativePath === artistManifestFilename) {
        continue;
      }
      if (!isSafeArtistPublicPath(relativePath)) {
        throw new Error(
          `Artist Web Package staged an unsafe resource: ${relativePath}`,
        );
      }
      const digest = await hashFile(
        rootPath(stageRoot, relativePath),
      );
      resources.push({
        path: relativePath,
        sha256: digest.sha256,
        bytes: digest.bytes,
      });
    }

    const manifest: ArtistPublicationManifest = {
      schema: {
        name: "metadata-editor-artist-publication-manifest",
        version: 1,
      },
      publishedAt,
      sourceContentFingerprint:
        reviewedPlan.sourceContentFingerprint,
      profile: reviewedPlan.profile,
      resources,
    };

    await writeJson(
      rootPath(stageRoot, artistManifestFilename),
      manifest,
    );

    const stagedVerification =
      await verifyPublishedArtistSnapshot(stageRoot);
    if (!stagedVerification.ok) {
      throw new Error(
        `Staged Artist Web Package failed verification: ${stagedVerification.reason}`,
      );
    }

    const currentPlan = await buildArtistPublicationPlan(
      canonicalMediaRoot,
      canonicalPublishRoot,
      { ffmpegCapabilities: capabilities },
    );
    if (
      currentPlan.sourceContentFingerprint !==
      reviewedPlan.sourceContentFingerprint
    ) {
      throw new Error(
        "Canonical Artist metadata or photo sources changed while the Artist Web Package was being prepared.",
      );
    }

    for (const targetName of targetNames) {
      const target = rootPath(canonicalPublishRoot, targetName);
      if (await pathExists(target)) {
        const stats = await lstat(target);
        if (stats.isSymbolicLink()) {
          throw new Error(
            `Artist Web Package target may not be a symbolic link: ${targetName}`,
          );
        }
        const backup = rootPath(backupRoot, targetName);
        await mkdir(path.dirname(backup), { recursive: true });
        await rename(target, backup);
        backedUp.push(targetName);
      }
    }

    for (const targetName of targetNames) {
      const staged = rootPath(stageRoot, targetName);
      const target = rootPath(canonicalPublishRoot, targetName);
      await rename(staged, target);
      promoted.push(targetName);
    }

    const finalVerification =
      await verifyPublishedArtistSnapshot(canonicalPublishRoot);
    if (
      !finalVerification.ok ||
      finalVerification.sourceContentFingerprint !==
        reviewedPlan.sourceContentFingerprint
    ) {
      throw new Error(
        `Promoted Artist Web Package failed verification: ${finalVerification.reason}`,
      );
    }

    const completedAt =
      (options.now?.() ?? new Date()).toISOString();

    return {
      mode:
        reviewedPlan.state === "not-published"
          ? "build"
          : "update",
      artistCount: reviewedPlan.summary.artistCount,
      photoCount: reviewedPlan.summary.photoCount,
      resourceCount: finalVerification.resourceCount,
      completedAt,
      sourceContentFingerprint:
        reviewedPlan.sourceContentFingerprint,
    };
  } catch (error) {
    for (const targetName of [...promoted].reverse()) {
      await rm(
        rootPath(canonicalPublishRoot, targetName),
        { recursive: true, force: true },
      ).catch(() => undefined);
    }

    for (const targetName of [...backedUp].reverse()) {
      const backup = rootPath(backupRoot, targetName);
      const target = rootPath(canonicalPublishRoot, targetName);
      if (await pathExists(backup)) {
        await rename(backup, target).catch(() => undefined);
      }
    }

    throw error;
  } finally {
    await rm(operationRoot, {
      recursive: true,
      force: true,
    }).catch(() => undefined);
  }
}
