export type RightsStatementSymbol =
  | "©"
  | "℗";

export type GuidedRightsStatement = {
  year: string;
  holder: string;
};

const rightsStatementSymbolsByPath =
  new Map<string, RightsStatementSymbol>([
    ["release.rights.copyright", "©"],
    ["track.rights.copyright", "©"],
    [
      "track.rights.phonographic_copyright",
      "℗",
    ],
    ["track.text.lyrics_copyright", "©"],
  ]);

export function getRightsStatementSymbol(
  path: string,
): RightsStatementSymbol | null {
  return (
    rightsStatementSymbolsByPath.get(path) ??
    null
  );
}

function removeRecognizedSymbolPrefix(
  value: string,
  symbol: RightsStatementSymbol,
): string | null {
  const trimmedValue = value.trim();

  if (trimmedValue === "") {
    return "";
  }

  const aliases =
    symbol === "©"
      ? ["©", "(c)"]
      : ["℗", "(p)"];

  const matchedAlias = aliases.find(
    (alias) =>
      trimmedValue
        .toLocaleLowerCase("en-US")
        .startsWith(
          alias.toLocaleLowerCase("en-US"),
        ),
  );

  if (!matchedAlias) {
    return null;
  }

  return trimmedValue
    .slice(matchedAlias.length)
    .trim();
}

export function parseGuidedRightsStatement(
  value: string,
  symbol: RightsStatementSymbol,
): GuidedRightsStatement | null {
  const remainder =
    removeRecognizedSymbolPrefix(
      value,
      symbol,
    );

  if (remainder === null) {
    return null;
  }

  if (remainder === "") {
    return {
      year: "",
      holder: "",
    };
  }

  const completeYearMatch = remainder.match(
    /^(\d{4})(?:\s+(.*))?$/,
  );

  if (completeYearMatch) {
    return {
      year: completeYearMatch[1] ?? "",
      holder: (
        completeYearMatch[2] ?? ""
      ).trim(),
    };
  }

  // Preserve an in-progress numeric year across controlled-input rerenders.
  if (/^\d{1,3}$/.test(remainder)) {
    return {
      year: remainder,
      holder: "",
    };
  }

  return {
    year: "",
    holder: remainder,
  };
}

export function formatGuidedRightsStatement(
  symbol: RightsStatementSymbol,
  year: string,
  holder: string,
): string {
  const normalizedYear = year.trim();
  const normalizedHolder = holder.trim();

  if (
    normalizedYear === "" &&
    normalizedHolder === ""
  ) {
    return "";
  }

  return [
    symbol,
    normalizedYear,
    normalizedHolder,
  ]
    .filter((part) => part !== "")
    .join(" ");
}
