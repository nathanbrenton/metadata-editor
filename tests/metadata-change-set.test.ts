import assert from "node:assert/strict";
import test from "node:test";

import {
  applyMetadataChanges,
  applyArrangementContributorRecords,
  applyContributorRecordFamilies,
  applyMetadataDeletions,
  applyPerformerRecords,
  applyTechnicalContributorRecords,
} from "../server/metadata-change-set.js";

function createDocument() {
  return {
    track: {
      title: "Original Title",
      explicit: false,
      numbering: {
        track_number: 1,
      },
      genres: [
        "electronic",
        "test",
      ],
      performers: [
        {
          name: "First Artist",
          role: "guitar",
        },
        {
          name: "Second Artist",
          role: "vocals",
        },
      ],
    },
  };
}

test(
  "applies multiple scalar changes",
  () => {
    const document = createDocument();

    const updated = applyMetadataChanges(
      document,
      [
        {
          path: "track.title",
          value: "Updated Title",
        },
        {
          path:
            "track.numbering.track_number",
          value: 2,
        },
        {
          path: "track.explicit",
          value: true,
        },
      ],
    ) as typeof document;

    assert.equal(
      updated.track.title,
      "Updated Title",
    );

    assert.equal(
      updated.track.numbering.track_number,
      2,
    );

    assert.equal(
      updated.track.explicit,
      true,
    );

    assert.equal(
      document.track.title,
      "Original Title",
    );
  },
);

test(
  "applies indexed array-of-table changes",
  () => {
    const document = createDocument();

    const updated = applyMetadataChanges(
      document,
      [
        {
          path:
            "track.performers[0].role",
          value: "electric guitar",
        },
        {
          path:
            "track.performers[1].name",
          value: "Updated Artist",
        },
      ],
    ) as typeof document;

    assert.equal(
      updated.track.performers[0].role,
      "electric guitar",
    );

    assert.equal(
      updated.track.performers[1].name,
      "Updated Artist",
    );

    assert.equal(
      document.track.performers[0].role,
      "guitar",
    );
  },
);

test(
  "applies string-array changes",
  () => {
    const document = createDocument();

    const updated = applyMetadataChanges(
      document,
      [
        {
          path: "track.genres",
          value: [
            "ambient",
            "experimental",
          ],
        },
      ],
    ) as typeof document;

    assert.deepEqual(
      updated.track.genres,
      [
        "ambient",
        "experimental",
      ],
    );
  },
);

test(
  "rejects type-changing edits",
  () => {
    const document = createDocument();

    assert.throws(
      () =>
        applyMetadataChanges(
          document,
          [
            {
              path:
                "track.numbering.track_number",
              value: "2",
            },
          ],
        ),
      /cannot change type from number to string/,
    );

    assert.throws(
      () =>
        applyMetadataChanges(
          document,
          [
            {
              path: "track.genres",
              value: "ambient",
            },
          ],
        ),
      /cannot change type from string-array to string/,
    );
  },
);

test(
  "rejects duplicate paths",
  () => {
    const document = createDocument();

    assert.throws(
      () =>
        applyMetadataChanges(
          document,
          [
            {
              path: "track.title",
              value: "First",
            },
            {
              path: "track.title",
              value: "Second",
            },
          ],
        ),
      /Duplicate metadata change path/,
    );
  },
);

test(
  "rejects overlapping paths",
  () => {
    const document = createDocument();

    assert.throws(
      () =>
        applyMetadataChanges(
          document,
          [
            {
              path: "track.genres",
              value: ["ambient"],
            },
            {
              path: "track.genres[0]",
              value: "experimental",
            },
          ],
        ),
      /Overlapping metadata changes/,
    );
  },
);

test(
  "rejects missing paths",
  () => {
    const document = createDocument();

    assert.throws(
      () =>
        applyMetadataChanges(
          document,
          [
            {
              path:
                "track.performers[4].name",
              value: "Missing Artist",
            },
          ],
        ),
      /out of bounds/,
    );
  },
);

