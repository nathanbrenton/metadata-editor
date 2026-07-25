import assert from "node:assert/strict";
import test from "node:test";

import {
  describeArtworkPreference,
  selectPreferredArtworkCandidate,
  sortArtworkCandidatesByPreference,
} from "../shared/artwork-preference.js";

function candidate(
  relativePath: string,
  extension: string,
) {
  return {
    filename: relativePath.split("/").at(-1) ?? relativePath,
    relativePath,
    extension,
  };
}

test("uses the documented artwork format priority", () => {
  const candidates = [
    candidate("artwork/front/artwork-master.jpg", ".jpg"),
    candidate("artwork/front/artwork-master.webp", ".webp"),
    candidate("artwork/front/artwork-master.png", ".png"),
    candidate("artwork/front/artwork-master.tif", ".tif"),
  ];

  assert.deepEqual(
    sortArtworkCandidatesByPreference(candidates).map(
      (item) => item.extension,
    ),
    [".tif", ".png", ".webp", ".jpg"],
  );
});

test("prefers explicit front artwork before a different artwork role", () => {
  const frontPng = candidate(
    "artwork/front/artwork-master.png",
    ".png",
  );
  const backTif = candidate(
    "artwork/back/artwork-master.tif",
    ".tif",
  );

  assert.equal(
    selectPreferredArtworkCandidate([backTif, frontPng])?.relativePath,
    frontPng.relativePath,
  );
});

test("describes the suggested archival TIFF choice", () => {
  assert.equal(
    describeArtworkPreference(
      candidate("artwork/front/artwork-master.tiff", ".tiff"),
    ),
    "preferred archival TIFF master",
  );
});
