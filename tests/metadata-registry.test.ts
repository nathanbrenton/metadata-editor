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
  "reserves player aliases for verified mappings",
  () => {
    const fieldsWithPlayerAliases =
      metadataFieldRegistry.filter(
        (field) =>
          field.aliases?.players,
      );

    assert.ok(
      fieldsWithPlayerAliases.length > 0,
    );

    for (const field of fieldsWithPlayerAliases) {
      assert.deepEqual(
        field.aliases?.players?.vlc,
        [],
      );

      assert.deepEqual(
        field.aliases?.players?.appleMusic,
        [],
      );

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
