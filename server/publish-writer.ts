import {
  createHash,
  randomUUID,
} from "node:crypto";
import {
  copyFile,
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
  readReleaseMetadataDetail,
} from "./metadata-reader.js";
import {
  buildPublishPlan,
  type PublishPlan,
  type PublishPlanItem,
} from "./publish-plan.js";
import {
  scanReleaseById,
} from "./scanner.js";
import {
  assertPathWithinRoot,
} from "./media-root.js";
import {
  advancePublishOperation,
  assertNoUnresolvedPublishOperation,
  publishOperationsRoot,
  publishServerInstanceId,
  verifyPublishedPackageIntegrity,
  writePublishOperationRecord,
  type PublishOperationRecord,
} from "./publish-operations.js";
import type {
  FfmpegCapabilities,
  ParsedMetadataDocument,
  ReleaseScanResult,
} from "./types.js";

export type PublishReleasePackageOptions = {
  expectedPublishPlanFingerprint: string;
  publishPlanGeneratedAt: string;
  ffmpegCapabilities?: FfmpegCapabilities;
};

export type PublicationResource = {
  kind: PublishPlanItem["kind"];
  path: string;
  sha256: string;
  bytes: number;
  trackId?: string;
  videoId?: string;
};

export type PublicationManifest = {
  schema: {
    name: "metadata-editor-publication-manifest";
    version: 2;
  };
  contract: PublishPlan["contract"];
  releaseId: string;
  publishedAt: string;
  sourcePlanFingerprint: string;
  sourceContentFingerprint: string;
  resources: PublicationResource[];
};

export type PublishPackageReceipt = {
  releaseId: string;
  operationId: string;
  destinationRelativePath: string;
  mode: "build" | "update";
  resourceCount: number;
  trackCount: number;
  streamCount: number;
  waveformCount: number;
  videoCount: number;
  videoStreamCount: number;
  artworkCount: number;
  completedAt: string;
};

type CatalogEntry = {
  id: string;
  href: string;
  title?: string;
  primaryArtist?: string;
  artwork?: {
    href: string;
  };
};

type PublicCatalog = {
  schema: {
    name: "audio-player-catalog";
    version: 1;
  };
  generatedAt: string;
  releases: CatalogEntry[];
};

const publicationManifestFilename = "publication-manifest.json";
const releaseMetadataFilename = "release.json";
const trackMetadataFilename = "track.json";
const videoMetadataFilename = "video.json";
const catalogFilename = "catalog.json";

const forbiddenPublicBasenames = new Set([
  "release.toml",
  "release-settings.toml",
  "release-production-notes.toml",
  "track.toml",
  "track-credits.toml",
  "track-production-notes.toml",
  "ingest-receipt.json",
  "stream-info.json",
  "audio-playback.mp3",
  "video.toml",
]);

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

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function cloneRecord(
  value: unknown,
): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  return JSON.parse(
    JSON.stringify(value),
  ) as Record<string, unknown>;
}

function removeKeys(
  value: unknown,
  keys: ReadonlySet<string>,
): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) =>
      removeKeys(entry, keys),
    );
  }

  if (!isRecord(value)) {
    return value;
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, entry] of Object.entries(value)) {
    if (keys.has(key)) {
      continue;
    }

    sanitized[key] = removeKeys(entry, keys);
  }

  return sanitized;
}

function sanitizeReleaseMetadata(
  releaseValue: unknown,
): Record<string, unknown> {
  return removeKeys(
    cloneRecord(releaseValue),
    new Set([
      "master_path",
      "web_path",
      "embedded_path",
    ]),
  ) as Record<string, unknown>;
}

function sanitizeTrackMetadata(
  trackValue: unknown,
): Record<string, unknown> {
  const track = cloneRecord(trackValue);

  delete track.assets;
  delete track.credit_sources;
  delete track.production_note_sources;

  return track;
}

function sanitizeTrackCredits(
  trackValue: unknown,
): Record<string, unknown> {
  const credits = cloneRecord(trackValue);

  delete credits.sample_clearances;

  if (Array.isArray(credits.samples)) {
    credits.samples = credits.samples.map((sample) => {
      if (!isRecord(sample)) {
        return sample;
      }

      const sanitized = { ...sample };
      delete sanitized.notes;
      return sanitized;
    });
  }

  return removeKeys(
    credits,
    new Set(["editor_only"]),
  ) as Record<string, unknown>;
}

