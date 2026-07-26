const nameSuffixes = new Set([
  "jr",
  "jr.",
  "sr",
  "sr.",
  "ii",
  "iii",
  "iv",
  "v",
]);

const surnameParticles = new Set([
  "al",
  "bin",
  "da",
  "de",
  "del",
  "della",
  "di",
  "du",
  "la",
  "le",
  "st",
  "st.",
  "van",
  "von",
]);

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function generateCreditSortName(
  name: string,
): string {
  const normalized = normalizeName(name);

  if (!normalized || normalized.includes(",")) {
    return normalized;
  }

  if (/^the\s+/i.test(normalized)) {
    return `${normalized.replace(/^the\s+/i, "")}, The`;
  }

  const parts = normalized.split(" ");

  if (parts.length < 2) {
    return normalized;
  }

  const suffixParts: string[] = [];

  while (
    parts.length > 1 &&
    nameSuffixes.has(
      (parts.at(-1) ?? "").toLocaleLowerCase(),
    )
  ) {
    suffixParts.unshift(parts.pop() ?? "");
  }

  const surnameParts = [parts.pop() ?? ""];

  while (
    parts.length > 1 &&
    surnameParticles.has(
      (parts.at(-1) ?? "").toLocaleLowerCase(),
    )
  ) {
    surnameParts.unshift(parts.pop() ?? "");
  }

  const givenNames = parts.join(" ");
  const surname = [
    ...surnameParts,
    ...suffixParts,
  ].join(" ");

  return givenNames
    ? `${surname}, ${givenNames}`
    : surname;
}

export function resolveCreditSortName(
  name: string,
  authoredSortName: string,
): string {
  return authoredSortName.trim()
    ? authoredSortName
    : generateCreditSortName(name);
}

export function synchronizeCreditSortName({
  previousName,
  nextName,
  currentSortName,
}: {
  previousName: string;
  nextName: string;
  currentSortName: string;
}): string {
  const previousGenerated =
    generateCreditSortName(previousName);
  const generatedWasInUse =
    !currentSortName.trim() ||
    currentSortName === previousGenerated;

  return generatedWasInUse
    ? generateCreditSortName(nextName)
    : currentSortName;
}

const indexedCreditNamePattern =
  /^(.*(?:performers|contributors|songwriters|composers|lyricists)\[\d+\])\.name$/;
const indexedCreditSortNamePattern =
  /^(.*(?:performers|contributors|songwriters|composers|lyricists)\[\d+\])\.sort_name$/;

export function creditSortNamePathForNamePath(
  namePath: string,
): string | null {
  const match = namePath.match(
    indexedCreditNamePattern,
  );

  return match
    ? `${match[1]}.sort_name`
    : null;
}

export function creditNamePathForSortNamePath(
  sortNamePath: string,
): string | null {
  const match = sortNamePath.match(
    indexedCreditSortNamePattern,
  );

  return match ? `${match[1]}.name` : null;
}
