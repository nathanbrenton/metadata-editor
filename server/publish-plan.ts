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
  buildWebStreamPlan,
  type WebStreamPlanSummary,
} from "./media-processing/web-stream.js";
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
  | "track-stream-manifest"
  | "track-stream-init"
  | "track-stream-segment"
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
    version: 2;
    catalogSchemaVersion: 1;
    mediaBaseUrl: "/media";
    trackResources: {
      stream: {
        hrefField: "stream.href";
        protocol: "hls";
        manifestRelativePath: "stream/index.m3u8";
        codec: "aac";
        bitrateKbps: number;
        segmentDurationSeconds: number;
        segmentType: "fmp4";
      };
      waveform: {
        hrefField: "waveform.href";
        filename: "waveform-peaks.json";
        schemaVersion: number;
      };
    };
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
  webStreams: WebStreamPlanSummary;
  waveforms: {
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
  "distribution masters and full-quality audio derivatives",
  "private playback MP3 and other monolithic listening derivatives",
  "private stream generation sidecars such as stream-info.json",
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

function isPublishManagedDerivativeReferenceIssue(
  issue: LibraryValidationIssue,
): boolean {
  if (issue.code !== "missing-or-unsafe-asset-reference") {
    return false;
  }

  return (
    issue.message.startsWith(
      'track.assets.audio_playback points to "audio-playback.mp3",',
    ) ||
    issue.message.startsWith(
      'track.assets.waveform_peaks points to "waveform-peaks.json",',
    )
  );
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
    `Public derivatives: ${plan.derivatives.currentCount} current, ${plan.derivatives.createCount} missing, ${plan.derivatives.replaceCount} stale, ${plan.derivatives.blockedCount} blocked`,
    `Web streams: ${plan.webStreams.currentCount}/${plan.webStreams.trackCount} current`,
    `Waveforms: ${plan.waveforms.currentCount}/${plan.waveforms.trackCount} current`,
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
  const webStreams = await buildWebStreamPlan(
    mediaRoot,
    derivatives,
    capabilities,
  );
  const waveformItems = derivatives.items.map(
    (item) => item.waveform,
  );
  const waveforms = {
    trackCount: waveformItems.length,
    currentCount: waveformItems.filter(
      (item) => item.action === "none",
    ).length,
    createCount: waveformItems.filter(
      (item) => item.action === "create",
    ).length,
    replaceCount: waveformItems.filter(
      (item) => item.action === "replace",
    ).length,
    blockedCount: waveformItems.filter(
      (item) => item.action === "blocked",
    ).length,
  };
  const publicDerivatives = {
    trackCount: derivatives.items.length,
    currentCount:
      webStreams.summary.currentCount + waveforms.currentCount,
    createCount:
      webStreams.summary.createCount + waveforms.createCount,
    replaceCount:
      webStreams.summary.replaceCount + waveforms.replaceCount,
    blockedCount:
      webStreams.summary.blockedCount + waveforms.blockedCount,
  };
  const validationIssues = [
    ...validationReport.issues,
    ...validationReport.releases.flatMap(
      (releaseResult) => releaseResult.issues,
    ),
  ].filter(
    (issue) => !isPublishManagedDerivativeReferenceIssue(issue),
  );
  const issues: PublishPlanIssue[] =
    validationIssues.map(issueFromValidation);
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
    const webStream = webStreams.items.find(
      (item) => item.trackId === trackPlan.trackId,
    );

    if (!webStream) {
      throw new Error(
        `Web-stream plan is missing track ${trackPlan.trackId}.`,
      );
    }

    if (
      webStream.status !== "current" ||
      webStream.action !== "none"
    ) {
      issues.push({
        code: "web-stream-not-current",
        severity: "blocked",
        relativePath: webStream.directoryRelativePath,
        message:
          `Web stream must be current before it can enter the hosted package. Current status: ${webStream.status}.`,
        suggestion:
          "Use Prepare release to generate the reviewed AAC-LC HLS derivative, then refresh preflight.",
      });
      items.push({
        kind: "track-stream-manifest",
        action: "blocked",
        sourceRelativePath: webStream.manifestRelativePath,
        destinationRelativePath: path.posix.join(
          trackDestination,
          "stream/index.m3u8",
        ),
        trackId: trackPlan.trackId,
        reason: webStream.reason,
      });
    } else {
      for (const streamFile of webStream.files) {
        const streamKind: PublishPlanItemKind =
          streamFile.kind === "manifest"
            ? "track-stream-manifest"
            : streamFile.kind === "initialization"
              ? "track-stream-init"
              : "track-stream-segment";
        const destinationRelativePath = path.posix.join(
          trackDestination,
          "stream",
          streamFile.filename,
        );

        items.push({
          kind: streamKind,
          action: await destinationExists(
            publishRoot,
            destinationRelativePath,
          )
            ? "replace"
            : "create",
          sourceRelativePath: streamFile.relativePath,
          destinationRelativePath,
          trackId: trackPlan.trackId,
          reason:
            streamFile.kind === "manifest"
              ? "Copy the portable HLS media playlist used as the track stream resource."
              : streamFile.kind === "initialization"
                ? "Copy the HLS fMP4 initialization segment referenced by the playlist."
                : "Copy one short AAC-LC HLS media segment referenced by the playlist.",
          sizeBytes: streamFile.sizeBytes,
        });
      }
    }

    const waveform = trackPlan.waveform;
    const waveformDestination = path.posix.join(
      trackDestination,
      waveform.filename,
    );

    if (
      waveform.status !== "current" ||
      waveform.action !== "none"
    ) {
      issues.push({
        code: "waveform-not-current",
        severity: "blocked",
        relativePath: waveform.relativePath,
        message:
          `Waveform data must be current before it can enter the hosted package. Current status: ${waveform.status}.`,
        suggestion:
          "Use Prepare release to generate waveform data from the canonical source, then refresh preflight.",
      });
      items.push({
        kind: "track-waveform",
        action: "blocked",
        sourceRelativePath: waveform.relativePath,
        destinationRelativePath: waveformDestination,
        trackId: trackPlan.trackId,
        reason: waveform.reason,
        ...(waveform.sizeBytes === undefined
          ? {}
          : { sizeBytes: waveform.sizeBytes }),
      });
    } else {
      const inspection = await inspectRegularFile(
        mediaRoot,
        waveform.relativePath,
      );

      if (!inspection.exists) {
        issues.push({
          code: "current-derivative-missing",
          severity: "blocked",
          relativePath: waveform.relativePath,
          message:
            "The waveform plan reported current media, but the source file is no longer present.",
          suggestion:
            "Refresh the Library scan and rebuild the publish plan.",
        });
      }

      items.push({
        kind: "track-waveform",
        action: await destinationExists(
          publishRoot,
          waveformDestination,
        )
          ? "replace"
          : "create",
        sourceRelativePath: waveform.relativePath,
        destinationRelativePath: waveformDestination,
        trackId: trackPlan.trackId,
        reason:
          "Copy precomputed waveform data independently of segmented stream loading.",
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
        "Generate sanitized player-facing track metadata with relative stream.href and waveform.href resources; omit private/editor-only records.",
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
        "Record stable track identities, relative HLS stream and waveform resources, public package hashes, generation profiles, and publish timestamp for validation and rollback.",
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
      version: 2,
      catalogSchemaVersion: 1,
      mediaBaseUrl: "/media",
      trackResources: {
        stream: {
          hrefField: "stream.href",
          protocol: "hls",
          manifestRelativePath: "stream/index.m3u8",
          codec: "aac",
          bitrateKbps: webStreams.profile.bitrateKbps,
          segmentDurationSeconds:
            webStreams.profile.segmentDurationSeconds,
          segmentType: "fmp4",
        },
        waveform: {
          hrefField: "waveform.href",
          filename: derivatives.profile.waveform.filename,
          schemaVersion:
            derivatives.profile.waveform.schemaVersion,
        },
      },
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
      status: validationIssues.some(
        (issue) => issue.severity === "blocked",
      )
        ? "blocked"
        : validationIssues.some(
            (issue) => issue.severity === "warning",
          )
          ? "warning"
          : "ok",
      warningCount: validationIssues.filter(
        (issue) => issue.severity === "warning",
      ).length,
      blockedCount: validationIssues.filter(
        (issue) => issue.severity === "blocked",
      ).length,
    },
    derivatives: publicDerivatives,
    webStreams: webStreams.summary,
    waveforms,
    summary,
  };

  return {
    ...planWithoutFingerprint,
    planFingerprint: hashPlan(planWithoutFingerprint),
  };
}
