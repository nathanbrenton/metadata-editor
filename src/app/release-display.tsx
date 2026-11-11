import { formatTrackDisplayTitle } from "../../shared/track-title.js";
import type {
  InferredTrackSummary,
} from "./ReleaseMetadataDetailView.js";
import type {
  ParsedMetadataDocument,
  TrackScanResult,
} from "./types.js";

function titleCaseSlug(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(
      /\b\w/g,
      (character) =>
        character.toUpperCase(),
    );
}

function inferTrackSummary(
  trackId: string,
): InferredTrackSummary {
  const match = trackId.match(
    /^(.*?)_(\d{1,3})_(.+)$/,
  );

  if (!match) {
    return {
      id: trackId,
      number: null,
      artist: "Review artist",
      title: titleCaseSlug(trackId),
    };
  }

  const [, artistSlug, number, titleSlug] =
    match;

  return {
    id: trackId,
    number: Number(number),
    artist: titleCaseSlug(
      artistSlug.replace(
        /-feat(?:uring)?-/g,
        " feat. ",
      ),
    ),
    title: titleCaseSlug(
      titleSlug.replace(
        /-feat(?:uring)?-/g,
        " feat. ",
      ),
    ),
  };
}

function readTrackDisplayTitle(
  trackId: string,
  documents: ParsedMetadataDocument[],
  inferredTitle: string,
): string {
  const trackDocument = documents.find(
    (document) =>
      document.trackId === trackId &&
      document.filename === "track.toml",
  );

  const trackValue =
    trackDocument?.parsed.track;

  if (
    typeof trackValue !== "object" ||
    trackValue === null
  ) {
    return inferredTitle;
  }

  const trackRecord =
    trackValue as Record<string, unknown>;
  const displayTitle =
    typeof trackRecord.display_title ===
      "string"
      ? trackRecord.display_title.trim()
      : "";

  if (displayTitle) {
    return displayTitle;
  }

  const title =
    typeof trackRecord.title === "string"
      ? trackRecord.title
      : "";
  const version =
    typeof trackRecord.version === "string"
      ? trackRecord.version
      : "";
  const generatedTitle =
    formatTrackDisplayTitle(
      title,
      version,
    );

  return generatedTitle || inferredTitle;
}

function inferCommonReleaseArtist(
  tracks: InferredTrackSummary[],
): string {
  const artistCounts = new Map<
    string,
    number
  >();

  for (const track of tracks) {
    const primaryArtist =
      track.artist.split(/\s+feat\.\s+/i)[0];

    artistCounts.set(
      primaryArtist,
      (artistCounts.get(primaryArtist) ?? 0) +
        1,
    );
  }

  return (
    Array.from(artistCounts.entries()).sort(
      (left, right) =>
        right[1] - left[1],
    )[0]?.[0] ?? "Review artist"
  );
}

function formatReleaseTitle(
  releaseId: string,
): string {
  const match = releaseId.match(
    /^\d{4}-\d{2}-\d{2}_(.+)$/,
  );

  if (!match) {
    return releaseId;
  }

  return match[1]
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(
      /\b\w/g,
      (character) =>
        character.toUpperCase(),
    );
}

function publicTrackSelectionLabel(
  track: TrackScanResult,
  multiDisc: boolean,
): string {
  const title = track.title?.trim() ||
    formatReleaseTitle(track.id);

  if (!track.trackNumber) {
    return title;
  }

  if (multiDisc) {
    return `${track.discNumber ?? 1}.${track.trackNumber} · ${title}`;
  }

  return `${track.trackNumber}. ${title}`;
}

function formatReleaseDate(
  releaseId: string,
): string {
  const match = releaseId.match(
    /^(\d{4})-(\d{2})-(\d{2})_/,
  );

  if (!match) {
    return "Release date not identified";
  }

  const [, year, month, day] = match;
  const date = new Date(
    Date.UTC(
      Number(year),
      Number(month) - 1,
      Number(day),
    ),
  );

  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !==
      Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    return "Release date not identified";
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    },
  ).format(date);
}

export {
  titleCaseSlug,
  inferTrackSummary,
  readTrackDisplayTitle,
  inferCommonReleaseArtist,
  formatReleaseTitle,
  publicTrackSelectionLabel,
  formatReleaseDate,
};
