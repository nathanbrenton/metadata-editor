import {
  execFile,
} from "node:child_process";
import path from "node:path";
import {
  promisify,
} from "node:util";

import {
  auditMediaLibraryFileSpec,
  type MediaFileSpecAuditItem,
} from "./media-file-spec-audit.js";

const execFileAsync = promisify(execFile);

type FfprobeStream = {
  codec_type?: string;
  codec_name?: string;
  profile?: string;
  sample_rate?: string;
  channels?: number;
  sample_fmt?: string;
  bits_per_sample?: number;
  bits_per_raw_sample?: string;
  width?: number;
  height?: number;
  pix_fmt?: string;
  r_frame_rate?: string;
};

type FfprobeResult = {
  format?: {
    duration?: string;
    bit_rate?: string;
    format_name?: string;
  };
  streams?: FfprobeStream[];
};

export type MediaTechnicalDetails = {
  container?: string;
  durationSeconds?: number;
  bitRate?: number;
  codec?: string;
  profile?: string;
  sampleRate?: number;
  channels?: number;
  sampleFormat?: string;
  bitDepth?: number;
  width?: number;
  height?: number;
  pixelFormat?: string;
  frameRate?: string;
};

export type MediaTechnicalAuditItem =
  MediaFileSpecAuditItem & {
    technical?: MediaTechnicalDetails;
    probeError?: string;
  };

export type MediaTechnicalInventoryEntry = {
  value: string;
  count: number;
};

export type MediaTechnicalInventory = {
  audio: {
    codecs: MediaTechnicalInventoryEntry[];
    sampleRates: MediaTechnicalInventoryEntry[];
    bitDepths: MediaTechnicalInventoryEntry[];
    sampleFormats: MediaTechnicalInventoryEntry[];
    channels: MediaTechnicalInventoryEntry[];
  };
  artwork: {
    codecs: MediaTechnicalInventoryEntry[];
    dimensions: MediaTechnicalInventoryEntry[];
    pixelFormats: MediaTechnicalInventoryEntry[];
  };
  video: {
    codecs: MediaTechnicalInventoryEntry[];
    profiles: MediaTechnicalInventoryEntry[];
    dimensions: MediaTechnicalInventoryEntry[];
    pixelFormats: MediaTechnicalInventoryEntry[];
    frameRates: MediaTechnicalInventoryEntry[];
  };
};

export type MediaTechnicalHealth =
  | "ready"
  | "review"
  | "blocked";

export type MediaTechnicalContract = {
  version: 1;
  advisory: true;
  publishGating: false;
  audio: {
    total: number;
    preferredLossless: number;
    compatibleLossless: number;
    sourcePreservedLossy: number;
    review: number;
  };
  artwork: {
    total: number;
    preferred: number;
    compatible: number;
    review: number;
    geometry: {
      square: number;
      landscape: number;
      portrait: number;
      unknown: number;
    };
  };
  video: {
    total: number;
    preferredContainers: number;
    compatibleContainers: number;
    review: number;
    policy: "inventory-only";
    codecProfileThresholdDefined: false;
  };
};

export type MediaTechnicalIssue = {
  code:
    | "probe-failed"
    | "missing-primary-stream"
    | "missing-dimensions"
    | "mixed-audio-sample-rate"
    | "mixed-audio-bit-depth"
    | "mixed-audio-channels";
  severity: "review" | "blocked";
  message: string;
};

export type MediaTechnicalReleaseSummary = {
  releaseId: string;
  health: MediaTechnicalHealth;
  issues: MediaTechnicalIssue[];
  inventory: MediaTechnicalInventory;
  summary: {
    total: number;
    probed: number;
    failed: number;
    audio: number;
    artwork: number;
    video: number;
  };
};

export type MediaTechnicalAuditOptions = {
  concurrency?: number;
};

export type MediaTechnicalAuditResult = {
  root: string;
  releaseId?: string;
  items: MediaTechnicalAuditItem[];
  inventory: MediaTechnicalInventory;
  contract: MediaTechnicalContract;
  releases: MediaTechnicalReleaseSummary[];
  healthSummary: {
    ready: number;
    review: number;
    blocked: number;
  };
  summary: {
    total: number;
    probed: number;
    failed: number;
    audio: number;
    artwork: number;
    video: number;
  };
};

