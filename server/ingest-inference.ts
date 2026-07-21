import path from "node:path";

import type {
  IngestEvidence,
  IngestMediaKind,
} from "../shared/ingest-types.js";

const audioExtensions = new Set([
  ".aac",
  ".aif",
  ".aiff",
  ".alac",
  ".ape",
  ".au",
  ".caf",
  ".dff",
  ".dsf",
  ".flac",
  ".m4a",
  ".mka",
  ".mp3",
  ".ogg",
  ".opus",
  ".snd",
  ".tta",
  ".wav",
  ".wave",
  ".wma",
  ".wv",
]);

const imageExtensions = new Set([
  ".avif",
  ".bmp",
  ".gif",
  ".heic",
  ".jpeg",
  ".jpg",
  ".png",
  ".tif",
  ".tiff",
  ".webp",
]);

const textExtensions = new Set([
  ".cue",
  ".csv",
  ".json",
  ".md",
  ".nfo",
  ".rtf",
  ".toml",
  ".txt",
  ".yaml",
  ".yml",
]);

const musicalKeyNames = new Map([
  ["c", "C major"],
  ["cm", "C minor"],
  ["c#", "C-sharp major"],
  ["c#m", "C-sharp minor"],
  ["db", "D-flat major"],
  ["dbm", "D-flat minor"],
  ["d", "D major"],
  ["dm", "D minor"],
  ["d#", "D-sharp major"],
  ["d#m", "D-sharp minor"],
  ["eb", "E-flat major"],
  ["ebm", "E-flat minor"],
  ["e", "E major"],
  ["em", "E minor"],
  ["f", "F major"],
  ["fm", "F minor"],
  ["f#", "F-sharp major"],
  ["f#m", "F-sharp minor"],
  ["gb", "G-flat major"],
  ["gbm", "G-flat minor"],
  ["g", "G major"],
  ["gm", "G minor"],
  ["g#", "G-sharp major"],
  ["g#m", "G-sharp minor"],
  ["ab", "A-flat major"],
  ["abm", "A-flat minor"],
  ["a", "A major"],
  ["am", "A minor"],
  ["a#", "A-sharp major"],
  ["a#m", "A-sharp minor"],
  ["bb", "B-flat major"],
  ["bbm", "B-flat minor"],
  ["b", "B major"],
  ["bm", "B minor"],
]);

