import type {
  IngestCandidateInspection,
  IngestEvidence,
  IngestFileInspection,
} from "./ingest-types.js";

export type IngestStructureFileHint = {
  sourceRelativePath: string;
  pathWithinCandidate: string;
  topLevelDirectory?: string;
  trackNumber?: number;
  releaseScope: boolean;
  releaseArtworkContainer: boolean;
};

export type IngestStructureAnalysis = {
  files: Map<string, IngestStructureFileHint>;
  uniqueAudioSourceByTrackNumber: Map<number, string>;
  uniqueImageSourceByTrackNumber: Map<number, string>;
  releaseRootImageSources: string[];
  releaseArtworkDirectoryImageSources: string[];
};

function normalizedRelativePath(value: string): string {
  return value
    .replaceAll("\\", "/")
    .replace(/^\/+|\/+$/g, "");
}

export function sourcePathWithinCandidate(
  candidateRelativePath: string,
  sourceRelativePath: string,
): string {
  const candidate = normalizedRelativePath(
    candidateRelativePath,
  );
  const source = normalizedRelativePath(
    sourceRelativePath,
  );

  if (!candidate) {
    return source;
  }

  return source === candidate
    ? ""
    : source.startsWith(`${candidate}/`)
      ? source.slice(candidate.length + 1)
      : source;
}

export function inferTrackNumberFromFolderName(
  value: string,
): number | undefined {
  const normalized = value.trim();
  const patterns = [
    /^0*(\d{1,3})$/,
    /^track[\s._-]*0*(\d{1,3})(?:[\s._-].*)?$/i,
    /^0*(\d{1,3})[\s._-].+$/,
  ];

  for (const pattern of patterns) {
    const match = normalized.match(pattern);

    if (!match) {
      continue;
    }

    const trackNumber = Number(match[1]);

    if (
      Number.isSafeInteger(trackNumber) &&
      trackNumber >= 1 &&
      trackNumber <= 999
    ) {
      return trackNumber;
    }
  }

  return undefined;
}

function isReleaseArtworkDirectoryName(
  value: string,
): boolean {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-");

  return new Set([
    "art",
    "artwork",
    "cover",
    "covers",
    "album-art",
    "release-artwork",
  ]).has(normalized);
}

function hintForFile(
  inspection: IngestCandidateInspection,
  file: IngestFileInspection,
): IngestStructureFileHint {
  const withinCandidate = sourcePathWithinCandidate(
    inspection.candidate.relativePath,
    file.relativePath,
  );
  const segments = withinCandidate
    .split("/")
    .filter(Boolean);
  const topLevelDirectory =
    segments.length > 1 ? segments[0] : undefined;
  const trackNumber = topLevelDirectory
    ? inferTrackNumberFromFolderName(
        topLevelDirectory,
      )
    : undefined;
  const releaseScope = segments.length === 1;
  const releaseArtworkContainer =
    trackNumber === undefined &&
    topLevelDirectory !== undefined &&
    isReleaseArtworkDirectoryName(
      topLevelDirectory,
    );

  return {
    sourceRelativePath: file.relativePath,
    pathWithinCandidate: withinCandidate,
    ...(topLevelDirectory
      ? { topLevelDirectory }
      : {}),
    ...(trackNumber !== undefined
      ? { trackNumber }
      : {}),
    releaseScope,
    releaseArtworkContainer,
  };
}

function uniqueSourceByTrackNumber(
  files: IngestFileInspection[],
  hints: Map<string, IngestStructureFileHint>,
): Map<number, string> {
  const grouped = new Map<number, string[]>();

  for (const file of files) {
    const trackNumber = hints.get(
      file.relativePath,
    )?.trackNumber;

    if (trackNumber === undefined) {
      continue;
    }

    const current = grouped.get(trackNumber) ?? [];
    current.push(file.relativePath);
    grouped.set(trackNumber, current);
  }

  return new Map(
    [...grouped.entries()]
      .filter(([, sources]) => sources.length === 1)
      .map(([trackNumber, sources]) => [
        trackNumber,
        sources[0],
      ]),
  );
}

