export type PerformerCopyTrackOptionLike = {
  trackId: string;
};

export type PerformerCopyTrackRangeMode =
  | "replace"
  | "add"
  | "remove";

export function getInclusiveTrackRange(
  trackOptions: readonly PerformerCopyTrackOptionLike[],
  startTrackId: string,
  endTrackId: string,
): string[] {
  const startIndex = trackOptions.findIndex(
    (option) => option.trackId === startTrackId,
  );
  const endIndex = trackOptions.findIndex(
    (option) => option.trackId === endTrackId,
  );

  if (startIndex < 0 || endIndex < 0) {
    return [];
  }

  const lowerIndex = Math.min(startIndex, endIndex);
  const upperIndex = Math.max(startIndex, endIndex);

  return trackOptions
    .slice(lowerIndex, upperIndex + 1)
    .map((option) => option.trackId);
}

export function applyTrackRangeSelection(
  trackOptions: readonly PerformerCopyTrackOptionLike[],
  selectedTrackIds: readonly string[],
  rangeTrackIds: readonly string[],
  mode: PerformerCopyTrackRangeMode,
): string[] {
  const selected = new Set(selectedTrackIds);
  const range = new Set(rangeTrackIds);

  if (mode === "replace") {
    return trackOptions
      .filter((option) => range.has(option.trackId))
      .map((option) => option.trackId);
  }

  if (mode === "add") {
    return trackOptions
      .filter(
        (option) =>
          selected.has(option.trackId) ||
          range.has(option.trackId),
      )
      .map((option) => option.trackId);
  }

  return trackOptions
    .filter(
      (option) =>
        selected.has(option.trackId) &&
        !range.has(option.trackId),
    )
    .map((option) => option.trackId);
}
