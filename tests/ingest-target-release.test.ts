import assert from "node:assert/strict";
import test from "node:test";

import {
  buildExistingReleaseIdentitySeed,
  findAutomaticIngestTargetRelease,
} from "../src/ingest-target-release.js";

const releases = [
  {
    id: "2026-01-01_cardillo",
    releaseTitle: "Cardillo",
    primaryArtistName: "nobodies",
    releaseDate: "2026-01-01",
    releaseType: "single",
  },
  {
    id: "2026-02-02_feels",
    releaseTitle: "Feels",
    primaryArtistName: "nobodies",
    releaseDate: "2026-02-02",
    releaseType: "album",
  },
];

test("auto-targets one exact Library title and artist match", () => {
  assert.equal(
    findAutomaticIngestTargetRelease(
      releases,
      {
        releaseTitle: " cardillo ",
        releaseArtist: "NOBODIES",
      },
    )?.id,
    "2026-01-01_cardillo",
  );
});



test("auto-targets an exact generated release ID when one release date is known", () => {
  assert.equal(
    findAutomaticIngestTargetRelease(
      releases,
      {
        releaseTitle: "Cardillo",
        releaseArtist: "",
        releaseDate: "2026-01-01",
      },
    )?.id,
    "2026-01-01_cardillo",
  );
});

test("auto-target does not guess from title alone", () => {
  assert.equal(
    findAutomaticIngestTargetRelease(
      releases,
      {
        releaseTitle: "Cardillo",
        releaseArtist: "",
      },
    ),
    null,
  );
});

test("auto-target refuses ambiguous title and artist matches", () => {
  assert.equal(
    findAutomaticIngestTargetRelease(
      [
        ...releases,
        {
          ...releases[0],
          id: "2026-03-03_cardillo",
        },
      ],
      {
        releaseTitle: "Cardillo",
        releaseArtist: "nobodies",
      },
    ),
    null,
  );
});

test("builds an authoritative existing-release staging seed", () => {
  assert.deepEqual(
    buildExistingReleaseIdentitySeed(
      releases[0],
    ),
    {
      releaseArtist: "nobodies",
      releaseTitle: "Cardillo",
      targetReleaseId:
        "2026-01-01_cardillo",
      releaseDate: "2026-01-01",
      releaseType: "single",
    },
  );
});