function findDocument(
  documents: readonly ParsedMetadataDocument[],
  filename: string,
  trackId?: string,
): ParsedMetadataDocument | null {
  return documents.find(
    (document) =>
      document.filename === filename &&
      (trackId === undefined || document.trackId === trackId),
  ) ?? null;
}

function publicArtworkItem(
  plan: PublishPlan,
  trackId?: string,
): PublishPlanItem | null {
  return plan.items.find(
    (item) =>
      item.kind === (trackId ? "track-artwork" : "release-artwork") &&
      (trackId === undefined || item.trackId === trackId) &&
      item.action !== "blocked",
  ) ?? null;
}

function relativeHref(
  fromDirectoryRelativePath: string,
  destinationRelativePath: string,
): string {
  const relative = path.posix.relative(
    fromDirectoryRelativePath,
    destinationRelativePath,
  );

  if (
    !relative ||
    relative === ".." ||
    relative.startsWith("../../../") ||
    path.posix.isAbsolute(relative)
  ) {
    throw new Error(
      `Public resource href escapes its release package: ${destinationRelativePath}`,
    );
  }

  return relative;
}

function publicTrackDocument(
  plan: PublishPlan,
  release: ReleaseScanResult,
  documents: readonly ParsedMetadataDocument[],
  trackId: string,
): Record<string, unknown> {
  const trackDocument = findDocument(
    documents,
    "track.toml",
    trackId,
  );

  if (!trackDocument) {
    throw new Error(
      `Publish requires track.toml for ${trackId}.`,
    );
  }

  const creditsDocument = findDocument(
    documents,
    "track-credits.toml",
    trackId,
  );
  const trackDestination = path.posix.join(
    plan.destinationReleaseRelativePath,
    "tracks",
    trackId,
  );
  const releaseArtwork = publicArtworkItem(plan);
  const trackArtwork = publicArtworkItem(plan, trackId);
  const artworkItem = trackArtwork ?? releaseArtwork;

  return {
    schema: {
      name: "audio-player-track",
      version: 2,
    },
    id: trackId,
    releaseId: release.id,
    metadata: sanitizeTrackMetadata(
      isRecord(trackDocument.parsed)
        ? trackDocument.parsed.track
        : undefined,
    ),
    credits: sanitizeTrackCredits(
      creditsDocument && isRecord(creditsDocument.parsed)
        ? creditsDocument.parsed.track
        : undefined,
    ),
    stream: {
      href: "stream/index.m3u8",
      protocol: plan.contract.trackResources.stream.protocol,
      codec: plan.contract.trackResources.stream.codec,
      bitrateKbps:
        plan.contract.trackResources.stream.bitrateKbps,
      segmentDurationSeconds:
        plan.contract.trackResources.stream.segmentDurationSeconds,
      segmentType:
        plan.contract.trackResources.stream.segmentType,
    },
    waveform: {
      href: plan.contract.trackResources.waveform.filename,
      schemaVersion:
        plan.contract.trackResources.waveform.schemaVersion,
    },
    ...(artworkItem
      ? {
          artwork: {
            href: relativeHref(
              trackDestination,
              artworkItem.destinationRelativePath,
            ),
            inheritedFromRelease: !trackArtwork,
          },
        }
      : {}),
  };
}

