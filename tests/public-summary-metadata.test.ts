import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  findMetadataField,
} from "../server/metadata-registry.js";

const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const publisherSource = await readFile(
  new URL("../server/publish-writer.ts", import.meta.url),
  "utf8",
);
const artistPublicationSource = await readFile(
  new URL("../server/artist-publication.ts", import.meta.url),
  "utf8",
);

test("registers release.description as optional public multiline copy", () => {
  const field = findMetadataField(
    "release.description",
  );

  assert.ok(field);
  assert.equal(field.storageFileRole, "release");
  assert.equal(field.required, false);
  assert.equal(field.presentation?.group, "Text and Notes");
  assert.equal(field.editor?.control, "multiline");

  if (field.editor?.control !== "multiline") {
    throw new Error("release.description must use multiline editor");
  }

  assert.equal(field.editor.rows, 6);
  assert.equal(field.editor.maxLength, 2400);
});

test("metadata editor renders registered multiline scalar fields as textarea", () => {
  assert.match(
    appSource,
    /field\?\.editor\?\.control === "multiline"/,
  );
  assert.match(
    appSource,
    /className="metadata-editor-field metadata-multiline-field"/,
  );
  assert.match(
    appSource,
    /multilineEditor\.help/,
  );
});

test("release publication preserves approved release.description in sanitized metadata", () => {
  assert.match(
    publisherSource,
    /metadata:\s*sanitizeReleaseMetadata/,
  );
  assert.doesNotMatch(
    publisherSource,
    /delete\s+.*description/,
  );
});

test("Artist publication fingerprints and emits canonical artist.bio", () => {
  assert.match(
    artistPublicationSource,
    /bio:\s*artist\.bio \?\? null/,
  );
  assert.match(
    artistPublicationSource,
    /\{ bio: artist\.bio \}/,
  );
});
