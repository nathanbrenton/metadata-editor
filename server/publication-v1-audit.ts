import {
  lstat,
  readdir,
} from "node:fs/promises";
import path from "node:path";

import {
  buildPublishFleetSummary,
  type PublishFleetSummary,
} from "./publish-fleet.js";
import {
  isIgnoredPublicationJunk,
} from "./publication-junk.js";

export type PublicationV1Category =
  | "audio-hls"
  | "waveforms"
  | "video"
  | "artwork-images"
  | "metadata"
  | "other";

export type PublicationV1File = {
  path: string;
  bytes: number;
};

export type PublicationV1CategorySummary = {
  category: PublicationV1Category;
  fileCount: number;
  bytes: number;
};

export type PublicationV1Issue = {
  code: string;
  severity: "warning" | "blocked";
  message: string;
};

export type PublicationV1Audit = {
  schema: {
    name: "metadata-editor-publication-v1-audit";
    version: 1;
  };
  generatedAt: string;
  publishRoot: string;
  status: "ready" | "warning" | "blocked";
  issues: PublicationV1Issue[];
  categories: PublicationV1CategorySummary[];
  summary: {
    fileCount: number;
    totalBytes: number;
    publicReleaseCount: number;
    publicTrackCount: number;
    compactWaveformCount: number;
    legacyJsonWaveformCount: number;
    publicVideoFileCount: number;
    junkEntryCount: number;
    updateAvailableCount: number;
    publishedOnlyCount: number;
    deploymentManifestCurrent: boolean;
    contractVersions: number[];
  };
};

function normalizedPath(value: string): string {
  return value.replaceAll("\\", "/");
}

export function classifyPublicationV1File(
  relativePath: string,
): PublicationV1Category {
  const normalized = normalizedPath(relativePath);
  const lower = normalized.toLowerCase();
  const basename = path.posix.basename(lower);

  if (
    lower.includes("/videos/") ||
    lower.startsWith("videos/")
  ) {
    return "video";
  }

  if (
    basename === "waveform-peaks.wfp" ||
    basename === "waveform-peaks.json"
  ) {
    return "waveforms";
  }

  if (
    /(^|\/)releases\/[^/]+\/tracks\/[^/]+\/stream\//.test(
      lower,
    )
  ) {
    return "audio-hls";
  }

  if (/\.(png|jpe?g|webp|avif|gif)$/i.test(lower)) {
    return "artwork-images";
  }

  if (
    lower.endsWith(".json") ||
    lower.endsWith(".m3u8")
  ) {
    return "metadata";
  }

  return "other";
}

export function summarizePublicationV1Files(
  files: readonly PublicationV1File[],
): PublicationV1CategorySummary[] {
  const order: PublicationV1Category[] = [
    "video",
    "waveforms",
    "audio-hls",
    "artwork-images",
    "metadata",
    "other",
  ];
  const totals = new Map<
    PublicationV1Category,
    { fileCount: number; bytes: number }
  >();

  for (const category of order) {
    totals.set(category, {
      fileCount: 0,
      bytes: 0,
    });
  }

  for (const file of files) {
    const category = classifyPublicationV1File(file.path);
    const current = totals.get(category)!;
    current.fileCount += 1;
    current.bytes += file.bytes;
  }

  return order.map((category) => ({
    category,
    ...totals.get(category)!,
  }));
}

async function walkPublicationFiles(
  publishRoot: string,
): Promise<{
  files: PublicationV1File[];
  junkEntryCount: number;
}> {
  const root = path.resolve(publishRoot);
  const files: PublicationV1File[] = [];
  let junkEntryCount = 0;

  const walk = async (
    directoryPath: string,
    relativeDirectory: string,
  ): Promise<void> => {
    const entries = await readdir(directoryPath, {
      withFileTypes: true,
    });

    for (const entry of entries) {
      const relativePath = relativeDirectory
        ? path.posix.join(relativeDirectory, entry.name)
        : entry.name;
      const absolutePath = path.join(directoryPath, entry.name);

      if (isIgnoredPublicationJunk(relativePath)) {
        junkEntryCount += 1;
        continue;
      }

      if (entry.isSymbolicLink()) {
        continue;
      }

      if (entry.isDirectory()) {
        await walk(absolutePath, relativePath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const stats = await lstat(absolutePath);
      if (stats.isSymbolicLink() || !stats.isFile()) {
        continue;
      }

      files.push({
        path: relativePath,
        bytes: stats.size,
      });
    }
  };

  try {
    const rootStats = await lstat(root);
    if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) {
      return { files, junkEntryCount };
    }
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return { files, junkEntryCount };
    }
    throw error;
  }

  await walk(root, "");
  files.sort((left, right) =>
    left.path.localeCompare(right.path),
  );
  return { files, junkEntryCount };
}

function publicFleetReleases(
  fleet: PublishFleetSummary,
): PublishFleetSummary["releases"] {
  return fleet.releases.filter(
    (release) =>
      release.publicationState !== "not-published",
  );
}

