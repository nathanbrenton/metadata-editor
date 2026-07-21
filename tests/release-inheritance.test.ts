import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMissingInheritedMetadataRows,
  resolveInheritedReleaseValue,
  trackReleaseInheritancePaths,
} from "../src/release-inheritance.js";

const inheritedTrackFields = [
  {
    scope: "track",
    storageFileRole: "track",
    tomlPath: "track.rights.copyright",
    valueType: "string",
    repeatable: false,
    inherited: true,
  },
  {
    scope: "track",
    storageFileRole: "track",
    tomlPath: "track.rights.publisher",
    valueType: "string",
    repeatable: false,
    inherited: true,
  },
];

const releaseDocument = {
  filename: "release.toml",
  scope: "release" as const,
  parsed: {
    release: {
      rights: {
        copyright:
          "© 2009 Nathan Brenton",
        publisher: "Self Published",
      },
    },
  },
};

function createTrackDocument(
  track: Record<string, unknown> = {},
) {
  return {
    filename: "track.toml",
    scope: "track" as const,
    parsed: {
      track: {
        title: "Monkeys In The Desert",
        ...track,
      },
    },
  };
}

test(
  "projects inherited release rights when local track paths are missing",
  () => {
    const trackDocument =
      createTrackDocument();
    const rows =
      buildMissingInheritedMetadataRows(
        trackDocument,
        [releaseDocument],
        inheritedTrackFields,
        "track",
      );

    assert.deepEqual(
      rows.map((row) => row.path),
      [
        "track.rights.copyright",
        "track.rights.publisher",
      ],
    );

    assert.deepEqual(
      resolveInheritedReleaseValue(
        trackDocument,
        rows[0]!,
        [releaseDocument],
      ),
      {
        sourcePath:
          "release.rights.copyright",
        value: "© 2009 Nathan Brenton",
      },
    );
  },
);

test(
  "does not project a field whose local path already exists",
  () => {
    const rows =
      buildMissingInheritedMetadataRows(
        createTrackDocument({
          rights: {
            copyright: "",
          },
        }),
        [releaseDocument],
        inheritedTrackFields,
        "track",
      );

    assert.deepEqual(
      rows.map((row) => row.path),
      ["track.rights.publisher"],
    );
  },
);

test(
  "does not project blank or unavailable release defaults",
  () => {
    const rows =
      buildMissingInheritedMetadataRows(
        createTrackDocument(),
        [
          {
            ...releaseDocument,
            parsed: {
              release: {
                rights: {
                  copyright: "",
                  publisher: "",
                },
              },
            },
          },
        ],
        inheritedTrackFields,
        "track",
      );

    assert.deepEqual(rows, []);
  },
);

test(
  "projects only mapped nonrepeatable fields for the current document role",
  () => {
    const rows =
      buildMissingInheritedMetadataRows(
        createTrackDocument(),
        [releaseDocument],
        [
          ...inheritedTrackFields,
          {
            scope: "track",
            storageFileRole:
              "track-credits",
            tomlPath:
              "track.primary_artist.name",
            valueType: "string",
            repeatable: false,
            inherited: true,
          },
          {
            scope: "track",
            storageFileRole: "track",
            tomlPath:
              "track.classification.genres",
            valueType: "string-array",
            repeatable: true,
            inherited: true,
          },
          {
            scope: "track",
            storageFileRole: "track",
            tomlPath:
              "track.rights.unmapped",
            valueType: "string",
            repeatable: false,
            inherited: true,
          },
        ],
        "track",
      );

    assert.deepEqual(
      rows.map((row) => row.path),
      [
        "track.rights.copyright",
        "track.rights.publisher",
      ],
    );
  },
);

const releaseArtistDocument = {
  filename: "release.toml",
  scope: "release" as const,
  parsed: {
    release: {
      primary_artist: {
        name: "Nathan Brenton",
        sort_name: "Brenton, Nathan",
      },
    },
  },
};

function createTrackCreditsDocument(
  track: Record<string, unknown>,
) {
  return {
    filename: "track-credits.toml",
    scope: "track" as const,
    parsed: {
      track,
    },
  };
}

test(
  "inherits the primary-artist sort name only for a matching artist identity",
  () => {
    const matchingDocument =
      createTrackCreditsDocument({
        primary_artist: {
          name: " Nathan   Brenton ",
          sort_name: "",
        },
      });
    const matchingRow = {
      path: "track.primary_artist.sort_name",
      value: "",
      valueType: "string",
    };

    assert.deepEqual(
      resolveInheritedReleaseValue(
        matchingDocument,
        matchingRow,
        [releaseArtistDocument],
      ),
      {
        sourcePath:
          "release.primary_artist.sort_name",
        value: "Brenton, Nathan",
      },
    );

    const mismatchedDocument =
      createTrackCreditsDocument({
        primary_artist: {
          name: "Kateri Lirio",
          sort_name: "",
        },
      });

    assert.equal(
      resolveInheritedReleaseValue(
        mismatchedDocument,
        matchingRow,
        [releaseArtistDocument],
      ),
      null,
    );
  },
);

