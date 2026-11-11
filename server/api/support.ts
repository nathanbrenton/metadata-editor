import { createReadStream } from "node:fs";
import { spawn } from "node:child_process";
import {
  readFile,
  realpath,
  stat,
} from "node:fs/promises";
import type {
  IncomingMessage,
  ServerResponse,
} from "node:http";
import path from "node:path";
import {
  WAVEFORM_BINARY_CONTENT_TYPE,
  WAVEFORM_BINARY_FILENAME,
  decodeWaveformPayload,
} from "@hiplingo/media-player/waveform-binary";
import {
  buildBlockingSourceStatuses,
  INGEST_DRAFT_SCHEMA_VERSION,
} from "../../shared/ingest-drafts.js";
import { isValidTuningReference } from "../../shared/musical-analysis.js";
import { findProductionContextField } from "../../shared/production-context.js";
import {
  assertReleaseEditorialStorageValue,
  isReleaseEditorialStoragePath,
} from "../../shared/editorial-profile.js";
import {
  buildAudioPreviewTranscodeArgs,
  getAudioPreviewContentType,
  getAudioPreviewDeliveryMode,
  parseSingleByteRange,
  selectAudioPreviewMp3Encoder,
  selectTrackAudioPreview,
  type AudioPreviewSourceKind,
} from "../audio-preview.js";
import { detectFfmpegCapabilities } from "../ffmpeg-capabilities.js";
import {
  inspectIngestCandidate,
  inspectIngestRelativeFiles,
} from "../ingest-scanner.js";
import {
  defaultIngestRoot,
  resolveIngestRoot,
} from "../ingest-root.js";
import {
  readEmbeddedIngestArtworkPreview,
  readIngestArtworkPreview,
} from "../ingest-artwork.js";
import {
  getLibraryArtworkPreviewMode,
  renderTiffArtworkPreview,
} from "../library-artwork-preview.js";
import {
  getVideoPreviewContentType,
  selectVideoPreviewMaster,
} from "../video-preview.js";
import { resolveIngestAudioPreviewSource } from "../ingest-audio.js";
import { parseStoredIngestDraft } from "../ingest-draft-store.js";
import { parseIngestBuildDraft } from "../ingest-builder.js";
import { findMetadataField } from "../metadata-registry.js";
import {
  assertPathWithinRoot,
  resolveMediaRoot,
} from "../media-root.js";
import { scanReleaseById } from "../scanner.js";

const host = "127.0.0.1";

const port = Number.parseInt(
  process.env.METADATA_EDITOR_PORT ?? "4174",
  10,
);

const metadataStorageFilenames: Record<string, string> = {
  release: "release.toml",
  track: "track.toml",
  "track-credits": "track-credits.toml",
  "track-production": "track-production-notes.toml",
  "release-production-notes": "release-production-notes.toml",
  "track-production-notes": "track-production-notes.toml",
};

function assertMetadataFieldMayBeRemoved(
  relativePath: string,
  metadataPath: string,
): void {
  const filename = path.basename(relativePath);
  const productionField =
    findProductionContextField(metadataPath);

  if (productionField) {
    if (
      filename !== "release-production-notes.toml" &&
      filename !== "track-production-notes.toml"
    ) {
      throw new Error(
        `Metadata field ${metadataPath} does not belong in ${filename}.`,
      );
    }
    return;
  }

  const field = findMetadataField(
    metadataPath,
  );

  if (!field) {
    throw new Error(
      `Only registered metadata fields may be removed: ${metadataPath}`,
    );
  }

  if (field.required) {
    throw new Error(
      `Required metadata fields cannot be removed: ${metadataPath}`,
    );
  }

  const expectedFilename =
    metadataStorageFilenames[
      field.storageFileRole
    ];

  if (
    !expectedFilename ||
    filename !== expectedFilename
  ) {
    throw new Error(
      `Metadata field ${metadataPath} does not belong in ${filename}.`,
    );
  }
}