export function analyzeIngestStructure(
  inspection: IngestCandidateInspection,
): IngestStructureAnalysis {
  const hints = new Map(
    inspection.files.map((file) => [
      file.relativePath,
      hintForFile(inspection, file),
    ]),
  );
  const audioFiles = inspection.files.filter(
    (file) => file.mediaKind === "audio",
  );
  const imageFiles = inspection.files.filter(
    (file) => file.mediaKind === "image",
  );
  const releaseRootImageSources = imageFiles
    .filter(
      (file) =>
        hints.get(file.relativePath)?.releaseScope,
    )
    .map((file) => file.relativePath);
  const releaseArtworkDirectoryImageSources = imageFiles
    .filter(
      (file) =>
        hints.get(file.relativePath)
          ?.releaseArtworkContainer,
    )
    .map((file) => file.relativePath);

  return {
    files: hints,
    uniqueAudioSourceByTrackNumber:
      uniqueSourceByTrackNumber(audioFiles, hints),
    uniqueImageSourceByTrackNumber:
      uniqueSourceByTrackNumber(imageFiles, hints),
    releaseRootImageSources,
    releaseArtworkDirectoryImageSources,
  };
}

function structureEvidenceForFile(
  file: IngestFileInspection,
  analysis: IngestStructureAnalysis,
): IngestEvidence[] {
  const hint = analysis.files.get(
    file.relativePath,
  );

  if (!hint) {
    return [];
  }

  const evidence: IngestEvidence[] = [];

  if (hint.trackNumber !== undefined) {
    evidence.push({
      field:
        file.mediaKind === "image"
          ? "artwork.track_number"
          : "track.number",
      value: hint.trackNumber,
      source: "foldername",
      rawValue: hint.topLevelDirectory ?? "",
      confidence: "high",
      rule: "structure-track-folder-number-v1",
    });

    if (
      file.mediaKind === "image" &&
      analysis.uniqueAudioSourceByTrackNumber.has(
        hint.trackNumber,
      ) &&
      analysis.uniqueImageSourceByTrackNumber.get(
        hint.trackNumber,
      ) === file.relativePath
    ) {
      evidence.push(
        {
          field: "artwork.scope",
          value: "track",
          source: "foldername",
          rawValue: hint.topLevelDirectory ?? "",
          confidence: "high",
          rule: "structure-one-image-one-audio-track-scope-v1",
        },
        {
          field: "artwork.role",
          value: "front_cover",
          source: "foldername",
          rawValue: hint.pathWithinCandidate,
          confidence: "high",
          rule: "structure-single-track-image-front-cover-v1",
        },
      );
    }
  }

  if (
    file.mediaKind === "image" &&
    (hint.releaseScope || hint.releaseArtworkContainer)
  ) {
    evidence.push({
      field: "artwork.scope",
      value: "release",
      source: "foldername",
      rawValue: hint.pathWithinCandidate,
      confidence: hint.releaseScope
        ? "high"
        : "medium",
      rule: hint.releaseScope
        ? "structure-release-root-image-v1"
        : "structure-release-artwork-directory-v1",
    });
  }

  return evidence;
}

export function addIngestStructureEvidence(
  inspection: IngestCandidateInspection,
): IngestCandidateInspection {
  const analysis = analyzeIngestStructure(
    inspection,
  );
  const structuredTrackNumbers = [
    ...analysis.uniqueAudioSourceByTrackNumber.keys(),
  ].sort((left, right) => left - right);
  const candidateEvidence =
    structuredTrackNumbers.length > 0
      ? [
          {
            field: "track.structure",
            value: `${structuredTrackNumbers.length} numbered track folder${
              structuredTrackNumbers.length === 1 ? "" : "s"
            }`,
            source: "foldername" as const,
            rawValue: structuredTrackNumbers
              .map((value) => String(value).padStart(2, "0"))
              .join(", "),
            confidence: "high" as const,
            rule: "structure-numbered-track-folders-v1",
          },
        ]
      : [];

  return {
    ...inspection,
    candidate: {
      ...inspection.candidate,
      evidence: [
        ...inspection.candidate.evidence,
        ...candidateEvidence,
      ],
    },
    files: inspection.files.map((file) => ({
      ...file,
      evidence: [
        ...file.evidence,
        ...structureEvidenceForFile(
          file,
          analysis,
        ),
      ],
    })),
  };
}
