import type {
  IncomingMessage,
  ServerResponse,
} from "node:http";
import { detectFfmpegCapabilities } from "../ffmpeg-capabilities.js";
import { readJsonBody } from "../http.js";
import { resolveMediaRoot } from "../media-root.js";
import { scanReleaseById } from "../scanner.js";
import { buildPublishPlan } from "../publish-plan.js";
import { saveReleasePublicationSettings } from "../publication-settings.js";
import { publishReleasePackage } from "../publish-writer.js";
import {
  buildPublicReleaseUnpublishPlan,
  unpublishPublicRelease,
} from "../publication-membership.js";
import {
  listPublishOperations,
  recoverPublishOperation,
} from "../publish-operations.js";
import { buildPublishFleetSummary } from "../publish-fleet.js";
import {
  buildArtistPublicationPlan,
  publishArtistPackage,
} from "../artist-publication.js";
import {
  auditPublishedMediaDeployment,
  writePublishedMediaDeploymentManifest,
} from "../published-media-deployment.js";
import {
  buildPublishedMediaDeploymentSyncPlan,
  buildPublishedMediaDeploymentTargetStatus,
  executePublishedMediaDeployment,
  rollbackPublishedMediaDeployment,
} from "../deployment-sync.js";
import { prepareReleaseMedia } from "../media-processing/prepare.js";
import { prepareReleaseVideoWebStreams } from "../media-processing/video-prepare.js";
import { buildVideoWebStreamPlan } from "../media-processing/video-web-stream.js";
import {
  readMediaPreparationProgress,
  recordMediaPreparationProgress,
} from "../media-processing/progress.js";
import { resolvePublishRoot } from "../workflow-locations.js";
import {
  sendJson,
} from "./support.js";
import { routeNotHandled } from "./route-result.js";

/*
 * publish routes. Each block answers one endpoint and returns; reaching the
 * end means no route in this module matched.
 */
export async function handlePublishRoutes(
  request: IncomingMessage,
  response: ServerResponse,
  requestUrl: URL,
): Promise<typeof routeNotHandled | void> {
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
    requestUrl.pathname === "/api/publish/artists-plan"
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
        await buildArtistPublicationPlan(
          mediaRoot,
          publishRoot,
        ),
      );
    } catch (error) {
      sendJson(response, 500, {
        error:
          error instanceof Error
            ? error.message
            : "Unknown Artist publication-plan error",
      });
    }

    return;
  }

  if (
    request.method === "POST" &&
    requestUrl.pathname === "/api/publish/artists-build"
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
        !planFingerprint ||
        !planGeneratedAt
      ) {
        sendJson(response, 400, {
          error:
            "planFingerprint and planGeneratedAt are required",
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
        await publishArtistPackage(
          mediaRoot,
          publishRoot,
          {
            expectedPlanFingerprint:
              planFingerprint,
            planGeneratedAt,
          },
        ),
      );
    } catch (error) {
      sendJson(response, 400, {
        error:
          error instanceof Error
            ? error.message
            : "Unknown Artist Web Package error",
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
    request.method === "PUT" &&
    requestUrl.pathname === "/api/publish/release-settings"
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
          : undefined;
      const includeVideo =
        "includeVideo" in body &&
        typeof body.includeVideo === "boolean"
          ? body.includeVideo
          : undefined;
      const includedTrackIds =
        "includedTrackIds" in body &&
        Array.isArray(body.includedTrackIds) &&
        body.includedTrackIds.every(
          (value) => typeof value === "string",
        )
          ? body.includedTrackIds
          : undefined;
      const expectedSha256 =
        "expectedSha256" in body &&
        typeof body.expectedSha256 === "string"
          ? body.expectedSha256
          : undefined;

      if (!releaseId) {
        sendJson(response, 400, {
          error: "releaseId is required",
        });
        return;
      }
      if (includeVideo === undefined) {
        sendJson(response, 400, {
          error: "includeVideo must be true or false",
        });
        return;
      }
      if (!includedTrackIds) {
        sendJson(response, 400, {
          error: "includedTrackIds must be an array of track IDs",
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

      const settings =
        await saveReleasePublicationSettings(
          mediaRoot,
          release,
          {
            includeVideo,
            includedTrackIds,
            ...(expectedSha256
              ? { expectedSha256 }
              : {}),
          },
        );

      sendJson(response, 200, { settings });
    } catch (error) {
      sendJson(response, 400, {
        error:
          error instanceof Error
            ? error.message
            : "Unknown public-media selection error",
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
              : plan.webStreams.createCount > 0 ||
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

            const includedVideoIds = new Set(
              plan.publicSelection.includedVideoIds,
            );
            if (
              videoPlan.items
                .filter((item) =>
                  includedVideoIds.has(item.videoId),
                )
                .some((item) => item.action === "blocked")
            ) {
              throw new Error(
                "Video preparation is blocked by one or more selected canonical video sources or required FFmpeg encoders.",
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
                  includedVideoIds:
                    plan.publicSelection.includedVideoIds,
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
      const includedVideoIds =
        "includedVideoIds" in body &&
        Array.isArray(body.includedVideoIds) &&
        body.includedVideoIds.every(
          (value) => typeof value === "string",
        )
          ? body.includedVideoIds
          : undefined;

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
            ...(includedVideoIds
              ? { includedVideoIds }
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

  return routeNotHandled;
}
