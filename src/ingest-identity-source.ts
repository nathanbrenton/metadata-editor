import type {
  InferenceConfidence,
  IngestCandidateInspection,
  IngestEvidence,
  IngestFileInspection,
} from "../shared/ingest-types.js";

export type IngestIdentityField =
  | "release.artist"
  | "release.title";

export type IngestIdentitySourceOption = {
  id: string;
  label: string;
  value: string;
  origin: "current" | "folder" | "embedded" | "blank";
  source?: IngestEvidence["source"];
  rawValue?: string;
  confidence?: InferenceConfidence;
  rule?: string;
};

export type IngestIdentitySourcePlan = {
  artistOptions: IngestIdentitySourceOption[];
  titleOptions: IngestIdentitySourceOption[];
  defaultArtistSourceId: string;
  defaultTitleSourceId: string;
};

export type IngestIdentityOverride = {
  releaseArtist: string;
  releaseTitle: string;
  evidence: IngestEvidence[];
};

const artistTagKeys = [
  "album_artist",
  "albumartist",
  "album artist",
  "artist",
] as const;

const titleTagKeys = [
  "album",
  "album_title",
  "album title",
] as const;

function normalizedTagKey(value: string): string {
  return value.trim().toLowerCase();
}

function humanizeIdentityText(value: string): string {
  return value
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d+)/g, "$1 $2")
    .replace(/(\d+)([A-Za-z])/g, "$1 $2")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      if (/^[A-Z0-9]{2,5}$/.test(part)) {
        return part;
      }

      if (/^\d+$/.test(part)) {
        return part;
      }

      return `${part.charAt(0).toUpperCase()}${part
        .slice(1)
        .toLowerCase()}`;
    })
    .join(" ");
}

function candidateIdentityStem(
  inspection: IngestCandidateInspection,
): string {
  const source = inspection.candidate.name.replace(
    /\.[^.]+$/,
    "",
  );

  return source
    .replace(/^\d{4}[-_]\d{2}[-_]\d{2}[-_\s]*/, "")
    .replace(/^\d{8}[-_\s]*/, "")
    .replace(/^\d{6}[-_\s]*/, "")
    .replace(/^[-_\s]+|[-_\s]+$/g, "");
}

export function candidateIdentitySegments(
  inspection: IngestCandidateInspection,
): string[] {
  const stem = candidateIdentityStem(inspection);

  if (!stem) {
    return [];
  }

  const separator = stem.includes("_")
    ? /_+/
    : /\s+-\s+/.test(stem)
      ? /\s+-\s+/
      : stem.includes("-")
        ? /-+/
        : /\s+/;

  return stem
    .split(separator)
    .map((segment) => humanizeIdentityText(segment))
    .filter(Boolean);
}

function folderRangeOptions(
  inspection: IngestCandidateInspection,
): IngestIdentitySourceOption[] {
  const segments = candidateIdentitySegments(inspection);
  const ranges = new Map<string, [number, number]>();

  for (let index = 0; index < segments.length; index += 1) {
    ranges.set(`${index}:${index}`, [index, index]);
  }

  if (segments.length <= 6) {
    for (let start = 0; start < segments.length; start += 1) {
      for (let end = start + 1; end < segments.length; end += 1) {
        ranges.set(`${start}:${end}`, [start, end]);
      }
    }
  } else {
    for (let end = 1; end < segments.length; end += 1) {
      ranges.set(`0:${end}`, [0, end]);
    }

    for (let start = 1; start < segments.length; start += 1) {
      ranges.set(
        `${start}:${segments.length - 1}`,
        [start, segments.length - 1],
      );
    }
  }

  return [...ranges.values()].map(([start, end]) => {
    const value = segments.slice(start, end + 1).join(" ");
    const fieldLabel =
      start === end
        ? `Folder field ${start + 1}`
        : `Folder fields ${start + 1}–${end + 1}`;

    return {
      id: `folder:${start}:${end}`,
      label: `${fieldLabel} — ${value}`,
      value,
      origin: "folder",
      source: "foldername",
      rawValue: inspection.candidate.name,
      confidence: "medium",
      rule: "folder-identity-field-range-v1",
    };
  });
}

function embeddedIdentityOptions(
  files: IngestFileInspection[],
  keys: readonly string[],
): IngestIdentitySourceOption[] {
  const audioFiles = files.filter(
    (file) => file.mediaKind === "audio",
  );
  const allowedKeys = new Set(keys.map(normalizedTagKey));
  const values = new Map<
    string,
    {
      key: string;
      value: string;
      count: number;
    }
  >();

  for (const file of audioFiles) {
    for (const [key, rawValue] of Object.entries(
      file.embeddedMetadata,
    )) {
      const normalizedKey = normalizedTagKey(key);
      const value = rawValue.trim();

      if (!allowedKeys.has(normalizedKey) || !value) {
        continue;
      }

      const identityKey = `${normalizedKey}\u0000${value.toLocaleLowerCase()}`;
      const current = values.get(identityKey);

      values.set(identityKey, {
        key,
        value,
        count: (current?.count ?? 0) + 1,
      });
    }
  }

  return [...values.values()]
    .sort((left, right) => {
      const keyOrder =
        keys.indexOf(normalizedTagKey(left.key)) -
        keys.indexOf(normalizedTagKey(right.key));

      return (
        keyOrder ||
        right.count - left.count ||
        left.value.localeCompare(right.value, undefined, {
          sensitivity: "base",
        })
      );
    })
    .map((item) => ({
      id: `embedded:${normalizedTagKey(item.key)}:${encodeURIComponent(
        item.value,
      )}`,
      label: `Embedded ${item.key.toUpperCase()} (${item.count}/${audioFiles.length}) — ${item.value}`,
      value: item.value,
      origin: "embedded" as const,
      source: "embedded-tag" as const,
      rawValue: item.value,
      confidence:
        item.count === audioFiles.length ? "high" : "medium",
      rule: "embedded-release-identity-v1",
    }));
}

