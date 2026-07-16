import type {
  MetadataFieldDefinition,
} from "./types.js";

/*
 * Player aliases remain empty until confirmed through controlled
 * FFmpeg-generated test media in VLC and Apple Music.
 */
export const metadataFieldRegistry:
  readonly MetadataFieldDefinition[] = [
    {
      id: "release.id",
      canonicalName: "release.id",
      label: "Release ID",
      description:
        "Stable internal identifier for the release.",
      scope: "release",
      storageFileRole: "release",
      tomlPath: "release.id",
      valueType: "string",
      required: true,
      repeatable: false,
      inherited: false,
      displayPolicy: "developer",
    },
    {
      id: "release.title",
      canonicalName: "release.title",
      label: "Release Title",
      description:
        "Public title of the release.",
      scope: "release",
      storageFileRole: "release",
      tomlPath: "release.title",
      valueType: "string",
      required: true,
      repeatable: false,
      inherited: false,
      aliases: {
        ffmpeg: ["album"],
        id3: ["TALB"],
        vorbis: ["ALBUM"],
        mp4: ["©alb"],
        players: {
          vlc: [],
          appleMusic: [],
        },
      },
      displayPolicy: "always",
    },
    {
      id: "release.primary_artist.name",
      canonicalName:
        "release.primary_artist.name",
      label: "Release Artist",
      description:
        "Primary credited artist for the release.",
      scope: "release",
      storageFileRole: "release",
      tomlPath:
        "release.primary_artist.name",
      valueType: "string",
      required: false,
      repeatable: false,
      inherited: false,
      aliases: {
        ffmpeg: ["album_artist"],
        id3: ["TPE2"],
        vorbis: ["ALBUMARTIST"],
        mp4: ["aART"],
        players: {
          vlc: [],
          appleMusic: [],
        },
      },
      displayPolicy: "auto",
    },
    {
      id: "release.dates.release",
      canonicalName:
        "release.dates.release",
      label: "Release Date",
      description:
        "Release date in ISO-style YYYY-MM-DD form when known.",
      scope: "release",
      storageFileRole: "release",
      tomlPath: "release.dates.release",
      valueType: "date",
      required: false,
      repeatable: false,
      inherited: false,
      aliases: {
        ffmpeg: ["date"],
        id3: ["TDRC"],
        vorbis: ["DATE"],
        mp4: ["©day"],
        players: {
          vlc: [],
          appleMusic: [],
        },
      },
      displayPolicy: "auto",
    },
    {
      id: "track.id",
      canonicalName: "track.id",
      label: "Track ID",
      description:
        "Stable internal identifier for the track.",
      scope: "track",
      storageFileRole: "track",
      tomlPath: "track.id",
      valueType: "string",
      required: true,
      repeatable: false,
      inherited: false,
      displayPolicy: "developer",
    },
    {
      id: "track.title",
      canonicalName: "track.title",
      label: "Track Title",
      description:
        "Public title of the track.",
      scope: "track",
      storageFileRole: "track",
      tomlPath: "track.title",
      valueType: "string",
      required: true,
      repeatable: false,
      inherited: false,
      aliases: {
        ffmpeg: ["title"],
        id3: ["TIT2"],
        vorbis: ["TITLE"],
        mp4: ["©nam"],
        riff: ["INAM"],
        players: {
          vlc: [],
          appleMusic: [],
        },
      },
      displayPolicy: "always",
    },
    {
      id: "track.primary_artist.name",
      canonicalName:
        "track.primary_artist.name",
      label: "Track Artist",
      description:
        "Primary credited artist for the track.",
      scope: "credit",
      storageFileRole: "track-credits",
      tomlPath:
        "track.primary_artist.name",
      valueType: "string",
      required: false,
      repeatable: false,
      inherited: true,
      aliases: {
        ffmpeg: ["artist"],
        id3: ["TPE1"],
        vorbis: ["ARTIST"],
        mp4: ["©ART"],
        riff: ["IART"],
        players: {
          vlc: [],
          appleMusic: [],
        },
      },
      displayPolicy: "auto",
    },
    {
      id: "track.numbering.track_number",
      canonicalName:
        "track.numbering.track_number",
      label: "Track Number",
      description:
        "Track sequence number as a TOML integer without leading zeroes.",
      scope: "track",
      storageFileRole: "track",
      tomlPath:
        "track.numbering.track_number",
      valueType: "integer",
      required: false,
      repeatable: false,
      inherited: false,
      aliases: {
        ffmpeg: ["track"],
        id3: ["TRCK"],
        vorbis: ["TRACKNUMBER"],
        mp4: ["trkn"],
        players: {
          vlc: [],
          appleMusic: [],
        },
      },
      displayPolicy: "auto",
    },
    {
      id: "track.explicit",
      canonicalName: "track.explicit",
      label: "Explicit Content",
      description:
        "Whether the track is marked as explicit.",
      scope: "track",
      storageFileRole: "track",
      tomlPath: "track.explicit",
      valueType: "boolean",
      required: false,
      repeatable: false,
      inherited: false,
      aliases: {
        players: {
          vlc: [],
          appleMusic: [],
        },
      },
      displayPolicy: "auto",
    },
    {
      id: "release.genres",
      canonicalName: "release.genres",
      label: "Genres",
      description:
        "One or more genre values associated with the release.",
      scope: "release",
      storageFileRole: "release",
      tomlPath: "release.genres",
      valueType: "string-array",
      required: false,
      repeatable: true,
      inherited: false,
      aliases: {
        ffmpeg: ["genre"],
        id3: ["TCON"],
        vorbis: ["GENRE"],
        mp4: ["©gen"],
        riff: ["IGNR"],
        players: {
          vlc: [],
          appleMusic: [],
        },
      },
      displayPolicy: "auto",
    },
    {
      id: "track.performers[].name",
      canonicalName:
        "track.performers[].name",
      label: "Performer Name",
      description:
        "Name credited for one performer record.",
      scope: "credit",
      storageFileRole: "track-credits",
      tomlPath: "track.performers[].name",
      valueType: "string",
      required: false,
      repeatable: true,
      inherited: false,
      aliases: {
        players: {
          vlc: [],
          appleMusic: [],
        },
      },
      displayPolicy: "auto",
    },
    {
      id: "track.performers[].role",
      canonicalName:
        "track.performers[].role",
      label: "Performance Role",
      description:
        "Instrument, vocal, or other credited performance role.",
      scope: "credit",
      storageFileRole: "track-credits",
      tomlPath: "track.performers[].role",
      valueType: "string",
      required: false,
      repeatable: true,
      inherited: false,
      aliases: {
        players: {
          vlc: [],
          appleMusic: [],
        },
      },
      displayPolicy: "auto",
    },
    {
      id: "track.performers[].sort_name",
      canonicalName:
        "track.performers[].sort_name",
      label: "Performer Sort Name",
      description:
        "Optional normalized name used when sorting performer credits.",
      scope: "credit",
      storageFileRole: "track-credits",
      tomlPath:
        "track.performers[].sort_name",
      valueType: "string",
      required: false,
      repeatable: true,
      inherited: false,
      displayPolicy: "developer",
    },
  ];

export function findMetadataField(
  tomlPath: string,
): MetadataFieldDefinition | null {
  return (
    metadataFieldRegistry.find(
      (field) => field.tomlPath === tomlPath,
    ) ?? null
  );
}
