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
import {
  describeArtworkPreference,
  selectPreferredArtworkCandidate,
} from "../shared/artwork-preference.js";
import {
  isPrimaryArtworkMasterForOwner,
} from "../shared/artwork-role-path.js";
import {
  acceptedArtworkMasterExtensions,
  acceptedAudioMasterExtensions,
  acceptedVideoMasterExtensions,
} from "../shared/media-file-spec.js";

import type {
  DiscoveredAsset,
  LibraryScanResult,
  MetadataFileStatus,
  ReleaseScanResult,
  TrackScanResult,
  VideoScanResult,
} from "./types.js";

const releaseMetadataFiles = [
  "release.toml",
  "release-settings.toml",
  "release-production-notes.toml",
] as const;

const trackMetadataFiles = [
  "track.toml",
  "track-credits.toml",
  "track-production-notes.toml",
] as const;

const videoMetadataFiles = [
  "video.toml",
] as const;

const audioAssetExtensions = acceptedAudioMasterExtensions;
const artworkMasterExtensions = acceptedArtworkMasterExtensions;
const videoAssetExtensions = acceptedVideoMasterExtensions;

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
  return typeof value === "string" &&
    value.trim().length > 0
    ? value
    : undefined;
}

async function readReleaseLibraryIdentity(
  mediaRoot: string,
  releasePath: string,
  metadataFiles: MetadataFileStatus[],
): Promise<
  Pick<
    ReleaseScanResult,
    | "releaseTitle"
    | "primaryArtistName"
    | "releaseDate"
    | "releaseType"
  >
> {
  const releaseDocument = metadataFiles.find(
    (file) => file.filename === "release.toml",
  );

  if (!releaseDocument?.exists) {
    return {};
  }

  try {
    const candidatePath = assertPathWithinRoot(
      mediaRoot,
      path.join(releasePath, "release.toml"),
    );
    const stats = await lstat(candidatePath);

    if (
      !stats.isFile() ||
      stats.isSymbolicLink()
    ) {
      return {};
    }

    const canonicalMediaRoot =
      await realpath(mediaRoot);
    const canonicalFilePath =
      await realpath(candidatePath);

    assertPathWithinRoot(
      canonicalMediaRoot,
      canonicalFilePath,
    );

    const parsed = parse(
      await readFile(canonicalFilePath, "utf8"),
    );
    const releaseTable =
      isRecord(parsed) &&
      isRecord(parsed.release)
        ? parsed.release
        : null;

    if (!releaseTable) {
      return {};
    }

    const primaryArtist = isRecord(
      releaseTable.primary_artist,
    )
      ? releaseTable.primary_artist
      : null;
    const releaseTitle = readNonBlankString(
      releaseTable.title,
    );
    const primaryArtistName =
      readNonBlankString(primaryArtist?.name);
    const dates = isRecord(releaseTable.dates)
      ? releaseTable.dates
      : null;
    const releaseDate = readNonBlankString(
      dates?.release,
    );
    const releaseType = readNonBlankString(
      releaseTable.type,
    );

    return {
      ...(releaseTitle
        ? { releaseTitle }
        : {}),
      ...(primaryArtistName
        ? { primaryArtistName }
        : {}),
      ...(releaseDate
        ? { releaseDate }
        : {}),
      ...(releaseType
        ? { releaseType }
        : {}),
    };
  } catch {
    // The full metadata-detail reader reports malformed TOML on open.
    return {};
  }
}

async function readVideoLibraryIdentity(
  mediaRoot: string,
  videoPath: string,
  metadataFiles: MetadataFileStatus[],
): Promise<
  Pick<
    VideoScanResult,
    | "title"
    | "videoType"
    | "description"
    | "date"
    | "location"
    | "director"
    | "cameraOperator"
    | "displayOrder"
    | "posterTimeSeconds"
    | "relatedTrackId"
    | "masterPath"
  >
