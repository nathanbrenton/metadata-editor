import {
  detectFfmpegCapabilities,
} from "./ffmpeg-capabilities.js";
import {
  buildPublishPlan,
} from "./publish-plan.js";
import {
  scanMediaLibrary,
} from "./scanner.js";
import {
  auditPublishedMediaDeployment,
  type PublishedMediaDeploymentAudit,
} from "./published-media-deployment.js";

export type PublishFleetRelease = {
  releaseId: string;
  releaseTitle?: string;
  primaryArtistName?: string;
  publicationState:
    | "not-published"
    | "up-to-date"
    | "update-available";
  planStatus: "ready" | "warning" | "blocked";
  blockerCount: number;
  warningCount: number;
  needsPreparation: boolean;
  playbackNeedsPreparation: boolean;
  audioStreamNeedsPreparation: boolean;
  videoStreamNeedsPreparation: boolean;
  waveformNeedsPreparation: boolean;
};

export type PublishFleetSummary = {
  schema: {
    name: "metadata-editor-publish-fleet";
    version: 1;
  };
  generatedAt: string;
  releases: PublishFleetRelease[];
  summary: {
    releaseCount: number;
    notPublishedCount: number;
    currentCount: number;
    updateAvailableCount: number;
    blockedCount: number;
    warningCount: number;
    needsPreparationCount: number;
  };
  deployment: PublishedMediaDeploymentAudit;
};

export async function buildPublishFleetSummary(
  mediaRoot: string,
  publishRoot: string,
): Promise<PublishFleetSummary> {
  const generatedAt = new Date().toISOString();
  const [library, ffmpegCapabilities] =
    await Promise.all([
      scanMediaLibrary(mediaRoot),
      detectFfmpegCapabilities(),
    ]);
  const releases: PublishFleetRelease[] = [];

  for (const release of library.releases) {
    const plan = await buildPublishPlan(
      mediaRoot,
      publishRoot,
      release.id,
      { ffmpegCapabilities },
    );
    const blockerCount = plan.issues.filter(
      (issue) => issue.severity === "blocked",
    ).length;
    const warningCount = plan.issues.filter(
      (issue) => issue.severity === "warning",
    ).length;
    const audioStreamNeedsPreparation =
      plan.webStreams.createCount > 0 ||
      plan.webStreams.replaceCount > 0 ||
      plan.webStreams.blockedCount > 0;
    const videoStreamNeedsPreparation =
      plan.videoStreams.createCount > 0 ||
      plan.videoStreams.replaceCount > 0 ||
      plan.videoStreams.blockedCount > 0;
    const waveformNeedsPreparation =
      plan.waveforms.createCount > 0 ||
      plan.waveforms.replaceCount > 0 ||
      plan.waveforms.blockedCount > 0;
    const playbackNeedsPreparation =
      plan.libraryPlayback.createCount > 0 ||
      plan.libraryPlayback.replaceCount > 0 ||
      plan.libraryPlayback.blockedCount > 0;

    releases.push({
      releaseId: release.id,
      ...(release.releaseTitle
        ? { releaseTitle: release.releaseTitle }
        : {}),
      ...(release.primaryArtistName
        ? {
            primaryArtistName:
              release.primaryArtistName,
          }
        : {}),
      publicationState: plan.publication.state,
      planStatus: plan.status,
      blockerCount,
      warningCount,
      needsPreparation:
        audioStreamNeedsPreparation ||
        videoStreamNeedsPreparation ||
        waveformNeedsPreparation,
      playbackNeedsPreparation,
      audioStreamNeedsPreparation,
      videoStreamNeedsPreparation,
      waveformNeedsPreparation,
    });
  }

  releases.sort((left, right) =>
    left.releaseId.localeCompare(
      right.releaseId,
      undefined,
      { numeric: true },
    ),
  );

  return {
    schema: {
      name: "metadata-editor-publish-fleet",
      version: 1,
    },
    generatedAt,
    releases,
    summary: {
      releaseCount: releases.length,
      notPublishedCount: releases.filter(
        (release) =>
          release.publicationState === "not-published",
      ).length,
      currentCount: releases.filter(
        (release) =>
          release.publicationState === "up-to-date",
      ).length,
      updateAvailableCount: releases.filter(
        (release) =>
          release.publicationState === "update-available",
      ).length,
      blockedCount: releases.filter(
        (release) => release.blockerCount > 0,
      ).length,
      warningCount: releases.filter(
        (release) => release.warningCount > 0,
      ).length,
      needsPreparationCount: releases.filter(
        (release) => release.needsPreparation,
      ).length,
    },
    deployment: await auditPublishedMediaDeployment(
      publishRoot,
      generatedAt,
    ),
  };
}
