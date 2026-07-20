import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyIngestExtension,
  evidenceValue,
  inferCandidateEvidence,
  inferFilenameEvidence,
} from "../server/ingest-inference.js";

test("classifies supported ingest extensions without requiring WAV", () => {
  assert.equal(classifyIngestExtension(".m4a"), "audio");
  assert.equal(classifyIngestExtension(".mp3"), "audio");
  assert.equal(classifyIngestExtension(".wav"), "audio");
  assert.equal(classifyIngestExtension(".png"), "image");
  assert.equal(classifyIngestExtension(".txt"), "text");
  assert.equal(classifyIngestExtension(".bin"), "unknown");
});

test("infers a folder date, release title, and contextual segments", () => {
  const evidence = inferCandidateEvidence(
    "2016-07-26_CrazyEights_TravisBedroom_GuitarDrums",
  );

  assert.equal(evidenceValue(evidence, "date"), "2016-07-26");
  assert.equal(
    evidenceValue(evidence, "release.title"),
    "Crazy Eights",
  );
  assert.equal(
    evidenceValue(evidence, "folder.context.1"),
    "Travis Bedroom",
  );
  assert.equal(
    evidenceValue(evidence, "folder.context.2"),
    "Guitar Drums",
  );
});

test("uses parent-year evidence to resolve YYMMDD filenames", () => {
  const evidence = inferFilenameEvidence(
    "160726_afternoon-1.m4a",
    2016,
  );

  assert.equal(evidenceValue(evidence, "date"), "2016-07-26");
  assert.equal(
    evidenceValue(evidence, "track.title"),
    "Afternoon",
  );
  assert.equal(
    evidenceValue(evidence, "track.take"),
    "Take 1",
  );
});

test("infers loose-file title, date, and version", () => {
  const evidence = inferFilenameEvidence(
    "161123_Pixels_v0.mp3",
  );

  assert.equal(evidenceValue(evidence, "date"), "2016-11-23");
  assert.equal(evidenceValue(evidence, "track.title"), "Pixels");
  assert.equal(evidenceValue(evidence, "track.version"), "v0");
});

test("infers title, BPM, key, and project prefix from session exports", () => {
  const evidence = inferFilenameEvidence(
    "z8s_Banana_170_Fm.wav",
  );

  assert.equal(evidenceValue(evidence, "track.title"), "Banana");
  assert.equal(evidenceValue(evidence, "track.audio.bpm"), "170");
  assert.equal(evidenceValue(evidence, "track.audio.key"), "F minor");
  assert.equal(evidenceValue(evidence, "source.prefix"), "z8s");
});

test("keeps Jam variants reviewable instead of silently merging them", () => {
  const numbered = inferFilenameEvidence(
    "160727_Jam01-2.m4a",
    2016,
  );
  const lettered = inferFilenameEvidence(
    "160727_Jam01b.m4a",
    2016,
  );

  assert.equal(evidenceValue(numbered, "track.title"), "Jam 01");
  assert.equal(evidenceValue(numbered, "track.take"), "Take 2");
  assert.equal(evidenceValue(lettered, "track.title"), "Jam 01");
  assert.equal(evidenceValue(lettered, "track.take"), "Take B");
});
