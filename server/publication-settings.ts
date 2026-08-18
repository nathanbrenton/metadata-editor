import {
  constants,
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  unlink,
} from "node:fs/promises";
import {
  createHash,
  randomUUID,
} from "node:crypto";
import path from "node:path";
import {
  parse,
  stringify,
} from "smol-toml";

import {
  assertPathWithinRoot,
  toLibraryRelativePath,
} from "./media-root.js";
import {
  decodeUtf8Strict,
  encodeUtf8WithoutBom,
} from "./unicode-integrity.js";
import type {
  ReleaseScanResult,
} from "./types.js";

type TomlDocument = Record<string, unknown>;

export type PublicTrackSelectionMode =
  | "all"
  | "selected";

export type ReleasePublicationSettingsIssue = {
  code: string;
  relativePath: string;
  message: string;
};

export type ReleasePublicationSettings = {
  relativePath: string;
  exists: boolean;
  sha256?: string;
  includeVideo: boolean;
  trackSelectionMode: PublicTrackSelectionMode;
  includedTrackIds: string[];
  issues: ReleasePublicationSettingsIssue[];
};

export type SaveReleasePublicationSettingsInput = {
  includeVideo: boolean;
  includedTrackIds: string[];
  expectedSha256?: string;
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

function sha256(
  value: Uint8Array | string,
): string {
  return createHash("sha256")
    .update(value)
    .digest("hex");
}

function settingsRelativePath(
  release: ReleaseScanResult,
): string {
  return path.posix.join(
    release.relativePath,
    "release-settings.toml",
  );
}

function settingsAbsolutePath(
  mediaRoot: string,
  release: ReleaseScanResult,
): string {
  return assertPathWithinRoot(
    mediaRoot,
    path.resolve(
      mediaRoot,
      ...settingsRelativePath(release).split("/"),
    ),
  );
}

function missingFileError(
  error: unknown,
): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

async function readExistingSettings(
  mediaRoot: string,
  release: ReleaseScanResult,
): Promise<{
  relativePath: string;
  absolutePath: string;
  exists: boolean;
  bytes?: Buffer;
  parsed?: TomlDocument;
}> {
  const absolutePath = settingsAbsolutePath(
    mediaRoot,
    release,
  );
  const relativePath = toLibraryRelativePath(
    mediaRoot,
    absolutePath,
  );

  try {
    const stats = await lstat(absolutePath);

    if (stats.isSymbolicLink() || !stats.isFile()) {
      throw new Error(
        `Release settings must be a regular non-symbolic file: ${relativePath}`,
      );
    }

    const canonicalPath = await realpath(absolutePath);
    assertPathWithinRoot(mediaRoot, canonicalPath);
    const bytes = await readFile(canonicalPath);
    const text = decodeUtf8Strict(bytes, {
      context: relativePath,
    });
    const parsed = parse(text);

    if (!isRecord(parsed)) {
      throw new Error(
        `Release settings must contain a TOML document: ${relativePath}`,
      );
    }

    return {
      relativePath,
      absolutePath,
      exists: true,
      bytes,
      parsed,
    };
  } catch (error) {
    if (missingFileError(error)) {
      return {
        relativePath,
        absolutePath,
        exists: false,
      };
    }

    throw error;
  }
}

function publicationTable(
  parsed: TomlDocument | undefined,
): unknown {
  if (!parsed || !isRecord(parsed.settings)) {
    return undefined;
  }

  return parsed.settings.publication;
}

export async function readReleasePublicationSettings(
  mediaRoot: string,
  release: ReleaseScanResult,
): Promise<ReleasePublicationSettings> {
  const existing = await readExistingSettings(
    mediaRoot,
    release,
  );
  const issues: ReleasePublicationSettingsIssue[] = [];
  const canonicalTrackIds = release.tracks.map(
    (track) => track.id,
  );
  const canonicalTrackIdSet = new Set(
    canonicalTrackIds,
  );
  const publication = publicationTable(existing.parsed);
  let includeVideo = false;
  let trackSelectionMode: PublicTrackSelectionMode = "all";
  let includedTrackIds = [...canonicalTrackIds];

  if (publication !== undefined) {
    if (!isRecord(publication)) {
      issues.push({
        code: "publication-settings-invalid-table",
        relativePath: existing.relativePath,
        message:
          "settings.publication must be a TOML table.",
      });
    } else {
      if (publication.include_video !== undefined) {
        if (typeof publication.include_video === "boolean") {
          includeVideo = publication.include_video;
        } else {
          issues.push({
            code: "publication-settings-invalid-video-toggle",
            relativePath: existing.relativePath,
            message:
              "settings.publication.include_video must be true or false.",
          });
        }
      }

      if (publication.included_track_ids !== undefined) {
        trackSelectionMode = "selected";

        if (!Array.isArray(publication.included_track_ids)) {
          includedTrackIds = [];
          issues.push({
            code: "publication-settings-invalid-track-list",
            relativePath: existing.relativePath,
            message:
              "settings.publication.included_track_ids must be an array of track IDs.",
          });
        } else {
          const requested = publication.included_track_ids;
          const seen = new Set<string>();
          const selected = new Set<string>();

          for (const value of requested) {
            if (
              typeof value !== "string" ||
              value.trim() === ""
            ) {
              issues.push({
                code: "publication-settings-invalid-track-id",
                relativePath: existing.relativePath,
                message:
                  "settings.publication.included_track_ids may contain only non-empty track ID strings.",
              });
              continue;
            }

            if (seen.has(value)) {
              issues.push({
                code: "publication-settings-duplicate-track-id",
                relativePath: existing.relativePath,
                message:
                  `Track ${value} is listed more than once in settings.publication.included_track_ids.`,
              });
              continue;
            }
            seen.add(value);

            if (!canonicalTrackIdSet.has(value)) {
              issues.push({
                code: "publication-settings-unknown-track-id",
                relativePath: existing.relativePath,
                message:
                  `Track ${value} is not a canonical member of release ${release.id}.`,
              });
              continue;
            }

            selected.add(value);
          }

          includedTrackIds = canonicalTrackIds.filter(
            (trackId) => selected.has(trackId),
          );
        }
      }
    }
  }

  return {
    relativePath: existing.relativePath,
    exists: existing.exists,
    ...(existing.bytes
      ? { sha256: sha256(existing.bytes) }
      : {}),
    includeVideo,
    trackSelectionMode,
    includedTrackIds,
    issues,
  };
}

function newSettingsDocument(
  release: ReleaseScanResult,
): TomlDocument {
  return {
    schema: {
      name: "audio-release-settings",
      version: 1,
    },
    release_reference: {
      release_id: release.id,
    },
    settings: {},
  };
}

function buildBackupFilename(
  filename: string,
): string {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-");

  return `${filename}.${timestamp}.bak`;
}

export async function saveReleasePublicationSettings(
  mediaRoot: string,
  release: ReleaseScanResult,
  input: SaveReleasePublicationSettingsInput,
): Promise<ReleasePublicationSettings> {
  if (typeof input.includeVideo !== "boolean") {
    throw new Error("includeVideo must be true or false.");
  }

  const canonicalTrackIds = release.tracks.map(
    (track) => track.id,
  );
  const canonicalTrackIdSet = new Set(canonicalTrackIds);
  const requestedTrackIds = input.includedTrackIds;

  if (!Array.isArray(requestedTrackIds)) {
    throw new Error("includedTrackIds must be an array.");
  }

  const requestedSet = new Set<string>();
  for (const trackId of requestedTrackIds) {
    if (
      typeof trackId !== "string" ||
      trackId.trim() === ""
    ) {
      throw new Error(
        "includedTrackIds may contain only non-empty track ID strings.",
      );
    }
    if (requestedSet.has(trackId)) {
      throw new Error(
        `includedTrackIds contains duplicate track ${trackId}.`,
      );
    }
    if (!canonicalTrackIdSet.has(trackId)) {
      throw new Error(
        `Track ${trackId} is not a canonical member of release ${release.id}.`,
      );
    }
    requestedSet.add(trackId);
  }

  if (requestedSet.size === 0) {
    throw new Error(
      "At least one public track must be selected before a release can be published.",
    );
  }

  const orderedTrackIds = canonicalTrackIds.filter(
    (trackId) => requestedSet.has(trackId),
  );
  const existing = await readExistingSettings(
    mediaRoot,
    release,
  );

  if (existing.exists) {
    if (
      !input.expectedSha256 ||
      !/^[a-f0-9]{64}$/.test(input.expectedSha256)
    ) {
      throw new Error(
        "Saving existing release publication settings requires expectedSha256.",
      );
    }

    const currentSha256 = sha256(existing.bytes!);
    if (currentSha256 !== input.expectedSha256) {
      throw new Error(
        "Release publication settings changed after they were loaded. Refresh and try again.",
      );
    }
  } else if (input.expectedSha256) {
    throw new Error(
      "Release publication settings were created after they were loaded. Refresh and try again.",
    );
  }

  const document: TomlDocument = existing.parsed
    ? { ...existing.parsed }
    : newSettingsDocument(release);
  const settings = isRecord(document.settings)
    ? { ...document.settings }
    : {};
  settings.publication = {
    include_video: input.includeVideo,
    included_track_ids: orderedTrackIds,
  };
  document.settings = settings;

  const content = `${stringify(document).trimEnd()}\n`;
  parse(content);
  const bytes = encodeUtf8WithoutBom(
    content,
    existing.relativePath,
  );
  const directory = path.dirname(existing.absolutePath);
  await mkdir(directory, { recursive: true });

  const tempPath = assertPathWithinRoot(
    mediaRoot,
    path.join(
      directory,
      `.${path.basename(existing.absolutePath)}.${randomUUID()}.tmp`,
    ),
  );
  const tempHandle = await open(
    tempPath,
    constants.O_WRONLY |
      constants.O_CREAT |
      constants.O_EXCL,
    0o600,
  );

  try {
    await tempHandle.writeFile(bytes);
    await tempHandle.sync();
  } finally {
    await tempHandle.close();
  }

  let backupPath: string | undefined;
  try {
    if (existing.exists) {
      const latestBytes = await readFile(existing.absolutePath);
      if (sha256(latestBytes) !== input.expectedSha256) {
        throw new Error(
          "Release publication settings changed during save. Refresh and try again.",
        );
      }

      const backupDirectory = assertPathWithinRoot(
        mediaRoot,
        path.join(directory, ".metadata-backups"),
      );
      await mkdir(backupDirectory, { recursive: true });
      backupPath = assertPathWithinRoot(
        mediaRoot,
        path.join(
          backupDirectory,
          buildBackupFilename(
            path.basename(existing.absolutePath),
          ),
        ),
      );
      await copyFile(
        existing.absolutePath,
        backupPath,
        constants.COPYFILE_EXCL,
      );
    }

    await rename(tempPath, existing.absolutePath);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    if (backupPath) {
      await unlink(backupPath).catch(() => undefined);
    }
    throw error;
  }

  return readReleasePublicationSettings(
    mediaRoot,
    release,
  );
}
