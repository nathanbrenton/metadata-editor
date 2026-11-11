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
  importArtistPhoto,
  listArtistPhotoCandidates,
  removeArtistPhoto,
  saveArtistBio,
  setPrimaryArtistPhoto,
} from "../artist-assets.js";
import { readJsonBody } from "../http.js";
import { resolveIngestRoot } from "../ingest-root.js";
import {
  readVideoMetadataForEdit,
  saveVideoMetadataEdits,
} from "../video-metadata.js";
import {
  assertPathWithinRoot,
  resolveMediaRoot,
} from "../media-root.js";
import { scanReleaseById } from "../scanner.js";
import { auditMediaLibraryTechnical } from "../media-technical-audit.js";
import {
  sendJson,
  sendLibraryArtwork,
  sendLibraryArtworkPreview,
  sendLibraryAudioPreview,
  sendLibraryVideoPreview,
  sendLibraryWaveform,
} from "./support.js";
import { routeNotHandled } from "./route-result.js";

/*
 * library-media routes. Each block answers one endpoint and returns; reaching the
 * end means no route in this module matched.
 */
export async function handleLibraryMediaRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  requestUrl: URL,
): Promise<typeof routeNotHandled | void> {
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
    request.method === "POST" &&
    requestUrl.pathname ===
      "/api/library/save-artist-bio"
  ) {
    try {
      const body = await readJsonBody(request);
      if (
        typeof body !== "object" ||
        body === null ||
        Array.isArray(body)
      ) {
        throw new Error(
          "Artist bio body must be an object",
        );
      }

      const record =
        body as Record<string, unknown>;
      if (
        typeof record.artistId !== "string" ||
        typeof record.bio !== "string"
      ) {
        throw new Error(
          "Saving an Artist bio requires artistId and bio",
        );
      }

      const mediaRoot =
        await resolveMediaRoot();
      sendJson(
        response,
        200,
        await saveArtistBio(
          mediaRoot,
          {
            artistId: record.artistId,
            bio: record.bio,
          },
        ),
      );
    } catch (error) {
      sendJson(response, 400, {
        error:
          error instanceof Error
            ? error.message
            : "Unable to save Artist bio",
      });
    }

    return;
  }

  if (
    request.method === "GET" &&
    requestUrl.pathname ===
      "/api/library/artist-photo-candidates"
  ) {
    try {
      const ingestRoot = await resolveIngestRoot();
      sendJson(response, 200, {
        candidates: await listArtistPhotoCandidates(
          ingestRoot,
        ),
      });
    } catch (error) {
      sendJson(response, 500, {
        error:
          error instanceof Error
            ? error.message
            : "Unable to list Artist photo candidates",
      });
    }

    return;
  }

  if (
    request.method === "POST" &&
    requestUrl.pathname ===
      "/api/library/import-artist-photo"
  ) {
    try {
      const body = await readJsonBody(request);
      if (
        typeof body !== "object" ||
        body === null ||
        Array.isArray(body)
      ) {
        throw new Error("Artist photo import body must be an object");
      }

      const record = body as Record<string, unknown>;
      if (
        typeof record.artistId !== "string" ||
        typeof record.sourceRelativePath !== "string"
      ) {
        throw new Error(
          "Artist photo import requires artistId and sourceRelativePath",
        );
      }
      if (
        record.setPrimary !== undefined &&
        typeof record.setPrimary !== "boolean"
      ) {
        throw new Error("setPrimary must be a boolean");
      }

      const [mediaRoot, ingestRoot] = await Promise.all([
        resolveMediaRoot(),
        resolveIngestRoot(),
      ]);
      sendJson(
        response,
        200,
        await importArtistPhoto(
          mediaRoot,
          ingestRoot,
          {
            artistId: record.artistId,
            sourceRelativePath:
              record.sourceRelativePath,
            ...(typeof record.setPrimary === "boolean"
              ? { setPrimary: record.setPrimary }
              : {}),
          },
        ),
      );
    } catch (error) {
      sendJson(response, 400, {
        error:
          error instanceof Error
            ? error.message
            : "Unable to import Artist photo",
      });
    }

    return;
  }

  if (
    request.method === "POST" &&
    requestUrl.pathname ===
      "/api/library/set-primary-artist-photo"
  ) {
    try {
      const body = await readJsonBody(request);
      if (
        typeof body !== "object" ||
        body === null ||
        Array.isArray(body)
      ) {
        throw new Error("Primary Artist photo body must be an object");
      }

      const record = body as Record<string, unknown>;
      if (
        typeof record.artistId !== "string" ||
        typeof record.assetId !== "string"
      ) {
        throw new Error(
          "Setting a primary Artist photo requires artistId and assetId",
        );
      }

      const mediaRoot = await resolveMediaRoot();
      sendJson(
        response,
        200,
        await setPrimaryArtistPhoto(
          mediaRoot,
          {
            artistId: record.artistId,
            assetId: record.assetId,
          },
        ),
      );
    } catch (error) {
      sendJson(response, 400, {
        error:
          error instanceof Error
            ? error.message
            : "Unable to set primary Artist photo",
      });
    }

    return;
  }

  if (
    request.method === "POST" &&
    requestUrl.pathname ===
      "/api/library/remove-artist-photo"
  ) {
    try {
      const body = await readJsonBody(request);
      if (
        typeof body !== "object" ||
        body === null ||
        Array.isArray(body)
      ) {
        throw new Error("Remove Artist photo body must be an object");
      }

      const record = body as Record<string, unknown>;
      if (
        typeof record.artistId !== "string" ||
        typeof record.assetId !== "string"
      ) {
        throw new Error(
          "Removing an Artist photo requires artistId and assetId",
        );
      }

      const mediaRoot = await resolveMediaRoot();
      sendJson(
        response,
        200,
        await removeArtistPhoto(
          mediaRoot,
          {
            artistId: record.artistId,
            assetId: record.assetId,
          },
        ),
      );
    } catch (error) {
      sendJson(response, 400, {
        error:
          error instanceof Error
            ? error.message
            : "Unable to remove Artist photo",
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

  return routeNotHandled;
}