test(
  "rejects object replacements",
  () => {
    const document = createDocument();

    assert.throws(
      () =>
        applyMetadataChanges(
          document,
          [
            {
              path: "track.numbering",
              value: "invalid",
            },
          ],
        ),
      /not an editable scalar or string array/,
    );
  },
);

test(
  "requires at least one change",
  () => {
    assert.throws(
      () =>
        applyMetadataChanges(
          createDocument(),
          [],
        ),
      /At least one metadata change/,
    );
  },
);


test(
  "rebuilds paired performer records while preserving unknown keys",
  () => {
    const document = {
      track: {
        performers: [
          {
            name: "First Artist",
            role: "guitar",
            sort_name: "Artist, First",
            credit_id: "keep-first",
          },
          {
            name: "Second Artist",
            role: "vocals",
            credit_id: "keep-second",
          },
        ],
      },
    };

    const updated =
      applyPerformerRecords(
        document,
        [
          {
            sourceIndex: 1,
            name: "Second Artist",
            role: "lead vocals",
            sortName:
              "Artist, Second",
          },
          {
            sourceIndex: null,
            name: "New Artist",
            role: "drums",
            sortName: "",
          },
        ],
      ) as {
        track: {
          performers: Array<
            Record<string, unknown>
          >;
        };
      };

    assert.equal(
      updated.track.performers.length,
      2,
    );
    assert.equal(
      updated.track.performers[0]
        ?.role,
      "lead vocals",
    );
    assert.equal(
      updated.track.performers[0]
        ?.credit_id,
      "keep-second",
    );
    assert.equal(
      updated.track.performers[0]
        ?.sort_name,
      "Artist, Second",
    );
    assert.equal(
      updated.track.performers[1]
        ?.name,
      "New Artist",
    );
    assert.equal(
      "credit_id" in
        (updated.track.performers[1] ??
          {}),
      false,
    );

    assert.equal(
      document.track.performers.length,
      2,
    );
    assert.equal(
      document.track.performers[1]
        ?.role,
      "vocals",
    );
  },
);

test(
  "creates an empty performer array when the path is missing",
  () => {
    const updated =
      applyPerformerRecords(
        {
          track: {
            title: "Test",
          },
        },
        [],
      ) as {
        track: {
          title: string;
          performers: unknown[];
        };
      };

    assert.deepEqual(
      updated.track.performers,
      [],
    );
  },
);

test(
  "rejects duplicate and out-of-bounds performer source indexes",
  () => {
    const document = createDocument();

    assert.throws(
      () =>
        applyPerformerRecords(
          document,
          [
            {
              sourceIndex: 0,
              name: "First",
              role: "guitar",
              sortName: "",
            },
            {
              sourceIndex: 0,
              name: "Duplicate",
              role: "vocals",
              sortName: "",
            },
          ],
        ),
      /Duplicate performer source index/,
    );

    assert.throws(
      () =>
        applyPerformerRecords(
          document,
          [
            {
              sourceIndex: 9,
              name: "Missing",
              role: "vocals",
              sortName: "",
            },
          ],
        ),
      /out of bounds/,
    );

    assert.throws(
      () =>
        applyPerformerRecords(
          document,
          [
            {
              sourceIndex: 0,
              name: "",
              role: "guitar",
              sortName: "",
            },
          ],
        ),
      /requires both a name and role/,
    );
  },
);

test(
  "rebuilds only managed technical contributors and preserves other credits",
  () => {
    const document = {
      track: {
        contributors: [
          {
            name: "Producer Person",
            role: "producer",
            credit_id: "keep-production",
          },
          {
            name: "Engineer Person",
            role: "recording engineer",
            credit_id: "keep-recording",
          },
          {
            name: "Mix Person",
            role: "mix engineer",
            credit_id: "remove-mix",
          },
        ],
      },
    };

    const updated =
      applyTechnicalContributorRecords(
        document,
        [
          {
            sourceIndex: 1,
            name: "Engineer Person",
            role: "recording and mix engineer",
            sortName:
              "Person, Engineer",
          },
          {
            sourceIndex: null,
            name: "Master Person",
            role: "mastering engineer",
            sortName: "",
          },
        ],
        [1, 2],
      ) as {
        track: {
          contributors: Array<
            Record<string, unknown>
          >;
        };
      };

    assert.equal(
      updated.track.contributors.length,
      3,
    );
    assert.equal(
      updated.track.contributors[0]
        ?.credit_id,
      "keep-production",
    );
    assert.equal(
      updated.track.contributors[1]
        ?.credit_id,
      "keep-recording",
    );
    assert.equal(
      updated.track.contributors[1]
        ?.role,
      "recording and mix engineer",
    );
    assert.equal(
      updated.track.contributors[2]
        ?.name,
      "Master Person",
    );
    assert.equal(
      updated.track.contributors.some(
        (record) =>
          record.credit_id ===
            "remove-mix",
      ),
      false,
    );
  },
);

