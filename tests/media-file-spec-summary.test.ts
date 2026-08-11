import assert from "node:assert/strict";
import test from "node:test";

import {
  presentMediaFileSpecSummary,
  summarizeReleaseMediaFileSpec,
} from "../shared/media-file-spec-summary.js";

test("summarizes preferred and compatibility masters across a release", () => {
  const summary = summarizeReleaseMediaFileSpec({
    artworkMasters: [
      { filename: "artwork-master.tif", extension: ".tif" },
    ],
    tracks: [
      {
        audioMasters: [
          { filename: "audio-master.wav", extension: ".wav" },
          { filename: "audio-master.mp3", extension: ".mp3" },
        ],
        artworkMasters: [],
      },
    ],
    videos: [
      {
        videoMasters: [
          { filename: "video-master.mov", extension: ".mov" },
        ],
      },
    ],
  });

  assert.equal(summary.total, 4);
  assert.equal(summary.preferred, 3);
  assert.equal(summary.compatible, 1);
  assert.equal(summary.unsupported, 0);
  assert.equal(summary.nonCanonicalNames, 0);
  assert.equal(
    presentMediaFileSpecSummary(summary).label,
    "Compatible",
  );
});

test("surfaces non-canonical names before ordinary compatibility", () => {
  const summary = summarizeReleaseMediaFileSpec({
    artworkMasters: [],
    tracks: [
      {
        audioMasters: [
          { filename: "audio-master.MP3", extension: ".MP3" },
        ],
        artworkMasters: [],
      },
    ],
    videos: [],
  });

  assert.equal(summary.compatible, 1);
  assert.equal(summary.nonCanonicalNames, 1);
  assert.equal(
    presentMediaFileSpecSummary(summary).label,
    "Name review",
  );
});

test("treats unsupported formats as outside spec", () => {
  const summary = summarizeReleaseMediaFileSpec({
    artworkMasters: [],
    tracks: [
      {
        audioMasters: [
          { filename: "audio-master.xyz", extension: ".xyz" },
        ],
        artworkMasters: [],
      },
    ],
    videos: [],
  });

  assert.equal(summary.unsupported, 1);
  assert.equal(
    presentMediaFileSpecSummary(summary).label,
    "Outside spec",
  );
});
