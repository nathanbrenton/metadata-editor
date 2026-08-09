import {
  createHash,
} from "node:crypto";
import {
  lstat,
  readFile,
  readdir,
} from "node:fs/promises";
import path from "node:path";

import {
  assertPathWithinRoot,
} from "../media-root.js";
import type {
  FfmpegCapabilities,
} from "../types.js";
import type {
  MediaProcessingPlan,
  MediaProcessingTrackPlan,
} from "./types.js";

export const WEB_STREAM_PROFILE_VERSION = 1;
export const WEB_STREAM_DIRECTORY = "stream";
export const WEB_STREAM_PLAYLIST_FILENAME = "index.m3u8";
export const WEB_STREAM_INIT_FILENAME = "init.mp4";
export const WEB_STREAM_INFO_FILENAME = "stream-info.json";
export const WEB_STREAM_SEGMENT_PATTERN = "segment-%05d.m4s";
export const WEB_STREAM_SEGMENT_DURATION_SECONDS = 3;
export const WEB_STREAM_BITRATE_KBPS = 192;

export type WebStreamProfile = {
  version: number;
  protocol: "hls";
  codec: "aac";
  codecProfile: "aac_low";
  bitrateKbps: number;
  channels: 2;
  sampleRatePolicy: "preserve-source";
  playlistType: "vod";
  segmentType: "fmp4";
  segmentDurationSeconds: number;
  playlistFilename: string;
  initFilename: string;
  segmentPattern: string;
};

export type WebStreamStatus =
  | "current"
  | "missing"
  | "stale"
  | "blocked";

export type WebStreamAction =
  | "none"
  | "create"
  | "replace"
  | "blocked";

export type WebStreamFile = {
  kind: "manifest" | "initialization" | "segment";
  filename: string;
  relativePath: string;
  sizeBytes: number;
};

export type WebStreamTrackPlan = {
  trackId: string;
  trackRelativePath: string;
  directoryRelativePath: string;
  manifestRelativePath: string;
  profileInfoRelativePath: string;
  status: WebStreamStatus;
  action: WebStreamAction;
  reason: string;
  files: WebStreamFile[];
  checks: string[];
};

export type WebStreamPlanSummary = {
  trackCount: number;
  currentCount: number;
  createCount: number;
  replaceCount: number;
  blockedCount: number;
};

export type WebStreamPlan = {
  profile: WebStreamProfile & { sha256: string };
  items: WebStreamTrackPlan[];
  summary: WebStreamPlanSummary;
};

export type WebStreamInfo = {
  schema: {
    name: "metadata-editor-web-stream";
    version: 1;
  };
  trackId: string;
  generatedAt: string;
  source: {
    relativePath: string;
    modifiedAt: string;
  };
  profile: WebStreamProfile & { sha256: string };
};

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

function isMissingFileError(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "ENOENT",
  );
}

export function buildWebStreamProfile(): WebStreamProfile {
  return {
    version: WEB_STREAM_PROFILE_VERSION,
    protocol: "hls",
    codec: "aac",
    codecProfile: "aac_low",
    bitrateKbps: WEB_STREAM_BITRATE_KBPS,
    channels: 2,
    sampleRatePolicy: "preserve-source",
    playlistType: "vod",
    segmentType: "fmp4",
    segmentDurationSeconds:
      WEB_STREAM_SEGMENT_DURATION_SECONDS,
    playlistFilename: WEB_STREAM_PLAYLIST_FILENAME,
    initFilename: WEB_STREAM_INIT_FILENAME,
    segmentPattern: WEB_STREAM_SEGMENT_PATTERN,
  };
}

export function hashWebStreamProfile(
  profile: WebStreamProfile,
): string {
  return createHash("sha256")
    .update(JSON.stringify(profile))
    .digest("hex");
}

