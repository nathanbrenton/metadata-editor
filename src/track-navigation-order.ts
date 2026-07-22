export type TrackNavigationCandidate = {
  trackId: string;
  sourceIndex: number;
  trackNumber: number | null;
  discNumber: number | null;
};

export type TrackNumberConflict = {
  discNumber: number;
  trackNumber: number;
  trackIds: string[];
};

export type TrackNavigationEntry =
  TrackNavigationCandidate & {
    effectiveDiscNumber: number;
    hasNumberConflict: boolean;
  };

export type TrackNavigationOrder = {
  entries: TrackNavigationEntry[];
  conflicts: TrackNumberConflict[];
};

function positiveIntegerOrNull(
  value: number | null,
): number | null {
  return value !== null &&
    Number.isSafeInteger(value) &&
    value > 0
    ? value
    : null;
}

/*
 * Track numbers are presentation order, not identity. Keep the scanner order
 * as a deterministic tie-breaker so duplicate or missing numbers never cause
 * unstable navigation between renders.
 */
export function buildTrackNavigationOrder(
  candidates: readonly TrackNavigationCandidate[],
): TrackNavigationOrder {
  const normalized = candidates.map(
    (candidate) => ({
      ...candidate,
      trackNumber: positiveIntegerOrNull(
        candidate.trackNumber,
      ),
      effectiveDiscNumber:
        positiveIntegerOrNull(
          candidate.discNumber,
        ) ?? 1,
    }),
  );
  const conflictGroups = new Map<
    string,
    TrackNumberConflict
  >();

  for (const candidate of normalized) {
    if (candidate.trackNumber === null) {
      continue;
    }

    const key = `${candidate.effectiveDiscNumber}:${candidate.trackNumber}`;
    const existing = conflictGroups.get(key);

    if (existing) {
      existing.trackIds.push(candidate.trackId);
    } else {
      conflictGroups.set(key, {
        discNumber:
          candidate.effectiveDiscNumber,
        trackNumber: candidate.trackNumber,
        trackIds: [candidate.trackId],
      });
    }
  }

  const conflicts = Array.from(
    conflictGroups.values(),
  )
    .filter(
      (conflict) =>
        conflict.trackIds.length > 1,
    )
    .sort(
      (left, right) =>
        left.discNumber - right.discNumber ||
        left.trackNumber - right.trackNumber,
    );
  const conflictingTrackIds = new Set(
    conflicts.flatMap(
      (conflict) => conflict.trackIds,
    ),
  );

  return {
    entries: normalized
      .map((candidate) => ({
        ...candidate,
        hasNumberConflict:
          conflictingTrackIds.has(
            candidate.trackId,
          ),
      }))
      .sort((left, right) => {
        const discDifference =
          left.effectiveDiscNumber -
          right.effectiveDiscNumber;

        if (discDifference !== 0) {
          return discDifference;
        }

        if (
          left.trackNumber !== null &&
          right.trackNumber !== null
        ) {
          const trackDifference =
            left.trackNumber -
            right.trackNumber;

          if (trackDifference !== 0) {
            return trackDifference;
          }
        } else if (
          left.trackNumber !== null
        ) {
          return -1;
        } else if (
          right.trackNumber !== null
        ) {
          return 1;
        }

        return (
          left.sourceIndex -
            right.sourceIndex ||
          left.trackId.localeCompare(
            right.trackId,
          )
        );
      }),
    conflicts,
  };
}
