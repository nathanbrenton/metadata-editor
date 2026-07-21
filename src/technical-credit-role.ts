/*
 * Keep client-side technical-credit discovery aligned with the server
 * validator so saved liner-note variants remain visible after refresh.
 */
export function isTechnicalContributorRoleValue(
  role: string,
): boolean {
  const normalizedRole = role
    .trim()
    .toLowerCase();

  return /\b(?:record(?:ed|ing)?|tracking|engineer(?:ed|ing)?|edit(?:ed|ing|or)?|mix(?:ed|er|ing)?|mixdown|master(?:ed|ing)?|remaster(?:ed|ing)?|transfer(?:red|ring)?|restor(?:ation|ed|ing)?|tape operator)\b/.test(
    normalizedRole,
  );
}

/*
 * Read-only technical-credit views follow the signal-chain sequence used in
 * conventional liner notes. Unknown custom roles remain visible at the end.
 */
export function getTechnicalCreditDisplayPriority(
  role: string,
): number {
  const normalizedRole = role
    .trim()
    .toLowerCase();

  if (
    /\b(?:record(?:ed|ing)?|tracking|tape operator)\b/.test(
      normalizedRole,
    )
  ) {
    return 10;
  }

  if (
    /\bedit(?:ed|ing|or)?\b/.test(
      normalizedRole,
    )
  ) {
    return 20;
  }

  if (
    /\b(?:mix(?:ed|er|ing)?|mixdown)\b/.test(
      normalizedRole,
    )
  ) {
    return 30;
  }

  if (
    /\b(?:master(?:ed|ing)?|remaster(?:ed|ing)?)\b/.test(
      normalizedRole,
    )
  ) {
    return 40;
  }

  if (
    /\b(?:transfer(?:red|ring)?|restor(?:ation|ed|ing)?)\b/.test(
      normalizedRole,
    )
  ) {
    return 50;
  }

  if (
    /\bengineer(?:ed|ing)?\b/.test(
      normalizedRole,
    )
  ) {
    return 60;
  }

  return 100;
}

/*
 * Sorting a copy keeps authored TOML and edit-mode record order untouched.
 * Modern runtime stability is reinforced with the original source index.
 */
export function sortTechnicalCreditDisplayRecords<
  T extends { role: string },
>(records: readonly T[]): T[] {
  return records
    .map((record, sourceIndex) => ({
      record,
      sourceIndex,
    }))
    .sort((left, right) => {
      const priorityDifference =
        getTechnicalCreditDisplayPriority(
          left.record.role,
        ) -
        getTechnicalCreditDisplayPriority(
          right.record.role,
        );

      return priorityDifference !== 0
        ? priorityDifference
        : left.sourceIndex - right.sourceIndex;
    })
    .map(({ record }) => record);
}
