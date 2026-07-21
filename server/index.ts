import {
  readFile,
  realpath,
} from "node:fs/promises";
import {
  createServer,
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
  readIngestArtworkPreview,
} from "./ingest-artwork.js";
import {
  deleteStoredIngestDraft,
  parseStoredIngestDraft,
  readStoredIngestDraft,
  writeStoredIngestDraft,
} from "./ingest-draft-store.js";
import {
  defaultIngestOutputRoot,
  executeIngestReleaseBuild,
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
): Promise<void> {
  const ingestRoot = await resolveIngestRoot();
  const preview = await readIngestArtworkPreview(
    ingestRoot,
    relativePath,
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

      try {
        await sendIngestArtworkPreview(
          response,
          relativePath,
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

        sendJson(response, 201, result);
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
          ![
            "track.contributors",
            "release.credits.contributors",
          ].includes(technicalContributorPath)
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

        const normalizedManagedTechnicalContributorSourceIndexes =
          managedTechnicalContributorSourceIndexes ===
            undefined
            ? []
            : managedTechnicalContributorSourceIndexes;

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
});
