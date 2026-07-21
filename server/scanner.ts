import {
  lstat,
  readdir,
} from "node:fs/promises";
import path from "node:path";

import {
  assertPathWithinRoot,
  toLibraryRelativePath,
} from "./media-root.js";
import type {
  DiscoveredAsset,
  LibraryScanResult,
  MetadataFileStatus,
  ReleaseScanResult,
  TrackScanResult,
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

const audioAssetExtensions = new Set([
  ".aac",
  ".aif",
  ".aiff",
  ".alac",
  ".ape",
  ".au",
  ".caf",
  ".dff",
  ".dsf",
  ".flac",
  ".m4a",
  ".mka",
  ".mp3",
  ".ogg",
  ".opus",
  ".snd",
  ".tta",
  ".wav",
  ".wave",
  ".wma",
  ".wv",
]);

const artworkMasterExtensions = new Set([
  ".avif",
  ".gif",
  ".jpeg",
  ".jpg",
  ".png",
  ".tif",
  ".tiff",
  ".webp",
]);

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
        !entry.isSymbolicLink(),
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

async function scanRelease(
  mediaRoot: string,
  releasePath: string,
): Promise<ReleaseScanResult> {
  const tracksPath = assertPathWithinRoot(
    mediaRoot,
    path.join(releasePath, "tracks"),
  );

  const trackDirectoryNames =
    await listRealDirectories(tracksPath);

  const releaseFiles = await walkFiles(
    mediaRoot,
    assertPathWithinRoot(
      mediaRoot,
      path.join(releasePath, "artwork"),
    ),
  );

  return {
    id: path.basename(releasePath),
    relativePath: toLibraryRelativePath(
      mediaRoot,
      releasePath,
    ),
    metadataFiles: await scanExpectedMetadataFiles(
      mediaRoot,
      releasePath,
      releaseMetadataFiles,
    ),
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

    if (release.artworkMasters.length > 1) {
      warnings.push(
        `${release.relativePath}: multiple release artwork masters detected`,
      );
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

      if (track.artworkMasters.length > 1) {
        warnings.push(
          `${track.relativePath}: multiple track artwork masters detected`,
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

