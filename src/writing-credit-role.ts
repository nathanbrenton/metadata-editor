export const writingCreditFamilies = [
  "songwriters",
  "composers",
  "lyricists",
] as const;

export type WritingCreditFamily =
  (typeof writingCreditFamilies)[number];

export const writingCreditRoleOptions = [
  "written by",
  "songwriter",
  "composer",
  "music by",
  "lyricist",
  "lyrics by",
  "words by",
  "additional songwriter",
  "additional composer",
  "additional lyricist",
] as const;

export function normalizeWritingCreditRole(
  role: string,
): string {
  return role
    .trim()
    .toLocaleLowerCase()
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ");
}

export function writingCreditFamilyForRole(
  role: string,
  fallback: WritingCreditFamily = "songwriters",
): WritingCreditFamily {
  const normalizedRole =
    normalizeWritingCreditRole(role);

  if (
    /\b(?:lyricist|lyrics by|words by)\b/.test(
      normalizedRole,
    )
  ) {
    return "lyricists";
  }

  if (
    /\b(?:composer|music by)\b/.test(
      normalizedRole,
    )
  ) {
    return "composers";
  }

  if (
    /\b(?:written by|songwriter)\b/.test(
      normalizedRole,
    )
  ) {
    return "songwriters";
  }

  return fallback;
}

export function defaultWritingRoleForFamily(
  family: WritingCreditFamily,
): string {
  switch (family) {
    case "composers":
      return "composer";
    case "lyricists":
      return "lyricist";
    case "songwriters":
      return "written by";
  }
}

export function getWritingCreditDisplayPriority(
  role: string,
  family?: WritingCreditFamily,
): number {
  const normalizedRole =
    normalizeWritingCreditRole(role);
  const normalizedFamily =
    writingCreditFamilyForRole(
      normalizedRole,
      family ?? "songwriters",
    );
  const isAdditional =
    /\badditional\b/.test(normalizedRole);

  if (normalizedFamily === "songwriters") {
    return isAdditional ? 19 : 10;
  }

  if (normalizedFamily === "composers") {
    return isAdditional ? 29 : 20;
  }

  return isAdditional ? 39 : 30;
}

export function sortWritingCreditDisplayRecords<
  T extends {
    role: string;
    family?: WritingCreditFamily;
  },
>(records: readonly T[]): T[] {
  return records
    .map((record, sourceIndex) => ({
      record,
      sourceIndex,
    }))
    .sort((left, right) => {
      const priorityDifference =
        getWritingCreditDisplayPriority(
          left.record.role,
          left.record.family,
        ) -
        getWritingCreditDisplayPriority(
          right.record.role,
          right.record.family,
        );

      return priorityDifference !== 0
        ? priorityDifference
        : left.sourceIndex - right.sourceIndex;
    })
    .map(({ record }) => record);
}