export async function auditPublicationV1Package(
  mediaRoot: string,
  publishRoot: string,
): Promise<PublicationV1Audit> {
  const generatedAt = new Date().toISOString();
  const [fleet, physical] = await Promise.all([
    buildPublishFleetSummary(mediaRoot, publishRoot),
    walkPublicationFiles(publishRoot),
  ]);
  const publicReleases = publicFleetReleases(fleet);
  const categories = summarizePublicationV1Files(
    physical.files,
  );
  const totalBytes = physical.files.reduce(
    (total, file) => total + file.bytes,
    0,
  );
  const compactWaveformCount = physical.files.filter(
    (file) =>
      path.posix.basename(
        normalizedPath(file.path).toLowerCase(),
      ) === "waveform-peaks.wfp",
  ).length;
  const legacyJsonWaveformCount = physical.files.filter(
    (file) =>
      path.posix.basename(
        normalizedPath(file.path).toLowerCase(),
      ) === "waveform-peaks.json",
  ).length;
  const publicVideoFileCount = physical.files.filter(
    (file) =>
      classifyPublicationV1File(file.path) === "video",
  ).length;
  const updateAvailableCount = publicReleases.filter(
    (release) =>
      release.publicationState === "update-available",
  ).length;
  const publishedOnlyCount = publicReleases.filter(
    (release) =>
      release.publicationState === "published-only",
  ).length;
  const publicTrackCount = publicReleases.reduce(
    (total, release) =>
      total +
      (release.publicSelection?.publicTrackCount ?? 0),
    0,
  );
  const contractVersions = Array.from(
    new Set(
      fleet.deployment.releases
        .map((release) => release.contractVersion)
        .filter(
          (version): version is number =>
            typeof version === "number",
        ),
    ),
  ).sort((left, right) => left - right);
  const issues: PublicationV1Issue[] = [];

  if (fleet.deployment.summary.blockedCount > 0) {
    issues.push({
      code: "deployment-integrity-blocked",
      severity: "blocked",
      message:
        `${fleet.deployment.summary.blockedCount} published-media deployment integrity blocker(s) remain.`,
    });
  }

  if (!fleet.deployment.deploymentManifest.current) {
    issues.push({
      code: "deployment-manifest-not-current",
      severity: "blocked",
      message:
        "deployment-manifest.json is missing or stale; refresh it after Web Package convergence.",
    });
  }

  if (updateAvailableCount > 0) {
    issues.push({
      code: "public-release-update-available",
      severity: "blocked",
      message:
        `${updateAvailableCount} public release(s) still differ from current Library publication settings/content.`,
    });
  }

  if (publishedOnlyCount > 0) {
    issues.push({
      code: "published-only-release",
      severity: "blocked",
      message:
        `${publishedOnlyCount} public release(s) no longer have a canonical Library release and require review.`,
    });
  }

  const blockedPublicPlans = publicReleases.filter(
    (release) => release.planStatus === "blocked",
  ).length;
  if (blockedPublicPlans > 0) {
    issues.push({
      code: "public-release-plan-blocked",
      severity: "blocked",
      message:
        `${blockedPublicPlans} public release plan(s) are blocked and cannot converge yet.`,
    });
  }

  const enabledPublicVideoReleases = publicReleases.filter(
    (release) => release.publicSelection?.includeVideo === true,
  ).length;
  if (enabledPublicVideoReleases > 0) {
    issues.push({
      code: "video-publication-enabled",
      severity: "blocked",
      message:
        `${enabledPublicVideoReleases} public release(s) have video publication enabled; Hiplingo v1.0.0 is audio-only.`,
    });
  }

  if (publicVideoFileCount > 0) {
    issues.push({
      code: "public-video-files-present",
      severity: "blocked",
      message:
        `${publicVideoFileCount} public video file(s) remain in published-media. Rebuild the affected Web Package release(s) with video publication off.`,
    });
  }

  if (legacyJsonWaveformCount > 0) {
    issues.push({
      code: "legacy-waveform-json-present",
      severity: "blocked",
      message:
        `${legacyJsonWaveformCount} legacy waveform-peaks.json file(s) remain in published-media. Rebuild the affected release(s) under contract v6.`,
    });
  }

  if (
    publishedOnlyCount === 0 &&
    publicTrackCount > 0 &&
    compactWaveformCount !== publicTrackCount
  ) {
    issues.push({
      code: "compact-waveform-count-mismatch",
      severity: "blocked",
      message:
        `Public selection expects ${publicTrackCount} track waveform(s), but published-media contains ${compactWaveformCount} waveform-peaks.wfp file(s).`,
    });
  }

  const oldContractVersions = contractVersions.filter(
    (version) => version !== 6,
  );
  if (oldContractVersions.length > 0) {
    issues.push({
      code: "legacy-public-package-contract",
      severity: "blocked",
      message:
        `Published releases still use public package contract version(s) ${oldContractVersions.join(", ")}; v1.0.0 requires contract v6.`,
    });
  }

  if (physical.junkEntryCount > 0) {
    issues.push({
      code: "publication-junk-present",
      severity: "blocked",
      message:
        `${physical.junkEntryCount} ignored OS/editor junk entr${physical.junkEntryCount === 1 ? "y is" : "ies are"} physically present in published-media. Refresh the deployment manifest to prune them.`,
    });
  }

  const blockedCount = issues.filter(
    (issue) => issue.severity === "blocked",
  ).length;
  const warningCount = issues.length - blockedCount;

  return {
    schema: {
      name: "metadata-editor-publication-v1-audit",
      version: 1,
    },
    generatedAt,
    publishRoot: path.resolve(publishRoot),
    status:
      blockedCount > 0
        ? "blocked"
        : warningCount > 0
          ? "warning"
          : "ready",
    issues,
    categories,
    summary: {
      fileCount: physical.files.length,
      totalBytes,
      publicReleaseCount: publicReleases.length,
      publicTrackCount,
      compactWaveformCount,
      legacyJsonWaveformCount,
      publicVideoFileCount,
      junkEntryCount: physical.junkEntryCount,
      updateAvailableCount,
      publishedOnlyCount,
      deploymentManifestCurrent:
        fleet.deployment.deploymentManifest.current,
      contractVersions,
    },
  };
}
