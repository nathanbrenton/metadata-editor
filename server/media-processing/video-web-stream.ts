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
  ReleaseScanResult,
  VideoScanResult,
} from "../types.js";

export const VIDEO_WEB_STREAM_PROFILE_VERSION = 3;
export const VIDEO_WEB_STREAM_DIRECTORY = "stream";
export const VIDEO_WEB_STREAM_PLAYLIST_FILENAME =
  "index.m3u8";
export const VIDEO_WEB_STREAM_INIT_FILENAME =
  "init.mp4";
export const VIDEO_WEB_STREAM_INFO_FILENAME =
  "stream-info.json";
export const VIDEO_WEB_STREAM_POSTER_FILENAME =
  "poster.png";
export const VIDEO_WEB_STREAM_SEGMENT_PATTERN =
  "segment-%05d.m4s";
export const VIDEO_WEB_STREAM_SEGMENT_DURATION_SECONDS = 3;

export type VideoWebStreamProfile = {
  version: number;
  protocol: "hls";
  rendition: "single";
  video: {
    codec: "h264";
    encoder: "libx264";
    profile: "high";
    level: "4.1";
    pixelFormat: "yuv420p";
    preset: "medium";
    crf: number;
    maxRateKbps: 4500;
    bufferSizeKbps: 9000;
    resolutionPolicy: "fit-within-no-upscale";
    maxWidth: 1280;
    maxHeight: 720;
    frameRatePolicy: "preserve-source-up-to-limit";
    maxFrameRate: 60;
    keyframeIntervalSeconds: number;
  };
  audio: {
    presencePolicy: "include-if-present";
    codec: "aac";
    codecProfile: "aac_low";
    bitrateKbps: 192;
    channels: 2;
    sampleRatePolicy: "preserve-source";
  };
  poster: {
    filename: string;
    format: "png";
    framePolicy: "auto-or-authored-seek";
    thumbnailFrames: number;
    maxWidth: number;
    maxHeight: number;
  };
  playlist: {
    type: "vod";
    segmentType: "fmp4";
    segmentDurationSeconds: number;
    independentSegments: true;
    playlistFilename: string;
    initFilename: string;
    segmentPattern: string;
  };
};

export type VideoWebStreamSourceIdentity = {
  relativePath: string;
  sizeBytes: number;
  modifiedAt: string;
  posterTimeSeconds?: number;
};

export type VideoWebStreamPaths = {
  directoryRelativePath: string;
  manifestRelativePath: string;
  profileInfoRelativePath: string;
};

export type VideoWebStreamInfo = {
  schema: {
    name: "metadata-editor-video-web-stream";
    version: 1;
  };
  videoId: string;
  generatedAt: string;
  source: VideoWebStreamSourceIdentity & {
    fingerprint: string;
  };
  profile: VideoWebStreamProfile & {
    sha256: string;
  };
};

export type VideoWebStreamStatus =
  | "current"
  | "missing"
  | "stale"
  | "blocked";

export type VideoWebStreamAction =
  | "none"
  | "create"
  | "replace"
  | "blocked";

export type VideoWebStreamFile = {
  kind: "manifest" | "initialization" | "segment" | "poster";
  filename: string;
  relativePath: string;
  sizeBytes: number;
};

export type VideoWebStreamVideoPlan = {
  videoId: string;
  videoRelativePath: string;
  title?: string;
  directoryRelativePath: string;
  manifestRelativePath: string;
  profileInfoRelativePath: string;
  master?: VideoWebStreamSourceIdentity & {
    extension: string;
  };
  status: VideoWebStreamStatus;
  action: VideoWebStreamAction;
  reason: string;
  files: VideoWebStreamFile[];
  checks: string[];
};

export type VideoWebStreamPlan = {
  releaseId: string;
  generatedAt: string;
  writesEnabled: false;
  profile: VideoWebStreamProfile & {
    sha256: string;
  };
  planFingerprint: string;
  items: VideoWebStreamVideoPlan[];
  summary: {
    videoCount: number;
    currentCount: number;
    createCount: number;
    replaceCount: number;
    blockedCount: number;
  };
};

