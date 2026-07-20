import assert from "node:assert/strict";
import test from "node:test";

import {
  filterPresentableMetadataRows,
  getManagedMetadataCollectionRoots,
  unmappedMetadataGroup,
} from "../src/metadata-presentation.js";

const registry = [
  {
    tomlPath: "track.performers[].name",
  },
  {
    tomlPath: "track.performers[].role",
  },
  {
    tomlPath: "track.contributors[].name",
  },
  {
    tomlPath: "release.artwork[].role",
  },
  {
    tomlPath: "track.classification.genres",
  },
];

test(
  "derives managed collection roots from array-record fields",
  () => {
    assert.deepEqual(
      [
        ...getManagedMetadataCollectionRoots(
          registry,
        ),
      ].sort(),
      [
        "release.artwork",
        "track.contributors",
        "track.performers",
      ],
    );
  },
);

test(
  "suppresses empty managed collection container rows",
  () => {
    const rows = [
      {
        path: "track.contributors",
        value: [],
      },
      {
        path: "track.title",
        value: "Heartbreak",
      },
    ];

    assert.deepEqual(
      filterPresentableMetadataRows(
        rows,
        registry,
      ),
      [rows[1]],
    );
  },
);

test(
  "keeps indexed records and ordinary string arrays visible",
  () => {
    const rows = [
      {
        path: "track.performers[0].name",
        value: "Nathan Brenton",
      },
      {
        path: "track.classification.genres",
        value: [],
      },
    ];

    assert.deepEqual(
      filterPresentableMetadataRows(
        rows,
        registry,
      ),
      rows,
    );
  },
);

test(
  "keeps unknown metadata visible for the unmapped disclosure",
  () => {
    const rows = [
      {
        path: "track.vendor.custom_value",
        value: "preserve me",
      },
    ];

    assert.deepEqual(
      filterPresentableMetadataRows(
        rows,
        registry,
      ),
      rows,
    );
    assert.equal(
      unmappedMetadataGroup,
      "Unmapped metadata",
    );
  },
);
