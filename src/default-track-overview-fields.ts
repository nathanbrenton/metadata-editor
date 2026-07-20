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

/*
 * Sort Title is a derived identity default. Keep it visible in track Overview
 * even when an older track.toml does not yet contain the optional path.
 */
export const defaultTrackIdentityFieldPaths = [
  "track.sort_title",
] as const;

const defaultTrackIdentityFieldPathSet =
  new Set<string>(
    defaultTrackIdentityFieldPaths,
  );

export function isDefaultTrackIdentityFieldPath(
  path: string,
): boolean {
  return defaultTrackIdentityFieldPathSet.has(
    path,
  );
}

export function isDefaultTrackOverviewFieldPath(
  path: string,
): boolean {
  return defaultTrackOverviewFieldPathSet.has(
    path,
  );
}

/*
 * Existing and not-yet-created Musical Analysis rows share this one slot
 * order so creating an optional field replaces its Add row in place.
 */
export function getDefaultTrackOverviewFieldOrder(
  path: string,
): number {
  const fieldIndex =
    defaultTrackOverviewFieldPaths.indexOf(
      path as
        (typeof defaultTrackOverviewFieldPaths)[number],
    );

  return fieldIndex >= 0
    ? fieldIndex
    : Number.MAX_SAFE_INTEGER;
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
