import {
  createHash,
} from "node:crypto";
import {
  lstat,
} from "node:fs/promises";
import path from "node:path";

import {
  detectFfmpegCapabilities,
} from "./ffmpeg-capabilities.js";
import {
  validateMediaLibrary,
  type LibraryValidationIssue,
} from "./library-validator.js";
import {
  assertPathWithinRoot,
  toLibraryRelativePath,
} from "./media-root.js";
import {
  buildMediaProcessingPlan,
} from "./media-processing/plan.js";
import {
  scanReleaseById,
} from "./scanner.js";
import type {
  DiscoveredAsset,
  FfmpegCapabilities,
} from "./types.js";
import {
  selectPreferredArtworkCandidate,
} from "../shared/artwork-preference.js";

export type PublishPlanStatus =
  | "ready"
  | "warning"
  | "blocked";

export type PublishPlanAction =
  | "create"
  | "replace"
  | "generate"
  | "update"
  | "blocked";

export type PublishPlanItemKind =
  | "catalog"
  | "publication-manifest"
  | "release-metadata"
  | "track-metadata"
  | "release-artwork"
  | "track-playback"
  | "track-waveform";

export type PublishPlanIssue = {
  code: string;
  severity: "warning" | "blocked";
  relativePath: string;
  message: string;
  suggestion?: string;
};

export type PublishPlanItem = {
  kind: PublishPlanItemKind;
  action: PublishPlanAction;
  destinationRelativePath: string;
  reason: string;
  sourceRelativePath?: string;
  trackId?: string;
  sizeBytes?: number;
};

export type PublishPlan = {
  schema: {
    name: "metadata-editor-publish-plan";
    version: 1;
  };
  contract: {
    name: "audio-player-public-package";
    version: 1;
    catalogSchemaVersion: 1;
    mediaBaseUrl: "/media";
    privateContentExcluded: readonly string[];
  };
  releaseId: string;
  generatedAt: string;
  readOnly: true;
  writesEnabled: false;
  sourceRoot: string;
  destinationRoot: string;
  destinationReleaseRelativePath: string;
  planFingerprint: string;
  status: PublishPlanStatus;
  issues: PublishPlanIssue[];
  items: PublishPlanItem[];
  validation: {
    status: "ok" | "warning" | "blocked";
    warningCount: number;
    blockedCount: number;
  };
  derivatives: {
    trackCount: number;
    currentCount: number;
    createCount: number;
    replaceCount: number;
    blockedCount: number;
  };
  summary: {
    itemCount: number;
    createCount: number;
    replaceCount: number;
    generateCount: number;
    updateCount: number;
    blockedCount: number;
  };
};

export type BuildPublishPlanOptions = {
  generatedAt?: string;
  ffmpegCapabilities?: FfmpegCapabilities;
};

const browserArtworkExtensions = new Set([
  ".avif",
  ".gif",
  ".jpeg",
  ".jpg",
  ".png",
  ".webp",
]);

const privateContentExcluded = [
  "audio masters",
  "archival TIFF artwork masters",
  "TOML source documents",
  "ingest receipts",
  "operation manifests and backups",
  "production notes and editor-only administration",
  "sample-clearance records marked editor-only",
] as const;

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

async function inspectRegularFile(
  root: string,
  relativePath: string,
): Promise<{ exists: boolean; sizeBytes?: number }> {
  const absolutePath = assertPathWithinRoot(
    root,
    path.resolve(
      root,
      ...relativePath
        .replaceAll("\\", "/")
        .split("/")
        .filter(Boolean),
    ),
  );

  try {
    const stats = await lstat(absolutePath);

    if (stats.isSymbolicLink() || !stats.isFile()) {
      throw new Error(
        `Publish source is not a regular non-symbolic file: ${relativePath}`,
      );
    }

    return {
      exists: true,
      sizeBytes: stats.size,
    };
  } catch (error) {
    if (isMissingFileError(error)) {
      return { exists: false };
    }

    throw error;
  }
}