function publicVideoDocument(
  plan: PublishPlan,
  release: ReleaseScanResult,
  video: NonNullable<ReleaseScanResult["videos"]>[number],
): Record<string, unknown> {
  return {
    schema: {
      name: "media-player-video",
      version: 1,
    },
    id: video.id,
    releaseId: release.id,
    metadata: {
      ...(video.title ? { title: video.title } : {}),
      ...(video.videoType ? { type: video.videoType } : {}),
      ...(video.relatedTrackId
        ? { relatedTrackId: video.relatedTrackId }
        : {}),
    },
    stream: {
      href: plan.contract.videoResources.stream.manifestRelativePath,
      protocol: plan.contract.videoResources.stream.protocol,
      videoCodec:
        plan.contract.videoResources.stream.videoCodec,
      videoProfile:
        plan.contract.videoResources.stream.videoProfile,
      videoLevel:
        plan.contract.videoResources.stream.videoLevel,
      maxWidth: plan.contract.videoResources.stream.maxWidth,
      maxHeight: plan.contract.videoResources.stream.maxHeight,
      maxFrameRate:
        plan.contract.videoResources.stream.maxFrameRate,
      audioCodec:
        plan.contract.videoResources.stream.audioCodec,
      audioBitrateKbps:
        plan.contract.videoResources.stream.audioBitrateKbps,
      segmentDurationSeconds:
        plan.contract.videoResources.stream.segmentDurationSeconds,
      segmentType:
        plan.contract.videoResources.stream.segmentType,
    },
  };
}

function publicReleaseDocument(
  plan: PublishPlan,
  release: ReleaseScanResult,
  documents: readonly ParsedMetadataDocument[],
): Record<string, unknown> {
  const releaseDocument = findDocument(
    documents,
    "release.toml",
  );

  if (!releaseDocument) {
    throw new Error(
      `Publish requires release.toml for ${release.id}.`,
    );
  }

  const releaseArtwork = publicArtworkItem(plan);
  const releaseDestination =
    plan.destinationReleaseRelativePath;

  return {
    schema: {
      name: "audio-player-release",
      version: 2,
    },
    id: release.id,
    metadata: sanitizeReleaseMetadata(
      isRecord(releaseDocument.parsed)
        ? releaseDocument.parsed.release
        : undefined,
    ),
    ...(releaseArtwork
      ? {
          artwork: {
            front: {
              href: relativeHref(
                releaseDestination,
                releaseArtwork.destinationRelativePath,
              ),
            },
          },
        }
      : {}),
    tracks: release.tracks.map((track) => ({
      id: track.id,
      href: path.posix.join(
        "tracks",
        track.id,
        trackMetadataFilename,
      ),
    })),
    ...((release.videos?.length ?? 0) > 0
      ? {
          videos: (release.videos ?? []).map((video) => ({
            id: video.id,
            href: path.posix.join(
              "videos",
              video.id,
              videoMetadataFilename,
            ),
          })),
        }
      : {}),
  };
}

async function sha256File(
  filePath: string,
): Promise<{ sha256: string; bytes: number }> {
  const buffer = await readFile(filePath);

  return {
    sha256: createHash("sha256")
      .update(buffer)
      .digest("hex"),
    bytes: buffer.length,
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
      `Publish source is not a regular non-symbolic file: ${relativePath}`,
    );
  }

  const canonicalFile = await realpath(candidate);
  assertPathWithinRoot(canonicalRoot, canonicalFile);

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

async function walkPublicFiles(
  root: string,
  relativePath = "",
): Promise<string[]> {
  const directory = rootPath(root, relativePath);
  const entries = await readdir(directory, {
    withFileTypes: true,
  });
  const files: string[] = [];

  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      throw new Error(
        `Published package contains a symbolic link: ${path.posix.join(relativePath, entry.name)}`,
      );
    }

    const entryRelativePath = path.posix.join(
      relativePath,
      entry.name,
    );

    if (entry.isDirectory()) {
      files.push(
        ...(await walkPublicFiles(
          root,
          entryRelativePath,
        )),
      );
      continue;
    }

    if (!entry.isFile()) {
      throw new Error(
        `Published package contains an unsupported filesystem entry: ${entryRelativePath}`,
      );
    }

    files.push(entryRelativePath);
  }

  return files.sort();
}

function assertSafePublicFilename(
  relativePath: string,
): void {
  const basename = path.posix.basename(relativePath);
  const lower = basename.toLowerCase();

  if (
    forbiddenPublicBasenames.has(lower) ||
    lower.startsWith("audio-master.") ||
    lower.startsWith("video-master.") ||
    lower.startsWith("distribution-master.") ||
    lower.endsWith(".toml") ||
    lower.endsWith(".tif") ||
    lower.endsWith(".tiff")
  ) {
    throw new Error(
      `Private or archival content is not allowed in the public package: ${relativePath}`,
    );
  }
}

