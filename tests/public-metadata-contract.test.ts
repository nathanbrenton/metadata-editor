import assert from "node:assert/strict";
import test from "node:test";

import { metadataFieldRegistry } from "../server/metadata-registry.js";
import {
  filterPublicMetadata,
  publicMetadataContractPaths,
  type PublicMetadataDocumentKind,
} from "../server/public-metadata-contract.js";

test("release metadata keeps listener-facing fields and withholds private ones", () => {
  const source = {
    id: "2026-01-01_example",
    title: "Example",
    description: "A public description.",
    primary_artist: { id: "artist_x", name: "X", sort_name: "X" },
    provenance: { origin: "human", note: "" },
    credits: {
      performers: [],
      songwriters: [
        { name: "A Writer", role: "written by", sort_name: "Writer, A" },
      ],
    },
    artwork: [
      {
        id: "front",
        role: "front_cover",
        primary: true,
        master_path: "artwork/front/artwork-master.png",
        web_path: "",
        embedded_path: "",
      },
    ],
    editorial: {
      description_style: "plain",
      profile: { genre: ["genre.rock"] },
    },
  };
  const before = JSON.stringify(source);
  const { value, unclassifiedPaths } = filterPublicMetadata(
    "release",
    source,
  );

  assert.deepEqual(value, {
    id: "2026-01-01_example",
    title: "Example",
    description: "A public description.",
    primary_artist: { id: "artist_x", name: "X", sort_name: "X" },
    provenance: { origin: "human", note: "" },
    credits: {
      performers: [],
      songwriters: [
        { name: "A Writer", role: "written by", sort_name: "Writer, A" },
      ],
    },
    artwork: [{ id: "front", role: "front_cover", primary: true }],
  });
  assert.deepEqual(unclassifiedPaths, []);
  assert.equal(JSON.stringify(source), before, "input must not be mutated");
});

test("track metadata never publishes Library asset locations", () => {
  const { value, unclassifiedPaths } = filterPublicMetadata("track", {
    id: "artist_01_song",
    title: "Song",
    explicit: false,
    artwork: [
      {
        id: "cover",
        role: "front_cover",
        primary: true,
        master_path: "artwork/front/artwork-master.png",
        web_path: "artwork/front/artwork.png",
        embedded_path: "",
      },
    ],
    assets: { audio_master: "audio-master.wav" },
    credit_sources: { file: "track-credits.toml" },
    production_note_sources: { file: "track-production-notes.toml" },
    numbering: { track_number: 1, track_total: 2 },
    text: { lyrics: "la la" },
  });

  assert.deepEqual(value, {
    id: "artist_01_song",
    title: "Song",
    explicit: false,
    artwork: [{ id: "cover", role: "front_cover", primary: true }],
    numbering: { track_number: 1, track_total: 2 },
    text: { lyrics: "la la" },
  });
  assert.deepEqual(unclassifiedPaths, []);
  assert.doesNotMatch(JSON.stringify(value), /_path|audio-master/);
});

test("track credits withhold clearance records, private notes, and editor bookkeeping", () => {
  const { value } = filterPublicMetadata("track-credits", {
    primary_artist: { name: "X", sort_name: "" },
    featured_artists: [],
    performers: [{ name: "X", role: "vocals", editor_only: true }],
    samples: [
      {
        relationship_type: "sample",
        source_title: "Old Song",
        credit_text: "Contains a sample of Old Song.",
        notes: "private negotiation detail",
      },
    ],
    sample_clearances: [
      { sample_reference: 0, status: "cleared", notes: "fee paid" },
    ],
  });

  assert.deepEqual(value, {
    primary_artist: { name: "X", sort_name: "" },
    featured_artists: [],
    performers: [{ name: "X", role: "vocals" }],
    samples: [
      {
        relationship_type: "sample",
        source_title: "Old Song",
        credit_text: "Contains a sample of Old Song.",
      },
    ],
  });
});

test("an unrecognized key is withheld and reported instead of published", () => {
  const { value, unclassifiedPaths } = filterPublicMetadata("track", {
    id: "artist_01_song",
    internal_review: { owner: "me", status: "pending" },
    rights: { license: "All rights reserved.", advance_usd: 500 },
    stems: ["drums.wav"],
  });

  assert.deepEqual(value, {
    id: "artist_01_song",
    rights: { license: "All rights reserved." },
  });
  assert.deepEqual(unclassifiedPaths, [
    "track.internal_review",
    "track.rights.advance_usd",
    "track.stems",
  ]);
});

test("every registered release, track, and credit field is classified public or private", () => {
  const kinds: Record<string, PublicMetadataDocumentKind> = {
    release: "release",
    track: "track",
    "track-credits": "track-credits",
  };
  const under = (candidate: string, listed: string) =>
    candidate === listed ||
    candidate.startsWith(`${listed}.`) ||
    candidate.startsWith(`${listed}[]`);
  const unclassified = metadataFieldRegistry
    .filter((field) => field.storageFileRole in kinds)
    .filter((field) => {
      const { publicPaths, privatePaths } =
        publicMetadataContractPaths(kinds[field.storageFileRole]);

      return (
        !publicPaths.includes(field.tomlPath) &&
        !privatePaths.some((listed) => under(field.tomlPath, listed)) &&
        !field.tomlPath.endsWith(".editor_only")
      );
    })
    .map((field) => field.tomlPath);

  assert.deepEqual(unclassified, []);
});
