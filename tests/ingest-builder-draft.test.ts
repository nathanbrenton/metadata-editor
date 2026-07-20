import assert from "node:assert/strict";
import test from "node:test";

import {
  createDefaultIngestBuildDraft,
  slugifyIngestValue,
} from "../shared/ingest-builder.js";
import type {
  IngestCandidateInspection,
} from "../shared/ingest-types.js";

function inspection(): IngestCandidateInspection {
  return {
    inspectedAt: "2026-07-20T00:00:00.000Z",
    candidate: {
      id: "161123_Pixels_v0.mp3",
      name: "161123_Pixels_v0.mp3",
      relativePath: "161123_Pixels_v0.mp3",
      kind: "loose-file",
      displayTitle: "Pixels",
      fileCount: 1,
      audioCount: 1,
      imageCount: 0,
      textCount: 0,
      unknownCount: 0,
      totalSizeBytes: 100,
      extensions: [".mp3"],
      dateCandidates: ["2016-11-23"],
      evidence: [
        {
          field: "date",
          value: "2016-11-23",
          source: "filename",
          rawValue: "161123_Pixels_v0",
          confidence: "medium",
          rule: "date-yymmdd-pivot-v1",
        },
        {
          field: "track.version",
          value: "v0",
          source: "filename",
          rawValue: "161123_Pixels_v0.mp3",
          confidence: "high",
          rule: "filename-version-suffix-v1",
        },
        {
          field: "track.title",
          value: "Pixels",
          source: "filename",
          rawValue: "161123_Pixels_v0.mp3",
          confidence: "high",
          rule: "filename-title-v1",
        },
      ],
      warnings: [],
    },
    files: [
      {
        relativePath: "161123_Pixels_v0.mp3",
        filename: "161123_Pixels_v0.mp3",
        extension: ".mp3",
        sizeBytes: 100,
        modifiedAt: "2016-11-24T00:00:00.000Z",
        mediaKind: "audio",
        detectedBy: "ffprobe",
        technical: {
          codec: "mp3",
        },
        embeddedMetadata: {
          artist: "Nathan Brenton",
        },
        evidence: [
          {
            field: "date",
            value: "2016-11-23",
            source: "filename",
            rawValue: "161123_Pixels_v0.mp3",
            confidence: "medium",
            rule: "date-yymmdd-pivot-v1",
          },
          {
            field: "track.version",
            value: "v0",
            source: "filename",
            rawValue: "161123_Pixels_v0.mp3",
            confidence: "high",
            rule: "filename-version-suffix-v1",
          },
          {
            field: "track.title",
            value: "Pixels",
            source: "filename",
            rawValue: "161123_Pixels_v0.mp3",
            confidence: "high",
            rule: "filename-title-v1",
          },
        ],
        warnings: [],
      },
    ],
    capabilities: {
      ffprobe: {
        available: true,
      },
      mediainfo: {
        available: false,
      },
    },
    warnings: [],
    readOnly: true,
  };
}

test(
  "creates a reviewable loose-file draft from deterministic evidence",
  () => {
    const draft =
      createDefaultIngestBuildDraft(
        inspection(),
      );

    assert.equal(
      draft.releaseId,
      "2016-11-23_pixels",
    );
    assert.equal(
      draft.releaseTitle,
      "Pixels",
    );
    assert.equal(
      draft.releaseArtist,
      "Nathan Brenton",
    );
    assert.equal(
      draft.releaseDate,
      "2016-11-23",
    );
    assert.equal(
      draft.releaseType,
      "single",
    );
    assert.deepEqual(
      draft.tracks.map((track) => ({
        title: track.title,
        version: track.version,
        artist: track.artist,
        destinationFilename:
          track.destinationFilename,
      })),
      [
        {
          title: "Pixels",
          version: "v0",
          artist: "Nathan Brenton",
          destinationFilename:
            "audio-master.mp3",
        },
      ],
    );
  },
);

test(
  "normalizes inferred release and track text into safe slugs",
  () => {
    assert.equal(
      slugifyIngestValue(
        "CrazyEights / Guitar & Drums",
      ),
      "crazy-eights-guitar-drums",
    );
  },
);