export type BuildVideoWebStreamPlanOptions = {
  generatedAt?: string;
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

function requiredEncodersReady(
  capabilities: FfmpegCapabilities,
): boolean {
  return Boolean(
    capabilities.available &&
    capabilities.encoders.includes("libx264") &&
    capabilities.encoders.includes("aac"),
  );
}

export function buildVideoWebStreamProfile():
  VideoWebStreamProfile {
  return {
    version: VIDEO_WEB_STREAM_PROFILE_VERSION,
    protocol: "hls",
    rendition: "single",
    video: {
      codec: "h264",
      encoder: "libx264",
      profile: "high",
      level: "4.1",
      pixelFormat: "yuv420p",
      preset: "medium",
      crf: 20,
      maxRateKbps: 4500,
      bufferSizeKbps: 9000,
      resolutionPolicy: "fit-within-no-upscale",
      maxWidth: 1280,
      maxHeight: 720,
      frameRatePolicy: "preserve-source-up-to-limit",
      maxFrameRate: 60,
      keyframeIntervalSeconds:
        VIDEO_WEB_STREAM_SEGMENT_DURATION_SECONDS,
    },
    audio: {
      presencePolicy: "include-if-present",
      codec: "aac",
      codecProfile: "aac_low",
      bitrateKbps: 192,
      channels: 2,
      sampleRatePolicy: "preserve-source",
    },
    poster: {
      filename: VIDEO_WEB_STREAM_POSTER_FILENAME,
      format: "png",
      framePolicy: "auto-or-authored-seek",
      thumbnailFrames: 120,
      maxWidth: 1280,
      maxHeight: 720,
    },
    playlist: {
      type: "vod",
      segmentType: "fmp4",
      segmentDurationSeconds:
        VIDEO_WEB_STREAM_SEGMENT_DURATION_SECONDS,
      independentSegments: true,
      playlistFilename:
        VIDEO_WEB_STREAM_PLAYLIST_FILENAME,
      initFilename:
        VIDEO_WEB_STREAM_INIT_FILENAME,
      segmentPattern:
        VIDEO_WEB_STREAM_SEGMENT_PATTERN,
    },
  };
}

export function hashVideoWebStreamProfile(
  profile: VideoWebStreamProfile,
): string {
  return createHash("sha256")
    .update(JSON.stringify(profile))
    .digest("hex");
}

export function hashVideoWebStreamSourceIdentity(
  source: VideoWebStreamSourceIdentity,
): string {
  return createHash("sha256")
    .update(JSON.stringify(source))
    .digest("hex");
}

export function buildVideoWebStreamPaths(
  video: Pick<
    VideoScanResult,
    "relativePath"
  >,
): VideoWebStreamPaths {
  const directoryRelativePath = path.posix.join(
    video.relativePath.replaceAll("\\", "/"),
    VIDEO_WEB_STREAM_DIRECTORY,
  );

  return {
    directoryRelativePath,
    manifestRelativePath: path.posix.join(
      directoryRelativePath,
      VIDEO_WEB_STREAM_PLAYLIST_FILENAME,
    ),
    profileInfoRelativePath: path.posix.join(
      directoryRelativePath,
      VIDEO_WEB_STREAM_INFO_FILENAME,
    ),
  };
}

export function buildVideoWebStreamInfo(
  videoId: string,
  source: VideoWebStreamSourceIdentity,
  profile: VideoWebStreamProfile & {
    sha256: string;
  },
  generatedAt: string,
): VideoWebStreamInfo {
  return {
    schema: {
      name: "metadata-editor-video-web-stream",
      version: 1,
    },
    videoId,
    generatedAt,
    source: {
      ...source,
      fingerprint:
        hashVideoWebStreamSourceIdentity(source),
    },
    profile,
  };
}

export function buildVideoWebStreamFfmpegArgs(
  inputPath: string,
  outputDirectory: string,
  profile = buildVideoWebStreamProfile(),
): string[] {
  const scaleAndFrameRate = [
    `scale=w='min(iw,${profile.video.maxWidth})':h='min(ih,${profile.video.maxHeight})':force_original_aspect_ratio=decrease:force_divisible_by=2`,
    `fps=fps='min(source_fps,${profile.video.maxFrameRate})'`,
  ].join(",");

  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    "-i",
    inputPath,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    "-map_metadata",
    "-1",
    "-map_chapters",
    "-1",
    "-vf",
    scaleAndFrameRate,
    "-c:v",
    profile.video.encoder,
    "-profile:v",
    profile.video.profile,
    "-level:v",
    profile.video.level,
    "-pix_fmt",
    profile.video.pixelFormat,
    "-preset",
    profile.video.preset,
    "-crf",
    String(profile.video.crf),
    "-maxrate",
    `${profile.video.maxRateKbps}k`,
    "-bufsize",
    `${profile.video.bufferSizeKbps}k`,
    "-force_key_frames",
    `expr:gte(t,n_forced*${profile.video.keyframeIntervalSeconds})`,
    "-sc_threshold",
    "0",
    "-c:a",
    profile.audio.codec,
    "-profile:a",
    profile.audio.codecProfile,
    "-b:a",
    `${profile.audio.bitrateKbps}k`,
    "-ac",
    String(profile.audio.channels),
    "-f",
    "hls",
    "-hls_time",
    String(profile.playlist.segmentDurationSeconds),
    "-hls_playlist_type",
    profile.playlist.type,
    "-hls_list_size",
    "0",
    "-hls_segment_type",
    profile.playlist.segmentType,
    "-hls_fmp4_init_filename",
    profile.playlist.initFilename,
    "-hls_flags",
    "independent_segments",
    "-start_number",
    "1",
    "-hls_segment_filename",
    path.join(outputDirectory, profile.playlist.segmentPattern),
    "-y",
    path.join(outputDirectory, profile.playlist.playlistFilename),
  ];
}

