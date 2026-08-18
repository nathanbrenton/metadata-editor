import type {
  ListenerMetadataRelease,
  ListenerMetadataTrack,
} from "@hiplingo/media-player";

type UnknownRecord = Record<string, unknown>;

export type LibraryMetadataPreviewDocument = {
  filename: string;
  trackId?: string;
  parsed: UnknownRecord;
};

export type LibraryMetadataPreviewDetail = {
  documents: LibraryMetadataPreviewDocument[];
  warnings?: string[];
};

export type LibraryMetadataPreviewRelease = {
  id: string;
  title: string;
  artist: string | null;
  releaseDate: string | null;
};

export type LibraryMetadataPreviewWaveform = {
  sampleRate: number;
  sourceChannels: number;
  bitsPerSample: number;
  peaksPerSecond: number;
  durationSeconds: number;
} | null;

function isRecord(
  value: unknown,
): value is UnknownRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function cloneRecord(
  value: unknown,
): UnknownRecord {
  return isRecord(value)
    ? { ...value }
    : {};
}

function deepMerge(
  left: UnknownRecord,
  right: UnknownRecord,
): UnknownRecord {
  const result: UnknownRecord = {
    ...left,
  };

  for (
    const [key, value]
    of Object.entries(right)
  ) {
    if (
      isRecord(result[key]) &&
      isRecord(value)
    ) {
      result[key] = deepMerge(
        result[key] as UnknownRecord,
        value,
      );
    } else {
      result[key] = value;
    }
  }

  return result;
}

function readDocumentRoot(
  documents: LibraryMetadataPreviewDocument[],
  filename: string,
  trackId: string | undefined,
  preferredKeys: string[],
): UnknownRecord {
  const document = documents.find(
    (candidate) =>
      candidate.filename === filename &&
      (
        trackId === undefined ||
        candidate.trackId === trackId
      ),
  );

  if (!document) {
    return {};
  }

  for (const key of preferredKeys) {
    const nested = document.parsed[key];

    if (isRecord(nested)) {
      return cloneRecord(nested);
    }
  }

  return cloneRecord(document.parsed);
}

function readString(
  record: UnknownRecord,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = record[key];

    if (
      typeof value === "string" &&
      value.trim()
    ) {
      return value.trim();
    }
  }

  return null;
}

function readStringArray(
  record: UnknownRecord,
  keys: string[],
): string[] {
  for (const key of keys) {
    const value = record[key];

    if (Array.isArray(value)) {
      return value.flatMap((entry) =>
        typeof entry === "string" &&
        entry.trim()
          ? [entry.trim()]
          : [],
      );
    }

    if (
      typeof value === "string" &&
      value.trim()
    ) {
      return value
        .split(/[,;]+/)
        .map((entry) => entry.trim())
        .filter(Boolean);
    }
  }

  return [];
}

function normalizeCreditList(
  value: unknown,
): UnknownRecord[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const name = readString(
      entry,
      ["name"],
    );

    if (!name) {
      return [];
    }

    return [{
      ...entry,
      name,
      role: readString(
        entry,
        ["role"],
      ),
      provenance: [{
        method: "manual",
        scope: "track",
      }],
    }];
  });
}

function normalizeCredits(
  trackCredits: UnknownRecord,
): UnknownRecord {
  const nestedCredits =
    isRecord(trackCredits.credits)
      ? trackCredits.credits
      : {};

  const source = deepMerge(
    trackCredits,
    nestedCredits,
  );

  return {
    performers:
      normalizeCreditList(
        source.performers,
      ),
    contributors:
      normalizeCreditList(
        source.contributors,
      ),
    arrangers:
      normalizeCreditList(
        source.arrangers,
      ),
    composers:
      normalizeCreditList(
        source.composers,
      ),
    songwriters:
      normalizeCreditList(
        source.songwriters,
      ),
    lyricists:
      normalizeCreditList(
        source.lyricists,
      ),
    remixers:
      normalizeCreditList(
        source.remixers,
      ),
    featuredArtists:
      normalizeCreditList(
        source.featured_artists ??
        source.featuredArtists,
      ),
    publishing:
      source.publishing ??
      (
        source.publishers
          ? {
              publishers:
                source.publishers,
            }
          : null
      ),
  };
}

function resolveInheritedArray(
  trackRecord: UnknownRecord,
  releaseRecord: UnknownRecord,
  keys: string[],
): {
  values: string[];
  source:
    | "track"
    | "release"
    | "missing";
} {
  const trackValues =
    readStringArray(
      trackRecord,
      keys,
    );

  if (trackValues.length > 0) {
    return {
      values: trackValues,
      source: "track",
    };
  }

  const releaseValues =
    readStringArray(
      releaseRecord,
      keys,
    );

  if (releaseValues.length > 0) {
    return {
      values: releaseValues,
      source: "release",
    };
  }

  return {
    values: [],
    source: "missing",
  };
}

