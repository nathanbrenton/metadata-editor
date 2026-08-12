import {
  createReadStream,
} from "node:fs";
import {
  spawn,
} from "node:child_process";
import {
  readFile,
  realpath,
  stat,
} from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import path from "node:path";

import {
  buildBlockingSourceStatuses,
  INGEST_DRAFT_SCHEMA_VERSION,
} from "../shared/ingest-drafts.js";
import { isValidTuningReference } from "../shared/musical-analysis.js";
import {
  findProductionContextField,
} from "../shared/production-context.js";

import {
  buildAudioPreviewTranscodeArgs,
  getAudioPreviewContentType,
  getAudioPreviewDeliveryMode,
  parseSingleByteRange,
  selectAudioPreviewMp3Encoder,
  selectTrackAudioPreview,
  type AudioPreviewSourceKind,
} from "./audio-preview.js";
import { buildMetadataExportPlan } from "./export-plan.js";
import {
  executeValidatedExportPlan,
} from "./export-executor.js";
import {
  resolveExportOutputRoot,
  validateMetadataExportPlan,
} from "./export-validator.js";
import {
  detectFfmpegCapabilities,
} from "./ffmpeg-capabilities.js";
import {
  buildMediaProcessingPlan,
} from "./media-processing/plan.js";
import {
  buildMetadataGenerationPlan,
  buildSingleMetadataDocumentPlan,
} from "./generation-plan.js";
import { readJsonBody } from "./http.js";
import {
  inspectIngestCandidate,
  inspectIngestRelativeFiles,
  listIngestAttachmentOptions,
  scanIngestDrop,
} from "./ingest-scanner.js";
import {
  defaultIngestRoot,
  resolveIngestRoot,
} from "./ingest-root.js";
import {
  readEmbeddedIngestArtworkPreview,
  readIngestArtworkPreview,
} from "./ingest-artwork.js";
import {
  getLibraryArtworkPreviewMode,
  renderTiffArtworkPreview,
} from "./library-artwork-preview.js";
import {
  getVideoPreviewContentType,
  selectVideoPreviewMaster,
} from "./video-preview.js";
import {
  readVideoMetadataForEdit,
  saveVideoMetadataEdits,
} from "./video-metadata.js";
import {
  resolveIngestAudioPreviewSource,
} from "./ingest-audio.js";
import {
  deleteStoredIngestDraft,
  parseStoredIngestDraft,
  readStoredIngestDraft,
  writeStoredIngestDraft,
} from "./ingest-draft-store.js";
import {
  defaultIngestOutputRoot,
  executeIngestReleaseBuild,
  inspectIngestStagingTarget,
  parseIngestBuildDraft,
  prepareIngestReleaseBuild,
  resolveIngestOutputRoot,
} from "./ingest-builder.js";
import { buildMetadataPreview } from "./inference.js";
import {
  findMetadataField,
  metadataFieldRegistry,
} from "./metadata-registry.js";
import {
  assertPathWithinRoot,
  resolveMediaRoot,
} from "./media-root.js";
import { readReleaseMetadataDetail } from "./metadata-reader.js";
import {
  buildPerformerReplacementInputs,
  planPerformerCopyToTarget,
  readCopyablePerformerRecords,
  selectPerformerRecords,
  type PerformerCopyTargetPlan,
} from "./performer-copy.js";
import { saveScalarMetadataChanges } from "./metadata-saver.js";
import {
  buildTrackDirectoryRenamePlan,
  executeTrackDirectoryRenamePlan,
} from "./track-directory-sync.js";
import {
  normalizeSampleClearanceRequest,
  normalizeSampleRelationshipRequest,
} from "./sample-record-request.js";
import {
  getReleaseNumberingTotalsFromChanges,
  synchronizeTrackNumberingTotals,
} from "./numbering-sync.js";
import {
  buildStarterMetadataPlan,
  type StarterMetadataInput,
} from "./starter-metadata.js";
import { executeMetadataCreationPlan } from "./metadata-writer.js";
import { buildGeneratedTomlPreview } from "./toml-preview.js";
import {
  scanMediaLibrary,
  scanReleaseById,
} from "./scanner.js";
import {
  buildReleaseRenamePlan,
  executeReleaseRenamePlan,
} from "./release-rename.js";
import {
  buildPublishPlan,
} from "./publish-plan.js";
import {
  publishReleasePackage,
} from "./publish-writer.js";
import {
  buildPublicReleaseUnpublishPlan,
  unpublishPublicRelease,
} from "./publication-membership.js";
import {
  listPublishOperations,
  recoverPublishOperation,
} from "./publish-operations.js";
import {
  buildPublishFleetSummary,
} from "./publish-fleet.js";
import {
  auditPublishedMediaDeployment,
  writePublishedMediaDeploymentManifest,
} from "./published-media-deployment.js";
import {
  buildPublishedMediaDeploymentSyncPlan,
  buildPublishedMediaDeploymentTargetStatus,
  executePublishedMediaDeployment,
  rollbackPublishedMediaDeployment,
} from "./deployment-sync.js";
import {
  prepareReleaseMedia,
} from "./media-processing/prepare.js";
import {
  prepareReleaseVideoWebStreams,
} from "./media-processing/video-prepare.js";
import {
  buildVideoWebStreamPlan,
} from "./media-processing/video-web-stream.js";
import {
  readMediaPreparationProgress,
  recordMediaPreparationProgress,
} from "./media-processing/progress.js";
import {
  readWorkflowLocations,
  resolvePublishRoot,
} from "./workflow-locations.js";