async function destinationExists(
  publishRoot: string,
  relativePath: string,
): Promise<boolean> {
  const absolutePath = path.resolve(
    publishRoot,
    ...relativePath
      .replaceAll("\\", "/")
      .split("/")
      .filter(Boolean),
  );
  const relative = path.relative(
    path.resolve(publishRoot),
    absolutePath,
  );

  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(
      `Publish destination escapes configured output root: ${absolutePath}`,
    );
  }

  try {
    const stats = await lstat(absolutePath);

    if (stats.isSymbolicLink()) {
      throw new Error(
        `Publish destination is a symbolic link: ${relativePath}`,
      );
    }

    return true;
  } catch (error) {
    if (isMissingFileError(error)) {
      return false;
    }

    throw error;
  }
}

function issueFromValidation(
  validationIssue: LibraryValidationIssue,
): PublishPlanIssue {
  return {
    code: `library-${validationIssue.code}`,
    severity: validationIssue.severity,
    relativePath: validationIssue.relativePath,
    message: validationIssue.message,
    ...(validationIssue.suggestion
      ? { suggestion: validationIssue.suggestion }
      : {}),
  };
}

function preferredBrowserArtwork(
  candidates: readonly DiscoveredAsset[],
): DiscoveredAsset | null {
  return selectPreferredArtworkCandidate(
    candidates.filter((candidate) =>
      browserArtworkExtensions.has(
        candidate.extension.toLowerCase(),
      ),
    ),
  );
}


async function discoverBrowserArtwork(
  mediaRoot: string,
  releaseRelativePath: string,
  masterCandidates: readonly DiscoveredAsset[],
): Promise<DiscoveredAsset | null> {
  const standardDerivativeFilenames = [
    "artwork.webp",
    "artwork.avif",
    "artwork.png",
    "artwork.jpg",
    "artwork.jpeg",
    "artwork.gif",
  ];

  for (const filename of standardDerivativeFilenames) {
    const relativePath = path.posix.join(
      releaseRelativePath,
      "artwork/front",
      filename,
    );
    const inspection = await inspectRegularFile(
      mediaRoot,
      relativePath,
    );

    if (inspection.exists) {
      return {
        filename,
        relativePath,
        extension: path.extname(filename).toLowerCase(),
      };
    }
  }

  return preferredBrowserArtwork(masterCandidates);
}

function publicArtworkFilename(
  artwork: DiscoveredAsset,
): string {
  const extension = artwork.extension.toLowerCase();

  return `artwork${extension === ".jpeg" ? ".jpg" : extension}`;
}

function planStatus(
  issues: readonly PublishPlanIssue[],
): PublishPlanStatus {
  if (issues.some((item) => item.severity === "blocked")) {
    return "blocked";
  }

  if (issues.some((item) => item.severity === "warning")) {
    return "warning";
  }

  return "ready";
}

