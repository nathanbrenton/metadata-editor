export const lyricsMetadataGroupOrder = [
  "Lyrics",
  "Language & Writing System",
  "Lyrics Rights & Source",
] as const;

export type EffectiveTrackLanguage = {
  value: string;
  source: "Track Language" | "Release Language" | null;
};

export type EffectiveLyricsLanguage = {
  value: string;
  source:
    | "Lyrics Language"
    | "Track Language"
    | "Release Language"
    | null;
  generated: boolean;
};

function normalizeLanguageValue(
  value: string | null | undefined,
): string {
  return value?.trim() ?? "";
}

/*
 * Track Language is local when authored and otherwise falls back to the
 * release language. Keeping this resolution separate from TOML inheritance
 * lets Lyrics Language use the same effective value without copying it.
 */
export function resolveEffectiveTrackLanguage({
  trackLanguage,
  releaseLanguage,
}: {
  trackLanguage?: string | null;
  releaseLanguage?: string | null;
}): EffectiveTrackLanguage {
  const localValue = normalizeLanguageValue(
    trackLanguage,
  );

  if (localValue) {
    return {
      value: localValue,
      source: "Track Language",
    };
  }

  const releaseValue = normalizeLanguageValue(
    releaseLanguage,
  );

  if (releaseValue) {
    return {
      value: releaseValue,
      source: "Release Language",
    };
  }

  return {
    value: "",
    source: null,
  };
}

/*
 * An authored Lyrics Language always wins. A blank or missing value uses the
 * effective Track Language as a generated display default until overridden.
 */
export function resolveEffectiveLyricsLanguage({
  lyricsLanguage,
  trackLanguage,
  releaseLanguage,
}: {
  lyricsLanguage?: string | null;
  trackLanguage?: string | null;
  releaseLanguage?: string | null;
}): EffectiveLyricsLanguage {
  const authoredValue = normalizeLanguageValue(
    lyricsLanguage,
  );

  if (authoredValue) {
    return {
      value: authoredValue,
      source: "Lyrics Language",
      generated: false,
    };
  }

  const effectiveTrackLanguage =
    resolveEffectiveTrackLanguage({
      trackLanguage,
      releaseLanguage,
    });

  return {
    value: effectiveTrackLanguage.value,
    source: effectiveTrackLanguage.value
      ? "Track Language"
      : null,
    generated: Boolean(
      effectiveTrackLanguage.value,
    ),
  };
}