function numberValue(
  value: string | number | undefined,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed =
    typeof value === "number"
      ? value
      : Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : undefined;
}

function inventoryEntries(
  values: Array<string | undefined>,
): MediaTechnicalInventoryEntry[] {
  const counts = new Map<string, number>();

  for (const value of values) {
    if (!value) {
      continue;
    }

    counts.set(
      value,
      (counts.get(value) ?? 0) + 1,
    );
  }

  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort(
      (left, right) =>
        right.count - left.count ||
        left.value.localeCompare(right.value),
    );
}

export function buildMediaTechnicalInventory(
  items: MediaTechnicalAuditItem[],
): MediaTechnicalInventory {
  const audio = items.filter(
    (item) =>
      item.role === "audio-master" &&
      item.technical,
  );
  const artwork = items.filter(
    (item) =>
      item.role === "artwork-master" &&
      item.technical,
  );
  const video = items.filter(
    (item) =>
      item.role === "video-master" &&
      item.technical,
  );

  return {
    audio: {
      codecs: inventoryEntries(
        audio.map((item) => item.technical?.codec),
      ),
      sampleRates: inventoryEntries(
        audio.map((item) =>
          item.technical?.sampleRate
            ? `${item.technical.sampleRate} Hz`
            : undefined,
        ),
      ),
      bitDepths: inventoryEntries(
        audio.map((item) =>
          item.technical?.bitDepth
            ? `${item.technical.bitDepth}-bit`
            : undefined,
        ),
      ),
      sampleFormats: inventoryEntries(
        audio.map(
          (item) => item.technical?.sampleFormat,
        ),
      ),
      channels: inventoryEntries(
        audio.map((item) =>
          item.technical?.channels
            ? `${item.technical.channels} ch`
            : undefined,
        ),
      ),
    },
    artwork: {
      codecs: inventoryEntries(
        artwork.map((item) => item.technical?.codec),
      ),
      dimensions: inventoryEntries(
        artwork.map((item) => {
          const technical = item.technical;
          return technical?.width && technical.height
            ? `${technical.width}×${technical.height}`
            : undefined;
        }),
      ),
      pixelFormats: inventoryEntries(
        artwork.map(
          (item) => item.technical?.pixelFormat,
        ),
      ),
    },
    video: {
      codecs: inventoryEntries(
        video.map((item) => item.technical?.codec),
      ),
      profiles: inventoryEntries(
        video.map((item) => item.technical?.profile),
      ),
      dimensions: inventoryEntries(
        video.map((item) => {
          const technical = item.technical;
          return technical?.width && technical.height
            ? `${technical.width}×${technical.height}`
            : undefined;
        }),
      ),
      pixelFormats: inventoryEntries(
        video.map(
          (item) => item.technical?.pixelFormat,
        ),
      ),
      frameRates: inventoryEntries(
        video.map(
          (item) => item.technical?.frameRate,
        ),
      ),
    },
  };
}

const losslessAudioCodecs = new Set([
  "alac",
  "ape",
  "flac",
  "tta",
  "wavpack",
  "wmalossless",
]);

const lossyAudioCodecs = new Set([
  "aac",
  "ac3",
  "amr_nb",
  "amr_wb",
  "atrac3",
  "atrac3p",
  "eac3",
  "mp2",
  "mp3",
  "opus",
  "vorbis",
  "wmav1",
  "wmav2",
  "wmapro",
]);

function audioCodecPreservationClass(
  codec: string | undefined,
): "lossless" | "lossy" | "unknown" {
  if (!codec) {
    return "unknown";
  }

  const normalized = codec.toLowerCase();

  if (
    normalized.startsWith("pcm_") ||
    normalized.startsWith("dsd_") ||
    losslessAudioCodecs.has(normalized)
  ) {
    return "lossless";
  }

  return lossyAudioCodecs.has(normalized)
    ? "lossy"
    : "unknown";
}

