import {
  canonicalMediaMasterFilename,
  classifyMediaMasterExtension,
  type CanonicalMediaMasterRole,
  type MediaMasterFormatClass,
} from "./media-file-spec.js";

export type MediaFileSpecAsset = {
  filename: string;
  extension: string;
};

export type MediaFileSpecSummaryCounts = {
  total: number;
  preferred: number;
  compatible: number;
  unsupported: number;
  nonCanonicalNames: number;
};

export type ReleaseMediaFileSpecInput = {
  artworkMasters: readonly MediaFileSpecAsset[];
  tracks: readonly {
    audioMasters: readonly MediaFileSpecAsset[];
    artworkMasters: readonly MediaFileSpecAsset[];
  }[];
  videos: readonly {
    videoMasters: readonly MediaFileSpecAsset[];
  }[];
};

export type MediaFileSpecReleaseSummary =
  MediaFileSpecSummaryCounts & {
    roles: Record<
      CanonicalMediaMasterRole,
      MediaFileSpecSummaryCounts
    >;
  };

export type MediaFileSpecPresentation = {
  status:
    | "preferred"
    | "compatible"
    | "review"
    | "outside-spec"
    | "empty";
  label: string;
  tone: "complete" | "preview" | "warning" | "missing";
  title: string;
};

function emptyCounts(): MediaFileSpecSummaryCounts {
  return {
    total: 0,
    preferred: 0,
    compatible: 0,
    unsupported: 0,
    nonCanonicalNames: 0,
  };
}

function addAsset(
  counts: MediaFileSpecSummaryCounts,
  role: CanonicalMediaMasterRole,
  asset: MediaFileSpecAsset,
): void {
  counts.total += 1;

  const formatClass = classifyMediaMasterExtension(
    role,
    asset.extension,
  );

  counts[formatClass] += 1;

  const canonicalFilename =
    canonicalMediaMasterFilename(
      role,
      asset.extension,
    );

  if (asset.filename !== canonicalFilename) {
    counts.nonCanonicalNames += 1;
  }
}

function combineCounts(
  target: MediaFileSpecSummaryCounts,
  source: MediaFileSpecSummaryCounts,
): void {
  target.total += source.total;
  target.preferred += source.preferred;
  target.compatible += source.compatible;
  target.unsupported += source.unsupported;
  target.nonCanonicalNames += source.nonCanonicalNames;
}

export function summarizeReleaseMediaFileSpec(
  release: ReleaseMediaFileSpecInput,
): MediaFileSpecReleaseSummary {
  const roles: MediaFileSpecReleaseSummary["roles"] = {
    "artwork-master": emptyCounts(),
    "audio-master": emptyCounts(),
    "video-master": emptyCounts(),
  };

  for (const asset of release.artworkMasters) {
    addAsset(roles["artwork-master"], "artwork-master", asset);
  }

  for (const track of release.tracks) {
    for (const asset of track.audioMasters) {
      addAsset(roles["audio-master"], "audio-master", asset);
    }

    for (const asset of track.artworkMasters) {
      addAsset(roles["artwork-master"], "artwork-master", asset);
    }
  }

  for (const video of release.videos) {
    for (const asset of video.videoMasters) {
      addAsset(roles["video-master"], "video-master", asset);
    }
  }

  const summary: MediaFileSpecReleaseSummary = {
    ...emptyCounts(),
    roles,
  };

  combineCounts(summary, roles["artwork-master"]);
  combineCounts(summary, roles["audio-master"]);
  combineCounts(summary, roles["video-master"]);

  return summary;
}

export function presentMediaFileSpecSummary(
  summary: MediaFileSpecSummaryCounts,
): MediaFileSpecPresentation {
  const details = [
    `${summary.total} master${summary.total === 1 ? "" : "s"}`,
    summary.preferred > 0
      ? `${summary.preferred} preferred`
      : "",
    summary.compatible > 0
      ? `${summary.compatible} compatible`
      : "",
    summary.unsupported > 0
      ? `${summary.unsupported} outside spec`
      : "",
    summary.nonCanonicalNames > 0
      ? `${summary.nonCanonicalNames} filename review`
      : "",
  ].filter(Boolean);

  if (summary.total === 0) {
    return {
      status: "empty",
      label: "No masters",
      tone: "warning",
      title: "No canonical media masters are visible in this release scan.",
    };
  }

  if (summary.unsupported > 0) {
    return {
      status: "outside-spec",
      label: "Outside spec",
      tone: "missing",
      title: details.join(" · "),
    };
  }

  if (summary.nonCanonicalNames > 0) {
    return {
      status: "review",
      label: "Name review",
      tone: "warning",
      title: details.join(" · "),
    };
  }

  if (summary.compatible > 0) {
    return {
      status: "compatible",
      label: "Compatible",
      tone: "preview",
      title: details.join(" · "),
    };
  }

  return {
    status: "preferred",
    label: "Preferred",
    tone: "complete",
    title: details.join(" · "),
  };
}

export function describeMediaFileSpecRoleCounts(
  role: CanonicalMediaMasterRole,
  counts: MediaFileSpecSummaryCounts,
): string {
  const label =
    role === "audio-master"
      ? "Audio"
      : role === "artwork-master"
        ? "Artwork"
        : "Video";

  return `${label}: ${counts.total} total · ${counts.preferred} preferred · ${counts.compatible} compatible · ${counts.unsupported} outside spec · ${counts.nonCanonicalNames} filename review`;
}