function assertMetadataFieldMayBeCreated(
  relativePath: string,
  metadataPath: string,
): void {
  const filename = path.basename(relativePath);

  if (
    filename === "release.toml" &&
    isReleaseEditorialStoragePath(metadataPath)
  ) {
    return;
  }

  const productionField =
    findProductionContextField(metadataPath);

  if (productionField) {
    if (
      filename !== "release-production-notes.toml" &&
      filename !== "track-production-notes.toml"
    ) {
      throw new Error(
        `Metadata field ${metadataPath} does not belong in ${filename}.`,
      );
    }
    return;
  }

  const field = findMetadataField(metadataPath);
  if (!field || field.repeatable || field.tomlPath.includes("[]")) {
    throw new Error(`Only registered scalar metadata fields may be created: ${metadataPath}`);
  }
  const expectedFilename = metadataStorageFilenames[field.storageFileRole];
  if (!expectedFilename || filename !== expectedFilename) {
    throw new Error(`Metadata field ${metadataPath} does not belong in ${filename}.`);
  }
}

function assertCanonicalMetadataValue(pathValue: string, value: unknown): void {
  if (isReleaseEditorialStoragePath(pathValue)) {
    assertReleaseEditorialStorageValue(
      pathValue,
      value,
    );
    return;
  }

  if (pathValue === "track.audio.tuning_hz" && (typeof value !== "number" || !isValidTuningReference(value))) {
    throw new Error("track.audio.tuning_hz must be a number from 100 through 999.");
  }
}

function parseGenerationScope(
  value: unknown,
): "all" | "release" | "track" {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return "all";
  }

  if (
    value === "all" ||
    value === "release" ||
    value === "track"
  ) {
    return value;
  }

  throw new Error(
    "Generation scope must be all, release, or track",
  );
}

function sendJson(
  response: ServerResponse,
  statusCode: number,
  payload: unknown,
): void {
  response.statusCode = statusCode;
  response.setHeader(
    "Content-Type",
    "application/json; charset=utf-8",
  );
  response.end(
    `${JSON.stringify(payload, null, 2)}\n`,
  );
}

const artworkContentTypes = new Map([
  [".avif", "image/avif"],
  [".gif", "image/gif"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".pdf", "application/pdf"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".tif", "image/tiff"],
  [".tiff", "image/tiff"],
  [".webp", "image/webp"],
]);

async function sendIngestArtworkPreview(
  response: ServerResponse,
  relativePath: string,
  embeddedStreamIndex?: number,
  embeddedCodecName?: string,
): Promise<void> {
  const ingestRoot = await resolveIngestRoot();
  const preview = embeddedStreamIndex === undefined
    ? await readIngestArtworkPreview(ingestRoot, relativePath)
    : await readEmbeddedIngestArtworkPreview(
        ingestRoot,
        relativePath,
        embeddedStreamIndex,
        embeddedCodecName,
      );

  response.statusCode = 200;
  response.setHeader(
    "Content-Type",
    preview.contentType,
  );
  response.setHeader(
    "Cache-Control",
    "private, no-store",
  );
  response.setHeader(
    "X-Content-Type-Options",
    "nosniff",
  );
  response.setHeader(
    "X-Ingest-Artwork-Preview-Source",
    preview.source,
  );
  response.end(preview.bytes);
}

