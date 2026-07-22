import { camelotKeyForMusicalKey } from "../shared/musical-analysis.js";
import { formatTrackDisplayTitle } from "../shared/track-title.js";

export type DerivedMetadataValue = string | number | boolean | string[];
export type DerivedMetadataChange = { path: string; value: DerivedMetadataValue };

export type GeneratedTrackSortTitle = {
  value: string;
  source: "Track Display Title" | "Track Title" | null;
};

export type TrackTitleDraftSnapshot = {
  title: string;
  version: string;
  displayTitle: string;
  sortTitle: string;
};

export function deriveTrackTitleDraftChanges({
  current,
  changedPath,
  nextValue,
}: {
  current: TrackTitleDraftSnapshot;
  changedPath:
    | "track.title"
    | "track.version"
    | "track.display_title";
  nextValue: string;
}): DerivedMetadataChange[] {
  const currentGeneratedDisplayTitle = formatTrackDisplayTitle(
    current.title,
    current.version,
  );
  const displayTitleIsGenerated =
    !current.displayTitle.trim() ||
    current.displayTitle.trim() === currentGeneratedDisplayTitle;
  const currentGeneratedSortTitle = generateTrackSortTitle({
    title: current.title,
    version: current.version,
    displayTitle: current.displayTitle,
  }).value;
  const sortTitleIsGenerated =
    !current.sortTitle.trim() ||
    current.sortTitle.trim() === currentGeneratedSortTitle;

  const next = { ...current };
  if (changedPath === "track.title") next.title = nextValue;
  if (changedPath === "track.version") next.version = nextValue;
  if (changedPath === "track.display_title") {
    next.displayTitle = nextValue;
  }

  const changes: DerivedMetadataChange[] = [];

  // Keep the display title live only while it still matches the generated form.
  if (
    changedPath !== "track.display_title" &&
    displayTitleIsGenerated
  ) {
    const nextDisplayTitle = formatTrackDisplayTitle(
      next.title,
      next.version,
    );
    if (nextDisplayTitle !== current.displayTitle) {
      changes.push({
        path: "track.display_title",
        value: nextDisplayTitle,
      });
    }
    next.displayTitle = nextDisplayTitle;
  }

  // Keep the sort title synchronized only while it still follows the
  // generated display/title fallback. A custom sort value remains untouched.
  if (sortTitleIsGenerated) {
    const nextSortTitle = generateTrackSortTitle({
      title: next.title,
      version: next.version,
      displayTitle: next.displayTitle,
    }).value;
    if (nextSortTitle !== current.sortTitle) {
      changes.push({
        path: "track.sort_title",
        value: nextSortTitle,
      });
    }
  }

  return changes;
}

/*
 * Prefer the display-ready title for sorting. When no authored display title
 * exists, preserve a version suffix through the generated display-title form;
 * simple titles still report Track Title as their source.
 */
export function generateTrackSortTitle({
  title,
  version,
  displayTitle,
}: {
  title: string;
  version: string;
  displayTitle: string;
}): GeneratedTrackSortTitle {
  const authoredDisplayTitle = displayTitle.trim();

  if (authoredDisplayTitle) {
    return {
      value: authoredDisplayTitle,
      source: "Track Display Title",
    };
  }

  const normalizedTitle = title.trim();
  const generatedDisplayTitle = formatTrackDisplayTitle(
    normalizedTitle,
    version,
  );

  if (!generatedDisplayTitle) {
    return { value: "", source: null };
  }

  return {
    value: generatedDisplayTitle,
    source:
      generatedDisplayTitle !== normalizedTitle
        ? "Track Display Title"
        : "Track Title",
  };
}

function stringValue(values: ReadonlyMap<string, DerivedMetadataValue>, path: string): string {
  const value = values.get(path);
  return typeof value === "string" ? value : "";
}

export function deriveTrackSaveChanges(
  existing: ReadonlyMap<string, DerivedMetadataValue>,
  authoredChanges: readonly DerivedMetadataChange[],
): { changes: DerivedMetadataChange[]; createChanges: DerivedMetadataChange[] } {
  const changes = authoredChanges.map((change) => ({ ...change }));
  const createChanges: DerivedMetadataChange[] = [];
  const next = new Map(existing);
  for (const change of changes) next.set(change.path, change.value);
  const authoredPaths = new Set(changes.map((change) => change.path));

  // Keep a generated display title current unless the user authored a custom one.
  if (!authoredPaths.has("track.display_title")) {
    const oldTitle = stringValue(existing, "track.title");
    const oldVersion = stringValue(existing, "track.version");
    const oldGenerated = formatTrackDisplayTitle(oldTitle, oldVersion);
    const newGenerated = formatTrackDisplayTitle(
      stringValue(next, "track.title"),
      stringValue(next, "track.version"),
    );
    const hasDisplay = existing.has("track.display_title");
    const currentDisplay = stringValue(existing, "track.display_title");
    if (newGenerated && (!currentDisplay.trim() || currentDisplay.trim() === oldGenerated)) {
      const derived = { path: "track.display_title", value: newGenerated };
      (hasDisplay ? changes : createChanges).push(derived);
      next.set(derived.path, derived.value);
    }
  }

  // Keep Sort Title synchronized only while it is blank or still matches
  // the previous generated fallback. Deliberately authored sort wording wins.
  if (!authoredPaths.has("track.sort_title")) {
    const oldGeneratedSortTitle = generateTrackSortTitle({
      title: stringValue(existing, "track.title"),
      version: stringValue(existing, "track.version"),
      displayTitle: stringValue(existing, "track.display_title"),
    }).value;
    const newGeneratedSortTitle = generateTrackSortTitle({
      title: stringValue(next, "track.title"),
      version: stringValue(next, "track.version"),
      displayTitle: stringValue(next, "track.display_title"),
    }).value;
    const hasSortTitle = existing.has("track.sort_title");
    const currentSortTitle = stringValue(existing, "track.sort_title");

    if (
      newGeneratedSortTitle &&
      (
        !currentSortTitle.trim() ||
        currentSortTitle.trim() === oldGeneratedSortTitle
      )
    ) {
      const derived = {
        path: "track.sort_title",
        value: newGeneratedSortTitle,
      };
      (hasSortTitle ? changes : createChanges).push(derived);
      next.set(derived.path, derived.value);
    }
  }

  // Treat Camelot as a synchronized derivative only while it is blank or
  // still matches the previously generated value; custom values are preserved.
  if (!authoredPaths.has("track.audio.camelot_key")) {
    const oldKey = stringValue(existing, "track.audio.key");
    const newKey = stringValue(next, "track.audio.key");
    const oldMapped = camelotKeyForMusicalKey(oldKey) ?? "";
    const newMapped = camelotKeyForMusicalKey(newKey) ?? "";
    const hasCamelot = existing.has("track.audio.camelot_key");
    const currentCamelot = stringValue(existing, "track.audio.camelot_key");
    if (newMapped && (!currentCamelot.trim() || currentCamelot === oldMapped)) {
      const derived = { path: "track.audio.camelot_key", value: newMapped };
      (hasCamelot ? changes : createChanges).push(derived);
    } else if (!newMapped && hasCamelot && oldMapped && currentCamelot === oldMapped) {
      changes.push({ path: "track.audio.camelot_key", value: "" });
    }
  }

  return { changes, createChanges };
}
