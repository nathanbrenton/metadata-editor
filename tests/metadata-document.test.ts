import assert from "node:assert/strict";
import test from "node:test";

import {
  deleteMetadataValueAtPath,
  readMetadataValueAtPath,
  replaceMetadataValueAtPath,
} from "../server/metadata-document.js";

function createDocument() {
  return {
    track: {
      title: "Original Title",
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
      genres: [
        "rock",
        "electronic",
      ],
    },
  };
}

test(
  "reads scalar values through object paths",
  () => {
    const document = createDocument();

    assert.equal(
      readMetadataValueAtPath(
        document,
        "track.title",
      ),
      "Original Title",
    );
  },
);

test(
  "reads values through indexed paths",
  () => {
    const document = createDocument();

    assert.equal(
      readMetadataValueAtPath(
        document,
        "track.performers[1].role",
      ),
      "vocals",
    );
  },
);

test(
  "replaces an indexed value immutably",
  () => {
    const document = createDocument();

    const updated =
      replaceMetadataValueAtPath(
        document,
        "track.performers[0].role",
        "electric guitar",
      ) as typeof document;

    assert.equal(
      updated.track.performers[0].role,
      "electric guitar",
    );

    assert.equal(
      document.track.performers[0].role,
      "guitar",
    );

    assert.notEqual(updated, document);
    assert.notEqual(
      updated.track,
      document.track,
    );
    assert.notEqual(
      updated.track.performers,
      document.track.performers,
    );
    assert.notEqual(
      updated.track.performers[0],
      document.track.performers[0],
    );

    // Unchanged sibling records retain their reference.
    assert.equal(
      updated.track.performers[1],
      document.track.performers[1],
    );
  },
);

test(
  "replaces an existing string array",
  () => {
    const document = createDocument();

    const updated =
      replaceMetadataValueAtPath(
        document,
        "track.genres",
        ["ambient", "experimental"],
      ) as typeof document;

    assert.deepEqual(
      updated.track.genres,
      ["ambient", "experimental"],
    );

    assert.deepEqual(
      document.track.genres,
      ["rock", "electronic"],
    );
  },
);

test(
  "rejects missing object fields",
  () => {
    const document = createDocument();

    assert.throws(
      () =>
        readMetadataValueAtPath(
          document,
          "track.missing",
        ),
      /does not contain "missing"/,
    );

    assert.throws(
      () =>
        replaceMetadataValueAtPath(
          document,
          "track.missing",
          "value",
        ),
      /does not contain "missing"/,
    );
  },
);

test(
  "rejects out-of-bounds array indexes",
  () => {
    const document = createDocument();

    assert.throws(
      () =>
        readMetadataValueAtPath(
          document,
          "track.performers[8].name",
        ),
      /out of bounds/,
    );
  },
);

test(
  "rejects object traversal through arrays",
  () => {
    const document = createDocument();

    assert.throws(
      () =>
        readMetadataValueAtPath(
          document,
          "track.performers.name",
        ),
      /cannot be read directly from an array/,
    );
  },
);

test(
  "rejects array traversal through objects",
  () => {
    const document = createDocument();

    assert.throws(
      () =>
        readMetadataValueAtPath(
          document,
          "track[0].title",
        ),
      /requires an array/,
    );
  },
);

test(
  "inherits unsafe-path rejection from the parser",
  () => {
    const document = createDocument();

    assert.throws(
      () =>
        replaceMetadataValueAtPath(
          document,
          "track.__proto__.value",
          "unsafe",
        ),
      /Unsafe metadata path segment/,
    );
  },
);


test(
  "deletes an object-path field immutably and preserves siblings",
  () => {
    const document = {
      track: {
        script: "Latn",
        title: "Angel",
      },
    };

    const updated =
      deleteMetadataValueAtPath(
        document,
        "track.script",
      ) as {
        track: {
          title: string;
          script?: string;
        };
      };

    assert.equal(
      updated.track.script,
      undefined,
    );
    assert.equal(
      updated.track.title,
      "Angel",
    );
    assert.equal(
      document.track.script,
      "Latn",
    );
  },
);

test(
  "prunes empty parent tables after field deletion",
  () => {
    const updated =
      deleteMetadataValueAtPath(
        {
          track: {
            text: {
              lyrics_script: "",
            },
            title: "Angel",
          },
        },
        "track.text.lyrics_script",
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
    assert.equal(
      updated.track.title,
      "Angel",
    );
  },
);

test(
  "rejects array-indexed field deletion",
  () => {
    assert.throws(
      () =>
        deleteMetadataValueAtPath(
          createDocument(),
          "track.performers[0].role",
        ),
      /non-array object path/,
    );
  },
);
