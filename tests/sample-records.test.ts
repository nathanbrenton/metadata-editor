import assert from "node:assert/strict";
import test from "node:test";

import {
  applySampleClearanceRecords,
  applySampleRelationshipRecords,
} from "../server/sample-records.js";

test("saves sample relationships while preserving unknown source keys", () => {
  const result = applySampleRelationshipRecords(
    {
      track: {
        samples: [
          {
            relationship_type: "sample",
            source_title: "Old title",
            clearance_case_id: "CASE-7",
          },
        ],
      },
    },
    [
      {
        sourceIndex: 0,
        relationshipType: "interpolation",
        sourceTitle: "Example Song",
        sourceArtist: "Example Artist",
        sourceWriters: ["Writer One"],
        sourceRelease: "Example Album",
        sourceYear: 1975,
        sourceIsrc: "US-AAA-75-00001",
        sourceIswc: "T-123.456.789-0",
        usageDescription: "chorus melody",
        creditText:
          "Contains an interpolation of “Example Song”, written by Writer One.",
        notes: "Confirmed from liner notes.",
      },
    ],
  ) as {
    track: {
      samples: Array<Record<string, unknown>>;
    };
  };

  assert.deepEqual(result.track.samples, [
    {
      clearance_case_id: "CASE-7",
      relationship_type: "interpolation",
      source_title: "Example Song",
      source_artist: "Example Artist",
      source_release: "Example Album",
      source_isrc: "US-AAA-75-00001",
      source_iswc: "T-123.456.789-0",
      usage_description: "chorus melody",
      credit_text:
        "Contains an interpolation of “Example Song”, written by Writer One.",
      notes: "Confirmed from liner notes.",
      source_writers: ["Writer One"],
      source_year: 1975,
    },
  ]);
});

test("stores sample clearance records as editor-only administration", () => {
  const result = applySampleClearanceRecords(
    { track: {} },
    [
      {
        sourceIndex: null,
        sampleReference: 1,
        status: "cleared",
        masterUseCleared: true,
        publishingCleared: true,
        agreementReference: "AGR-2026-014",
        territories: ["worldwide"],
        expirationDate: "2030-12-31",
        notes: "Executed agreement on file.",
      },
    ],
  ) as {
    track: {
      sample_clearances: Array<Record<string, unknown>>;
    };
  };

  assert.deepEqual(result.track.sample_clearances, [
    {
      sample_reference: 1,
      status: "cleared",
      master_use_cleared: true,
      publishing_cleared: true,
      editor_only: true,
      agreement_reference: "AGR-2026-014",
      territories: ["worldwide"],
      expiration_date: "2030-12-31",
      notes: "Executed agreement on file.",
    },
  ]);
});

test("rejects invalid sample source years and clearance references", () => {
  assert.throws(
    () =>
      applySampleRelationshipRecords(
        { track: {} },
        [
          {
            sourceIndex: null,
            relationshipType: "sample",
            sourceTitle: "Source",
            sourceArtist: "",
            sourceWriters: [],
            sourceRelease: "",
            sourceYear: 75,
            sourceIsrc: "",
            sourceIswc: "",
            usageDescription: "",
            creditText: "",
            notes: "",
          },
        ],
      ),
    /four-digit year/,
  );

  assert.throws(
    () =>
      applySampleClearanceRecords(
        { track: {} },
        [
          {
            sourceIndex: null,
            sampleReference: 0,
            status: "not reviewed",
            masterUseCleared: false,
            publishingCleared: false,
            agreementReference: "",
            territories: [],
            expirationDate: "",
            notes: "",
          },
        ],
      ),
    /positive sample reference/,
  );
});


test("allows an unknown exact sample source when the source artist is identified", () => {
  const result = applySampleRelationshipRecords(
    { track: {} },
    [
      {
        sourceIndex: null,
        relationshipType: "unknown sample source",
        sourceTitle: "",
        sourceArtist: "Example Artist",
        sourceWriters: [],
        sourceRelease: "",
        sourceYear: null,
        sourceIsrc: "",
        sourceIswc: "",
        usageDescription: "unidentified vocal excerpt",
        creditText: "Contains an unidentified sample associated with Example Artist.",
        notes: "Exact source recording still under review.",
      },
    ],
  ) as { track: { samples: Array<Record<string, unknown>> } };

  assert.deepEqual(result.track.samples, [
    {
      relationship_type: "unknown sample source",
      source_artist: "Example Artist",
      usage_description: "unidentified vocal excerpt",
      credit_text: "Contains an unidentified sample associated with Example Artist.",
      notes: "Exact source recording still under review.",
    },
  ]);
});
