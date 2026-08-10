import type {
  IngestFileInspection,
  IngestMetadataSidecarInspection,
  IngestMetadataSidecarSuggestion,
} from "./ingest-types.js";

type ParsedEntry = IngestMetadataSidecarInspection["entries"][number];

type SuggestionTemplate = {
  canonicalPath: string;
  label: string;
  scope: IngestMetadataSidecarSuggestion["scope"];
  confidence: IngestMetadataSidecarSuggestion["confidence"];
  reviewRequired: boolean;
};

const simpleMappings: Record<string, SuggestionTemplate> = {
  TALB: {
    canonicalPath: "release.title",
    label: "Release title",
    scope: "release",
    confidence: "high",
    reviewRequired: false,
  },
  ALBUMARTIST: {
    canonicalPath: "release.primary_artist.name",
    label: "Release artist",
    scope: "release",
    confidence: "high",
    reviewRequired: false,
  },
  ALBUM_ARTIST: {
    canonicalPath: "release.primary_artist.name",
    label: "Release artist",
    scope: "release",
    confidence: "high",
    reviewRequired: false,
  },
  ARTIST: {
    canonicalPath: "track.primary_artist.name",
    label: "Track artist",
    scope: "track",
    confidence: "high",
    reviewRequired: false,
  },
  TITLE: {
    canonicalPath: "track.title",
    label: "Track title",
    scope: "track",
    confidence: "high",
    reviewRequired: false,
  },
  GENRE: {
    canonicalPath: "release.genres",
    label: "Genre",
    scope: "release",
    confidence: "medium",
    reviewRequired: true,
  },
  LANGUAGE: {
    canonicalPath: "track.language",
    label: "Track language",
    scope: "track",
    confidence: "medium",
    reviewRequired: true,
  },
  COMPOSER: {
    canonicalPath: "track.composers[].name",
    label: "Composer credit",
    scope: "credit",
    confidence: "medium",
    reviewRequired: true,
  },
  LYRICIST: {
    canonicalPath: "track.lyricists[].name",
    label: "Lyricist credit",
    scope: "credit",
    confidence: "medium",
    reviewRequired: true,
  },
  USLT: {
    canonicalPath: "track.text.lyrics",
    label: "Lyrics",
    scope: "track",
    confidence: "medium",
    reviewRequired: true,
  },
  PUBLISHER: {
    canonicalPath: "release.rights.publisher",
    label: "Publisher",
    scope: "release",
    confidence: "medium",
    reviewRequired: true,
  },
  COMMENT: {
    canonicalPath: "track.text.comment",
    label: "Comment",
    scope: "track",
    confidence: "medium",
    reviewRequired: true,
  },
  COMMENTS: {
    canonicalPath: "track.text.comment",
    label: "Comment",
    scope: "track",
    confidence: "medium",
    reviewRequired: true,
  },
  COMM: {
    canonicalPath: "track.text.comment",
    label: "Comment",
    scope: "track",
    confidence: "medium",
    reviewRequired: true,
  },
};

function unescapeFfmetadata(value: string): string {
  let output = "";

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];

    if (character === "\\" && index + 1 < value.length) {
      index += 1;
      output += value[index];
      continue;
    }

    output += character;
  }

  return output;
}

function trailingBackslashCount(value: string): number {
  let count = 0;

  for (let index = value.length - 1; index >= 0; index -= 1) {
    if (value[index] !== "\\") {
      break;
    }
    count += 1;
  }

  return count;
}

function logicalLines(content: string): Array<{ line: number; text: string }> {
  const physicalLines = content.replace(/^\uFEFF/, "").split(/\r?\n/);
  const result: Array<{ line: number; text: string }> = [];

  let buffered = "";
  let bufferedLine = 1;

  for (let index = 0; index < physicalLines.length; index += 1) {
    const physical = physicalLines[index];
    const lineNumber = index + 1;
    const continued = trailingBackslashCount(physical) % 2 === 1;
    const current = continued ? physical.slice(0, -1) : physical;

    if (!buffered) {
      bufferedLine = lineNumber;
    }

    buffered += current;

    if (continued) {
      buffered += "\n";
      continue;
    }

    result.push({ line: bufferedLine, text: buffered });
    buffered = "";
  }

  if (buffered) {
    result.push({ line: bufferedLine, text: buffered });
  }

  return result;
}

