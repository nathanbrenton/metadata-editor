import {
  lstat,
  readFile,
} from "node:fs/promises";
import path from "node:path";

import {
  assertPathWithinRoot,
} from "../media-root.js";
import type {
  FfmpegCapabilities,
  ReleaseScanResult,
  TrackScanResult,
} from "../types.js";
import {
  buildMediaProcessingProfile,
  hashMediaProcessingProfile,
} from "./profile.js";
import type {
  MediaProcessingAction,
  MediaProcessingCheck,
  MediaProcessingDerivativePlan,
  MediaProcessingDerivativeStatus,
  MediaProcessingMasterPlan,
  MediaProcessingPlan,
  MediaProcessingTrackPlan,
} from "./types.js";
import {
  DEFAULT_WAVEFORM_PEAKS_PER_SECOND,
  parseWaveformPeaksPerSecond,
} from "./waveform-generator.js";

type FileInspection = {
  exists: boolean;
  usable: boolean;
  sizeBytes?: number;
  modifiedAt?: string;
  modifiedAtMs?: number;
  check?: MediaProcessingCheck;
};

type ExistingWaveformInspection = {
  valid: boolean;
  checks: MediaProcessingCheck[];
};

export type BuildMediaProcessingPlanOptions = {
  trackId?: string;
  peaksPerSecond?: number;
  generatedAt?: string;
};

function libraryPath(
  mediaRoot: string,
  relativePath: string,
): string {
  return assertPathWithinRoot(
    mediaRoot,
    path.resolve(
      mediaRoot,
      ...relativePath
        .replaceAll("\\", "/")
        .split("/")
        .filter(Boolean),
    ),
  );
}

function derivativeRelativePath(
  track: TrackScanResult,
  filename: string,
): string {
  return path.posix.join(
    track.relativePath.replaceAll("\\", "/"),
    filename,
  );
}

async function inspectFile(
  mediaRoot: string,
  relativePath: string,
): Promise<FileInspection> {
  const absolutePath = libraryPath(
    mediaRoot,
    relativePath,
  );

  try {
    const stats = await lstat(absolutePath);

    if (
      stats.isSymbolicLink() ||
      !stats.isFile()
    ) {
      return {
        exists: true,
        usable: false,
        check: {
          code: "not-regular-file",
          status: "blocked",
          message:
            "The path exists but is not a regular non-symbolic file.",
        },
      };
    }

    return {
      exists: true,
      usable: true,
      sizeBytes: stats.size,
      modifiedAt: stats.mtime.toISOString(),
      modifiedAtMs: stats.mtimeMs,
    };
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return {
        exists: false,
        usable: false,
      };
    }

    return {
      exists: false,
      usable: false,
      check: {
        code: "unreadable-path",
        status: "blocked",
        message:
          error instanceof Error
            ? error.message
            : "Unable to inspect the path.",
      },
    };
  }
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function sameBand(
  value: unknown,
  expected: readonly [number, number],
): boolean {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    value[0] === expected[0] &&
    value[1] === expected[1]
  );
}

