/*
 * Arrangement credits intentionally exclude conducting and musical-direction
 * roles. Those are related creative credits, but they describe performance
 * leadership rather than authorship of an arrangement or orchestration.
 */
export function isArrangementContributorRoleValue(
  role: string,
): boolean {
  const normalizedRole = role
    .trim()
    .toLowerCase();

  return /\b(?:arrang(?:e[dr]?|ement|er|ing)?|orchestrat(?:e[dr]?|ion|or|ing)?)\b/.test(
    normalizedRole,
  );
}

export function normalizeArrangementCreditRole(
  role: string,
): string {
  return role
    .trim()
    .toLocaleLowerCase()
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ");
}

/*
 * Read-only arrangement displays keep broad credits first, followed by
 * vocal/instrument-family specializations and orchestration credits.
 */
export function getArrangementCreditDisplayPriority(
  role: string,
): number {
  const normalizedRole =
    normalizeArrangementCreditRole(role);

  if (/^(arranger|arranged by|arrangement by)$/.test(normalizedRole)) {
    return 10;
  }

  if (/\b(?:co|additional|sub) arranger\b/.test(normalizedRole)) {
    return 20;
  }

  if (/\b(?:vocal|background vocal|choir)\b/.test(normalizedRole)) {
    return 30;
  }

  if (/\bstring\b/.test(normalizedRole)) {
    return 40;
  }

  if (/\b(?:brass|horn)\b/.test(normalizedRole)) {
    return 50;
  }

  if (/\bwoodwind\b/.test(normalizedRole)) {
    return 60;
  }

  if (/\brhythm\b/.test(normalizedRole)) {
    return 70;
  }

  if (/\b(?:percussion|drum)\b/.test(normalizedRole)) {
    return 80;
  }

  if (/\b(?:keyboard|synthesizer|synth)\b/.test(normalizedRole)) {
    return 90;
  }

  if (/\borchestrat/.test(normalizedRole)) {
    return 100;
  }

  return 200;
}

export function sortArrangementCreditDisplayRecords<
  T extends { role: string },
>(records: readonly T[]): T[] {
  return records
    .map((record, sourceIndex) => ({
      record,
      sourceIndex,
    }))
    .sort((left, right) => {
      const priorityDifference =
        getArrangementCreditDisplayPriority(
          left.record.role,
        ) -
        getArrangementCreditDisplayPriority(
          right.record.role,
        );

      return priorityDifference !== 0
        ? priorityDifference
        : left.sourceIndex - right.sourceIndex;
    })
    .map(({ record }) => record);
}
