import type {
  IncomingMessage,
  ServerResponse,
} from "node:http";
import { buildMetadataExportPlan } from "../export-plan.js";
import { executeValidatedExportPlan } from "../export-executor.js";
import {
  resolveExportOutputRoot,
  validateMetadataExportPlan,
} from "../export-validator.js";
import { detectFfmpegCapabilities } from "../ffmpeg-capabilities.js";
import { buildMediaProcessingPlan } from "../media-processing/plan.js";
import { readJsonBody } from "../http.js";
import { metadataFieldRegistry } from "../metadata-registry.js";
import { resolveMediaRoot } from "../media-root.js";
import { readReleaseMetadataDetail } from "../metadata-reader.js";
import { scanReleaseById } from "../scanner.js";
import { readWorkflowLocations } from "../workflow-locations.js";
import {
  sendJson,
} from "./support.js";
import { routeNotHandled } from "./route-result.js";

/*
 * system routes. Each block answers one endpoint and returns; reaching the
 * end means no route in this module matched.
 */
export async function handleSystemRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  requestUrl: URL,
): Promise<typeof routeNotHandled | void> {
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

  return routeNotHandled;
}
