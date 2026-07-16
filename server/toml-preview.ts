import {
  parse,
  stringify,
} from "smol-toml";

import type {
  GeneratedMetadataDocument,
  GeneratedMetadataPreview,
  LibraryMetadataPreview,
  MetadataStorageRole,
  ReleaseScanResult,
  TrackMetadataPreview,
  TrackScanResult,
} from "./types.js";

type TomlDocument = Record<string, unknown>;

function relativeToDirectory(
  directoryRelativePath: string,
  assetRelativePath: string | undefined,
): string {
  if (!assetRelativePath) {
    return "";
  }

  const prefix = `${directoryRelativePath}/`;

  return assetRelativePath.startsWith(prefix)
    ? assetRelativePath.slice(prefix.length)
    : assetRelativePath;
}

function renderDocument(
  storageRole: MetadataStorageRole,
  filename: string,
  relativePath: string,
  data: TomlDocument,
): GeneratedMetadataDocument {
  const content = `${stringify(data).trimEnd()}\n`;

  // Parse the exact serialized output before exposing it as valid.
  parse(content);

  return {
    storageRole,
    filename,
    relativePath,
    content,
    validated: true,
  };
}

function buildReleaseDocuments(
  release: ReleaseScanResult,
  preview: LibraryMetadataPreview,
): GeneratedMetadataDocument[] {
  const releaseId =
    preview.release.releaseId.value;

  const artworkMaster =
    relativeToDirectory(
      release.relativePath,
      preview.release.artworkMasterPath?.value,
    );

  const releaseDocument: TomlDocument = {
    schema: {
      name: "audio-release-metadata",
      version: 1,
    },

    release: {
      id: releaseId,
      title:
        preview.release.releaseTitle?.value ?? "",
      subtitle: "",
      version: "",
      type: "",
      status: "official",
      language: "",
      script: "",

      primary_artist: {
        // A release-level artist cannot be safely inferred here.
        name: "",
        sort_name: "",
      },

      dates: {
        release:
          preview.release.releaseDate?.value ?? "",
        original_release: "",
      },

      artwork: artworkMaster
        ? [
            {
              id: "front-cover",
              role: "front-cover",
              primary: true,
              master_path: artworkMaster,
              web_path: "",
              embedded_path: "",
              description: "",
              credits: [],
              copyright: "",
            },
          ]
        : [],
    },
  };

  const settingsDocument: TomlDocument = {
    schema: {
      name: "audio-release-settings",
      version: 1,
    },

    release_reference: {
      release_id: releaseId,
    },

    settings: {
      files: {
        missing_optional_file_policy:
          "notice",
        missing_required_file_policy:
          "error",
        missing_track_policy: "notice",
        duplicate_track_number_policy:
          "error",
        missing_track_credits_policy:
          "notice",
        missing_track_production_notes_policy:
          "notice",
        missing_track_analysis_policy:
          "notice",
        missing_waveform_policy:
          "notice",
      },

      inheritance: {
        empty_string_policy: "inherit",
        zero_integer_policy: "inherit",
        empty_array_policy: "inherit",
        boolean_policy: "explicit",
        track_artwork_overrides_release:
          true,
        release_artwork_fallback: true,
        release_artwork_fallback_path:
          "artwork/front/artwork.webp",
      },

      normalization: {
        trim_strings: true,
        discard_empty_array_entries: true,
        deduplicate_string_arrays: true,
      },
    },
  };

  const productionDocument: TomlDocument = {
    schema: {
      name:
        "audio-release-production-notes",
      version: 1,
    },

    release_reference: {
      release_id: releaseId,
    },

    production: {
      production_type: "",
      location: "",
      city: "",
      region: "",
      country: "",
      daw: "",
      daw_version: "",
      production_medium: "",
      notes: "",

      project: {
        project_name: "",
        project_directory: "",
        asset_notes: "",
        dependency_notes: "",
      },

      recording: {
        location: "",
        system: "",
        notes: "",
      },

      sequencing: {
        notes: "",
      },
    },
  };

  return [
    renderDocument(
      "release",
      "release.toml",
      `${release.relativePath}/release.toml`,
      releaseDocument,
    ),
    renderDocument(
      "release-settings",
      "release-settings.toml",
      `${release.relativePath}/release-settings.toml`,
      settingsDocument,
    ),
    renderDocument(
      "release-production-notes",
      "release-production-notes.toml",
      `${release.relativePath}/release-production-notes.toml`,
      productionDocument,
    ),
  ];
}