test(
  "creates technical contributor records when the path is missing",
  () => {
    const updated =
      applyTechnicalContributorRecords(
        {
          track: {
            title: "Test",
          },
        },
        [
          {
            sourceIndex: null,
            name: "Engineer",
            role: "recording engineer",
            sortName: "",
          },
        ],
        [],
      ) as {
        track: {
          contributors: Array<{
            name: string;
            role: string;
          }>;
        };
      };

    assert.deepEqual(
      updated.track.contributors,
      [
        {
          name: "Engineer",
          role: "recording engineer",
        },
      ],
    );
  },
);

test(
  "rejects unmanaged and duplicate technical contributor indexes",
  () => {
    const document = {
      track: {
        contributors: [
          {
            name: "Engineer",
            role: "recording engineer",
          },
          {
            name: "Mixer",
            role: "mix engineer",
          },
        ],
      },
    };

    assert.throws(
      () =>
        applyTechnicalContributorRecords(
          document,
          [
            {
              sourceIndex: 0,
              name: "Engineer",
              role: "recording engineer",
              sortName: "",
            },
          ],
          [1],
        ),
      /not managed by this editor/,
    );

    assert.throws(
      () =>
        applyTechnicalContributorRecords(
          document,
          [],
          [0, 0],
        ),
      /Duplicate managed technical contributor source index/,
    );

    assert.throws(
      () =>
        applyTechnicalContributorRecords(
          {
            track: {
              contributors: [
                {
                  name: "Producer",
                  role: "producer",
                },
              ],
            },
          },
          [],
          [0],
        ),
      /not a recording, mixing, or mastering credit/,
    );
  },
);

test(
  "accepts common liner-note wording for technical contributor roles",
  () => {
    const updated =
      applyTechnicalContributorRecords(
        {
          track: {
            contributors: [],
          },
        },
        [
          {
            sourceIndex: null,
            name: "Recorder",
            role: "Recorded By",
            sortName: "",
          },
          {
            sourceIndex: null,
            name: "Mixer",
            role: "Mixed By",
            sortName: "",
          },
          {
            sourceIndex: null,
            name: "Mastering Person",
            role: "Mastered By",
            sortName: "",
          },
        ],
        [],
      ) as {
        track: {
          contributors: Array<{
            role: string;
          }>;
        };
      };

    assert.deepEqual(
      updated.track.contributors.map(
        (contributor) => contributor.role,
      ),
      [
        "Recorded By",
        "Mixed By",
        "Mastered By",
      ],
    );
  },
);

test(
  "creates and updates release-level technical contributor records",
  () => {
    const updated =
      applyTechnicalContributorRecords(
        {
          release: {
            title: "Test Release",
            credits: {
              contributors: [
                {
                  name: "Producer Person",
                  role: "producer",
                  credit_id: "keep-production",
                },
                {
                  name: "Original Engineer",
                  role: "Recorded By",
                  credit_id: "keep-recording",
                },
              ],
            },
          },
        },
        [
          {
            sourceIndex: 1,
            name: "Nathan Brenton",
            role: "Recording Engineer",
            sortName: "Brenton, Nathan",
          },
          {
            sourceIndex: null,
            name: "Kateri Lirio",
            role: "Mixed By",
            sortName: "Lirio, Kateri",
          },
        ],
        [1],
        "release.credits.contributors",
      ) as {
        release: {
          credits: {
            contributors: Array<
              Record<string, unknown>
            >;
          };
        };
      };

    assert.equal(
      updated.release.credits.contributors.length,
      3,
    );
    assert.equal(
      updated.release.credits.contributors[0]
        ?.credit_id,
      "keep-production",
    );
    assert.equal(
      updated.release.credits.contributors[1]
        ?.credit_id,
      "keep-recording",
    );
    assert.equal(
      updated.release.credits.contributors[1]
        ?.name,
      "Nathan Brenton",
    );
    assert.equal(
      updated.release.credits.contributors[2]
        ?.role,
      "Mixed By",
    );
  },
);