function plannedReleaseRelativePath(
  plan: PublishPlan,
  destinationRelativePath: string,
): string {
  const prefix = `${plan.destinationReleaseRelativePath}/`;

  if (!destinationRelativePath.startsWith(prefix)) {
    throw new Error(
      `Publish item is outside the release package: ${destinationRelativePath}`,
    );
  }

  return destinationRelativePath.slice(prefix.length);
}

async function buildStagedRelease(
  mediaRoot: string,
  stageReleasePath: string,
  plan: PublishPlan,
  release: ReleaseScanResult,
  publishedAt: string,
): Promise<PublicationManifest> {
  const metadata = await readReleaseMetadataDetail(
    mediaRoot,
    release,
  );

  if (metadata.warnings.length > 0) {
    throw new Error(
      `Unable to read canonical metadata for publication: ${metadata.warnings.join("; ")}`,
    );
  }

  const metadataByPath = new Map<
    string,
    ParsedMetadataDocument
  >(
    metadata.documents.map((document) => [
      document.relativePath,
      document,
    ] as const),
  );

  for (const input of plan.metadataInputs) {
    const document = metadataByPath.get(
      input.relativePath,
    );

    if (document) {
      if (document.sha256 !== input.sha256) {
        throw new Error(
          `Canonical metadata changed after preflight: ${input.relativePath}`,
        );
      }
      continue;
    }

    const sourcePath = await ensureRegularSourceFile(
      mediaRoot,
      input.relativePath,
    );
    const digest = await sha256File(sourcePath);
    if (digest.sha256 !== input.sha256) {
      throw new Error(
        `Canonical metadata changed after preflight: ${input.relativePath}`,
      );
    }
  }

  const destinations = new Set<string>();

  for (const item of plan.items) {
    if (
      item.kind === "catalog" ||
      item.kind === "publication-manifest" ||
      item.kind === "release-metadata" ||
      item.kind === "track-metadata" ||
      item.kind === "video-metadata" ||
      item.action === "blocked"
    ) {
      continue;
    }

    if (!item.sourceRelativePath) {
      throw new Error(
        `Publish item is missing a source: ${item.destinationRelativePath}`,
      );
    }

    const releaseRelativePath =
      plannedReleaseRelativePath(
        plan,
        item.destinationRelativePath,
      );

    if (destinations.has(releaseRelativePath)) {
      throw new Error(
        `Publish plan contains a duplicate output path: ${item.destinationRelativePath}`,
      );
    }

    destinations.add(releaseRelativePath);
    assertSafePublicFilename(releaseRelativePath);

    const source = await ensureRegularSourceFile(
      mediaRoot,
      item.sourceRelativePath,
    );
    const sourceDigest = await sha256File(source);

    if (
      item.sourceSha256 &&
      item.sourceSha256 !== sourceDigest.sha256
    ) {
      throw new Error(
        `Publish source changed after preflight: ${item.sourceRelativePath}`,
      );
    }

    const destination = rootPath(
      stageReleasePath,
      releaseRelativePath,
    );

    await mkdir(path.dirname(destination), {
      recursive: true,
    });
    await copyFile(source, destination);
    const stagedDigest = await sha256File(destination);

    if (stagedDigest.sha256 !== sourceDigest.sha256) {
      throw new Error(
        `Staged publish copy failed hash verification: ${releaseRelativePath}`,
      );
    }
  }

  const releaseJsonPath = rootPath(
    stageReleasePath,
    releaseMetadataFilename,
  );
  await writeJson(
    releaseJsonPath,
    publicReleaseDocument(
      plan,
      release,
      metadata.documents,
    ),
  );

  for (const track of release.tracks) {
    const trackJsonPath = rootPath(
      stageReleasePath,
      path.posix.join(
        "tracks",
        track.id,
        trackMetadataFilename,
      ),
    );

    await writeJson(
      trackJsonPath,
      publicTrackDocument(
        plan,
        release,
        metadata.documents,
        track.id,
      ),
    );
  }

  for (const video of release.videos ?? []) {
    const videoJsonPath = rootPath(
      stageReleasePath,
      path.posix.join(
        "videos",
        video.id,
        videoMetadataFilename,
      ),
    );

    await writeJson(
      videoJsonPath,
      publicVideoDocument(
        plan,
        release,
        video,
      ),
    );
  }

  const plannedFiles = new Map<
    string,
    PublishPlanItem
  >();

  for (const item of plan.items) {
    if (
      item.kind === "catalog" ||
      item.kind === "publication-manifest" ||
      item.action === "blocked"
    ) {
      continue;
    }

    const plannedRelativePath =
      plannedReleaseRelativePath(
        plan,
        item.destinationRelativePath,
      );

    if (plannedFiles.has(plannedRelativePath)) {
      throw new Error(
        `Publish plan contains a duplicate output path: ${item.destinationRelativePath}`,
      );
    }

    plannedFiles.set(
      plannedRelativePath,
      item,
    );
  }

  const actualBeforeManifest =
    await walkPublicFiles(stageReleasePath);
  const actualSet = new Set(actualBeforeManifest);

  for (const expected of plannedFiles.keys()) {
    if (!actualSet.has(expected)) {
      throw new Error(
        `Staged public package is missing planned output: ${expected}`,
      );
    }
  }

  for (const actual of actualBeforeManifest) {
    assertSafePublicFilename(actual);

    if (!plannedFiles.has(actual)) {
      throw new Error(
        `Staged public package contains an unplanned file: ${actual}`,
      );
    }
  }

  const resources: PublicationResource[] = [];

  for (const relativePath of actualBeforeManifest) {
    const item = plannedFiles.get(relativePath);

    if (!item) {
      throw new Error(
        `Missing publish-plan item for staged resource: ${relativePath}`,
      );
    }

    const digest = await sha256File(
      rootPath(stageReleasePath, relativePath),
    );

    resources.push({
      kind: item.kind,
      path: relativePath,
      sha256: digest.sha256,
      bytes: digest.bytes,
      ...(item.trackId
        ? { trackId: item.trackId }
        : {}),
      ...(item.videoId
        ? { videoId: item.videoId }
        : {}),
    });
  }

  const manifest: PublicationManifest = {
    schema: {
      name: "metadata-editor-publication-manifest",
      version: 2,
    },
    contract: plan.contract,
    releaseId: release.id,
    publishedAt,
    sourcePlanFingerprint: plan.planFingerprint,
    sourceContentFingerprint:
      plan.publication.currentContentFingerprint,
    resources,
  };

  await writeJson(
    rootPath(
      stageReleasePath,
      publicationManifestFilename,
    ),
    manifest,
  );

  const finalFiles = await walkPublicFiles(
    stageReleasePath,
  );
  const expectedFinalFiles = new Set([
    ...plannedFiles.keys(),
    publicationManifestFilename,
  ]);

  if (
    finalFiles.length !== expectedFinalFiles.size ||
    finalFiles.some(
      (relativePath) =>
        !expectedFinalFiles.has(relativePath),
    )
  ) {
    throw new Error(
      "Staged public package changed unexpectedly after manifest generation.",
    );
  }

  return manifest;
}

