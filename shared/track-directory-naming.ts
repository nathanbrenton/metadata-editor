export type ParsedTrackDirectoryId = {
  prefix: string;
  numberText: string;
  suffix: string;
  trackNumber: number;
};

const trackDirectoryIdPattern =
  /^(.*)_([0-9]{1,3})_(.+)$/;

/**
 * Parse the existing artist_number_title directory convention without
 * changing the stable artist/title portions of the identifier.
 */
export function parseTrackDirectoryId(
  trackId: string,
): ParsedTrackDirectoryId | null {
  const match = trackDirectoryIdPattern.exec(
    trackId.trim(),
  );

  if (!match) {
    return null;
  }

  const trackNumber = Number.parseInt(
    match[2] ?? "",
    10,
  );

  if (
    !Number.isSafeInteger(trackNumber) ||
    trackNumber < 1 ||
    trackNumber > 999
  ) {
    return null;
  }

  return {
    prefix: match[1] ?? "",
    numberText: match[2] ?? "",
    suffix: match[3] ?? "",
    trackNumber,
  };
}

/**
 * Replace only the numeric sequence segment. At least two digits are used,
 * while existing three-digit projects retain their established width.
 */
export function buildTrackDirectoryIdForNumber(
  trackId: string,
  trackNumber: number,
): string | null {
  if (
    !Number.isSafeInteger(trackNumber) ||
    trackNumber < 1 ||
    trackNumber > 999
  ) {
    return null;
  }

  const parsed = parseTrackDirectoryId(trackId);

  if (!parsed) {
    return null;
  }

  const width = Math.max(
    2,
    parsed.numberText.length,
    String(trackNumber).length,
  );

  return `${parsed.prefix}_${String(trackNumber).padStart(width, "0")}_${parsed.suffix}`;
}
