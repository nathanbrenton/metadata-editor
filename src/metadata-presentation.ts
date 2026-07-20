export type MetadataPresentationRow = {
  path: string;
  value: unknown;
};

export type MetadataPresentationField = {
  tomlPath: string;
};

export const unmappedMetadataGroup =
  "Unmapped metadata" as const;

/**
 * Registry paths containing [] describe fields managed through dedicated
 * record editors. Their collection roots are implementation containers, not
 * standalone user-facing metadata fields.
 */
export function getManagedMetadataCollectionRoots(
  fields: readonly MetadataPresentationField[],
): Set<string> {
  return new Set(
    fields.flatMap((field) => {
      const arrayMarkerIndex =
        field.tomlPath.indexOf("[]");

      return arrayMarkerIndex < 0
        ? []
        : [
            field.tomlPath.slice(
              0,
              arrayMarkerIndex,
            ),
          ];
    }),
  );
}

/**
 * Empty arrays-of-tables flatten to their collection root (for example,
 * track.contributors = []). Hide that implementation row because the same
 * collection is managed by its dedicated editor in the appropriate tab.
 */
export function filterPresentableMetadataRows<
  Row extends MetadataPresentationRow,
>(
  rows: readonly Row[],
  fields: readonly MetadataPresentationField[],
): Row[] {
  const managedCollectionRoots =
    getManagedMetadataCollectionRoots(fields);

  return rows.filter(
    (row) =>
      !(
        Array.isArray(row.value) &&
        managedCollectionRoots.has(row.path)
      ),
  );
}