export function inspectWaveformDocument(
  value: unknown,
  expected: ReturnType<
    typeof buildMediaProcessingProfile
  >["waveform"],
): ExistingWaveformInspection {
  const checks: MediaProcessingCheck[] = [];

  if (!isRecord(value)) {
    return {
      valid: false,
      checks: [
        {
          code: "invalid-waveform-json",
          status: "warning",
          message:
            "The waveform file does not contain a JSON object.",
        },
      ],
    };
  }

  if (value.version !== expected.schemaVersion) {
    checks.push({
      code: "waveform-schema-version",
      status: "warning",
      message:
        `Waveform schema version ${String(value.version ?? "unknown")} ` +
        `does not match ${expected.schemaVersion}.`,
    });
  }

  if (
    value.peaksPerSecond !==
    expected.peaksPerSecond
  ) {
    checks.push({
      code: "waveform-resolution",
      status: "warning",
      message:
        `Waveform resolution ${String(value.peaksPerSecond ?? "unknown")} ` +
        `does not match ${expected.peaksPerSecond} peaks per second.`,
    });
  }

  const analysis = isRecord(value.analysis)
    ? value.analysis
    : null;

  if (
    !analysis ||
    analysis.fftSize !== expected.fftSize ||
    analysis.window !== expected.window
  ) {
    checks.push({
      code: "waveform-analysis-profile",
      status: "warning",
      message:
        "The waveform FFT size or window does not match the active profile.",
    });
  }

  const expectedPeakFields = [
    "min",
    "max",
    "low",
    "mid",
    "high",
  ];

  if (
    !analysis ||
    !Array.isArray(analysis.peakFields) ||
    analysis.peakFields.length !==
      expectedPeakFields.length ||
    !analysis.peakFields.every(
      (field, index) =>
        field === expectedPeakFields[index],
    )
  ) {
    checks.push({
      code: "waveform-peak-fields",
      status: "warning",
      message:
        "The waveform peak-field order does not match the active profile.",
    });
  }

  const normalization =
    analysis &&
    isRecord(analysis.normalization)
      ? analysis.normalization
      : null;

  if (
    !normalization ||
    normalization.method !==
      "per-band-percentile" ||
    normalization.percentile !==
      expected.normalizationPercentile ||
    normalization.compression !==
      "square-root"
  ) {
    checks.push({
      code: "waveform-normalization",
      status: "warning",
      message:
        "The waveform normalization settings do not match the active profile.",
    });
  }

  const bands =
    analysis && isRecord(analysis.bandsHz)
      ? analysis.bandsHz
      : null;

  if (
    !bands ||
    !sameBand(
      bands.low,
      expected.bandsHz.low,
    ) ||
    !sameBand(
      bands.mid,
      expected.bandsHz.mid,
    ) ||
    !sameBand(
      bands.high,
      expected.bandsHz.high,
    )
  ) {
    checks.push({
      code: "waveform-frequency-bands",
      status: "warning",
      message:
        "The waveform frequency bands do not match the active profile.",
    });
  }

  const peaks = value.peaks;
  const peakCount = value.peakCount;

  if (
    !Array.isArray(peaks) ||
    !Number.isInteger(peakCount) ||
    peakCount !== peaks.length ||
    !peaks.every(
      (peak) =>
        Array.isArray(peak) &&
        peak.length === 5 &&
        peak.every(
          (entry) =>
            typeof entry === "number" &&
            Number.isFinite(entry),
        ),
    )
  ) {
    checks.push({
      code: "waveform-peak-shape",
      status: "warning",
      message:
        "The waveform peak array is missing or does not use five numeric values per peak.",
    });
  }

  if (checks.length === 0) {
    checks.push({
      code: "waveform-profile-current",
      status: "pass",
      message:
        "The waveform JSON matches the active analysis profile.",
    });
  }

  return {
    valid: checks.every(
      (check) => check.status === "pass",
    ),
    checks,
  };
}

async function inspectExistingWaveform(
  mediaRoot: string,
  relativePath: string,
  expected: ReturnType<
    typeof buildMediaProcessingProfile
  >["waveform"],
): Promise<ExistingWaveformInspection> {
  try {
    const content = await readFile(
      libraryPath(mediaRoot, relativePath),
      "utf8",
    );

    return inspectWaveformDocument(
      JSON.parse(content) as unknown,
      expected,
    );
  } catch (error) {
    return {
      valid: false,
      checks: [
        {
          code: "unreadable-waveform-json",
          status: "warning",
          message:
            error instanceof Error
              ? `Unable to read waveform JSON: ${error.message}`
              : "Unable to read waveform JSON.",
        },
      ],
    };
  }
}

function mp3EncoderReady(
  capabilities: FfmpegCapabilities,
): boolean {
  const mp3 = capabilities.containers.find(
    (container) =>
      container.container === "mp3",
  );

  return Boolean(
    capabilities.available &&
      mp3 &&
      mp3.status !== "unsupported" &&
      mp3.selectedEncoder,
  );
}

function buildBlockedDerivative(
  kind: MediaProcessingDerivativePlan["kind"],
  filename: string,
  relativePath: string,
  reason: string,
  existing: FileInspection,
  checks: MediaProcessingCheck[],
): MediaProcessingDerivativePlan {
  return {
    kind,
    filename,
    relativePath,
    status: "blocked",
    action: "blocked",
    reason,
    exists: existing.exists,
    ...(existing.sizeBytes === undefined
      ? {}
      : { sizeBytes: existing.sizeBytes }),
    ...(existing.modifiedAt === undefined
      ? {}
      : { modifiedAt: existing.modifiedAt }),
    checks,
  };
}