function catalogEntryFromReleaseDocument(
  releaseId: string,
  releaseDocument: unknown,
): CatalogEntry {
  if (!isRecord(releaseDocument)) {
    throw new Error(
      `Published release metadata is not a JSON object: ${releaseId}`,
    );
  }

  const metadata = isRecord(releaseDocument.metadata)
    ? releaseDocument.metadata
    : {};
  const primaryArtist = isRecord(metadata.primary_artist)
    ? metadata.primary_artist
    : {};
  const artwork = isRecord(releaseDocument.artwork)
    ? releaseDocument.artwork
    : {};
  const front = isRecord(artwork.front)
    ? artwork.front
    : {};

  return {
    id: releaseId,
    href: path.posix.join(
      "releases",
      releaseId,
      releaseMetadataFilename,
    ),
    ...(typeof metadata.title === "string" && metadata.title.trim()
      ? { title: metadata.title }
      : {}),
    ...(typeof primaryArtist.name === "string" && primaryArtist.name.trim()
      ? { primaryArtist: primaryArtist.name }
      : {}),
    ...(typeof front.href === "string" && front.href.trim()
      ? {
          artwork: {
            href: path.posix.join(
              "releases",
              releaseId,
              front.href,
            ),
          },
        }
      : {}),
  };
}