function buildTrackDocuments(
  release: ReleaseScanResult,
  track: TrackScanResult,
  preview: TrackMetadataPreview,
): GeneratedMetadataDocument[] {
  const releaseId = release.id;
  const trackId = preview.trackId.value;

  const audioMaster =
    relativeToDirectory(
      track.relativePath,
      preview.audioMasterPath?.value,
    );

  const artworkMaster =
    relativeToDirectory(
      track.relativePath,
      preview.artworkMasterPath?.value,
    );

  const trackDocument: TomlDocument = {
    schema: {
      name: "audio-track-metadata",
      version: 1,
    },

    release_reference: {
      release_id: releaseId,
    },

    track: {
      id: trackId,
      title: preview.trackTitle?.value ?? "",
      version: "",
      subtitle: "",
      display_title: "",
      sort_title: "",
      language: "",
      script: "",
      explicit: false,

      credit_sources: {
        file: "track-credits.toml",
        missing_file_policy: "notice",
      },

      production_note_sources: {
        file: "track-production-notes.toml",
        missing_file_policy: "notice",
      },

      numbering: {
        // This remains a TOML integer without leading zeroes.
        track_number:
          preview.trackNumber?.value ?? 0,
        track_total: 0,
        disc_number: 1,
        disc_total: 1,
      },

      assets: {
        audio_master: audioMaster,
        audio_playback: "",
        waveform_peaks: "",

        artwork: {
          master: artworkMaster,
          web: "",
          embedded: "",
          web_mime_type: "",
          embedded_mime_type: "",
          description: "",
        },
      },
    },
  };

  const creditsDocument: TomlDocument = {
    schema: {
      name:
        "audio-track-credits-metadata",
      version: 1,
    },

    track_reference: {
      track_id: trackId,
    },

    track: {
      primary_artist: {
        name:
          preview.artistName?.value ?? "",
        sort_name: "",
      },

      album_artists: [],
      featured_artists: [],
      remixers: [],
      performers: [],
    },
  };

  const productionDocument: TomlDocument = {
    schema: {
      name:
        "audio-track-production-notes",
      version: 1,
    },

    track_reference: {
      track_id: trackId,
    },

    production: {
      production_type: "",
      location: "",
      room: "",
      city: "",
      region: "",
      country: "",
      daw: "",
      daw_version: "",
      session_file: "",
      production_medium: "",
      notes: "",

      recording: {
        location: "",
        system: "",
        revision: "",
        notes: "",
      },
    },
  };

  return [
    renderDocument(
      "track",
      "track.toml",
      `${track.relativePath}/track.toml`,
      trackDocument,
    ),
    renderDocument(
      "track-credits",
      "track-credits.toml",
      `${track.relativePath}/track-credits.toml`,
      creditsDocument,
    ),
    renderDocument(
      "track-production-notes",
      "track-production-notes.toml",
      `${track.relativePath}/track-production-notes.toml`,
      productionDocument,
    ),
  ];
}

export function buildGeneratedTomlPreview(
  release: ReleaseScanResult,
  preview: LibraryMetadataPreview,
): GeneratedMetadataPreview {
  const documents = buildReleaseDocuments(
    release,
    preview,
  );

  for (
    let index = 0;
    index < release.tracks.length;
    index += 1
  ) {
    const track = release.tracks[index];
    const trackPreview = preview.tracks[index];

    if (!track || !trackPreview) {
      continue;
    }

    documents.push(
      ...buildTrackDocuments(
        release,
        track,
        trackPreview,
      ),
    );
  }

  return {
    releaseId: release.id,
    documents,
    warnings: [...preview.warnings],
  };
}
