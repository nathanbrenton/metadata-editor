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

export function resolveInheritedReleaseValue(
  document: MetadataDocumentLike,
  row: FlattenedMetadataRow,
  releaseDocuments: MetadataDocumentLike[],
): {
  sourcePath: string;
  value: InheritedMetadataValue;
} | null {
  if (
    document.scope !== "track" ||
    !isBlankMetadataValue(row.value)
  ) {
    return null;
  }

  const sourcePath =
    trackReleaseInheritancePaths.get(
      row.path,
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
        field.scope !== "track" ||
        field.storageFileRole !==
          storageFileRole ||
        !field.inherited ||
        field.repeatable ||
        field.tomlPath.includes("[]") ||
        existingPaths.has(field.tomlPath)
      ) {
        return [];
      }

      const sourcePath =
        trackReleaseInheritancePaths.get(
          field.tomlPath,
        );

      if (!sourcePath) {
        return [];
      }

      const inheritedValue =
        findMetadataValueAcrossDocuments(
          releaseDocuments,
          sourcePath,
        );

      if (inheritedValue === undefined) {
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