function hashPlan(
  value: Omit<PublishPlan, "planFingerprint">,
): string {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

function formatPublishPlanItem(
  item: PublishPlanItem,
): string {
  const source = item.sourceRelativePath
    ? ` <- ${item.sourceRelativePath}`
    : "";

  return `  ${item.action.toUpperCase().padEnd(8)} ${item.destinationRelativePath}${source}\n` +
    `           ${item.reason}\n`;
}

export function formatPublishPlan(
  plan: PublishPlan,
): string {
  const lines = [
    `Publish preflight: ${plan.status.toUpperCase()}`,
    `Release: ${plan.releaseId}`,
    `Private source: ${plan.sourceRoot}`,
    `Public output: ${plan.destinationRoot}`,
    `Read-only: yes`,
    `Writes enabled: no`,
    `Validation: ${plan.validation.blockedCount} blocked, ${plan.validation.warningCount} warnings`,
    `Derivatives: ${plan.derivatives.currentCount} current, ${plan.derivatives.createCount} missing, ${plan.derivatives.replaceCount} stale, ${plan.derivatives.blockedCount} blocked`,
    "",
  ];

  if (plan.issues.length > 0) {
    lines.push("Issues:");

    for (const item of plan.issues) {
      lines.push(
        `  ${item.severity.toUpperCase().padEnd(7)} ${item.code} · ${item.relativePath}`,
        `          ${item.message}`,
      );

      if (item.suggestion) {
        lines.push(`          Suggested: ${item.suggestion}`);
      }
    }

    lines.push("");
  }

  lines.push("Planned public package:");

  for (const item of plan.items) {
    lines.push(formatPublishPlanItem(item).trimEnd());
  }

  lines.push(
    "",
    `Summary: ${plan.summary.itemCount} items · ${plan.summary.blockedCount} blocked`,
    `Plan fingerprint: ${plan.planFingerprint}`,
  );

  return `${lines.join("\n")}\n`;
}

export async function buildPublishPlan(
  mediaRoot: string,
  publishRoot: string,
  releaseId: string,
  options: BuildPublishPlanOptions = {},
): Promise<PublishPlan> {
  const generatedAt =
    options.generatedAt ?? new Date().toISOString();
  const release = await scanReleaseById(
    mediaRoot,
    releaseId,
  );

  if (!release) {
    throw new Error(`Release not found: ${releaseId}`);
  }

  const capabilities =
    options.ffmpegCapabilities ??
    await detectFfmpegCapabilities();
  const validationReport = await validateMediaLibrary(
    mediaRoot,
    {
      releaseId,
      generatedAt,
      ffmpegCapabilities: capabilities,
    },
  );
  const derivatives = await buildMediaProcessingPlan(
    mediaRoot,
    release,
    capabilities,
    { generatedAt },
  );
  const issues: PublishPlanIssue[] = [
    ...validationReport.issues.map(issueFromValidation),
    ...validationReport.releases.flatMap((releaseResult) =>
      releaseResult.issues.map(issueFromValidation),
    ),
  ];
  const items: PublishPlanItem[] = [];
  const destinationReleaseRelativePath =
    path.posix.join("releases", releaseId);
  const releaseDestinationExists = await destinationExists(
    publishRoot,
    destinationReleaseRelativePath,
  );

  if (releaseDestinationExists) {
    issues.push({
      code: "existing-public-release",
      severity: "warning",
      relativePath: destinationReleaseRelativePath,
      message:
        "A public release with this ID already exists. A future write-enabled operation must build a complete replacement and atomically promote it rather than merging files in place.",
      suggestion:
        "Review this plan as a republish operation and retain the current public release for rollback.",
    });
  }

  const artwork = await discoverBrowserArtwork(
    mediaRoot,
    release.relativePath,
    release.artworkMasters,
  );

  if (!artwork) {
    issues.push({
      code: "browser-artwork-required",
      severity: "blocked",
      relativePath: release.relativePath,
      message:
        "Publish requires one browser-compatible release artwork source. TIFF/TIF remains an archival master and must first produce a current PNG, WebP, AVIF, JPEG, or GIF derivative.",
      suggestion:
        "Generate and review a browser artwork derivative under Library → Files & Sources before publishing.",
    });
    items.push({
      kind: "release-artwork",
      action: "blocked",
      destinationRelativePath: path.posix.join(
        destinationReleaseRelativePath,
        "artwork/front/artwork.webp",
      ),
      reason:
        "No browser-compatible release artwork source is available.",
    });
  } else {
    const inspection = await inspectRegularFile(
      mediaRoot,
      artwork.relativePath,
    );
    const destinationRelativePath = path.posix.join(
      destinationReleaseRelativePath,
      "artwork/front",
      publicArtworkFilename(artwork),
    );

    items.push({
      kind: "release-artwork",
      action: await destinationExists(
        publishRoot,
        destinationRelativePath,
      )
        ? "replace"
        : "create",
      sourceRelativePath: artwork.relativePath,
      destinationRelativePath,
      reason:
        "Copy the selected browser-compatible front artwork; do not expose archival-only masters.",
      ...(inspection.sizeBytes === undefined
        ? {}
        : { sizeBytes: inspection.sizeBytes }),
    });
  }

  for (const trackPlan of derivatives.items) {
    const trackDestination = path.posix.join(
      destinationReleaseRelativePath,
      "tracks",
      trackPlan.trackId,
    );

    for (const derivative of [
      trackPlan.playback,
      trackPlan.waveform,
    ]) {
      const isPlayback = derivative.kind === "playback-mp3";
      const destinationRelativePath = path.posix.join(
        trackDestination,
        derivative.filename,
      );
      const kind: PublishPlanItemKind = isPlayback
        ? "track-playback"
        : "track-waveform";

      if (
        derivative.status !== "current" ||
        derivative.action !== "none"
      ) {
        issues.push({
          code: isPlayback
            ? "playback-not-current"
            : "waveform-not-current",
          severity: "blocked",
          relativePath: derivative.relativePath,
          message:
            `${isPlayback ? "Playback audio" : "Waveform data"} must be current before it can enter the public package. Current status: ${derivative.status}.`,
          suggestion:
            "Prepare the derivative in Library, refresh preflight, and publish only after the status is current.",
        });
        items.push({
          kind,
          action: "blocked",
          sourceRelativePath: derivative.relativePath,
          destinationRelativePath,
          trackId: trackPlan.trackId,
          reason: derivative.reason,
          ...(derivative.sizeBytes === undefined
            ? {}
            : { sizeBytes: derivative.sizeBytes }),
        });
        continue;
      }

      const inspection = await inspectRegularFile(
        mediaRoot,
        derivative.relativePath,
      );

      if (!inspection.exists) {
        issues.push({
          code: "current-derivative-missing",
          severity: "blocked",
          relativePath: derivative.relativePath,
          message:
            "The derivative plan reported current media, but the source file is no longer present.",
          suggestion: "Refresh the Library scan and rebuild the publish plan.",
        });
      }

      items.push({
        kind,
        action: await destinationExists(
          publishRoot,
          destinationRelativePath,
        )
          ? "replace"
          : "create",
        sourceRelativePath: derivative.relativePath,
        destinationRelativePath,
        trackId: trackPlan.trackId,
        reason:
          isPlayback
            ? "Copy the current playback MP3 used by audio-player."
            : "Copy the current waveform JSON used by audio-player.",
        ...(inspection.sizeBytes === undefined
          ? {}
          : { sizeBytes: inspection.sizeBytes }),
      });
    }

    items.push({
      kind: "track-metadata",
      action: "generate",
      destinationRelativePath: path.posix.join(
        trackDestination,
        "track.json",
      ),
      trackId: trackPlan.trackId,
      reason:
        "Generate sanitized player-facing track metadata from approved release and track TOML fields; omit private/editor-only records.",
    });
  }

  items.push(
    {
      kind: "release-metadata",
      action: "generate",
      destinationRelativePath: path.posix.join(
        destinationReleaseRelativePath,
        "release.json",
      ),
      reason:
        "Generate sanitized player-facing release metadata from approved TOML fields.",
    },
    {
      kind: "publication-manifest",
      action: "generate",
      destinationRelativePath: path.posix.join(
        destinationReleaseRelativePath,
        "publication-manifest.json",
      ),
      reason:
        "Record public package hashes, source release identity, generation profile, and publish timestamp for validation and rollback.",
    },
    {
      kind: "catalog",
      action: "update",
      destinationRelativePath: "catalog.json",
      reason:
        "Regenerate the audio-player catalog only after the complete release package is validated and atomically promoted.",
    },
  );

  const summary = {
    itemCount: items.length,
    createCount: items.filter((item) => item.action === "create").length,
    replaceCount: items.filter((item) => item.action === "replace").length,
    generateCount: items.filter((item) => item.action === "generate").length,
    updateCount: items.filter((item) => item.action === "update").length,
    blockedCount: items.filter((item) => item.action === "blocked").length,
  };
  const planWithoutFingerprint: Omit<PublishPlan, "planFingerprint"> = {
    schema: {
      name: "metadata-editor-publish-plan",
      version: 1,
    },
    contract: {
      name: "audio-player-public-package",
      version: 1,
      catalogSchemaVersion: 1,
      mediaBaseUrl: "/media",
      privateContentExcluded,
    },
    releaseId,
    generatedAt,
    readOnly: true,
    writesEnabled: false,
    sourceRoot: mediaRoot,
    destinationRoot: publishRoot,
    destinationReleaseRelativePath,
    status: planStatus(issues),
    issues,
    items,
    validation: {
      status: validationReport.status,
      warningCount: validationReport.summary.warningCount,
      blockedCount: validationReport.summary.blockedCount,
    },
    derivatives: derivatives.summary,
    summary,
  };

  return {
    ...planWithoutFingerprint,
    planFingerprint: hashPlan(planWithoutFingerprint),
  };
}