test(
  "inherits the primary-artist sort name when the artist name itself is inherited",
  () => {
    const document =
      createTrackCreditsDocument({
        primary_artist: {
          name: "",
          sort_name: "",
        },
      });

    assert.deepEqual(
      resolveInheritedReleaseValue(
        document,
        {
          path: "track.primary_artist.sort_name",
          value: "",
          valueType: "string",
        },
        [releaseArtistDocument],
      ),
      {
        sourcePath:
          "release.primary_artist.sort_name",
        value: "Brenton, Nathan",
      },
    );
  },
);

test(
  "matches album-artist sort inheritance by the associated record name",
  () => {
    const document =
      createTrackCreditsDocument({
        album_artists: [
          {
            name: "Nathan Brenton",
            sort_name: "",
          },
          {
            name: "Kateri Lirio",
            sort_name: "",
          },
        ],
      });

    assert.deepEqual(
      resolveInheritedReleaseValue(
        document,
        {
          path:
            "track.album_artists[0].sort_name",
          value: "",
          valueType: "string",
        },
        [releaseArtistDocument],
      ),
      {
        sourcePath:
          "release.primary_artist.sort_name",
        value: "Brenton, Nathan",
      },
    );

    assert.equal(
      resolveInheritedReleaseValue(
        document,
        {
          path:
            "track.album_artists[1].sort_name",
          value: "",
          valueType: "string",
        },
        [releaseArtistDocument],
      ),
      null,
    );
  },
);

test(
  "keeps the matching release sort value available beside a local override",
  () => {
    const document =
      createTrackCreditsDocument({
        primary_artist: {
          name: "Nathan Brenton",
          sort_name: "Nathan Brenton",
        },
      });

    assert.deepEqual(
      resolveInheritedReleaseValue(
        document,
        {
          path: "track.primary_artist.sort_name",
          value: "Nathan Brenton",
          valueType: "string",
        },
        [releaseArtistDocument],
      ),
      {
        sourcePath:
          "release.primary_artist.sort_name",
        value: "Brenton, Nathan",
      },
    );
  },
);

test(
  "projects a missing primary-artist sort path only when the artist matches",
  () => {
    const field = {
      scope: "credit",
      storageFileRole: "track-credits",
      tomlPath:
        "track.primary_artist.sort_name",
      valueType: "string",
      repeatable: false,
      inherited: true,
    };

    const matchingRows =
      buildMissingInheritedMetadataRows(
        createTrackCreditsDocument({
          primary_artist: {
            name: "Nathan Brenton",
          },
        }),
        [releaseArtistDocument],
        [field],
        "track-credits",
      );

    assert.deepEqual(
      matchingRows.map((row) => row.path),
      ["track.primary_artist.sort_name"],
    );

    const mismatchedRows =
      buildMissingInheritedMetadataRows(
        createTrackCreditsDocument({
          primary_artist: {
            name: "Kateri Lirio",
          },
        }),
        [releaseArtistDocument],
        [field],
        "track-credits",
      );

    assert.deepEqual(mismatchedRows, []);
  },
);

test(
  "inherits a generated release sort name when the release sort field is blank",
  () => {
    const generatedReleaseArtistDocument = {
      filename: "release.toml",
      scope: "release" as const,
      parsed: {
        release: {
          primary_artist: {
            name: "The Crazy Eights",
            sort_name: "",
          },
        },
      },
    };
    const trackDocument =
      createTrackCreditsDocument({
        primary_artist: {
          name: "The Crazy Eights",
          sort_name: "",
        },
      });

    assert.deepEqual(
      resolveInheritedReleaseValue(
        trackDocument,
        {
          path:
            "track.primary_artist.sort_name",
          value: "",
          valueType: "string",
        },
        [generatedReleaseArtistDocument],
      ),
      {
        sourcePath:
          "release.primary_artist.sort_name",
        value: "Crazy Eights, The",
      },
    );
  },
);

