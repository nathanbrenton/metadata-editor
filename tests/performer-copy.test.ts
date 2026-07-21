import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPerformerReplacementInputs,
  performerPairKey,
  planPerformerCopyToTarget,
  readCopyablePerformerRecords,
  selectPerformerRecords,
} from "../server/performer-copy.js";
import type {
  ParsedMetadataDocument,
} from "../server/types.js";

function createDocument(): ParsedMetadataDocument {
  return {
    filename: "track-credits.toml",
    relativePath:
      "releases/example/tracks/source/track-credits.toml",
    scope: "track",
    trackId: "source",
    content: "",
    sha256: "a".repeat(64),
    parsed: {
      track: {
        performers: [
          {
            name: "Nathan Brenton",
            role: "Vocals",
            sort_name: "Brenton, Nathan",
            unknown: "preserved by source index",
          },
          {
            name: "Nathan Brenton",
            role: "Guitars",
          },
        ],
      },
    },
  };
}

test(
  "reads selectable performer name-role pairs from canonical track credits",
  () => {
    assert.deepEqual(
      readCopyablePerformerRecords(
        createDocument(),
      ),
      [
        {
          sourceIndex: 0,
          name: "Nathan Brenton",
          role: "Vocals",
          sortName: "Brenton, Nathan",
        },
        {
          sourceIndex: 1,
          name: "Nathan Brenton",
          role: "Guitars",
          sortName: "",
        },
      ],
    );
  },
);

test(
  "selects one or several underlying role records independently",
  () => {
    const records =
      readCopyablePerformerRecords(
        createDocument(),
      );

    assert.deepEqual(
      selectPerformerRecords(
        records,
        [1],
      ).map((record) => record.role),
      ["Guitars"],
    );

    assert.deepEqual(
      selectPerformerRecords(
        records,
        [0, 1],
      ).map((record) => record.role),
      ["Vocals", "Guitars"],
    );
  },
);

test(
  "skips normalized duplicate name-role pairs and adds missing roles",
  () => {
    const sourceRecords =
      readCopyablePerformerRecords(
        createDocument(),
      );
    const targetRecords = [
      {
        sourceIndex: 0,
        name: " nathan   brenton ",
        role: "VOCALS",
        sortName: "",
      },
    ];

    const plan = planPerformerCopyToTarget(
      sourceRecords,
      targetRecords,
      {
        trackId: "target",
        relativePath:
          "releases/example/tracks/target/track-credits.toml",
        documentExists: true,
      },
    );

    assert.equal(plan.addCount, 1);
    assert.equal(plan.duplicateCount, 1);
    assert.equal(plan.resultingCount, 2);
    assert.equal(plan.status, "ready");
    assert.deepEqual(
      plan.additions.map(
        (record) => record.role,
      ),
      ["Guitars"],
    );
  },
);

test(
  "builds replacement inputs that preserve existing records by source index",
  () => {
    const sourceRecords =
      readCopyablePerformerRecords(
        createDocument(),
      );

    assert.deepEqual(
      buildPerformerReplacementInputs(
        [sourceRecords[0]!],
        [sourceRecords[1]!],
      ),
      [
        {
          sourceIndex: 0,
          name: "Nathan Brenton",
          role: "Vocals",
          sortName: "Brenton, Nathan",
        },
        {
          sourceIndex: null,
          name: "Nathan Brenton",
          role: "Guitars",
          sortName: "",
        },
      ],
    );
  },
);

test(
  "normalizes only identity and role for duplicate detection",
  () => {
    assert.equal(
      performerPairKey({
        name: "Nathan  Brenton",
        role: "Bass Sequencing",
      }),
      performerPairKey({
        name: " nathan brenton ",
        role: "bass sequencing",
      }),
    );
  },
);

test(
  "reads release performer records as a copy source",
  () => {
    const releaseDocument: ParsedMetadataDocument = {
      filename: "release.toml",
      relativePath:
        "releases/example/release.toml",
      scope: "release",
      content: "",
      sha256: "b".repeat(64),
      parsed: {
        release: {
          credits: {
            performers: [
              {
                name: "Nathan Brenton",
                role: "guitar",
                sort_name: "Brenton, Nathan",
              },
            ],
          },
        },
      },
    };

    assert.deepEqual(
      readCopyablePerformerRecords(
        releaseDocument,
      ),
      [
        {
          sourceIndex: 0,
          name: "Nathan Brenton",
          role: "guitar",
          sortName: "Brenton, Nathan",
        },
      ],
    );
  },
);