function isValidDate(
  year: number,
  month: number,
  day: number,
): boolean {
  const date = new Date(
    Date.UTC(year, month - 1, day),
  );

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function formatDate(
  year: number,
  month: number,
  day: number,
): string {
  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

function resolveTwoDigitYear(
  shortYear: number,
  anchorYear?: number,
): number {
  if (anchorYear !== undefined) {
    const anchorCentury =
      Math.floor(anchorYear / 100) * 100;
    const candidates = [
      anchorCentury - 100 + shortYear,
      anchorCentury + shortYear,
      anchorCentury + 100 + shortYear,
    ];

    return candidates.reduce((best, candidate) =>
      Math.abs(candidate - anchorYear) <
      Math.abs(best - anchorYear)
        ? candidate
        : best,
    );
  }

  const currentYear = new Date().getUTCFullYear();
  const currentCentury =
    Math.floor(currentYear / 100) * 100;
  const futureCutoff = currentYear + 5;
  const currentCenturyCandidate =
    currentCentury + shortYear;

  return currentCenturyCandidate <= futureCutoff
    ? currentCenturyCandidate
    : currentCenturyCandidate - 100;
}

function splitWords(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d+)/g, "$1 $2")
    .replace(/(\d+)([A-Za-z])/g, "$1 $2")
    .split(/[\s_-]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function titleCaseIngestText(
  value: string,
): string {
  return splitWords(value)
    .map((part) => {
      if (/^\d+$/.test(part)) {
        return part.padStart(
          part.length === 1 ? 2 : part.length,
          "0",
        );
      }

      return `${part.charAt(0).toUpperCase()}${part
        .slice(1)
        .toLowerCase()}`;
    })
    .join(" ");
}

export function classifyIngestExtension(
  extension: string,
): IngestMediaKind {
  const normalized = extension.toLowerCase();

  if (audioExtensions.has(normalized)) {
    return "audio";
  }

  if (imageExtensions.has(normalized)) {
    return "image";
  }

  if (textExtensions.has(normalized)) {
    return "text";
  }

  return "unknown";
}

export function inferDateEvidence(
  rawValue: string,
  source: "foldername" | "filename",
  anchorYear?: number,
): IngestEvidence[] {
  const evidence: IngestEvidence[] = [];
  const isoMatch = rawValue.match(
    /(?:^|[^0-9])(\d{4})[-_](\d{2})[-_](\d{2})(?:[^0-9]|$)/,
  );

  if (isoMatch) {
    const year = Number(isoMatch[1]);
    const month = Number(isoMatch[2]);
    const day = Number(isoMatch[3]);

    if (isValidDate(year, month, day)) {
      evidence.push({
        field: "date",
        value: formatDate(year, month, day),
        source,
        rawValue,
        confidence: "high",
        rule: "date-yyyy-mm-dd-v1",
      });
      return evidence;
    }
  }

  const compactLongMatch = rawValue.match(
    /(?:^|[^0-9])(\d{4})(\d{2})(\d{2})(?:[^0-9]|$)/,
  );

  if (compactLongMatch) {
    const year = Number(compactLongMatch[1]);
    const month = Number(compactLongMatch[2]);
    const day = Number(compactLongMatch[3]);

    if (isValidDate(year, month, day)) {
      evidence.push({
        field: "date",
        value: formatDate(year, month, day),
        source,
        rawValue,
        confidence: "high",
        rule: "date-yyyymmdd-v1",
      });
      return evidence;
    }
  }

  const compactShortMatch = rawValue.match(
    /(?:^|[^0-9])(\d{2})(\d{2})(\d{2})(?:[^0-9]|$)/,
  );

  if (compactShortMatch) {
    const shortYear = Number(compactShortMatch[1]);
    const year = resolveTwoDigitYear(
      shortYear,
      anchorYear,
    );
    const month = Number(compactShortMatch[2]);
    const day = Number(compactShortMatch[3]);

    if (isValidDate(year, month, day)) {
      evidence.push({
        field: "date",
        value: formatDate(year, month, day),
        source,
        rawValue,
        confidence:
          anchorYear === undefined ? "medium" : "high",
        rule:
          anchorYear === undefined
            ? "date-yymmdd-pivot-v1"
            : "date-yymmdd-anchor-v1",
      });
    }
  }

  return evidence;
}

function removeDatePrefix(value: string): string {
  return value
    .replace(/^\d{4}[-_]\d{2}[-_]\d{2}[_-]?/, "")
    .replace(/^\d{8}[_-]?/, "")
    .replace(/^\d{6}[_-]?/, "");
}

function inferVersionFromStem(
  stem: string,
): { base: string; version?: string } {
  const versionMatch = stem.match(
    /^(.*?)[_-](v\d+(?:\.\d+)*)$/i,
  );

  if (versionMatch) {
    return {
      base: versionMatch[1],
      version: versionMatch[2],
    };
  }

  return { base: stem };
}

function inferTakeFromStem(
  stem: string,
): { base: string; take?: string } {
  const dashTakeMatch = stem.match(
    /^(.*?)-(\d+)$/,
  );

  if (dashTakeMatch) {
    return {
      base: dashTakeMatch[1],
      take: `Take ${dashTakeMatch[2]}`,
    };
  }

  const letterTakeMatch = stem.match(
    /^(.*?\d)([a-z])$/i,
  );

  if (letterTakeMatch) {
    return {
      base: letterTakeMatch[1],
      take: `Take ${letterTakeMatch[2].toUpperCase()}`,
    };
  }

  return { base: stem };
}

function inferBpmAndKey(
  stem: string,
): {
    base: string;
    bpm?: number;
    key?: string;
  } {
  const match = stem.match(
    /^(.*?)[_-](\d{2,3})[_-]([A-Ga-g](?:#|b)?m?)$/,
  );

  if (!match) {
    return { base: stem };
  }

  const bpm = Number(match[2]);
  const key = musicalKeyNames.get(
    match[3].toLowerCase(),
  );

  if (
    !Number.isInteger(bpm) ||
    bpm < 20 ||
    bpm > 400 ||
    !key
  ) {
    return { base: stem };
  }

  return {
    base: match[1],
    bpm,
    key,
  };
}

export function inferFilenameEvidence(
  filename: string,
  anchorYear?: number,
): IngestEvidence[] {
  const extension = path.extname(filename);
  const originalStem = path.basename(
    filename,
    extension,
  );
  const evidence = inferDateEvidence(
    originalStem,
    "filename",
    anchorYear,
  );
  let stem = removeDatePrefix(originalStem);

  const bpmAndKey = inferBpmAndKey(stem);
  stem = bpmAndKey.base;

  if (bpmAndKey.bpm !== undefined) {
    evidence.push({
      field: "track.audio.bpm",
      value: bpmAndKey.bpm,
      source: "filename",
      rawValue: filename,
      confidence: "high",
      rule: "filename-bpm-key-suffix-v1",
    });
  }

  if (bpmAndKey.key) {
    evidence.push({
      field: "track.audio.key",
      value: bpmAndKey.key,
      source: "filename",
      rawValue: filename,
      confidence: "high",
      rule: "filename-bpm-key-suffix-v1",
    });
  }

  const version = inferVersionFromStem(stem);
  stem = version.base;

  if (version.version) {
    evidence.push({
      field: "track.version",
      value: version.version,
      source: "filename",
      rawValue: filename,
      confidence: "high",
      rule: "filename-version-suffix-v1",
    });
  }

  const take = inferTakeFromStem(stem);
  stem = take.base;

  if (take.take) {
    evidence.push({
      field: "track.take",
      value: take.take,
      source: "filename",
      rawValue: filename,
      confidence: "medium",
      rule: "filename-take-suffix-v1",
    });
  }

  const prefixMatch = stem.match(
    /^([A-Za-z]+\d+[A-Za-z]*)[_-](.+)$/,
  );

  if (prefixMatch) {
    evidence.push({
      field: "source.prefix",
      value: prefixMatch[1],
      source: "filename",
      rawValue: filename,
      confidence: "medium",
      rule: "filename-project-prefix-v1",
    });
    stem = prefixMatch[2];
  }

  const title = titleCaseIngestText(stem);

  if (title) {
    evidence.push({
      field: "track.title",
      value: title,
      source: "filename",
      rawValue: filename,
      confidence: "high",
      rule: "filename-title-v1",
    });
  }

  return evidence;
}

export function inferCandidateEvidence(
  candidateName: string,
): IngestEvidence[] {
  const evidence = inferDateEvidence(
    candidateName,
    "foldername",
  );
  const stem = removeDatePrefix(candidateName)
    .replace(/_+$/, "");
  const segments = stem
    .split(/_+/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  if (segments.length > 0) {
    evidence.push({
      field: "release.title",
      value: titleCaseIngestText(segments[0]),
      source: "foldername",
      rawValue: candidateName,
      confidence: "medium",
      rule: "folder-first-segment-title-v1",
    });
  }

  for (const [index, segment] of segments
    .slice(1)
    .entries()) {
    evidence.push({
      field: `folder.context.${index + 1}`,
      value: titleCaseIngestText(segment),
      source: "foldername",
      rawValue: candidateName,
      confidence: "low",
      rule: "folder-context-segment-v1",
    });
  }

  return evidence;
}

export function evidenceValue(
  evidence: IngestEvidence[],
  field: string,
): string | undefined {
  const match = evidence.find(
    (item) => item.field === field,
  );

  return match === undefined
    ? undefined
    : String(match.value);
}
