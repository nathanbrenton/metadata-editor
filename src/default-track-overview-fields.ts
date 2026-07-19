/*
 * Core authored musical-analysis fields remain discoverable in the track
 * Overview even before their optional TOML paths have been created.
 */
export const defaultTrackOverviewFieldPaths = [
  "track.audio.bpm",
  "track.audio.key",
  "track.audio.camelot_key",
  "track.audio.time_signature",
  "track.audio.tuning_hz",
] as const;

const defaultTrackOverviewFieldPathSet =
  new Set<string>(
    defaultTrackOverviewFieldPaths,
  );

export function isDefaultTrackOverviewFieldPath(
  path: string,
): boolean {
  return defaultTrackOverviewFieldPathSet.has(
    path,
  );
}

export function shouldShowDefaultTrackOverviewFields({
  scope,
  filename,
  activeTab,
}: {
  scope: string;
  filename: string;
  activeTab: string;
}): boolean {
  return (
    scope === "track" &&
    filename === "track.toml" &&
    activeTab === "overview"
  );
}

export type MissingTrackOverviewFieldPresentation = {
  generatedValue: string | null;
  generatedNote: string | null;
  actionLabel: string;
};

/*
 * Camelot Key is derived from the authored musical Key until a local Camelot
 * path is created. Present that effective value beside an explicit override
 * action instead of making the row look entirely unset.
 */
export function getMissingTrackOverviewFieldPresentation({
  path,
  label,
  initialValue,
}: {
  path: string;
  label: string;
  initialValue: unknown;
}): MissingTrackOverviewFieldPresentation {
  const generatedCamelot =
    path === "track.audio.camelot_key" &&
    typeof initialValue === "string" &&
    initialValue.trim()
      ? initialValue.trim()
      : null;

  return {
    generatedValue: generatedCamelot,
    generatedNote: generatedCamelot
      ? "Generated from Key"
      : null,
    actionLabel: generatedCamelot
      ? "Override Camelot Key"
      : `Add ${label}`,
  };
}
