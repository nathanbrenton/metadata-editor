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
      "track.audio.key",
      "track.audio.camelot_key",
      "track.audio.time_signature",
      "track.audio.tuning_hz",
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

test(
  "registers contributor grouping and help guidance",
  () => {
    const role = findMetadataField(
      "track.contributors[].role",
    );
    const mixingHouse = findMetadataField(
      "track.production.mixing.house",
    );
    const mixingLocation =
      findMetadataField(
        "track.production.mixing.location",
      );

    assert.ok(role);
    assert.equal(
      role.presentation?.group,
      "Production",
    );
    assert.equal(
      role.presentation?.commonValues?.includes(
        "mix engineer",
      ),
      true,
    );

    assert.equal(
      mixingHouse?.presentation?.group,
      "Mixing",
    );
    assert.equal(
      mixingLocation?.presentation?.examples
        ?.includes(
          "Los Angeles, California, United States",
        ),
      true,
    );
  },
);

test(
  "groups track and disc numbering fields",
  () => {
    const paths = [
      "track.numbering.track_number",
      "track.numbering.track_total",
      "track.numbering.disc_number",
      "track.numbering.disc_total",
    ];

    const fields = paths.map(
      (path) => {
        const field =
          findMetadataField(path);

        assert.ok(field);
        return field;
      },
    );

    assert.deepEqual(
      fields.map(
        (field) =>
          field.presentation?.group,
      ),
      [
        "Track & Disc Numbering",
        "Track & Disc Numbering",
        "Track & Disc Numbering",
        "Track & Disc Numbering",
      ],
    );

    assert.deepEqual(
      fields.map(
        (field) =>
          field.presentation?.order,
      ),
      [10, 20, 30, 40],
    );

    assert.equal(
      fields[0].presentation?.help
        ?.includes("leading zeroes"),
      true,
    );
  },
);

test(
  "assigns practical presentation groups to registered fields",
  () => {
    const expectedGroups = new Map([
      [
        "release.title",
        "Release & Track Identity",
      ],
      [
        "release.dates.release",
        "Dates",
      ],
      [
        "track.primary_artist.name",
        "Artists",
      ],
      [
        "track.composers[].name",
        "Writing, Lyrics & Language",
      ],
      [
        "release.rights.copyright",
        "Music Business & Rights",
      ],
      [
        "track.text.comment",
        "Text and Notes",
      ],
      [
        "track.audio.bpm",
        "Musical Analysis",
      ],
      [
        "track.audio.key",
        "Musical Analysis",
      ],
      [
        "track.contributors[].sort_name",
        "Production",
      ],
    ]);

    for (const [
      path,
      expectedGroup,
    ] of expectedGroups) {
      const field =
        findMetadataField(path);

      assert.ok(field);
      assert.equal(
        field.presentation?.group,
        expectedGroup,
      );
    }
  },
);

test(
  "registers Overview musical-analysis fields",
  () => {
    const paths = [
      "track.audio.bpm",
      "track.audio.key",
      "track.audio.camelot_key",
      "track.audio.time_signature",
      "track.audio.tuning_hz",
    ];

    const fields = paths.map((path) => {
      const field = findMetadataField(path);

      assert.ok(field);
      return field;
    });

    assert.deepEqual(
      fields.map(
        (field) =>
          field.presentation?.group,
      ),
      paths.map(() => "Musical Analysis"),
    );

    assert.deepEqual(
      fields.map(
        (field) =>
          field.presentation?.order,
      ),
      [10, 20, 30, 40, 50],
    );
  },
);

test(
  "uses the refined grouping hierarchy",
  () => {
    const expectedGroups = new Map([
      [
        "release.dates.release",
        "Dates",
      ],
      [
        "release.language",
        "Language & Writing System",
      ],
      [
        "track.language",
        "Language & Writing System",
      ],
      [
        "track.composers[].name",
        "Writing, Lyrics & Language",
      ],
      [
        "release.rights.publisher",
        "Music Business & Rights",
      ],
      [
        "track.performers[].sort_name",
        "Performers",
      ],
    ]);

    for (const [
      path,
      expectedGroup,
    ] of expectedGroups) {
      const field =
        findMetadataField(path);

      assert.ok(field);
      assert.equal(
        field.presentation?.group,
        expectedGroup,
      );
    }
  },
);

