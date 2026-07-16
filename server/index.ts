import {
  createServer,
  type ServerResponse,
} from "node:http";

import { buildMetadataGenerationPlan } from "./generation-plan.js";
import { readJsonBody } from "./http.js";
import { buildMetadataPreview } from "./inference.js";
import { resolveMediaRoot } from "./media-root.js";
import { readReleaseMetadataDetail } from "./metadata-reader.js";
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

const server = createServer(
  async (request, response) => {
    const requestUrl = new URL(
      request.url ?? "/",
      `http://${host}:${port}`,
    );

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
