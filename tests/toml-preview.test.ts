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

test(
  "writes inferred track version and display title",
  () => {
    const release: ReleaseScanResult = {
      id: "2025-09-10_nebula-remixes",
      relativePath:
        "releases/2025-09-10_nebula-remixes",
      metadataFiles: [],
      artworkMasters: [],
      tracks: [
        {
          id:
            "nathanbrenton_01_nebula-original-mix",
          relativePath:
            "releases/2025-09-10_nebula-remixes/tracks/nathanbrenton_01_nebula-original-mix",
          metadataFiles: [],
          audioMasters: [],
          artworkMasters: [],
        },
      ],
    };
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
      /title = "Nebula"/,
    );
    assert.match(
      trackDocument.content,
      /version = "Original Mix"/,
    );
    assert.match(
      trackDocument.content,
      /display_title = "Nebula \(Original Mix\)"/,
    );
  },
);

test(
  "generates separate production recording and editing templates",
  () => {
    const release = createIncompleteRelease();
    const generated = buildGeneratedTomlPreview(
      release,
      buildMetadataPreview(release),
    );
    const releaseNotes = generated.documents.find(
      (document) =>
        document.filename ===
        "release-production-notes.toml",
    );
    const trackNotes = generated.documents.find(
      (document) =>
        document.filename ===
        "track-production-notes.toml",
    );

    assert.ok(releaseNotes);
    assert.ok(trackNotes);

    for (const content of [
      releaseNotes.content,
      trackNotes.content,
    ]) {
      assert.match(content, /\[production\]/);
      assert.match(
        content,
        /\[production\.recording\]/,
      );
      assert.match(
        content,
        /\[production\.editing\]/,
      );
      assert.match(
        content,
        /production_type = ""/,
      );
    }
  },
);

test(
  "generates release and track rights plus a release performer baseline",
  () => {
    const release = createIncompleteRelease();
    const generated = buildGeneratedTomlPreview(
      release,
      buildMetadataPreview(release),
    );
    const releaseToml = generated.documents.find(
      (document) =>
        document.filename === "release.toml",
    );
    const trackToml = generated.documents.find(
      (document) =>
        document.filename === "track.toml",
    );

    assert.ok(releaseToml);
    assert.ok(trackToml);
    assert.match(
      releaseToml.content,
      /\[release\.rights\]/,
    );
    assert.match(
      releaseToml.content,
      /phonographic_copyright = ""/,
    );
    assert.match(
      releaseToml.content,
      /performers = \[\]/,
    );
    assert.match(
      trackToml.content,
      /\[track\.rights\]/,
    );
  },
);
