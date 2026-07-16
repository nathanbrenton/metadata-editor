import assert from "node:assert/strict";
import test from "node:test";
import { parse } from "smol-toml";

import { buildMetadataPreview } from "../server/inference.js";
import { buildGeneratedTomlPreview } from "../server/toml-preview.js";
import type { ReleaseScanResult } from "../server/types.js";

function createIncompleteRelease(): ReleaseScanResult {
  return {
    id: "2026-07-30_this-ones-all-you",
    relativePath:
      "releases/2026-07-30_this-ones-all-you",
    metadataFiles: [],
    artworkMasters: [
      {
        filename: "artwork-master.jpeg",
        relativePath:
          "releases/2026-07-30_this-ones-all-you/artwork/front/artwork-master.jpeg",
        extension: ".jpeg",
      },
    ],
    tracks: [
      {
        id: "generation-auto_01_this-ones-all-you",
        relativePath:
          "releases/2026-07-30_this-ones-all-you/tracks/generation-auto_01_this-ones-all-you",
        metadataFiles: [],
        audioMasters: [
          {
            filename: "audio-master.wav",
            relativePath:
              "releases/2026-07-30_this-ones-all-you/tracks/generation-auto_01_this-ones-all-you/audio-master.wav",
            extension: ".wav",
          },
        ],
        artworkMasters: [],
      },
    ],
  };
}

test(
  "renders six validated TOML documents",
  () => {
    const release = createIncompleteRelease();
    const inferred =
      buildMetadataPreview(release);
    const generated =
      buildGeneratedTomlPreview(
        release,
        inferred,
      );

    assert.equal(
      generated.documents.length,
      6,
    );

    assert.equal(
      generated.documents.every(
        (document) => document.validated,
      ),
      true,
    );

    for (const document of generated.documents) {
      assert.doesNotThrow(() =>
        parse(document.content),
      );
    }
  },
);

test(
  "uses integer track numbers without leading zeroes",
  () => {
    const release = createIncompleteRelease();
    const inferred =
      buildMetadataPreview(release);
    const generated =
      buildGeneratedTomlPreview(
        release,
        inferred,
      );

    const trackDocument =
      generated.documents.find(
        (document) =>
          document.filename === "track.toml",
      );

    assert.ok(trackDocument);

    assert.match(
      trackDocument.content,
      /track_number = 1\b/,
    );

    assert.doesNotMatch(
      trackDocument.content,
      /track_number = 01\b/,
    );
  },
);

test(
  "uses paths relative to their metadata directories",
  () => {
    const release = createIncompleteRelease();
    const inferred =
      buildMetadataPreview(release);
    const generated =
      buildGeneratedTomlPreview(
        release,
        inferred,
      );

    const releaseDocument =
      generated.documents.find(
        (document) =>
          document.filename === "release.toml",
      );

    const trackDocument =
      generated.documents.find(
        (document) =>
          document.filename === "track.toml",
      );

    assert.ok(releaseDocument);
    assert.ok(trackDocument);

    assert.match(
      releaseDocument.content,
      /master_path = "artwork\/front\/artwork-master\.jpeg"/,
    );

    assert.match(
      trackDocument.content,
      /audio_master = "audio-master\.wav"/,
    );

    assert.doesNotMatch(
      trackDocument.content,
      /releases\/2026-07-30/,
    );
  },
);