test(
  "registers lyrical text, language, script, rights, and source fields",
  () => {
    const expectedFields = new Map([
      [
        "release.script",
        ["Release Script", "Language & Writing System"],
      ],
      [
        "track.script",
        ["Track Script", "Language & Writing System"],
      ],
      [
        "track.text.lyrics_language",
        ["Lyrics Language", "Language & Writing System"],
      ],
      [
        "track.text.lyrics_script",
        ["Lyrics Script", "Language & Writing System"],
      ],
      [
        "track.text.lyrics",
        ["Lyrics", "Lyrics"],
      ],
      [
        "track.text.lyrics_copyright",
        ["Lyrics Copyright Notice", "Lyrics Rights & Source"],
      ],
      [
        "track.text.lyrics_source",
        ["Lyrics Source", "Lyrics Rights & Source"],
      ],
    ]);

    for (const [
      metadataPath,
      [expectedLabel, expectedGroup],
    ] of expectedFields) {
      const field =
        findMetadataField(metadataPath);

      assert.ok(field);
      assert.equal(field.label, expectedLabel);
      assert.equal(
        field.presentation?.group,
        expectedGroup,
      );
    }

    assert.equal(
      findMetadataField(
        "track.text.lyrics",
      )?.presentation?.help?.includes(
        "complete lyrics",
      ),
      true,
    );
  },
);

test(
  "registers select-or-custom vocabularies for standardized scalar fields",
  () => {
    const expectedFields = new Map([
      [
        "release.type",
        "album",
      ],
      [
        "release.status",
        "official",
      ],
      [
        "release.version",
        "Original Release",
      ],
      [
        "track.version",
        "Radio Edit",
      ],
      [
        "release.language",
        "en",
      ],
      [
        "track.language",
        "zxx",
      ],
      [
        "release.script",
        "Latn",
      ],
      [
        "track.script",
        "Jpan",
      ],
      [
        "track.text.lyrics_language",
        "en",
      ],
      [
        "track.text.lyrics_script",
        "Cyrl",
      ],
      [
        "track.audio.key",
        "A minor",
      ],
      [
        "track.audio.camelot_key",
        "8A",
      ],
      [
        "track.audio.time_signature",
        "4/4",
      ],
      [
        "release.artwork[].role",
        "front_cover",
      ],
      [
        "track.artwork[].role",
        "track_artwork",
      ],
      [
        "track.performers[].role",
        "guitar",
      ],
      [
        "track.contributors[].role",
        "recorded by",
      ],
      [
        "release.credits.contributors[].role",
        "producer",
      ],
    ]);

    for (const [
      metadataPath,
      expectedOption,
    ] of expectedFields) {
      const field =
        findMetadataField(metadataPath);

      assert.ok(field);
      assert.equal(
        field.editor?.control,
        "select-or-custom",
      );
      assert.equal(
        field.editor?.options.includes(
          expectedOption,
        ),
        true,
      );
      assert.equal(
        field.editor?.options.some(
          (option) =>
            option.toLocaleLowerCase() ===
            "other…",
        ),
        false,
      );
    }
  },
);

test(
  "keeps curated vocabulary options unique case-insensitively",
  () => {
    for (const field of metadataFieldRegistry) {
      const options =
        field.editor?.options;

      if (!options) {
        continue;
      }

      const normalized = options.map(
        (option) =>
          option.trim().toLocaleLowerCase(),
      );

      assert.equal(
        new Set(normalized).size,
        normalized.length,
        `Duplicate vocabulary option for ${field.tomlPath}`,
      );
    }
  },
);


test(
  "registers track display title guidance and expanded version choices",
  () => {
    const displayTitle =
      findMetadataField(
        "track.display_title",
      );
    const trackVersion =
      findMetadataField(
        "track.version",
      );

    assert.ok(displayTitle);
    assert.equal(
      displayTitle.label,
      "Track Display Title",
    );
    assert.equal(
      displayTitle.presentation?.group,
      "Release & Track Identity",
    );
    assert.equal(
      displayTitle.inherited,
      false,
    );

    for (const option of [
      "Original Version",
      "Original Mix",
      "Clean",
    ]) {
      assert.equal(
        trackVersion?.editor?.options.includes(
          option,
        ),
        true,
      );
    }
  },
);
