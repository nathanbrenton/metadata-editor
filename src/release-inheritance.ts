import {
  flattenMetadata,
  type FlattenedMetadataRow,
} from "./metadata-flattener.js";

export type InheritedMetadataValue =
  | string
  | number
  | boolean
  | string[];

type MetadataDocumentLike = {
  filename: string;
  scope: "release" | "track";
  parsed: Record<string, unknown>;
};

type MetadataFieldLike = {
  scope: string;
  storageFileRole: string;
  tomlPath: string;
  valueType: string;
  repeatable: boolean;
  inherited: boolean;
};

export const trackReleaseInheritancePaths =
  new Map<string, string>([
    [
      "track.primary_artist.name",
      "release.primary_artist.name",
    ],
    [
      "track.language",
      "release.language",
    ],
    [
      "track.classification.genres",
      "release.genres",
    ],
    [
      "track.classification.styles",
      "release.styles",
    ],
    [
      "track.classification.moods",
      "release.moods",
    ],
    [
      "track.classification.tags",
      "release.tags",
    ],
    [
      "track.explicit",
      "release.explicit",
    ],
    [
      "track.rights.copyright",
      "release.rights.copyright",
    ],
    [
      "track.rights.publisher",
      "release.rights.publisher",
    ],
    [
      "track.subtitle",
      "release.subtitle",
    ],
    [
      "track.version",
      "release.version",
    ],
    [
      "track.dates.release",
      "release.dates.release",
    ],
    [
      "track.dates.original_release",
      "release.dates.original_release",
    ],
  ]);

const primaryArtistSortNamePath =
  "track.primary_artist.sort_name";
const releasePrimaryArtistNamePath =
  "release.primary_artist.name";
const releasePrimaryArtistSortNamePath =
  "release.primary_artist.sort_name";
const indexedAlbumArtistSortNamePattern =
  /^track\.album_artists\[(\d+)\]\.sort_name$/;

export function isArtistSortNameInheritancePath(
  metadataPath: string,
): boolean {
  return (
    metadataPath ===
      primaryArtistSortNamePath ||
    indexedAlbumArtistSortNamePattern.test(
      metadataPath,
    )
  );
}

export function isBlankMetadataValue(
  value: unknown,
): boolean {
  return (
    value === "" ||
    value === null ||
    value === undefined ||
    (
      Array.isArray(value) &&
      value.length === 0
    )
  );
}

function isInheritedMetadataValue(
  value: unknown,
): value is InheritedMetadataValue {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    (
      Array.isArray(value) &&
      value.every(
        (entry) => typeof entry === "string",
      )
    )
  );
}

export function findMetadataValueAcrossDocuments(
  documents: MetadataDocumentLike[],
  metadataPath: string,
): InheritedMetadataValue | undefined {
  for (const candidateDocument of documents) {
    const row = flattenMetadata(
      candidateDocument.parsed,
    ).find(
      (candidate) =>
        candidate.path === metadataPath,
    );

    if (
      row &&
      isInheritedMetadataValue(row.value) &&
      !isBlankMetadataValue(row.value)
    ) {
      return row.value;
    }
  }

  return undefined;
}