function derivativeStatusAndAction(
  exists: boolean,
  stale: boolean,
): {
  status: MediaProcessingDerivativeStatus;
  action: MediaProcessingAction;
} {
  if (!exists) {
    return {
      status: "missing",
      action: "create",
    };
  }

  if (stale) {
    return {
      status: "stale",
      action: "replace",
    };
  }

  return {
    status: "current",
    action: "none",
  };
}

async function buildMasterPlan(
  mediaRoot: string,
  track: TrackScanResult,
): Promise<{
  plan: MediaProcessingMasterPlan;
  inspection?: FileInspection;
}> {
  if (track.audioMasters.length === 0) {
    return {
      plan: {
        status: "missing",
        checks: [
          {
            code: "missing-audio-master",
            status: "blocked",
            message:
              "No audio-master file was detected for this track.",
          },
        ],
      },
    };
  }

  if (track.audioMasters.length > 1) {
    return {
      plan: {
        status: "ambiguous",
        checks: [
          {
            code: "multiple-audio-masters",
            status: "blocked",
            message:
              "Multiple audio-master files were detected; keep exactly one intended master.",
          },
        ],
      },
    };
  }

  const asset = track.audioMasters[0];
  const inspection = await inspectFile(
    mediaRoot,
    asset.relativePath,
  );

  if (
    !inspection.usable ||
    inspection.sizeBytes === 0
  ) {
    return {
      plan: {
        status: "blocked",
        filename: asset.filename,
        relativePath: asset.relativePath,
        extension: asset.extension,
        checks: [
          inspection.check ?? {
            code: "unusable-audio-master",
            status: "blocked",
            message:
              inspection.sizeBytes === 0
                ? "The audio master is empty."
                : "The audio master cannot be read as a regular file.",
          },
        ],
      },
      inspection,
    };
  }

  return {
    plan: {
      status: "ready",
      filename: asset.filename,
      relativePath: asset.relativePath,
      extension: asset.extension,
      ...(inspection.sizeBytes === undefined
        ? {}
        : { sizeBytes: inspection.sizeBytes }),
      ...(inspection.modifiedAt === undefined
        ? {}
        : { modifiedAt: inspection.modifiedAt }),
      checks: [
        {
          code: "audio-master-ready",
          status: "pass",
          message:
            "Exactly one regular audio master is available.",
        },
      ],
    },
    inspection,
  };
}

async function buildPlaybackPlan(
  mediaRoot: string,
  track: TrackScanResult,
  master: MediaProcessingMasterPlan,
  masterInspection: FileInspection | undefined,
  capabilities: FfmpegCapabilities,
  filename: string,
): Promise<MediaProcessingDerivativePlan> {
  const relativePath = derivativeRelativePath(
    track,
    filename,
  );
  const existing = await inspectFile(
    mediaRoot,
    relativePath,
  );

  if (existing.check) {
    return buildBlockedDerivative(
      "playback-mp3",
      filename,
      relativePath,
      existing.check.message,
      existing,
      [existing.check],
    );
  }

  if (
    master.status !== "ready" ||
    !masterInspection?.usable
  ) {
    return buildBlockedDerivative(
      "playback-mp3",
      filename,
      relativePath,
      "Playback generation requires one usable audio master.",
      existing,
      [
        {
          code: "master-not-ready",
          status: "blocked",
          message:
            "Playback generation is blocked until the master is ready.",
        },
      ],
    );
  }

  const empty =
    existing.exists &&
    existing.sizeBytes === 0;
  const stale = Boolean(
    existing.exists &&
      (
        empty ||
        (
          existing.modifiedAtMs !== undefined &&
          masterInspection.modifiedAtMs !== undefined &&
          existing.modifiedAtMs <
            masterInspection.modifiedAtMs
        )
      ),
  );
  const state = derivativeStatusAndAction(
    existing.exists,
    stale,
  );

  if (
    state.action !== "none" &&
    !mp3EncoderReady(capabilities)
  ) {
    return buildBlockedDerivative(
      "playback-mp3",
      filename,
      relativePath,
      "A usable FFmpeg MP3 encoder is not available.",
      existing,
      [
        {
          code: "ffmpeg-mp3-unavailable",
          status: "blocked",
          message:
            capabilities.error ??
            "FFmpeg does not expose a supported MP3 encoder.",
        },
      ],
    );
  }

  const checks: MediaProcessingCheck[] = [];

  if (!existing.exists) {
    checks.push({
      code: "playback-missing",
      status: "warning",
      message:
        "audio-playback.mp3 does not exist and is planned for creation.",
    });
  } else if (empty) {
    checks.push({
      code: "playback-empty",
      status: "warning",
      message:
        "The playback MP3 is empty and is planned for replacement.",
    });
  } else if (stale) {
    checks.push({
      code: "playback-older-than-master",
      status: "warning",
      message:
        "The playback MP3 is older than the audio master and is planned for replacement.",
    });
  } else {
    checks.push({
      code: "playback-current",
      status: "pass",
      message:
        "The playback MP3 is at least as new as the audio master.",
    });
  }

  return {
    kind: "playback-mp3",
    filename,
    relativePath,
    status: state.status,
    action: state.action,
    reason:
      state.action === "create"
        ? "Playback MP3 is missing."
        : state.action === "replace"
          ? empty
            ? "Playback MP3 is empty."
            : "Playback MP3 predates the master."
          : "Playback MP3 is current.",
    exists: existing.exists,
    ...(existing.sizeBytes === undefined
      ? {}
      : { sizeBytes: existing.sizeBytes }),
    ...(existing.modifiedAt === undefined
      ? {}
      : { modifiedAt: existing.modifiedAt }),
    checks,
  };
}