function findUnescapedEquals(value: string): number {
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (character === "\\") {
      escaped = true;
      continue;
    }

    if (character === "=") {
      return index;
    }
  }

  return -1;
}

function audioFilenameHint(filename: string): string | undefined {
  const patterns = [
    /\.metadata-edited\.txt$/i,
    /\.ffmetadata\.txt$/i,
    /\.metadata\.txt$/i,
    /\.ffmetadata$/i,
    /\.ffmeta$/i,
  ];

  for (const pattern of patterns) {
    if (pattern.test(filename)) {
      const value = filename.replace(pattern, "").trim();
      return value || undefined;
    }
  }

  return undefined;
}

function numberPairSuggestions(
  entry: ParsedEntry,
  prefix: "track" | "disc",
): IngestMetadataSidecarSuggestion[] {
  const match = entry.value.trim().match(/^(\d+)(?:\s*\/\s*(\d+))?$/);
  if (!match) {
    return [];
  }

  const number = Number(match[1]);
  const total = match[2] ? Number(match[2]) : undefined;
  const labelPrefix = prefix === "track" ? "Track" : "Disc";

  return [
    {
      sourceKey: entry.key,
      canonicalPath: `track.numbering.${prefix}_number`,
      label: `${labelPrefix} number`,
      value: number,
      scope: "track",
      confidence: "high",
      reviewRequired: false,
    },
    ...(total !== undefined
      ? [{
          sourceKey: entry.key,
          canonicalPath: `track.numbering.${prefix}_total`,
          label: `${labelPrefix} total`,
          value: total,
          scope: "track" as const,
          confidence: "high" as const,
          reviewRequired: false,
        }]
      : []),
  ];
}

function dateSuggestion(entry: ParsedEntry): IngestMetadataSidecarSuggestion {
  const completeDate = /^\d{4}-\d{2}-\d{2}(?:$|[T\s])/.test(entry.value.trim());

  return {
    sourceKey: entry.key,
    canonicalPath: "release.dates.release",
    label: "Release date",
    value: entry.value,
    scope: "release",
    confidence: completeDate ? "high" : "medium",
    reviewRequired: !completeDate,
  };
}

function copyrightSuggestion(entry: ParsedEntry): IngestMetadataSidecarSuggestion {
  const phonographic = entry.value.trim().startsWith("℗");

  return {
    sourceKey: entry.key,
    canonicalPath: phonographic
      ? "release.rights.phonographic_copyright"
      : "release.rights.copyright",
    label: phonographic ? "Phonographic copyright" : "Copyright",
    value: entry.value,
    scope: "release",
    confidence: "medium",
    reviewRequired: true,
  };
}

function suggestionsForEntry(entry: ParsedEntry): IngestMetadataSidecarSuggestion[] {
  if (entry.section) {
    return [];
  }

  if (entry.normalizedKey === "TRACK") {
    return numberPairSuggestions(entry, "track");
  }

  if (entry.normalizedKey === "DISC") {
    return numberPairSuggestions(entry, "disc");
  }

  if (entry.normalizedKey === "DATE" || entry.normalizedKey === "YEAR") {
    return [dateSuggestion(entry)];
  }

  if (entry.normalizedKey === "COPYRIGHT") {
    return [copyrightSuggestion(entry)];
  }

  const template = simpleMappings[entry.normalizedKey];
  if (!template) {
    return [];
  }

  return [{
    sourceKey: entry.key,
    canonicalPath: template.canonicalPath,
    label: template.label,
    value: entry.value,
    scope: template.scope,
    confidence: template.confidence,
    reviewRequired: template.reviewRequired,
  }];
}

