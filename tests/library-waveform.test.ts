import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLibraryWaveformUrl,
  parseLibraryWaveformData,
} from "../src/library-waveform.js";

test("builds a confined identifier-based Library waveform URL", () => {
  assert.equal(
    buildLibraryWaveformUrl(
      "2026-08-12 Example Release",
      "Artist/Track 01",
    ),
    "/api/library/waveform?release=2026-08-12+Example+Release&track=Artist%2FTrack+01",
  );
});

test("accepts generated multiband waveform data", () => {
  const waveform = parseLibraryWaveformData({
    version: 2,
    durationSeconds: 12.5,
    sampleRate: 48_000,
    sourceChannels: 2,
    waveformChannels: 1,
    bitsPerSample: 24,
    peaksPerSecond: 400,
    peakCount: 2,
    peaks: [
      [-0.5, 0.7, 0.3, 0.2, 0.1],
      [-0.4, 0.6, 0.4, 0.3, 0.2],
    ],
  });

  assert.equal(waveform.version, 2);
  assert.equal(waveform.peaks.length, 2);
  assert.equal(waveform.peaksPerSecond, 400);
});

test("rejects malformed waveform peak arrays", () => {
  assert.throws(
    () =>
      parseLibraryWaveformData({
        version: 2,
        durationSeconds: 12.5,
        sampleRate: 48_000,
        sourceChannels: 2,
        waveformChannels: 1,
        bitsPerSample: 24,
        peaksPerSecond: 400,
        peakCount: 1,
        peaks: [[0, 1, 0.2]],
      }),
    /invalid peak/,
  );
});
