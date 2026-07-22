import type {
  MetadataFieldDefinition,
} from "./types.js";
import {
  artworkRoleOptions,
  camelotKeyOptions,
  contributorRoleOptions,
  languageCodeOptions,
  musicalKeyOptions,
  performanceRoleOptions,
  releaseStatusOptions,
  releaseTypeOptions,
  releaseVersionOptions,
  scriptCodeOptions,
  timeSignatureOptions,
  trackVersionOptions,
} from "./metadata-vocabularies.js";

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
      presentation: {
        group: "Developer / Advanced",
        order: 10,
        help:
          "Stable internal identifier. Keep it synchronized with the release directory name and references.",
      },
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
      presentation: {
        group: "Release & Track Identity",
        order: 10,
        examples: [
          "Sine Sweeps",
          "Live at the Forum",
        ],
        help:
          "Enter the public release title exactly as it should appear in players and storefronts.",
      },
      displayPolicy: "always",
    },
    {
      id: "release.identifiers.upc",
      canonicalName:
        "release.identifiers.upc",
      label: "UPC",
      description:
        "Universal Product Code assigned to the commercial release.",
      scope: "release",
      storageFileRole: "release",
      tomlPath:
        "release.identifiers.upc",
      valueType: "string",
      required: false,
      repeatable: false,
      inherited: false,
      presentation: {
        group: "Music Business & Rights",
        order: 40,
        examples: [
          "012345678905",
        ],
        help:
          "Use this as the authoritative commercial identifier when the release has a UPC. Store digits only and preserve leading zeroes.",
      },
      displayPolicy: "auto",
    },
    {
      id: "release.identifiers.ean",
      canonicalName:
        "release.identifiers.ean",
      label: "EAN",
      description:
        "European Article Number assigned to the commercial release.",
      scope: "release",
      storageFileRole: "release",
      tomlPath:
        "release.identifiers.ean",
      valueType: "string",
      required: false,
      repeatable: false,
      inherited: false,
      presentation: {
        group: "Music Business & Rights",
        order: 50,
        examples: [
          "4012345678901",
        ],
        help:
          "Use this as the authoritative commercial identifier when the release has an EAN. Store digits only and preserve leading zeroes.",
      },
      displayPolicy: "auto",
    },
    {
      id: "release.identifiers.barcode",
      canonicalName:
        "release.identifiers.barcode",
      label: "Barcode",
      description:
        "Generic imported or compatibility barcode value that may mirror a UPC or EAN.",
      scope: "release",
      storageFileRole: "release",
      tomlPath:
        "release.identifiers.barcode",
      valueType: "string",
      required: false,
      repeatable: false,
      inherited: false,
      presentation: {
        group: "Music Business & Rights",
        order: 90,
        examples: [
          "012345678905",
          "4012345678901",
        ],
        help:
          "Prefer release.identifiers.upc or release.identifiers.ean as authoritative. Use this generic field only to preserve an imported value or satisfy a compatibility workflow.",
      },
      displayPolicy: "auto",
    },
    {
      id: "release.primary_artist.sort_name",
      canonicalName:
        "release.primary_artist.sort_name",
      label: "Artist Sort Name",
      description:
        "Alphabetical form generated from the release artist name, with a leading The moved to the end when present.",
      scope: "release",
      storageFileRole: "release",
      tomlPath:
        "release.primary_artist.sort_name",
      valueType: "string",
      required: false,
      repeatable: false,
      inherited: false,
      presentation: {
        group: "Artists",
        order: 20,
        examples: [
          "Crazy Eights → Crazy Eights",
          "The Example Band → Example Band, The",
          "Custom: First Last → Last, First",
        ],
        help:
          "The editor defaults to the displayed artist name and changes only an unambiguous leading The, such as The Example Band → Example Band, The. It does not automatically reverse personal names, stage names, or culturally ordered names. Enter a custom value when a different authoritative sort form is required.",
      },
      displayPolicy: "auto",
    },
    {
      id: "release.type",
      canonicalName: "release.type",
      label: "Release Type",
      description:
        "Recognized release or release-group classification used to describe the release.",
      scope: "release",
      storageFileRole: "release",
      tomlPath: "release.type",
      valueType: "string",
      required: false,
      repeatable: false,
      inherited: false,
      editor: {
        control: "select-or-custom",
        options: [...releaseTypeOptions],
        customPlaceholder: "Custom release type",
      },
      presentation: {
        group: "Release & Track Identity",
        order: 25,
        commonValues: [...releaseTypeOptions],
        examples: [
          "album",
          "EP",
          "field recording",
        ],
        help:
          "Choose a recognized release classification when one fits. Use production notes or tags for working-session context such as a jam, rehearsal, or writing session. Existing custom authored values remain supported.",
      },
      displayPolicy: "auto",
    },
    {
      id: "release.status",
      canonicalName: "release.status",
      label: "Release Status",
      description:
        "Publication or lifecycle state of the release.",
      scope: "release",
      storageFileRole: "release",
      tomlPath: "release.status",
      valueType: "string",
      required: false,
      repeatable: false,
      inherited: false,
      editor: {
        control: "select-or-custom",
        options: [...releaseStatusOptions],
        customPlaceholder: "Custom release status",
      },
      presentation: {
        group: "Release & Track Identity",
        order: 30,
        commonValues: [...releaseStatusOptions],
        examples: [
          "draft",
          "official",
          "archived",
        ],
        help:
          "Choose the release lifecycle state used by this library. Use Other… only when a project-specific state is required.",
      },
      displayPolicy: "auto",
    },
    {
      id: "release.version",
      canonicalName: "release.version",
      label: "Release Version",
      description:
        "Edition or variant label that distinguishes this release from another edition of the same title.",
      scope: "release",
      storageFileRole: "release",
      tomlPath: "release.version",
      valueType: "string",
      required: false,
      repeatable: false,
      inherited: false,
      editor: {
        control: "select-or-custom",
        options: [...releaseVersionOptions],
        customPlaceholder: "Custom release version",
      },
      presentation: {
        group: "Release & Track Identity",
        order: 35,
        commonValues: [...releaseVersionOptions],
        examples: [
          "Original Release",
          "Deluxe Edition",
          "2026 Remaster",
        ],
        help:
          "Choose a standard edition label when it accurately describes the release. Use Other… for year-specific or label-supplied wording.",
      },
      displayPolicy: "auto",
    },
    {
      id: "release.credits.contributors[].name",
      canonicalName:
        "release.credits.contributors[].name",
      label: "Contributor Name",
      description:
        "Display name of a person, group, or organization credited on the release.",
      scope: "release",
      storageFileRole: "release",
      tomlPath:
        "release.credits.contributors[].name",
      valueType: "string",
      required: false,
      repeatable: true,
      inherited: false,
      presentation: {
        group: "Artists",
        order: 10,
        examples: [
          "David Bowie",
          "The Chemical Brothers",
          "Björk",
        ],
        help:
          "Use the public display name exactly as it should appear in credits. This is the authoritative human-readable name within the contributor record.",
      },
      displayPolicy: "auto",
    },
    {
      id: "release.credits.contributors[].role",
      canonicalName:
        "release.credits.contributors[].role",
      label: "Contributor Role",
      description:
        "Credit role performed by this contributor for the release.",
      scope: "release",
      storageFileRole: "release",
      tomlPath:
        "release.credits.contributors[].role",
      valueType: "string",
      required: false,
      repeatable: true,
      inherited: false,
      editor: {
        control: "select-or-custom",
        options: [...contributorRoleOptions],
        customPlaceholder: "Custom contributor role",
      },
      presentation: {
        group: "Artists",
        order: 20,
        commonValues: [...contributorRoleOptions],
        examples: [
          "producer",
          "executive producer",
          "composer",
        ],
        help:
          "Describe the contributor's release-level credit. Prefer one concise role per contributor record when possible.",
      },
      displayPolicy: "auto",
    },
    {
      id: "release.credits.contributors[].sort_name",
      canonicalName:
        "release.credits.contributors[].sort_name",
      label: "Contributor Sort Name",
      description:
        "Optional normalized form used to alphabetize the contributor name.",
      scope: "release",
      storageFileRole: "release",
      tomlPath:
        "release.credits.contributors[].sort_name",
      valueType: "string",
      required: false,
      repeatable: true,
      inherited: false,
      presentation: {
        group: "Artists",
        order: 30,
        examples: [
          "Bowie, David",
          "Chemical Brothers, The",
          "Björk",
        ],
        help:
          "Use only when the display name needs a different alphabetical form. Do not automatically invert unfamiliar personal names, stage names, or group names.",
      },
      displayPolicy: "auto",
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
      presentation: {
        group: "Artists",
        order: 10,
        examples: [
          "The Test Signalz",
        ],
        help:
          "Enter the primary release-level artist credit. Track-level artists may override this value.",
      },
      displayPolicy: "auto",
    },
    {
      id: "release.dates.release",
      canonicalName:
        "release.dates.release",
      label: "Release Date",
      description:
        "Date this specific release, edition, reissue, or remaster was issued.",
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
      presentation: {
        group: "Dates",
        order: 10,
        examples: [
          "2026-07-13",
          "2026",
        ],
        help:
          "Enter the date of this specific release or edition. For example, a remaster issued in 2026 uses its 2026 date here even when the underlying album first appeared in 1970. Original Release Date is a separate historical field and does not automatically inherit this value. Some players display only the year.",
      },
      displayPolicy: "auto",
    },
    {
      id: "release.dates.original_release",
      canonicalName:
        "release.dates.original_release",
      label: "Original Release Date",
      description:
        "Earliest known release date for the release concept represented by this edition.",
      scope: "release",
      storageFileRole: "release",
      tomlPath:
        "release.dates.original_release",
      valueType: "string",
      required: false,
      repeatable: false,
      inherited: false,
      presentation: {
        group: "Dates",
        order: 20,
        examples: [
          "1970-09-18",
          "1970-09",
          "1970",
        ],
        help:
          "Enter the earliest known release date for the release concept, not the date of this particular reissue or remaster. For example, a 2026 remaster of an album first released in 1970 uses 2026 for Release Date and 1970 for Original Release Date. On a first issue, the two dates may be equal, but this field remains independent and is not filled automatically from Release Date. Leave it blank when the historical date is unknown.",
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
      presentation: {
        group: "Developer / Advanced",
        order: 20,
        help:
          "Stable internal identifier. Keep it synchronized with the track directory name.",
      },
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
      presentation: {
        group: "Release & Track Identity",
        order: 20,
        examples: [
          "Sine Sweep Up",
        ],
        help:
          "Enter the base public track title without a mix, edit, or version suffix. Use Track Version for wording such as Original Mix or Radio Edit; Track Display Title can then format the combined public title.",
      },
      displayPolicy: "always",
    },
    {
      id: "track.identifiers.discogs_track_position",
      canonicalName:
        "track.identifiers.discogs_track_position",
      label: "Discogs Track Position",
      description:
        "Discogs-specific sequence label for sides, discs, and multi-part media.",
      scope: "track",
      storageFileRole: "track",
      tomlPath:
        "track.identifiers.discogs_track_position",
      valueType: "string",
      required: false,
      repeatable: false,
      inherited: false,
      presentation: {
        group: "Track & Disc Numbering",
        order: 90,
        examples: [
          "A1",
          "B2",
          "1-03",
          "CD1-4",
        ],
        help:
          "Use this only for a Discogs-style position. It supplements but does not replace the authoritative numeric Track Number, Track Total, Disc Number, and Disc Total fields.",
      },
      displayPolicy: "auto",
    },
    {
      id: "track.text.lyrics_copyright",
      canonicalName:
        "track.text.lyrics_copyright",
      label: "Lyrics Copyright Notice",
      description:
        "Copyright notice specifically covering the lyrical text.",
      scope: "track",
      storageFileRole: "track",
      tomlPath:
        "track.text.lyrics_copyright",
      valueType: "string",
      required: false,
      repeatable: false,
      inherited: false,
      presentation: {
        group: "Lyrics Rights & Source",
        order: 10,
        examples: [
          "© 2026 Example Music Publishing",
          "Lyrics © 2026 Jane Doe",
        ],
        help:
          "This notice applies specifically to lyrics. It does not replace lyricist or songwriter credits, publishing ownership, release-level copyright, or the sound-recording ℗ notice.",
      },
      displayPolicy: "auto",
    },
    {
      id: "track.identifiers.isrc",
      canonicalName:
        "track.identifiers.isrc",
      label: "ISRC",
      description:
        "International Standard Recording Code identifying this specific sound recording.",
      scope: "track",
      storageFileRole: "track",
      tomlPath:
        "track.identifiers.isrc",
      valueType: "string",
      required: false,
      repeatable: false,
      inherited: false,
      presentation: {
        group: "Music Business & Rights",
        order: 20,
        examples: [
          "USABC2600001",
        ],
        help:
          "Use the ISRC assigned to this specific recording. Different mixes, edits, remasters, or recordings may require different ISRCs.",
      },
      displayPolicy: "auto",
    },
    {
      id: "track.identifiers.iswc",
      canonicalName:
        "track.identifiers.iswc",
      label: "ISWC",
      description:
        "International Standard Musical Work Code identifying the underlying composition.",
      scope: "track",
      storageFileRole: "track",
      tomlPath:
        "track.identifiers.iswc",
      valueType: "string",
      required: false,
      repeatable: false,
      inherited: false,
      presentation: {
        group: "Music Business & Rights",
        order: 30,
        examples: [
          "T-123.456.789-0",
        ],
        help:
          "Use the ISWC for the underlying musical work, not for the particular recording. Multiple recordings may share the same ISWC.",
      },
      displayPolicy: "auto",
    },
    {
      id: "track.album_artists[].name",
      canonicalName:
        "track.album_artists[].name",
      label: "Album Artist",
      description:
        "Track-level compatibility copy of the artist credited for the release or album.",
      scope: "track",
      storageFileRole: "track",
      tomlPath:
        "track.album_artists[].name",
      valueType: "string",
      required: false,
      repeatable: true,
      inherited: true,
      presentation: {
        group: "Artists",
        order: 80,
        examples: [
          "Album Artist",
          "Various Artists",
        ],
        help:
          "This value normally mirrors release.primary_artist.name for compatibility with players and embedded-tag formats. Use Track Artist for the artist credited on this individual track.",
      },
      displayPolicy: "auto",
    },
    {
      id: "track.album_artists[].sort_name",
      canonicalName:
        "track.album_artists[].sort_name",
      label: "Album Artist Sort Name",
      description:
        "Optional alphabetical sort form for the track-level Album Artist compatibility value.",
      scope: "track",
      storageFileRole: "track",
      tomlPath:
        "track.album_artists[].sort_name",
      valueType: "string",
      required: false,
      repeatable: true,
      inherited: true,
      presentation: {
        group: "Artists",
        order: 90,
        examples: [
          "Crazy Eights → Crazy Eights",
          "The Example Band → Example Band, The",
        ],
        help:
          "This inherits the effective release artist sort name when the Album Artist identity matches. Otherwise the editor defaults to the Album Artist name and moves only a leading The to the end.",
      },
      displayPolicy: "auto",
    },
    {
      id: "track.subtitle",
      canonicalName:
        "track.subtitle",
      label: "Track Subtitle",
      description:
        "Optional secondary title shown beneath or alongside the primary track title.",
      scope: "track",
      storageFileRole: "track",
      tomlPath: "track.subtitle",
      valueType: "string",
      required: false,
      repeatable: false,
      inherited: true,
      presentation: {
        group: "Release & Track Identity",
        order: 30,
        examples: [
          "Part I",
          "Live Session",
        ],
        help:
          "A blank track subtitle inherits release.subtitle when available. Enter a value only when this track needs a distinct subtitle.",
      },
      displayPolicy: "auto",
    },
    {
      id: "track.dates.release",
      canonicalName:
        "track.dates.release",
      label: "Track Release Date",
      description:
        "Date this track or track version was released.",
      scope: "track",
      storageFileRole: "track",
      tomlPath:
        "track.dates.release",
      valueType: "string",
      required: false,
      repeatable: false,
      inherited: true,
      presentation: {
        group: "Dates",
        order: 10,
        examples: [
          "2009-05-01",
          "2026-07-18",
        ],
        help:
          "A blank value inherits release.dates.release. Override it only when this track has a different release date.",
      },
      displayPolicy: "auto",
    },
    {
      id: "track.dates.original_release",
      canonicalName:
        "track.dates.original_release",
      label: "Original Release Date",
      description:
        "Earliest known release date for this recording or track version.",
      scope: "track",
      storageFileRole: "track",
      tomlPath:
        "track.dates.original_release",
      valueType: "string",
      required: false,
      repeatable: false,
      inherited: true,
      presentation: {
        group: "Dates",
        order: 20,
        examples: [
          "2009-05-01",
          "1998",
        ],
        help:
          "A blank value inherits release.dates.original_release. Override it only when this specific recording or track was first released on a different date, such as an earlier single later included on the release.",
      },
      displayPolicy: "auto",
    },
    {
      id: "track.rights.copyright",
      canonicalName:
        "track.rights.copyright",
      label: "Track Copyright Notice",
      description:
        "Track-specific copyright notice for the composition, text, or associated material.",
      scope: "track",
      storageFileRole: "track",
      tomlPath:
        "track.rights.copyright",
      valueType: "string",
      required: false,
      repeatable: false,
      inherited: true,
      presentation: {
        group: "Music Business & Rights",
        order: 40,
        examples: [
          "Copyright © Example Publishing. All rights reserved.",
        ],
        help:
          "Use the guided form Copyright © [name or names]. All rights reserved. Leave this blank when the release-level copyright notice applies. Add a track override only when ownership or wording differs.",
      },
      displayPolicy: "auto",
    },
    {
      id: "track.rights.phonographic_copyright",
      canonicalName:
        "track.rights.phonographic_copyright",
      label: "Sound Recording Copyright",
      description:
        "Track-specific ℗ notice covering ownership of the sound recording.",
      scope: "track",
      storageFileRole: "track",
      tomlPath:
        "track.rights.phonographic_copyright",
      valueType: "string",
      required: false,
      repeatable: false,
      inherited: true,
      presentation: {
        group: "Music Business & Rights",
        order: 50,
        examples: [
          "Sound Recording Copyright ℗ Example Records. All rights reserved.",
        ],
        help:
          "Use the guided form Sound Recording Copyright ℗ [name or names]. All rights reserved. This notice applies to the recorded performance and is distinct from composition, publishing, lyrics, and artwork copyright.",
      },
      displayPolicy: "auto",
    },
    {
      id: "track.rights.publisher",
      canonicalName:
        "track.rights.publisher",
      label: "Publisher",
      description:
        "Publisher associated with the underlying musical work.",
      scope: "track",
      storageFileRole: "track",
      tomlPath:
        "track.rights.publisher",
      valueType: "string",
      required: false,
      repeatable: false,
      inherited: true,
      presentation: {
        group: "Music Business & Rights",
        order: 60,
        examples: [
          "Example Music Publishing",
        ],
        help:
          "Leave blank when the release-level publisher applies. Add a track override only when this work has a different publisher.",
      },
      displayPolicy: "auto",
    },
    {
      id: "track.rights.license",
      canonicalName:
        "track.rights.license",
      label: "Track License",
      description:
        "Optional track-specific license or usage statement.",
      scope: "track",
      storageFileRole: "track",
      tomlPath:
        "track.rights.license",
      valueType: "string",
      required: false,
      repeatable: false,
      inherited: true,
      presentation: {
        group: "Music Business & Rights",
        order: 70,
        examples: [
          "All rights reserved",
        ],
        help:
          "Use only when this track has licensing terms that differ from the release-level terms.",
      },
      displayPolicy: "auto",
    },
    {
      id: "track.version",
      canonicalName: "track.version",
      label: "Track Version",
      description:
        "Version, mix, edit, performance, or edition label that distinguishes this track from other versions of the same title.",
      scope: "track",
      storageFileRole: "track",
      tomlPath: "track.version",
      valueType: "string",
      required: false,
      repeatable: false,
      inherited: true,
      editor: {
        control: "select-or-custom",
        options: [...trackVersionOptions],
        customPlaceholder: "Custom track version",
      },
      presentation: {
        group: "Release & Track Identity",
        order: 20,
        commonValues: [...trackVersionOptions],
        examples: [
          "Original Version",
          "Original Mix",
          "Radio Edit",
          "Clean",
        ],
        help:
          "Choose a recommended mix, edit, performance, or version label, or select Other… to preserve custom wording. A blank track version may inherit release.version. When Track Display Title and Track Sort Title still use their generated values, changing the local Track Version updates both automatically; individual custom overrides remain unchanged.",
      },
      displayPolicy: "auto",
    },
    {
      id: "track.display_title",
      canonicalName:
        "track.display_title",
      label: "Track Display Title",
      description:
        "Display-ready title that may combine the base track title and a local track-version label.",
      scope: "track",
      storageFileRole: "track",
      tomlPath:
        "track.display_title",
      valueType: "string",
      required: false,
      repeatable: false,
      inherited: false,
      presentation: {
        group: "Release & Track Identity",
        order: 40,
        examples: [
          "Angel",
          "Nebula (Original Mix)",
          "Signal (Radio Edit)",
        ],
        help:
          "Normally generate this from Track Title plus the locally authored Track Version in parentheses. The value stays synchronized when Track Title or Track Version changes while it still matches the generated form. Editing this field creates an individual override that is preserved.",
      },
      displayPolicy: "auto",
    },
    {
      id: "track.sort_title",
      canonicalName: "track.sort_title",
      label: "Track Sort Title",
      description:
        "Alphabetical sort value for the track title.",
      scope: "track",
      storageFileRole: "track",
      tomlPath: "track.sort_title",
      valueType: "string",
      required: false,
      repeatable: false,
      inherited: false,
      presentation: {
        group: "Release & Track Identity",
        order: 45,
        examples: [
          "Good To Me All The Time",
          "Nebula (Original Mix)",
        ],
        help:
          "Defaults to Track Display Title when available, otherwise Track Title. It stays synchronized with generated title changes until you enter a custom sort value. Automatic article movement is not applied because article rules depend on language and editorial policy.",
      },
      displayPolicy: "auto",
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
      presentation: {
        group: "Artists",
        order: 20,
        examples: [
          "Featured Artist",
        ],
        help:
          "Use only when the track-level artist differs from or explicitly overrides the release artist.",
      },
      displayPolicy: "auto",
    },
    {
      id: "track.primary_artist.sort_name",
      canonicalName:
        "track.primary_artist.sort_name",
      label: "Track Artist Sort Name",
      description:
        "Optional alphabetical sort form for the track artist.",
      scope: "credit",
      storageFileRole: "track-credits",
      tomlPath:
        "track.primary_artist.sort_name",
      valueType: "string",
      required: false,
      repeatable: false,
      inherited: true,
      presentation: {
        group: "Artists",
        order: 30,
        examples: [
          "Crazy Eights → Crazy Eights",
          "The Example Band → Example Band, The",
        ],
        help:
          "Inherit the effective release artist sort name only when Track Artist matches the release artist. For a different local artist, the editor defaults to that artist name and moves only a leading The to the end. Enter a custom value when needed.",
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
      presentation: {
        group: "Track & Disc Numbering",
        order: 10,
        examples: ["1", "4", "12"],
        help:
          "Enter the track's sequence number on the current disc. The Library sidebar follows disc and track numbering immediately, including unsaved browser edits, and warns when two tracks share the same number on one disc. Use a TOML integer without leading zeroes: 4 is valid; 04 is not.",
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
      presentation: {
        group: "Release & Track Identity",
        order: 80,
        commonValues: [
          "true",
          "false",
        ],
        help:
          "Mark true only when the track contains explicit content under the release's distribution policy.",
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
      presentation: {
        group: "Release & Track Identity",
        order: 60,
        commonValues: [
          "rock",
          "pop",
          "electronic",
          "ambient",
          "soundtrack",
        ],
        help:
          "Use a concise list of recognized genres. Keep spelling and capitalization consistent across the release.",
      },
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
      editor: {
        control: "select-or-custom",
        options: [...languageCodeOptions],
        customPlaceholder: "Custom language code",
      },
      presentation: {
        group: "Language & Writing System",
        order: 10,
        commonValues: [...languageCodeOptions],
        help:
          "Use a two-letter ISO 639-1 language code when practical.",
      },
      displayPolicy: "auto",
    },
    {
      id: "release.script",
      canonicalName: "release.script",
      label: "Release Script",
      description:
        "Primary writing system used by the release's lyrical or spoken text, expressed as an ISO 15924 code.",
      scope: "release",
      storageFileRole: "release",
      tomlPath: "release.script",
      valueType: "string",
      required: false,
      repeatable: false,
      inherited: false,
      editor: {
        control: "select-or-custom",
        options: [...scriptCodeOptions],
        customPlaceholder: "Custom ISO 15924 code",
      },
      presentation: {
        group: "Language & Writing System",
        order: 20,
        commonValues: [...scriptCodeOptions],
        examples: ["Latn", "Cyrl", "Arab", "Jpan"],
        help:
          "Use an ISO 15924 writing-system code. Latn means Latin script; this field is not a body of lyrics.",
      },
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
      editor: {
        control: "select-or-custom",
        options: [...languageCodeOptions],
        customPlaceholder: "Custom language code",
      },
      presentation: {
        group: "Language & Writing System",
        order: 20,
        commonValues: [...languageCodeOptions],
        help:
          "Use the language of lyrical or spoken content. Instrumental tracks may leave this blank.",
      },
      displayPolicy: "auto",
    },
    {
      id: "track.script",
      canonicalName: "track.script",
      label: "Track Script",
      description:
        "Writing system used by this track's lyrical or spoken content, expressed as an ISO 15924 code.",
      scope: "track",
      storageFileRole: "track",
      tomlPath: "track.script",
      valueType: "string",
      required: false,
      repeatable: false,
      inherited: false,
      editor: {
        control: "select-or-custom",
        options: [...scriptCodeOptions],
        customPlaceholder: "Custom ISO 15924 code",
      },
      presentation: {
        group: "Language & Writing System",
        order: 30,
        commonValues: [...scriptCodeOptions],
        examples: ["Latn", "Cyrl", "Arab", "Jpan"],
        help:
          "Use an ISO 15924 writing-system code. Latn means Latin script; this field does not contain lyrics.",
      },
      displayPolicy: "auto",
    },
    {
      id: "track.text.lyrics_language",
      canonicalName: "track.text.lyrics_language",
      label: "Lyrics Language",
      description:
        "Primary language of the complete lyrical text. The editor defaults to the effective Track Language until a local Lyrics Language override is created.",
      scope: "track",
      storageFileRole: "track",
      tomlPath: "track.text.lyrics_language",
      valueType: "string",
      required: false,
      repeatable: false,
      inherited: false,
      editor: {
        control: "select-or-custom",
        options: [...languageCodeOptions],
        customPlaceholder: "Custom language code",
      },
      presentation: {
        group: "Language & Writing System",
        order: 40,
        commonValues: [...languageCodeOptions],
        examples: ["en", "es", "zxx"],
        help:
          "Defaults to the effective Track Language, including a language inherited from the release. Create a local override only when the lyrics use a different language; use zxx when the text intentionally has no linguistic content.",
      },
      displayPolicy: "auto",
    },
    {
      id: "track.text.lyrics_script",
      canonicalName: "track.text.lyrics_script",
      label: "Lyrics Script",
      description:
        "Writing system used by the complete lyrical text, expressed as an ISO 15924 code.",
      scope: "track",
      storageFileRole: "track",
      tomlPath: "track.text.lyrics_script",
      valueType: "string",
      required: false,
      repeatable: false,
      inherited: false,
      editor: {
        control: "select-or-custom",
        options: [...scriptCodeOptions],
        customPlaceholder: "Custom ISO 15924 code",
      },
      presentation: {
        group: "Language & Writing System",
        order: 50,
        commonValues: [...scriptCodeOptions],
        examples: ["Latn", "Cyrl", "Arab", "Jpan"],
        help:
          "Use the ISO 15924 code for the writing system used in track.text.lyrics.",
      },
      displayPolicy: "auto",
    },
    {
      id: "track.text.lyrics",
      canonicalName: "track.text.lyrics",
      label: "Lyrics",
      description:
        "Complete lyrical text for this track, including line and stanza breaks.",
      scope: "track",
      storageFileRole: "track",
      tomlPath: "track.text.lyrics",
      valueType: "string",
      required: false,
      repeatable: false,
      inherited: false,
      presentation: {
        group: "Lyrics",
        order: 10,
        examples: [
          "First line\nSecond line\n\nNext stanza",
        ],
        help:
          "Enter the complete lyrics here. Preserve intentional line and stanza breaks; they remain part of the stored TOML string value.",
      },
      displayPolicy: "auto",
    },
    {
      id: "track.text.lyrics_source",
      canonicalName: "track.text.lyrics_source",
      label: "Lyrics Source",
      description:
        "Source or authority from which the lyrical text was obtained or verified.",
      scope: "track",
      storageFileRole: "track",
      tomlPath: "track.text.lyrics_source",
      valueType: "string",
      required: false,
      repeatable: false,
      inherited: false,
      presentation: {
        group: "Lyrics Rights & Source",
        order: 20,
        examples: [
          "Artist-approved lyric sheet",
          "Publisher-supplied lyrics",
          "Transcribed from final master",
        ],
        help:
          "Describe the source used to enter or verify the lyrics. Do not place the lyrics body in this field.",
      },
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
      presentation: {
        group: "Track & Disc Numbering",
        order: 20,
        examples: ["10", "12", "18"],
        help:
          "Enter the total number of tracks on the current disc. This field is optional but recommended when the total is known.",
      },
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
      presentation: {
        group: "Track & Disc Numbering",
        order: 30,
        examples: ["1", "2", "3"],
        help:
          "Enter the disc or volume containing this track. For a single-disc release, this may be left blank unless explicit disc numbering is desired.",
      },
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
      presentation: {
        group: "Track & Disc Numbering",
        order: 40,
        examples: ["1", "2", "4"],
        help:
          "Enter the total number of discs or volumes in the release. Leave blank when disc numbering is not used.",
      },
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
      presentation: {
        group: "Songwriting & Composition",
        order: 20,
        examples: [
          "Dean Dawson",
          "Steve Mason",
        ],
        help:
          "Enter the credited composer's display name exactly as supplied by the official credits.",
      },
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
      presentation: {
        group: "Text and Notes",
        order: 10,
        help:
          "Use for a public-facing description that may be exported to compatible containers.",
      },
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
      presentation: {
        group: "Text and Notes",
        order: 20,
        help:
          "Use for a short public or technical comment. Avoid private production notes here.",
      },
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
      presentation: {
        group: "Music Business & Rights",
        order: 10,
        examples: [
          "Copyright © Example Records. All rights reserved.",
        ],
        help:
          "Use the guided form Copyright © [name or names]. All rights reserved. Only the credited holder names are editable; use Custom value when the source requires different wording.",
      },
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
      presentation: {
        group: "Music Business & Rights",
        order: 30,
        examples: [
          "Example Music Publishing",
        ],
        help:
          "Enter the credited publisher, publishing administrator, or rights organization.",
      },
      displayPolicy: "auto",
    },
    {
      id: "release.rights.phonographic_copyright",
      canonicalName: "release.rights.phonographic_copyright",
      label: "Sound Recording Copyright",
      description:
        "Release-level ℗ notice covering ownership of the sound recordings.",
      scope: "release",
      storageFileRole: "release",
      tomlPath: "release.rights.phonographic_copyright",
      valueType: "string",
      required: false,
      repeatable: false,
      inherited: false,
      presentation: {
        group: "Music Business & Rights",
        order: 20,
        examples: [
          "Sound Recording Copyright ℗ Example Records. All rights reserved.",
        ],
        help:
          "Use the guided form Sound Recording Copyright ℗ [name or names]. All rights reserved. Only the credited holder names are editable; use Custom value when the source requires different wording. This notice is distinct from composition, publishing, lyrics, and artwork copyright.",
      },
      displayPolicy: "auto",
    },
    {
      id: "release.rights.label",
      canonicalName: "release.rights.label",
      label: "Record Label",
      description:
        "Label or imprint responsible for releasing the recording.",
      scope: "release",
      storageFileRole: "release",
      tomlPath: "release.rights.label",
      valueType: "string",
      required: false,
      repeatable: false,
      inherited: false,
      presentation: {
        group: "Music Business & Rights",
        order: 40,
        examples: ["Example Records"],
        help:
          "Enter the credited label or imprint. Leave blank for an unreleased or self-managed recording when no label identity is applicable.",
      },
      displayPolicy: "auto",
    },
    {
      id: "release.rights.distributor",
      canonicalName: "release.rights.distributor",
      label: "Distributor",
      description:
        "Organization or service responsible for release distribution.",
      scope: "release",
      storageFileRole: "release",
      tomlPath: "release.rights.distributor",
      valueType: "string",
      required: false,
      repeatable: false,
      inherited: false,
      presentation: {
        group: "Music Business & Rights",
        order: 50,
        examples: ["Self-distributed", "Example Distribution"],
        help:
          "Enter the credited physical or digital distributor when applicable.",
      },
      displayPolicy: "auto",
    },
    {
      id: "release.rights.license",
      canonicalName: "release.rights.license",
      label: "Release License",
      description:
        "Release-level license or usage statement.",
      scope: "release",
      storageFileRole: "release",
      tomlPath: "release.rights.license",
      valueType: "string",
      required: false,
      repeatable: false,
      inherited: false,
      presentation: {
        group: "Music Business & Rights",
        order: 60,
        examples: ["All rights reserved"],
        help:
          "Enter the governing license or a concise rights-reservation statement when one is known.",
      },
      displayPolicy: "auto",
    },
    {
      id: "release.artwork[].role",
      canonicalName: "release.artwork[].role",
      label: "Release Artwork Role",
      description:
        "Purpose of an artwork asset associated with the release.",
      scope: "release",
      storageFileRole: "release",
      tomlPath: "release.artwork[].role",
      valueType: "string",
      required: false,
      repeatable: true,
      inherited: false,
      editor: {
        control: "select-or-custom",
        options: [...artworkRoleOptions],
        customPlaceholder: "Custom artwork role",
      },
      presentation: {
        group: "Artwork",
        order: 10,
        commonValues: [...artworkRoleOptions],
        examples: [
          "front_cover",
          "booklet",
          "disc",
        ],
        help:
          "Choose the asset's primary release-level purpose. Use Other… only for a role not represented by the standard list.",
      },
      displayPolicy: "auto",
    },
    {
      id: "track.artwork[].role",
      canonicalName: "track.artwork[].role",
      label: "Track Artwork Role",
      description:
        "Purpose of an artwork asset associated with an individual track.",
      scope: "track",
      storageFileRole: "track",
      tomlPath: "track.artwork[].role",
      valueType: "string",
      required: false,
      repeatable: true,
      inherited: false,
      editor: {
        control: "select-or-custom",
        options: [...artworkRoleOptions],
        customPlaceholder: "Custom artwork role",
      },
      presentation: {
        group: "Artwork",
        order: 10,
        commonValues: [...artworkRoleOptions],
        examples: [
          "track_artwork",
          "artist",
          "thumbnail",
        ],
        help:
          "Choose the asset's primary track-level purpose. Use Other… only for a role not represented by the standard list.",
      },
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
      presentation: {
        group: "Musical Analysis",
        order: 10,
        examples: [
          "120",
          "128",
          "87.5",
        ],
        help:
          "Enter the musical tempo as a whole or decimal number. Leave blank when tempo is not meaningful.",
      },
      displayPolicy: "auto",
    },
    {
      id: "track.audio.key",
      canonicalName: "track.audio.key",
      label: "Key",
      description:
        "Musical key or tonal center associated with the track.",
      scope: "track",
      storageFileRole: "track",
      tomlPath: "track.audio.key",
      valueType: "string",
      required: false,
      repeatable: false,
      inherited: false,
      editor: {
        control: "select-or-custom",
        options: [...musicalKeyOptions],
        customPlaceholder: "Custom musical key",
      },
      presentation: {
        group: "Musical Analysis",
        order: 20,
        commonValues: [...musicalKeyOptions],
        examples: [
          "A minor",
          "F♯ major",
          "C",
        ],
        help:
          "Enter the musically meaningful key using a consistent notation. Preserve accidentals and major/minor wording when known; leave blank for atonal, indeterminate, or intentionally unclassified material.",
      },
      displayPolicy: "auto",
    },
    {
      id: "track.audio.camelot_key",
      canonicalName: "track.audio.camelot_key",
      label: "Camelot Key",
      description:
        "DJ-oriented Camelot wheel representation of the musical key.",
      scope: "track",
      storageFileRole: "track",
      tomlPath: "track.audio.camelot_key",
      valueType: "string",
      required: false,
      repeatable: false,
      inherited: false,
      editor: {
        control: "select-or-custom",
        options: [...camelotKeyOptions],
        customPlaceholder: "Custom Camelot value",
      },
      presentation: {
        group: "Musical Analysis",
        order: 30,
        commonValues: [...camelotKeyOptions],
        examples: [
          "8A",
          "8B",
          "11A",
        ],
        help:
          "Automatically synchronized from a recognized ordinary Key while the Camelot value remains blank or generated. Enter a custom value only when the ordinary key notation cannot be mapped safely.",
      },
      displayPolicy: "auto",
    },
    {
      id: "track.audio.time_signature",
      canonicalName:
        "track.audio.time_signature",
      label: "Time Signature",
      description:
        "Meter used to describe the track's rhythmic grouping.",
      scope: "track",
      storageFileRole: "track",
      tomlPath:
        "track.audio.time_signature",
      valueType: "string",
      required: false,
      repeatable: false,
      inherited: false,
      editor: {
        control: "select-or-custom",
        options: [...timeSignatureOptions],
        customPlaceholder: "Custom time signature",
      },
      presentation: {
        group: "Musical Analysis",
        order: 40,
        commonValues: [...timeSignatureOptions],
        examples: [
          "4/4",
          "3/4",
          "6/8",
        ],
        help:
          "Enter the principal meter as numerator/denominator. Use notes for mixed or changing meters rather than forcing one misleading value.",
      },
      displayPolicy: "auto",
    },
    {
      id: "track.audio.tuning_hz",
      canonicalName:
        "track.audio.tuning_hz",
      label: "Tuning Reference",
      description:
        "Reference pitch in hertz used for tuning, typically the frequency assigned to A4.",
      scope: "track",
      storageFileRole: "track",
      tomlPath: "track.audio.tuning_hz",
      valueType: "number",
      required: false,
      repeatable: false,
      inherited: false,
      presentation: {
        group: "Musical Analysis",
        order: 50,
        examples: [
          "440",
          "432",
          "442",
        ],
        help:
          "Enter the numeric reference pitch from 100 through 999. The editor displays Hz, while TOML stores only the number because the canonical field name already defines the unit. New fields begin at 440.",
      },
      displayPolicy: "auto",
    },
    {
      id: "release.credits.performers[].name",
      canonicalName: "release.credits.performers[].name",
      label: "Release Performer Name",
      description:
        "Name credited as a performer across the release baseline.",
      scope: "release",
      storageFileRole: "release",
      tomlPath: "release.credits.performers[].name",
      valueType: "string",
      required: false,
      repeatable: true,
      inherited: false,
      presentation: {
        group: "Performers",
        order: 10,
        help:
          "Set the performer baseline for the release. Tracks inherit this list until a track creates a local performer override.",
      },
      displayPolicy: "auto",
    },
    {
      id: "release.credits.performers[].role",
      canonicalName: "release.credits.performers[].role",
      label: "Release Performance Role",
      description:
        "Instrument, vocal, or other performance role used across the release baseline.",
      scope: "release",
      storageFileRole: "release",
      tomlPath: "release.credits.performers[].role",
      valueType: "string",
      required: false,
      repeatable: true,
      inherited: false,
      editor: {
        control: "select-or-custom",
        options: [...performanceRoleOptions],
        customPlaceholder: "Custom performance role",
      },
      presentation: {
        group: "Performers",
        order: 20,
        commonValues: [...performanceRoleOptions],
        help:
          "Add one record per credited name and role. Repeat a performer when the same person has several roles.",
      },
      displayPolicy: "auto",
    },
    {
      id: "release.credits.performers[].sort_name",
      canonicalName: "release.credits.performers[].sort_name",
      label: "Release Performer Sort Name",
      description:
        "Optional normalized name used when sorting release-level performer credits.",
      scope: "release",
      storageFileRole: "release",
      tomlPath: "release.credits.performers[].sort_name",
      valueType: "string",
      required: false,
      repeatable: true,
      inherited: false,
      presentation: {
        group: "Performers",
        order: 30,
        examples: ["Brenton, Nathan"],
        help:
          "Optional sortable form. Leave blank when the display name already sorts correctly.",
      },
      displayPolicy: "developer",
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
      presentation: {
        group: "Performers",
        order: 10,
        help:
          "Enter the credited performer name exactly as supplied by the artist, liner notes, or release documentation.",
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
      editor: {
        control: "select-or-custom",
        options: [...performanceRoleOptions],
        customPlaceholder: "Custom performance role",
      },
      presentation: {
        group: "Performers",
        order: 20,
        commonValues: [...performanceRoleOptions],
        help:
          "Use the specific credited instrument, vocal part, programming role, or other performance contribution.",
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
      presentation: {
        group: "Performers",
        order: 10,
        examples: [
          "Dawson, Dean",
        ],
        help:
          "Optional sortable form, commonly Family name, Given name.",
      },
      displayPolicy: "developer",
    },
    {
      id: "track.contributors[].name",
      canonicalName: "track.contributors[].name",
      label: "Contributor Name",
      description:
        "Name credited for a technical, production, or creative contribution.",
      scope: "credit",
      storageFileRole: "track-credits",
      tomlPath: "track.contributors[].name",
      valueType: "string",
      required: false,
      repeatable: true,
      inherited: false,
      presentation: {
        group: "Production",
        order: 10,
        help:
          "Enter the credited person's name exactly as supplied by the contributor, liner notes, or release documentation.",
      },
      displayPolicy: "auto",
    },
    {
      id: "track.contributors[].role",
      canonicalName: "track.contributors[].role",
      label: "Contributor Role",
      description:
        "Production, engineering, editing, arrangement, writing, or coordination role.",
      scope: "credit",
      storageFileRole: "track-credits",
      tomlPath: "track.contributors[].role",
      valueType: "string",
      required: false,
      repeatable: true,
      inherited: false,
      editor: {
        control: "select-or-custom",
        options: [...contributorRoleOptions],
        customPlaceholder: "Custom contributor role",
      },
      presentation: {
        group: "Production",
        order: 20,
        commonValues: [...contributorRoleOptions],
        help:
          "Prefer the wording used in the official credit. Suggestions are examples, not restrictions; custom roles remain valid.",
      },
      displayPolicy: "auto",
    },
    {
      id: "track.contributors[].sort_name",
      canonicalName: "track.contributors[].sort_name",
      label: "Contributor Sort Name",
      description:
        "Optional normalized name used when sorting contributor credits.",
      scope: "credit",
      storageFileRole: "track-credits",
      tomlPath: "track.contributors[].sort_name",
      valueType: "string",
      required: false,
      repeatable: true,
      inherited: false,
      presentation: {
        group: "Production",
        order: 30,
        examples: [
          "Smith, Jordan",
          "Bowie, David",
        ],
        help:
          "Use Family name, Given name when a sortable form is needed. Leave blank when the display name already sorts correctly.",
      },
      displayPolicy: "developer",
    },
    {
      id: "track.production.recording.location",
      canonicalName: "track.production.recording.location",
      label: "Recording Location",
      description:
        "City, region, and country where recording took place.",
      scope: "production",
      storageFileRole: "track-production",
      tomlPath: "track.production.recording.location",
      valueType: "string",
      required: false,
      repeatable: false,
      inherited: false,
      presentation: {
        group: "Recording",
        order: 50,
        examples: [
          "Los Angeles, California, United States",
          "London, England, United Kingdom",
          "Berlin, Germany",
        ],
        help:
          "Recommended format: City, State/Region, Country. Use the studio or facility field for the credited recording house.",
      },
      displayPolicy: "auto",
    },
    {
      id: "track.production.mixing.house",
      canonicalName: "track.production.mixing.house",
      label: "Mixing Studio / House",
      description:
        "Credited studio, facility, company, or independent mixing house.",
      scope: "production",
      storageFileRole: "track-production",
      tomlPath: "track.production.mixing.house",
      valueType: "string",
      required: false,
      repeatable: false,
      inherited: false,
      presentation: {
        group: "Mixing",
        order: 40,
        examples: [
          "Electric Lady Studios",
          "Abbey Road Studios",
          "The Mix Room",
          "Independent / home studio",
        ],
        help:
          "Enter the credited facility or company name. Keep geographic information in Mixing Location.",
      },
      displayPolicy: "auto",
    },
    {
      id: "track.production.mixing.location",
      canonicalName: "track.production.mixing.location",
      label: "Mixing Location",
      description:
        "City, region, and country where the final mix was completed.",
      scope: "production",
      storageFileRole: "track-production",
      tomlPath: "track.production.mixing.location",
      valueType: "string",
      required: false,
      repeatable: false,
      inherited: false,
      presentation: {
        group: "Mixing",
        order: 50,
        examples: [
          "Los Angeles, California, United States",
          "London, England, United Kingdom",
          "Berlin, Germany",
        ],
        help:
          "Recommended format: City, State/Region, Country.",
      },
      displayPolicy: "auto",
    },
    {
      id: "track.production.mastering.location",
      canonicalName: "track.production.mastering.location",
      label: "Mastering Location",
      description:
        "City, region, and country where mastering was completed.",
      scope: "production",
      storageFileRole: "track-production",
      tomlPath: "track.production.mastering.location",
      valueType: "string",
      required: false,
      repeatable: false,
      inherited: false,
      presentation: {
        group: "Mastering",
        order: 50,
        examples: [
          "New York, New York, United States",
          "London, England, United Kingdom",
        ],
        help:
          "Recommended format: City, State/Region, Country.",
      },
      displayPolicy: "auto",
    },
    {
      id: "track.samples[].relationship_type",
      canonicalName: "track.samples[].relationship_type",
      label: "Relationship Type",
      description:
        "How the current track uses or quotes an earlier work or recording.",
      scope: "credit",
      storageFileRole: "track-credits",
      tomlPath: "track.samples[].relationship_type",
      valueType: "string",
      required: false,
      repeatable: true,
      inherited: false,
      presentation: {
        group: "Samples & Interpolations",
        order: 10,
        commonValues: [
          "sample",
          "interpolation",
          "musical quotation",
          "lyrical quotation",
          "unknown sample source",
        ],
        examples: ["sample", "interpolation"],
        help:
          "Choose sample when original recorded audio is reused. Choose interpolation or quotation when the material was newly performed. Use unknown sample source when an associated artist is known but the exact recording has not been identified.",
      },
      displayPolicy: "auto",
    },
    {
      id: "track.samples[].source_title",
      canonicalName: "track.samples[].source_title",
      label: "Source Title",
      description:
        "Title of the source recording or musical work.",
      scope: "credit",
      storageFileRole: "track-credits",
      tomlPath: "track.samples[].source_title",
      valueType: "string",
      required: false,
      repeatable: true,
      inherited: false,
      presentation: {
        group: "Samples & Interpolations",
        order: 20,
        examples: ["When the Levee Breaks"],
        help:
          "Enter the official source title. Use the recording title for a sample and the composition title for an interpolation when known.",
      },
      displayPolicy: "auto",
    },
    {
      id: "track.samples[].source_artist",
      canonicalName: "track.samples[].source_artist",
      label: "Source Artist",
      description:
        "Artist associated with the sampled source recording.",
      scope: "credit",
      storageFileRole: "track-credits",
      tomlPath: "track.samples[].source_artist",
      valueType: "string",
      required: false,
      repeatable: true,
      inherited: false,
      presentation: {
        group: "Samples & Interpolations",
        order: 30,
        examples: ["Led Zeppelin"],
        help:
          "Identify the source artist without automatically treating that artist as a performer on the current track.",
      },
      displayPolicy: "auto",
    },
    {
      id: "track.samples[].source_writers",
      canonicalName: "track.samples[].source_writers",
      label: "Source Writers",
      description:
        "Writers of the source composition, when known or required by the credit.",
      scope: "credit",
      storageFileRole: "track-credits",
      tomlPath: "track.samples[].source_writers",
      valueType: "string-array",
      required: false,
      repeatable: true,
      inherited: false,
      presentation: {
        group: "Samples & Interpolations",
        order: 40,
        examples: ["John Bonham", "Jimmy Page"],
        help:
          "Record source-work writers here without automatically copying them into the current track's songwriting credits.",
      },
      displayPolicy: "auto",
    },
    {
      id: "track.samples[].source_release",
      canonicalName: "track.samples[].source_release",
      label: "Source Release",
      description:
        "Release on which the sampled source recording appeared.",
      scope: "credit",
      storageFileRole: "track-credits",
      tomlPath: "track.samples[].source_release",
      valueType: "string",
      required: false,
      repeatable: true,
      inherited: false,
      presentation: {
        group: "Samples & Interpolations",
        order: 50,
        examples: ["Led Zeppelin IV"],
        help:
          "Use the source album, single, compilation, or other release title when known.",
      },
      displayPolicy: "auto",
    },
    {
      id: "track.samples[].source_year",
      canonicalName: "track.samples[].source_year",
      label: "Source Year",
      description:
        "Four-digit year associated with the source recording or work.",
      scope: "credit",
      storageFileRole: "track-credits",
      tomlPath: "track.samples[].source_year",
      valueType: "integer",
      required: false,
      repeatable: true,
      inherited: false,
      presentation: {
        group: "Samples & Interpolations",
        order: 60,
        examples: ["1971"],
        help: "Use a four-digit year without leading zeroes.",
      },
      displayPolicy: "auto",
    },
    {
      id: "track.samples[].source_isrc",
      canonicalName: "track.samples[].source_isrc",
      label: "Source ISRC",
      description:
        "ISRC of the identified source recording.",
      scope: "credit",
      storageFileRole: "track-credits",
      tomlPath: "track.samples[].source_isrc",
      valueType: "string",
      required: false,
      repeatable: true,
      inherited: false,
      presentation: {
        group: "Samples & Interpolations",
        order: 70,
        examples: ["GB-AAA-71-00001"],
        help:
          "Use the source recording's ISRC when it has been verified.",
      },
      displayPolicy: "auto",
    },
    {
      id: "track.samples[].source_iswc",
      canonicalName: "track.samples[].source_iswc",
      label: "Source ISWC",
      description:
        "ISWC of the identified source musical work.",
      scope: "credit",
      storageFileRole: "track-credits",
      tomlPath: "track.samples[].source_iswc",
      valueType: "string",
      required: false,
      repeatable: true,
      inherited: false,
      presentation: {
        group: "Samples & Interpolations",
        order: 80,
        examples: ["T-123.456.789-0"],
        help:
          "Use the source composition's ISWC when it has been verified.",
      },
      displayPolicy: "auto",
    },
    {
      id: "track.samples[].usage_description",
      canonicalName: "track.samples[].usage_description",
      label: "Usage Description",
      description:
        "Brief description of the sampled, interpolated, or quoted material.",
      scope: "credit",
      storageFileRole: "track-credits",
      tomlPath: "track.samples[].usage_description",
      valueType: "string",
      required: false,
      repeatable: true,
      inherited: false,
      presentation: {
        group: "Samples & Interpolations",
        order: 90,
        examples: ["drum break", "chorus melody", "vocal phrase"],
        help:
          "Describe the portion used without replacing the official liner-note wording.",
      },
      displayPolicy: "auto",
    },
    {
      id: "track.samples[].credit_text",
      canonicalName: "track.samples[].credit_text",
      label: "Official Credit Wording",
      description:
        "Public liner-note wording for this sample or interpolation.",
      scope: "credit",
      storageFileRole: "track-credits",
      tomlPath: "track.samples[].credit_text",
      valueType: "string",
      required: false,
      repeatable: true,
      inherited: false,
      presentation: {
        group: "Samples & Interpolations",
        order: 100,
        examples: [
          "Contains samples from “Source Title” as performed by Source Artist.",
        ],
        help:
          "Use the exact wording supplied by the clearance agreement, label, publisher, or legal review when available.",
      },
      displayPolicy: "auto",
    },
    {
      id: "track.samples[].notes",
      canonicalName: "track.samples[].notes",
      label: "Sample Notes",
      description:
        "Internal notes about source identification or credit research.",
      scope: "credit",
      storageFileRole: "track-credits",
      tomlPath: "track.samples[].notes",
      valueType: "string",
      required: false,
      repeatable: true,
      inherited: false,
      presentation: {
        group: "Samples & Interpolations",
        order: 110,
        examples: ["Exact recording confirmed from original liner notes."],
        help:
          "Keep internal research separate from the public official credit wording.",
      },
      displayPolicy: "auto",
    },
    {
      id: "track.sample_clearances[].sample_reference",
      canonicalName: "track.sample_clearances[].sample_reference",
      label: "Sample Reference",
      description:
        "One-based reference to the corresponding structured sample relationship.",
      scope: "credit",
      storageFileRole: "track-credits",
      tomlPath: "track.sample_clearances[].sample_reference",
      valueType: "integer",
      required: false,
      repeatable: true,
      inherited: false,
      presentation: {
        group: "Sample Clearance",
        order: 10,
        examples: ["1"],
        help:
          "Choose the numbered source shown in Samples & Interpolations.",
      },
      displayPolicy: "auto",
    },
    {
      id: "track.sample_clearances[].status",
      canonicalName: "track.sample_clearances[].status",
      label: "Clearance Status",
      description:
        "Private administrative status for one sample relationship.",
      scope: "credit",
      storageFileRole: "track-credits",
      tomlPath: "track.sample_clearances[].status",
      valueType: "string",
      required: false,
      repeatable: true,
      inherited: false,
      presentation: {
        group: "Sample Clearance",
        order: 20,
        commonValues: [
          "not reviewed",
          "identification pending",
          "clearance pending",
          "cleared",
          "restricted",
          "rejected",
          "not required",
        ],
        examples: ["clearance pending", "cleared"],
        help:
          "Editor-only administrative status. This value is not intended for public player metadata.",
      },
      displayPolicy: "auto",
    },
    {
      id: "track.sample_clearances[].master_use_cleared",
      canonicalName: "track.sample_clearances[].master_use_cleared",
      label: "Master-Use Rights Cleared",
      description:
        "Whether permission to use the source sound recording has been cleared.",
      scope: "credit",
      storageFileRole: "track-credits",
      tomlPath: "track.sample_clearances[].master_use_cleared",
      valueType: "boolean",
      required: false,
      repeatable: true,
      inherited: false,
      presentation: {
        group: "Sample Clearance",
        order: 30,
        help:
          "Track master-use permission separately from publishing permission.",
      },
      displayPolicy: "auto",
    },
    {
      id: "track.sample_clearances[].publishing_cleared",
      canonicalName: "track.sample_clearances[].publishing_cleared",
      label: "Publishing Rights Cleared",
      description:
        "Whether permission related to the source composition has been cleared.",
      scope: "credit",
      storageFileRole: "track-credits",
      tomlPath: "track.sample_clearances[].publishing_cleared",
      valueType: "boolean",
      required: false,
      repeatable: true,
      inherited: false,
      presentation: {
        group: "Sample Clearance",
        order: 40,
        help:
          "Track publishing permission separately from master-use permission.",
      },
      displayPolicy: "auto",
    },
    {
      id: "track.sample_clearances[].agreement_reference",
      canonicalName: "track.sample_clearances[].agreement_reference",
      label: "Agreement Reference",
      description:
        "Internal reference to the related clearance agreement or file.",
      scope: "credit",
      storageFileRole: "track-credits",
      tomlPath: "track.sample_clearances[].agreement_reference",
      valueType: "string",
      required: false,
      repeatable: true,
      inherited: false,
      presentation: {
        group: "Sample Clearance",
        order: 50,
        examples: ["AGR-2026-014"],
        help:
          "Store an internal agreement, contract, or case reference. Do not place confidential contract text in public-facing credit wording.",
      },
      displayPolicy: "auto",
    },
    {
      id: "track.sample_clearances[].territories",
      canonicalName: "track.sample_clearances[].territories",
      label: "Cleared Territories",
      description:
        "Territories covered by the related clearance.",
      scope: "credit",
      storageFileRole: "track-credits",
      tomlPath: "track.sample_clearances[].territories",
      valueType: "string-array",
      required: false,
      repeatable: true,
      inherited: false,
      presentation: {
        group: "Sample Clearance",
        order: 60,
        examples: ["worldwide", "United States"],
        help:
          "Use a TOML array of quoted territory names. Confirm actual territorial scope against the executed agreement.",
      },
      displayPolicy: "auto",
    },
    {
      id: "track.sample_clearances[].expiration_date",
      canonicalName: "track.sample_clearances[].expiration_date",
      label: "Clearance Expiration Date",
      description:
        "Expiration date or year for the related permission, when applicable.",
      scope: "credit",
      storageFileRole: "track-credits",
      tomlPath: "track.sample_clearances[].expiration_date",
      valueType: "date",
      required: false,
      repeatable: true,
      inherited: false,
      presentation: {
        group: "Sample Clearance",
        order: 70,
        examples: ["2030-12-31", "2030"],
        help: "Use YYYY, YYYY-MM, or YYYY-MM-DD.",
      },
      displayPolicy: "auto",
    },
    {
      id: "track.sample_clearances[].notes",
      canonicalName: "track.sample_clearances[].notes",
      label: "Clearance Notes",
      description:
        "Private administrative notes about the clearance process.",
      scope: "credit",
      storageFileRole: "track-credits",
      tomlPath: "track.sample_clearances[].notes",
      valueType: "string",
      required: false,
      repeatable: true,
      inherited: false,
      presentation: {
        group: "Sample Clearance",
        order: 80,
        examples: ["Executed agreement on file."],
        help:
          "Keep confidential agreement text in the controlled source document rather than duplicating it here.",
      },
      displayPolicy: "auto",
    },
    {
      id: "track.sample_clearances[].editor_only",
      canonicalName: "track.sample_clearances[].editor_only",
      label: "Editor Only",
      description:
        "Internal marker preventing sample-clearance administration from being treated as public metadata.",
      scope: "credit",
      storageFileRole: "track-credits",
      tomlPath: "track.sample_clearances[].editor_only",
      valueType: "boolean",
      required: false,
      repeatable: true,
      inherited: false,
      presentation: {
        group: "Sample Clearance",
        order: 90,
        help:
          "Managed automatically by the structured clearance editor.",
      },
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
