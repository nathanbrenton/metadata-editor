import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyMetadataEditability,
  isEditableMetadataValue,
} from "../server/metadata-editability.js";

test(
  "classifies ordinary scalar fields as editable",
  () => {
    assert.deepEqual(
      classifyMetadataEditability(
        "track.title",
        "Example",
      ),
      {
        editable: true,
        indexed: false,
        valueType: "string",
        reason: null,
      },
    );

    assert.equal(
      classifyMetadataEditability(
        "track.explicit",
        false,
      ).valueType,
      "boolean",
    );

    assert.equal(
      classifyMetadataEditability(
        "track.numbering.track_number",
        4,
      ).valueType,
      "number",
    );
  },
);

test(
  "classifies indexed scalar fields as editable",
  () => {
    const result =
      classifyMetadataEditability(
        "track.performers[0].role",
        "guitar",
      );

    assert.equal(result.editable, true);
    assert.equal(result.indexed, true);
    assert.equal(result.valueType, "string");
    assert.equal(result.reason, null);
  },
);

test(
  "classifies string arrays as editable",
  () => {
    const result =
      classifyMetadataEditability(
        "release.genres",
        ["rock", "electronic"],
      );

    assert.equal(result.editable, true);
    assert.equal(
      result.valueType,
      "string-array",
    );
  },
);

test(
  "rejects arrays of tables as direct values",
  () => {
    const result =
      classifyMetadataEditability(
        "track.performers",
        [
          {
            name: "Artist",
          },
        ],
      );

    assert.equal(result.editable, false);
    assert.match(
      result.reason ?? "",
      /Only arrays containing strings/,
    );
  },
);

test(
  "rejects metadata objects as direct values",
  () => {
    const result =
      classifyMetadataEditability(
        "track.numbering",
        {
          track_number: 1,
        },
      );

    assert.equal(result.editable, false);
    assert.match(
      result.reason ?? "",
      /individual fields/,
    );
  },
);

test(
  "rejects malformed and unsafe paths",
  () => {
    const malformed =
      classifyMetadataEditability(
        "track.performers[].name",
        "Artist",
      );

    assert.equal(malformed.editable, false);
    assert.equal(
      malformed.valueType,
      "unsupported",
    );

    const unsafe =
      classifyMetadataEditability(
        "track.__proto__.name",
        "Artist",
      );

    assert.equal(unsafe.editable, false);
    assert.match(
      unsafe.reason ?? "",
      /Unsafe metadata path segment/,
    );
  },
);

test(
  "identifies supported values independently",
  () => {
    assert.equal(
      isEditableMetadataValue("title"),
      true,
    );
    assert.equal(
      isEditableMetadataValue(4),
      true,
    );
    assert.equal(
      isEditableMetadataValue(false),
      true,
    );
    assert.equal(
      isEditableMetadataValue([
        "rock",
        "pop",
      ]),
      true,
    );

    assert.equal(
      isEditableMetadataValue([
        {
          name: "Artist",
        },
      ]),
      false,
    );
    assert.equal(
      isEditableMetadataValue(null),
      false,
    );
  },
);
