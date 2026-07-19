/*
 * Track title helpers are shared by folder inference, starter metadata,
 * and the browser editor so all display-title suggestions follow one rule.
 */
export const recommendedTrackVersionOptions = [
  "Original Version",
  "Original Mix",
  "Album Version",
  "Single Version",
  "Radio Edit",
  "Extended Mix",
  "Club Mix",
  "Clean",
  "Explicit",
  "Instrumental",
  "A Cappella",
  "Acoustic",
  "Live",
  "Demo",
  "Remix",
  "Remaster",
  "Re-recording",
  "Mono",
  "Stereo",
] as const;

export type InferredTrackTitleMetadata = {
  title: string;
  version: string;
  displayTitle: string;
};

function normalizeComparableText(
  value: string,
): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

function canonicalRecommendedVersion(
  value: string,
): string | null {
  const normalized =
    normalizeComparableText(value);

  return (
    recommendedTrackVersionOptions.find(
      (option) =>
        normalizeComparableText(option) ===
        normalized,
    ) ?? null
  );
}

function stripReleaseEditionSuffix(
  releaseTitle: string,
): string {
  return releaseTitle
    .trim()
    .replace(
      /\s+(?:remixes|remix collection|versions)$/i,
      "",
    )
    .trim();
}

function isLikelyCustomVersion(
  value: string,
): boolean {
  return /(?:mix|remix|edit|version|instrumental|a cappella|acoustic|live|demo|remaster|re-recording|clean|explicit|mono|stereo)$/i.test(
    value.trim(),
  );
}

function titleAlreadyContainsVersion(
  title: string,
  version: string,
): boolean {
  const normalizedTitle =
    normalizeComparableText(title);
  const normalizedVersion =
    normalizeComparableText(version);

  if (!normalizedVersion) {
    return true;
  }

  return (
    normalizedTitle === normalizedVersion ||
    normalizedTitle.endsWith(
      ` (${normalizedVersion})`,
    ) ||
    normalizedTitle.endsWith(
      ` [${normalizedVersion}]`,
    ) ||
    normalizedTitle.endsWith(
      ` - ${normalizedVersion}`,
    ) ||
    normalizedTitle.endsWith(
      ` – ${normalizedVersion}`,
    ) ||
    normalizedTitle.endsWith(
      ` — ${normalizedVersion}`,
    ) ||
    normalizedTitle.endsWith(
      ` ${normalizedVersion}`,
    )
  );
}

export function formatTrackDisplayTitle(
  title: string,
  version: string,
): string {
  const normalizedTitle = title.trim();
  const normalizedVersion = version.trim();

  if (!normalizedTitle) {
    return "";
  }

  if (
    !normalizedVersion ||
    titleAlreadyContainsVersion(
      normalizedTitle,
      normalizedVersion,
    )
  ) {
    return normalizedTitle;
  }

  return `${normalizedTitle} (${normalizedVersion})`;
}

export function inferTrackTitleMetadata(
  rawTitle: string,
  releaseTitle = "",
): InferredTrackTitleMetadata {
  const normalizedTitle = rawTitle
    .trim()
    .replace(/\s+/g, " ");

  if (!normalizedTitle) {
    return {
      title: "",
      version: "",
      displayTitle: "",
    };
  }

  const parenthesizedMatch =
    normalizedTitle.match(
      /^(.*?)\s*\(([^()]+)\)\s*$/,
    );

  if (parenthesizedMatch) {
    const baseTitle =
      parenthesizedMatch[1]?.trim() ?? "";
    const rawVersion =
      parenthesizedMatch[2]?.trim() ?? "";
    const version =
      canonicalRecommendedVersion(
        rawVersion,
      ) ?? rawVersion;

    if (
      baseTitle &&
      (
        canonicalRecommendedVersion(
          rawVersion,
        ) !== null ||
        isLikelyCustomVersion(rawVersion)
      )
    ) {
      return {
        title: baseTitle,
        version,
        displayTitle:
          formatTrackDisplayTitle(
            baseTitle,
            version,
          ),
      };
    }
  }

  const releaseBase =
    stripReleaseEditionSuffix(
      releaseTitle,
    );

  if (
    releaseBase &&
    normalizeComparableText(
      normalizedTitle,
    ).startsWith(
      `${normalizeComparableText(
        releaseBase,
      )} `,
    )
  ) {
    const customVersion = normalizedTitle
      .slice(releaseBase.length)
      .trim();

    if (
      customVersion &&
      isLikelyCustomVersion(customVersion)
    ) {
      const canonicalVersion =
        canonicalRecommendedVersion(
          customVersion,
        ) ?? customVersion;

      return {
        title: releaseBase,
        version: canonicalVersion,
        displayTitle:
          formatTrackDisplayTitle(
            releaseBase,
            canonicalVersion,
          ),
      };
    }
  }

  const recommendedVersions = [
    ...recommendedTrackVersionOptions,
  ].sort(
    (left, right) =>
      right.length - left.length,
  );

  for (const option of recommendedVersions) {
    const suffix = ` ${option}`;

    if (
      normalizedTitle.length > suffix.length &&
      normalizeComparableText(
        normalizedTitle.slice(
          -suffix.length,
        ),
      ) ===
        normalizeComparableText(suffix)
    ) {
      const baseTitle = normalizedTitle
        .slice(0, -suffix.length)
        .trim();

      if (baseTitle) {
        return {
          title: baseTitle,
          version: option,
          displayTitle:
            formatTrackDisplayTitle(
              baseTitle,
              option,
            ),
        };
      }
    }
  }

  return {
    title: normalizedTitle,
    version: "",
    displayTitle: normalizedTitle,
  };
}