export function buildVideoPosterFfmpegArgs(
  inputPath: string,
  outputDirectory: string,
  profile = buildVideoWebStreamProfile(),
  posterTimeSeconds?: number,
): string[] {
  const scale =
    `scale=w='min(iw,${profile.poster.maxWidth})':h='min(ih,${profile.poster.maxHeight})':force_original_aspect_ratio=decrease:force_divisible_by=2`;
  const authoredSeek =
    posterTimeSeconds !== undefined
      ? [
          "-ss",
          String(posterTimeSeconds),
        ]
      : [];
  const videoFilter =
    posterTimeSeconds !== undefined
      ? scale
      : `thumbnail=${profile.poster.thumbnailFrames},${scale}`;

  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    "-i",
    inputPath,
    ...authoredSeek,
    "-map",
    "0:v:0",
    "-an",
    "-sn",
    "-dn",
    "-vf",
    videoFilter,
    "-frames:v",
    "1",
    "-compression_level",
    "6",
    "-y",
    path.join(outputDirectory, profile.poster.filename),
  ];
}

export function buildVideoWebStreamVerificationArgs(
  playlistPath: string,
): string[] {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    "-i",
    playlistPath,
    "-map",
    "0:v:0",
    "-map",
    "0:a:0?",
    "-f",
    "null",
    "-",
  ];
}