test(
  "creates the release credits path when it is missing",
  () => {
    const updated =
      applyTechnicalContributorRecords(
        {
          release: {
            title: "Test Release",
          },
        },
        [
          {
            sourceIndex: null,
            name: "Nathan Brenton",
            role: "Recorded By",
            sortName: "",
          },
        ],
        [],
        "release.credits.contributors",
      ) as {
        release: {
          credits: {
            contributors: Array<{
              name: string;
              role: string;
            }>;
          };
        };
      };

    assert.deepEqual(
      updated.release.credits.contributors,
      [
        {
          name: "Nathan Brenton",
          role: "Recorded By",
        },
      ],
    );
  },
);


test(
  "removes optional scalar fields while preserving unknown siblings",
  () => {
    const document = {
      track: {
        script: "",
        title: "Angel",
        unknown: "preserve",
      },
    };

    const updated =
      applyMetadataDeletions(
        document,
        ["track.script"],
      ) as {
        track: {
          title: string;
          unknown: string;
          script?: string;
        };
      };

    assert.equal(
      updated.track.script,
      undefined,
    );
    assert.equal(
      updated.track.unknown,
      "preserve",
    );
  },
);

test(
  "removes string-array fields and prunes empty parent tables",
  () => {
    const updated =
      applyMetadataDeletions(
        {
          track: {
            text: {
              tags: ["draft"],
            },
            title: "Angel",
          },
        },
        ["track.text.tags"],
      ) as {
        track: {
          title: string;
          text?: unknown;
        };
      };

    assert.equal(
      updated.track.text,
      undefined,
    );
  },
);

test(
  "rejects duplicate, indexed, and object metadata removals",
  () => {
    const document = createDocument();

    assert.throws(
      () =>
        applyMetadataDeletions(
          document,
          ["track.title", "track.title"],
        ),
      /Duplicate metadata removal path/,
    );

    assert.throws(
      () =>
        applyMetadataDeletions(
          document,
          ["track.performers[0].role"],
        ),
      /Removing array metadata is not supported/,
    );

    assert.throws(
      () =>
        applyMetadataDeletions(
          document,
          ["track.numbering"],
        ),
      /not an editable scalar or string array/,
    );
  },
);

test(
  "updates an album-artist sort override without dropping unknown record keys",
  () => {
    const document = {
      track: {
        album_artists: [
          {
            name: "Nathan Brenton",
            sort_name: "",
            authority_id: "artist-001",
          },
        ],
      },
    };

    const updated = applyMetadataChanges(
      document,
      [
        {
          path:
            "track.album_artists[0].sort_name",
          value: "Brenton, Nathan",
        },
      ],
    ) as typeof document;

    assert.deepEqual(
      updated.track.album_artists[0],
      {
        name: "Nathan Brenton",
        sort_name: "Brenton, Nathan",
        authority_id: "artist-001",
      },
    );
    assert.equal(
      document.track.album_artists[0]
        .sort_name,
      "",
    );
  },
);

