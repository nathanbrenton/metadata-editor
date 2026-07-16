import type {
  MetadataFieldDefinition,
} from "./types.js";

/*
 * Player aliases are populated only after controlled fixture tests.
 * Compatibility notes preserve container-specific behavior.
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
          appleMusic: ["album"],
        },
      },
      playerCompatibility: [
        {
          player: "vlc",
          containers: ["mp3", "flac", "m4a", "ogg-vorbis", "opus", "wav"],
          status: "not-visible",
          note: "Album was embedded but not visible in VLC's macOS Media Information General tab.",
        },
        {
          player: "appleMusic",
          containers: ["mp3", "m4a"],
          status: "verified",
          displayLabel: "album",
          note: "Apple Music displayed the embedded album value in Song Info.",
        },
      ],
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
          appleMusic: ["album artist"],
        },
      },
      playerCompatibility: [
        {
          player: "vlc",
          containers: ["mp3", "flac", "m4a", "ogg-vorbis", "opus", "wav"],
          status: "not-visible",
          note: "Album artist was not visible in VLC's macOS Media Information window.",
        },
        {
          player: "appleMusic",
          containers: ["mp3", "m4a"],
          status: "verified",
          displayLabel: "album artist",
          note: "Apple Music displayed the embedded album-artist value in Song Info.",
        },
      ],
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
          vlc: ["Date"],
          appleMusic: ["year"],
        },
      },
      playerCompatibility: [
        {
          player: "vlc",
          containers: ["mp3", "flac", "m4a", "ogg-vorbis", "opus", "wav"],
          status: "partial",
          displayLabel: "Date",
          note: "VLC preserved the full date for FLAC, OGG Vorbis, and Opus, but displayed only the year for MP3, M4A, and WAV.",
        },
        {
          player: "appleMusic",
          containers: ["mp3", "m4a"],
          status: "partial",
          displayLabel: "year",
          note: "Apple Music normalized the embedded full date to a four-digit year.",
        },
      ],
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
          vlc: ["Title"],
          appleMusic: ["title"],
        },
      },
      playerCompatibility: [
        {
          player: "vlc",
          containers: ["mp3", "flac", "m4a", "ogg-vorbis", "opus", "wav"],
          status: "verified",
          displayLabel: "Title",
          note: "VLC displayed the embedded title consistently across all tested containers.",
        },
        {
          player: "appleMusic",
          containers: ["mp3", "m4a"],
          status: "verified",
          displayLabel: "title",
          note: "Apple Music displayed the embedded title in Song Info.",
        },
      ],
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
          vlc: ["Artist"],
          appleMusic: ["artist"],
        },
      },
      playerCompatibility: [
        {
          player: "vlc",
          containers: ["mp3", "flac", "m4a", "ogg-vorbis", "opus", "wav"],
          status: "verified",
          displayLabel: "Artist",
          note: "VLC displayed the embedded track artist consistently across all tested containers.",
        },
        {
          player: "appleMusic",
          containers: ["mp3", "m4a"],
          status: "verified",
          displayLabel: "artist",
          note: "Apple Music displayed the embedded artist in Song Info.",
        },
      ],
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
          vlc: ["Track number"],
          appleMusic: ["track"],
        },
      },
      playerCompatibility: [
        {
          player: "vlc",
          containers: ["mp3", "flac", "m4a", "ogg-vorbis", "opus", "wav"],
          status: "partial",
          displayLabel: "Track number",
          note: "VLC displayed the current track number but omitted the embedded track total.",
        },
        {
          player: "appleMusic",
          containers: ["mp3", "m4a"],
          status: "verified",
          displayLabel: "track",
          note: "Apple Music displayed both current track number and track total.",
        },
      ],
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
          vlc: ["Genre"],
          appleMusic: ["genre"],
        },
      },
      playerCompatibility: [
        {
          player: "vlc",
          containers: ["mp3", "flac", "m4a", "ogg-vorbis", "opus", "wav"],
          status: "verified",
          displayLabel: "Genre",
          note: "VLC displayed the embedded genre consistently across all tested containers.",
        },
        {
          player: "appleMusic",
          containers: ["mp3", "m4a"],
          status: "verified",
          displayLabel: "genre",
          note: "Apple Music displayed the embedded genre in Song Info.",
        },
      ],
      displayPolicy: "auto",
    },
    {
      id: "release.language",
      canonicalName: "release.language",
      label: "Release Language",
      description:
        "Primary lyrical language for the release, preferably as an ISO 639-1 code.",
      scope: "release",
      storageFileRole: "release",
      tomlPath: "release.language",
      valueType: "string",
      required: false,
      repeatable: false,
      inherited: false,
      aliases: {
        ffmpeg: ["language"],
        vorbis: ["LANGUAGE"],
        players: {
          vlc: ["Language"],
          appleMusic: [],
        },
      },
      playerCompatibility: [
        {
          player: "vlc",
          containers: ["mp3", "flac", "ogg-vorbis", "opus"],
          status: "partial",
          displayLabel: "Language",
          note:
            "VLC displayed language for MP3, FLAC, OGG Vorbis, and Opus, but not for M4A or WAV.",
        },
        {
          player: "appleMusic",
          containers: ["mp3", "m4a"],
          status: "not-visible",
          note:
            "Apple Music did not expose the embedded language value in the inspected Song Info tabs.",
        },
      ],
      displayPolicy: "auto",
    },
    {
      id: "track.language",
      canonicalName: "track.language",
      label: "Track Language",
      description:
        "Primary lyrical language for the track, preferably as an ISO 639-1 code.",
      scope: "track",
      storageFileRole: "track",
      tomlPath: "track.language",
      valueType: "string",
      required: false,
      repeatable: false,
      inherited: true,
      aliases: {
        ffmpeg: ["language"],
        vorbis: ["LANGUAGE"],
        players: {
          vlc: ["Language"],
          appleMusic: [],
        },
      },
      playerCompatibility: [
        {
          player: "vlc",
          containers: ["mp3", "flac", "ogg-vorbis", "opus"],
          status: "partial",
          displayLabel: "Language",
          note:
            "VLC displayed language for several containers and exposed it in codec details for OGG Vorbis and Opus.",
        },
        {
          player: "appleMusic",
          containers: ["mp3", "m4a"],
          status: "not-visible",
          note:
            "Apple Music did not expose the embedded language value in the inspected Song Info tabs.",
        },
      ],
      displayPolicy: "auto",
    },
    {
      id: "track.numbering.track_total",
      canonicalName: "track.numbering.track_total",
      label: "Track Total",
      description:
        "Declared total number of tracks on the current disc.",
      scope: "track",
      storageFileRole: "track",
      tomlPath: "track.numbering.track_total",
      valueType: "integer",
      required: false,
      repeatable: false,
      inherited: false,
      aliases: {
        ffmpeg: ["track"],
        id3: ["TRCK"],
        vorbis: ["TRACKTOTAL", "TOTALTRACKS"],
        mp4: ["trkn"],
        players: {
          vlc: [],
          appleMusic: ["track"],
        },
      },
      playerCompatibility: [
        {
          player: "vlc",
          containers: ["mp3", "flac", "m4a", "ogg-vorbis", "opus", "wav"],
          status: "not-visible",
          note:
            "VLC displayed the current track number but not the embedded track total.",
        },
        {
          player: "appleMusic",
          containers: ["mp3", "m4a"],
          status: "verified",
          displayLabel: "track",
          note:
            "Apple Music displayed the track total as the value after 'of'.",
        },
      ],
      displayPolicy: "auto",
    },
    {
      id: "track.numbering.disc_number",
      canonicalName: "track.numbering.disc_number",
      label: "Disc Number",
      description:
        "Disc or volume number containing the track.",
      scope: "track",
      storageFileRole: "track",
      tomlPath: "track.numbering.disc_number",
      valueType: "integer",
      required: false,
      repeatable: false,
      inherited: false,
      aliases: {
        ffmpeg: ["disc"],
        id3: ["TPOS"],
        vorbis: ["DISCNUMBER"],
        mp4: ["disk"],
        players: {
          vlc: [],
          appleMusic: ["disc number"],
        },
      },
      playerCompatibility: [
        {
          player: "vlc",
          containers: ["mp3", "flac", "m4a", "ogg-vorbis", "opus", "wav"],
          status: "not-visible",
          note:
            "Disc numbering was not visible in VLC's macOS Media Information window.",
        },
        {
          player: "appleMusic",
          containers: ["mp3", "m4a"],
          status: "verified",
          displayLabel: "disc number",
          note:
            "Apple Music displayed the current disc number in Song Info.",
        },
      ],
      displayPolicy: "auto",
    },
    {
      id: "track.numbering.disc_total",
      canonicalName: "track.numbering.disc_total",
      label: "Disc Total",
      description:
        "Declared total number of discs or volumes.",
      scope: "track",
      storageFileRole: "track",
      tomlPath: "track.numbering.disc_total",
      valueType: "integer",
      required: false,
      repeatable: false,
      inherited: true,
      aliases: {
        ffmpeg: ["disc"],
        id3: ["TPOS"],
        vorbis: ["DISCTOTAL", "TOTALDISCS"],
        mp4: ["disk"],
        players: {
          vlc: [],
          appleMusic: ["disc number"],
        },
      },
      playerCompatibility: [
        {
          player: "vlc",
          containers: ["mp3", "flac", "m4a", "ogg-vorbis", "opus", "wav"],
          status: "not-visible",
          note:
            "The disc total was not visible in VLC's macOS Media Information window.",
        },
        {
          player: "appleMusic",
          containers: ["mp3", "m4a"],
          status: "verified",
          displayLabel: "disc number",
          note:
            "Apple Music displayed the disc total as the value after 'of'.",
        },
      ],
      displayPolicy: "auto",
    },
    {
      id: "track.composers[].name",
      canonicalName: "track.composers[].name",
      label: "Composer",
      description:
        "Name credited for one composition record.",
      scope: "credit",
      storageFileRole: "track-credits",
      tomlPath: "track.composers[].name",
      valueType: "string",
      required: false,
      repeatable: true,
      inherited: false,
      aliases: {
        ffmpeg: ["composer"],
        id3: ["TCOM"],
        vorbis: ["COMPOSER"],
        mp4: ["©wrt"],
        players: {
          vlc: [],
          appleMusic: ["composer"],
        },
      },
      playerCompatibility: [
        {
          player: "vlc",
          containers: ["mp3", "flac", "m4a", "ogg-vorbis", "opus", "wav"],
          status: "not-visible",
          note:
            "Composer was embedded but not visible in VLC's macOS Media Information panels.",
        },
        {
          player: "appleMusic",
          containers: ["mp3", "m4a"],
          status: "verified",
          displayLabel: "composer",
          note:
            "Apple Music displayed the embedded composer in Song Info.",
        },
      ],
      displayPolicy: "auto",
    },
    {
      id: "track.text.description",
      canonicalName: "track.text.description",
      label: "Track Description",
      description:
        "Public-facing descriptive text for the track.",
      scope: "track",
      storageFileRole: "track",
      tomlPath: "track.text.description",
      valueType: "string",
      required: false,
      repeatable: false,
      inherited: false,
      aliases: {
        ffmpeg: ["description"],
        vorbis: ["DESCRIPTION"],
        players: {
          vlc: ["Description"],
          appleMusic: [],
        },
      },
      playerCompatibility: [
        {
          player: "vlc",
          containers: ["flac", "ogg-vorbis", "opus"],
          status: "partial",
          displayLabel: "Description",
          note:
            "VLC merged the embedded description with comment text for Vorbis-style containers.",
        },
        {
          player: "appleMusic",
          containers: ["mp3", "m4a"],
          status: "not-visible",
          note:
            "Apple Music did not expose the generic description value in the inspected Song Info tabs.",
        },
      ],
      displayPolicy: "auto",
    },
    {
      id: "track.text.comment",
      canonicalName: "track.text.comment",
      label: "Track Comment",
      description:
        "General-purpose exportable comment for the track.",
      scope: "track",
      storageFileRole: "track",
      tomlPath: "track.text.comment",
      valueType: "string",
      required: false,
      repeatable: false,
      inherited: false,
      aliases: {
        ffmpeg: ["comment"],
        id3: ["COMM"],
        vorbis: ["COMMENT"],
        mp4: ["©cmt"],
        riff: ["ICMT"],
        players: {
          vlc: ["Description"],
          appleMusic: ["comments"],
        },
      },
      playerCompatibility: [
        {
          player: "vlc",
          containers: ["flac", "m4a", "ogg-vorbis", "opus", "wav"],
          status: "partial",
          displayLabel: "Description",
          note:
            "VLC displayed comment under Description; FLAC, OGG Vorbis, and Opus also merged description text.",
        },
        {
          player: "appleMusic",
          containers: ["m4a"],
          status: "verified",
          displayLabel: "comments",
          note:
            "Apple Music displayed the M4A comment in Song Info. The MP3 fixture did not visibly populate comments.",
        },
      ],
      displayPolicy: "auto",
    },
    {
      id: "release.rights.copyright",
      canonicalName: "release.rights.copyright",
      label: "Copyright",
      description:
        "Copyright statement for release packaging, artwork, text, or compositions.",
      scope: "release",
      storageFileRole: "release",
      tomlPath: "release.rights.copyright",
      valueType: "string",
      required: false,
      repeatable: false,
      inherited: false,
      aliases: {
        ffmpeg: ["copyright"],
        id3: ["TCOP"],
        vorbis: ["COPYRIGHT"],
        mp4: ["cprt"],
        riff: ["ICOP"],
        players: {
          vlc: ["Copyright"],
          appleMusic: ["copyright"],
        },
      },
      playerCompatibility: [
        {
          player: "vlc",
          containers: ["mp3", "flac", "ogg-vorbis", "opus"],
          status: "partial",
          displayLabel: "Copyright",
          note:
            "VLC displayed copyright for MP3, FLAC, OGG Vorbis, and Opus, but not for M4A or WAV.",
        },
        {
          player: "appleMusic",
          containers: ["m4a"],
          status: "verified",
          displayLabel: "copyright",
          note:
            "Apple Music displayed the M4A copyright value on the File tab. The MP3 fixture did not visibly expose it.",
        },
      ],
      displayPolicy: "auto",
    },
    {
      id: "release.rights.publisher",
      canonicalName: "release.rights.publisher",
      label: "Publisher",
      description:
        "Music publisher or publishing administrator for the release.",
      scope: "release",
      storageFileRole: "release",
      tomlPath: "release.rights.publisher",
      valueType: "string",
      required: false,
      repeatable: false,
      inherited: false,
      aliases: {
        ffmpeg: ["publisher"],
        id3: ["TPUB"],
        vorbis: ["PUBLISHER"],
        players: {
          vlc: ["Publisher"],
          appleMusic: [],
        },
      },
      playerCompatibility: [
        {
          player: "vlc",
          containers: ["mp3"],
          status: "partial",
          displayLabel: "Publisher",
          note:
            "VLC displayed publisher for MP3 but not for the other tested containers.",
        },
        {
          player: "appleMusic",
          containers: ["mp3", "m4a"],
          status: "not-visible",
          note:
            "Apple Music did not expose publisher in the inspected Song Info tabs.",
        },
      ],
      displayPolicy: "auto",
    },
    {
      id: "track.audio.bpm",
      canonicalName: "track.audio.bpm",
      label: "BPM",
      description:
        "Tempo in beats per minute.",
      scope: "track",
      storageFileRole: "track",
      tomlPath: "track.audio.bpm",
      valueType: "number",
      required: false,
      repeatable: false,
      inherited: false,
      aliases: {
        ffmpeg: ["bpm"],
        id3: ["TBPM"],
        vorbis: ["BPM"],
        mp4: ["tmpo"],
        players: {
          vlc: [],
          appleMusic: ["bpm"],
        },
      },
      playerCompatibility: [
        {
          player: "vlc",
          containers: ["mp3", "flac", "m4a", "ogg-vorbis", "opus", "wav"],
          status: "not-visible",
          note:
            "BPM was not visible in VLC's macOS Media Information panels.",
        },
        {
          player: "appleMusic",
          containers: ["mp3", "m4a"],
          status: "not-visible",
          displayLabel: "bpm",
          note:
            "Apple Music exposed a BPM field but did not populate it from the generic FFmpeg bpm tag in these fixtures.",
        },
      ],
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