export function buildMediaTechnicalContract(
  items: MediaTechnicalAuditItem[],
): MediaTechnicalContract {
  const contract: MediaTechnicalContract = {
    version: 1,
    advisory: true,
    publishGating: false,
    audio: {
      total: 0,
      preferredLossless: 0,
      compatibleLossless: 0,
      sourcePreservedLossy: 0,
      review: 0,
    },
    artwork: {
      total: 0,
      preferred: 0,
      compatible: 0,
      review: 0,
      geometry: {
        square: 0,
        landscape: 0,
        portrait: 0,
        unknown: 0,
      },
    },
    video: {
      total: 0,
      preferredContainers: 0,
      compatibleContainers: 0,
      review: 0,
      policy: "inventory-only",
      codecProfileThresholdDefined: false,
    },
  };

  for (const item of items) {
    if (item.role === "audio-master") {
      contract.audio.total += 1;
      const codecClass = audioCodecPreservationClass(
        item.technical?.codec,
      );

      if (
        !item.probeError &&
        item.formatClass === "preferred" &&
        codecClass === "lossless"
      ) {
        contract.audio.preferredLossless += 1;
      } else if (
        !item.probeError &&
        item.formatClass === "compatible" &&
        codecClass === "lossless"
      ) {
        contract.audio.compatibleLossless += 1;
      } else if (
        !item.probeError &&
        item.formatClass !== "unsupported" &&
        codecClass === "lossy"
      ) {
        contract.audio.sourcePreservedLossy += 1;
      } else {
        contract.audio.review += 1;
      }
      continue;
    }

    if (item.role === "artwork-master") {
      contract.artwork.total += 1;

      if (item.formatClass === "preferred") {
        contract.artwork.preferred += 1;
      } else if (item.formatClass === "compatible") {
        contract.artwork.compatible += 1;
      } else {
        contract.artwork.review += 1;
      }

      const width = item.technical?.width;
      const height = item.technical?.height;

      if (!width || !height) {
        contract.artwork.geometry.unknown += 1;
      } else if (width === height) {
        contract.artwork.geometry.square += 1;
      } else if (width > height) {
        contract.artwork.geometry.landscape += 1;
      } else {
        contract.artwork.geometry.portrait += 1;
      }
      continue;
    }

    contract.video.total += 1;
    if (item.formatClass === "preferred") {
      contract.video.preferredContainers += 1;
    } else if (item.formatClass === "compatible") {
      contract.video.compatibleContainers += 1;
    } else {
      contract.video.review += 1;
    }
  }

  return contract;
}

function uniqueDefinedNumbers(
  values: Array<number | undefined>,
): number[] {
  return [...new Set(
    values.filter(
      (value): value is number =>
        value !== undefined,
    ),
  )].sort((left, right) => left - right);
}

function formatNumberList(
  values: number[],
  suffix: string,
): string {
  return values
    .map((value) => `${value}${suffix}`)
    .join(", ");
}

function releaseSummaryCounts(
  items: MediaTechnicalAuditItem[],
): MediaTechnicalReleaseSummary["summary"] {
  return {
    total: items.length,
    probed: items.filter(
      (item) => item.technical,
    ).length,
    failed: items.filter(
      (item) => item.probeError,
    ).length,
    audio: items.filter(
      (item) => item.role === "audio-master",
    ).length,
    artwork: items.filter(
      (item) => item.role === "artwork-master",
    ).length,
    video: items.filter(
      (item) => item.role === "video-master",
    ).length,
  };
}

