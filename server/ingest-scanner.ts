import { execFile } from "node:child_process";
import {
  lstat,
  readdir,
  realpath,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

import type {
  IngestAttachmentOptions,
  IngestCandidateInspection,
  IngestCandidateKind,
  IngestCandidateSummary,
  IngestEmbeddedMetadata,
  IngestFileInspection,
  IngestMediaKind,
  IngestProbeCapabilities,
  IngestScanResult,
  IngestTechnicalMetadata,
} from "../shared/ingest-types.js";
import {
  classifyIngestExtension,
  evidenceValue,
  inferCandidateEvidence,
  inferDateEvidence,
  inferFilenameEvidence,
  titleCaseIngestText,
} from "./ingest-inference.js";
import {
  assertPathWithinIngestRoot,
  defaultIngestRoot,
  resolveIngestCandidate,
  toIngestRelativePath,
} from "./ingest-root.js";

const execFileAsync = promisify(execFile);

export type IngestCommandResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type IngestCommandRunner = (
  command: string,
  args: string[],
) => Promise<IngestCommandResult>;

const defaultCommandRunner: IngestCommandRunner = async (
  command,
  args,
) => {
  try {
    const result = await execFileAsync(
      command,
      args,
      {
        encoding: "utf-8",
        maxBuffer: 10 * 1024 * 1024,
        timeout: 90_000,
      },
    );

    return {
      exitCode: 0,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  } catch (error) {
    const commandError = error as {
      code?: number | string;
      stdout?: string;
      stderr?: string;
      message?: string;
    };

    return {
      exitCode:
        typeof commandError.code === "number"
          ? commandError.code
          : 1,
      stdout: commandError.stdout ?? "",
      stderr:
        commandError.stderr ??
        commandError.message ??
        "Command failed",
    };
  }
};

function firstVersionLine(value: string): string | undefined {
  const line = value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find(Boolean);

  return line || undefined;
}

export async function detectIngestProbeCapabilities(
  commandRunner: IngestCommandRunner =
    defaultCommandRunner,
): Promise<IngestProbeCapabilities> {
  const [ffprobe, mediainfo] = await Promise.all([
    commandRunner("ffprobe", ["-version"]),
    commandRunner("mediainfo", ["--Version"]),
  ]);

  return {
    ffprobe: {
      available: ffprobe.exitCode === 0,
      ...(ffprobe.exitCode === 0
        ? {
            version: firstVersionLine(
              ffprobe.stdout,
            ),
          }
        : {}),
    },
    mediainfo: {
      available: mediainfo.exitCode === 0,
      ...(mediainfo.exitCode === 0
        ? {
            version: firstVersionLine(
              mediainfo.stdout,
            ),
          }
        : {}),
    },
  };
}

function isIgnoredName(name: string): boolean {
  return (
    name.startsWith(".") ||
    name === "Thumbs.db" ||
    name === "desktop.ini"
  );
}

async function listCandidateFiles(
  ingestRoot: string,
  candidatePath: string,
): Promise<string[]> {
  const stats = await lstat(candidatePath);

  if (stats.isSymbolicLink()) {
    return [];
  }

  if (stats.isFile()) {
    return [candidatePath];
  }

  if (!stats.isDirectory()) {
    return [];
  }

  const discovered: string[] = [];
  const entries = await readdir(candidatePath, {
    withFileTypes: true,
  });

  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  )) {
    if (
      isIgnoredName(entry.name) ||
      entry.isSymbolicLink()
    ) {
      continue;
    }

    const entryPath = assertPathWithinIngestRoot(
      ingestRoot,
      path.join(candidatePath, entry.name),
    );

    if (entry.isDirectory()) {
      discovered.push(
        ...(await listCandidateFiles(
          ingestRoot,
          entryPath,
        )),
      );
    } else if (entry.isFile()) {
      discovered.push(entryPath);
    }
  }

  return discovered;
}

