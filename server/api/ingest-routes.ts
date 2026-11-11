import type {
  IncomingMessage,
  ServerResponse,
} from "node:http";
import path from "node:path";
import { readJsonBody } from "../http.js";
import {
  inspectIngestCandidate,
  listIngestAttachmentOptions,
  scanIngestDrop,
} from "../ingest-scanner.js";
import {
  defaultIngestRoot,
  resolveIngestRoot,
} from "../ingest-root.js";
import {
  deleteStoredIngestDraft,
  readStoredIngestDraft,
  writeStoredIngestDraft,
} from "../ingest-draft-store.js";
import {
  defaultIngestOutputRoot,
  executeIngestReleaseBuild,
  executeLegacyArtworkReceiptRepair,
  executeLegacyIngestReceiptMigration,
  inspectIngestStagingTarget,
  parseIngestBuildDraft,
  prepareIngestReleaseBuild,
  resolveIngestOutputRoot,
} from "../ingest-builder.js";
import { resolveMediaRoot } from "../media-root.js";
import {
  buildStagingLibraryBuildPlan,
  executeStagingLibraryBuild,
} from "../staging-library-build.js";
import {
  assertIngestSourcesReviewed,
  inspectDraftSources,
  sendIngestArtworkPreview,
  sendIngestAudioPreview,
  sendJson,
} from "./support.js";
import { routeNotHandled } from "./route-result.js";

/*
 * ingest routes. Each block answers one endpoint and returns; reaching the
 * end means no route in this module matched.
 */
export async function handleIngestRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  requestUrl: URL,
): Promise<typeof routeNotHandled | void> {
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
      "/api/ingest/migrate-legacy-receipt"
  ) {
    try {
      const body = await readJsonBody(request);
      if (
        typeof body !== "object" ||
        body === null ||
        Array.isArray(body)
      ) {
        throw new Error(
          "Legacy receipt migration request must be an object.",
        );
      }
      const value = body as Record<string, unknown>;
      if (
        typeof value.releaseId !== "string" ||
        typeof value.expectedFingerprint !== "string" ||
        typeof value.confirmation !== "string"
      ) {
        throw new Error(
          "Legacy receipt migration requires releaseId, expectedFingerprint, and confirmation.",
        );
      }

      const outputRoot = await resolveIngestOutputRoot();
      const receipt = await executeLegacyIngestReceiptMigration(
        outputRoot,
        value.releaseId,
        value.expectedFingerprint,
        value.confirmation,
      );
      const status = await inspectIngestStagingTarget(
        outputRoot,
        value.releaseId,
      );

      sendJson(response, 200, {
        receipt,
        status,
      });
    } catch (error) {
      sendJson(response, 400, {
        error:
          error instanceof Error
            ? error.message
            : "Unknown legacy receipt migration error",
      });
    }

    return;
  }

  if (
    request.method === "POST" &&
    requestUrl.pathname ===
      "/api/ingest/repair-legacy-artwork-receipt"
  ) {
    try {
      const body = await readJsonBody(request);
      if (
        typeof body !== "object" ||
        body === null ||
        Array.isArray(body)
      ) {
        throw new Error(
          "Legacy artwork receipt repair request must be an object.",
        );
      }
      const value = body as Record<string, unknown>;
      if (
        typeof value.releaseId !== "string" ||
        typeof value.expectedFingerprint !== "string" ||
        typeof value.confirmation !== "string"
      ) {
        throw new Error(
          "Legacy artwork receipt repair requires releaseId, expectedFingerprint, and confirmation.",
        );
      }

      const outputRoot = await resolveIngestOutputRoot();
      const receipt = await executeLegacyArtworkReceiptRepair(
        outputRoot,
        value.releaseId,
        value.expectedFingerprint,
        value.confirmation,
      );
      const status = await inspectIngestStagingTarget(
        outputRoot,
        value.releaseId,
      );

      sendJson(response, 200, {
        receipt,
        status,
      });
    } catch (error) {
      sendJson(response, 400, {
        error:
          error instanceof Error
            ? error.message
            : "Unknown legacy artwork receipt repair error",
      });
    }

    return;
  }

  if (
    request.method === "GET" &&
    requestUrl.pathname ===
      "/api/staging/library-build-plan"
  ) {
    const releaseId =
      requestUrl.searchParams.get("release");

    if (!releaseId) {
      sendJson(response, 400, {
        error: "Missing Library release ID",
      });
      return;
    }

    try {
      const mediaRoot =
        await resolveMediaRoot();
      sendJson(
        response,
        200,
        await buildStagingLibraryBuildPlan(
          mediaRoot,
          releaseId,
        ),
      );
    } catch (error) {
      sendJson(response, 400, {
        error:
          error instanceof Error
            ? error.message
            : "Unknown Staging Library Build plan error",
      });
    }

    return;
  }

  if (
    request.method === "POST" &&
    requestUrl.pathname ===
      "/api/staging/library-build"
  ) {
    try {
      const body = await readJsonBody(request);

      if (
        typeof body !== "object" ||
        body === null ||
        Array.isArray(body)
      ) {
        throw new Error(
          "Expected a Staging Library Build request object.",
        );
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
      const confirmation =
        "confirmation" in body &&
        typeof body.confirmation === "string"
          ? body.confirmation
          : "";

      if (!releaseId || !planFingerprint) {
        throw new Error(
          "releaseId and planFingerprint are required.",
        );
      }

      const mediaRoot =
        await resolveMediaRoot();
      sendJson(
        response,
        200,
        await executeStagingLibraryBuild(
          mediaRoot,
          releaseId,
          planFingerprint,
          confirmation,
        ),
      );
    } catch (error) {
      sendJson(response, 400, {
        error:
          error instanceof Error
            ? error.message
            : "Unknown Staging Library Build error",
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

  return routeNotHandled;
}