export function summarizeMediaTechnicalRelease(
  releaseId: string,
  items: MediaTechnicalAuditItem[],
): MediaTechnicalReleaseSummary {
  const issues: MediaTechnicalIssue[] = [];

  for (const item of items) {
    if (item.probeError) {
      issues.push({
        code: "probe-failed",
        severity: "blocked",
        message: `Could not probe ${item.relativePath}.`,
      });
      continue;
    }

    const technical = item.technical;

    if (!technical?.codec) {
      issues.push({
        code: "missing-primary-stream",
        severity: "blocked",
        message:
          `${item.relativePath} does not expose the expected ` +
          `${item.role === "audio-master" ? "audio" : "image/video"} stream.`,
      });
      continue;
    }

    if (
      item.role !== "audio-master" &&
      (!technical.width || !technical.height)
    ) {
      issues.push({
        code: "missing-dimensions",
        severity: "blocked",
        message: `${item.relativePath} has no probe-readable dimensions.`,
      });
    }
  }

  const audio = items.filter(
    (item) =>
      item.role === "audio-master" &&
      item.technical,
  );

  const sampleRates = uniqueDefinedNumbers(
    audio.map((item) => item.technical?.sampleRate),
  );
  const bitDepths = uniqueDefinedNumbers(
    audio.map((item) => item.technical?.bitDepth),
  );
  const channels = uniqueDefinedNumbers(
    audio.map((item) => item.technical?.channels),
  );

  if (sampleRates.length > 1) {
    issues.push({
      code: "mixed-audio-sample-rate",
      severity: "review",
      message:
        `Audio masters use mixed sample rates: ` +
        `${formatNumberList(sampleRates, " Hz")}.`,
    });
  }

  if (bitDepths.length > 1) {
    issues.push({
      code: "mixed-audio-bit-depth",
      severity: "review",
      message:
        `Audio masters use mixed bit depths: ` +
        `${formatNumberList(bitDepths, "-bit")}.`,
    });
  }

  if (channels.length > 1) {
    issues.push({
      code: "mixed-audio-channels",
      severity: "review",
      message:
        `Audio masters use mixed channel counts: ` +
        `${formatNumberList(channels, " ch")}.`,
    });
  }

  const health: MediaTechnicalHealth =
    issues.some((issue) => issue.severity === "blocked")
      ? "blocked"
      : issues.length > 0
        ? "review"
        : "ready";

  return {
    releaseId,
    health,
    issues,
    inventory: buildMediaTechnicalInventory(items),
    summary: releaseSummaryCounts(items),
  };
}

export function buildMediaTechnicalReleaseSummaries(
  items: MediaTechnicalAuditItem[],
  releaseId?: string,
): MediaTechnicalReleaseSummary[] {
  const groups = new Map<
    string,
    MediaTechnicalAuditItem[]
  >();

  for (const item of items) {
    const itemReleaseId =
      releaseId ??
      item.relativePath.split(/[\\/]/)[0] ??
      "(unknown release)";
    const group = groups.get(itemReleaseId) ?? [];
    group.push(item);
    groups.set(itemReleaseId, group);
  }

  return [...groups.entries()]
    .map(([id, releaseItems]) =>
      summarizeMediaTechnicalRelease(
        id,
        releaseItems,
      ),
    )
    .sort((left, right) =>
      left.releaseId.localeCompare(
        right.releaseId,
        undefined,
        { numeric: true, sensitivity: "base" },
      ),
    );
}

function normalizedConcurrency(
  value: number | undefined,
  itemCount: number,
): number {
  const requested =
    Number.isFinite(value) && value
      ? Math.floor(value)
      : 4;

  return Math.max(
    1,
    Math.min(8, requested, Math.max(1, itemCount)),
  );
}