async function buildWaveformPlan(
  mediaRoot: string,
  track: TrackScanResult,
  master: MediaProcessingMasterPlan,
  masterInspection: FileInspection | undefined,
  capabilities: FfmpegCapabilities,
  expected: ReturnType<
    typeof buildMediaProcessingProfile
  >["waveform"],
): Promise<MediaProcessingDerivativePlan> {
  const filename = expected.filename;
  const relativePath = derivativeRelativePath(
    track,
    filename,
  );
  const existing = await inspectFile(
    mediaRoot,
    relativePath,
  );

  if (existing.check) {
    return buildBlockedDerivative(
      "waveform-peaks",
      filename,
      relativePath,
      existing.check.message,
      existing,
      [existing.check],
    );
  }

  if (
    master.status !== "ready" ||
    !masterInspection?.usable ||
    !master.extension
  ) {
    return buildBlockedDerivative(
      "waveform-peaks",
      filename,
      relativePath,
      "Waveform generation requires one usable audio master.",
      existing,
      [
        {
          code: "master-not-ready",
          status: "blocked",
          message:
            "Waveform generation is blocked until the master is ready.",
        },
      ],
    );
  }

  let documentInspection:
    | ExistingWaveformInspection
    | undefined;

  if (existing.exists) {
    documentInspection =
      await inspectExistingWaveform(
        mediaRoot,
        relativePath,
        expected,
      );
  }

  const olderThanMaster = Boolean(
    existing.exists &&
      existing.modifiedAtMs !== undefined &&
      masterInspection.modifiedAtMs !== undefined &&
      existing.modifiedAtMs <
        masterInspection.modifiedAtMs,
  );
  const stale = Boolean(
    existing.exists &&
      (
        olderThanMaster ||
        !documentInspection?.valid
      ),
  );
  const state = derivativeStatusAndAction(
    existing.exists,
    stale,
  );
  const nativeWav =
    master.extension.toLowerCase() === ".wav";

  if (
    state.action !== "none" &&
    !nativeWav &&
    !capabilities.available
  ) {
    return buildBlockedDerivative(
      "waveform-peaks",
      filename,
      relativePath,
      "Non-WAV masters require FFmpeg decoding before waveform analysis.",
      existing,
      [
        {
          code: "ffmpeg-decode-unavailable",
          status: "blocked",
          message:
            capabilities.error ??
            "FFmpeg is unavailable for decoding this master format.",
        },
      ],
    );
  }

  const checks: MediaProcessingCheck[] = [
    ...(documentInspection?.checks ?? []),
  ];

  if (!existing.exists) {
    checks.push({
      code: "waveform-missing",
      status: "warning",
      message:
        "waveform-peaks.json does not exist and is planned for creation.",
    });
  } else if (olderThanMaster) {
    checks.push({
      code: "waveform-older-than-master",
      status: "warning",
      message:
        "The waveform is older than the audio master and is planned for replacement.",
    });
  }

  if (
    state.action === "none" &&
    checks.length === 0
  ) {
    checks.push({
      code: "waveform-current",
      status: "pass",
      message:
        "The waveform is current.",
    });
  }

  if (
    state.action !== "none" &&
    nativeWav
  ) {
    checks.push({
      code: "native-wav-analysis",
      status: "pass",
      message:
        "The master can use the native WAV waveform analyzer without an intermediate file.",
    });
  } else if (state.action !== "none") {
    checks.push({
      code: "ffmpeg-decode-required",
      status: "pass",
      message:
        "FFmpeg will be required to decode the master to PCM before waveform analysis.",
    });
  }

  return {
    kind: "waveform-peaks",
    filename,
    relativePath,
    status: state.status,
    action: state.action,
    reason:
      state.action === "create"
        ? "Waveform JSON is missing."
        : state.action === "replace"
          ? "Waveform JSON is stale or does not match the active profile."
          : "Waveform JSON is current.",
    exists: existing.exists,
    ...(existing.sizeBytes === undefined
      ? {}
      : { sizeBytes: existing.sizeBytes }),
    ...(existing.modifiedAt === undefined
      ? {}
      : { modifiedAt: existing.modifiedAt }),
    checks,
  };
}

