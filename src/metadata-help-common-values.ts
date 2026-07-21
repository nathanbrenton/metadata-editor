/*
 * Supplemental help vocabularies are deterministic, local, and advisory.
 * They improve free-text field guidance without turning those fields into
 * closed enums or requiring any network lookup.
 */
export const productionTypeCommonValues = [
  "studio recording",
  "home recording",
  "live recording",
  "rehearsal",
  "demo session",
  "jam session",
  "writing session",
  "field recording",
  "remote recording",
  "location recording",
  "archive transfer",
  "restoration",
  "remaster",
] as const;

const productionLocationTypeCommonValues = [
  "commercial studio",
  "home studio",
  "rehearsal space",
  "live venue",
  "remote setup",
  "mobile setup",
  "field location",
  "outdoor location",
] as const;

const productionSessionTypeCommonValues = [
  "tracking session",
  "overdub session",
  "rehearsal",
  "jam session",
  "writing session",
  "live session",
  "editing session",
  "mix session",
  "mastering session",
] as const;

const productionCaptureMethodCommonValues = [
  "multitrack recording",
  "live to stereo",
  "direct to two-track",
  "overdubbed recording",
  "remote collaboration",
  "archive transfer",
] as const;

const languageCodeCommonValues = [
  "en",
  "es",
  "fr",
  "de",
  "it",
  "pt",
  "ja",
  "ko",
  "zh",
  "zxx",
] as const;

const scriptCodeCommonValues = [
  "Latn",
  "Cyrl",
  "Arab",
  "Hebr",
  "Grek",
  "Hans",
  "Hant",
  "Jpan",
  "Kore",
  "Deva",
] as const;

const countryCodeCommonValues = [
  "US",
  "GB",
  "CA",
  "AU",
  "DE",
  "FR",
  "JP",
] as const;

export function getPatternMetadataHelpCommonValues(
  path: string,
): string[] {
  const normalizedPath = path
    .replace(/\[\d+\]/g, "[]")
    .toLocaleLowerCase();

  if (normalizedPath.endsWith(".production_type")) {
    return [...productionTypeCommonValues];
  }

  if (normalizedPath.endsWith(".session_type")) {
    return [...productionSessionTypeCommonValues];
  }

  if (
    normalizedPath.endsWith(".location_type") ||
    normalizedPath.endsWith(".recording_environment")
  ) {
    return [...productionLocationTypeCommonValues];
  }

  if (
    normalizedPath.endsWith(".capture_method") ||
    normalizedPath.endsWith(".recording_method")
  ) {
    return [...productionCaptureMethodCommonValues];
  }

  if (
    normalizedPath.endsWith(".language") ||
    normalizedPath.endsWith("_language")
  ) {
    return [...languageCodeCommonValues];
  }

  if (
    normalizedPath.endsWith(".script") ||
    normalizedPath.endsWith("_script")
  ) {
    return [...scriptCodeCommonValues];
  }

  if (
    normalizedPath.endsWith(".country") ||
    normalizedPath.endsWith("_country")
  ) {
    return [...countryCodeCommonValues];
  }

  return [];
}