async function buildCatalog(
  publishRoot: string,
  targetReleaseId: string,
  stagedReleasePath: string,
  generatedAt: string,
): Promise<PublicCatalog> {
  const releasesRoot = path.join(
    publishRoot,
    "releases",
  );
  const entries: CatalogEntry[] = [];
  let directoryEntries = [] as import("node:fs").Dirent[];

  try {
    directoryEntries = await readdir(
      releasesRoot,
      { withFileTypes: true },
    );
  } catch (error) {
    if (
      !error ||
      typeof error !== "object" ||
      !("code" in error) ||
      error.code !== "ENOENT"
    ) {
      throw error;
    }
  }

  for (const entry of directoryEntries) {
    if (
      !entry.isDirectory() ||
      entry.isSymbolicLink() ||
      entry.name.startsWith(".") ||
      entry.name === targetReleaseId
    ) {
      continue;
    }

    const releaseJson = path.join(
      releasesRoot,
      entry.name,
      releaseMetadataFilename,
    );
    const stats = await lstat(releaseJson);

    if (stats.isSymbolicLink() || !stats.isFile()) {
      throw new Error(
        `Existing published release is missing a regular ${releaseMetadataFilename}: ${entry.name}`,
      );
    }

    const parsed = JSON.parse(
      await readFile(releaseJson, "utf8"),
    ) as unknown;

    entries.push(
      catalogEntryFromReleaseDocument(
        entry.name,
        parsed,
      ),
    );
  }

  const stagedReleaseJson = JSON.parse(
    await readFile(
      rootPath(
        stagedReleasePath,
        releaseMetadataFilename,
      ),
      "utf8",
    ),
  ) as unknown;

  entries.push(
    catalogEntryFromReleaseDocument(
      targetReleaseId,
      stagedReleaseJson,
    ),
  );

  entries.sort((left, right) =>
    left.id.localeCompare(right.id, undefined, {
      numeric: true,
    }),
  );

  return {
    schema: {
      name: "audio-player-catalog",
      version: 1,
    },
    generatedAt,
    releases: entries,
  };
}