export function buildWebStreamFfmpegArgs(
  inputPath: string,
  outputDirectory: string,
  profile = buildWebStreamProfile(),
): string[] {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    "-i",
    inputPath,
    "-map",
    "0:a:0",
    "-vn",
    "-map_metadata",
    "-1",
    "-map_chapters",
    "-1",
    "-c:a",
    "aac",
    "-profile:a",
    profile.codecProfile,
    "-b:a",
    `${profile.bitrateKbps}k`,
    "-ac",
    String(profile.channels),
    "-f",
    "hls",
    "-hls_time",
    String(profile.segmentDurationSeconds),
    "-hls_playlist_type",
    profile.playlistType,
    "-hls_list_size",
    "0",
    "-hls_segment_type",
    profile.segmentType,
    "-hls_fmp4_init_filename",
    profile.initFilename,
    "-start_number",
    "1",
    "-hls_segment_filename",
    path.join(outputDirectory, profile.segmentPattern),
    "-y",
    path.join(outputDirectory, profile.playlistFilename),
  ];
}

function parsePlaylistUris(content: string): string[] {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines[0] !== "#EXTM3U") {
    throw new Error("HLS playlist is missing #EXTM3U.");
  }

  const mapLine = lines.find((line) =>
    line.startsWith("#EXT-X-MAP:"),
  );
  if (
    !mapLine ||
    !mapLine.includes(`URI=\"${WEB_STREAM_INIT_FILENAME}\"`)
  ) {
    throw new Error(
      `HLS playlist must reference ${WEB_STREAM_INIT_FILENAME}.`,
    );
  }

  if (!lines.includes("#EXT-X-ENDLIST")) {
    throw new Error("HLS VOD playlist is missing #EXT-X-ENDLIST.");
  }

  const segments = lines.filter(
    (line) => !line.startsWith("#"),
  );

  if (segments.length === 0) {
    throw new Error("HLS playlist does not reference any media segments.");
  }

  for (const segment of segments) {
    if (!/^segment-\d{5}\.m4s$/.test(segment)) {
      throw new Error(
        `HLS playlist contains an unsafe or unexpected segment URI: ${segment}`,
      );
    }
  }

  return segments;
}

async function inspectRegularFile(
  root: string,
  relativePath: string,
): Promise<{ sizeBytes: number; modifiedAtMs: number }> {
  const absolutePath = rootPath(root, relativePath);
  const stats = await lstat(absolutePath);

  if (stats.isSymbolicLink() || !stats.isFile() || stats.size === 0) {
    throw new Error(
      `Expected a non-empty regular HLS file: ${relativePath}`,
    );
  }

  return {
    sizeBytes: stats.size,
    modifiedAtMs: stats.mtimeMs,
  };
}

export async function inspectWebStreamDirectory(
  root: string,
  directoryRelativePath: string,
): Promise<{
  files: WebStreamFile[];
  playlist: string;
}> {
  const directoryPath = rootPath(
    root,
    directoryRelativePath,
  );
  const directoryStats = await lstat(directoryPath);

  if (
    directoryStats.isSymbolicLink() ||
    !directoryStats.isDirectory()
  ) {
    throw new Error(
      `Web stream path is not a regular directory: ${directoryRelativePath}`,
    );
  }

  const playlistRelativePath = path.posix.join(
    directoryRelativePath,
    WEB_STREAM_PLAYLIST_FILENAME,
  );
  const playlist = await readFile(
    rootPath(root, playlistRelativePath),
    "utf8",
  );
  const segmentFilenames = parsePlaylistUris(playlist);
  const expectedNames = new Set([
    WEB_STREAM_PLAYLIST_FILENAME,
    WEB_STREAM_INIT_FILENAME,
    WEB_STREAM_INFO_FILENAME,
    ...segmentFilenames,
  ]);
  const entries = await readdir(directoryPath, {
    withFileTypes: true,
  });

  for (const entry of entries) {
    if (!expectedNames.has(entry.name)) {
      throw new Error(
        `Web stream directory contains an unexpected file: ${entry.name}`,
      );
    }

    if (!entry.isFile()) {
      throw new Error(
        `Web stream directory contains a non-file entry: ${entry.name}`,
      );
    }
  }

  const files: WebStreamFile[] = [];
  for (const [kind, filename] of [
    ["manifest", WEB_STREAM_PLAYLIST_FILENAME],
    ["initialization", WEB_STREAM_INIT_FILENAME],
    ...segmentFilenames.map(
      (filename) => ["segment", filename] as const,
    ),
  ] as const) {
    const relativePath = path.posix.join(
      directoryRelativePath,
      filename,
    );
    const inspection = await inspectRegularFile(
      root,
      relativePath,
    );
    files.push({
      kind,
      filename,
      relativePath,
      sizeBytes: inspection.sizeBytes,
    });
  }

  return { files, playlist };
}

