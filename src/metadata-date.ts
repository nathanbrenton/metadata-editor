const completeIsoDatePattern = /^\d{4}-\d{2}-\d{2}$/;

const calendarDateLeafNames = new Set([
  "date",
  "release_date",
  "original_release",
  "source_date",
  "recorded_start",
  "recorded_end",
  "mixed",
  "mastered",
  "composed",
  "arranged",
  "remixed",
  "remastered",
  "expiration_date",
]);

export function isCompleteIsoCalendarDate(value: string): boolean {
  if (!completeIsoDatePattern.test(value)) {
    return false;
  }

  const [yearText, monthText, dayText] = value.split("-");
  const year = Number.parseInt(yearText ?? "", 10);
  const month = Number.parseInt(monthText ?? "", 10);
  const day = Number.parseInt(dayText ?? "", 10);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export function getCalendarInputValue(value: string): string {
  return isCompleteIsoCalendarDate(value) ? value : "";
}

export function isCalendarDateMetadataPath(
  path: string,
  valueType?: string,
): boolean {
  if (valueType === "date") {
    return true;
  }

  const normalizedPath = path
    .replace(/\[\d+\]/g, "[]")
    .toLowerCase();

  if (/\.dates\.(release|original_release)$/.test(normalizedPath)) {
    return true;
  }

  const leaf = normalizedPath.split(".").at(-1) ?? normalizedPath;

  return calendarDateLeafNames.has(leaf) || leaf.endsWith("_date");
}

export function getLegacyCalendarDateValue(value: string): string | null {
  const trimmed = value.trim();

  if (!trimmed || isCompleteIsoCalendarDate(trimmed)) {
    return null;
  }

  return trimmed;
}
