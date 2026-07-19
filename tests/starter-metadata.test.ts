import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStarterMetadataPlan,
} from "../server/starter-metadata.js";
import type {
  ReleaseScanResult,
} from "../server/types.js";

function fixture(): ReleaseScanResult {
  return {
    id: "2025-09-10_nebula-remixes",
    relativePath:
      "releases/2025-09-10_nebula-remixes",
    metadataFiles: [
      {
        filename: "release.toml",
        relativePath:
          "releases/2025-09-10_nebula-remixes/release.toml",
        exists: false,
      },
    ],
    artworkMasters: [
      {
        filename: "artwork-master.jpeg",
        relativePath:
          "releases/2025-09-10_nebula-remixes/artwork/front/artwork-master.jpeg",
        extension: ".jpeg",
      },
    ],
    tracks: [
      {
        id:
          "nathan-brenton_01_nebula-original-mix",
        relativePath:
          "releases/2025-09-10_nebula-remixes/tracks/nathan-brenton_01_nebula-original-mix",
        metadataFiles: [
          {
            filename: "track.toml",
            relativePath:
              "releases/2025-09-10_nebula-remixes/tracks/nathan-brenton_01_nebula-original-mix/track.toml",
            exists: false,
          },
          {
            filename:
              "track-credits.toml",
            relativePath:
              "releases/2025-09-10_nebula-remixes/tracks/nathan-brenton_01_nebula-original-mix/track-credits.toml",
            exists: false,
          },
        ],
        audioMasters: [
          {
            filename: "audio-master.wav",
            relativePath:
              "releases/2025-09-10_nebula-remixes/tracks/nathan-brenton_01_nebula-original-mix/audio-master.wav",
            extension: ".wav",
          },
        ],
        artworkMasters: [],
      },
    ],
  };
}

test(
  "starter plan creates release, track, and track-credit documents",
  () => {
    const plan = buildStarterMetadataPlan(
      fixture(),
      {
        releaseId:
          "2025-09-10_nebula-remixes",
        releaseTitle:
          "Nebula Remixes",
        releaseDate: "2025-09-10",
        releaseArtist:
          "Nathan Brenton",
        tracks: [
          {
            trackId:
              "nathan-brenton_01_nebula-original-mix",
            trackNumber: 1,
            artist: "Nathan Brenton",
            title: "Nebula",
            version: "Original Mix",
            displayTitle:
              "Nebula (Original Mix)",
          },
        ],
      },
    );

    assert.equal(
      plan.summary.createCount,
      3,
    );
    assert.equal(
      plan.summary.blockedCount,
      0,
    );

    const releaseItem =
      plan.items.find(
        (item) =>
          item.filename ===
          "release.toml",
      );
    const trackItem =
      plan.items.find(
        (item) =>
          item.filename === "track.toml",
      );
    const creditsItem =
      plan.items.find(
        (item) =>
          item.filename ===
          "track-credits.toml",
      );

    assert.match(
      releaseItem?.content ?? "",
      /title = "Nebula Remixes"/,
    );
    assert.match(
      releaseItem?.content ?? "",
      /track_total = 1/,
    );
    assert.match(
      trackItem?.content ?? "",
      /title = "Nebula"/,
    );
    assert.match(
      trackItem?.content ?? "",
      /version = "Original Mix"/,
    );
    assert.match(
      trackItem?.content ?? "",
      /display_title = "Nebula \(Original Mix\)"/,
    );
    assert.match(
      trackItem?.content ?? "",
      /audio_master = "audio-master\.wav"/,
    );
    assert.match(
      creditsItem?.content ?? "",
      /name = "Nathan Brenton"/,
    );
  },
);

test(
  "starter plan blocks existing targets",
  () => {
    const release = fixture();
    release.metadataFiles[0]!.exists =
      true;

    const plan = buildStarterMetadataPlan(
      release,
      {
        releaseId:
          "2025-09-10_nebula-remixes",
        releaseTitle:
          "Nebula Remixes",
        releaseDate: "2025-09-10",
        releaseArtist:
          "Nathan Brenton",
        tracks: [
          {
            trackId:
              "nathan-brenton_01_nebula-original-mix",
            trackNumber: 1,
            artist: "Nathan Brenton",
            title:
              "Nebula (Original Mix)",
          },
        ],
      },
    );

    assert.equal(
      plan.summary.blockedCount,
      1,
    );
  },
);
