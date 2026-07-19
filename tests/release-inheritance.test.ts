import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMissingInheritedMetadataRows,
  resolveInheritedReleaseValue,
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
