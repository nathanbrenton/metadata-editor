import {
  parse,
  stringify,
} from "smol-toml";

import type {
  GeneratedMetadataDocument,
  MetadataGenerationPlan,
  MetadataStorageRole,
  ReleaseScanResult,
} from "./types.js";

export type StarterTrackInput = {
  trackId: string;
  trackNumber: number;
  artist: string;
  title: string;
};

export type StarterMetadataInput = {
  releaseId: string;
  releaseTitle: string;
  releaseDate: string;
  releaseArtist: string;
  tracks: StarterTrackInput[];
};

type TomlDocument = Record<string, unknown>;

function renderDocument(
  storageRole: MetadataStorageRole,
  filename: string,
  relativePath: string,
  data: TomlDocument,
): GeneratedMetadataDocument {
  const content = `${stringify(data).trimEnd()}\n`;

  parse(content);

  return {
    storageRole,
    filename,
    relativePath,
    content,
    validated: true,
  };
}

function requireText(
  value: string,
  label: string,
): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`${label} is required.`);
  }

  return normalized;
}

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

export function buildStarterMetadataPlan(
  release: ReleaseScanResult,
  input: StarterMetadataInput,
): MetadataGenerationPlan {
  if (input.releaseId !== release.id) {
    throw new Error(
      "Starter metadata release does not match the scanned release.",
    );
  }

  const releaseTitle = requireText(
    input.releaseTitle,
    "Release title",
  );
  const releaseDate = requireText(
    input.releaseDate,
    "Release date",
  );
  const releaseArtist = requireText(
    input.releaseArtist,
    "Release artist",
  );

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(
      releaseDate,
    )
  ) {
    throw new Error(
      "Release date must use YYYY-MM-DD.",
    );
  }

  if (
    input.tracks.length !==
    release.tracks.length
  ) {
    throw new Error(
      "Starter metadata must include every discovered track exactly once.",
    );
  }

  const inputsByTrackId = new Map(
    input.tracks.map((track) => [
      track.trackId,
      track,
    ]),
  );

  if (
    inputsByTrackId.size !==
    release.tracks.length
  ) {
    throw new Error(
      "Starter metadata contains duplicate or missing track IDs.",
    );
  }

  const trackNumbers = new Set<number>();

  const normalizedTracks =
    release.tracks.map((track) => {
      const inputTrack =
        inputsByTrackId.get(track.id);

      if (!inputTrack) {
        throw new Error(
          `Missing starter metadata for track: ${track.id}`,
        );
      }

      if (
        !Number.isSafeInteger(
          inputTrack.trackNumber,
        ) ||
        inputTrack.trackNumber < 1
      ) {
        throw new Error(
          `${track.id}: track number must be a positive integer.`,
        );
      }

      if (
        trackNumbers.has(
          inputTrack.trackNumber,
        )
      ) {
        throw new Error(
          `Duplicate track number: ${inputTrack.trackNumber}`,
        );
      }

      trackNumbers.add(
        inputTrack.trackNumber,
      );

      return {
        scan: track,
        trackNumber:
          inputTrack.trackNumber,
        artist: requireText(
          inputTrack.artist,
          `${track.id} artist`,
        ),
        title: requireText(
          inputTrack.title,
          `${track.id} title`,
        ),
      };
    });

  const artworkMaster =
    release.artworkMasters[0];

  const releaseDocument: TomlDocument = {
    schema: {
      name: "audio-release-metadata",
      version: 1,
    },

    release: {
      id: release.id,
      title: releaseTitle,
      subtitle: "",
      version: "",
      type: "",
      status: "official",
      language: "",
      script: "",

      primary_artist: {
        name: releaseArtist,
        sort_name: "",
      },

      dates: {
        release: releaseDate,
        original_release: "",
      },

      numbering: {
        track_total:
          normalizedTracks.length,
        disc_total: 1,
      },

      artwork: artworkMaster
        ? [
            {
              id: "front-cover",
              role: "front-cover",
              primary: true,
              master_path:
                relativeToDirectory(
                  release.relativePath,
                  artworkMaster.relativePath,
                ),
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

  const documents: GeneratedMetadataDocument[] =
    [
      renderDocument(
        "release",
        "release.toml",
        `${release.relativePath}/release.toml`,
        releaseDocument,
      ),
    ];

  for (const track of normalizedTracks) {
    const audioMaster =
      track.scan.audioMasters[0];
    const artwork =
      track.scan.artworkMasters[0];

    const trackDocument: TomlDocument = {
      schema: {
        name: "audio-track-metadata",
        version: 1,
      },

      release_reference: {
        release_id: release.id,
      },

      track: {
        id: track.scan.id,
        title: track.title,
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
          track_number:
            track.trackNumber,
          track_total:
            normalizedTracks.length,
          disc_number: 1,
          disc_total: 1,
        },

        assets: {
          audio_master:
            relativeToDirectory(
              track.scan.relativePath,
              audioMaster?.relativePath,
            ),
          audio_playback: "",
          waveform_peaks: "",

          artwork: {
            master:
              relativeToDirectory(
                track.scan.relativePath,
                artwork?.relativePath,
              ),
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
        track_id: track.scan.id,
      },

      track: {
        primary_artist: {
          name: track.artist,
          sort_name: "",
        },

        album_artists: [
          {
            name: releaseArtist,
            sort_name: "",
          },
        ],
        featured_artists: [],
        remixers: [],
        performers: [],
      },
    };

    documents.push(
      renderDocument(
        "track",
        "track.toml",
        `${track.scan.relativePath}/track.toml`,
        trackDocument,
      ),
      renderDocument(
        "track-credits",
        "track-credits.toml",
        `${track.scan.relativePath}/track-credits.toml`,
        creditsDocument,
      ),
    );
  }

  const existingPaths = new Set(
    [
      ...release.metadataFiles,
      ...release.tracks.flatMap(
        (track) => track.metadataFiles,
      ),
    ]
      .filter((file) => file.exists)
      .map((file) => file.relativePath),
  );

  const items = documents.map(
    (document) => {
      const exists = existingPaths.has(
        document.relativePath,
      );

      return {
        ...document,
        action: exists
          ? ("blocked" as const)
          : ("create" as const),
        reason: exists
          ? "Target file already exists; overwrite is not allowed."
          : "Starter metadata target is missing and may be created.",
      };
    },
  );

  return {
    releaseId: release.id,
    scope: "all",
    items,
    summary: {
      createCount: items.filter(
        (item) =>
          item.action === "create",
      ).length,
      blockedCount: items.filter(
        (item) =>
          item.action === "blocked",
      ).length,
    },
    warnings: [],
  };
}