function parsePlaylistUris(content: string): string[] {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines[0] !== "#EXTM3U") {
    throw new Error("Video HLS playlist is missing #EXTM3U.");
  }

  const mapLine = lines.find((line) =>
    line.startsWith("#EXT-X-MAP:"),
  );
  if (
    !mapLine ||
    !mapLine.includes(
      `URI=\"${VIDEO_WEB_STREAM_INIT_FILENAME}\"`,
    )
  ) {
    throw new Error(
      `Video HLS playlist must reference ${VIDEO_WEB_STREAM_INIT_FILENAME}.`,
    );
  }

  if (!lines.includes("#EXT-X-INDEPENDENT-SEGMENTS")) {
    throw new Error(
      "Video HLS playlist is missing #EXT-X-INDEPENDENT-SEGMENTS.",
    );
  }

  if (!lines.includes("#EXT-X-ENDLIST")) {
    throw new Error(
      "Video HLS VOD playlist is missing #EXT-X-ENDLIST.",
    );
  }

  const segments = lines.filter(
    (line) => !line.startsWith("#"),
  );

  if (segments.length === 0) {
    throw new Error(
      "Video HLS playlist does not reference any media segments.",
    );
  }

  for (const segment of segments) {
    if (!/^segment-\d{5}\.m4s$/.test(segment)) {
      throw new Error(
        `Video HLS playlist contains an unsafe or unexpected segment URI: ${segment}`,
      );
    }
  }

  return segments;
}

async function inspectRegularFile(
  root: string,
  relativePath: string,
): Promise<{ sizeBytes: number }> {
  const absolutePath = rootPath(root, relativePath);
  const stats = await lstat(absolutePath);

  if (
    stats.isSymbolicLink() ||
    !stats.isFile() ||
    stats.size === 0
  ) {
    throw new Error(
      `Expected a non-empty regular video HLS file: ${relativePath}`,
    );
  }

  return {
    sizeBytes: stats.size,
  };
}

