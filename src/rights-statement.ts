export type RightsStatementSymbol =
  | "©"
  | "℗";

export type GuidedRightsStatement = {
  year: string;
  holder: string;
};

export type GuidedCopyrightNotice = {
  holder: string;
};

export type GuidedCopyrightNoticeConfig = {
  prefix: "Copyright" | "Sound Recording Copyright";
  symbol: RightsStatementSymbol;
  keyboardAlias: "(C)" | "(P)";
};

const guidedCopyrightNoticeConfigs =
  new Map<string, GuidedCopyrightNoticeConfig>([
    [
      "release.rights.copyright",
      {
        prefix: "Copyright",
        symbol: "©",
        keyboardAlias: "(C)",
      },
    ],
    [
      "track.rights.copyright",
      {
        prefix: "Copyright",
        symbol: "©",
        keyboardAlias: "(C)",
      },
    ],
    [
      "release.rights.phonographic_copyright",
      {
        prefix: "Sound Recording Copyright",
        symbol: "℗",
        keyboardAlias: "(P)",
      },
    ],
    [
      "track.rights.phonographic_copyright",
      {
        prefix: "Sound Recording Copyright",
        symbol: "℗",
        keyboardAlias: "(P)",
      },
    ],
  ]);

export function getGuidedCopyrightNoticeConfig(
  path: string,
): GuidedCopyrightNoticeConfig | null {
  return guidedCopyrightNoticeConfigs.get(path) ?? null;
}

export function isGuidedCopyrightNoticePath(
  path: string,
): boolean {
  return guidedCopyrightNoticeConfigs.has(path);
}

function escapeRegularExpression(
  value: string,
): string {
  return value.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
}

export function parseGuidedCopyrightNotice(
  value: string,
  path = "release.rights.copyright",
): GuidedCopyrightNotice | null {
  const config =
    getGuidedCopyrightNoticeConfig(path);

  if (!config) {
    return null;
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return { holder: "" };
  }

  const symbolPattern = [
    config.symbol,
    config.keyboardAlias,
  ]
    .map(escapeRegularExpression)
    .join("|");
  const match = trimmedValue.match(
    new RegExp(
      `^${escapeRegularExpression(config.prefix)}\\s+(?:${symbolPattern})\\s+(.+?)\\.\\s+All rights reserved\\.$`,
      "i",
    ),
  );

  return match
    ? { holder: (match[1] ?? "").trim() }
    : null;
}

export function formatGuidedCopyrightNotice(
  holder: string,
  path = "release.rights.copyright",
): string {
  const config =
    getGuidedCopyrightNoticeConfig(path);

  if (!config) {
    return "";
  }

  const normalizedHolder = holder
    .trim()
    .replace(/\.\s*$/, "");

  return normalizedHolder
    ? `${config.prefix} ${config.symbol} ${normalizedHolder}. All rights reserved.`
    : "";
}

export function formatGuidedCopyrightNoticeValue(
  path: string,
  value: string,
): string | null {
  const parsedValue =
    parseGuidedCopyrightNotice(value, path);

  return parsedValue === null
    ? null
    : formatGuidedCopyrightNotice(
        parsedValue.holder,
        path,
      );
}

const rightsStatementSymbolsByPath =
  new Map<string, RightsStatementSymbol>([
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
