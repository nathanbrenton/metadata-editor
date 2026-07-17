import path from "node:path";

import type {
  MetadataFieldDefinition,
  ParsedMetadataDocument,
  ReleaseMetadataDetail,
  ReleaseScanResult,
} from "./types.js";

import type {
  ExportContainer,
  ExportPlanField,
  ExportPlanItem,
  ExportPlanScope,
  MetadataExportPlan,
} from "./types.js";

const extensionByContainer:
  Record<ExportContainer, string> = {
    mp3: ".mp3",
    flac: ".flac",
    m4a: ".m4a",
    "ogg-vorbis": ".ogg",
    opus: ".opus",
    wav: ".wav",
  };

const filenameByStorageRole:
  Record<string, string> = {
    release: "release.toml",
    "release-settings":
      "release-settings.toml",
    "release-production-notes":
      "release-production-notes.toml",
    track: "track.toml",
    "track-credits":
      "track-credits.toml",
    "track-production-notes":
      "track-production-notes.toml",
  };

function tagsForContainer(
  field: MetadataFieldDefinition,
  container: ExportContainer,
): string[] {
  switch (container) {
    case "mp3":
      return field.aliases?.id3 ??
        field.aliases?.ffmpeg ??
        [];
    case "flac":
    case "ogg-vorbis":
    case "opus":
      return field.aliases?.vorbis ??
        field.aliases?.ffmpeg ??
        [];
    case "m4a":
      return field.aliases?.mp4 ??
        field.aliases?.ffmpeg ??
        [];
    case "wav":
      return field.aliases?.riff ??
        field.aliases?.ffmpeg ??
        [];
  }
}

function getFieldStatus(
  field: MetadataFieldDefinition,
  container: ExportContainer,
  tags: string[],
): Pick<
  ExportPlanField,
  "status" | "note"
> {
  if (tags.length === 0) {
    return {
      status: "unverified",
      note:
        "No target-container tag is registered for this canonical field.",
    };
  }

  if (
    field.tomlPath ===
      "release.dates.release" &&
    (
      container === "mp3" ||
      container === "m4a" ||
      container === "wav"
    )
  ) {
    return {
      status: "normalized",
      note:
        "Controlled player tests displayed only the four-digit year for this container.",
    };
  }

  if (
    field.tomlPath ===
      "track.numbering.track_number" ||
    field.tomlPath ===
      "track.numbering.track_total"
  ) {
    return {
      status: "normalized",
      note:
        "Current track number and total share one container field and may be serialized as current/total.",
    };
  }

  if (
    field.tomlPath ===
      "track.numbering.disc_number" ||
    field.tomlPath ===
      "track.numbering.disc_total"
  ) {
    if (container === "wav") {
      return {
        status: "omitted",
        note:
          "The controlled WAV fixture did not preserve disc numbering.",
      };
    }

    return {
      status: "normalized",
      note:
        "Current disc number and total share one container field and may be serialized as current/total.",
    };
  }

  if (
    field.tomlPath ===
      "release.primary_artist.name" &&
    container === "wav"
  ) {
    return {
      status: "omitted",
      note:
        "The controlled WAV fixture did not preserve album artist.",
    };
  }

  if (
    field.tomlPath ===
      "track.composers[].name" &&
    container === "wav"
  ) {
    return {
      status: "omitted",
      note:
        "The controlled WAV fixture did not preserve composer.",
    };
  }

  if (
    (
      field.tomlPath ===
        "track.text.comment" ||
      field.tomlPath ===
        "track.text.description"
    ) &&
    (
      container === "flac" ||
      container === "ogg-vorbis" ||
      container === "opus"
    )
  ) {
    return {
      status: "normalized",
      note:
        "Vorbis-style players may merge comment and description into one visible field.",
    };
  }

  return {
    status: "write",
    note:
      "A target-container tag is registered for this canonical field.",
  };
}

function normalizeOutputDirectory(
  outputDirectory: string,
): string {
  const trimmed = outputDirectory.trim();

  if (!trimmed) {
    throw new Error(
      "Output directory must not be empty.",
    );
  }

  if (
    path.posix.isAbsolute(trimmed) ||
    path.win32.isAbsolute(trimmed)
  ) {
    throw new Error(
      "Export-plan output directory must be relative.",
    );
  }

  const normalized = path.posix.normalize(
    trimmed.replaceAll("\\", "/"),
  );

  if (
    normalized === ".." ||
    normalized.startsWith("../")
  ) {
    throw new Error(
      "Export-plan output directory cannot leave the configured output root.",
    );
  }

  return normalized.replace(/^\.\//, "");
}

function findDocument(
  detail: ReleaseMetadataDetail,
  field: MetadataFieldDefinition,
  trackId: string,
): ParsedMetadataDocument | undefined {
  const filename =
    filenameByStorageRole[
      field.storageFileRole
    ];

  if (!filename) {
    return undefined;
  }

  const scope =
    field.scope === "release" ||
    field.storageFileRole.startsWith(
      "release",
    )
      ? "release"
      : "track";

  return detail.documents.find(
    (document) =>
      document.filename === filename &&
      (
        scope === "release" ||
        document.trackId === trackId
      ),
  );
}

function extractValuesAtPath(
  value: unknown,
  segments: string[],
): unknown[] {
  if (segments.length === 0) {
    return [value];
  }

  const [segment, ...remaining] =
    segments;
  const arraySegment =
    segment.endsWith("[]");
  const key = arraySegment
    ? segment.slice(0, -2)
    : segment;

  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    !Object.prototype.hasOwnProperty.call(
      value,
      key,
    )
  ) {
    return [];
  }

  const child =
    (value as Record<string, unknown>)[
      key
    ];

  if (arraySegment) {
    if (!Array.isArray(child)) {
      return [];
    }

    return child.flatMap((entry) =>
      extractValuesAtPath(
        entry,
        remaining,
      ),
    );
  }

  return extractValuesAtPath(
    child,
    remaining,
  );
}