export function buildLibraryMetadataPreview({
  detail,
  release,
  trackId,
  trackTitle,
  trackArtist,
  waveform,
}: {
  detail: LibraryMetadataPreviewDetail;
  release: LibraryMetadataPreviewRelease;
  trackId: string;
  trackTitle: string;
  trackArtist: string | null;
  waveform: LibraryMetadataPreviewWaveform;
}): {
  release: ListenerMetadataRelease;
  track: ListenerMetadataTrack;
} {
  const releaseRecord =
    readDocumentRoot(
      detail.documents,
      "release.toml",
      undefined,
      ["release"],
    );

  const trackRecord =
    readDocumentRoot(
      detail.documents,
      "track.toml",
      trackId,
      ["track"],
    );

  const creditDocument =
    readDocumentRoot(
      detail.documents,
      "track-credits.toml",
      trackId,
      ["track", "credits"],
    );

  const creditRecord =
    deepMerge(
      trackRecord,
      creditDocument,
    );

  const releaseProduction =
    readDocumentRoot(
      detail.documents,
      "release-production-notes.toml",
      undefined,
      ["production", "release"],
    );

  const trackProduction =
    readDocumentRoot(
      detail.documents,
      "track-production-notes.toml",
      trackId,
      ["production", "track"],
    );

  const releaseEmbeddedProduction =
    isRecord(
      releaseRecord.production,
    )
      ? releaseRecord.production
      : {};

  const trackEmbeddedProduction =
    isRecord(
      trackRecord.production,
    )
      ? trackRecord.production
      : {};

  const production =
    deepMerge(
      deepMerge(
        releaseEmbeddedProduction,
        releaseProduction,
      ),
      deepMerge(
        trackEmbeddedProduction,
        trackProduction,
      ),
    );

  const credits =
    normalizeCredits(
      creditRecord,
    );

  const explicitTrackArtist =
    readString(
      trackRecord,
      [
        "artist",
        "primary_artist",
      ],
    ) ??
    trackArtist;

  const resolvedArtist =
    explicitTrackArtist ??
    release.artist;

  const artistSource =
    explicitTrackArtist
      ? "track" as const
      : release.artist
        ? "release" as const
        : "missing" as const;

  const trackLanguage =
    readString(
      trackRecord,
      ["language"],
    );

  const releaseLanguage =
    readString(
      releaseRecord,
      ["language"],
    );

  const languageValue =
    trackLanguage ??
    releaseLanguage;

  const languageSource =
    trackLanguage
      ? "track" as const
      : releaseLanguage
        ? "release" as const
        : "missing" as const;

  const genres =
    resolveInheritedArray(
      trackRecord,
      releaseRecord,
      ["genres", "genre"],
    );

  const styles =
    resolveInheritedArray(
      trackRecord,
      releaseRecord,
      ["styles", "style"],
    );

  const moods =
    resolveInheritedArray(
      trackRecord,
      releaseRecord,
      ["moods", "mood"],
    );

  const tags =
    resolveInheritedArray(
      trackRecord,
      releaseRecord,
      ["tags", "tag"],
    );

  const releaseCredits =
    isRecord(releaseRecord.credits)
      ? releaseRecord.credits
      : {};

  const waveformRecord =
    waveform
      ? {
          sampleRate:
            waveform.sampleRate,
          sourceChannels:
            waveform.sourceChannels,
          bitsPerSample:
            waveform.bitsPerSample,
          peaksPerSecond:
            waveform.peaksPerSecond,
          durationSeconds:
            waveform.durationSeconds,
        }
      : null;

  return {
    release: {
      title: release.title,
      metadata: {
        authored: {
          release:
            releaseRecord,
          productionNotes:
            releaseProduction,
        },
        resolved: {
          release: {
            ...releaseRecord,
            credits:
              releaseCredits,
          },
          production:
            deepMerge(
              releaseEmbeddedProduction,
              releaseProduction,
            ),
        },
        validation: [],
      },
    },

    track: {
      metadata: {
        authored: {
          credits,
          productionNotes:
            trackProduction,
        },
        generated: {
          analysis: null,
          waveform:
            waveformRecord,
        },
        resolved: {
          display: {
            title:
              trackTitle,
            source:
              "authored-fields",
          },

          primaryArtist: {
            name:
              resolvedArtist,
            source:
              artistSource,
          },

          language: {
            value:
              languageValue,
            source:
              languageSource,
          },

          releaseDate: {
            value:
              release.releaseDate,
            source:
              release.releaseDate
                ? "release"
                : "missing",
          },

          genres,
          styles,
          moods,
          tags,

          track:
            trackRecord,
          credits,
          production,
          analysis: null,
          waveform:
            waveformRecord,
        },

        validation: [],
      },
    },
  };
}