async function sendLibraryArtwork(
  response: ServerResponse,
  relativePath: string,
): Promise<void> {
  const extension = path
    .extname(relativePath)
    .toLowerCase();
  const contentType =
    artworkContentTypes.get(extension);

  if (!contentType) {
    sendJson(response, 415, {
      error: "Unsupported artwork file type",
    });
    return;
  }

  const mediaRoot = await resolveMediaRoot();
  const candidatePath = assertPathWithinRoot(
    mediaRoot,
    path.join(mediaRoot, relativePath),
  );

  // Canonicalize the file itself so symlinks cannot escape the root.
  const canonicalPath = await realpath(candidatePath);
  assertPathWithinRoot(mediaRoot, canonicalPath);

  const content = await readFile(canonicalPath);

  response.statusCode = 200;
  response.setHeader("Content-Type", contentType);
  response.setHeader(
    "Cache-Control",
    "private, max-age=60",
  );
  response.setHeader(
    "X-Content-Type-Options",
    "nosniff",
  );

  // SVG files may contain active content. Serve them as downloads rather
  // than navigating the local application origin to an inline SVG document.
  if (extension === ".svg") {
    const filename = path
      .basename(relativePath)
      .replace(/["\r\n]/g, "_");
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="${filename}"`,
    );
  }

  response.end(content);
}

async function sendLibraryArtworkPreview(
  response: ServerResponse,
  relativePath: string,
): Promise<void> {
  const extension = path
    .extname(relativePath)
    .toLowerCase();
  const previewMode =
    getLibraryArtworkPreviewMode(extension);

  if (previewMode === "unsupported") {
    sendJson(response, 415, {
      error: "Unsupported artwork preview file type",
    });
    return;
  }

  const mediaRoot = await resolveMediaRoot();
  const candidatePath = assertPathWithinRoot(
    mediaRoot,
    path.join(mediaRoot, relativePath),
  );
  const canonicalPath = await realpath(candidatePath);
  assertPathWithinRoot(mediaRoot, canonicalPath);

  const fileStatus = await stat(canonicalPath);

  if (!fileStatus.isFile()) {
    throw new Error("Artwork preview target is not a regular file.");
  }

  const content =
    previewMode === "tiff-transcode"
      ? await renderTiffArtworkPreview(canonicalPath)
      : await readFile(canonicalPath);
  const contentType =
    previewMode === "tiff-transcode"
      ? "image/png"
      : artworkContentTypes.get(extension);

  if (!contentType) {
    throw new Error("Artwork preview content type is unavailable.");
  }

  response.statusCode = 200;
  response.setHeader("Content-Type", contentType);
  response.setHeader(
    "Cache-Control",
    "private, max-age=60",
  );
  response.setHeader(
    "X-Content-Type-Options",
    "nosniff",
  );
  response.setHeader(
    "X-Artwork-Preview-Source",
    previewMode,
  );
  response.end(content);
}

let audioPreviewCapabilitiesPromise:
  ReturnType<typeof detectFfmpegCapabilities> | null =
    null;

function getAudioPreviewFfmpegCapabilities() {
  audioPreviewCapabilitiesPromise ??=
    detectFfmpegCapabilities();

  return audioPreviewCapabilitiesPromise;
}

function setAudioPreviewResponseHeaders(
  response: ServerResponse,
  sourceKind: AudioPreviewSourceKind,
  deliveryMode: "direct" | "transcoded",
): void {
  response.setHeader(
    "Cache-Control",
    "private, no-store",
  );
  response.setHeader(
    "X-Content-Type-Options",
    "nosniff",
  );
  response.setHeader(
    "X-Audio-Preview-Source",
    sourceKind,
  );
  response.setHeader(
    "X-Audio-Preview-Delivery",
    deliveryMode,
  );
}

async function sendTranscodedAudioPreview(
  request: IncomingMessage,
  response: ServerResponse,
  sourcePath: string,
  sourceKind: AudioPreviewSourceKind,
): Promise<void> {
  const capabilities =
    await getAudioPreviewFfmpegCapabilities();

  let encoder: string;

  try {
    encoder =
      selectAudioPreviewMp3Encoder(
        capabilities,
      );
  } catch (error) {
    sendJson(response, 503, {
      error:
        error instanceof Error
          ? error.message
          : "Live audio preview transcoding is unavailable.",
    });
    return;
  }

  response.statusCode = 200;
  response.setHeader(
    "Content-Type",
    "audio/mpeg",
  );
  setAudioPreviewResponseHeaders(
    response,
    sourceKind,
    "transcoded",
  );

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  await new Promise<void>((resolve) => {
    const child = spawn(
      capabilities.executable,
      buildAudioPreviewTranscodeArgs(
        sourcePath,
        encoder,
      ),
      {
        stdio: [
          "ignore",
          "pipe",
          "pipe",
        ],
      },
    );
    let stderr = "";
    let settled = false;

    const settle = () => {
      if (settled) {
        return;
      }

      settled = true;
      request.removeListener(
        "aborted",
        stopChild,
      );
      response.removeListener(
        "close",
        stopChild,
      );
      resolve();
    };

    const stopChild = () => {
      if (!child.killed) {
        child.kill("SIGKILL");
      }
    };

    child.stderr.on("data", (chunk) => {
      if (stderr.length < 16_384) {
        stderr += chunk.toString();
      }
    });

    child.once("spawn", () => {
      child.stdout.pipe(response);
    });

    child.once("error", (error) => {
      if (!response.headersSent) {
        sendJson(response, 503, {
          error:
            `Unable to start FFmpeg preview transcoding: ${error.message}`,
        });
      } else if (!response.destroyed) {
        response.destroy(error);
      }

      settle();
    });

    child.once("close", (code, signal) => {
      if (
        code !== 0 &&
        !request.destroyed &&
        !response.destroyed
      ) {
        const reason = stderr.trim() ||
          `FFmpeg exited with code ${String(code)}${
            signal ? ` (${signal})` : ""
          }.`;

        if (!response.headersSent) {
          sendJson(response, 415, {
            error:
              `Unable to decode this audio preview source: ${reason}`,
          });
        } else {
          response.destroy(
            new Error(reason),
          );
        }
      }

      settle();
    });

    request.once("aborted", stopChild);
    response.once("close", stopChild);
  });
}

async function sendAudioFilePreview(
  request: IncomingMessage,
  response: ServerResponse,
  sourcePath: string,
  extension: string,
  sourceKind: AudioPreviewSourceKind,
): Promise<void> {
  const fileStats = await stat(sourcePath);

  if (!fileStats.isFile()) {
    throw new Error(
      "Audio preview source is not a regular file.",
    );
  }

  if (fileStats.size <= 0) {
    throw new Error(
      "Audio preview source is empty.",
    );
  }

  const deliveryMode =
    getAudioPreviewDeliveryMode(extension);

  if (deliveryMode === "transcoded") {
    await sendTranscodedAudioPreview(
      request,
      response,
      sourcePath,
      sourceKind,
    );
    return;
  }

  const contentType =
    getAudioPreviewContentType(extension);

  if (!contentType) {
    response.statusCode = 415;
    response.end();
    return;
  }

  let range = null;

  try {
    range = parseSingleByteRange(
      request.headers.range,
      fileStats.size,
    );
  } catch {
    response.statusCode = 416;
    response.setHeader(
      "Content-Range",
      `bytes */${fileStats.size}`,
    );
    response.end();
    return;
  }

  const start = range?.start ?? 0;
  const end =
    range?.end ?? Math.max(0, fileStats.size - 1);
  const contentLength = end - start + 1;

  response.statusCode = range ? 206 : 200;
  response.setHeader("Content-Type", contentType);
  response.setHeader(
    "Content-Length",
    String(contentLength),
  );
  response.setHeader("Accept-Ranges", "bytes");
  setAudioPreviewResponseHeaders(
    response,
    sourceKind,
    "direct",
  );

  if (range) {
    response.setHeader(
      "Content-Range",
      `bytes ${start}-${end}/${fileStats.size}`,
    );
  }

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  const stream = createReadStream(
    sourcePath,
    { start, end },
  );

  stream.on("error", () => {
    if (!response.headersSent) {
      response.statusCode = 500;
    }

    response.destroy();
  });
  stream.pipe(response);
}

async function sendIngestAudioPreview(
  request: IncomingMessage,
  response: ServerResponse,
  relativePath: string,
): Promise<void> {
  const ingestRoot = await resolveIngestRoot();
  const source =
    await resolveIngestAudioPreviewSource(
      ingestRoot,
      relativePath,
    );

  await sendAudioFilePreview(
    request,
    response,
    source.canonicalPath,
    source.extension,
    "ingest",
  );
}

async function sendLibraryAudioPreview(
  request: IncomingMessage,
  response: ServerResponse,
  releaseId: string,
  trackId: string,
): Promise<void> {
  const mediaRoot = await resolveMediaRoot();
  const release = await scanReleaseById(
    mediaRoot,
    releaseId,
  );

  if (!release) {
    throw new Error(
      `Release not found: ${releaseId}`,
    );
  }

  const track = release.tracks.find(
    (candidate) => candidate.id === trackId,
  );

  if (!track) {
    throw new Error(
      `Track not found: ${trackId}`,
    );
  }

  const selection =
    selectTrackAudioPreview(track);
  const candidatePath = assertPathWithinRoot(
    mediaRoot,
    path.join(
      mediaRoot,
      selection.asset.relativePath,
    ),
  );
  const canonicalPath = await realpath(
    candidatePath,
  );
  assertPathWithinRoot(mediaRoot, canonicalPath);

  await sendAudioFilePreview(
    request,
    response,
    canonicalPath,
    selection.asset.extension,
    selection.sourceKind,
  );
}

async function sendLibraryWaveform(
  response: ServerResponse,
  releaseId: string,
  trackId: string,
): Promise<void> {
  const mediaRoot = await resolveMediaRoot();
  const release = await scanReleaseById(
    mediaRoot,
    releaseId,
  );

  if (!release) {
    throw new Error(
      `Release not found: ${releaseId}`,
    );
  }

  const track = release.tracks.find(
    (candidate) => candidate.id === trackId,
  );

  if (!track) {
    throw new Error(
      `Track not found: ${trackId}`,
    );
  }

  const candidates = [
    {
      filename: WAVEFORM_BINARY_FILENAME,
      contentType: WAVEFORM_BINARY_CONTENT_TYPE,
    },
    {
      filename: "waveform-peaks.json",
      contentType: "application/json; charset=utf-8",
    },
  ] as const;

  let selected:
    | { canonicalPath: string; contentType: string }
    | null = null;

  for (const candidate of candidates) {
    const candidatePath = assertPathWithinRoot(
      mediaRoot,
      path.join(
        mediaRoot,
        track.relativePath,
        candidate.filename,
      ),
    );

    try {
      const canonicalPath = await realpath(candidatePath);
      assertPathWithinRoot(mediaRoot, canonicalPath);
      const fileStatus = await stat(canonicalPath);

      if (!fileStatus.isFile()) {
        continue;
      }

      selected = {
        canonicalPath,
        contentType: candidate.contentType,
      };
      break;
    } catch (error) {
      const code =
        error &&
        typeof error === "object" &&
        "code" in error
          ? String(error.code)
          : "";

      if (code !== "ENOENT") {
        throw error;
      }
    }
  }

  if (!selected) {
    throw new Error(
      "Waveform data is not prepared for this Library track.",
    );
  }

  const content = await readFile(selected.canonicalPath);
  decodeWaveformPayload(content);

  response.statusCode = 200;
  response.setHeader(
    "Content-Type",
    selected.contentType,
  );
  response.setHeader(
    "Cache-Control",
    "private, no-store",
  );
  response.setHeader(
    "X-Content-Type-Options",
    "nosniff",
  );
  response.end(content);
}

async function sendLibraryVideoPreview(
  request: IncomingMessage,
  response: ServerResponse,
  releaseId: string,
  videoId: string,
): Promise<void> {
  const mediaRoot = await resolveMediaRoot();
  const release = await scanReleaseById(
    mediaRoot,
    releaseId,
  );

  if (!release) {
    throw new Error(
      `Release not found: ${releaseId}`,
    );
  }

  const video = (release.videos ?? []).find(
    (candidate) => candidate.id === videoId,
  );

  if (!video) {
    throw new Error(
      `Video not found: ${videoId}`,
    );
  }

  const master = selectVideoPreviewMaster(video);
  const contentType =
    getVideoPreviewContentType(master.extension);

  if (!contentType) {
    sendJson(response, 415, {
      error:
        "Browser-direct preview is not available for this canonical video container. The master remains intact; a future derivative workflow can provide a browser-compatible preview.",
    });
    return;
  }

  const candidatePath = assertPathWithinRoot(
    mediaRoot,
    path.join(
      mediaRoot,
      master.relativePath,
    ),
  );
  const canonicalPath = await realpath(
    candidatePath,
  );
  assertPathWithinRoot(
    mediaRoot,
    canonicalPath,
  );

  const fileStats = await stat(canonicalPath);

  if (!fileStats.isFile()) {
    throw new Error(
      "Video preview source is not a regular file.",
    );
  }

  if (fileStats.size <= 0) {
    throw new Error(
      "Video preview source is empty.",
    );
  }

  let range = null;

  try {
    range = parseSingleByteRange(
      request.headers.range,
      fileStats.size,
    );
  } catch {
    response.statusCode = 416;
    response.setHeader(
      "Content-Range",
      `bytes */${fileStats.size}`,
    );
    response.end();
    return;
  }

  const start = range?.start ?? 0;
  const end =
    range?.end ?? Math.max(0, fileStats.size - 1);
  const contentLength = end - start + 1;

  response.statusCode = range ? 206 : 200;
  response.setHeader(
    "Content-Type",
    contentType,
  );
  response.setHeader(
    "Content-Length",
    String(contentLength),
  );
  response.setHeader(
    "Accept-Ranges",
    "bytes",
  );
  response.setHeader(
    "Cache-Control",
    "no-store",
  );
  response.setHeader(
    "X-Metadata-Editor-Source",
    "canonical-video-master",
  );

  if (range) {
    response.setHeader(
      "Content-Range",
      `bytes ${start}-${end}/${fileStats.size}`,
    );
  }

  if (request.method === "HEAD") {
    response.end();
    return;
  }

  const stream = createReadStream(
    canonicalPath,
    { start, end },
  );

  stream.on("error", () => {
    if (!response.headersSent) {
      response.statusCode = 500;
    }

    response.destroy();
  });
  stream.pipe(response);
}

function assertIngestSourcesReviewed(
  body: Record<string, unknown>,
  draft: ReturnType<
    typeof parseIngestBuildDraft
  >,
): void {
  /*
   * Older local callers may not yet send source status data. The
   * browser workflow always sends it and receives the review gate.
   */
  if (!Array.isArray(body.sourceStatuses)) {
    return;
  }

  const stored = parseStoredIngestDraft({
    schemaVersion:
      INGEST_DRAFT_SCHEMA_VERSION,
    candidateId: draft.candidateId,
    updatedAt: new Date().toISOString(),
    draft,
    sourceStatuses:
      body.sourceStatuses,
  });
  const blocking =
    buildBlockingSourceStatuses(
      draft,
      stored.sourceStatuses,
    );

  if (blocking.length > 0) {
    throw new Error(
      `Review or exclude changed ingest sources before building: ${blocking
        .map((status) =>
          `${status.sourceRelativePath} (${status.state})`,
        )
        .join(", ")}`,
    );
  }
}

async function inspectDraftSources(
  ingestRoot: string,
  candidateId: string,
  sourceRelativePaths: string[],
) {
  const inspection =
    await inspectIngestCandidate(
      ingestRoot,
      candidateId,
      process.env.INGEST_ROOT ??
        defaultIngestRoot,
    );
  const existingPaths = new Set(
    inspection.files.map((file) =>
      file.relativePath,
    ),
  );
  const additionalPaths = [
    ...new Set(sourceRelativePaths),
  ].filter(
    (relativePath) =>
      !existingPaths.has(relativePath),
  );

  if (additionalPaths.length === 0) {
    return inspection;
  }

  return {
    ...inspection,
    files: [
      ...inspection.files,
      ...(await inspectIngestRelativeFiles(
        ingestRoot,
        additionalPaths,
      )),
    ],
  };
}

export {
  host,
  port,
  metadataStorageFilenames,
  assertMetadataFieldMayBeRemoved,
  assertMetadataFieldMayBeCreated,
  assertCanonicalMetadataValue,
  parseGenerationScope,
  sendJson,
  artworkContentTypes,
  sendIngestArtworkPreview,
  sendLibraryArtwork,
  sendLibraryArtworkPreview,
  audioPreviewCapabilitiesPromise,
  getAudioPreviewFfmpegCapabilities,
  setAudioPreviewResponseHeaders,
  sendTranscodedAudioPreview,
  sendAudioFilePreview,
  sendIngestAudioPreview,
  sendLibraryAudioPreview,
  sendLibraryWaveform,
  sendLibraryVideoPreview,
  assertIngestSourcesReviewed,
  inspectDraftSources,
};