function normalizeExtractedValue(
  values: unknown[],
): ExportPlanField["value"] | null {
  const supported = values.filter(
    (value) =>
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      (
        Array.isArray(value) &&
        value.every(
          (entry) =>
            typeof entry === "string",
        )
      ),
  );

  if (supported.length === 0) {
    return null;
  }

  if (supported.length === 1) {
    return supported[0] as
      ExportPlanField["value"];
  }

  return supported.map(String);
}

function destinationFilename(
  trackId: string,
  container: ExportContainer,
): string {
  /*
   * Audio masters commonly share a generic filename such as
   * "audio-master.wav". Use the unique track directory id so
   * sibling tracks cannot resolve to the same export filename.
   */
  return `${trackId}${extensionByContainer[container]}`;
}

export function buildMetadataExportPlan(
  release: ReleaseScanResult,
  detail: ReleaseMetadataDetail,
  registry:
    readonly MetadataFieldDefinition[],
  options: {
    container: ExportContainer;
    scope?: ExportPlanScope;
    trackId?: string;
    outputDirectory?: string;
  },
): MetadataExportPlan {
  const scope = options.scope ?? "all";

  if (
    scope === "track" &&
    !options.trackId
  ) {
    throw new Error(
      "trackId is required for a track-scoped export plan.",
    );
  }

  const outputDirectory =
    normalizeOutputDirectory(
      options.outputDirectory ??
        path.posix.join(
          "deployment-output",
          release.id,
          options.container,
        ),
    );

  const selectedTracks =
    release.tracks.filter(
      (track) =>
        scope === "all" ||
        track.id === options.trackId,
    );

  if (
    scope === "track" &&
    selectedTracks.length === 0
  ) {
    throw new Error(
      `Track not found: ${options.trackId}`,
    );
  }

  const items = selectedTracks.map(
    (track): ExportPlanItem => {
      const warnings: string[] = [];

      if (track.audioMasters.length === 0) {
        warnings.push(
          "No audio master was found for this track.",
        );
      }

      if (track.audioMasters.length > 1) {
        warnings.push(
          "Multiple audio masters were found; choose a source before export.",
        );
      }

      const source =
        track.audioMasters.length === 1
          ? track.audioMasters[0]
          : undefined;

      const fields: ExportPlanField[] =
        [];

      for (const field of registry) {
        const document = findDocument(
          detail,
          field,
          track.id,
        );

        if (!document) {
          continue;
        }

        const values = extractValuesAtPath(
          document.parsed,
          field.tomlPath.split("."),
        );

        const value =
          normalizeExtractedValue(values);

        if (value === null) {
          continue;
        }

        const targetTags =
          tagsForContainer(
            field,
            options.container,
          );

        const guidance = getFieldStatus(
          field,
          options.container,
          targetTags,
        );

        fields.push({
          canonicalPath: field.tomlPath,
          label: field.label,
          targetTags,
          value,
          status: guidance.status,
          note: guidance.note,
          sourceDocument:
            document.relativePath,
        });
      }

      return {
        trackId: track.id,
        ...(source
          ? {
              sourceAudioRelativePath:
                source.relativePath,
              destinationRelativePath:
                path.posix.join(
                  outputDirectory,
                  destinationFilename(
                    track.id,
                    options.container,
                  ),
                ),
            }
          : {}),
        action:
          source &&
          track.audioMasters.length === 1
            ? "ready"
            : "blocked",
        fields,
        warnings,
      };
    },
  );

  const summary = {
    readyCount: 0,
    blockedCount: 0,
    writeCount: 0,
    normalizedCount: 0,
    omittedCount: 0,
    unverifiedCount: 0,
  };

  for (const item of items) {
    summary[
      item.action === "ready"
        ? "readyCount"
        : "blockedCount"
    ] += 1;

    for (const field of item.fields) {
      switch (field.status) {
        case "write":
          summary.writeCount += 1;
          break;
        case "normalized":
          summary.normalizedCount += 1;
          break;
        case "omitted":
          summary.omittedCount += 1;
          break;
        case "unverified":
          summary.unverifiedCount += 1;
          break;
      }
    }
  }

  return {
    releaseId: release.id,
    container: options.container,
    scope,
    ...(options.trackId
      ? { trackId: options.trackId }
      : {}),
    outputDirectory,
    items,
    summary,
    warnings: [
      ...detail.warnings,
      ...(items.length === 0
        ? ["No tracks matched the selected scope."]
        : []),
    ],
  };
}
