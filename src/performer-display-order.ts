export type NamedPerformerDisplayRecord = {
  name: string;
};

export type PerformerRoleSetDisplayRecord =
  NamedPerformerDisplayRecord & {
    key: string;
    roles: string[];
    sortNames: string[];
    sourceCount: number;
  };

function normalizePerformerDisplayName(
  value: string,
): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

function normalizePerformerDisplayValue(
  value: string,
): string {
  return value
    .trim()
    .replace(/\s+/g, " ");
}

function appendDistinctDisplayValue(
  values: string[],
  value: string,
): void {
  const normalized =
    normalizePerformerDisplayValue(value);

  if (!normalized) {
    return;
  }

  const comparison =
    normalized.toLocaleLowerCase();

  if (
    values.some(
      (existingValue) =>
        existingValue.toLocaleLowerCase() ===
        comparison,
    )
  ) {
    return;
  }

  values.push(normalized);
}

function performerRoleSetKey(
  record: PerformerRoleSetDisplayRecord,
): string {
  const normalizedRoles = Array.from(
    new Set(
      record.roles
        .map((role) =>
          normalizePerformerDisplayValue(
            role,
          ).toLocaleLowerCase(),
        )
        .filter(Boolean),
    ),
  ).sort((left, right) =>
    left.localeCompare(right),
  );

  // Keep incomplete records separate rather than merging unrelated blanks.
  return normalizedRoles.length > 0
    ? normalizedRoles.join("\u001f")
    : `missing-role-set:${record.key}`;
}

function fallbackPerformerSortKey(
  name: string,
): string {
  const normalized =
    normalizePerformerDisplayValue(name);
  const parts = normalized.split(" ");
  const surname = parts.pop() ?? "";

  return [surname, ...parts]
    .join("\u001f")
    .toLocaleLowerCase();
}

function performerDisplaySortKey(
  record: PerformerRoleSetDisplayRecord,
): string {
  const explicitSortName =
    record.sortNames
      .map(normalizePerformerDisplayValue)
      .find(Boolean);

  return explicitSortName
    ? explicitSortName.toLocaleLowerCase()
    : fallbackPerformerSortKey(
        record.name,
      );
}

/**
 * Place the release primary artist first in performer presentation while
 * preserving the authored/source order for every other credited person.
 */
export function prioritizeReleaseArtistDisplay<
  T extends NamedPerformerDisplayRecord,
>(
  records: readonly T[],
  releasePrimaryArtistName: string,
): T[] {
  const normalizedReleaseArtist =
    normalizePerformerDisplayName(
      releasePrimaryArtistName,
    );

  if (!normalizedReleaseArtist) {
    return [...records];
  }

  return records
    .map((record, sourceIndex) => ({
      record,
      sourceIndex,
      isReleaseArtist:
        normalizePerformerDisplayName(
          record.name,
        ) === normalizedReleaseArtist,
    }))
    .sort((left, right) => {
      if (
        left.isReleaseArtist !==
        right.isReleaseArtist
      ) {
        return left.isReleaseArtist ? -1 : 1;
      }

      return (
        left.sourceIndex -
        right.sourceIndex
      );
    })
    .map(({ record }) => record);
}

/**
 * Consolidate read-only performer rows when complete normalized role sets
 * match. Individual performer records remain unchanged for editing and copy
 * workflows. Names inside a shared row use explicit sort names when present,
 * then fall back to surname-first ordering.
 */
export function groupMatchingPerformerRoleSets(
  records: readonly PerformerRoleSetDisplayRecord[],
  releasePrimaryArtistName: string,
): PerformerRoleSetDisplayRecord[] {
  const normalizedReleaseArtist =
    normalizePerformerDisplayName(
      releasePrimaryArtistName,
    );
  const groups = new Map<
    string,
    {
      records: Array<{
        record: PerformerRoleSetDisplayRecord;
        sourceIndex: number;
      }>;
      firstSourceIndex: number;
      includesReleaseArtist: boolean;
    }
  >();

  records.forEach((record, sourceIndex) => {
    const roleSetKey =
      performerRoleSetKey(record);
    const existing = groups.get(roleSetKey);
    const isReleaseArtist =
      Boolean(normalizedReleaseArtist) &&
      normalizePerformerDisplayName(
        record.name,
      ) === normalizedReleaseArtist;

    if (existing) {
      existing.records.push({
        record,
        sourceIndex,
      });
      existing.includesReleaseArtist ||= isReleaseArtist;
      return;
    }

    groups.set(roleSetKey, {
      records: [
        {
          record,
          sourceIndex,
        },
      ],
      firstSourceIndex: sourceIndex,
      includesReleaseArtist: isReleaseArtist,
    });
  });

  return Array.from(groups.entries())
    .map(([roleSetKey, group]) => {
      const sortedMembers = [
        ...group.records,
      ].sort((left, right) => {
        const sortDifference =
          performerDisplaySortKey(
            left.record,
          ).localeCompare(
            performerDisplaySortKey(
              right.record,
            ),
          );

        return sortDifference !== 0
          ? sortDifference
          : left.sourceIndex -
              right.sourceIndex;
      });
      const names: string[] = [];
      const sortNames: string[] = [];

      sortedMembers.forEach(({ record }) => {
        appendDistinctDisplayValue(
          names,
          record.name,
        );
        record.sortNames.forEach(
          (sortName) =>
            appendDistinctDisplayValue(
              sortNames,
              sortName,
            ),
        );
      });

      const roleTemplate = [
        ...group.records,
      ].sort(
        (left, right) =>
          left.sourceIndex -
          right.sourceIndex,
      )[0]?.record;

      return {
        record: {
          key: [
            "shared-performer-role-set",
            roleSetKey,
            ...sortedMembers.map(
              ({ record }) => record.key,
            ),
          ].join(":"),
          name: names.join(", "),
          roles: [
            ...(roleTemplate?.roles ?? []),
          ],
          sortNames,
          sourceCount: sortedMembers.reduce(
            (count, { record }) =>
              count + record.sourceCount,
            0,
          ),
        },
        firstSourceIndex:
          group.firstSourceIndex,
        includesReleaseArtist:
          group.includesReleaseArtist,
      };
    })
    .sort((left, right) => {
      if (
        left.includesReleaseArtist !==
        right.includesReleaseArtist
      ) {
        return left.includesReleaseArtist
          ? -1
          : 1;
      }

      return (
        left.firstSourceIndex -
        right.firstSourceIndex
      );
    })
    .map(({ record }) => record);
}