function currentEvidenceOption(
  evidence: IngestEvidence[],
  field: IngestIdentityField,
): IngestIdentitySourceOption | undefined {
  const current = evidence.find((item) => item.field === field);

  if (!current) {
    return undefined;
  }

  const value = String(current.value).trim();

  if (!value) {
    return undefined;
  }

  return {
    id: `current:${field}`,
    label: `Current inference — ${value}`,
    value,
    origin: "current",
    source: current.source,
    rawValue: current.rawValue,
    confidence: current.confidence,
    rule: current.rule,
  };
}

function findPreferredEmbeddedOption(
  options: IngestIdentitySourceOption[],
  preferredKeys: readonly string[],
): IngestIdentitySourceOption | undefined {
  return preferredKeys
    .map((key) =>
      options.find((option) =>
        option.id.startsWith(
          `embedded:${normalizedTagKey(key)}:`,
        ),
      ),
    )
    .find(Boolean);
}

export function buildIngestIdentitySourcePlan(
  inspection: IngestCandidateInspection,
): IngestIdentitySourcePlan {
  const folderOptions = folderRangeOptions(inspection);
  const embeddedArtistOptions = embeddedIdentityOptions(
    inspection.files,
    artistTagKeys,
  );
  const embeddedTitleOptions = embeddedIdentityOptions(
    inspection.files,
    inspection.candidate.kind === "loose-file" ||
      inspection.candidate.audioCount === 1
      ? [...titleTagKeys, "title"]
      : titleTagKeys,
  );
  const currentArtist = currentEvidenceOption(
    inspection.candidate.evidence,
    "release.artist",
  );
  const currentTitle = currentEvidenceOption(
    inspection.candidate.evidence,
    "release.title",
  );
  const blankArtist: IngestIdentitySourceOption = {
    id: "blank:release.artist",
    label: "Do not infer a release artist",
    value: "",
    origin: "blank",
  };
  const fallbackTitle: IngestIdentitySourceOption = {
    id: "candidate:display-title",
    label: `Candidate display title — ${inspection.candidate.displayTitle}`,
    value: inspection.candidate.displayTitle,
    origin: "current",
    source: "foldername",
    rawValue: inspection.candidate.name,
    confidence: "low",
    rule: "candidate-display-title-fallback-v1",
  };
  const artistOptions = [
    blankArtist,
    ...(currentArtist ? [currentArtist] : []),
    ...embeddedArtistOptions,
    ...folderOptions,
  ];
  const titleOptions = [
    ...(currentTitle ? [currentTitle] : []),
    ...embeddedTitleOptions,
    ...folderOptions,
    fallbackTitle,
  ];
  const preferredArtist =
    findPreferredEmbeddedOption(embeddedArtistOptions, [
      "album_artist",
      "albumartist",
      "album artist",
      "artist",
    ]) ?? currentArtist;
  const preferredTitle =
    findPreferredEmbeddedOption(embeddedTitleOptions, [
      "album",
      "album_title",
      "album title",
    ]) ??
    currentTitle ??
    folderOptions.find((option) =>
      option.id ===
      `folder:0:${Math.max(
        candidateIdentitySegments(inspection).length - 1,
        0,
      )}`,
    ) ??
    fallbackTitle;

  return {
    artistOptions,
    titleOptions,
    defaultArtistSourceId:
      preferredArtist?.id ?? blankArtist.id,
    defaultTitleSourceId: preferredTitle.id,
  };
}

function evidenceForSelection(
  field: IngestIdentityField,
  option: IngestIdentitySourceOption,
): IngestEvidence | undefined {
  if (!option.value.trim() || !option.source) {
    return undefined;
  }

  return {
    field,
    value: option.value,
    source: option.source,
    rawValue: option.rawValue ?? option.value,
    confidence:
      option.origin === "folder" && field === "release.artist"
        ? "low"
        : (option.confidence ?? "medium"),
    rule: `selected-${
      option.rule ?? "release-identity-v1"
    }`,
  };
}

export function selectIngestIdentityOverride(
  plan: IngestIdentitySourcePlan,
  artistSourceId: string,
  titleSourceId: string,
): IngestIdentityOverride {
  const artist =
    plan.artistOptions.find(
      (option) => option.id === artistSourceId,
    ) ??
    plan.artistOptions.find(
      (option) => option.id === plan.defaultArtistSourceId,
    );
  const title =
    plan.titleOptions.find(
      (option) => option.id === titleSourceId,
    ) ??
    plan.titleOptions.find(
      (option) => option.id === plan.defaultTitleSourceId,
    );

  if (!artist || !title || !title.value.trim()) {
    throw new Error(
      "A valid release-title source is required.",
    );
  }

  return {
    releaseArtist: artist.value.trim(),
    releaseTitle: title.value.trim(),
    evidence: [
      evidenceForSelection("release.artist", artist),
      evidenceForSelection("release.title", title),
    ].filter(
      (item): item is IngestEvidence => item !== undefined,
    ),
  };
}

export function mergeIngestIdentityEvidence(
  evidence: IngestEvidence[],
  override: IngestIdentityOverride,
): IngestEvidence[] {
  return [
    ...evidence.filter(
      (item) =>
        item.field !== "release.artist" &&
        item.field !== "release.title",
    ),
    ...override.evidence,
  ];
}