> {
  const videoDocument = metadataFiles.find(
    (file) => file.filename === "video.toml",
  );

  if (!videoDocument?.exists) {
    return {};
  }

  try {
    const candidatePath = assertPathWithinRoot(
      mediaRoot,
      path.join(videoPath, "video.toml"),
    );
    const stats = await lstat(candidatePath);

    if (!stats.isFile() || stats.isSymbolicLink()) {
      return {};
    }

    const canonicalMediaRoot = await realpath(mediaRoot);
    const canonicalFilePath = await realpath(candidatePath);

    assertPathWithinRoot(
      canonicalMediaRoot,
      canonicalFilePath,
    );

    const parsed = parse(
      await readFile(canonicalFilePath, "utf8"),
    );
    const videoTable =
      isRecord(parsed) && isRecord(parsed.video)
        ? parsed.video
        : null;

    if (!videoTable) {
      return {};
    }

    const title = readNonBlankString(videoTable.title);
    const videoType = readNonBlankString(videoTable.type);
    const description = readNonBlankString(videoTable.description);
    const date = readNonBlankString(videoTable.date);
    const location = readNonBlankString(videoTable.location);
    const director = readNonBlankString(videoTable.director);
    const cameraOperator = readNonBlankString(
      videoTable.camera_operator,
    );
    const displayOrder =
      typeof videoTable.display_order === "number" &&
      Number.isInteger(videoTable.display_order) &&
      videoTable.display_order > 0
        ? videoTable.display_order
        : undefined;
    const posterTimeSeconds =
      typeof videoTable.poster_time_seconds === "number" &&
      Number.isFinite(videoTable.poster_time_seconds) &&
      videoTable.poster_time_seconds >= 0
        ? videoTable.poster_time_seconds
        : undefined;
    const relatedTrackId = readNonBlankString(
      videoTable.related_track_id,
    );
    const masterPath = readNonBlankString(
      videoTable.master_path,
    );

    return {
      ...(title ? { title } : {}),
      ...(videoType ? { videoType } : {}),
      ...(description ? { description } : {}),
      ...(date ? { date } : {}),
      ...(location ? { location } : {}),
      ...(director ? { director } : {}),
      ...(cameraOperator ? { cameraOperator } : {}),
      ...(displayOrder ? { displayOrder } : {}),
      ...(posterTimeSeconds !== undefined
        ? { posterTimeSeconds }
        : {}),
      ...(relatedTrackId ? { relatedTrackId } : {}),
      ...(masterPath ? { masterPath } : {}),
    };
  } catch {
    // Malformed video.toml remains visible as a missing identity detail;
    // canonical metadata diagnostics can report the parse failure separately.
    return {};
  }
}

async function isRegularFile(
  candidatePath: string,
): Promise<boolean> {
  try {
    const stats = await lstat(candidatePath);
    return stats.isFile() && !stats.isSymbolicLink();
  } catch {
    return false;
  }
}

async function listRealDirectories(
  directoryPath: string,
): Promise<string[]> {
  let entries;

  try {
    entries = await readdir(directoryPath, {
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
        numeric: true,
      }),
    );
}

async function scanExpectedMetadataFiles(
  mediaRoot: string,
  directoryPath: string,
  filenames: readonly string[],
): Promise<MetadataFileStatus[]> {
  return Promise.all(
    filenames.map(async (filename) => {
      const filePath = assertPathWithinRoot(
        mediaRoot,
        path.join(directoryPath, filename),
      );

      return {
        filename,
        relativePath: toLibraryRelativePath(
          mediaRoot,
          filePath,
        ),
        exists: await isRegularFile(filePath),
      };
    }),
  );
}

async function walkFiles(
  mediaRoot: string,
  startPath: string,
): Promise<string[]> {
  const confinedStart = assertPathWithinRoot(
    mediaRoot,
    startPath,
  );

  let entries;

  try {
    entries = await readdir(confinedStart, {
      withFileTypes: true,
    });
  } catch {
    return [];
  }

  const discoveredFiles: string[] = [];

  for (const entry of entries) {
    // Symlinks are not followed, preventing traversal outside the library.
    if (entry.isSymbolicLink()) {
      continue;
    }

    const entryPath = assertPathWithinRoot(
      mediaRoot,
      path.join(confinedStart, entry.name),
    );

    if (entry.isDirectory()) {
      discoveredFiles.push(
        ...(await walkFiles(mediaRoot, entryPath)),
      );
      continue;
    }

    if (entry.isFile()) {
      discoveredFiles.push(entryPath);
    }
  }

  return discoveredFiles;
}

function toDiscoveredAsset(
  mediaRoot: string,
  filePath: string,
): DiscoveredAsset {
  return {
    filename: path.basename(filePath),
    relativePath: toLibraryRelativePath(
      mediaRoot,
      filePath,
    ),
    extension: path.extname(filePath).toLowerCase(),
  };
}

function matchesMasterAsset(
  filePath: string,
  baseName: string,
  extensions: ReadonlySet<string>,
): boolean {
  const filename = path.basename(filePath);
  const extension = path.extname(filename).toLowerCase();
  const filenameWithoutExtension = path.basename(
    filename,
    extension,
  );

  return (
    filenameWithoutExtension.toLowerCase() === baseName &&
    extensions.has(extension)
  );
}