test(
  "rebuilds release performer records while preserving unknown keys",
  () => {
    const document = {
      release: {
        title: "Test Release",
        credits: {
          performers: [
            {
              name: "Nathan Brenton",
              role: "guitar",
              sort_name: "Brenton, Nathan",
              authority_id: "artist-001",
            },
            {
              name: "Alex Example",
              role: "drums",
              authority_id: "artist-002",
            },
          ],
          unknown: "preserve",
        },
      },
    };

    const updated = applyPerformerRecords(
      document,
      [
        {
          sourceIndex: 0,
          name: "Nathan Brenton",
          role: "electric guitar",
          sortName: "Brenton, Nathan",
        },
        {
          sourceIndex: null,
          name: "Jamie Example",
          role: "percussion",
          sortName: "Example, Jamie",
        },
      ],
      "release.credits.performers",
    ) as typeof document;

    assert.equal(
      updated.release.credits.performers.length,
      2,
    );
    assert.deepEqual(
      updated.release.credits.performers[0],
      {
        name: "Nathan Brenton",
        role: "electric guitar",
        sort_name: "Brenton, Nathan",
        authority_id: "artist-001",
      },
    );
    assert.deepEqual(
      updated.release.credits.performers[1],
      {
        name: "Jamie Example",
        role: "percussion",
        sort_name: "Example, Jamie",
      },
    );
    assert.equal(
      updated.release.credits.unknown,
      "preserve",
    );
  },
);

test(
  "creates the release performer path when it is missing",
  () => {
    const updated = applyPerformerRecords(
      {
        release: {
          title: "Test Release",
        },
      },
      [
        {
          sourceIndex: null,
          name: "Nathan Brenton",
          role: "guitar",
          sortName: "",
        },
      ],
      "release.credits.performers",
    ) as {
      release: {
        credits: {
          performers: Array<{
            name: string;
            role: string;
          }>;
        };
      };
    };

    assert.deepEqual(
      updated.release.credits.performers,
      [
        {
          name: "Nathan Brenton",
          role: "guitar",
        },
      ],
    );
  },
);

test(
  "rebuilds arrangement contributors while preserving other contributor families",
  () => {
    const updated = applyContributorRecordFamilies(
      {
        track: {
          contributors: [
            {
              name: "Producer",
              role: "producer",
              credit_id: "keep-producer",
            },
            {
              name: "Engineer",
              role: "recording engineer",
              credit_id: "keep-engineer",
            },
            {
              name: "Original Arranger",
              role: "string arranger",
              credit_id: "keep-arranger",
            },
            {
              name: "Conductor",
              role: "conductor",
              credit_id: "keep-conductor",
            },
          ],
        },
      },
      {
        technical: {
          records: [
            {
              sourceIndex: 1,
              name: "Updated Engineer",
              role: "recording engineer",
              sortName: "Engineer, Updated",
            },
          ],
          managedSourceIndexes: [1],
        },
        arrangement: {
          records: [
            {
              sourceIndex: 2,
              name: "Updated Arranger",
              role: "string arranger",
              sortName: "Arranger, Updated",
            },
            {
              sourceIndex: null,
              name: "New Orchestrator",
              role: "orchestrator",
              sortName: "Orchestrator, New",
            },
          ],
          managedSourceIndexes: [2],
        },
      },
    ) as {
      track: {
        contributors: Array<Record<string, unknown>>;
      };
    };

    assert.deepEqual(
      updated.track.contributors,
      [
        {
          name: "Producer",
          role: "producer",
          credit_id: "keep-producer",
        },
        {
          name: "Updated Engineer",
          role: "recording engineer",
          sort_name: "Engineer, Updated",
          credit_id: "keep-engineer",
        },
        {
          name: "Updated Arranger",
          role: "string arranger",
          sort_name: "Arranger, Updated",
          credit_id: "keep-arranger",
        },
        {
          name: "Conductor",
          role: "conductor",
          credit_id: "keep-conductor",
        },
        {
          name: "New Orchestrator",
          role: "orchestrator",
          sort_name: "Orchestrator, New",
        },
      ],
    );
  },
);

test(
  "keeps arrangement and conducting contributor roles in separate editors",
  () => {
    assert.throws(
      () =>
        applyArrangementContributorRecords(
          {
            track: {
              contributors: [],
            },
          },
          [
            {
              sourceIndex: null,
              name: "Conductor",
              role: "conductor",
              sortName: "",
            },
          ],
          [],
        ),
      /not supported by this editor/,
    );
  },
);
