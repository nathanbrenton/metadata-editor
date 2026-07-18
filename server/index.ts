import {
  readFile,
  realpath,
} from "node:fs/promises";
import {
  createServer,
  type ServerResponse,
} from "node:http";
import path from "node:path";

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
import { metadataFieldRegistry } from "./metadata-registry.js";
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

            return {
              path: change.path,
              value: change.value,
            };
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

            return {
              path: change.path,
              value: change.value,
            };
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
