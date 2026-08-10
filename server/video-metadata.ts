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
import type {
  ReleaseScanResult,
  VideoScanResult,
} from "./types.js";

export type VideoMetadataEditorSnapshot = {
  releaseId: string;
  videoId: string;
  relativePath: string;
  originalSha256: string;
  title: string;
  videoType: string;
  relatedTrackId: string;
  masterPath: string;
};

export type VideoMetadataEditorSaveReceipt = {
  releaseId: string;
  videoId: string;
  relativePath: string;
  backupRelativePath: string;
  previousSha256: string;
  savedSha256: string;
  bytes: number;
  savedAt: string;
};

type LoadedVideoDocument = {
  video: VideoScanResult;
  relativePath: string;
  canonicalMediaRoot: string;
  canonicalFilePath: string;
  content: Buffer;
  sha256: string;
  parsed: Record<string, unknown>;
  videoTable: Record<string, unknown>;
};

function hashContent(
  content: string | Buffer,
): string {
  return createHash("sha256")
    .update(content)
    .digest("hex");
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

function readRequiredString(
  value: unknown,
  label: string,
): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0
  ) {
    throw new Error(
      `${label} must be a non-empty string.`,
    );
  }

  return value.trim();
}

function normalizeEditableString(
  value: unknown,
  label: string,
  maximumLength: number,
): string {
  const normalized = readRequiredString(
    value,
    label,
  );

  if (normalized.length > maximumLength) {
    throw new Error(
      `${label} must be ${maximumLength} characters or fewer.`,
    );
  }

  return normalized;
}

function findVideo(
  release: ReleaseScanResult,
  videoId: string,
): VideoScanResult {
  const video = (release.videos ?? []).find(
    (candidate) => candidate.id === videoId,
  );

  if (!video) {
    throw new Error(
      `Video not found: ${videoId}`,
    );
  }

  return video;
}

async function loadVideoDocument(
  mediaRoot: string,
  release: ReleaseScanResult,
  videoId: string,
): Promise<LoadedVideoDocument> {
  const video = findVideo(
    release,
    videoId,
  );
  const metadataFile = video.metadataFiles.find(
    (file) =>
      file.filename === "video.toml" &&
      file.exists,
  );

  if (!metadataFile) {
    throw new Error(
      `${video.relativePath}: video.toml is missing.`,
    );
  }

  const canonicalMediaRoot =
    await realpath(mediaRoot);
  const candidatePath = assertPathWithinRoot(
    canonicalMediaRoot,
    path.join(
      canonicalMediaRoot,
      metadataFile.relativePath,
    ),
  );
  const stats = await lstat(candidatePath);

  if (
    !stats.isFile() ||
    stats.isSymbolicLink()
  ) {
    throw new Error(
      "video.toml is not a regular file.",
    );
  }

  const canonicalFilePath =
    await realpath(candidatePath);
  assertPathWithinRoot(
    canonicalMediaRoot,
    canonicalFilePath,
  );

  const content = await readFile(
    canonicalFilePath,
  );
  const parsedValue = parse(
    content.toString("utf8"),
  );

  if (!isRecord(parsedValue)) {
    throw new Error(
      "Expected video.toml to contain a TOML document object.",
    );
  }

  const videoTable = parsedValue.video;

  if (!isRecord(videoTable)) {
    throw new Error(
      "video.toml is missing the [video] table.",
    );
  }

  const authoredId = readRequiredString(
    videoTable.id,
    "video.id",
  );

  if (authoredId !== video.id) {
    throw new Error(
      `video.id is ${authoredId}, but the canonical video directory is ${video.id}. Stable video identity changes require a separate reviewed workflow.`,
    );
  }

  const masterPath = readRequiredString(
    videoTable.master_path,
    "video.master_path",
  );

  if (
    video.videoMasters.length === 1 &&
    masterPath !== video.videoMasters[0]?.filename
  ) {
    throw new Error(
      `video.master_path is ${masterPath}, but the detected canonical master is ${video.videoMasters[0]?.filename}. Repair the Library video before editing metadata.`,
    );
  }

  return {
    video,
    relativePath: metadataFile.relativePath,
    canonicalMediaRoot,
    canonicalFilePath,
    content,
    sha256: hashContent(content),
    parsed: parsedValue,
    videoTable,
  };
}