async function buildTrackPlan(
  mediaRoot: string,
  track: TrackScanResult,
  capabilities: FfmpegCapabilities,
  profile: ReturnType<
    typeof buildMediaProcessingProfile
  >,
): Promise<MediaProcessingTrackPlan> {
  const masterResult = await buildMasterPlan(
    mediaRoot,
    track,
  );
  const [playback, waveform] =
    await Promise.all([
      buildPlaybackPlan(
        mediaRoot,
        track,
        masterResult.plan,
        masterResult.inspection,
        capabilities,
        profile.playback.filename,
      ),
      buildWaveformPlan(
        mediaRoot,
        track,
        masterResult.plan,
        masterResult.inspection,
        capabilities,
        profile.waveform,
      ),
    ]);
  const warnings = [
    ...masterResult.plan.checks,
    ...playback.checks,
    ...waveform.checks,
  ]
    .filter(
      (check) => check.status !== "pass",
    )
    .map((check) => check.message);

  return {
    trackId: track.id,
    trackRelativePath: track.relativePath,
    master: masterResult.plan,
    playback,
    waveform,
    canProcess:
      playback.action !== "blocked" &&
      waveform.action !== "blocked",
    warnings,
  };
}

export async function buildMediaProcessingPlan(
  mediaRoot: string,
  release: ReleaseScanResult,
  capabilities: FfmpegCapabilities,
  options: BuildMediaProcessingPlanOptions = {},
): Promise<MediaProcessingPlan> {
  const peaksPerSecond =
    parseWaveformPeaksPerSecond(
      options.peaksPerSecond ??
        DEFAULT_WAVEFORM_PEAKS_PER_SECOND,
    );
  const profile = buildMediaProcessingProfile(
    peaksPerSecond,
  );
  const tracks = options.trackId
    ? release.tracks.filter(
        (track) =>
          track.id === options.trackId,
      )
    : release.tracks;

  if (
    options.trackId &&
    tracks.length === 0
  ) {
    throw new Error(
      `Track not found: ${options.trackId}`,
    );
  }

  const items = await Promise.all(
    tracks.map((track) =>
      buildTrackPlan(
        mediaRoot,
        track,
        capabilities,
        profile,
      ),
    ),
  );
  const derivatives = items.flatMap(
    (item) => [
      item.playback,
      item.waveform,
    ],
  );
  const warnings = items.flatMap(
    (item) =>
      item.warnings.map(
        (warning) =>
          `${item.trackRelativePath}: ${warning}`,
      ),
  );

  return {
    releaseId: release.id,
    scope: options.trackId
      ? "track"
      : "all",
    ...(options.trackId
      ? { trackId: options.trackId }
      : {}),
    generatedAt:
      options.generatedAt ??
      new Date().toISOString(),
    writesEnabled: false,
    profile: {
      ...profile,
      sha256:
        hashMediaProcessingProfile(
          profile,
        ),
    },
    items,
    summary: {
      trackCount: items.length,
      currentCount: derivatives.filter(
        (item) => item.action === "none",
      ).length,
      createCount: derivatives.filter(
        (item) => item.action === "create",
      ).length,
      replaceCount: derivatives.filter(
        (item) => item.action === "replace",
      ).length,
      blockedCount: derivatives.filter(
        (item) => item.action === "blocked",
      ).length,
    },
    warnings,
  };
}