function aacEncoderReady(
  capabilities: FfmpegCapabilities,
): boolean {
  return Boolean(
    capabilities.available &&
    capabilities.encoders.some(
      (encoder) => encoder === "aac",
    ),
  );
}

function streamRelativePath(
  track: MediaProcessingTrackPlan,
): string {
  return path.posix.join(
    track.trackRelativePath.replaceAll("\\", "/"),
    WEB_STREAM_DIRECTORY,
  );
}

async function buildTrackWebStreamPlan(
  mediaRoot: string,
  track: MediaProcessingTrackPlan,
  capabilities: FfmpegCapabilities,
  profile: WebStreamProfile & { sha256: string },
): Promise<WebStreamTrackPlan> {
  const directoryRelativePath = streamRelativePath(track);
  const manifestRelativePath = path.posix.join(
    directoryRelativePath,
    WEB_STREAM_PLAYLIST_FILENAME,
  );
  const profileInfoRelativePath = path.posix.join(
    directoryRelativePath,
    WEB_STREAM_INFO_FILENAME,
  );

  if (
    track.master.status !== "ready" ||
    !track.master.relativePath ||
    !track.master.modifiedAt
  ) {
    return {
      trackId: track.trackId,
      trackRelativePath: track.trackRelativePath,
      directoryRelativePath,
      manifestRelativePath,
      profileInfoRelativePath,
      status: "blocked",
      action: "blocked",
      reason:
        "Web-stream generation requires one usable canonical audio source.",
      files: [],
      checks: ["Canonical audio source is not ready."],
    };
  }

  if (!aacEncoderReady(capabilities)) {
    return {
      trackId: track.trackId,
      trackRelativePath: track.trackRelativePath,
      directoryRelativePath,
      manifestRelativePath,
      profileInfoRelativePath,
      status: "blocked",
      action: "blocked",
      reason:
        "FFmpeg does not expose the AAC encoder required by the web-stream profile.",
      files: [],
      checks: [
        capabilities.error ??
        "FFmpeg AAC encoder is unavailable.",
      ],
    };
  }

  try {
    const directoryStats = await lstat(
      rootPath(mediaRoot, directoryRelativePath),
    );

    if (
      directoryStats.isSymbolicLink() ||
      !directoryStats.isDirectory()
    ) {
      return {
        trackId: track.trackId,
        trackRelativePath: track.trackRelativePath,
        directoryRelativePath,
        manifestRelativePath,
        profileInfoRelativePath,
        status: "blocked",
        action: "blocked",
        reason:
          "The web-stream target exists but is not a regular directory.",
        files: [],
        checks: [
          "Remove or repair the unsafe stream target before preparing media.",
        ],
      };
    }
  } catch (error) {
    if (isMissingFileError(error)) {
      return {
        trackId: track.trackId,
        trackRelativePath: track.trackRelativePath,
        directoryRelativePath,
        manifestRelativePath,
        profileInfoRelativePath,
        status: "missing",
        action: "create",
        reason: "HLS web-stream derivative is missing.",
        files: [],
        checks: [
          "Prepare release will generate a segmented AAC-LC HLS stream.",
        ],
      };
    }
    throw error;
  }

  try {
    const inspected = await inspectWebStreamDirectory(
      mediaRoot,
      directoryRelativePath,
    );
    const info = JSON.parse(
      await readFile(
        rootPath(mediaRoot, profileInfoRelativePath),
        "utf8",
      ),
    ) as Partial<WebStreamInfo>;
    const sourceMatches = Boolean(
      info.source &&
      info.source.relativePath === track.master.relativePath &&
      info.source.modifiedAt === track.master.modifiedAt,
    );
    const profileMatches = Boolean(
      info.profile &&
      info.profile.sha256 === profile.sha256,
    );

    if (!sourceMatches || !profileMatches) {
      return {
        trackId: track.trackId,
        trackRelativePath: track.trackRelativePath,
        directoryRelativePath,
        manifestRelativePath,
        profileInfoRelativePath,
        status: "stale",
        action: "replace",
        reason:
          "HLS web stream was generated from an older source or media profile.",
        files: inspected.files,
        checks: [
          sourceMatches
            ? "Canonical source identity matches."
            : "Canonical source identity changed.",
          profileMatches
            ? "HLS generation profile matches."
            : "HLS generation profile changed.",
        ],
      };
    }

    return {
      trackId: track.trackId,
      trackRelativePath: track.trackRelativePath,
      directoryRelativePath,
      manifestRelativePath,
      profileInfoRelativePath,
      status: "current",
      action: "none",
      reason: "HLS web stream is current.",
      files: inspected.files,
      checks: [
        `Validated ${inspected.files.length - 2} HLS media segments plus manifest and initialization segment.`,
      ],
    };
  } catch (error) {
    return {
      trackId: track.trackId,
      trackRelativePath: track.trackRelativePath,
      directoryRelativePath,
      manifestRelativePath,
      profileInfoRelativePath,
      status: "stale",
      action: "replace",
      reason:
        "Existing web-stream directory is incomplete or does not match the HLS contract.",
      files: [],
      checks: [
        error instanceof Error
          ? error.message
          : "Unable to validate the existing HLS web stream.",
      ],
    };
  }
}