export function parseFfprobeTechnical(
  role: MediaFileSpecAuditItem["role"],
  input: FfprobeResult,
): MediaTechnicalDetails {
  const format = input.format ?? {};
  const streams = input.streams ?? [];
  const audio = streams.find(
    (stream) => stream.codec_type === "audio",
  );
  const video = streams.find(
    (stream) => stream.codec_type === "video",
  );

  const primary =
    role === "audio-master"
      ? audio
      : video;

  const rawBitsValue = numberValue(
    primary?.bits_per_raw_sample,
  );
  const bitsValue = numberValue(
    primary?.bits_per_sample,
  );
  const rawBits =
    rawBitsValue !== undefined && rawBitsValue > 0
      ? rawBitsValue
      : undefined;
  const bits =
    bitsValue !== undefined && bitsValue > 0
      ? bitsValue
      : undefined;
  const durationSeconds =
    numberValue(format.duration);
  const bitRate =
    numberValue(format.bit_rate);
  const sampleRate =
    numberValue(audio?.sample_rate);

  return {
    ...(format.format_name
      ? { container: format.format_name }
      : {}),
    ...(durationSeconds !== undefined
      ? { durationSeconds }
      : {}),
    ...(bitRate !== undefined
      ? { bitRate }
      : {}),
    ...(primary?.codec_name
      ? { codec: primary.codec_name }
      : {}),
    ...(primary?.profile
      ? { profile: primary.profile }
      : {}),
    ...(sampleRate !== undefined
      ? { sampleRate }
      : {}),
    ...(audio?.channels !== undefined
      ? { channels: audio.channels }
      : {}),
    ...(audio?.sample_fmt
      ? { sampleFormat: audio.sample_fmt }
      : {}),
    ...(rawBits !== undefined || bits !== undefined
      ? { bitDepth: rawBits ?? bits }
      : {}),
    ...(video?.width !== undefined
      ? { width: video.width }
      : {}),
    ...(video?.height !== undefined
      ? { height: video.height }
      : {}),
    ...(video?.pix_fmt
      ? { pixelFormat: video.pix_fmt }
      : {}),
    ...(video?.r_frame_rate
      ? { frameRate: video.r_frame_rate }
      : {}),
  };
}

async function probe(
  absolutePath: string,
): Promise<FfprobeResult> {
  const ffprobe =
    process.env.FFPROBE_PATH ?? "ffprobe";

  const { stdout } = await execFileAsync(
    ffprobe,
    [
      "-v",
      "error",
      "-show_entries",
      [
        "format=format_name,duration,bit_rate",
        "stream=codec_type,codec_name,profile,sample_rate,channels,sample_fmt,bits_per_sample,bits_per_raw_sample,width,height,pix_fmt,r_frame_rate",
      ].join(":"),
      "-of",
      "json",
      absolutePath,
    ],
    {
      maxBuffer: 4 * 1024 * 1024,
    },
  );

  return JSON.parse(stdout) as FfprobeResult;
}

export async function auditMediaLibraryTechnical(
  mediaLibraryRoot: string,
  releaseId?: string,
  options: MediaTechnicalAuditOptions = {},
): Promise<MediaTechnicalAuditResult> {
  const fileSpec = await auditMediaLibraryFileSpec(
    mediaLibraryRoot,
    releaseId,
  );

  const items = new Array<MediaTechnicalAuditItem>(
    fileSpec.items.length,
  );
  const concurrency = normalizedConcurrency(
    options.concurrency,
    fileSpec.items.length,
  );
  let nextIndex = 0;

  const worker = async (): Promise<void> => {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;

      if (index >= fileSpec.items.length) {
        return;
      }

      const item = fileSpec.items[index];
      const absolutePath = path.join(
        fileSpec.root,
        item.relativePath,
      );

      try {
        const result = await probe(absolutePath);
        items[index] = {
          ...item,
          technical: parseFfprobeTechnical(
            item.role,
            result,
          ),
        };
      } catch (error) {
        items[index] = {
          ...item,
          probeError:
            error instanceof Error
              ? error.message
              : String(error),
        };
      }
    }
  };

  await Promise.all(
    Array.from(
      { length: concurrency },
      () => worker(),
    ),
  );

  const releases =
    buildMediaTechnicalReleaseSummaries(
      items,
      releaseId,
    );

  return {
    root: fileSpec.root,
    ...(releaseId ? { releaseId } : {}),
    items,
    inventory: buildMediaTechnicalInventory(items),
    contract: buildMediaTechnicalContract(items),
    releases,
    healthSummary: {
      ready: releases.filter(
        (release) => release.health === "ready",
      ).length,
      review: releases.filter(
        (release) => release.health === "review",
      ).length,
      blocked: releases.filter(
        (release) => release.health === "blocked",
      ).length,
    },
    summary: releaseSummaryCounts(items),
  };
}
