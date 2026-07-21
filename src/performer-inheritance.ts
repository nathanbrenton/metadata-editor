export type PerformerInheritanceRecord = {
  key: string;
  sourceIndex: number | null;
  name: string;
  role: string;
  sortName: string;
};

export type EffectivePerformerRecords = {
  mode: "release" | "track";
  effective: PerformerInheritanceRecord[];
};

function cloneAsLocalOverride(
  records: readonly PerformerInheritanceRecord[],
): PerformerInheritanceRecord[] {
  return records.map((record, index) => ({
    ...record,
    key: `inherited-override-${index}-${record.key}`,
    sourceIndex: null,
  }));
}

/*
 * An empty local performer array means "use the release baseline". A
 * non-empty local array is a complete track-level override. This allows one
 * track to remove or add individual people without introducing tombstones.
 */
export function resolveEffectivePerformerRecords(
  releaseRecords: readonly PerformerInheritanceRecord[],
  trackRecords: readonly PerformerInheritanceRecord[],
): EffectivePerformerRecords {
  return trackRecords.length > 0
    ? {
        mode: "track",
        effective: [...trackRecords],
      }
    : {
        mode: "release",
        effective: [...releaseRecords],
      };
}

export function createTrackPerformerOverride(
  releaseRecords: readonly PerformerInheritanceRecord[],
): PerformerInheritanceRecord[] {
  return cloneAsLocalOverride(releaseRecords);
}