async function scanTrack(
  mediaRoot: string,
  trackPath: string,
): Promise<TrackScanResult> {
  const files = await walkFiles(mediaRoot, trackPath);

  return {
    id: path.basename(trackPath),
    relativePath: toLibraryRelativePath(
      mediaRoot,
      trackPath,
    ),
    metadataFiles: await scanExpectedMetadataFiles(
      mediaRoot,
      trackPath,
      trackMetadataFiles,
    ),
    audioMasters: files
      .filter((filePath) =>
        matchesMasterAsset(
          filePath,
          "audio-master",
          audioAssetExtensions,
        ),
      )
      .map((filePath) =>
        toDiscoveredAsset(mediaRoot, filePath),
      ),
    playbackAudio: files
      .filter((filePath) =>
        matchesMasterAsset(
          filePath,
          "audio-playback",
          audioAssetExtensions,
        ),
      )
      .map((filePath) =>
        toDiscoveredAsset(mediaRoot, filePath),
      ),
    artworkMasters: files
      .filter((filePath) =>
        matchesMasterAsset(
          filePath,
          "artwork-master",
          artworkMasterExtensions,
        ),
      )
      .map((filePath) =>
        toDiscoveredAsset(mediaRoot, filePath),
      ),
  };
}

async function scanVideo(
  mediaRoot: string,
  videoPath: string,
): Promise<VideoScanResult> {
  const files = await walkFiles(mediaRoot, videoPath);
  const metadataFiles = await scanExpectedMetadataFiles(
    mediaRoot,
    videoPath,
    videoMetadataFiles,
  );
  const identity = await readVideoLibraryIdentity(
    mediaRoot,
    videoPath,
    metadataFiles,
  );

  return {
    id: path.basename(videoPath),
    relativePath: toLibraryRelativePath(
      mediaRoot,
      videoPath,
    ),
    ...identity,
    metadataFiles,
    videoMasters: files
      .filter((filePath) =>
        matchesMasterAsset(
          filePath,
          "video-master",
          videoAssetExtensions,
        ),
      )
      .map((filePath) =>
        toDiscoveredAsset(mediaRoot, filePath),
      ),
  };
}

async function scanRelease(
  mediaRoot: string,
  releasePath: string,
): Promise<ReleaseScanResult> {
  const tracksPath = assertPathWithinRoot(
    mediaRoot,
    path.join(releasePath, "tracks"),
  );
  const videosPath = assertPathWithinRoot(
    mediaRoot,
    path.join(releasePath, "videos"),
  );

  const trackDirectoryNames =
    await listRealDirectories(tracksPath);
  const videoDirectoryNames =
    await listRealDirectories(videosPath);

  const releaseFiles = await walkFiles(
    mediaRoot,
    assertPathWithinRoot(
      mediaRoot,
      path.join(releasePath, "artwork"),
    ),
  );

  const metadataFiles =
    await scanExpectedMetadataFiles(
      mediaRoot,
      releasePath,
      releaseMetadataFiles,
    );
  const releaseIdentity =
    await readReleaseLibraryIdentity(
      mediaRoot,
      releasePath,
      metadataFiles,
    );
  const videos = await Promise.all(
    videoDirectoryNames.map((videoDirectoryName) =>
      scanVideo(
        mediaRoot,
        assertPathWithinRoot(
          mediaRoot,
          path.join(
            videosPath,
            videoDirectoryName,
          ),
        ),
      ),
    ),
  );

  videos.sort((left, right) => {
    const leftOrder =
      left.displayOrder ?? Number.MAX_SAFE_INTEGER;
    const rightOrder =
      right.displayOrder ?? Number.MAX_SAFE_INTEGER;

    return (
      leftOrder - rightOrder ||
      (left.title ?? left.id).localeCompare(
        right.title ?? right.id,
      ) ||
      left.id.localeCompare(right.id)
    );
  });

  return {
    id: path.basename(releasePath),
    relativePath: toLibraryRelativePath(
      mediaRoot,
      releasePath,
    ),
    ...releaseIdentity,
    metadataFiles,
    artworkMasters: releaseFiles
      .filter((filePath) =>
        matchesMasterAsset(
          filePath,
          "artwork-master",
          artworkMasterExtensions,
        ),
      )
      .map((filePath) =>
        toDiscoveredAsset(mediaRoot, filePath),
      ),
    tracks: await Promise.all(
      trackDirectoryNames.map((trackDirectoryName) =>
        scanTrack(
          mediaRoot,
          assertPathWithinRoot(
            mediaRoot,
            path.join(
              tracksPath,
              trackDirectoryName,
            ),
          ),
        ),
      ),
    ),
    videos,
  };
}

