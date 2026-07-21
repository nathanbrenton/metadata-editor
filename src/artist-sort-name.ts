import {
  generateArtistSortName,
} from "../shared/artist-sort-name.js";

export type ArtistSortMetadataValue =
  | string
  | number
  | boolean
  | string[];

export type ArtistSortMetadataChange = {
  path: string;
  value: ArtistSortMetadataValue;
};

type ArtistSortDerivationContext = {
  scope: "release" | "track";
  filename: string;
  releaseArtistName?: string;
};

const releaseArtistNamePath =
  "release.primary_artist.name";
const releaseArtistSortNamePath =
  "release.primary_artist.sort_name";
const trackArtistNamePath =
  "track.primary_artist.name";
const trackArtistSortNamePath =
  "track.primary_artist.sort_name";
const albumArtistNamePattern =
  /^track\.album_artists\[(\d+)\]\.name$/;
const albumArtistSortNamePattern =
  /^track\.album_artists\[(\d+)\]\.sort_name$/;

function stringValue(
  values: ReadonlyMap<
    string,
    ArtistSortMetadataValue
  >,
  path: string,
): string {
  const value = values.get(path);
  return typeof value === "string"
    ? value
    : "";
}

function normalizeArtistIdentity(
  value: string,
): string {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

function artistIdentitiesMatch(
  left: string,
  right: string,
): boolean {
  return (
    normalizeArtistIdentity(left) ===
    normalizeArtistIdentity(right)
  );
}

export function artistNamePathForSortNamePath(
  sortNamePath: string,
): string | null {
  if (
    sortNamePath ===
    releaseArtistSortNamePath
  ) {
    return releaseArtistNamePath;
  }

  if (
    sortNamePath ===
    trackArtistSortNamePath
  ) {
    return trackArtistNamePath;
  }

  const albumArtistMatch =
    sortNamePath.match(
      albumArtistSortNamePattern,
    );

  return albumArtistMatch
    ? `track.album_artists[${albumArtistMatch[1]}].name`
    : null;
}

/*
 * Keep authored sort names authoritative. A generated value is synchronized
 * only while the stored field is blank or still matches the previous local
 * generated value. Matching track/release identities stay blank locally so
 * the existing release-inheritance workflow remains authoritative.
 */
export function deriveArtistSortNameChanges(
  existing: ReadonlyMap<
    string,
    ArtistSortMetadataValue
  >,
  plannedChanges: readonly ArtistSortMetadataChange[],
  context: ArtistSortDerivationContext,
): ArtistSortMetadataChange[] {
  const next = new Map(existing);

  for (const change of plannedChanges) {
    next.set(change.path, change.value);
  }

  const plannedPaths = new Set(
    plannedChanges.map((change) => change.path),
  );
  const derivedChanges: ArtistSortMetadataChange[] = [];

  const synchronizePair = ({
    namePath,
    sortNamePath,
    inheritFromRelease,
  }: {
    namePath: string;
    sortNamePath: string;
    inheritFromRelease: boolean;
  }) => {
    if (
      plannedPaths.has(sortNamePath) ||
      !existing.has(sortNamePath)
    ) {
      return;
    }

    const oldName = stringValue(
      existing,
      namePath,
    );
    const newName = stringValue(
      next,
      namePath,
    );
    const currentSortName = stringValue(
      existing,
      sortNamePath,
    );
    const oldGenerated =
      generateArtistSortName(oldName).value;
    const newGenerated =
      generateArtistSortName(newName).value;

    if (inheritFromRelease) {
      if (
        currentSortName.trim() &&
        oldGenerated &&
        currentSortName.trim() ===
          oldGenerated
      ) {
        derivedChanges.push({
          path: sortNamePath,
          value: "",
        });
      }
      return;
    }

    if (
      newGenerated &&
      (
        !currentSortName.trim() ||
        currentSortName.trim() ===
          oldGenerated
      )
    ) {
      if (currentSortName !== newGenerated) {
        derivedChanges.push({
          path: sortNamePath,
          value: newGenerated,
        });
      }
      return;
    }

    if (
      !newGenerated &&
      oldGenerated &&
      currentSortName.trim() ===
        oldGenerated
    ) {
      derivedChanges.push({
        path: sortNamePath,
        value: "",
      });
    }
  };

  if (
    context.scope === "release" &&
    context.filename === "release.toml"
  ) {
    synchronizePair({
      namePath: releaseArtistNamePath,
      sortNamePath:
        releaseArtistSortNamePath,
      inheritFromRelease: false,
    });
  }

  if (
    context.scope === "track" &&
    context.filename ===
      "track-credits.toml"
  ) {
    const releaseArtistName =
      context.releaseArtistName ?? "";
    const trackArtistName =
      stringValue(next, trackArtistNamePath);

    synchronizePair({
      namePath: trackArtistNamePath,
      sortNamePath:
        trackArtistSortNamePath,
      inheritFromRelease:
        !trackArtistName.trim() ||
        (
          Boolean(
            releaseArtistName.trim(),
          ) &&
          artistIdentitiesMatch(
            trackArtistName,
            releaseArtistName,
          )
        ),
    });

    const albumArtistIndexes = new Set<number>();

    for (const path of [
      ...existing.keys(),
      ...plannedPaths,
    ]) {
      const nameMatch = path.match(
        albumArtistNamePattern,
      );
      const sortMatch = path.match(
        albumArtistSortNamePattern,
      );
      const index = Number.parseInt(
        nameMatch?.[1] ??
          sortMatch?.[1] ??
          "",
        10,
      );

      if (Number.isInteger(index)) {
        albumArtistIndexes.add(index);
      }
    }

    for (const index of albumArtistIndexes) {
      const namePath =
        `track.album_artists[${index}].name`;
      const sortNamePath =
        `track.album_artists[${index}].sort_name`;
      const artistName = stringValue(
        next,
        namePath,
      );

      synchronizePair({
        namePath,
        sortNamePath,
        inheritFromRelease:
          Boolean(
            artistName.trim() &&
            releaseArtistName.trim(),
          ) &&
          artistIdentitiesMatch(
            artistName,
            releaseArtistName,
          ),
      });
    }
  }

  return derivedChanges;
}
