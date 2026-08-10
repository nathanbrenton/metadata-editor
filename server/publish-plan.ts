import {
  createHash,
} from "node:crypto";
import {
  lstat,
  readFile,
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
  browserArtworkAssetFromPlan,
  buildBrowserArtworkPlan,
} from "./media-processing/browser-artwork.js";
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
  | "track-artwork"
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
  sourceSha256?: string;
};

export type PublishMetadataInput = {
  relativePath: string;
  sha256: string;
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
  destinationReleaseExists: boolean;
  publication: {
    state: "not-published" | "up-to-date" | "update-available";
    currentContentFingerprint: string;
    publishedContentFingerprint?: string;
    publishedAt?: string;
  };
  planFingerprint: string;
  status: PublishPlanStatus;
  issues: PublishPlanIssue[];
  metadataInputs: PublishMetadataInput[];
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
  libraryPlayback: {
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
  "private browser-artwork generation sidecars such as artwork-info.json",
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
): Promise<{
  exists: boolean;
  sizeBytes?: number;
  sha256?: string;
}> {
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

    const content = await readFile(absolutePath);

    return {
      exists: true,
      sizeBytes: stats.size,
      sha256: createHash("sha256")
        .update(content)
        .digest("hex"),
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

function isPrivatePlaybackDerivativeIssue(
  issue: LibraryValidationIssue,
): boolean {
  return issue.code.startsWith(
    "derivative-playback-mp3-",
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
  assetRelativePath: string,
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
      assetRelativePath,
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

function hashPublicationContent(
  releaseId: string,
  contract: PublishPlan["contract"],
  metadataInputs: readonly PublishMetadataInput[],
  items: readonly PublishPlanItem[],
): string {
  const resources = items
    .filter(
      (item) =>
        item.kind !== "catalog" &&
        item.kind !== "publication-manifest" &&
        item.action !== "blocked",
    )
    .map((item) => ({
      kind: item.kind,
      destinationRelativePath: item.destinationRelativePath,
      ...(item.trackId ? { trackId: item.trackId } : {}),
      ...(item.sourceSha256
        ? { sourceSha256: item.sourceSha256 }
        : {}),
    }))
    .sort((left, right) =>
      left.destinationRelativePath.localeCompare(
        right.destinationRelativePath,
      ),
    );

  return createHash("sha256")
    .update(
      JSON.stringify({
        schema: {
          name: "metadata-editor-publication-content",
          version: 1,
        },
        releaseId,
        contract,
        metadataInputs,
        resources,
      }),
    )
    .digest("hex");
}

async function inspectPublicationState(
  publishRoot: string,
  destinationReleaseRelativePath: string,
  destinationReleaseExists: boolean,
  currentContentFingerprint: string,
): Promise<PublishPlan["publication"]> {
  if (!destinationReleaseExists) {
    return {
      state: "not-published",
      currentContentFingerprint,
    };
  }

  const manifestRelativePath = path.posix.join(
    destinationReleaseRelativePath,
    "publication-manifest.json",
  );
  const manifestPath = assertPathWithinRoot(
    publishRoot,
    path.resolve(
      publishRoot,
      ...manifestRelativePath.split("/"),
    ),
  );

  try {
    const stats = await lstat(manifestPath);

    if (stats.isSymbolicLink() || !stats.isFile()) {
      return {
        state: "update-available",
        currentContentFingerprint,
      };
    }

    const parsed = JSON.parse(
      await readFile(manifestPath, "utf8"),
    ) as unknown;

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return {
        state: "update-available",
        currentContentFingerprint,
      };
    }

    const manifest = parsed as Record<string, unknown>;
    const publishedContentFingerprint =
      typeof manifest.sourceContentFingerprint === "string"
        ? manifest.sourceContentFingerprint
        : undefined;
    const publishedAt =
      typeof manifest.publishedAt === "string"
        ? manifest.publishedAt
        : undefined;

    return {
      state:
        publishedContentFingerprint === currentContentFingerprint
          ? "up-to-date"
          : "update-available",
      currentContentFingerprint,
      ...(publishedContentFingerprint
        ? { publishedContentFingerprint }
        : {}),
      ...(publishedAt ? { publishedAt } : {}),
    };
  } catch (error) {
    if (isMissingFileError(error)) {
      return {
        state: "update-available",
        currentContentFingerprint,
      };
    }

    if (error instanceof SyntaxError) {
      return {
        state: "update-available",
        currentContentFingerprint,
      };
    }

    throw error;
  }
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
    `Public package: ${plan.publication.state}`,
    `Public derivatives: ${plan.derivatives.currentCount} current, ${plan.derivatives.createCount} missing, ${plan.derivatives.replaceCount} stale, ${plan.derivatives.blockedCount} blocked`,
    `Library playback MP3s: ${plan.libraryPlayback.currentCount}/${plan.libraryPlayback.trackCount} current (private; not published)`,
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
  const playbackItems = derivatives.items.map(
    (item) => item.playback,
  );
  const libraryPlayback = {
    trackCount: playbackItems.length,
    currentCount: playbackItems.filter(
      (item) => item.action === "none",
    ).length,
    createCount: playbackItems.filter(
      (item) => item.action === "create",
    ).length,
    replaceCount: playbackItems.filter(
      (item) => item.action === "replace",
    ).length,
    blockedCount: playbackItems.filter(
      (item) => item.action === "blocked",
    ).length,
  };
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
    (issue) =>
      !isPublishManagedDerivativeReferenceIssue(issue) &&
      !isPrivatePlaybackDerivativeIssue(issue),
  );
  const issues: PublishPlanIssue[] =
    validationIssues.map(issueFromValidation);
  const items: PublishPlanItem[] = [];
  const metadataInputs: PublishMetadataInput[] = [];
  const metadataFiles = [
    ...release.metadataFiles.filter(
      (file) => file.filename === "release.toml" && file.exists,
    ),
    ...release.tracks.flatMap((track) =>
      track.metadataFiles.filter(
        (file) =>
          (file.filename === "track.toml" ||
            file.filename === "track-credits.toml") &&
          file.exists,
      ),
    ),
  ];

  for (const file of metadataFiles) {
    const inspection = await inspectRegularFile(
      mediaRoot,
      file.relativePath,
    );

    if (!inspection.exists || !inspection.sha256) {
      issues.push({
        code: "metadata-input-missing",
        severity: "blocked",
        relativePath: file.relativePath,
        message:
          "A metadata input needed for the public package disappeared during preflight.",
        suggestion:
          "Refresh the Library scan and rebuild preflight.",
      });
      continue;
    }

    metadataInputs.push({
      relativePath: file.relativePath,
      sha256: inspection.sha256,
    });
  }

  metadataInputs.sort((left, right) =>
    left.relativePath.localeCompare(right.relativePath),
  );

  const destinationReleaseRelativePath =
    path.posix.join("releases", releaseId);
  const releaseDestinationExists = await destinationExists(
    publishRoot,
    destinationReleaseRelativePath,
  );

  const browserArtworkPlan = await buildBrowserArtworkPlan(
    mediaRoot,
    release,
  );
  const artwork = browserArtworkPlan.status === "not-needed"
    ? preferredBrowserArtwork(release.artworkMasters)
    : browserArtworkAssetFromPlan(browserArtworkPlan);

  if (!artwork) {
    const artworkCanBePrepared =
      browserArtworkPlan.status === "missing" ||
      browserArtworkPlan.status === "stale";

    issues.push({
      code: artworkCanBePrepared
        ? "browser-artwork-preparation-required"
        : "browser-artwork-required",
      severity: "blocked",
      relativePath: release.relativePath,
      message: artworkCanBePrepared
        ? `Browser artwork must be current before it can enter the hosted package. Current status: ${browserArtworkPlan.status}.`
        : "Publish requires one browser-compatible release artwork source, and no supported canonical source is available for preparation.",
      suggestion: artworkCanBePrepared
        ? "Use Prepare release to generate the reviewed browser-compatible artwork derivative from the canonical TIFF/TIF master, then refresh preflight."
        : "Assign one supported release-level front artwork master before publishing.",
    });
    items.push({
      kind: "release-artwork",
      action: "blocked",
      destinationRelativePath: path.posix.join(
        destinationReleaseRelativePath,
        "artwork/front/artwork.png",
      ),
      reason: browserArtworkPlan.reason,
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
      ...(inspection.sha256
        ? { sourceSha256: inspection.sha256 }
        : {}),
    });
  }

  for (const trackPlan of derivatives.items) {
    const trackDestination = path.posix.join(
      destinationReleaseRelativePath,
      "tracks",
      trackPlan.trackId,
    );
    const trackScan = release.tracks.find(
      (track) => track.id === trackPlan.trackId,
    );

    if (!trackScan) {
      throw new Error(
        `Release scan is missing track ${trackPlan.trackId}.`,
      );
    }

    const trackArtwork = await discoverBrowserArtwork(
      mediaRoot,
      trackScan.relativePath,
      trackScan.artworkMasters,
    );

    if (trackArtwork) {
      const trackArtworkInspection = await inspectRegularFile(
        mediaRoot,
        trackArtwork.relativePath,
      );
      const trackArtworkDestination = path.posix.join(
        trackDestination,
        "artwork/front",
        publicArtworkFilename(trackArtwork),
      );

      items.push({
        kind: "track-artwork",
        action: await destinationExists(
          publishRoot,
          trackArtworkDestination,
        )
          ? "replace"
          : "create",
        sourceRelativePath: trackArtwork.relativePath,
        destinationRelativePath: trackArtworkDestination,
        trackId: trackPlan.trackId,
        reason:
          "Copy the browser-compatible track artwork override; tracks without an override inherit release front artwork.",
        ...(trackArtworkInspection.sizeBytes === undefined
          ? {}
          : { sizeBytes: trackArtworkInspection.sizeBytes }),
        ...(trackArtworkInspection.sha256
          ? { sourceSha256: trackArtworkInspection.sha256 }
          : {}),
      });
    }

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
        const streamInspection = await inspectRegularFile(
          mediaRoot,
          streamFile.relativePath,
        );

        if (!streamInspection.exists || !streamInspection.sha256) {
          issues.push({
            code: "current-stream-file-missing",
            severity: "blocked",
            relativePath: streamFile.relativePath,
            message:
              "The web-stream plan reported current media, but a referenced stream file is no longer present.",
            suggestion:
              "Refresh preflight and Prepare release again if necessary.",
          });
        }

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
          ...(streamInspection.sha256
            ? { sourceSha256: streamInspection.sha256 }
            : {}),
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
        ...(inspection.sha256
          ? { sourceSha256: inspection.sha256 }
          : {}),
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
  const contract: PublishPlan["contract"] = {
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
  };
  const currentContentFingerprint = hashPublicationContent(
    releaseId,
    contract,
    metadataInputs,
    items,
  );
  const publication = await inspectPublicationState(
    publishRoot,
    destinationReleaseRelativePath,
    releaseDestinationExists,
    currentContentFingerprint,
  );
  const planWithoutFingerprint: Omit<PublishPlan, "planFingerprint"> = {
    schema: {
      name: "metadata-editor-publish-plan",
      version: 1,
    },
    contract,
    releaseId,
    generatedAt,
    readOnly: true,
    writesEnabled: false,
    sourceRoot: mediaRoot,
    destinationRoot: publishRoot,
    destinationReleaseRelativePath,
    destinationReleaseExists: releaseDestinationExists,
    publication,
    status: planStatus(issues),
    issues,
    metadataInputs,
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
    libraryPlayback,
    webStreams: webStreams.summary,
    waveforms,
    summary,
  };

  return {
    ...planWithoutFingerprint,
    planFingerprint: hashPlan(planWithoutFingerprint),
  };
}