function incrementKindCount(
  kind: IngestMediaKind,
  counts: Record<IngestMediaKind, number>,
): void {
  counts[kind] += 1;
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort((left, right) =>
    left.localeCompare(right, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );
}

function anchorYearFromEvidence(
  candidateEvidence: ReturnType<
    typeof inferCandidateEvidence
  >,
): number | undefined {
  const dateValue = evidenceValue(
    candidateEvidence,
    "date",
  );

  if (!dateValue) {
    return undefined;
  }

  const year = Number(dateValue.slice(0, 4));
  return Number.isInteger(year) ? year : undefined;
}

async function buildCandidateSummary(
  ingestRoot: string,
  candidateId: string,
  candidatePath: string,
  kind: IngestCandidateKind,
): Promise<IngestCandidateSummary> {
  const files = await listCandidateFiles(
    ingestRoot,
    candidatePath,
  );
  const candidateEvidence =
    kind === "folder"
      ? inferCandidateEvidence(candidateId)
      : inferFilenameEvidence(candidateId);
  const anchorYear = anchorYearFromEvidence(
    candidateEvidence,
  );
  const counts: Record<IngestMediaKind, number> = {
    audio: 0,
    image: 0,
    text: 0,
    unknown: 0,
  };
  const extensions: string[] = [];
  const dateCandidates: string[] = [];
  let totalSizeBytes = 0;

  const candidateDate = evidenceValue(
    candidateEvidence,
    "date",
  );

  if (candidateDate) {
    dateCandidates.push(candidateDate);
  }

  for (const filePath of files) {
    const stats = await lstat(filePath);
    const extension = path
      .extname(filePath)
      .toLowerCase();
    const mediaKind =
      classifyIngestExtension(extension);
    const filenameEvidence = inferFilenameEvidence(
      path.basename(filePath),
      anchorYear,
    );

    totalSizeBytes += stats.size;
    incrementKindCount(mediaKind, counts);

    if (extension) {
      extensions.push(extension);
    }

    const dateValue = evidenceValue(
      filenameEvidence,
      "date",
    );

    if (dateValue) {
      dateCandidates.push(dateValue);
    }
  }

  const displayTitle =
    evidenceValue(
      candidateEvidence,
      kind === "folder"
        ? "release.title"
        : "track.title",
    ) ?? titleCaseIngestText(
      path.basename(
        candidateId,
        path.extname(candidateId),
      ),
    );
  const warnings: string[] = [];

  if (files.length === 0) {
    warnings.push(
      "No eligible non-symlink files were found in this candidate.",
    );
  }

  if (counts.unknown > 0) {
    warnings.push(
      `${counts.unknown} file${
        counts.unknown === 1 ? "" : "s"
      } could not be classified by extension without inspection.`,
    );
  }

  return {
    id: candidateId,
    name: candidateId,
    relativePath: toIngestRelativePath(
      ingestRoot,
      candidatePath,
    ),
    kind,
    displayTitle,
    fileCount: files.length,
    audioCount: counts.audio,
    imageCount: counts.image,
    textCount: counts.text,
    unknownCount: counts.unknown,
    totalSizeBytes,
    extensions: uniqueSorted(extensions),
    dateCandidates: uniqueSorted(dateCandidates),
    evidence: candidateEvidence,
    warnings,
  };
}

export async function scanIngestDrop(
  ingestRoot: string,
  configuredRoot = defaultIngestRoot,
  commandRunner: IngestCommandRunner =
    defaultCommandRunner,
): Promise<IngestScanResult> {
  const capabilities =
    await detectIngestProbeCapabilities(
      commandRunner,
    );
  const entries = await readdir(ingestRoot, {
    withFileTypes: true,
  });
  const candidates: IngestCandidateSummary[] = [];

  for (const entry of entries.sort((left, right) =>
    left.name.localeCompare(right.name, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  )) {
    if (
      isIgnoredName(entry.name) ||
      entry.isSymbolicLink() ||
      (!entry.isDirectory() && !entry.isFile())
    ) {
      continue;
    }

    const candidatePath =
      await resolveIngestCandidate(
        ingestRoot,
        entry.name,
      );

    candidates.push(
      await buildCandidateSummary(
        ingestRoot,
        entry.name,
        candidatePath,
        entry.isDirectory()
          ? "folder"
          : "loose-file",
      ),
    );
  }

  const warnings: string[] = [];

  if (!capabilities.ffprobe.available) {
    warnings.push(
      "ffprobe is unavailable; inspection will rely on extensions and optional MediaInfo output.",
    );
  }

  if (!capabilities.mediainfo.available) {
    warnings.push(
      "MediaInfo is unavailable; inspection will use ffprobe only.",
    );
  }

  return {
    scannedAt: new Date().toISOString(),
    rootLabel: path.basename(ingestRoot),
    configuredRoot,
    candidateCount: candidates.length,
    fileCount: candidates.reduce(
      (total, candidate) =>
        total + candidate.fileCount,
      0,
    ),
    candidates,
    capabilities,
    warnings,
  };
}

type FfprobeStream = {
  codec_type?: string;
  codec_name?: string;
  codec_long_name?: string;
  sample_rate?: string;
  channels?: number;
  channel_layout?: string;
  bits_per_sample?: number;
  bits_per_raw_sample?: string;
  bit_rate?: string;
  duration?: string;
  width?: number;
  height?: number;
  tags?: Record<string, unknown>;
};

type FfprobePayload = {
  streams?: FfprobeStream[];
  format?: {
    format_name?: string;
    format_long_name?: string;
    duration?: string;
    bit_rate?: string;
    tags?: Record<string, unknown>;
  };
};

function finiteNumber(value: unknown): number | undefined {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  return Number.isFinite(parsed) ? parsed : undefined;
}

function stringTags(
  tags: Record<string, unknown> | undefined,
): IngestEmbeddedMetadata {
  if (!tags) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(tags)
      .filter(
        (entry): entry is [string, string] =>
          typeof entry[1] === "string" &&
          entry[1].trim() !== "",
      )
      .sort(([left], [right]) =>
        left.localeCompare(right),
      ),
  );
}

function mergeEmbeddedTags(
  formatTags: IngestEmbeddedMetadata,
  streamTags: IngestEmbeddedMetadata,
): IngestEmbeddedMetadata {
  const merged = { ...formatTags };

  for (const [key, value] of Object.entries(
    streamTags,
  )) {
    if (!(key in merged)) {
      merged[key] = value;
    } else if (merged[key] !== value) {
      merged[`stream.${key}`] = value;
    }
  }

  return merged;
}

function classifyFromFfprobe(
  payload: FfprobePayload,
  fallback: IngestMediaKind,
): IngestMediaKind {
  if (
    payload.streams?.some(
      (stream) => stream.codec_type === "audio",
    )
  ) {
    return "audio";
  }

  if (
    payload.streams?.some(
      (stream) => stream.codec_type === "video",
    )
  ) {
    return fallback === "image"
      ? "image"
      : "unknown";
  }

  return fallback;
}

function technicalFromFfprobe(
  payload: FfprobePayload,
): {
  technical: IngestTechnicalMetadata;
  embeddedMetadata: IngestEmbeddedMetadata;
} {
  const audioStream = payload.streams?.find(
    (stream) => stream.codec_type === "audio",
  );
  const videoStream = payload.streams?.find(
    (stream) => stream.codec_type === "video",
  );
  const primaryStream = audioStream ?? videoStream;
  const bitDepth =
    finiteNumber(primaryStream?.bits_per_raw_sample) ??
    finiteNumber(primaryStream?.bits_per_sample);

  return {
    technical: {
      ...(payload.format?.format_name
        ? { container: payload.format.format_name }
        : {}),
      ...(payload.format?.format_long_name
        ? {
            containerLongName:
              payload.format.format_long_name,
          }
        : {}),
      ...(primaryStream?.codec_name
        ? { codec: primaryStream.codec_name }
        : {}),
      ...(primaryStream?.codec_long_name
        ? {
            codecLongName:
              primaryStream.codec_long_name,
          }
        : {}),
      ...(
        finiteNumber(payload.format?.duration) ??
        finiteNumber(primaryStream?.duration)
      ) !== undefined
        ? {
            durationSeconds:
              finiteNumber(payload.format?.duration) ??
              finiteNumber(primaryStream?.duration),
          }
        : {},
      ...(finiteNumber(audioStream?.sample_rate) !==
      undefined
        ? {
            sampleRateHz: finiteNumber(
              audioStream?.sample_rate,
            ),
          }
        : {}),
      ...(audioStream?.channels !== undefined
        ? { channels: audioStream.channels }
        : {}),
      ...(audioStream?.channel_layout
        ? {
            channelLayout:
              audioStream.channel_layout,
          }
        : {}),
      ...(bitDepth !== undefined && bitDepth > 0
        ? { bitDepth }
        : {}),
      ...(
        finiteNumber(primaryStream?.bit_rate) ??
        finiteNumber(payload.format?.bit_rate)
      ) !== undefined
        ? {
            bitRate:
              finiteNumber(primaryStream?.bit_rate) ??
              finiteNumber(payload.format?.bit_rate),
          }
        : {},
      ...(videoStream?.width !== undefined
        ? { width: videoStream.width }
        : {}),
      ...(videoStream?.height !== undefined
        ? { height: videoStream.height }
        : {}),
    },
    embeddedMetadata: mergeEmbeddedTags(
      stringTags(payload.format?.tags),
      stringTags(primaryStream?.tags),
    ),
  };
}

function technicalFromMediaInfo(
  payload: unknown,
): IngestTechnicalMetadata {
  if (
    typeof payload !== "object" ||
    payload === null ||
    !("media" in payload)
  ) {
    return {};
  }

  const media = (payload as {
    media?: {
      track?: Array<Record<string, unknown>>;
    };
  }).media;
  const tracks = media?.track ?? [];
  const general = tracks.find(
    (track) => track["@type"] === "General",
  );
  const audio = tracks.find(
    (track) => track["@type"] === "Audio",
  );
  const image = tracks.find(
    (track) => track["@type"] === "Image",
  );
  const primary = audio ?? image;

  return {
    ...(typeof general?.Format === "string"
      ? { containerLongName: general.Format }
      : {}),
    ...(typeof primary?.Format === "string"
      ? { codecLongName: primary.Format }
      : {}),
    ...(finiteNumber(general?.Duration) !== undefined
      ? {
          durationSeconds: finiteNumber(
            general?.Duration,
          ),
        }
      : {}),
    ...(finiteNumber(audio?.SamplingRate) !== undefined
      ? {
          sampleRateHz: finiteNumber(
            audio?.SamplingRate,
          ),
        }
      : {}),
    ...(finiteNumber(audio?.Channels) !== undefined
      ? { channels: finiteNumber(audio?.Channels) }
      : {}),
    ...(finiteNumber(audio?.BitDepth) !== undefined
      ? { bitDepth: finiteNumber(audio?.BitDepth) }
      : {}),
    ...(finiteNumber(audio?.BitRate) !== undefined
      ? { bitRate: finiteNumber(audio?.BitRate) }
      : {}),
    ...(finiteNumber(image?.Width) !== undefined
      ? { width: finiteNumber(image?.Width) }
      : {}),
    ...(finiteNumber(image?.Height) !== undefined
      ? { height: finiteNumber(image?.Height) }
      : {}),
  };
}

function compactTechnical(
  primary: IngestTechnicalMetadata,
  fallback: IngestTechnicalMetadata,
): IngestTechnicalMetadata {
  return {
    ...fallback,
    ...Object.fromEntries(
      Object.entries(primary).filter(
        ([, value]) => value !== undefined,
      ),
    ),
  };
}

async function inspectFile(
  ingestRoot: string,
  filePath: string,
  anchorYear: number | undefined,
  capabilities: IngestProbeCapabilities,
  commandRunner: IngestCommandRunner,
): Promise<IngestFileInspection> {
  const stats = await lstat(filePath);
  const filename = path.basename(filePath);
  const extension = path.extname(filename).toLowerCase();
  const fallbackKind =
    classifyIngestExtension(extension);
  const warnings: string[] = [];
  let mediaKind = fallbackKind;
  let detectedBy = "extension";
  let technical: IngestTechnicalMetadata = {};
  let embeddedMetadata: IngestEmbeddedMetadata = {};

  if (
    capabilities.ffprobe.available &&
    fallbackKind !== "text"
  ) {
    const result = await commandRunner("ffprobe", [
      "-v",
      "error",
      "-show_format",
      "-show_streams",
      "-show_chapters",
      "-of",
      "json",
      filePath,
    ]);

    if (result.exitCode === 0) {
      try {
        const payload = JSON.parse(
          result.stdout,
        ) as FfprobePayload;
        const normalized =
          technicalFromFfprobe(payload);

        mediaKind = classifyFromFfprobe(
          payload,
          fallbackKind,
        );
        detectedBy = "ffprobe";
        technical = normalized.technical;
        embeddedMetadata =
          normalized.embeddedMetadata;
      } catch {
        warnings.push(
          "ffprobe returned invalid JSON; extension classification was retained.",
        );
      }
    } else {
      warnings.push(
        `ffprobe could not inspect this file: ${result.stderr.trim() || "unknown error"}`,
      );
    }
  }

  if (
    capabilities.mediainfo.available &&
    fallbackKind !== "text"
  ) {
    const result = await commandRunner(
      "mediainfo",
      ["--Output=JSON", filePath],
    );

    if (result.exitCode === 0) {
      try {
        technical = compactTechnical(
          technical,
          technicalFromMediaInfo(
            JSON.parse(result.stdout),
          ),
        );

        if (detectedBy === "extension") {
          detectedBy = "MediaInfo";
        }
      } catch {
        warnings.push(
          "MediaInfo returned invalid JSON.",
        );
      }
    } else {
      warnings.push(
        `MediaInfo could not inspect this file: ${result.stderr.trim() || "unknown error"}`,
      );
    }
  }

  const evidence = inferFilenameEvidence(
    filename,
    anchorYear,
  );

  for (const [key, value] of Object.entries(
    embeddedMetadata,
  )) {
    const normalizedKey = key.toLowerCase();

    if (
      normalizedKey === "title" ||
      normalizedKey === "artist" ||
      normalizedKey === "album" ||
      normalizedKey === "date" ||
      normalizedKey === "genre"
    ) {
      evidence.push({
        field: `embedded.${normalizedKey}`,
        value,
        source: "embedded-tag",
        rawValue: value,
        confidence: "high",
        rule: "embedded-tag-direct-v1",
      });
    }
  }

  return {
    relativePath: toIngestRelativePath(
      ingestRoot,
      filePath,
    ),
    filename,
    extension,
    sizeBytes: stats.size,
    modifiedAt: stats.mtime.toISOString(),
    mediaKind,
    detectedBy,
    technical,
    embeddedMetadata,
    evidence,
    warnings,
  };
}

export async function inspectIngestCandidate(
  ingestRoot: string,
  candidateId: string,
  configuredRoot = defaultIngestRoot,
  commandRunner: IngestCommandRunner =
    defaultCommandRunner,
): Promise<IngestCandidateInspection> {
  const candidatePath =
    await resolveIngestCandidate(
      ingestRoot,
      candidateId,
    );
  const stats = await lstat(candidatePath);
  const kind: IngestCandidateKind =
    stats.isDirectory()
      ? "folder"
      : "loose-file";
  const candidate = await buildCandidateSummary(
    ingestRoot,
    candidateId,
    candidatePath,
    kind,
  );
  const capabilities =
    await detectIngestProbeCapabilities(
      commandRunner,
    );
  const anchorYear = anchorYearFromEvidence(
    kind === "folder"
      ? inferCandidateEvidence(candidateId)
      : inferDateEvidence(
          candidateId,
          "filename",
        ),
  );
  const filePaths = await listCandidateFiles(
    ingestRoot,
    candidatePath,
  );
  const files: IngestFileInspection[] = [];

  // Probe sequentially to avoid starting many external processes at once.
  for (const filePath of filePaths) {
    files.push(
      await inspectFile(
        ingestRoot,
        filePath,
        anchorYear,
        capabilities,
        commandRunner,
      ),
    );
  }

  const warnings = [
    ...candidate.warnings,
    ...(!capabilities.ffprobe.available
      ? [
          "ffprobe is unavailable; technical inspection is limited.",
        ]
      : []),
    ...(!capabilities.mediainfo.available
      ? [
          "MediaInfo is unavailable; secondary inspection is disabled.",
        ]
      : []),
  ];

  return {
    inspectedAt: new Date().toISOString(),
    candidate,
    files,
    capabilities,
    warnings,
    readOnly: true,
  };
}

export async function inspectIngestRelativeFiles(
  ingestRoot: string,
  relativePaths: string[],
  commandRunner: IngestCommandRunner =
    defaultCommandRunner,
): Promise<IngestFileInspection[]> {
  const capabilities =
    await detectIngestProbeCapabilities(
      commandRunner,
    );
  const uniquePaths = [
    ...new Set(relativePaths),
  ];
  const files: IngestFileInspection[] = [];

  for (const relativePath of uniquePaths) {
    const normalized = relativePath
      .replaceAll("\\", "/")
      .replace(/^\/+/, "");
    const segments = normalized.split("/");

    if (
      !normalized ||
      path.posix.isAbsolute(normalized) ||
      segments.some(
        (segment) =>
          !segment ||
          segment === "." ||
          segment === "..",
      )
    ) {
      throw new Error(
        `Invalid ingest source path: ${relativePath}`,
      );
    }

    const candidatePath =
      assertPathWithinIngestRoot(
        ingestRoot,
        path.join(
          ingestRoot,
          ...segments,
        ),
      );
    const stats = await lstat(candidatePath);

    if (
      stats.isSymbolicLink() ||
      !stats.isFile()
    ) {
      throw new Error(
        `Ingest attachment must be a regular non-symlink file: ${relativePath}`,
      );
    }

    const canonicalPath =
      await realpath(candidatePath);
    assertPathWithinIngestRoot(
      ingestRoot,
      canonicalPath,
    );

    files.push(
      await inspectFile(
        ingestRoot,
        canonicalPath,
        undefined,
        capabilities,
        commandRunner,
      ),
    );
  }

  return files;
}

export async function listIngestAttachmentOptions(
  ingestRoot: string,
  candidateId: string,
  commandRunner: IngestCommandRunner =
    defaultCommandRunner,
): Promise<IngestAttachmentOptions> {
  await resolveIngestCandidate(
    ingestRoot,
    candidateId,
  );

  const entries = await readdir(
    ingestRoot,
    { withFileTypes: true },
  );
  const relativePaths = entries
    .filter(
      (entry) =>
        entry.name !== candidateId &&
        !isIgnoredName(entry.name) &&
        !entry.isSymbolicLink() &&
        entry.isFile() &&
        ["image", "text"].includes(
          classifyIngestExtension(
            path.extname(entry.name).toLowerCase(),
          ),
        ),
    )
    .map((entry) => entry.name);

  return {
    candidateId,
    files: await inspectIngestRelativeFiles(
      ingestRoot,
      relativePaths,
      commandRunner,
    ),
  };
}