test(
  "inherits release sound-recording copyright and license",
  () => {
    const rightsFields = [
      {
        scope: "track",
        storageFileRole: "track",
        tomlPath:
          "track.rights.phonographic_copyright",
        valueType: "string",
        repeatable: false,
        inherited: true,
      },
      {
        scope: "track",
        storageFileRole: "track",
        tomlPath: "track.rights.license",
        valueType: "string",
        repeatable: false,
        inherited: true,
      },
    ];
    const releaseWithRights = {
      filename: "release.toml",
      scope: "release" as const,
      parsed: {
        release: {
          rights: {
            phonographic_copyright:
              "℗ 2016 Crazy Eights",
            license: "All rights reserved",
          },
        },
      },
    };
    const rows =
      buildMissingInheritedMetadataRows(
        createTrackDocument(),
        [releaseWithRights],
        rightsFields,
        "track",
      );

    assert.deepEqual(
      rows.map((row) => row.path),
      [
        "track.rights.phonographic_copyright",
        "track.rights.license",
      ],
    );
    assert.deepEqual(
      resolveInheritedReleaseValue(
        createTrackDocument(),
        rows[0]!,
        [releaseWithRights],
      ),
      {
        sourcePath:
          "release.rights.phonographic_copyright",
        value: "℗ 2016 Crazy Eights",
      },
    );
  },
);

test(
  "inherits historical original-release dates without falling back to the current release date",
  () => {
    const dateField = {
      scope: "track",
      storageFileRole: "track",
      tomlPath:
        "track.dates.original_release",
      valueType: "string",
      repeatable: false,
      inherited: true,
    };
    const releaseWithDistinctDates = {
      filename: "release.toml",
      scope: "release" as const,
      parsed: {
        release: {
          dates: {
            release: "2026-07-20",
            original_release: "1970-09-18",
          },
        },
      },
    };
    const trackDocument =
      createTrackDocument();
    const rows =
      buildMissingInheritedMetadataRows(
        trackDocument,
        [releaseWithDistinctDates],
        [dateField],
        "track",
      );

    assert.equal(
      trackReleaseInheritancePaths.get(
        "track.dates.original_release",
      ),
      "release.dates.original_release",
    );
    assert.deepEqual(
      rows.map((row) => row.path),
      ["track.dates.original_release"],
    );
    assert.deepEqual(
      resolveInheritedReleaseValue(
        trackDocument,
        rows[0]!,
        [releaseWithDistinctDates],
      ),
      {
        sourcePath:
          "release.dates.original_release",
        value: "1970-09-18",
      },
    );

    const releaseWithoutHistoricalDate = {
      ...releaseWithDistinctDates,
      parsed: {
        release: {
          dates: {
            release: "2026-07-20",
            original_release: "",
          },
        },
      },
    };

    assert.deepEqual(
      buildMissingInheritedMetadataRows(
        trackDocument,
        [releaseWithoutHistoricalDate],
        [dateField],
        "track",
      ),
      [],
    );
  },
);


test("inherits release production, recording, and editing context", () => {
  const releaseProductionDocument = {
    filename: "release-production-notes.toml",
    scope: "release" as const,
    parsed: {
      production: {
        location: "Home studio",
        recording: {
          location: "Travis bedroom",
        },
        editing: {
          system: "Logic Pro",
        },
      },
    },
  };
  const trackProductionDocument = {
    filename: "track-production-notes.toml",
    scope: "track" as const,
    parsed: {
      production: {
        location: "",
        recording: { location: "" },
        editing: { system: "" },
      },
    },
  };

  for (const [path, value] of [
    ["production.location", "Home studio"],
    [
      "production.recording.location",
      "Travis bedroom",
    ],
    [
      "production.editing.system",
      "Logic Pro",
    ],
  ] as const) {
    assert.deepEqual(
      resolveInheritedReleaseValue(
        trackProductionDocument,
        {
          path,
          value: "",
          valueType: "string",
        },
        [releaseProductionDocument],
      ),
      {
        sourcePath: path,
        value,
      },
    );
  }
});

test("allows track production values to override release defaults", () => {
  const releaseProductionDocument = {
    filename: "release-production-notes.toml",
    scope: "release" as const,
    parsed: {
      production: {
        recording: {
          location: "Release Studio",
        },
      },
    },
  };
  const trackProductionDocument = {
    filename: "track-production-notes.toml",
    scope: "track" as const,
    parsed: {
      production: {
        recording: {
          location: "Track Studio",
        },
      },
    },
  };

  assert.deepEqual(
    resolveInheritedReleaseValue(
      trackProductionDocument,
      {
        path: "production.recording.location",
        value: "Track Studio",
        valueType: "string",
      },
      [releaseProductionDocument],
    ),
    {
      sourcePath:
        "production.recording.location",
      value: "Release Studio",
    },
  );
});