export async function readVideoMetadataForEdit(
  mediaRoot: string,
  release: ReleaseScanResult,
  videoId: string,
): Promise<VideoMetadataEditorSnapshot> {
  const loaded = await loadVideoDocument(
    mediaRoot,
    release,
    videoId,
  );

  return {
    releaseId: release.id,
    videoId: loaded.video.id,
    relativePath: loaded.relativePath,
    originalSha256: loaded.sha256,
    title:
      typeof loaded.videoTable.title === "string"
        ? loaded.videoTable.title
        : "",
    videoType:
      typeof loaded.videoTable.type === "string"
        ? loaded.videoTable.type
        : "",
    relatedTrackId:
      typeof loaded.videoTable.related_track_id === "string"
        ? loaded.videoTable.related_track_id
        : "",
    masterPath: readRequiredString(
      loaded.videoTable.master_path,
      "video.master_path",
    ),
  };
}

export async function saveVideoMetadataEdits(
  mediaRoot: string,
  release: ReleaseScanResult,
  input: {
    videoId: string;
    originalSha256: string;
    title: unknown;
    videoType: unknown;
    relatedTrackId: unknown;
  },
): Promise<VideoMetadataEditorSaveReceipt> {
  if (!/^[a-f0-9]{64}$/.test(input.originalSha256)) {
    throw new Error(
      "originalSha256 must be a SHA-256 hash.",
    );
  }

  const title = normalizeEditableString(
    input.title,
    "Video title",
    300,
  );
  const videoType = normalizeEditableString(
    input.videoType,
    "Video type",
    80,
  );
  const relatedTrackId =
    typeof input.relatedTrackId === "string"
      ? input.relatedTrackId.trim()
      : "";

  if (
    relatedTrackId &&
    !release.tracks.some(
      (track) => track.id === relatedTrackId,
    )
  ) {
    throw new Error(
      `Related track does not exist in this release: ${relatedTrackId}`,
    );
  }

  const loaded = await loadVideoDocument(
    mediaRoot,
    release,
    input.videoId,
  );

  if (loaded.sha256 !== input.originalSha256) {
    throw new Error(
      "video.toml changed externally; refresh before saving.",
    );
  }

  loaded.videoTable.title = title;
  loaded.videoTable.type = videoType;
  loaded.videoTable.related_track_id =
    relatedTrackId;

  const updatedContent =
    `${stringify(loaded.parsed).trimEnd()}
`;

  // Validate the exact replacement text before any write.
  parse(updatedContent);

  const parentPath = path.dirname(
    loaded.canonicalFilePath,
  );
  const backupDirectory =
    assertPathWithinRoot(
      loaded.canonicalMediaRoot,
      path.join(
        parentPath,
        ".metadata-backups",
      ),
    );

  await mkdir(backupDirectory, {
    recursive: true,
    mode: 0o700,
  });

  const canonicalBackupDirectory =
    await realpath(backupDirectory);
  assertPathWithinRoot(
    loaded.canonicalMediaRoot,
    canonicalBackupDirectory,
  );

  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-");
  const backupPath = assertPathWithinRoot(
    loaded.canonicalMediaRoot,
    path.join(
      canonicalBackupDirectory,
      `video.toml.${timestamp}.bak`,
    ),
  );

  await copyFile(
    loaded.canonicalFilePath,
    backupPath,
    constants.COPYFILE_EXCL,
  );

  const temporaryPath = assertPathWithinRoot(
    loaded.canonicalMediaRoot,
    path.join(
      parentPath,
      `.video.toml.${randomUUID()}.tmp`,
    ),
  );
  let temporaryCreated = false;

  try {
    const temporaryFile = await open(
      temporaryPath,
      "wx",
      0o600,
    );
    temporaryCreated = true;

    try {
      await temporaryFile.writeFile(
        updatedContent,
        "utf8",
      );
      await temporaryFile.sync();
    } finally {
      await temporaryFile.close();
    }

    const currentContent = await readFile(
      loaded.canonicalFilePath,
    );

    if (
      hashContent(currentContent) !==
      input.originalSha256
    ) {
      throw new Error(
        "video.toml changed externally during save.",
      );
    }

    await rename(
      temporaryPath,
      loaded.canonicalFilePath,
    );
    temporaryCreated = false;
  } finally {
    if (temporaryCreated) {
      await unlink(temporaryPath).catch(
        () => undefined,
      );
    }
  }

  const savedContent = await readFile(
    loaded.canonicalFilePath,
  );
  parse(savedContent.toString("utf8"));

  return {
    releaseId: release.id,
    videoId: loaded.video.id,
    relativePath: loaded.relativePath,
    backupRelativePath:
      toLibraryRelativePath(
        loaded.canonicalMediaRoot,
        backupPath,
      ),
    previousSha256: loaded.sha256,
    savedSha256: hashContent(savedContent),
    bytes: savedContent.byteLength,
    savedAt: new Date().toISOString(),
  };
}
