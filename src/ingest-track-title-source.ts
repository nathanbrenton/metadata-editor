import type {
  IngestFileInspection,
} from "../shared/ingest-types.js";

export type IngestFilenameTitleSeparator =
  | "underscore"
  | "hyphen"
  | "space";

export type IngestFilenameTitleField =
  | number
  | "last";

export type IngestTrackTitleSource =
  | {
      kind: "filename-field";
      separator: IngestFilenameTitleSeparator;
      field: IngestFilenameTitleField;
    }
  | {
      kind: "embedded-title";
    };

export type IngestTrackTitleUpdate = {
  sourceRelativePath: string;
  title: string;
};

export type IngestTrackTitleSelection = {
  sourceRelativePath: string;
  include: boolean;
};

export type IngestTrackTitlePlan = {
  selectedCount: number;
  updates: IngestTrackTitleUpdate[];
  unavailableSourceRelativePaths: string[];
};

const embeddedTitleKeys = new Set([
  "title",
  "track title",
  "track_title",
  "tracktitle",
]);

function filenameStem(filename: string): string {
  const separator = filename.lastIndexOf(".");

  return separator > 0
    ? filename.slice(0, separator)
    : filename;
}

function separatorPattern(
  separator: IngestFilenameTitleSeparator,
): RegExp {
  if (separator === "underscore") {
    return /_+/;
  }

  if (separator === "hyphen") {
    return /-+/;
  }

  return /\s+/;
}

export function filenameTitleFields(
  filename: string,
  separator: IngestFilenameTitleSeparator,
): string[] {
  return filenameStem(filename)
    .split(separatorPattern(separator))
    .map((field) => field.trim())
    .filter(Boolean);
}

/*
 * Filename fields are made readable without rewriting already authored
 * capitalization. Embedded metadata titles are returned unchanged elsewhere.
 */
export function humanizeFilenameTitleField(
  value: string,
): string {
  const spaced = value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return spaced
    .split(" ")
    .map((word) => {
      if (
        !word ||
        /^[A-Z0-9]{2,}$/.test(word) ||
        /[A-Z]/.test(word.slice(1))
      ) {
        return word;
      }

      return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
    })
    .join(" ");
}

export function embeddedTrackTitle(
  file: Pick<IngestFileInspection, "embeddedMetadata">,
): string | undefined {
  const match = Object.entries(
    file.embeddedMetadata,
  ).find(
    ([key, value]) =>
      embeddedTitleKeys.has(
        key.trim().toLowerCase(),
      ) && value.trim() !== "",
  );

  return match?.[1].trim();
}

export function titleFromFilenameField(
  filename: string,
  separator: IngestFilenameTitleSeparator,
  field: IngestFilenameTitleField,
): string | undefined {
  const fields = filenameTitleFields(
    filename,
    separator,
  );
  const rawValue =
    field === "last"
      ? fields.at(-1)
      : fields[field - 1];

  if (!rawValue) {
    return undefined;
  }

  const title = humanizeFilenameTitleField(
    rawValue,
  );

  return title || undefined;
}

export function buildTrackTitlePlan(
  tracks: readonly IngestTrackTitleSelection[],
  files: readonly IngestFileInspection[],
  missingSourcePaths: ReadonlySet<string>,
  source: IngestTrackTitleSource,
): IngestTrackTitlePlan {
  const filesByPath = new Map(
    files.map((file) => [
      file.relativePath,
      file,
    ]),
  );
  const selectedTracks = tracks.filter(
    (track) =>
      track.include &&
      !missingSourcePaths.has(
        track.sourceRelativePath,
      ),
  );
  const updates: IngestTrackTitleUpdate[] = [];
  const unavailableSourceRelativePaths: string[] = [];

  for (const track of selectedTracks) {
    const file = filesByPath.get(
      track.sourceRelativePath,
    );
    const title =
      !file
        ? undefined
        : source.kind === "embedded-title"
          ? embeddedTrackTitle(file)
          : titleFromFilenameField(
              file.filename,
              source.separator,
              source.field,
            );

    if (!title) {
      unavailableSourceRelativePaths.push(
        track.sourceRelativePath,
      );
      continue;
    }

    updates.push({
      sourceRelativePath:
        track.sourceRelativePath,
      title,
    });
  }

  return {
    selectedCount: selectedTracks.length,
    updates,
    unavailableSourceRelativePaths,
  };
}