export function parseFfmetadataSidecar(
  content: string,
  filename: string,
): IngestMetadataSidecarInspection | undefined {
  const lines = logicalLines(content);
  const firstContentIndex = lines.findIndex(
    ({ text }) => text.trim() !== "",
  );

  if (
    firstContentIndex < 0 ||
    lines[firstContentIndex].text.trim() !== ";FFMETADATA1"
  ) {
    return undefined;
  }

  const entries: ParsedEntry[] = [];
  const warnings: string[] = [];
  let section: string | undefined;

  for (let index = firstContentIndex + 1; index < lines.length; index += 1) {
    const { line, text } = lines[index];
    const trimmed = text.trim();

    if (!trimmed || trimmed.startsWith(";") || trimmed.startsWith("#")) {
      continue;
    }

    const sectionMatch = trimmed.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1].trim().toUpperCase();
      continue;
    }

    const equalsIndex = findUnescapedEquals(text);
    if (equalsIndex < 0) {
      warnings.push(`FFmetadata line ${line} is not a key=value entry and was preserved only as an inspection warning.`);
      continue;
    }

    const key = unescapeFfmetadata(text.slice(0, equalsIndex)).trim();
    const value = unescapeFfmetadata(text.slice(equalsIndex + 1));

    if (!key) {
      warnings.push(`FFmetadata line ${line} has an empty key and was ignored.`);
      continue;
    }

    entries.push({
      key,
      normalizedKey: key.trim().toUpperCase(),
      value,
      line,
      ...(section ? { section } : {}),
    });
  }

  const suggestions = entries.flatMap(suggestionsForEntry);
  const mappedKeys = new Set(
    suggestions.map((suggestion) => suggestion.sourceKey.trim().toUpperCase()),
  );
  const unmappedKeys = [
    ...new Set(
      entries
        .filter((entry) => !entry.section && !mappedKeys.has(entry.normalizedKey))
        .map((entry) => entry.normalizedKey),
    ),
  ];

  for (const entry of entries) {
    if (
      !entry.section &&
      (entry.normalizedKey === "TRACK" || entry.normalizedKey === "DISC") &&
      suggestionsForEntry(entry).length === 0
    ) {
      warnings.push(`FFmetadata ${entry.key} value ${JSON.stringify(entry.value)} could not be parsed as number or number/total.`);
    }
  }

  return {
    format: "ffmetadata",
    filename,
    ...(audioFilenameHint(filename) ? { audioFilenameHint: audioFilenameHint(filename) } : {}),
    entries,
    suggestions,
    unmappedKeys,
    warnings,
  };
}

function normalizedBasename(value: string): string {
  const normalized = value.replaceAll("\\", "/");
  return normalized.slice(normalized.lastIndexOf("/") + 1).toLocaleLowerCase();
}

function normalizedParent(value: string): string {
  const normalized = value.replaceAll("\\", "/");
  const index = normalized.lastIndexOf("/");
  return index >= 0 ? normalized.slice(0, index).toLocaleLowerCase() : "";
}

export function pairFfmetadataSidecars(
  files: IngestFileInspection[],
): IngestFileInspection[] {
  const audioFiles = files.filter((file) => file.mediaKind === "audio");

  return files.map((file) => {
    const sidecar = file.metadataSidecar;
    if (!sidecar || sidecar.pairedAudioRelativePath || !sidecar.audioFilenameHint) {
      return file;
    }

    const hint = sidecar.audioFilenameHint.toLocaleLowerCase();
    const sameDirectoryMatches = audioFiles.filter(
      (audio) =>
        normalizedParent(audio.relativePath) === normalizedParent(file.relativePath) &&
        normalizedBasename(audio.relativePath) === hint,
    );
    const allMatches = audioFiles.filter(
      (audio) => normalizedBasename(audio.relativePath) === hint,
    );
    const matches = sameDirectoryMatches.length > 0
      ? sameDirectoryMatches
      : allMatches;

    if (matches.length !== 1) {
      return file;
    }

    return {
      ...file,
      metadataSidecar: {
        ...sidecar,
        pairedAudioRelativePath: matches[0].relativePath,
      },
    };
  });
}

export function sidecarSuggestionValue(
  sidecar: IngestMetadataSidecarInspection,
  canonicalPath: string,
): string | number | undefined {
  const matches = sidecar.suggestions.filter(
    (suggestion) => suggestion.canonicalPath === canonicalPath,
  );

  if (matches.length === 0) {
    return undefined;
  }

  const first = matches[0].value;
  const normalizedFirst = String(first).trim().toLocaleLowerCase();
  const allAgree = matches.every(
    (suggestion) =>
      String(suggestion.value).trim().toLocaleLowerCase() === normalizedFirst,
  );

  return allAgree ? first : undefined;
}
