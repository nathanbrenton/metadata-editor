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
import {
  listPublicCatalogMembership,
} from "./publication-membership.js";
import {
  buildArtistPublicationPlan,
  type ArtistPublicationPlan,
} from "./artist-publication.js";

export type PublishFleetRelease = {
  releaseId: string;
  releaseTitle?: string;
  primaryArtistName?: string;
  libraryPresent: boolean;
  publicationState:
    | "not-published"
    | "up-to-date"
    | "update-available"
    | "published-only";
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
    libraryReleaseCount: number;
    notPublishedCount: number;
    currentCount: number;
    updateAvailableCount: number;
    publishedOnlyCount: number;
    publicCatalogCount: number;
    blockedCount: number;
    warningCount: number;
    needsPreparationCount: number;
  };
  artists: ArtistPublicationPlan;
  deployment: PublishedMediaDeploymentAudit;
};

export async function buildPublishFleetSummary(
  mediaRoot: string,
  publishRoot: string,
): Promise<PublishFleetSummary> {
  const generatedAt = new Date().toISOString();
  const [
    library,
    ffmpegCapabilities,
    publicMemberships,
  ] = await Promise.all([
    scanMediaLibrary(mediaRoot),
    detectFfmpegCapabilities(),
    listPublicCatalogMembership(publishRoot),
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
      libraryPresent: true,
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

  const libraryReleaseIds = new Set(
    library.releases.map((release) => release.id),
  );

  for (const membership of publicMemberships) {
    if (libraryReleaseIds.has(membership.releaseId)) {
      continue;
    }

    releases.push({
      releaseId: membership.releaseId,
      libraryPresent: false,
      ...(membership.title
        ? { releaseTitle: membership.title }
        : {}),
      ...(membership.primaryArtist
        ? {
            primaryArtistName:
              membership.primaryArtist,
          }
        : {}),
      publicationState: "published-only",
      planStatus: membership.releaseDirectoryExists
        ? "warning"
        : "blocked",
      blockerCount: membership.releaseDirectoryExists
        ? 0
        : 1,
      warningCount: membership.releaseDirectoryExists
        ? 1
        : 0,
      needsPreparation: false,
      playbackNeedsPreparation: false,
      audioStreamNeedsPreparation: false,
      videoStreamNeedsPreparation: false,
      waveformNeedsPreparation: false,
    });
  }

  releases.sort((left, right) =>
    left.releaseId.localeCompare(
      right.releaseId,
      undefined,
      { numeric: true },
    ),
  );

  const artists = await buildArtistPublicationPlan(
    mediaRoot,
    publishRoot,
    { ffmpegCapabilities },
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
      libraryReleaseCount: library.releases.length,
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
      publishedOnlyCount: releases.filter(
        (release) =>
          release.publicationState === "published-only",
      ).length,
      publicCatalogCount: publicMemberships.length,
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
    artists,
    deployment: await auditPublishedMediaDeployment(
      publishRoot,
      generatedAt,
    ),
  };
}
