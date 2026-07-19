import assert from "node:assert/strict";
import test from "node:test";

import { buildMetadataPreview } from "../server/inference.js";
import type { ReleaseScanResult } from "../server/types.js";

test(
  "infers low-risk release and track values",
  () => {
    const release: ReleaseScanResult = {
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

    const preview =
      buildMetadataPreview(release);

    assert.equal(
      preview.release.releaseId.value,
      "2026-07-30_this-ones-all-you",
    );
    assert.equal(
      preview.release.releaseDate?.value,
      "2026-07-30",
    );
    assert.equal(
      preview.release.releaseTitle?.value,
      "This Ones All You",
    );
    assert.equal(
      preview.tracks[0]?.artistName?.value,
      "Generation Auto",
    );
    assert.equal(
      preview.tracks[0]?.trackNumber?.value,
      1,
    );
    assert.equal(
      preview.tracks[0]?.trackTitle?.value,
      "This Ones All You",
    );
    assert.equal(
      preview.tracks[0]?.audioMasterPath?.value,
      release.tracks[0]?.audioMasters[0]
        ?.relativePath,
    );
    assert.deepEqual(preview.warnings, []);
  },
);

test(
  "does not choose ambiguous master assets",
  () => {
    const release: ReleaseScanResult = {
      id: "unstructured-release",
      relativePath:
        "releases/unstructured-release",
      metadataFiles: [],
      artworkMasters: [
        {
          filename: "artwork-master.jpg",
          relativePath:
            "releases/unstructured-release/artwork-master.jpg",
          extension: ".jpg",
        },
        {
          filename: "artwork-master.png",
          relativePath:
            "releases/unstructured-release/artwork-master.png",
          extension: ".png",
        },
      ],
      tracks: [
        {
          id: "unstructured-track",
          relativePath:
            "releases/unstructured-release/tracks/unstructured-track",
          metadataFiles: [],
          audioMasters: [],
          artworkMasters: [],
        },
      ],
    };

    const preview =
      buildMetadataPreview(release);

    assert.equal(
      preview.release.releaseDate,
      undefined,
    );
    assert.equal(
      preview.release.artworkMasterPath,
      undefined,
    );
    assert.equal(
      preview.tracks[0]?.artistName,
      undefined,
    );
    assert.equal(
      preview.tracks[0]?.audioMasterPath,
      undefined,
    );
    assert.equal(
      preview.warnings.length,
      2,
    );
  },
);

test(
  "separates folder-derived title, version, and display title",
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

    const preview =
      buildMetadataPreview(release);
    const track = preview.tracks[0];

    assert.equal(
      track?.trackTitle?.value,
      "Nebula",
    );
    assert.equal(
      track?.trackVersion?.value,
      "Original Mix",
    );
    assert.equal(
      track?.trackDisplayTitle?.value,
      "Nebula (Original Mix)",
    );
  },
);
