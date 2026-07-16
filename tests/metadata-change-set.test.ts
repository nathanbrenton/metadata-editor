import assert from "node:assert/strict";
import test from "node:test";

import {
  applyMetadataChanges,
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