export async function buildWebStreamPlan(
  mediaRoot: string,
  mediaPlan: MediaProcessingPlan,
  capabilities: FfmpegCapabilities,
): Promise<WebStreamPlan> {
  const profileBase = buildWebStreamProfile();
  const profile = {
    ...profileBase,
    sha256: hashWebStreamProfile(profileBase),
  };
  const items = await Promise.all(
    mediaPlan.items.map((track) =>
      buildTrackWebStreamPlan(
        mediaRoot,
        track,
        capabilities,
        profile,
      ),
    ),
  );

  return {
    profile,
    items,
    summary: {
      trackCount: items.length,
      currentCount: items.filter(
        (item) => item.action === "none",
      ).length,
      createCount: items.filter(
        (item) => item.action === "create",
      ).length,
      replaceCount: items.filter(
        (item) => item.action === "replace",
      ).length,
      blockedCount: items.filter(
        (item) => item.action === "blocked",
      ).length,
    },
  };
}

export function buildWebStreamInfo(
  track: MediaProcessingTrackPlan,
  profile: WebStreamPlan["profile"],
  generatedAt: string,
): WebStreamInfo {
  if (!track.master.relativePath || !track.master.modifiedAt) {
    throw new Error(
      `Track ${track.trackId} does not have one resolved canonical source.`,
    );
  }

  return {
    schema: {
      name: "metadata-editor-web-stream",
      version: 1,
    },
    trackId: track.trackId,
    generatedAt,
    source: {
      relativePath: track.master.relativePath,
      modifiedAt: track.master.modifiedAt,
    },
    profile,
  };
}
