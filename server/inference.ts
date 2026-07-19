import {
  inferTrackTitleMetadata,
} from "../shared/track-title.js";

import type {
  LibraryMetadataPreview,
  ReleaseMetadataPreview,
  ReleaseScanResult,
  TrackMetadataPreview,
  TrackScanResult,
} from "./types.js";

const releaseDirectoryPattern =
  /^(\d{4}-\d{2}-\d{2})_(.+)$/;

const trackDirectoryPattern =
  /^(.+?)_(\d+?)_(.+)$/;

function humanizeSlug(value: string): string {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) =>
      character.toUpperCase(),
    );
}

function inferReleasePreview(
  release: ReleaseScanResult,
): ReleaseMetadataPreview {
  const preview: ReleaseMetadataPreview = {
    releaseId: {
      value: release.id,
      source: "release directory name",
    },
  };

  const directoryMatch =
    releaseDirectoryPattern.exec(release.id);

  if (directoryMatch) {
    const [, releaseDate, titleSlug] =
      directoryMatch;

    if (releaseDate) {
      preview.releaseDate = {
        value: releaseDate,
        source: "release directory date prefix",
      };
    }

    if (titleSlug) {
      preview.releaseTitle = {
        value: humanizeSlug(titleSlug),
        source: "release directory title slug",
      };
    }
  }

  if (release.artworkMasters.length === 1) {
    const artworkMaster =
      release.artworkMasters[0];

    if (artworkMaster) {
      preview.artworkMasterPath = {
        value: artworkMaster.relativePath,
        source: "single detected release artwork master",
      };
    }
  }

  return preview;
}

function inferTrackPreview(
  track: TrackScanResult,
  releaseTitle = "",
): TrackMetadataPreview {
  const preview: TrackMetadataPreview = {
    trackId: {
      value: track.id,
      source: "track directory name",
    },
  };

  const directoryMatch =
    trackDirectoryPattern.exec(track.id);

  if (directoryMatch) {
    const [
      ,
      artistSlug,
      trackNumberText,
      titleSlug,
    ] = directoryMatch;

    if (artistSlug) {
      preview.artistName = {
        value: humanizeSlug(artistSlug),
        source: "track directory artist segment",
      };
    }

    if (trackNumberText) {
      const trackNumber = Number.parseInt(
        trackNumberText,
        10,
      );

      if (Number.isSafeInteger(trackNumber)) {
        preview.trackNumber = {
          value: trackNumber,
          source: "track directory number segment",
        };
      }
    }

    if (titleSlug) {
      const inferredTitle =
        inferTrackTitleMetadata(
          humanizeSlug(titleSlug),
          releaseTitle,
        );

      preview.trackTitle = {
        value: inferredTitle.title,
        source: "track directory title segment",
      };
      preview.trackDisplayTitle = {
        value: inferredTitle.displayTitle,
        source:
          "inferred track title and version",
      };

      if (inferredTitle.version) {
        preview.trackVersion = {
          value: inferredTitle.version,
          source:
            "recognized track-version suffix",
        };
      }
    }
  }

  if (track.audioMasters.length === 1) {
    const audioMaster = track.audioMasters[0];

    if (audioMaster) {
      preview.audioMasterPath = {
        value: audioMaster.relativePath,
        source: "single detected audio master",
      };
    }
  }

  if (track.artworkMasters.length === 1) {
    const artworkMaster =
      track.artworkMasters[0];

    if (artworkMaster) {
      preview.artworkMasterPath = {
        value: artworkMaster.relativePath,
        source: "single detected track artwork master",
      };
    }
  }

  return preview;
}

export function buildMetadataPreview(
  release: ReleaseScanResult,
): LibraryMetadataPreview {
  const warnings: string[] = [];

  if (release.artworkMasters.length > 1) {
    warnings.push(
      "Release artwork path was not inferred because multiple artwork masters were detected.",
    );
  }

  for (const track of release.tracks) {
    if (track.audioMasters.length === 0) {
      warnings.push(
        `${track.id}: audio master path was not inferred because no audio master was detected.`,
      );
    }

    if (track.audioMasters.length > 1) {
      warnings.push(
        `${track.id}: audio master path was not inferred because multiple audio masters were detected.`,
      );
    }

    if (track.artworkMasters.length > 1) {
      warnings.push(
        `${track.id}: artwork path was not inferred because multiple artwork masters were detected.`,
      );
    }
  }

  const releasePreview =
    inferReleasePreview(release);
  const inferredReleaseTitle =
    releasePreview.releaseTitle?.value ?? "";

  return {
    release: releasePreview,
    tracks: release.tracks.map(
      (track) =>
        inferTrackPreview(
          track,
          inferredReleaseTitle,
        ),
    ),
    warnings,
  };
}