import {
  auditMediaLibraryTechnical,
} from "./media-technical-audit.js";

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

  const candidatePath = assertPathWithinRoot(
    mediaRoot,
    path.join(
      mediaRoot,
      track.relativePath,
      "waveform-peaks.json",
    ),
  );
  const canonicalPath = await realpath(candidatePath);
  assertPathWithinRoot(mediaRoot, canonicalPath);

  const fileStatus = await stat(canonicalPath);
  if (!fileStatus.isFile()) {
    throw new Error(
      "Waveform target is not a regular file.",
    );
  }

  const content = await readFile(canonicalPath, "utf8");
  JSON.parse(content);

  response.statusCode = 200;
  response.setHeader(
    "Content-Type",
    "application/json; charset=utf-8",
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

const server = createServer(
  async (request, response) => {
    const requestUrl = new URL(
      request.url ?? "/",
      `http://${host}:${port}`,
    );

    if (
      request.method === "GET" &&
      requestUrl.pathname === "/api/workflow/locations"
    ) {
      try {
        sendJson(response, 200, await readWorkflowLocations());
      } catch (error) {
        sendJson(response, 500, {
          error:
            error instanceof Error
              ? error.message
              : "Unknown workflow location error",
        });
      }

      return;
    }

    if (
      request.method === "GET" &&
      requestUrl.pathname === "/api/ingest/scan"
    ) {
      try {
        const ingestRoot = await resolveIngestRoot();
        const configuredRoot =
          process.env.INGEST_ROOT ?? defaultIngestRoot;

        sendJson(
          response,
          200,
          await scanIngestDrop(
            ingestRoot,
            configuredRoot,
          ),
        );
      } catch (error) {
        sendJson(response, 500, {
          error:
            error instanceof Error
              ? error.message
              : "Unknown ingest scan error",
        });
      }

      return;
    }

    if (
      request.method === "GET" &&
      requestUrl.pathname ===
        "/api/ingest/candidate"
    ) {
      const candidateId =
        requestUrl.searchParams.get("candidate");

      if (!candidateId) {
        sendJson(response, 400, {
          error: "Missing candidate query parameter",
        });
        return;
      }

      try {
        const ingestRoot = await resolveIngestRoot();
        const configuredRoot =
          process.env.INGEST_ROOT ?? defaultIngestRoot;

        sendJson(
          response,
          200,
          await inspectIngestCandidate(
            ingestRoot,
            candidateId,
            configuredRoot,
          ),
        );
      } catch (error) {
        sendJson(response, 400, {
          error:
            error instanceof Error
              ? error.message
              : "Unknown ingest inspection error",
        });
      }

      return;
    }

    if (
      request.method === "GET" &&
      requestUrl.pathname ===
        "/api/ingest/attachments"
    ) {
      const candidateId =
        requestUrl.searchParams.get("candidate");

      if (!candidateId) {
        sendJson(response, 400, {
          error: "Missing candidate query parameter",
        });
        return;
      }

      try {
        const ingestRoot =
          await resolveIngestRoot();

        sendJson(
          response,
          200,
          await listIngestAttachmentOptions(
            ingestRoot,
            candidateId,
          ),
        );
      } catch (error) {
        sendJson(response, 400, {
          error:
            error instanceof Error
              ? error.message
              : "Unknown ingest attachment error",
        });
      }

      return;
    }

    if (
      request.method === "GET" &&
      requestUrl.pathname ===
        "/api/ingest/draft"
    ) {
      const candidateId =
        requestUrl.searchParams.get("candidate");

      if (!candidateId) {
        sendJson(response, 400, {
          error: "Missing candidate query parameter",
        });
        return;
      }

      try {
        sendJson(response, 200, {
          draft: await readStoredIngestDraft(
            candidateId,
          ),
        });
      } catch (error) {
        sendJson(response, 500, {
          error:
            error instanceof Error
              ? error.message
              : "Unknown ingest draft read error",
        });
      }

      return;
    }

    if (
      request.method === "PUT" &&
      requestUrl.pathname ===
        "/api/ingest/draft"
    ) {
      try {
        const body = await readJsonBody(request);

        sendJson(
          response,
          200,
          await writeStoredIngestDraft(body),
        );
      } catch (error) {
        sendJson(response, 400, {
          error:
            error instanceof Error
              ? error.message
              : "Unknown ingest draft write error",
        });
      }

      return;
    }

    if (
      request.method === "DELETE" &&
      requestUrl.pathname ===
        "/api/ingest/draft"
    ) {
      const candidateId =
        requestUrl.searchParams.get("candidate");

      if (!candidateId) {
        sendJson(response, 400, {
          error: "Missing candidate query parameter",
        });
        return;
      }

      try {
        await deleteStoredIngestDraft(
          candidateId,
        );
        sendJson(response, 200, {
          deleted: true,
        });
      } catch (error) {
        sendJson(response, 500, {
          error:
            error instanceof Error
              ? error.message
              : "Unknown ingest draft delete error",
        });
      }

      return;
    }

    if (
      request.method === "GET" &&
      requestUrl.pathname ===
        "/api/ingest/artwork"
    ) {
      const relativePath =
        requestUrl.searchParams.get("path");

      if (!relativePath) {
        sendJson(response, 400, {
          error: "Missing ingest artwork path",
        });
        return;
      }

      const streamValue = requestUrl.searchParams.get("stream");
      const streamIndex = streamValue === null
        ? undefined
        : Number(streamValue);

      if (
        streamValue !== null &&
        (streamIndex === undefined ||
          !Number.isInteger(streamIndex) ||
          streamIndex < 0)
      ) {
        sendJson(response, 400, {
          error:
            "Invalid embedded artwork stream index",
        });
        return;
      }

      try {
        await sendIngestArtworkPreview(
          response,
          relativePath,
          streamIndex,
          requestUrl.searchParams.get("codec") ?? undefined,
        );
      } catch (error) {
        sendJson(response, 404, {
          error:
            error instanceof Error
              ? error.message
              : "Ingest artwork preview not found",
        });
      }

      return;
    }

    if (
      (request.method === "GET" ||
        request.method === "HEAD") &&
      requestUrl.pathname ===
        "/api/ingest/audio-preview"
    ) {
      const relativePath =
        requestUrl.searchParams.get("path");

      if (!relativePath) {
        sendJson(response, 400, {
          error: "Missing ingest audio path",
        });
        return;
      }

      try {
        await sendIngestAudioPreview(
          request,
          response,
          relativePath,
        );
      } catch (error) {
        sendJson(response, 404, {
          error:
            error instanceof Error
              ? error.message
              : "Ingest audio preview not found",
        });
      }

      return;
    }

    if (
      request.method === "GET" &&
      requestUrl.pathname ===
        "/api/ingest/staging-target"
    ) {
      const releaseId =
        requestUrl.searchParams.get("release");

      if (!releaseId) {
        sendJson(response, 400, {
          error: "Missing staging release ID",
        });
        return;
      }

      try {
        const outputRoot =
          await resolveIngestOutputRoot();
        sendJson(
          response,
          200,
          await inspectIngestStagingTarget(
            outputRoot,
            releaseId,
          ),
        );
      } catch (error) {
        sendJson(response, 400, {
          error:
            error instanceof Error
              ? error.message
              : "Unknown staging-target error",
        });
      }

      return;
    }

    if (
      request.method === "POST" &&
      requestUrl.pathname ===
        "/api/ingest/build-preview"
    ) {
      try {
        const body = await readJsonBody(request);

        if (
          typeof body !== "object" ||
          body === null ||
          Array.isArray(body) ||
          !("draft" in body)
        ) {
          throw new Error(
            "Request must contain an ingest build draft.",
          );
        }

        const draft = parseIngestBuildDraft(
          body.draft,
        );
        assertIngestSourcesReviewed(
          body as Record<string, unknown>,
          draft,
        );
        const ingestRoot =
          await resolveIngestRoot();
        const outputRoot =
          await resolveIngestOutputRoot();
        const inspection =
          await inspectDraftSources(
            ingestRoot,
            draft.candidateId,
            [
              ...draft.tracks
                .filter((track) => track.include)
                .map((track) =>
                  track.sourceRelativePath,
                ),
              ...draft.assets
                .filter((asset) => asset.include)
                .map((asset) =>
                  asset.embeddedArtwork?.audioSourceRelativePath ??
                  asset.sourceRelativePath,
                ),
            ],
          );
        const prepared =
          await prepareIngestReleaseBuild(
            ingestRoot,
            outputRoot,
            inspection,
            draft,
            process.env.INGEST_OUTPUT_ROOT ??
              defaultIngestOutputRoot,
          );

        sendJson(
          response,
          200,
          prepared.preview,
        );
      } catch (error) {
        sendJson(response, 400, {
          error:
            error instanceof Error
              ? error.message
              : "Unknown ingest build-preview error",
        });
      }

      return;
    }

    if (
      request.method === "POST" &&
      requestUrl.pathname ===
        "/api/ingest/build"
    ) {
      try {
        const body = await readJsonBody(request);

        if (
          typeof body !== "object" ||
          body === null ||
          Array.isArray(body) ||
          !("draft" in body) ||
          !("confirmation" in body)
        ) {
          throw new Error(
            "Request must contain an ingest build draft and confirmation.",
          );
        }

        const draft = parseIngestBuildDraft(
          body.draft,
        );
        assertIngestSourcesReviewed(
          body as Record<string, unknown>,
          draft,
        );

        if (
          typeof body.confirmation !== "string"
        ) {
          throw new Error(
            "Ingest confirmation must be text.",
          );
        }

        const ingestRoot =
          await resolveIngestRoot();
        const outputRoot =
          await resolveIngestOutputRoot();
        const inspection =
          await inspectDraftSources(
            ingestRoot,
            draft.candidateId,
            [
              ...draft.tracks
                .filter((track) => track.include)
                .map((track) =>
                  track.sourceRelativePath,
                ),
              ...draft.assets
                .filter((asset) => asset.include)
                .map((asset) =>
                  asset.embeddedArtwork?.audioSourceRelativePath ??
                  asset.sourceRelativePath,
                ),
            ],
          );
        const result =
          await executeIngestReleaseBuild(
            ingestRoot,
            outputRoot,
            inspection,
            draft,
            body.confirmation,
            process.env.INGEST_OUTPUT_ROOT ??
              defaultIngestOutputRoot,
          );

        sendJson(
          response,
          result.operation === "create" ? 201 : 200,
          result,
        );
      } catch (error) {
        sendJson(response, 400, {
          error:
            error instanceof Error
              ? error.message
              : "Unknown ingest build error",
        });
      }

      return;
    }

    if (
      (request.method === "GET" ||
        request.method === "HEAD") &&
      requestUrl.pathname ===
        "/api/library/audio-preview"
    ) {
      const releaseId =
        requestUrl.searchParams.get("release");
      const trackId =
        requestUrl.searchParams.get("track");

      if (!releaseId || !trackId) {
        sendJson(response, 400, {
          error:
            "Missing release or track query parameter",
        });
        return;
      }

      try {
        await sendLibraryAudioPreview(
          request,
          response,
          releaseId,
          trackId,
        );
      } catch (error) {
        sendJson(response, 404, {
          error:
            error instanceof Error
              ? error.message
              : "Audio preview not found",
        });
      }

      return;
    }

    if (
      request.method === "GET" &&
      requestUrl.pathname ===
        "/api/library/waveform"
    ) {
      const releaseId =
        requestUrl.searchParams.get("release");
      const trackId =
        requestUrl.searchParams.get("track");

      if (!releaseId || !trackId) {
        sendJson(response, 400, {
          error:
            "Missing release or track query parameter",
        });
        return;
      }

      try {
        await sendLibraryWaveform(
          response,
          releaseId,
          trackId,
        );
      } catch {
        sendJson(response, 404, {
          error:
            "Waveform data is not prepared for this Library track.",
        });
      }

      return;
    }

    if (
      request.method === "GET" &&
      requestUrl.pathname ===
        "/api/library/video-metadata"
    ) {
      const releaseId =
        requestUrl.searchParams.get("release");
      const videoId =
        requestUrl.searchParams.get("video");

      if (!releaseId || !videoId) {
        sendJson(response, 400, {
          error:
            "Missing release or video query parameter",
        });
        return;
      }

      try {
        const mediaRoot = await resolveMediaRoot();
        const release = await scanReleaseById(
          mediaRoot,
          releaseId,
        );

        if (!release) {
          sendJson(response, 404, {
            error: "Release not found",
          });
          return;
        }

        sendJson(
          response,
          200,
          await readVideoMetadataForEdit(
            mediaRoot,
            release,
            videoId,
          ),
        );
      } catch (error) {
        sendJson(response, 409, {
          error:
            error instanceof Error
              ? error.message
              : "Unable to read video metadata",
        });
      }

      return;
    }

    if (
      request.method === "POST" &&
      requestUrl.pathname ===
        "/api/library/save-video-metadata"
    ) {
      try {
        const body = await readJsonBody(request);

        if (
          typeof body !== "object" ||
          body === null
        ) {
          sendJson(response, 400, {
            error: "Expected a JSON object",
          });
          return;
        }

        const releaseId =
          "releaseId" in body &&
          typeof body.releaseId === "string"
            ? body.releaseId
            : null;
        const videoId =
          "videoId" in body &&
          typeof body.videoId === "string"
            ? body.videoId
            : null;
        const originalSha256 =
          "originalSha256" in body &&
          typeof body.originalSha256 === "string"
            ? body.originalSha256
            : null;

        if (
          !releaseId ||
          !videoId ||
          !originalSha256 ||
          !("title" in body) ||
          !("videoType" in body) ||
          !("relatedTrackId" in body)
        ) {
          sendJson(response, 400, {
            error:
              "releaseId, videoId, originalSha256, title, videoType, and relatedTrackId are required",
          });
          return;
        }

        const mediaRoot = await resolveMediaRoot();
        const release = await scanReleaseById(
          mediaRoot,
          releaseId,
        );

        if (!release) {
          sendJson(response, 404, {
            error: "Release not found",
          });
          return;
        }

        sendJson(
          response,
          200,
          await saveVideoMetadataEdits(
            mediaRoot,
            release,
            {
              videoId,
              originalSha256,
              title: body.title,
              videoType: body.videoType,
              description:
                "description" in body ? body.description : "",
              date:
                "date" in body ? body.date : "",
              location:
                "location" in body ? body.location : "",
              director:
                "director" in body ? body.director : "",
              cameraOperator:
                "cameraOperator" in body
                  ? body.cameraOperator
                  : "",
              displayOrder:
                "displayOrder" in body
                  ? body.displayOrder
                  : 1,
              posterTimeSeconds:
                "posterTimeSeconds" in body
                  ? body.posterTimeSeconds
                  : null,
              relatedTrackId: body.relatedTrackId,
            },
          ),
        );
      } catch (error) {
        sendJson(response, 409, {
          error:
            error instanceof Error
              ? error.message
              : "Unable to save video metadata",
        });
      }

      return;
    }

    if (
      request.method === "GET" &&
      requestUrl.pathname ===
        "/api/library/video-poster"
    ) {
      const releaseId =
        requestUrl.searchParams.get("release");
      const videoId =
        requestUrl.searchParams.get("video");

      if (!releaseId || !videoId) {
        sendJson(response, 400, {
          error:
            "Missing release or video query parameter",
        });
        return;
      }

      try {
        const mediaRoot = await resolveMediaRoot();
        const release = await scanReleaseById(
          mediaRoot,
          releaseId,
        );
        const video = (release?.videos ?? []).find(
          (candidate) => candidate.id === videoId,
        );

        if (!release || !video) {
          throw new Error("Video not found");
        }

        const posterRelativePath = path.posix.join(
          video.relativePath.replaceAll("\\", "/"),
          "stream",
          "poster.png",
        );
        const posterPath = assertPathWithinRoot(
          mediaRoot,
          path.join(mediaRoot, posterRelativePath),
        );
        const canonicalPosterPath =
          await realpath(posterPath);
        assertPathWithinRoot(
          mediaRoot,
          canonicalPosterPath,
        );
        const posterStats =
          await stat(canonicalPosterPath);

        if (
          !posterStats.isFile() ||
          posterStats.size <= 0
        ) {
          throw new Error(
            "Prepared video poster is unavailable",
          );
        }

        response.statusCode = 200;
        response.setHeader(
          "Content-Type",
          "image/png",
        );
        response.setHeader(
          "Cache-Control",
          "private, max-age=60",
        );
        response.setHeader(
          "X-Content-Type-Options",
          "nosniff",
        );
        response.setHeader(
          "X-Metadata-Editor-Source",
          "prepared-video-poster",
        );
        response.end(
          await readFile(canonicalPosterPath),
        );
      } catch (error) {
        sendJson(response, 404, {
          error:
            error instanceof Error
              ? error.message
              : "Video poster not found",
        });
      }

      return;
    }

    if (
      (request.method === "GET" ||
        request.method === "HEAD") &&
      requestUrl.pathname ===
        "/api/library/video-preview"
    ) {
      const releaseId =
        requestUrl.searchParams.get("release");
      const videoId =
        requestUrl.searchParams.get("video");

      if (!releaseId || !videoId) {
        sendJson(response, 400, {
          error:
            "Missing release or video query parameter",
        });
        return;
      }

      try {
        await sendLibraryVideoPreview(
          request,
          response,
          releaseId,
          videoId,
        );
      } catch (error) {
        sendJson(response, 404, {
          error:
            error instanceof Error
              ? error.message
              : "Video preview not found",
        });
      }

      return;
    }

    if (
      request.method === "GET" &&
      requestUrl.pathname ===
        "/api/library/artwork-preview"
    ) {
      const relativePath =
        requestUrl.searchParams.get("path");

      if (!relativePath) {
        sendJson(response, 400, {
          error: "Missing artwork preview path",
        });
        return;
      }

      try {
        await sendLibraryArtworkPreview(
          response,
          relativePath,
        );
      } catch (error) {
        sendJson(response, 500, {
          error:
            error instanceof Error
              ? error.message
              : "Artwork preview unavailable",
        });
      }

      return;
    }

    if (
      request.method === "GET" &&
      requestUrl.pathname ===
        "/api/library/artwork"
    ) {
      const relativePath =
        requestUrl.searchParams.get("path");

      if (!relativePath) {
        sendJson(response, 400, {
          error: "Missing artwork path",
        });
        return;
      }

      try {
        await sendLibraryArtwork(
          response,
          relativePath,
        );
      } catch (error) {
        sendJson(response, 404, {
          error:
            error instanceof Error
              ? error.message
              : "Artwork not found",
        });
      }

      return;
    }

    if (
      request.method === "GET" &&
      requestUrl.pathname ===
        "/api/ffmpeg/capabilities"
    ) {
      sendJson(
        response,
        200,
        await detectFfmpegCapabilities(),
      );
      return;
    }

    if (
      request.method === "GET" &&
      requestUrl.pathname ===
        "/api/media-processing/plan"
    ) {
      try {
        const releaseId =
          requestUrl.searchParams.get(
            "release",
          );
        const trackId =
          requestUrl.searchParams.get(
            "track",
          ) ?? undefined;
        const peaksPerSecondValue =
          requestUrl.searchParams.get(
            "peaksPerSecond",
          );

        if (!releaseId) {
          sendJson(response, 400, {
            error:
              "Missing release query parameter",
          });
          return;
        }

        const mediaRoot =
          await resolveMediaRoot();
        const release =
          await scanReleaseById(
            mediaRoot,
            releaseId,
          );

        if (!release) {
          sendJson(response, 404, {
            error: "Release not found",
          });
          return;
        }

        if (
          trackId &&
          !release.tracks.some(
            (track) =>
              track.id === trackId,
          )
        ) {
          sendJson(response, 404, {
            error: "Track not found",
          });
          return;
        }

        const capabilities =
          await detectFfmpegCapabilities();

        sendJson(
          response,
          200,
          await buildMediaProcessingPlan(
            mediaRoot,
            release,
            capabilities,
            {
              ...(trackId
                ? { trackId }
                : {}),
              ...(peaksPerSecondValue ===
              null
                ? {}
                : {
                    peaksPerSecond:
                      Number(
                        peaksPerSecondValue,
                      ),
                  }),
            },
          ),
        );
      } catch (error) {
        sendJson(response, 400, {
          error:
            error instanceof Error
              ? error.message
              : "Unknown media-processing plan error",
        });
      }

      return;
    }

    if (
      request.method === "GET" &&
      requestUrl.pathname ===
        "/api/export/plan"
    ) {
      try {
        const releaseId =
          requestUrl.searchParams.get(
            "release",
          );
        const container =
          requestUrl.searchParams.get(
            "container",
          );
        const trackId =
          requestUrl.searchParams.get(
            "track",
          ) ?? undefined;
        const outputDirectory =
          requestUrl.searchParams.get(
            "output",
          ) ?? undefined;

        if (!releaseId) {
          sendJson(response, 400, {
            error:
              "Missing release query parameter",
          });
          return;
        }

        const allowedContainers =
          new Set([
            "mp3",
            "flac",
            "m4a",
            "ogg-vorbis",
            "opus",
            "wav",
          ]);

        if (
          !container ||
          !allowedContainers.has(container)
        ) {
          sendJson(response, 400, {
            error:
              "container must be mp3, flac, m4a, ogg-vorbis, opus, or wav",
          });
          return;
        }

        const mediaRoot =
          await resolveMediaRoot();
        const release =
          await scanReleaseById(
            mediaRoot,
            releaseId,
          );

        if (!release) {
          sendJson(response, 404, {
            error: "Release not found",
          });
          return;
        }

        const detail =
          await readReleaseMetadataDetail(
            mediaRoot,
            release,
          );

        sendJson(
          response,
          200,
          buildMetadataExportPlan(
            release,
            detail,
            metadataFieldRegistry,
            {
              container:
                container as
                  | "mp3"
                  | "flac"
                  | "m4a"
                  | "ogg-vorbis"
                  | "opus"
                  | "wav",
              scope: trackId
                ? "track"
                : "all",
              trackId,
              outputDirectory,
            },
          ),
        );
      } catch (error) {
        sendJson(response, 400, {
          error:
            error instanceof Error
              ? error.message
              : "Unknown export-plan error",
        });
      }

      return;
    }

    if (
      request.method === "GET" &&
      requestUrl.pathname ===
        "/api/export/validate"
    ) {
      try {
        const releaseId =
          requestUrl.searchParams.get(
            "release",
          );
        const container =
          requestUrl.searchParams.get(
            "container",
          );
        const trackId =
          requestUrl.searchParams.get(
            "track",
          ) ?? undefined;
        const outputDirectory =
          requestUrl.searchParams.get(
            "output",
          ) ?? undefined;

        if (!releaseId) {
          sendJson(response, 400, {
            error:
              "Missing release query parameter",
          });
          return;
        }

        const allowedContainers =
          new Set([
            "mp3",
            "flac",
            "m4a",
            "ogg-vorbis",
            "opus",
            "wav",
          ]);

        if (
          !container ||
          !allowedContainers.has(container)
        ) {
          sendJson(response, 400, {
            error:
              "container must be mp3, flac, m4a, ogg-vorbis, opus, or wav",
          });
          return;
        }

        const mediaRoot =
          await resolveMediaRoot();
        const release =
          await scanReleaseById(
            mediaRoot,
            releaseId,
          );

        if (!release) {
          sendJson(response, 404, {
            error: "Release not found",
          });
          return;
        }

        const detail =
          await readReleaseMetadataDetail(
            mediaRoot,
            release,
          );
        const plan =
          buildMetadataExportPlan(
            release,
            detail,
            metadataFieldRegistry,
            {
              container:
                container as
                  | "mp3"
                  | "flac"
                  | "m4a"
                  | "ogg-vorbis"
                  | "opus"
                  | "wav",
              scope: trackId
                ? "track"
                : "all",
              trackId,
              outputDirectory,
            },
          );
        const capabilities =
          await detectFfmpegCapabilities();

        sendJson(
          response,
          200,
          await validateMetadataExportPlan(
            plan,
            mediaRoot,
            capabilities,
            resolveExportOutputRoot(),
          ),
        );
      } catch (error) {
        sendJson(response, 400, {
          error:
            error instanceof Error
              ? error.message
              : "Unknown export validation error",
        });
      }

      return;
    }

    if (
      request.method === "POST" &&
      requestUrl.pathname ===
        "/api/export/execute"
    ) {
      try {
        const body = await readJsonBody(request);

        if (
          typeof body !== "object" ||
          body === null
        ) {
          throw new Error(
            "Expected a JSON object.",
          );
        }

        const releaseId =
          "releaseId" in body &&
          typeof body.releaseId === "string"
            ? body.releaseId
            : "";
        const container =
          "container" in body &&
          typeof body.container === "string"
            ? body.container
            : "";
        const trackId =
          "trackId" in body &&
          typeof body.trackId === "string"
            ? body.trackId
            : undefined;
        const outputDirectory =
          "outputDirectory" in body &&
          typeof body.outputDirectory === "string"
            ? body.outputDirectory
            : undefined;
        const confirmation =
          "confirmation" in body &&
          typeof body.confirmation === "string"
            ? body.confirmation
            : "";

        const allowedContainers =
          new Set([
            "mp3",
            "flac",
            "m4a",
            "ogg-vorbis",
            "opus",
            "wav",
          ]);

        if (!releaseId) {
          throw new Error(
            "Missing releaseId.",
          );
        }

        if (!allowedContainers.has(container)) {
          throw new Error(
            "Invalid export container.",
          );
        }

        const mediaRoot =
          await resolveMediaRoot();
        const release =
          await scanReleaseById(
            mediaRoot,
            releaseId,
          );

        if (!release) {
          sendJson(response, 404, {
            error: "Release not found",
          });
          return;
        }

        const detail =
          await readReleaseMetadataDetail(
            mediaRoot,
            release,
          );
        const plan =
          buildMetadataExportPlan(
            release,
            detail,
            metadataFieldRegistry,
            {
              container:
                container as
                  | "mp3"
                  | "flac"
                  | "m4a"
                  | "ogg-vorbis"
                  | "opus"
                  | "wav",
              scope: trackId
                ? "track"
                : "all",
              trackId,
              outputDirectory,
            },
          );
        const capabilities =
          await detectFfmpegCapabilities();
        const outputRoot =
          resolveExportOutputRoot();
        const validation =
          await validateMetadataExportPlan(
            plan,
            mediaRoot,
            capabilities,
            outputRoot,
          );

        if (!validation.canExport) {
          sendJson(response, 409, {
            error:
              "The export plan no longer passes dry-run validation.",
            validation,
          });
          return;
        }

        sendJson(
          response,
          200,
          await executeValidatedExportPlan(
            plan,
            mediaRoot,
            outputRoot,
            capabilities,
            confirmation,
          ),
        );
      } catch (error) {
        sendJson(response, 400, {
          error:
            error instanceof Error
              ? error.message
              : "Unknown export execution error",
        });
      }

      return;
    }

    if (
      request.method === "GET" &&
      requestUrl.pathname ===
        "/api/metadata/registry"
    ) {
      sendJson(response, 200, {
        fields: metadataFieldRegistry,
      });
      return;
    }

    if (
      request.method === "GET" &&
      requestUrl.pathname === "/api/health"
    ) {
      sendJson(response, 200, {
        status: "ok",
      });
      return;
    }

    if (
      request.method === "POST" &&
      requestUrl.pathname ===
        "/api/library/create-metadata-document"
    ) {
      try {
        const body = await readJsonBody(request);

        if (typeof body !== "object" || body === null) {
          sendJson(response, 400, {
            error: "Expected a JSON object",
          });
          return;
        }

        const releaseId =
          "releaseId" in body &&
          typeof body.releaseId === "string"
            ? body.releaseId
            : null;
        const relativePath =
          "relativePath" in body &&
          typeof body.relativePath === "string"
            ? body.relativePath
            : null;
        const confirmation =
          "confirmation" in body &&
          typeof body.confirmation === "string"
            ? body.confirmation
            : null;

        if (!releaseId || !relativePath) {
          sendJson(response, 400, {
            error: "releaseId and relativePath are required",
          });
          return;
        }

        if (confirmation !== "CREATE_METADATA_DOCUMENT") {
          sendJson(response, 400, {
            error:
              "Explicit CREATE_METADATA_DOCUMENT confirmation is required",
          });
          return;
        }

        const mediaRoot = await resolveMediaRoot();
        const release = await scanReleaseById(
          mediaRoot,
          releaseId,
        );

        if (!release) {
          sendJson(response, 404, {
            error: "Release not found",
          });
          return;
        }

        const generatedPreview = buildGeneratedTomlPreview(
          release,
          buildMetadataPreview(release),
        );
        const plan = buildSingleMetadataDocumentPlan(
          release,
          generatedPreview,
          relativePath,
        );

        if (plan.summary.blockedCount > 0) {
          sendJson(response, 409, {
            error:
              "Target metadata document already exists; overwrite is not allowed.",
            plan,
          });
          return;
        }

        const result = await executeMetadataCreationPlan(
          mediaRoot,
          plan,
        );

        sendJson(response, 201, result);
      } catch (error) {
        sendJson(response, 409, {
          error:
            error instanceof Error
              ? error.message
              : "Unknown metadata document creation error",
        });
      }

      return;
    }

    if (
      request.method === "POST" &&
      requestUrl.pathname ===
        "/api/library/create-missing-metadata"
    ) {
      try {
        const body = await readJsonBody(request);

        if (
          typeof body !== "object" ||
          body === null
        ) {
          sendJson(response, 400, {
            error: "Expected a JSON object",
          });
          return;
        }

        const releaseId =
          "releaseId" in body &&
          typeof body.releaseId === "string"
            ? body.releaseId
            : null;

        const confirmation =
          "confirmation" in body &&
          typeof body.confirmation === "string"
            ? body.confirmation
            : null;


        const scope = parseGenerationScope(
          "scope" in body
            ? body.scope
            : undefined,
        );

        const trackId =
          "trackId" in body &&
          typeof body.trackId === "string"
            ? body.trackId
            : undefined;

        if (!releaseId) {
          sendJson(response, 400, {
            error: "Missing releaseId",
          });
          return;
        }

        if (scope === "track" && !trackId) {
          sendJson(response, 400, {
            error:
              "trackId is required for track-scoped creation",
          });
          return;
        }

        if (
          confirmation !==
          "CREATE_MISSING_METADATA"
        ) {
          sendJson(response, 400, {
            error:
              "Explicit CREATE_MISSING_METADATA confirmation is required",
          });
          return;
        }

        const mediaRoot = await resolveMediaRoot();

        /*
         * Rescan and rebuild immediately before writing so the
         * endpoint does not rely on a stale browser-side plan.
         */
        const release = await scanReleaseById(
          mediaRoot,
          releaseId,
        );

        if (!release) {
          sendJson(response, 404, {
            error: "Release not found",
          });
          return;
        }

        const inferredPreview =
          buildMetadataPreview(release);

        const generatedPreview =
          buildGeneratedTomlPreview(
            release,
            inferredPreview,
          );

        const plan =
          buildMetadataGenerationPlan(
            release,
            generatedPreview,
            {
              scope,
              trackId,
            },
          );

        const result =
          await executeMetadataCreationPlan(
            mediaRoot,
            plan,
          );

        sendJson(response, 201, result);
      } catch (error) {
        sendJson(response, 409, {
          error:
            error instanceof Error
              ? error.message
              : "Unknown metadata creation error",
        });
      }

      return;
    }

    if (
      request.method === "POST" &&
      requestUrl.pathname ===
        "/api/library/create-starter-metadata"
    ) {
      try {
        const body = await readJsonBody(request);

        if (
          typeof body !== "object" ||
          body === null
        ) {
          sendJson(response, 400, {
            error: "Expected a JSON object",
          });
          return;
        }

        const confirmation =
          "confirmation" in body &&
          typeof body.confirmation === "string"
            ? body.confirmation
            : null;

        if (
          confirmation !==
          "CREATE_STARTER_METADATA"
        ) {
          sendJson(response, 400, {
            error:
              "Explicit CREATE_STARTER_METADATA confirmation is required",
          });
          return;
        }

        const input =
          "starter" in body &&
          typeof body.starter === "object" &&
          body.starter !== null
            ? (body.starter as StarterMetadataInput)
            : null;

        if (!input) {
          sendJson(response, 400, {
            error:
              "Missing starter metadata payload",
          });
          return;
        }

        const mediaRoot = await resolveMediaRoot();
        const release = await scanReleaseById(
          mediaRoot,
          input.releaseId,
        );

        if (!release) {
          sendJson(response, 404, {
            error: "Release not found",
          });
          return;
        }

        const plan =
          buildStarterMetadataPlan(
            release,
            input,
          );

        if (plan.summary.blockedCount > 0) {
          sendJson(response, 409, {
            error:
              "Starter metadata cannot be created because one or more target files already exist.",
            plan,
          });
          return;
        }

        const result =
          await executeMetadataCreationPlan(
            mediaRoot,
            plan,
          );

        sendJson(response, 201, result);
      } catch (error) {
        sendJson(response, 409, {
          error:
            error instanceof Error
              ? error.message
              : "Unknown starter metadata creation error",
        });
      }

      return;
    }

    if (
      request.method === "POST" &&
      requestUrl.pathname ===
        "/api/library/copy-performer-credits"
    ) {
      try {
        const body = await readJsonBody(request);

        if (
          typeof body !== "object" ||
          body === null
        ) {
          throw new Error(
            "Expected a JSON object.",
          );
        }

        const releaseId =
          "releaseId" in body &&
          typeof body.releaseId === "string"
            ? body.releaseId
            : "";
        const sourceScope =
          "sourceScope" in body &&
          body.sourceScope === "release"
            ? "release"
            : "track";
        const sourceTrackId =
          "sourceTrackId" in body &&
          typeof body.sourceTrackId === "string"
            ? body.sourceTrackId
            : "";
        const sourceOriginalSha256 =
          "sourceOriginalSha256" in body &&
          typeof body.sourceOriginalSha256 === "string"
            ? body.sourceOriginalSha256
            : "";
        const selectedSourceIndexes =
          "selectedSourceIndexes" in body &&
          Array.isArray(body.selectedSourceIndexes)
            ? body.selectedSourceIndexes
            : null;
        const destinationTrackIds =
          "destinationTrackIds" in body &&
          Array.isArray(body.destinationTrackIds)
            ? body.destinationTrackIds
            : null;
        const execute =
          "execute" in body &&
          body.execute === true;

        if (
          !releaseId ||
          (
            sourceScope === "track" &&
            !sourceTrackId
          ) ||
          !/^[a-f0-9]{64}$/.test(
            sourceOriginalSha256,
          ) ||
          !selectedSourceIndexes ||
          !selectedSourceIndexes.every(
            (value: unknown) =>
              typeof value === "number" &&
              Number.isSafeInteger(value),
          ) ||
          !destinationTrackIds ||
          !destinationTrackIds.every(
            (value: unknown) =>
              typeof value === "string" &&
              Boolean(value),
          )
        ) {
          throw new Error(
            "releaseId, source scope, source hash, selectedSourceIndexes, and destinationTrackIds are required.",
          );
        }

        const uniqueDestinationTrackIds =
          Array.from(
            new Set(
              destinationTrackIds as string[],
            ),
          );

        if (
          uniqueDestinationTrackIds.length === 0
        ) {
          throw new Error(
            "Select at least one destination track.",
          );
        }

        if (
          sourceScope === "track" &&
          uniqueDestinationTrackIds.includes(
            sourceTrackId,
          )
        ) {
          throw new Error(
            "The source track cannot also be a destination.",
          );
        }

        const mediaRoot =
          await resolveMediaRoot();
        let release =
          await scanReleaseById(
            mediaRoot,
            releaseId,
          );

        if (!release) {
          sendJson(response, 404, {
            error: "Release not found",
          });
          return;
        }

        let detail =
          await readReleaseMetadataDetail(
            mediaRoot,
            release,
          );
        const sourceDocument =
          detail.documents.find(
            (document) =>
              sourceScope === "release"
                ? document.scope === "release" &&
                  document.filename === "release.toml"
                : document.trackId ===
                    sourceTrackId &&
                  document.filename ===
                    "track-credits.toml",
          );

        if (!sourceDocument) {
          throw new Error(
            sourceScope === "release"
              ? "The release requires a readable release.toml document."
              : "The source track requires a readable track-credits.toml document.",
          );
        }

        if (
          sourceDocument.sha256 !==
          sourceOriginalSha256
        ) {
          throw new Error(
            "The source performer credits changed after the dialog opened. Refresh and review the copy again.",
          );
        }

        const sourceRecords =
          readCopyablePerformerRecords(
            sourceDocument,
          );
        const selectedRecords =
          selectPerformerRecords(
            sourceRecords,
            selectedSourceIndexes as number[],
          );

        const destinationPlans =
          uniqueDestinationTrackIds.map(
            (trackId) => {
              const track =
                release?.tracks.find(
                  (candidate) =>
                    candidate.id === trackId,
                );

              if (!track) {
                return {
                  trackId,
                  relativePath: "",
                  documentExists: false,
                  addCount: 0,
                  duplicateCount: 0,
                  resultingCount: 0,
                  status: "blocked" as const,
                  reason:
                    "Destination track was not found in the selected release.",
                  additions: [],
                };
              }

              const creditsFile =
                track.metadataFiles.find(
                  (file) =>
                    file.filename ===
                      "track-credits.toml",
                );

              if (!creditsFile) {
                return {
                  trackId,
                  relativePath: "",
                  documentExists: false,
                  addCount: 0,
                  duplicateCount: 0,
                  resultingCount: 0,
                  status: "blocked" as const,
                  reason:
                    "Destination track has no track-credits metadata slot.",
                  additions: [],
                };
              }

              const targetDocument =
                detail.documents.find(
                  (document) =>
                    document.trackId ===
                      trackId &&
                    document.filename ===
                      "track-credits.toml",
                );

              if (
                creditsFile.exists &&
                !targetDocument
              ) {
                return {
                  trackId,
                  relativePath:
                    creditsFile.relativePath,
                  documentExists: true,
                  addCount: 0,
                  duplicateCount: 0,
                  resultingCount: 0,
                  status: "blocked" as const,
                  reason:
                    "Destination track-credits.toml could not be parsed safely.",
                  additions: [],
                };
              }

              return planPerformerCopyToTarget(
                selectedRecords,
                targetDocument
                  ? readCopyablePerformerRecords(
                      targetDocument,
                    )
                  : [],
                {
                  trackId,
                  relativePath:
                    creditsFile.relativePath,
                  documentExists:
                    Boolean(targetDocument),
                },
              );
            },
          );

        const publicPlans =
          destinationPlans.map(
            ({ additions: _additions, ...plan }) =>
              plan,
          );
        const planSummary = {
          selectedCreditCount:
            selectedRecords.length,
          destinationCount:
            destinationPlans.length,
          readyCount:
            destinationPlans.filter(
              (plan) =>
                plan.status === "ready",
            ).length,
          blockedCount:
            destinationPlans.filter(
              (plan) =>
                plan.status === "blocked",
            ).length,
          addCount:
            destinationPlans.reduce(
              (total, plan) =>
                total + plan.addCount,
              0,
            ),
          duplicateCount:
            destinationPlans.reduce(
              (total, plan) =>
                total +
                plan.duplicateCount,
              0,
            ),
        };

        if (!execute) {
          sendJson(response, 200, {
            releaseId,
            sourceTrackId:
              sourceScope === "release"
                ? "release"
                : sourceTrackId,
            sourceScope,
            sourceRelativePath:
              sourceDocument.relativePath,
            sourceSha256:
              sourceDocument.sha256,
            selectedCredits:
              selectedRecords,
            destinations: publicPlans,
            summary: planSummary,
          });
          return;
        }

        const missingTargets =
          destinationPlans.filter(
            (plan) =>
              plan.status === "ready" &&
              plan.addCount > 0 &&
              !plan.documentExists,
          );

        if (missingTargets.length > 0) {
          await executeMetadataCreationPlan(
            mediaRoot,
            {
              releaseId,
              scope: "track",
              items: missingTargets.map(
                (plan) => ({
                  storageRole:
                    "track-credits" as const,
                  filename:
                    "track-credits.toml",
                  relativePath:
                    plan.relativePath,
                  action: "create" as const,
                  reason:
                    "Create a track credits document before copying selected performer credits.",
                  content:
                    "[track]\nperformers = []\ncontributors = []\n",
                  validated: true,
                }),
              ),
              summary: {
                createCount:
                  missingTargets.length,
                blockedCount: 0,
              },
              warnings: [],
            },
          );

          release = await scanReleaseById(
            mediaRoot,
            releaseId,
          );

          if (!release) {
            throw new Error(
              "Release disappeared after creating destination credit documents.",
            );
          }

          detail =
            await readReleaseMetadataDetail(
              mediaRoot,
              release,
            );
        }

        const executionTargets: Array<
          PerformerCopyTargetPlan & {
            createdDocument: boolean;
            receipt?: Awaited<
              ReturnType<
                typeof saveScalarMetadataChanges
              >
            >;
            error?: string;
          }
        > = [];

        for (const initialPlan of destinationPlans) {
          if (initialPlan.status === "blocked") {
            executionTargets.push({
              ...publicPlans.find(
                (plan) =>
                  plan.trackId ===
                    initialPlan.trackId,
              )!,
              createdDocument: false,
              error: initialPlan.reason,
            });
            continue;
          }

          const targetDocument =
            detail.documents.find(
              (document) =>
                document.trackId ===
                  initialPlan.trackId &&
                document.filename ===
                  "track-credits.toml",
            );

          if (!targetDocument) {
            executionTargets.push({
              ...publicPlans.find(
                (plan) =>
                  plan.trackId ===
                    initialPlan.trackId,
              )!,
              status: "blocked",
              createdDocument:
                !initialPlan.documentExists,
              error:
                "Destination track-credits.toml is unavailable after preflight.",
            });
            continue;
          }

          const latestExistingRecords =
            readCopyablePerformerRecords(
              targetDocument,
            );
          const latestPlan =
            planPerformerCopyToTarget(
              selectedRecords,
              latestExistingRecords,
              {
                trackId:
                  initialPlan.trackId,
                relativePath:
                  targetDocument.relativePath,
                documentExists: true,
              },
            );

          if (latestPlan.status === "blocked") {
            const {
              additions: _additions,
              ...blockedPlan
            } = latestPlan;
            executionTargets.push({
              ...blockedPlan,
              createdDocument:
                !initialPlan.documentExists,
              error: latestPlan.reason,
            });
            continue;
          }

          if (latestPlan.addCount === 0) {
            const {
              additions: _additions,
              ...skippedPlan
            } = latestPlan;
            executionTargets.push({
              ...skippedPlan,
              createdDocument:
                !initialPlan.documentExists,
            });
            continue;
          }

          try {
            const receipt =
              await saveScalarMetadataChanges(
                mediaRoot,
                release,
                targetDocument.relativePath,
                targetDocument.sha256,
                [],
                false,
                buildPerformerReplacementInputs(
                  latestExistingRecords,
                  latestPlan.additions,
                ),
              );
            const {
              additions: _additions,
              ...savedPlan
            } = latestPlan;
            executionTargets.push({
              ...savedPlan,
              createdDocument:
                !initialPlan.documentExists,
              receipt,
            });
          } catch (error) {
            const {
              additions: _additions,
              ...failedPlan
            } = latestPlan;
            executionTargets.push({
              ...failedPlan,
              status: "blocked",
              createdDocument:
                !initialPlan.documentExists,
              error:
                error instanceof Error
                  ? error.message
                  : "Unknown performer-copy error",
            });
          }
        }

        const failedCount =
          executionTargets.filter(
            (target) => Boolean(target.error),
          ).length;
        const writtenTargets =
          executionTargets.filter(
            (target) => Boolean(target.receipt),
          );
        const execution = {
          status:
            failedCount === 0
              ? "verified"
              : writtenTargets.length > 0
                ? "partial"
                : "failed",
          targets: executionTargets,
          addedCount:
            writtenTargets.reduce(
              (total, target) =>
                total + target.addCount,
              0,
            ),
          duplicateCount:
            executionTargets.reduce(
              (total, target) =>
                total +
                target.duplicateCount,
              0,
            ),
          failedCount,
        };

        sendJson(
          response,
          failedCount > 0 ? 207 : 200,
          {
            releaseId,
            sourceTrackId:
              sourceScope === "release"
                ? "release"
                : sourceTrackId,
            sourceScope,
            sourceRelativePath:
              sourceDocument.relativePath,
            sourceSha256:
              sourceDocument.sha256,
            selectedCredits:
              selectedRecords,
            destinations: publicPlans,
            summary: planSummary,
            execution,
          },
        );
      } catch (error) {
        sendJson(response, 409, {
          error:
            error instanceof Error
              ? error.message
              : "Unknown performer-credit copy error",
        });
      }

      return;
    }

    if (
      request.method === "POST" &&
      requestUrl.pathname ===
        "/api/library/create-track-credits-document"
    ) {
      try {
        const body =
          await readJsonBody(request);

        if (
          typeof body !== "object" ||
          body === null
        ) {
          sendJson(response, 400, {
            error:
              "Expected a JSON object",
          });
          return;
        }

        const releaseId =
          "releaseId" in body &&
          typeof body.releaseId ===
            "string"
            ? body.releaseId
            : null;
        const relativePath =
          "relativePath" in body &&
          typeof body.relativePath ===
            "string"
            ? body.relativePath
            : null;

        if (!releaseId || !relativePath) {
          sendJson(response, 400, {
            error:
              "releaseId and relativePath are required",
          });
          return;
        }

        const mediaRoot =
          await resolveMediaRoot();
        const release =
          await scanReleaseById(
            mediaRoot,
            releaseId,
          );

        if (!release) {
          sendJson(response, 404, {
            error:
              "Release not found",
          });
          return;
        }

        const track =
          release.tracks.find(
            (candidate) =>
              candidate.metadataFiles.some(
                (file) =>
                  !file.exists &&
                  file.filename ===
                    "track-credits.toml" &&
                  file.relativePath ===
                    relativePath,
              ),
          );

        if (!track) {
          sendJson(response, 409, {
            error:
              "Target is not a missing track-credits.toml file in the selected release",
          });
          return;
        }

        const result =
          await executeMetadataCreationPlan(
            mediaRoot,
            {
              releaseId,
              scope: "track",
              trackId: track.id,
              items: [
                {
                  storageRole:
                    "track-credits",
                  filename:
                    "track-credits.toml",
                  relativePath,
                  action: "create",
                  reason:
                    "Create an empty technical-credit document for browser editing",
                  content:
                    "[track]\nperformers = []\ncontributors = []\n",
                  validated: true,
                },
              ],
              summary: {
                createCount: 1,
                blockedCount: 0,
              },
              warnings: [],
            },
          );

        sendJson(response, 201, result);
      } catch (error) {
        sendJson(response, 409, {
          error:
            error instanceof Error
              ? error.message
              : "Unknown track-credits document creation error",
        });
      }

      return;
    }

    if (
      request.method === "POST" &&
      requestUrl.pathname ===
        "/api/library/create-metadata-fields"
    ) {
      try {
        const body =
          await readJsonBody(request);

        if (
          typeof body !== "object" ||
          body === null
        ) {
          sendJson(response, 400, {
            error:
              "Expected a JSON object",
          });
          return;
        }

        const releaseId =
          "releaseId" in body &&
          typeof body.releaseId ===
            "string"
            ? body.releaseId
            : null;

        const relativePath =
          "relativePath" in body &&
          typeof body.relativePath ===
            "string"
            ? body.relativePath
            : null;

        const originalSha256 =
          "originalSha256" in body &&
          typeof body.originalSha256 ===
            "string"
            ? body.originalSha256
            : null;

        const changes =
          "changes" in body &&
          Array.isArray(body.changes)
            ? body.changes
            : null;

        if (
          !releaseId ||
          !relativePath ||
          !originalSha256 ||
          !changes
        ) {
          sendJson(response, 400, {
            error:
              "releaseId, relativePath, originalSha256, and changes are required",
          });
          return;
        }

        const normalizedChanges =
          changes.map((change) => {
            if (
              typeof change !==
                "object" ||
              change === null ||
              !("path" in change) ||
              typeof change.path !==
                "string" ||
              !("value" in change) ||
              !(
                typeof change.value ===
                  "string" ||
                typeof change.value ===
                  "number" ||
                typeof change.value ===
                  "boolean" ||
                (
                  Array.isArray(
                    change.value,
                  ) &&
                  change.value.every(
                    (entry: unknown) =>
                      typeof entry ===
                      "string",
                  )
                )
              )
            ) {
              throw new Error(
                "Each field requires a safe metadata path and editable initial value",
              );
            }

            assertMetadataFieldMayBeCreated(relativePath, change.path);
            assertCanonicalMetadataValue(change.path, change.value);
            return { path: change.path, value: change.value };
          });

        const mediaRoot =
          await resolveMediaRoot();
        const release =
          await scanReleaseById(
            mediaRoot,
            releaseId,
          );

        if (!release) {
          sendJson(response, 404, {
            error:
              "Release not found",
          });
          return;
        }

        const receipt =
          await saveScalarMetadataChanges(
            mediaRoot,
            release,
            relativePath,
            originalSha256,
            normalizedChanges,
            true,
          );

        sendJson(
          response,
          200,
          receipt,
        );
      } catch (error) {
        sendJson(response, 409, {
          error:
            error instanceof Error
              ? error.message
              : "Unknown metadata field creation error",
        });
      }

      return;
    }


    if (
      request.method === "POST" &&
      requestUrl.pathname ===
        "/api/library/delete-metadata-fields"
    ) {
      try {
        const body =
          await readJsonBody(request);

        if (
          typeof body !== "object" ||
          body === null
        ) {
          sendJson(response, 400, {
            error:
              "Expected a JSON object",
          });
          return;
        }

        const releaseId =
          "releaseId" in body &&
          typeof body.releaseId ===
            "string"
            ? body.releaseId
            : null;

        const relativePath =
          "relativePath" in body &&
          typeof body.relativePath ===
            "string"
            ? body.relativePath
            : null;

        const originalSha256 =
          "originalSha256" in body &&
          typeof body.originalSha256 ===
            "string"
            ? body.originalSha256
            : null;

        const metadataPaths =
          "paths" in body &&
          Array.isArray(body.paths)
            ? body.paths
            : null;

        if (
          !releaseId ||
          !relativePath ||
          !originalSha256 ||
          !metadataPaths ||
          metadataPaths.length === 0
        ) {
          sendJson(response, 400, {
            error:
              "releaseId, relativePath, originalSha256, and at least one path are required",
          });
          return;
        }

        const normalizedPaths =
          metadataPaths.map(
            (metadataPath) => {
              if (
                typeof metadataPath !==
                "string"
              ) {
                throw new Error(
                  "Each removable metadata field requires a canonical path.",
                );
              }

              assertMetadataFieldMayBeRemoved(
                relativePath,
                metadataPath,
              );

              return metadataPath;
            },
          );

        const mediaRoot =
          await resolveMediaRoot();
        const release =
          await scanReleaseById(
            mediaRoot,
            releaseId,
          );

        if (!release) {
          sendJson(response, 404, {
            error:
              "Release not found",
          });
          return;
        }

        const receipt =
          await saveScalarMetadataChanges(
            mediaRoot,
            release,
            relativePath,
            originalSha256,
            [],
            false,
            undefined,
            undefined,
            [],
            "track.contributors",
            normalizedPaths,
          );

        sendJson(
          response,
          200,
          receipt,
        );
      } catch (error) {
        sendJson(response, 409, {
          error:
            error instanceof Error
              ? error.message
              : "Unknown metadata field removal error",
        });
      }

      return;
    }

    if (
      request.method === "POST" &&
      requestUrl.pathname ===
        "/api/library/release-rename-plan"
    ) {
      try {
        const body = await readJsonBody(request);

        if (
          typeof body !== "object" ||
          body === null
        ) {
          sendJson(response, 400, {
            error: "Expected a JSON object",
          });
          return;
        }

        const releaseId =
          "releaseId" in body &&
          typeof body.releaseId === "string"
            ? body.releaseId
            : "";
        const targetReleaseId =
          "targetReleaseId" in body &&
          typeof body.targetReleaseId === "string"
            ? body.targetReleaseId
            : "";
        const targetTitle =
          "targetTitle" in body &&
          typeof body.targetTitle === "string"
            ? body.targetTitle
            : "";

        if (!releaseId || !targetReleaseId || !targetTitle) {
          sendJson(response, 400, {
            error:
              "releaseId, targetReleaseId, and targetTitle are required",
          });
          return;
        }

        const mediaRoot = await resolveMediaRoot();
        const release = await scanReleaseById(mediaRoot, releaseId);

        if (!release) {
          sendJson(response, 404, {
            error: `Release not found: ${releaseId}`,
          });
          return;
        }

        sendJson(
          response,
          200,
          await buildReleaseRenamePlan(
            mediaRoot,
            release,
            targetReleaseId,
            targetTitle,
          ),
        );
      } catch (error) {
        sendJson(response, 409, {
          error:
            error instanceof Error
              ? error.message
              : "Unknown release rename planning error",
        });
      }

      return;
    }

    if (
      request.method === "POST" &&
      requestUrl.pathname ===
        "/api/library/apply-release-rename"
    ) {
      try {
        const body = await readJsonBody(request);

        if (
          typeof body !== "object" ||
          body === null
        ) {
          sendJson(response, 400, {
            error: "Expected a JSON object",
          });
          return;
        }

        const releaseId =
          "releaseId" in body &&
          typeof body.releaseId === "string"
            ? body.releaseId
            : "";
        const targetReleaseId =
          "targetReleaseId" in body &&
          typeof body.targetReleaseId === "string"
            ? body.targetReleaseId
            : "";
        const targetTitle =
          "targetTitle" in body &&
          typeof body.targetTitle === "string"
            ? body.targetTitle
            : "";
        const confirmation =
          "confirmation" in body &&
          typeof body.confirmation === "string"
            ? body.confirmation
            : "";
        const planFingerprint =
          "planFingerprint" in body &&
          typeof body.planFingerprint === "string"
            ? body.planFingerprint
            : "";

        if (
          !releaseId ||
          !targetReleaseId ||
          !targetTitle ||
          !confirmation ||
          !planFingerprint
        ) {
          sendJson(response, 400, {
            error:
              "releaseId, targetReleaseId, targetTitle, confirmation, and planFingerprint are required",
          });
          return;
        }

        const mediaRoot = await resolveMediaRoot();
        const release = await scanReleaseById(mediaRoot, releaseId);

        if (!release) {
          sendJson(response, 404, {
            error: `Release not found: ${releaseId}`,
          });
          return;
        }

        sendJson(
          response,
          200,
          await executeReleaseRenamePlan(
            mediaRoot,
            release,
            targetReleaseId,
            targetTitle,
            confirmation,
            planFingerprint,
          ),
        );
      } catch (error) {
        sendJson(response, 409, {
          error:
            error instanceof Error
              ? error.message
              : "Unknown release rename error",
        });
      }

      return;
    }

    if (
      request.method === "GET" &&
      requestUrl.pathname ===
        "/api/library/track-directory-rename-plan"
    ) {
      try {
        const releaseId =
          requestUrl.searchParams.get("release");

        if (!releaseId) {
          sendJson(response, 400, {
            error: "release is required",
          });
          return;
        }

        const mediaRoot = await resolveMediaRoot();
        const release = await scanReleaseById(
          mediaRoot,
          releaseId,
        );

        if (!release) {
          sendJson(response, 404, {
            error: "Release not found",
          });
          return;
        }

        sendJson(
          response,
          200,
          await buildTrackDirectoryRenamePlan(
            mediaRoot,
            release,
          ),
        );
      } catch (error) {
        sendJson(response, 409, {
          error:
            error instanceof Error
              ? error.message
              : "Unknown track directory planning error",
        });
      }

      return;
    }

    if (
      request.method === "POST" &&
      requestUrl.pathname ===
        "/api/library/apply-track-directory-renames"
    ) {
      try {
        const body = await readJsonBody(request);

        if (
          typeof body !== "object" ||
          body === null
        ) {
          sendJson(response, 400, {
            error: "Expected a JSON object",
          });
          return;
        }

        const releaseId =
          "releaseId" in body &&
          typeof body.releaseId === "string"
            ? body.releaseId
            : null;
        const confirmation =
          "confirmation" in body &&
          typeof body.confirmation === "string"
            ? body.confirmation
            : null;
        const planFingerprint =
          "planFingerprint" in body &&
          typeof body.planFingerprint === "string"
            ? body.planFingerprint
            : null;

        if (
          !releaseId ||
          !confirmation ||
          !planFingerprint
        ) {
          sendJson(response, 400, {
            error:
              "releaseId, confirmation, and planFingerprint are required",
          });
          return;
        }

        const mediaRoot = await resolveMediaRoot();
        const release = await scanReleaseById(
          mediaRoot,
          releaseId,
        );

        if (!release) {
          sendJson(response, 404, {
            error: "Release not found",
          });
          return;
        }

        sendJson(
          response,
          200,
          await executeTrackDirectoryRenamePlan(
            mediaRoot,
            release,
            confirmation,
            planFingerprint,
          ),
        );
      } catch (error) {
        sendJson(response, 409, {
          error:
            error instanceof Error
              ? error.message
              : "Unknown track directory synchronization error",
        });
      }

      return;
    }

    if (
      request.method === "POST" &&
      requestUrl.pathname ===
        "/api/library/save-scalar-metadata"
    ) {
      try {
        const body = await readJsonBody(request);

        if (
          typeof body !== "object" ||
          body === null
        ) {
          sendJson(response, 400, {
            error: "Expected a JSON object",
          });
          return;
        }

        const releaseId =
          "releaseId" in body &&
          typeof body.releaseId === "string"
            ? body.releaseId
            : null;

        const relativePath =
          "relativePath" in body &&
          typeof body.relativePath === "string"
            ? body.relativePath
            : null;

        const originalSha256 =
          "originalSha256" in body &&
          typeof body.originalSha256 === "string"
            ? body.originalSha256
            : null;

        const changes =
          "changes" in body &&
          Array.isArray(body.changes)
            ? body.changes
            : null;

        const createChanges =
          "createChanges" in body && Array.isArray(body.createChanges)
            ? body.createChanges
            : [];

        const performers =
          "performers" in body
            ? body.performers
            : undefined;

        const performerPath =
          "performerPath" in body &&
          typeof body.performerPath === "string"
            ? body.performerPath
            : "track.performers";

        const technicalContributors =
          "technicalContributors" in body
            ? body.technicalContributors
            : undefined;

        const managedTechnicalContributorSourceIndexes =
          "managedTechnicalContributorSourceIndexes" in
          body
            ? body.managedTechnicalContributorSourceIndexes
            : undefined;

        const arrangementContributors =
          "arrangementContributors" in body
            ? body.arrangementContributors
            : undefined;

        const managedArrangementContributorSourceIndexes =
          "managedArrangementContributorSourceIndexes" in
          body
            ? body.managedArrangementContributorSourceIndexes
            : undefined;

        const arrangementContributorPath =
          "arrangementContributorPath" in body &&
          typeof body.arrangementContributorPath ===
            "string"
            ? body.arrangementContributorPath
            : "track.contributors";

        const writingCredits =
          "writingCredits" in body
            ? body.writingCredits
            : undefined;

        const writingCreditBasePath =
          "writingCreditBasePath" in body &&
          typeof body.writingCreditBasePath === "string"
            ? body.writingCreditBasePath
            : "track";

        const sampleRelationships =
          "sampleRelationships" in body
            ? body.sampleRelationships
            : undefined;

        const sampleClearances =
          "sampleClearances" in body
            ? body.sampleClearances
            : undefined;

        const technicalContributorPath =
          "technicalContributorPath" in body &&
          typeof body.technicalContributorPath ===
            "string"
            ? body.technicalContributorPath
            : "track.contributors";

        if (
          !releaseId ||
          !relativePath ||
          !originalSha256 ||
          !changes ||
          !(
            performers === undefined ||
            Array.isArray(performers)
          ) ||
          ![
            "track.performers",
            "release.credits.performers",
          ].includes(performerPath) ||
          !(
            technicalContributors ===
              undefined ||
            Array.isArray(
              technicalContributors,
            )
          ) ||
          !(
            arrangementContributors ===
              undefined ||
            Array.isArray(
              arrangementContributors,
            )
          ) ||
          !(
            writingCredits === undefined ||
            Array.isArray(writingCredits)
          ) ||
          !(
            sampleRelationships === undefined ||
            Array.isArray(sampleRelationships)
          ) ||
          !(
            sampleClearances === undefined ||
            Array.isArray(sampleClearances)
          ) ||
          !(
            managedTechnicalContributorSourceIndexes ===
              undefined ||
            (
              Array.isArray(
                managedTechnicalContributorSourceIndexes,
              ) &&
              managedTechnicalContributorSourceIndexes.every(
                (value: unknown) =>
                  typeof value ===
                    "number",
              )
            )
          ) ||
          !(
            managedArrangementContributorSourceIndexes ===
              undefined ||
            (
              Array.isArray(
                managedArrangementContributorSourceIndexes,
              ) &&
              managedArrangementContributorSourceIndexes.every(
                (value: unknown) =>
                  typeof value === "number",
              )
            )
          ) ||
          ![
            "track.contributors",
            "release.credits.contributors",
          ].includes(technicalContributorPath) ||
          ![
            "track.contributors",
            "release.credits.contributors",
          ].includes(arrangementContributorPath) ||
          ![
            "track",
            "release.credits",
          ].includes(writingCreditBasePath)
        ) {
          sendJson(response, 400, {
            error:
              "releaseId, relativePath, originalSha256, and changes are required",
          });
          return;
        }

        const normalizedChanges =
          changes.map((change) => {
            if (
              typeof change !== "object" ||
              change === null ||
              !("path" in change) ||
              typeof change.path !== "string" ||
              !("value" in change) ||
              !(
                typeof change.value === "string" ||
                typeof change.value === "number" ||
                typeof change.value === "boolean" ||
                (
                  Array.isArray(change.value) &&
                  change.value.every(
                    (entry: unknown) =>
                      typeof entry === "string",
                  )
                )
              )
            ) {
              throw new Error(
                "Each change requires an editable metadata path and value",
              );
            }

            assertCanonicalMetadataValue(change.path, change.value);
            return { path: change.path, value: change.value };
          });

        const normalizedCreateChanges = createChanges.map((change) => {
          if (typeof change !== "object" || change === null || !("path" in change) || typeof change.path !== "string" || !("value" in change) || !(typeof change.value === "string" || typeof change.value === "number" || typeof change.value === "boolean" || (Array.isArray(change.value) && change.value.every((entry: unknown) => typeof entry === "string")))) {
            throw new Error("Each createChanges entry requires an editable metadata path and value");
          }
          assertMetadataFieldMayBeCreated(relativePath, change.path);
          assertCanonicalMetadataValue(change.path, change.value);
          return { path: change.path, value: change.value };
        });

        const normalizedPerformers =
          performers === undefined
            ? undefined
            : performers.map(
                (
                  performer,
                  performerIndex,
                ) => {
                  if (
                    typeof performer !==
                      "object" ||
                    performer === null ||
                    !("sourceIndex" in performer) ||
                    !(
                      performer.sourceIndex ===
                        null ||
                      typeof performer.sourceIndex ===
                        "number"
                    ) ||
                    !("name" in performer) ||
                    typeof performer.name !==
                      "string" ||
                    !("role" in performer) ||
                    typeof performer.role !==
                      "string" ||
                    !("sortName" in performer) ||
                    typeof performer.sortName !==
                      "string"
                  ) {
                    throw new Error(
                      `Performer ${performerIndex + 1} requires sourceIndex, name, role, and sortName`,
                    );
                  }

                  return {
                    sourceIndex:
                      performer.sourceIndex,
                    name: performer.name,
                    role: performer.role,
                    sortName:
                      performer.sortName,
                  };
                },
              );

        const normalizedTechnicalContributors =
          technicalContributors ===
            undefined
            ? undefined
            : technicalContributors.map(
                (
                  contributor,
                  contributorIndex,
                ) => {
                  if (
                    typeof contributor !==
                      "object" ||
                    contributor === null ||
                    !("sourceIndex" in
                      contributor) ||
                    !(
                      contributor.sourceIndex ===
                        null ||
                      typeof contributor.sourceIndex ===
                        "number"
                    ) ||
                    !("name" in contributor) ||
                    typeof contributor.name !==
                      "string" ||
                    !("role" in contributor) ||
                    typeof contributor.role !==
                      "string" ||
                    !("sortName" in
                      contributor) ||
                    typeof contributor.sortName !==
                      "string"
                  ) {
                    throw new Error(
                      `Technical contributor ${contributorIndex + 1} requires sourceIndex, name, role, and sortName`,
                    );
                  }

                  return {
                    sourceIndex:
                      contributor.sourceIndex,
                    name: contributor.name,
                    role: contributor.role,
                    sortName:
                      contributor.sortName,
                  };
                },
              );

        const normalizedArrangementContributors =
          arrangementContributors === undefined
            ? undefined
            : arrangementContributors.map(
                (
                  contributor,
                  contributorIndex,
                ) => {
                  if (
                    typeof contributor !== "object" ||
                    contributor === null ||
                    !("sourceIndex" in contributor) ||
                    !(
                      contributor.sourceIndex === null ||
                      typeof contributor.sourceIndex === "number"
                    ) ||
                    !("name" in contributor) ||
                    typeof contributor.name !== "string" ||
                    !("role" in contributor) ||
                    typeof contributor.role !== "string" ||
                    !("sortName" in contributor) ||
                    typeof contributor.sortName !== "string"
                  ) {
                    throw new Error(
                      `Arrangement contributor ${contributorIndex + 1} requires sourceIndex, name, role, and sortName`,
                    );
                  }

                  return {
                    sourceIndex: contributor.sourceIndex,
                    name: contributor.name,
                    role: contributor.role,
                    sortName: contributor.sortName,
                  };
                },
              );

        const normalizedWritingCredits =
          writingCredits === undefined
            ? undefined
            : writingCredits.map(
                (credit, creditIndex) => {
                  if (
                    typeof credit !== "object" ||
                    credit === null ||
                    !("family" in credit) ||
                    ![
                      "songwriters",
                      "composers",
                      "lyricists",
                    ].includes(String(credit.family)) ||
                    !("sourceFamily" in credit) ||
                    !(
                      credit.sourceFamily === null ||
                      [
                        "songwriters",
                        "composers",
                        "lyricists",
                      ].includes(String(credit.sourceFamily))
                    ) ||
                    !("sourceIndex" in credit) ||
                    !(
                      credit.sourceIndex === null ||
                      typeof credit.sourceIndex === "number"
                    ) ||
                    !("name" in credit) ||
                    typeof credit.name !== "string" ||
                    !("role" in credit) ||
                    typeof credit.role !== "string" ||
                    !("sortName" in credit) ||
                    typeof credit.sortName !== "string"
                  ) {
                    throw new Error(
                      `Writing credit ${creditIndex + 1} requires family, sourceFamily, sourceIndex, name, role, and sortName`,
                    );
                  }

                  return {
                    family: credit.family as
                      | "songwriters"
                      | "composers"
                      | "lyricists",
                    sourceFamily: credit.sourceFamily as
                      | "songwriters"
                      | "composers"
                      | "lyricists"
                      | null,
                    sourceIndex: credit.sourceIndex,
                    name: credit.name,
                    role: credit.role,
                    sortName: credit.sortName,
                  };
                },
              );

        const normalizedSampleRelationships =
          normalizeSampleRelationshipRequest(sampleRelationships);

        const normalizedSampleClearances =
          normalizeSampleClearanceRequest(sampleClearances);

        const normalizedManagedTechnicalContributorSourceIndexes =
          managedTechnicalContributorSourceIndexes ===
            undefined
            ? []
            : managedTechnicalContributorSourceIndexes;

        const normalizedManagedArrangementContributorSourceIndexes =
          managedArrangementContributorSourceIndexes ===
            undefined
            ? []
            : managedArrangementContributorSourceIndexes;

        const mediaRoot =
          await resolveMediaRoot();

        const release =
          await scanReleaseById(
            mediaRoot,
            releaseId,
          );

        if (!release) {
          sendJson(response, 404, {
            error: "Release not found",
          });
          return;
        }

        const receipt =
          await saveScalarMetadataChanges(
            mediaRoot,
            release,
            relativePath,
            originalSha256,
            normalizedChanges,
            false,
            normalizedPerformers,
            normalizedTechnicalContributors,
            normalizedManagedTechnicalContributorSourceIndexes,
            technicalContributorPath as
              | "track.contributors"
              | "release.credits.contributors",
            [],
            normalizedCreateChanges,
            performerPath as
              | "track.performers"
              | "release.credits.performers",
            normalizedArrangementContributors,
            normalizedManagedArrangementContributorSourceIndexes,
            arrangementContributorPath as
              | "track.contributors"
              | "release.credits.contributors",
            normalizedWritingCredits,
            writingCreditBasePath as
              | "track"
              | "release.credits",
            normalizedSampleRelationships,
            normalizedSampleClearances,
          );

        const totals =
          relativePath.endsWith(
            "/release.toml",
          )
            ? getReleaseNumberingTotalsFromChanges(
                normalizedChanges,
              )
            : {};

        const synchronization =
          await synchronizeTrackNumberingTotals(
            mediaRoot,
            release,
            totals,
          );

        sendJson(response, 200, {
          ...receipt,
          synchronizedTrackFiles:
            synchronization.synchronizedTrackFiles,
          skippedTrackFiles:
            synchronization.skippedTrackFiles,
        });
      } catch (error) {
        sendJson(response, 409, {
          error:
            error instanceof Error
              ? error.message
              : "Unknown metadata save error",
        });
      }

      return;
    }

    if (
      request.method === "GET" &&
      requestUrl.pathname ===
        "/api/library/release-detail"
    ) {
      try {
        const releaseId =
          requestUrl.searchParams.get("release");

        if (!releaseId) {
          sendJson(response, 400, {
            error:
              "Missing release query parameter",
          });
          return;
        }

        const mediaRoot =
          await resolveMediaRoot();

        const release =
          await scanReleaseById(
            mediaRoot,
            releaseId,
          );

        if (!release) {
          sendJson(response, 404, {
            error: "Release not found",
          });
          return;
        }

        sendJson(
          response,
          200,
          await readReleaseMetadataDetail(
            mediaRoot,
            release,
          ),
        );
      } catch (error) {
        sendJson(response, 500, {
          error:
            error instanceof Error
              ? error.message
              : "Unknown release-detail error",
        });
      }

      return;
    }

    if (
      request.method === "GET" &&
      requestUrl.pathname ===
        "/api/library/generation-plan"
    ) {
      try {
        const releaseId =
          requestUrl.searchParams.get("release");

        if (!releaseId) {
          sendJson(response, 400, {
            error:
              "Missing release query parameter",
          });
          return;
        }

        const scope = parseGenerationScope(
          requestUrl.searchParams.get("scope"),
        );

        const trackId =
          requestUrl.searchParams.get("track") ??
          undefined;

        if (scope === "track" && !trackId) {
          sendJson(response, 400, {
            error:
              "Missing track query parameter for track scope",
          });
          return;
        }

        const mediaRoot = await resolveMediaRoot();
        const release = await scanReleaseById(
          mediaRoot,
          releaseId,
        );

        if (!release) {
          sendJson(response, 404, {
            error: "Release not found",
          });
          return;
        }

        const inferredPreview =
          buildMetadataPreview(release);

        const generatedPreview =
          buildGeneratedTomlPreview(
            release,
            inferredPreview,
          );

        sendJson(
          response,
          200,
          buildMetadataGenerationPlan(
            release,
            generatedPreview,
            {
              scope,
              trackId,
            },
          ),
        );
      } catch (error) {
        sendJson(response, 500, {
          error:
            error instanceof Error
              ? error.message
              : "Unknown generation-plan error",
        });
      }

      return;
    }

    if (
      request.method === "GET" &&
      requestUrl.pathname ===
        "/api/library/generated-preview"
    ) {
      try {
        const releaseId =
          requestUrl.searchParams.get("release");

        if (!releaseId) {
          sendJson(response, 400, {
            error:
              "Missing release query parameter",
          });
          return;
        }

        const mediaRoot = await resolveMediaRoot();
        const release = await scanReleaseById(
          mediaRoot,
          releaseId,
        );

        if (!release) {
          sendJson(response, 404, {
            error: "Release not found",
          });
          return;
        }

        const inferredPreview =
          buildMetadataPreview(release);

        sendJson(
          response,
          200,
          buildGeneratedTomlPreview(
            release,
            inferredPreview,
          ),
        );
      } catch (error) {
        sendJson(response, 500, {
          error:
            error instanceof Error
              ? error.message
              : "Unknown generated-preview error",
        });
      }

      return;
    }

    if (
      request.method === "GET" &&
      requestUrl.pathname === "/api/library/preview"
    ) {
      try {
        const releaseId =
          requestUrl.searchParams.get("release");

        if (!releaseId) {
          sendJson(response, 400, {
            error: "Missing release query parameter",
          });
          return;
        }

        const mediaRoot = await resolveMediaRoot();
        const release = await scanReleaseById(
          mediaRoot,
          releaseId,
        );

        if (!release) {
          sendJson(response, 404, {
            error: "Release not found",
          });
          return;
        }

        sendJson(
          response,
          200,
          buildMetadataPreview(release),
        );
      } catch (error) {
        sendJson(response, 500, {
          error:
            error instanceof Error
              ? error.message
              : "Unknown preview error",
        });
      }

      return;
    }

    if (
      request.method === "GET" &&
      requestUrl.pathname === "/api/publish/fleet"
    ) {
      try {
        const [mediaRoot, publishRoot] =
          await Promise.all([
            resolveMediaRoot(),
            resolvePublishRoot(),
          ]);

        sendJson(
          response,
          200,
          await buildPublishFleetSummary(
            mediaRoot,
            publishRoot,
          ),
        );
      } catch (error) {
        sendJson(response, 500, {
          error:
            error instanceof Error
              ? error.message
              : "Unknown publish-fleet error",
        });
      }

      return;
    }

    if (
      request.method === "GET" &&
      requestUrl.pathname === "/api/publish/deployment-audit"
    ) {
      try {
        const publishRoot = await resolvePublishRoot();
        sendJson(
          response,
          200,
          await auditPublishedMediaDeployment(
            publishRoot,
          ),
        );
      } catch (error) {
        sendJson(response, 500, {
          error:
            error instanceof Error
              ? error.message
              : "Unknown deployment-audit error",
        });
      }

      return;
    }

    if (
      request.method === "POST" &&
      requestUrl.pathname === "/api/publish/deployment-manifest"
    ) {
      try {
        const publishRoot = await resolvePublishRoot();
        const history = await listPublishOperations(
          publishRoot,
          { limit: 200 },
        );
        const runningOperation = history.operations.some(
          (operation) => operation.state === "running",
        );

        if (
          runningOperation ||
          history.interruptedCount > 0
        ) {
          sendJson(response, 409, {
            error:
              "Deployment manifest cannot be refreshed while a publish operation is running or interrupted.",
          });
          return;
        }

        sendJson(
          response,
          200,
          await writePublishedMediaDeploymentManifest(
            publishRoot,
          ),
        );
      } catch (error) {
        sendJson(response, 400, {
          error:
            error instanceof Error
              ? error.message
              : "Unknown deployment-manifest error",
        });
      }

      return;
    }

    if (
      request.method === "GET" &&
      requestUrl.pathname === "/api/publish/deployment-target"
    ) {
      try {
        const publishRoot = await resolvePublishRoot();
        sendJson(
          response,
          200,
          await buildPublishedMediaDeploymentTargetStatus(
            publishRoot,
            process.env,
            requestUrl.searchParams.get("profile") ?? undefined,
          ),
        );
      } catch (error) {
        sendJson(response, 400, {
          error:
            error instanceof Error
              ? error.message
              : "Unknown deployment-target error",
        });
      }

      return;
    }

    if (
      request.method === "POST" &&
      requestUrl.pathname === "/api/publish/deployment-sync-plan"
    ) {
      try {
        const publishRoot = await resolvePublishRoot();
        sendJson(
          response,
          200,
          await buildPublishedMediaDeploymentSyncPlan(
            publishRoot,
            process.env,
            requestUrl.searchParams.get("profile") ?? undefined,
          ),
        );
      } catch (error) {
        sendJson(response, 400, {
          error:
            error instanceof Error
              ? error.message
              : "Unknown deployment-sync-plan error",
        });
      }

      return;
    }

    if (
      request.method === "POST" &&
      requestUrl.pathname === "/api/publish/deployment-sandbox-execute"
    ) {
      try {
        const body = await readJsonBody(request);
        if (typeof body !== "object" || body === null) {
          sendJson(response, 400, {
            error: "Expected a JSON object",
          });
          return;
        }

        const planFingerprint =
          "planFingerprint" in body &&
          typeof body.planFingerprint === "string"
            ? body.planFingerprint
            : "";
        if (!planFingerprint) {
          sendJson(response, 400, {
            error: "planFingerprint is required",
          });
          return;
        }
        const allowPendingLibraryChanges =
          "allowPendingLibraryChanges" in body &&
          body.allowPendingLibraryChanges === true;

        const [mediaRoot, publishRoot] =
          await Promise.all([
            resolveMediaRoot(),
            resolvePublishRoot(),
          ]);
        const fleet = await buildPublishFleetSummary(
          mediaRoot,
          publishRoot,
        );
        if (
          fleet.summary.updateAvailableCount > 0 &&
          !allowPendingLibraryChanges
        ) {
          sendJson(response, 409, {
            error:
              `${fleet.summary.updateAvailableCount} published ${fleet.summary.updateAvailableCount === 1 ? "release has" : "releases have"} pending Library changes. Update the public package before deployment, or explicitly allow deployment of the older public snapshot.`,
          });
          return;
        }

        const status =
          await buildPublishedMediaDeploymentTargetStatus(
            publishRoot,
            process.env,
            "local-sandbox",
          );
        if (!status.target || status.target.kind !== "local") {
          sendJson(response, 409, {
            error:
              "Browser deployment is restricted to the local-sandbox profile with a local filesystem target. Production and SSH deployment remain CLI-only.",
          });
          return;
        }

        sendJson(
          response,
          200,
          await executePublishedMediaDeployment(
            publishRoot,
            {
              confirmation: status.deployConfirmation,
              planFingerprint,
              profileName: "local-sandbox",
            },
          ),
        );
      } catch (error) {
        sendJson(response, 400, {
          error:
            error instanceof Error
              ? error.message
              : "Unknown local sandbox deployment error",
        });
      }

      return;
    }

    if (
      request.method === "POST" &&
      requestUrl.pathname === "/api/publish/deployment-sandbox-rollback"
    ) {
      try {
        const publishRoot = await resolvePublishRoot();
        const status =
          await buildPublishedMediaDeploymentTargetStatus(
            publishRoot,
            process.env,
            "local-sandbox",
          );
        if (!status.target || status.target.kind !== "local") {
          sendJson(response, 409, {
            error:
              "Browser rollback is restricted to the local-sandbox profile with a local filesystem target. Production and SSH rollback remain CLI-only.",
          });
          return;
        }

        sendJson(
          response,
          200,
          await rollbackPublishedMediaDeployment(
            publishRoot,
            {
              confirmation: status.rollbackConfirmation,
              profileName: "local-sandbox",
            },
          ),
        );
      } catch (error) {
        sendJson(response, 400, {
          error:
            error instanceof Error
              ? error.message
              : "Unknown local sandbox rollback error",
        });
      }

      return;
    }

    if (
      request.method === "GET" &&
      requestUrl.pathname === "/api/publish/plan"
    ) {
      try {
        const releaseId =
          requestUrl.searchParams.get("release");

        if (!releaseId) {
          sendJson(response, 400, {
            error: "Missing release query parameter",
          });
          return;
        }

        const [mediaRoot, publishRoot] =
          await Promise.all([
            resolveMediaRoot(),
            resolvePublishRoot(),
          ]);

        sendJson(
          response,
          200,
          await buildPublishPlan(
            mediaRoot,
            publishRoot,
            releaseId,
          ),
        );
      } catch (error) {
        sendJson(response, 400, {
          error:
            error instanceof Error
              ? error.message
              : "Unknown publish-plan error",
        });
      }

      return;
    }

    if (
      request.method === "GET" &&
      requestUrl.pathname === "/api/publish/unpublish-plan"
    ) {
      try {
        const releaseId =
          requestUrl.searchParams.get("release");

        if (!releaseId) {
          sendJson(response, 400, {
            error: "Missing release query parameter",
          });
          return;
        }

        const publishRoot = await resolvePublishRoot();
        sendJson(
          response,
          200,
          await buildPublicReleaseUnpublishPlan(
            publishRoot,
            releaseId,
          ),
        );
      } catch (error) {
        sendJson(response, 400, {
          error:
            error instanceof Error
              ? error.message
              : "Unknown unpublish-plan error",
        });
      }

      return;
    }

    if (
      request.method === "GET" &&
      requestUrl.pathname === "/api/publish/prepare-progress"
    ) {
      const operationId =
        requestUrl.searchParams.get("operationId") ?? "";
      if (!operationId) {
        sendJson(response, 400, {
          error: "operationId is required",
        });
        return;
      }

      const progress =
        readMediaPreparationProgress(operationId);
      if (!progress) {
        sendJson(response, 404, {
          error: "Media preparation progress is not available yet.",
        });
        return;
      }

      sendJson(response, 200, progress);
      return;
    }

    if (
      request.method === "GET" &&
      requestUrl.pathname === "/api/publish/video-plan"
    ) {
      try {
        const releaseId =
          requestUrl.searchParams.get("release") ?? "";
        if (!releaseId) {
          sendJson(response, 400, {
            error: "Missing release query parameter",
          });
          return;
        }

        const mediaRoot = await resolveMediaRoot();
        const release = await scanReleaseById(
          mediaRoot,
          releaseId,
        );
        if (!release) {
          sendJson(response, 404, {
            error: "Release not found",
          });
          return;
        }

        const capabilities =
          await detectFfmpegCapabilities();
        sendJson(
          response,
          200,
          await buildVideoWebStreamPlan(
            mediaRoot,
            release,
            capabilities,
          ),
        );
      } catch (error) {
        sendJson(response, 400, {
          error:
            error instanceof Error
              ? error.message
              : "Unknown video-plan error",
        });
      }

      return;
    }

    if (
      request.method === "GET" &&
      requestUrl.pathname === "/api/publish/operations"
    ) {
      try {
        const publishRoot = await resolvePublishRoot();
        const releaseId =
          requestUrl.searchParams.get("release") ?? undefined;
        const requestedLimit = Number.parseInt(
          requestUrl.searchParams.get("limit") ?? "30",
          10,
        );
        const limit = Number.isFinite(requestedLimit)
          ? requestedLimit
          : 30;

        sendJson(
          response,
          200,
          await listPublishOperations(
            publishRoot,
            {
              ...(releaseId ? { releaseId } : {}),
              limit,
            },
          ),
        );
      } catch (error) {
        sendJson(response, 400, {
          error:
            error instanceof Error
              ? error.message
              : "Unknown publish-operation history error",
        });
      }

      return;
    }

    if (
      request.method === "POST" &&
      requestUrl.pathname === "/api/publish/recover"
    ) {
      try {
        const body = await readJsonBody(request);

        if (
          typeof body !== "object" ||
          body === null
        ) {
          sendJson(response, 400, {
            error: "Expected a JSON object",
          });
          return;
        }

        const operationId =
          "operationId" in body &&
          typeof body.operationId === "string"
            ? body.operationId
            : "";

        if (!operationId) {
          sendJson(response, 400, {
            error: "operationId is required",
          });
          return;
        }

        const publishRoot = await resolvePublishRoot();
        sendJson(
          response,
          200,
          await recoverPublishOperation(
            publishRoot,
            operationId,
          ),
        );
      } catch (error) {
        sendJson(response, 400, {
          error:
            error instanceof Error
              ? error.message
              : "Unknown publish recovery error",
        });
      }

      return;
    }

    if (
      request.method === "POST" &&
      requestUrl.pathname === "/api/publish/prepare-batch"
    ) {
      try {
        const body = await readJsonBody(request);

        if (
          typeof body !== "object" ||
          body === null
        ) {
          sendJson(response, 400, {
            error: "Expected a JSON object",
          });
          return;
        }

        const rawReleaseIds =
          "releaseIds" in body &&
          Array.isArray(body.releaseIds)
            ? body.releaseIds
            : [];
        const releaseIds = Array.from(
          new Set(
            rawReleaseIds.filter(
              (releaseId): releaseId is string =>
                typeof releaseId === "string" &&
                releaseId.trim().length > 0,
            ),
          ),
        );
        const scope =
          "scope" in body &&
          body.scope === "playback"
            ? "playback"
            : "all";

        if (
          releaseIds.length === 0 ||
          releaseIds.length > 50
        ) {
          sendJson(response, 400, {
            error:
              "releaseIds must contain between 1 and 50 release ids",
          });
          return;
        }

        const [mediaRoot, publishRoot, capabilities] =
          await Promise.all([
            resolveMediaRoot(),
            resolvePublishRoot(),
            detectFfmpegCapabilities(),
          ]);
        const results: Array<Record<string, unknown>> = [];

        for (const releaseId of releaseIds) {
          try {
            const generatedAt = new Date().toISOString();
            const plan = await buildPublishPlan(
              mediaRoot,
              publishRoot,
              releaseId,
              {
                generatedAt,
                ffmpegCapabilities: capabilities,
              },
            );
            const regularNeedsPreparation =
              scope === "playback"
                ? plan.libraryPlayback.createCount > 0 ||
                  plan.libraryPlayback.replaceCount > 0
                : plan.libraryPlayback.createCount > 0 ||
                  plan.libraryPlayback.replaceCount > 0 ||
                  plan.webStreams.createCount > 0 ||
                  plan.webStreams.replaceCount > 0 ||
                  plan.waveforms.createCount > 0 ||
                  plan.waveforms.replaceCount > 0 ||
                  plan.issues.some(
                    (issue) =>
                      issue.code ===
                        "browser-artwork-preparation-required",
                  );
            const videoNeedsPreparation =
              scope === "all" &&
              (plan.videoStreams.createCount > 0 ||
                plan.videoStreams.replaceCount > 0);

            if (
              scope === "all" &&
              plan.videoStreams.blockedCount > 0
            ) {
              throw new Error(
                "Video preparation is blocked by one or more canonical video sources or required FFmpeg encoders.",
              );
            }

            if (
              !regularNeedsPreparation &&
              !videoNeedsPreparation
            ) {
              results.push({
                releaseId,
                status: "skipped",
                message:
                  scope === "playback"
                    ? "Library playback MP3s are already current."
                    : "Release media is already current.",
              });
              continue;
            }

            let mediaReceipt: unknown;
            let videoReceipt: unknown;

            if (regularNeedsPreparation) {
              mediaReceipt = await prepareReleaseMedia(
                mediaRoot,
                publishRoot,
                releaseId,
                {
                  expectedPublishPlanFingerprint:
                    plan.planFingerprint,
                  publishPlanGeneratedAt:
                    plan.generatedAt,
                  scope,
                  ffmpegCapabilities: capabilities,
                },
              );
            }

            if (videoNeedsPreparation) {
              const release = await scanReleaseById(
                mediaRoot,
                releaseId,
              );
              if (!release) {
                throw new Error(
                  `Release not found: ${releaseId}`,
                );
              }

              const videoPlan =
                await buildVideoWebStreamPlan(
                  mediaRoot,
                  release,
                  capabilities,
                  { generatedAt },
                );

              if (videoPlan.summary.blockedCount > 0) {
                throw new Error(
                  "Video preparation is blocked by one or more canonical video sources or required FFmpeg encoders.",
                );
              }

              videoReceipt =
                await prepareReleaseVideoWebStreams(
                  mediaRoot,
                  releaseId,
                  {
                    expectedPlanFingerprint:
                      videoPlan.planFingerprint,
                    planGeneratedAt:
                      videoPlan.generatedAt,
                    ffmpegCapabilities: capabilities,
                  },
                );
            }

            results.push({
              releaseId,
              status: "prepared",
              ...(mediaReceipt ? { receipt: mediaReceipt } : {}),
              ...(videoReceipt ? { videoReceipt } : {}),
            });
          } catch (error) {
            results.push({
              releaseId,
              status: "failed",
              error:
                error instanceof Error
                  ? error.message
                  : "Unknown batch-preparation error",
            });
          }
        }

        sendJson(response, 200, {
          scope,
          releaseCount: releaseIds.length,
          preparedCount: results.filter(
            (result) => result.status === "prepared",
          ).length,
          skippedCount: results.filter(
            (result) => result.status === "skipped",
          ).length,
          failedCount: results.filter(
            (result) => result.status === "failed",
          ).length,
          results,
        });
      } catch (error) {
        sendJson(response, 400, {
          error:
            error instanceof Error
              ? error.message
              : "Unknown batch-preparation error",
        });
      }

      return;
    }

    if (
      request.method === "POST" &&
      requestUrl.pathname === "/api/publish/prepare-video"
    ) {
      try {
        const body = await readJsonBody(request);
        if (
          typeof body !== "object" ||
          body === null
        ) {
          sendJson(response, 400, {
            error: "Expected a JSON object",
          });
          return;
        }

        const releaseId =
          "releaseId" in body &&
          typeof body.releaseId === "string"
            ? body.releaseId
            : "";
        const planFingerprint =
          "planFingerprint" in body &&
          typeof body.planFingerprint === "string"
            ? body.planFingerprint
            : "";
        const planGeneratedAt =
          "planGeneratedAt" in body &&
          typeof body.planGeneratedAt === "string"
            ? body.planGeneratedAt
            : "";
        const operationId =
          "operationId" in body &&
          typeof body.operationId === "string"
            ? body.operationId
            : "";

        if (
          !releaseId ||
          !planFingerprint ||
          !planGeneratedAt
        ) {
          sendJson(response, 400, {
            error:
              "releaseId, planFingerprint, and planGeneratedAt are required",
          });
          return;
        }

        if (
          operationId &&
          !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(operationId)
        ) {
          sendJson(response, 400, {
            error:
              "operationId contains unsupported characters",
          });
          return;
        }

        const mediaRoot = await resolveMediaRoot();
        const result =
          await prepareReleaseVideoWebStreams(
            mediaRoot,
            releaseId,
            {
              expectedPlanFingerprint:
                planFingerprint,
              planGeneratedAt,
              ...(operationId
                ? { operationId }
                : {}),
              onProgress:
                recordMediaPreparationProgress,
            },
          );
        sendJson(response, 200, result);
      } catch (error) {
        sendJson(response, 400, {
          error:
            error instanceof Error
              ? error.message
              : "Unknown video-preparation error",
        });
      }

      return;
    }

    if (
      request.method === "POST" &&
      requestUrl.pathname === "/api/publish/prepare"
    ) {
      try {
        const body = await readJsonBody(request);

        if (
          typeof body !== "object" ||
          body === null
        ) {
          sendJson(response, 400, {
            error: "Expected a JSON object",
          });
          return;
        }

        const releaseId =
          "releaseId" in body &&
          typeof body.releaseId === "string"
            ? body.releaseId
            : "";
        const planFingerprint =
          "planFingerprint" in body &&
          typeof body.planFingerprint === "string"
            ? body.planFingerprint
            : "";
        const planGeneratedAt =
          "planGeneratedAt" in body &&
          typeof body.planGeneratedAt === "string"
            ? body.planGeneratedAt
            : "";
        const operationId =
          "operationId" in body &&
          typeof body.operationId === "string"
            ? body.operationId
            : "";
        const scope =
          "scope" in body &&
          typeof body.scope === "string"
            ? body.scope
            : "all";

        if (
          !releaseId ||
          !planFingerprint ||
          !planGeneratedAt
        ) {
          sendJson(response, 400, {
            error:
              "releaseId, planFingerprint, and planGeneratedAt are required",
          });
          return;
        }

        if (
          operationId &&
          !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(operationId)
        ) {
          sendJson(response, 400, {
            error: "operationId contains unsupported characters",
          });
          return;
        }

        if (scope !== "all" && scope !== "playback") {
          sendJson(response, 400, {
            error: "scope must be all or playback",
          });
          return;
        }

        const [mediaRoot, publishRoot] =
          await Promise.all([
            resolveMediaRoot(),
            resolvePublishRoot(),
          ]);

        const result = await prepareReleaseMedia(
          mediaRoot,
          publishRoot,
          releaseId,
          {
            expectedPublishPlanFingerprint:
              planFingerprint,
            publishPlanGeneratedAt:
              planGeneratedAt,
            scope,
            ...(operationId ? { operationId } : {}),
            onProgress: recordMediaPreparationProgress,
          },
        );
        sendJson(response, 200, result);
      } catch (error) {
        sendJson(response, 400, {
          error:
            error instanceof Error
              ? error.message
              : "Unknown media-preparation error",
        });
      }

      return;
    }

    if (
      request.method === "POST" &&
      requestUrl.pathname === "/api/publish/unpublish"
    ) {
      try {
        const body = await readJsonBody(request);

        if (
          typeof body !== "object" ||
          body === null
        ) {
          sendJson(response, 400, {
            error: "Expected a JSON object",
          });
          return;
        }

        const releaseId =
          "releaseId" in body &&
          typeof body.releaseId === "string"
            ? body.releaseId
            : "";
        const planFingerprint =
          "planFingerprint" in body &&
          typeof body.planFingerprint === "string"
            ? body.planFingerprint
            : "";
        const planGeneratedAt =
          "planGeneratedAt" in body &&
          typeof body.planGeneratedAt === "string"
            ? body.planGeneratedAt
            : "";
        const confirmation =
          "confirmation" in body &&
          typeof body.confirmation === "string"
            ? body.confirmation
            : "";

        if (
          !releaseId ||
          !planFingerprint ||
          !planGeneratedAt ||
          !confirmation
        ) {
          sendJson(response, 400, {
            error:
              "releaseId, planFingerprint, planGeneratedAt, and confirmation are required",
          });
          return;
        }

        const publishRoot = await resolvePublishRoot();
        sendJson(
          response,
          200,
          await unpublishPublicRelease(
            publishRoot,
            releaseId,
            {
              expectedPlanFingerprint:
                planFingerprint,
              planGeneratedAt,
              confirmation,
            },
          ),
        );
      } catch (error) {
        sendJson(response, 400, {
          error:
            error instanceof Error
              ? error.message
              : "Unknown public unpublish error",
        });
      }

      return;
    }

    if (
      request.method === "POST" &&
      requestUrl.pathname === "/api/publish/build"
    ) {
      try {
        const body = await readJsonBody(request);

        if (
          typeof body !== "object" ||
          body === null
        ) {
          sendJson(response, 400, {
            error: "Expected a JSON object",
          });
          return;
        }

        const releaseId =
          "releaseId" in body &&
          typeof body.releaseId === "string"
            ? body.releaseId
            : "";
        const planFingerprint =
          "planFingerprint" in body &&
          typeof body.planFingerprint === "string"
            ? body.planFingerprint
            : "";
        const planGeneratedAt =
          "planGeneratedAt" in body &&
          typeof body.planGeneratedAt === "string"
            ? body.planGeneratedAt
            : "";

        if (
          !releaseId ||
          !planFingerprint ||
          !planGeneratedAt
        ) {
          sendJson(response, 400, {
            error:
              "releaseId, planFingerprint, and planGeneratedAt are required",
          });
          return;
        }

        const [mediaRoot, publishRoot] =
          await Promise.all([
            resolveMediaRoot(),
            resolvePublishRoot(),
          ]);

        sendJson(
          response,
          200,
          await publishReleasePackage(
            mediaRoot,
            publishRoot,
            releaseId,
            {
              expectedPublishPlanFingerprint:
                planFingerprint,
              publishPlanGeneratedAt:
                planGeneratedAt,
            },
          ),
        );
      } catch (error) {
        sendJson(response, 400, {
          error:
            error instanceof Error
              ? error.message
              : "Unknown public-package error",
        });
      }

      return;
    }

    if (
      request.method === "GET" &&
      requestUrl.pathname === "/api/library/media-technical"
    ) {
      try {
        const releaseId =
          requestUrl.searchParams.get("release") ?? undefined;
        const mediaRoot = await resolveMediaRoot();

        sendJson(
          response,
          200,
          await auditMediaLibraryTechnical(
            mediaRoot,
            releaseId,
          ),
        );
      } catch (error) {
        sendJson(response, 400, {
          error:
            error instanceof Error
              ? error.message
              : "Unknown technical-media audit error",
        });
      }

      return;
    }

    if (
      request.method === "GET" &&
      requestUrl.pathname === "/api/library/scan"
    ) {
      try {
        const mediaRoot = await resolveMediaRoot();
        const result = await scanMediaLibrary(mediaRoot);

        sendJson(response, 200, result);
      } catch (error) {
        sendJson(response, 500, {
          error:
            error instanceof Error
              ? error.message
              : "Unknown scan error",
        });
      }

      return;
    }

    sendJson(response, 404, {
      error: "Not found",
    });
  },
);

server.listen(port, host, () => {
  console.log(
    `Metadata filesystem API listening at http://${host}:${port}`,
  );

  void resolvePublishRoot()
    .then((publishRoot) =>
      listPublishOperations(
        publishRoot,
        { limit: 200 },
      ),
    )
    .then((history) => {
      if (history.interruptedCount > 0) {
        console.warn(
          `Publish recovery: ${history.interruptedCount} interrupted operation${history.interruptedCount === 1 ? "" : "s"} detected from a previous server instance. Review Publish > Operation history.`,
        );
      }
    })
    .catch((error) => {
      console.warn(
        "Unable to inspect publish-operation history at startup:",
        error instanceof Error
          ? error.message
          : String(error),
      );
    });
});
