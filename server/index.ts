import {
  readFile,
  realpath,
} from "node:fs/promises";
import {
  createServer,
  type ServerResponse,
} from "node:http";
import path from "node:path";

import { isValidTuningReference } from "../shared/musical-analysis.js";

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
import { buildMetadataGenerationPlan } from "./generation-plan.js";
import { readJsonBody } from "./http.js";
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
};

function assertMetadataFieldMayBeRemoved(
  relativePath: string,
  metadataPath: string,
): void {
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
    path.basename(relativePath) !==
      expectedFilename
  ) {
    throw new Error(
      `Metadata field ${metadataPath} does not belong in ${path.basename(relativePath)}.`,
    );
  }
}


function assertMetadataFieldMayBeCreated(
  relativePath: string,
  metadataPath: string,
): void {
  const field = findMetadataField(metadataPath);
  if (!field || field.repeatable || field.tomlPath.includes("[]")) {
    throw new Error(`Only registered scalar metadata fields may be created: ${metadataPath}`);
  }
  const expectedFilename = metadataStorageFilenames[field.storageFileRole];
  if (!expectedFilename || path.basename(relativePath) !== expectedFilename) {
    throw new Error(`Metadata field ${metadataPath} does not belong in ${path.basename(relativePath)}.`);
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
  [".png", "image/png"],
  [".tif", "image/tiff"],
  [".tiff", "image/tiff"],
  [".webp", "image/webp"],
]);

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
  response.end(content);
}

const server = createServer(
  async (request, response) => {
    const requestUrl = new URL(
      request.url ?? "/",
      `http://${host}:${port}`,
    );

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
