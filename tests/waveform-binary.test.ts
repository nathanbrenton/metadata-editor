import assert from "node:assert/strict";
import test from "node:test";

import {
  WAVEFORM_BINARY_HEADER_BYTES,
  WAVEFORM_BINARY_PEAK_BYTES,
  decodeWaveformBinary,
  decodeWaveformPayload,
  encodeWaveformBinary,
} from "../../packages/media-player/src/waveform-binary.js";
import {
  generateWaveformPeaksFromWav,
} from "../server/media-processing/waveform-generator.js";

function createPcm16Wav(): Buffer {
  const sampleRate = 48_000;
  const channels = 2;
  const frameCount = 4_800;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const dataSize = frameCount * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * blockAlign, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);

  for (let frame = 0; frame < frameCount; frame += 1) {
    const sample = Math.round(
      Math.sin((2 * Math.PI * 440 * frame) / sampleRate) * 25_000,
    );

    for (let channel = 0; channel < channels; channel += 1) {
      buffer.writeInt16LE(
        sample,
        44 + frame * blockAlign + channel * bytesPerSample,
      );
    }
  }

  return buffer;
}

test("compact waveform keeps 400 pps and five fields with bounded quantization error", () => {
  const source = generateWaveformPeaksFromWav(createPcm16Wav(), 400);
  const encoded = encodeWaveformBinary(source);
  const decoded = decodeWaveformBinary(encoded);

  assert.equal(decoded.version, source.version);
  assert.equal(decoded.peaksPerSecond, 400);
  assert.equal(decoded.peakCount, source.peakCount);
  assert.equal(decoded.durationSeconds, source.durationSeconds);
  assert.equal(decoded.sampleRate, source.sampleRate);
  assert.deepEqual(decoded.analysis.peakFields, source.analysis.peakFields);
  assert.deepEqual(decoded.analysis.bandsHz, source.analysis.bandsHz);
  assert.deepEqual(
    decoded.analysis.normalization.references,
    source.analysis.normalization.references,
  );
  assert.equal(
    encoded.byteLength,
    WAVEFORM_BINARY_HEADER_BYTES +
      source.peakCount * WAVEFORM_BINARY_PEAK_BYTES,
  );

  const signedTolerance = 1 / 32767 + Number.EPSILON;
  const unsignedTolerance = 1 / 65535 + Number.EPSILON;

  for (let index = 0; index < source.peaks.length; index += 1) {
    const before = source.peaks[index];
    const after = decoded.peaks[index];

    assert.ok(Math.abs(before[0] - after[0]) <= signedTolerance);
    assert.ok(Math.abs(before[1] - after[1]) <= signedTolerance);
    assert.ok(Math.abs(before[2] - after[2]) <= unsignedTolerance);
    assert.ok(Math.abs(before[3] - after[3]) <= unsignedTolerance);
    assert.ok(Math.abs(before[4] - after[4]) <= unsignedTolerance);
  }
});

test("waveform payload decoder temporarily accepts legacy JSON", () => {
  const source = generateWaveformPeaksFromWav(createPcm16Wav(), 400);
  const legacy = new TextEncoder().encode(JSON.stringify(source));
  const decoded = decodeWaveformPayload(legacy);

  assert.equal(decoded.version, 2);
  assert.equal(decoded.peaksPerSecond, 400);
  assert.deepEqual(decoded.peaks, source.peaks);
});

test("88,636 peaks occupy less than 0.9 MiB in compact format", () => {
  const byteCount =
    WAVEFORM_BINARY_HEADER_BYTES +
    88_636 * WAVEFORM_BINARY_PEAK_BYTES;

  assert.equal(byteCount, 886_456);
  assert.ok(byteCount < 0.9 * 1024 * 1024);
});
