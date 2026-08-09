/*
 * The staging UI already identifies the selected top-level candidate, so rows
 * show paths relative to that candidate instead of repeating its folder name.
 */
export function formatIngestSourceDisplayPath(
  sourceRelativePath: string,
): string {
  const normalized = sourceRelativePath
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "");
  const firstSeparator = normalized.indexOf("/");

  return firstSeparator >= 0
    ? normalized.slice(firstSeparator + 1)
    : normalized;
}

export interface IngestBulkDateTrack {
  sourceRelativePath: string;
  include: boolean;
}

/*
 * Bulk date changes follow the existing Use selection and skip missing
 * sources, matching the disabled state of individual source-date inputs.
 */
export function sourcePathsForBulkDate(
  tracks: readonly IngestBulkDateTrack[],
  missingSourcePaths: ReadonlySet<string>,
): string[] {
  return tracks
    .filter(
      (track) =>
        track.include &&
        !missingSourcePaths.has(
          track.sourceRelativePath,
        ),
    )
    .map((track) => track.sourceRelativePath);
}

/*
 * ISO calendar dates sort chronologically as strings. Invalid or incomplete
 * values are ignored because this is a non-blocking review advisory.
 */
export function sourceDateIsAfterReleaseDate(
  sourceDate: string,
  releaseDate: string,
): boolean {
  const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

  return (
    isoDatePattern.test(sourceDate) &&
    isoDatePattern.test(releaseDate) &&
    sourceDate > releaseDate
  );
}

/*
 * Keep the bulk Source Date aligned with the release date until the user
 * intentionally chooses a different bulk value. This also handles drafts
 * whose release date arrives after the track table first mounts.
 */
export function synchronizeBulkSourceDate(
  currentBulkSourceDate: string,
  previousReleaseDate: string,
  releaseDate: string,
): string {
  const isoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

  if (!isoDatePattern.test(releaseDate)) {
    return currentBulkSourceDate;
  }

  if (
    currentBulkSourceDate === "" ||
    (previousReleaseDate !== "" &&
      currentBulkSourceDate === previousReleaseDate)
  ) {
    return releaseDate;
  }

  return currentBulkSourceDate;
}
