export type NamedPerformerDisplayRecord = {
  name: string;
};

function normalizePerformerDisplayName(
  value: string,
): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

/**
 * Place the release primary artist first in performer presentation while
 * preserving the authored/source order for every other credited person.
 */
export function prioritizeReleaseArtistDisplay<
  T extends NamedPerformerDisplayRecord,
>(
  records: readonly T[],
  releasePrimaryArtistName: string,
): T[] {
  const normalizedReleaseArtist =
    normalizePerformerDisplayName(
      releasePrimaryArtistName,
    );

  if (!normalizedReleaseArtist) {
    return [...records];
  }

  return records
    .map((record, sourceIndex) => ({
      record,
      sourceIndex,
      isReleaseArtist:
        normalizePerformerDisplayName(
          record.name,
        ) === normalizedReleaseArtist,
    }))
    .sort((left, right) => {
      if (
        left.isReleaseArtist !==
        right.isReleaseArtist
      ) {
        return left.isReleaseArtist ? -1 : 1;
      }

      return (
        left.sourceIndex -
        right.sourceIndex
      );
    })
    .map(({ record }) => record);
}
