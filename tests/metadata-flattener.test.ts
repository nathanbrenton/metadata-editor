import assert from "node:assert/strict";
import test from "node:test";

import {
  flattenMetadata,
} from "../src/metadata-flattener.js";

test(
  "keeps string arrays as one editable row",
  () => {
    assert.deepEqual(
      flattenMetadata(
        ["rock", "pop"],
        "release.genres",
      ),
      [
        {
          path: "release.genres",
          value: ["rock", "pop"],
          valueType: "string-array",
        },
      ],
    );
  },
);

test(
  "expands arrays of tables into indexed rows",
  () => {
    const rows = flattenMetadata(
      [
        {
          name: "Example Artist",
          role: "guitar",
        },
        {
          name: "Second Artist",
          role: "vocals",
        },
      ],
      "track.performers",
    );

    assert.deepEqual(
      rows.map((row) => row.path),
      [
        "track.performers[0].name",
        "track.performers[0].role",
        "track.performers[1].name",
        "track.performers[1].role",
      ],
    );
  },
);