export async function inspectVideoWebStreamDirectory(
  root: string,
  directoryRelativePath: string,
): Promise<{
  files: VideoWebStreamFile[];
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
      `Video web-stream path is not a regular directory: ${directoryRelativePath}`,
    );
  }

  const playlistRelativePath = path.posix.join(
    directoryRelativePath,
    VIDEO_WEB_STREAM_PLAYLIST_FILENAME,
  );
  const playlist = await readFile(
    rootPath(root, playlistRelativePath),
    "utf8",
  );
  const segmentFilenames = parsePlaylistUris(playlist);
  const expectedNames = new Set([
    VIDEO_WEB_STREAM_PLAYLIST_FILENAME,
    VIDEO_WEB_STREAM_INIT_FILENAME,
    VIDEO_WEB_STREAM_INFO_FILENAME,
    VIDEO_WEB_STREAM_POSTER_FILENAME,
    ...segmentFilenames,
  ]);
  const entries = await readdir(directoryPath, {
    withFileTypes: true,
  });

  for (const entry of entries) {
    if (!expectedNames.has(entry.name)) {
      throw new Error(
        `Video web-stream directory contains an unexpected file: ${entry.name}`,
      );
    }

    if (!entry.isFile() || entry.isSymbolicLink()) {
      throw new Error(
        `Video web-stream directory contains a non-regular entry: ${entry.name}`,
      );
    }
  }

  const files: VideoWebStreamFile[] = [];
  for (const [kind, filename] of [
    ["manifest", VIDEO_WEB_STREAM_PLAYLIST_FILENAME],
    ["initialization", VIDEO_WEB_STREAM_INIT_FILENAME],
    ["poster", VIDEO_WEB_STREAM_POSTER_FILENAME],
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

async function inspectVideoMaster(
  mediaRoot: string,
  video: VideoScanResult,
): Promise<
  | {
      ready: true;
      source: VideoWebStreamSourceIdentity & {
        extension: string;
      };
    }
  | {
      ready: false;
      reason: string;
      checks: string[];
    }
> {
  if (video.videoMasters.length !== 1) {
    return {
      ready: false,
      reason:
        video.videoMasters.length === 0
          ? "Video web-stream generation requires one canonical video master."
          : "Video web-stream generation is blocked by multiple canonical video masters.",
      checks: [
        video.videoMasters.length === 0
          ? "No canonical video master was detected."
          : `${video.videoMasters.length} canonical video masters were detected.`,
      ],
    };
  }

  const master = video.videoMasters[0];
  if (
    video.masterPath &&
    video.masterPath !== master.filename
  ) {
    return {
      ready: false,
      reason:
        "video.toml master_path does not match the detected canonical video master.",
      checks: [
        `video.toml names ${video.masterPath}; scanner found ${master.filename}.`,
      ],
    };
  }

  try {
    const stats = await lstat(
      rootPath(mediaRoot, master.relativePath),
    );
    if (
      stats.isSymbolicLink() ||
      !stats.isFile() ||
      stats.size === 0
    ) {
      return {
        ready: false,
        reason:
          "Canonical video master is not a non-empty regular file.",
        checks: [
          "Repair the canonical video master before preparing a web stream.",
        ],
      };
    }

    return {
      ready: true,
      source: {
        relativePath: master.relativePath,
        sizeBytes: stats.size,
        modifiedAt: stats.mtime.toISOString(),
        ...(video.posterTimeSeconds !== undefined
          ? {
              posterTimeSeconds:
                video.posterTimeSeconds,
            }
          : {}),
        extension: master.extension,
      },
    };
  } catch (error) {
    return {
      ready: false,
      reason:
        "Canonical video master could not be inspected.",
      checks: [
        error instanceof Error
          ? error.message
          : "Unable to inspect canonical video master.",
      ],
    };
  }
}

async function buildVideoItemPlan(
  mediaRoot: string,
  video: VideoScanResult,
  capabilities: FfmpegCapabilities,
  profile: VideoWebStreamProfile & {
    sha256: string;
  },
): Promise<VideoWebStreamVideoPlan> {
  const paths = buildVideoWebStreamPaths(video);
  const masterInspection = await inspectVideoMaster(
    mediaRoot,
    video,
  );

  if (!masterInspection.ready) {
    return {
      videoId: video.id,
      videoRelativePath: video.relativePath,
      ...(video.title ? { title: video.title } : {}),
      ...paths,
      status: "blocked",
      action: "blocked",
      reason: masterInspection.reason,
      files: [],
      checks: masterInspection.checks,
    };
  }

  const master = masterInspection.source;

  if (!requiredEncodersReady(capabilities)) {
    return {
      videoId: video.id,
      videoRelativePath: video.relativePath,
      ...(video.title ? { title: video.title } : {}),
      ...paths,
      master,
      status: "blocked",
      action: "blocked",
      reason:
        "FFmpeg does not expose the libx264 and AAC encoders required by the video web-stream profile.",
      files: [],
      checks: [
        capabilities.error ??
        "Required FFmpeg video encoders are unavailable.",
      ],
    };
  }

  try {
    const directoryStats = await lstat(
      rootPath(mediaRoot, paths.directoryRelativePath),
    );
    if (
      directoryStats.isSymbolicLink() ||
      !directoryStats.isDirectory()
    ) {
      return {
        videoId: video.id,
        videoRelativePath: video.relativePath,
        ...(video.title ? { title: video.title } : {}),
        ...paths,
        master,
        status: "blocked",
        action: "blocked",
        reason:
          "The video web-stream target exists but is not a regular directory.",
        files: [],
        checks: [
          "Remove or repair the unsafe video stream target before preparation.",
        ],
      };
    }
  } catch (error) {
    if (isMissingFileError(error)) {
      return {
        videoId: video.id,
        videoRelativePath: video.relativePath,
        ...(video.title ? { title: video.title } : {}),
        ...paths,
        master,
        status: "missing",
        action: "create",
        reason:
          "H.264/AAC HLS video web-stream derivative is missing.",
        files: [],
        checks: [
          "Video preparation will generate the private segmented web stream.",
        ],
      };
    }
    throw error;
  }

  try {
    const inspected = await inspectVideoWebStreamDirectory(
      mediaRoot,
      paths.directoryRelativePath,
    );
    const info = JSON.parse(
      await readFile(
        rootPath(mediaRoot, paths.profileInfoRelativePath),
        "utf8",
      ),
    ) as Partial<VideoWebStreamInfo>;
    const sourceFingerprint =
      hashVideoWebStreamSourceIdentity(master);
    const sourceMatches = Boolean(
      info.source &&
      info.source.fingerprint === sourceFingerprint &&
      info.source.relativePath === master.relativePath &&
      info.source.sizeBytes === master.sizeBytes &&
      info.source.modifiedAt === master.modifiedAt &&
      info.source.posterTimeSeconds ===
        master.posterTimeSeconds,
    );
    const profileMatches = Boolean(
      info.profile &&
      info.profile.sha256 === profile.sha256,
    );
    const identityMatches =
      info.videoId === video.id &&
      info.schema?.name ===
        "metadata-editor-video-web-stream" &&
      info.schema?.version === 1;

    if (
      !sourceMatches ||
      !profileMatches ||
      !identityMatches
    ) {
      return {
        videoId: video.id,
        videoRelativePath: video.relativePath,
        ...(video.title ? { title: video.title } : {}),
        ...paths,
        master,
        status: "stale",
        action: "replace",
        reason:
          "Video web stream was generated from an older source, profile, or video identity.",
        files: inspected.files,
        checks: [
          sourceMatches
            ? "Canonical video source identity matches."
            : "Canonical video source identity changed.",
          profileMatches
            ? "Video HLS generation profile matches."
            : "Video HLS generation profile changed.",
          identityMatches
            ? "Video stream identity matches."
            : "Video stream identity metadata does not match.",
        ],
      };
    }

    return {
      videoId: video.id,
      videoRelativePath: video.relativePath,
      ...(video.title ? { title: video.title } : {}),
      ...paths,
      master,
      status: "current",
      action: "none",
      reason: "Video HLS web stream is current.",
      files: inspected.files,
      checks: [
        `Validated ${Math.max(0, inspected.files.length - 3)} video HLS media segments plus manifest, initialization segment, and poster frame.`,
      ],
    };
  } catch (error) {
    return {
      videoId: video.id,
      videoRelativePath: video.relativePath,
      ...(video.title ? { title: video.title } : {}),
      ...paths,
      master,
      status: "stale",
      action: "replace",
      reason:
        "Existing video web-stream directory is incomplete or does not match the HLS contract.",
      files: [],
      checks: [
        error instanceof Error
          ? error.message
          : "Unable to validate the existing video HLS web stream.",
      ],
    };
  }
}

function hashVideoWebStreamPlan(
  releaseId: string,
  profile: VideoWebStreamProfile & {
    sha256: string;
  },
  items: VideoWebStreamVideoPlan[],
): string {
  return createHash("sha256")
    .update(JSON.stringify({
      releaseId,
      profile,
      items: items.map((item) => ({
        videoId: item.videoId,
        videoRelativePath: item.videoRelativePath,
        directoryRelativePath:
          item.directoryRelativePath,
        master: item.master,
        status: item.status,
        action: item.action,
        files: item.files,
      })),
    }))
    .digest("hex");
}

export async function buildVideoWebStreamPlan(
  mediaRoot: string,
  release: ReleaseScanResult,
  capabilities: FfmpegCapabilities,
  options: BuildVideoWebStreamPlanOptions = {},
): Promise<VideoWebStreamPlan> {
  const profileBase = buildVideoWebStreamProfile();
  const profile = {
    ...profileBase,
    sha256: hashVideoWebStreamProfile(profileBase),
  };
  const items = await Promise.all(
    (release.videos ?? []).map((video) =>
      buildVideoItemPlan(
        mediaRoot,
        video,
        capabilities,
        profile,
      ),
    ),
  );

  return {
    releaseId: release.id,
    generatedAt:
      options.generatedAt ?? new Date().toISOString(),
    writesEnabled: false,
    profile,
    planFingerprint: hashVideoWebStreamPlan(
      release.id,
      profile,
      items,
    ),
    items,
    summary: {
      videoCount: items.length,
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
