import {
  recommendedTrackVersionOptions,
} from "../shared/track-title.js";

/*
 * Curated vocabularies keep commonly repeated metadata values consistent.
 * The editor always retains an Other… path, so these are recommendations
 * rather than closed enums and existing custom liner-note wording is safe.
 */
export const releaseTypeOptions = [
  "album",
  "single",
  "EP",
  "compilation",
  "soundtrack",
  "live album",
  "demo",
  "mixtape",
  "remix album",
] as const;

export const releaseStatusOptions = [
  "draft",
  "scheduled",
  "official",
  "released",
  "withdrawn",
  "archived",
] as const;

export const releaseVersionOptions = [
  "Original Release",
  "Deluxe Edition",
  "Expanded Edition",
  "Remastered",
  "Anniversary Edition",
  "Demo Edition",
  "Promo Edition",
] as const;

export const trackVersionOptions =
  recommendedTrackVersionOptions;

export const languageCodeOptions = [
  "en",
  "es",
  "fr",
  "de",
  "it",
  "pt",
  "nl",
  "sv",
  "no",
  "da",
  "fi",
  "pl",
  "cs",
  "hu",
  "ro",
  "tr",
  "ru",
  "uk",
  "ar",
  "he",
  "hi",
  "ja",
  "ko",
  "zh",
  "zxx",
] as const;

export const scriptCodeOptions = [
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

export const musicalKeyOptions = [
  "C major",
  "C minor",
  "C# major",
  "C# minor",
  "D major",
  "D minor",
  "Eb major",
  "Eb minor",
  "E major",
  "E minor",
  "F major",
  "F minor",
  "F# major",
  "F# minor",
  "G major",
  "G minor",
  "Ab major",
  "Ab minor",
  "A major",
  "A minor",
  "Bb major",
  "Bb minor",
  "B major",
  "B minor",
] as const;

export const camelotKeyOptions = [
  "1A",
  "1B",
  "2A",
  "2B",
  "3A",
  "3B",
  "4A",
  "4B",
  "5A",
  "5B",
  "6A",
  "6B",
  "7A",
  "7B",
  "8A",
  "8B",
  "9A",
  "9B",
  "10A",
  "10B",
  "11A",
  "11B",
  "12A",
  "12B",
] as const;

export const timeSignatureOptions = [
  "4/4",
  "3/4",
  "2/4",
  "6/8",
  "9/8",
  "12/8",
  "5/4",
  "6/4",
  "7/8",
] as const;

export const artworkRoleOptions = [
  "front_cover",
  "back_cover",
  "booklet",
  "disc",
  "tray",
  "inlay",
  "spine",
  "artist",
  "logo",
  "track_artwork",
  "thumbnail",
] as const;

export const performanceRoleOptions = [
  "lead vocals",
  "vocals",
  "backing vocals",
  "spoken word",
  "rap",
  "guitar",
  "lead guitar",
  "rhythm guitar",
  "acoustic guitar",
  "electric guitar",
  "slide guitar",
  "steel guitar",
  "bass guitar",
  "upright bass",
  "drums",
  "percussion",
  "piano",
  "electric piano",
  "organ",
  "keyboards",
  "synthesizer",
  "programming",
  "drum programming",
  "violin",
  "viola",
  "cello",
  "double bass",
  "strings",
  "string ensemble",
  "trumpet",
  "trombone",
  "French horn",
  "brass",
  "saxophone",
  "flute",
  "clarinet",
  "oboe",
  "bassoon",
  "woodwinds",
  "harmonica",
  "accordion",
  "banjo",
  "mandolin",
  "ukulele",
  "harp",
  "turntables",
  "samples",
  "conductor",
  "ensemble",
  "choir",
  "orchestra",
] as const;

export const technicalContributorRoleOptions = [
  "recorded by",
  "recording engineer",
  "assistant recording engineer",
  "additional recording",
  "tracking engineer",
  "engineered by",
  "audio editor",
  "vocal editor",
  "drum editor",
  "mixed by",
  "mix engineer",
  "assistant mix engineer",
  "mix technician",
  "mastered by",
  "mastering engineer",
  "mastering assistant",
  "remastering engineer",
  "restoration engineer",
  "transfer engineer",
] as const;

export const contributorRoleOptions = [
  "producer",
  "co-producer",
  "additional producer",
  "associate producer",
  "executive producer",
  "vocal producer",
  ...technicalContributorRoleOptions,
  "sound designer",
  "programmer",
  "MIDI programmer",
  "arranger",
  "orchestrator",
  "conductor",
  "composer",
  "lyricist",
  "songwriter",
  "publisher",
  "publishing administrator",
  "studio assistant",
  "creative director",
  "art director",
  "photography",
  "design",
  "liner notes",
  "project coordinator",
  "production coordinator",
] as const;

export function isTechnicalContributorRole(
  role: string,
): boolean {
  const normalizedRole = role
    .trim()
    .toLowerCase();

  return (
    /\b(?:record(?:ed|ing)?|tracking|engineer(?:ed|ing)?|edit(?:ed|ing|or)?|mix(?:ed|er|ing)?|mixdown|master(?:ed|ing)?|remaster(?:ed|ing)?|transfer(?:red|ring)?|restor(?:ation|ed|ing)?|tape operator)\b/.test(
      normalizedRole,
    )
  );
}