function buildScannerWarnings(
  releases: ReleaseScanResult[],
): string[] {
  const warnings: string[] = [];

  for (const release of releases) {
    if (release.tracks.length === 0) {
      warnings.push(
        `${release.relativePath}: no track directories detected`,
      );
    }

    const primaryReleaseArtworkMasters =
      release.artworkMasters.filter((artwork) =>
        isPrimaryArtworkMasterForOwner(
          release.relativePath,
          artwork,
        ),
      );

    if (primaryReleaseArtworkMasters.length > 1) {
      const preferred = selectPreferredArtworkCandidate(
        primaryReleaseArtworkMasters,
      );

      warnings.push(
        preferred
          ? `${release.relativePath}: multiple release artwork masters detected; suggested ${preferred.filename} (${describeArtworkPreference(preferred)})`
          : `${release.relativePath}: multiple release artwork masters detected`,
      );
    }

    const trackIds = new Set(
      release.tracks.map((track) => track.id),
    );
    const videoOrderCounts = new Map<number, number>();

    for (const video of release.videos ?? []) {
      if (video.displayOrder !== undefined) {
        videoOrderCounts.set(
          video.displayOrder,
          (videoOrderCounts.get(video.displayOrder) ?? 0) + 1,
        );
      }
    }

    for (const [displayOrder, count] of videoOrderCounts) {
      if (count > 1) {
        warnings.push(
          `${release.relativePath}: video display order ${displayOrder} is used by ${count} videos`,
        );
      }
    }

    for (const video of release.videos ?? []) {
      const videoMetadata = video.metadataFiles.find(
        (file) => file.filename === "video.toml",
      );

      if (!videoMetadata?.exists) {
        warnings.push(
          `${video.relativePath}: video.toml is missing`,
        );
      }

      if (video.videoMasters.length === 0) {
        warnings.push(
          `${video.relativePath}: no video master detected`,
        );
      }

      if (video.videoMasters.length > 1) {
        warnings.push(
          `${video.relativePath}: multiple video masters detected`,
        );
      }

      if (
        video.masterPath &&
        video.videoMasters.length === 1 &&
        video.videoMasters[0]?.filename !== video.masterPath
      ) {
        warnings.push(
          `${video.relativePath}: video.toml master_path ${video.masterPath} does not match ${video.videoMasters[0]?.filename}`,
        );
      }

      if (
        video.relatedTrackId &&
        !trackIds.has(video.relatedTrackId)
      ) {
        warnings.push(
          `${video.relativePath}: related track ${video.relatedTrackId} was not found in this release`,
        );
      }
    }

    for (const track of release.tracks) {
      if (track.audioMasters.length === 0) {
        warnings.push(
          `${track.relativePath}: no audio master detected`,
        );
      }

      if (track.audioMasters.length > 1) {
        warnings.push(
          `${track.relativePath}: multiple audio masters detected`,
        );
      }

      if ((track.playbackAudio?.length ?? 0) > 1) {
        warnings.push(
          `${track.relativePath}: multiple playback audio files detected`,
        );
      }

      const primaryTrackArtworkMasters =
        track.artworkMasters.filter((artwork) =>
          isPrimaryArtworkMasterForOwner(
            track.relativePath,
            artwork,
          ),
        );

      if (primaryTrackArtworkMasters.length > 1) {
        const preferred = selectPreferredArtworkCandidate(
          primaryTrackArtworkMasters,
        );

        warnings.push(
          preferred
            ? `${track.relativePath}: multiple track artwork masters detected; suggested ${preferred.filename} (${describeArtworkPreference(preferred)})`
            : `${track.relativePath}: multiple track artwork masters detected`,
        );
      }
    }
  }

  return warnings;
}

export async function scanMediaLibrary(
  mediaRoot: string,
): Promise<LibraryScanResult> {
  const releasesRoot = assertPathWithinRoot(
    mediaRoot,
    path.join(mediaRoot, "releases"),
  );

  const releaseDirectoryNames =
    await listRealDirectories(releasesRoot);

  const releases = await Promise.all(
    releaseDirectoryNames.map((releaseDirectoryName) =>
      scanRelease(
        mediaRoot,
        assertPathWithinRoot(
          mediaRoot,
          path.join(
            releasesRoot,
            releaseDirectoryName,
          ),
        ),
      ),
    ),
  );

  return {
    // This is currently a local administrative API response.
    // The public audio player must never receive this absolute path.
    mediaRoot,
    releasesRoot,
    scannedAt: new Date().toISOString(),
    releases,
    warnings: buildScannerWarnings(releases),
  };
}

export async function scanReleaseById(
  mediaRoot: string,
  releaseId: string,
): Promise<ReleaseScanResult | null> {
  const library = await scanMediaLibrary(mediaRoot);

  return (
    library.releases.find(
      (release) => release.id === releaseId,
    ) ?? null
  );
}

