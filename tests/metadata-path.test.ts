import assert from "node:assert/strict";
import test from "node:test";

import {
  formatMetadataPath,
  parseMetadataPath,
} from "../server/metadata-path.js";

test(
  "parses a scalar metadata path",
  () => {
    assert.deepEqual(
      parseMetadataPath(
        "track.numbering.track_number",
      ),
      [
        "track",
        "numbering",
        "track_number",
      ],
    );
  },
);

test(
  "parses indexed array-of-table paths",
  () => {
    assert.deepEqual(
      parseMetadataPath(
        "track.performers[0].name",
      ),
      [
        "track",
        "performers",
        0,
        "name",
      ],
    );

    assert.deepEqual(
      parseMetadataPath(
        "release.artwork[12].role",
      ),
      [
        "release",
        "artwork",
        12,
        "role",
      ],
    );
  },
);

test(
  "round-trips canonical metadata paths",
  () => {
    const path =
      "track.performers[2].sort_name";

    assert.equal(
      formatMetadataPath(
        parseMetadataPath(path),
      ),
      path,
    );
  },
);

test(
  "rejects malformed array indexes",
  () => {
    const invalidPaths = [
      "track.performers[].name",
      "track.performers[-1].name",
      "track.performers[01].name",
      "track.performers[x].name",
      "track.performers[0",
      "track.performers.0.name",
    ];

    for (const path of invalidPaths) {
      assert.throws(
        () => parseMetadataPath(path),
        /Invalid/,
      );
    }
  },
);

test(
  "rejects malformed path separators",
  () => {
    const invalidPaths = [
      "",
      ".track.title",
      "track..title",
      "track.title.",
      "track[0]title",
      "track title",
    ];

    for (const path of invalidPaths) {
      assert.throws(
        () => parseMetadataPath(path),
      );
    }
  },
);

test(
  "rejects prototype-pollution segments",
  () => {
    const unsafePaths = [
      "__proto__.value",
      "track.prototype.value",
      "track.constructor.value",
    ];

    for (const path of unsafePaths) {
      assert.throws(
        () => parseMetadataPath(path),
        /Unsafe metadata path segment/,
      );
    }
  },
);

test(
  "rejects invalid formatted segments",
  () => {
    assert.throws(
      () =>
        formatMetadataPath([
          0,
          "name",
        ]),
      /cannot begin with an array index/,
    );

    assert.throws(
      () =>
        formatMetadataPath([
          "track",
          -1,
          "name",
        ]),
      /Invalid metadata array index/,
    );
  },
);
