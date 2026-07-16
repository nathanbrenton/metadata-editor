import assert from "node:assert/strict";
import test from "node:test";

import {
  findMetadataField,
  metadataFieldRegistry,
} from "../server/metadata-registry.js";

test(
  "contains unique field IDs and TOML paths",
  () => {
    const ids = metadataFieldRegistry.map(
      (field) => field.id,
    );

    const paths = metadataFieldRegistry.map(
      (field) => field.tomlPath,
    );

    assert.equal(
      new Set(ids).size,
      ids.length,
    );

    assert.equal(
      new Set(paths).size,
      paths.length,
    );
  },
);

test(
  "looks up registered metadata fields by TOML path",
  () => {
    const title = findMetadataField(
      "track.title",
    );

    assert.ok(title);
    assert.equal(
      title.label,
      "Track Title",
    );
    assert.equal(
      title.storageFileRole,
      "track",
    );
  },
);

test(
  "stores verified VLC and Apple Music aliases",
  () => {
    const title = findMetadataField(
      "track.title",
    );
    const releaseTitle = findMetadataField(
      "release.title",
    );
    const releaseDate = findMetadataField(
      "release.dates.release",
    );

    assert.ok(title);
    assert.ok(releaseTitle);
    assert.ok(releaseDate);

    assert.deepEqual(
      title.aliases?.players?.vlc,
      ["Title"],
    );

    assert.deepEqual(
      title.aliases?.players?.appleMusic,
      ["title"],
    );

    assert.deepEqual(
      releaseTitle.aliases?.players
        ?.appleMusic,
      ["album"],
    );

    assert.deepEqual(
      releaseDate.aliases?.players?.vlc,
      ["Date"],
    );

    assert.equal(
      releaseDate.playerCompatibility
        ?.some(
          (result) =>
            result.player === "vlc" &&
            result.status === "partial",
        ),
      true,
    );
  },
);

test(
  "keeps Windows player aliases unverified",
  () => {
    for (const field of metadataFieldRegistry) {
      assert.deepEqual(
        field.aliases?.players
          ?.windowsMediaPlayer ?? [],
        [],
      );

      assert.deepEqual(
        field.aliases?.players
          ?.windowsMediaPlayerLegacy ?? [],
        [],
      );
    }
  },
);

test(
  "registers remaining verified player-facing fields",
  () => {
    const expectedPaths = [
      "release.language",
      "track.language",
      "track.numbering.track_total",
      "track.numbering.disc_number",
      "track.numbering.disc_total",
      "track.composers[].name",
      "track.text.description",
      "track.text.comment",
      "release.rights.copyright",
      "release.rights.publisher",
      "track.audio.bpm",
    ];

    for (const metadataPath of expectedPaths) {
      assert.ok(
        findMetadataField(metadataPath),
        `Missing registry field: ${metadataPath}`,
      );
    }

    assert.deepEqual(
      findMetadataField(
        "track.composers[].name",
      )?.aliases?.players?.appleMusic,
      ["composer"],
    );

    assert.deepEqual(
      findMetadataField(
        "track.text.comment",
      )?.aliases?.players?.vlc,
      ["Description"],
    );

    assert.deepEqual(
      findMetadataField(
        "release.rights.publisher",
      )?.aliases?.players?.vlc,
      ["Publisher"],
    );
  },
);