async function ensurePublishRoot(
  publishRoot: string,
): Promise<string> {
  await mkdir(publishRoot, {
    recursive: true,
  });
  const stats = await lstat(publishRoot);

  if (stats.isSymbolicLink() || !stats.isDirectory()) {
    throw new Error(
      `Configured publish root is not a regular directory: ${publishRoot}`,
    );
  }

  return realpath(publishRoot);
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

export async function publishReleasePackage(
  mediaRoot: string,
  publishRoot: string,
  releaseId: string,
  options: PublishReleasePackageOptions,
): Promise<PublishPackageReceipt> {
  if (
    !options.expectedPublishPlanFingerprint ||
    !options.publishPlanGeneratedAt
  ) {
    throw new Error(
      "Publish requires the exact reviewed plan fingerprint and generation time.",
    );
  }

  const reviewedPlan = await buildPublishPlan(
    mediaRoot,
    publishRoot,
    releaseId,
    {
      generatedAt: options.publishPlanGeneratedAt,
      ...(options.ffmpegCapabilities
        ? {
            ffmpegCapabilities:
              options.ffmpegCapabilities,
          }
        : {}),
    },
  );

  if (
    reviewedPlan.planFingerprint !==
    options.expectedPublishPlanFingerprint
  ) {
    throw new Error(
      "Publish preflight is stale. Refresh preflight before building the public package.",
    );
  }

  if (reviewedPlan.publication.state === "up-to-date") {
    throw new Error(
      "Public package is already up to date; no publication write is required.",
    );
  }

  const blockedIssues = reviewedPlan.issues.filter(
    (issue) => issue.severity === "blocked",
  );

  if (
    reviewedPlan.status === "blocked" ||
    reviewedPlan.summary.blockedCount > 0 ||
    blockedIssues.length > 0
  ) {
    throw new Error(
      `Public package cannot be built until preflight blockers are resolved: ${blockedIssues.map((issue) => issue.message).join("; ")}`,
    );
  }

  const release = await scanReleaseById(
    mediaRoot,
    releaseId,
  );

  if (!release) {
    throw new Error(
      `Release disappeared before publication: ${releaseId}`,
    );
  }

  const canonicalPublishRoot = await ensurePublishRoot(
    publishRoot,
  );
  await assertNoUnresolvedPublishOperation(
    canonicalPublishRoot,
    releaseId,
  );
  const operationsRoot = publishOperationsRoot(
    canonicalPublishRoot,
  );
  await mkdir(operationsRoot, {
    recursive: true,
  });
  const canonicalOperationsRoot = await realpath(
    operationsRoot,
  );
  const operationId = `${Date.now()}-${randomUUID()}`;
  const operationPath = rootPath(
    canonicalOperationsRoot,
    operationId,
  );
  const stageReleasePath = path.join(
    operationPath,
    "stage-release",
  );
  const stagedCatalogPath = path.join(
    operationPath,
    "catalog.json",
  );
  const backupReleasePath = path.join(
    operationPath,
    "backup-release",
  );
  const backupCatalogPath = path.join(
    operationPath,
    "backup-catalog.json",
  );
  const targetReleasePath = rootPath(
    canonicalPublishRoot,
    reviewedPlan.destinationReleaseRelativePath,
  );
  const targetCatalogPath = rootPath(
    canonicalPublishRoot,
    catalogFilename,
  );
  const releasesPath = rootPath(
    canonicalPublishRoot,
    "releases",
  );
  const releasePreviouslyExisted =
    await pathExists(targetReleasePath);
  const catalogPreviouslyExisted =
    await pathExists(targetCatalogPath);
  const publishedAt = new Date().toISOString();
  let releaseBackedUp = false;
  let releasePromoted = false;
  let catalogBackedUp = false;
  let catalogPromoted = false;

  await mkdir(operationPath, {
    recursive: false,
  });
  await mkdir(stageReleasePath, {
    recursive: false,
  });
  await mkdir(releasesPath, {
    recursive: true,
  });

  let operationRecord: PublishOperationRecord = {
    schema: {
      name: "metadata-editor-publish-operation",
      version: 2,
    },
    operationId,
    serverInstanceId: publishServerInstanceId,
    releaseId,
    destinationReleaseRelativePath:
      reviewedPlan.destinationReleaseRelativePath,
    startedAt: publishedAt,
    updatedAt: publishedAt,
    reviewedPlanFingerprint:
      reviewedPlan.planFingerprint,
    sourceContentFingerprint:
      reviewedPlan.publication.currentContentFingerprint,
    mode: releasePreviouslyExisted
      ? "update"
      : "build",
    state: "running",
    phase: "staging",
    releasePreviouslyExisted,
    catalogPreviouslyExisted,
    phaseHistory: [
      {
        phase: "staging",
        at: publishedAt,
      },
    ],
  };

  const journal = async (
    phase: PublishOperationRecord["phase"],
    patch: Partial<PublishOperationRecord> = {},
  ): Promise<void> => {
    operationRecord = advancePublishOperation(
      operationRecord,
      phase,
      patch,
    );
    await writePublishOperationRecord(
      operationPath,
      operationRecord,
    );
  };

  await writePublishOperationRecord(
    operationPath,
    operationRecord,
  );

  try {
    const publicationManifest =
      await buildStagedRelease(
        mediaRoot,
        stageReleasePath,
        reviewedPlan,
        release,
        publishedAt,
      );

    const catalog = await buildCatalog(
      canonicalPublishRoot,
      releaseId,
      stageReleasePath,
      publishedAt,
    );
    await writeJson(stagedCatalogPath, catalog);

    const stagedCatalogDigest = await sha256File(
      stagedCatalogPath,
    );
    const stagedManifestDigest = await sha256File(
      path.join(
        stageReleasePath,
        publicationManifestFilename,
      ),
    );

    await journal("validating", {
      artifacts: {
        stagedCatalogSha256:
          stagedCatalogDigest.sha256,
        stagedPublicationManifestSha256:
          stagedManifestDigest.sha256,
      },
    });

    // Rebuild the reviewed plan immediately before promotion. Any canonical
    // source or public destination change invalidates the write.
    const promotionPlan = await buildPublishPlan(
      mediaRoot,
      publishRoot,
      releaseId,
      {
        generatedAt:
          options.publishPlanGeneratedAt,
        ...(options.ffmpegCapabilities
          ? {
              ffmpegCapabilities:
                options.ffmpegCapabilities,
            }
          : {}),
      },
    );

    if (
      promotionPlan.planFingerprint !==
      reviewedPlan.planFingerprint
    ) {
      throw new Error(
        "Publish inputs or destination changed while the package was being staged. Refresh preflight and try again.",
      );
    }

    await journal("backing-up-release");

    if (releasePreviouslyExisted) {
      const targetStats = await lstat(
        targetReleasePath,
      );

      if (
        targetStats.isSymbolicLink() ||
        !targetStats.isDirectory()
      ) {
        throw new Error(
          "Existing public release target is not a regular directory.",
        );
      }

      await rename(
        targetReleasePath,
        backupReleasePath,
      );
      releaseBackedUp = true;
    }

    await journal("promoting-release");

    await rename(
      stageReleasePath,
      targetReleasePath,
    );
    releasePromoted = true;

    await journal("backing-up-catalog");

    if (catalogPreviouslyExisted) {
      const catalogStats = await lstat(
        targetCatalogPath,
      );

      if (
        catalogStats.isSymbolicLink() ||
        !catalogStats.isFile()
      ) {
        throw new Error(
          "Existing public catalog target is not a regular file.",
        );
      }

      await rename(
        targetCatalogPath,
        backupCatalogPath,
      );
      catalogBackedUp = true;
    }

    await journal("promoting-catalog");

    await rename(
      stagedCatalogPath,
      targetCatalogPath,
    );
    catalogPromoted = true;

    await journal("verifying");

    const promotedManifest = JSON.parse(
      await readFile(
        path.join(
          targetReleasePath,
          publicationManifestFilename,
        ),
        "utf8",
      ),
    ) as PublicationManifest;

    for (const resource of promotedManifest.resources) {
      const digest = await sha256File(
        rootPath(
          targetReleasePath,
          resource.path,
        ),
      );

      if (
        digest.sha256 !== resource.sha256 ||
        digest.bytes !== resource.bytes
      ) {
        throw new Error(
          `Promoted public resource failed hash verification: ${resource.path}`,
        );
      }
    }

    const integrity =
      await verifyPublishedPackageIntegrity(
        canonicalPublishRoot,
        releaseId,
        reviewedPlan.planFingerprint,
      );

    if (!integrity.ok) {
      throw new Error(
        `Post-publish integrity verification failed: ${integrity.reason}`,
      );
    }

    const completedAt = new Date().toISOString();
    await journal("completed", {
      state: "completed",
      completedAt,
      resources: integrity.resourceCount,
    });

    return {
      releaseId,
      operationId,
      destinationRelativePath:
        reviewedPlan.destinationReleaseRelativePath,
      mode: releasePreviouslyExisted
        ? "update"
        : "build",
      resourceCount:
        publicationManifest.resources.length,
      trackCount: release.tracks.length,
      streamCount: release.tracks.length,
      waveformCount: release.tracks.length,
      videoCount: release.videos?.length ?? 0,
      videoStreamCount: reviewedPlan.videoStreams.currentCount,
      artworkCount: reviewedPlan.items.filter(
        (item) =>
          item.kind === "release-artwork" ||
          item.kind === "track-artwork",
      ).length,
      completedAt,
    };
  } catch (error) {
    if (catalogPromoted) {
      await rm(targetCatalogPath, {
        force: true,
      }).catch(() => undefined);
      catalogPromoted = false;
    }

    if (catalogBackedUp) {
      await rename(
        backupCatalogPath,
        targetCatalogPath,
      ).catch(() => undefined);
    }

    if (releasePromoted) {
      await rm(targetReleasePath, {
        recursive: true,
        force: true,
      }).catch(() => undefined);
      releasePromoted = false;
    }

    if (releaseBackedUp) {
      await rename(
        backupReleasePath,
        targetReleasePath,
      ).catch(() => undefined);
    }

    await journal("failed", {
      state: "failed",
      failedAt: new Date().toISOString(),
      error:
        error instanceof Error
          ? error.message
          : "Unknown publication error",
    }).catch(() => undefined);

    throw error;
  }
}