function findDocumentStringValue(
  document: MetadataDocumentLike,
  metadataPath: string,
): string | undefined {
  const row = flattenMetadata(
    document.parsed,
  ).find(
    (candidate) =>
      candidate.path === metadataPath,
  );

  return typeof row?.value === "string"
    ? row.value
    : undefined;
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

/*
 * Sort names may inherit only as part of a matching artist identity.
 * This prevents a local artist such as Kateri Lirio from accidentally
 * receiving the release artist's "Brenton, Nathan" sort value.
 */
function resolveArtistSortNameReleaseValue(
  document: MetadataDocumentLike,
  metadataPath: string,
  releaseDocuments: MetadataDocumentLike[],
): {
  sourcePath: string;
  value: InheritedMetadataValue;
} | null {
  const releaseArtistName =
    findMetadataValueAcrossDocuments(
      releaseDocuments,
      releasePrimaryArtistNamePath,
    );
  const releaseSortName =
    findMetadataValueAcrossDocuments(
      releaseDocuments,
      releasePrimaryArtistSortNamePath,
    );

  if (
    typeof releaseArtistName !== "string" ||
    typeof releaseSortName !== "string"
  ) {
    return null;
  }

  let trackArtistName: string | undefined;

  if (
    metadataPath ===
    primaryArtistSortNamePath
  ) {
    trackArtistName =
      findDocumentStringValue(
        document,
        "track.primary_artist.name",
      );

    /*
     * A blank track artist name already means that the release artist is
     * inherited, so its matching sort name may inherit as well.
     */
    if (
      trackArtistName?.trim() &&
      !artistIdentitiesMatch(
        trackArtistName,
        releaseArtistName,
      )
    ) {
      return null;
    }
  } else {
    const albumArtistMatch =
      metadataPath.match(
        indexedAlbumArtistSortNamePattern,
      );

    if (!albumArtistMatch) {
      return null;
    }

    trackArtistName =
      findDocumentStringValue(
        document,
        `track.album_artists[${albumArtistMatch[1]}].name`,
      );

    if (
      !trackArtistName?.trim() ||
      !artistIdentitiesMatch(
        trackArtistName,
        releaseArtistName,
      )
    ) {
      return null;
    }
  }

  return {
    sourcePath:
      releasePrimaryArtistSortNamePath,
    value: releaseSortName,
  };
}

function resolveReleaseValueForPath(
  document: MetadataDocumentLike,
  metadataPath: string,
  releaseDocuments: MetadataDocumentLike[],
): {
  sourcePath: string;
  value: InheritedMetadataValue;
} | null {
  if (document.scope !== "track") {
    return null;
  }

  if (
    isArtistSortNameInheritancePath(
      metadataPath,
    )
  ) {
    return resolveArtistSortNameReleaseValue(
      document,
      metadataPath,
      releaseDocuments,
    );
  }

  const sourcePath =
    trackReleaseInheritancePaths.get(
      metadataPath,
    );

  if (!sourcePath) {
    return null;
  }

  const value =
    findMetadataValueAcrossDocuments(
      releaseDocuments,
      sourcePath,
    );

  return value === undefined
    ? null
    : {
        sourcePath,
        value,
      };
}

/*
 * Resolve the applicable release value even when a local override exists.
 * Callers decide whether the local or inherited value is effective. Keeping
 * the source available enables an explicit "Use release value" action.
 */
export function resolveInheritedReleaseValue(
  document: MetadataDocumentLike,
  row: FlattenedMetadataRow,
  releaseDocuments: MetadataDocumentLike[],
): {
  sourcePath: string;
  value: InheritedMetadataValue;
} | null {
  return resolveReleaseValueForPath(
    document,
    row.path,
    releaseDocuments,
  );
}

function normalizeFlattenedValueType(
  valueType: string,
): string {
  return valueType === "integer"
    ? "number"
    : valueType;
}

/*
 * Project release defaults into a track's read-only/editing view even when
 * the local TOML path has never been created. The synthetic row remains blank;
 * the effective value is still resolved from the release document at render
 * time, so no inherited value is copied into track.toml.
 */
export function buildMissingInheritedMetadataRows(
  document: MetadataDocumentLike,
  releaseDocuments: MetadataDocumentLike[],
  metadataRegistry: MetadataFieldLike[],
  storageFileRole: string,
): FlattenedMetadataRow[] {
  if (document.scope !== "track") {
    return [];
  }

  const existingPaths = new Set(
    flattenMetadata(document.parsed).map(
      (row) => row.path,
    ),
  );

  return metadataRegistry.flatMap(
    (field) => {
      if (
        field.scope !== "track" &&
        field.scope !== "credit"
      ) {
        return [];
      }

      if (
        field.storageFileRole !==
          storageFileRole ||
        !field.inherited ||
        field.repeatable ||
        field.tomlPath.includes("[]") ||
        existingPaths.has(field.tomlPath)
      ) {
        return [];
      }

      const inheritedValue =
        resolveReleaseValueForPath(
          document,
          field.tomlPath,
          releaseDocuments,
        );

      if (!inheritedValue) {
        return [];
      }

      return [
        {
          path: field.tomlPath,
          value: "",
          valueType:
            normalizeFlattenedValueType(
              field.valueType,
            ),
        },
      ];
    },
  );
}
