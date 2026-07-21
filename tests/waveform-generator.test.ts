import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_WAVEFORM_PEAKS_PER_SECOND,
  generateWaveformPeaksFromWav,
  parseWaveformPeaksPerSecond,
  parseWavBuffer,
} from "../server/media-processing/waveform-generator.js";

function createPcm16Wav(
  options: {
    sampleRate?: number;
    channels?: number;
    durationSeconds?: number;
    frequencyHz?: number;
  } = {},
): Buffer {
  const sampleRate =
    options.sampleRate ?? 48_000;
  const channels = options.channels ?? 2;
  const durationSeconds =
    options.durationSeconds ?? 0.05;
  const frequencyHz =
    options.frequencyHz ?? 440;
  const frameCount = Math.round(
    sampleRate * durationSeconds,
  );
  const bytesPerSample = 2;
  const blockAlign =
    channels * bytesPerSample;
  const dataSize = frameCount * blockAlign;
  const buffer = Buffer.alloc(
    44 + dataSize,
  );

  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(
    36 + dataSize,
    4,
  );
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(
    sampleRate * blockAlign,
    28,
  );
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);

  for (
    let frame = 0;
    frame < frameCount;
    frame += 1
  ) {
    const sample = Math.round(
      Math.sin(
        (2 * Math.PI * frequencyHz * frame) /
          sampleRate,
      ) * 24_000,
    );

    for (
      let channel = 0;
      channel < channels;
      channel += 1
    ) {
      buffer.writeInt16LE(
        sample,
        44 +
          frame * blockAlign +
          channel * bytesPerSample,
      );
    }
  }

  return buffer;
}

test(
  "validates waveform resolution",
  () => {
    assert.equal(
      parseWaveformPeaksPerSecond(
        undefined,
      ),
      DEFAULT_WAVEFORM_PEAKS_PER_SECOND,
    );
    assert.equal(
      parseWaveformPeaksPerSecond("250"),
      250,
    );
    assert.throws(
      () =>
        parseWaveformPeaksPerSecond(0),
      /between 1 and 1000/,
    );
    assert.throws(
      () =>
        parseWaveformPeaksPerSecond(
          1_001,
        ),
      /between 1 and 1000/,
    );
  },
);

test(
  "parses PCM16 WAV structure",
  () => {
    const wav = parseWavBuffer(
      createPcm16Wav(),
    );

    assert.equal(wav.audioFormat, 1);
    assert.equal(wav.channels, 2);
    assert.equal(wav.sampleRate, 48_000);
    assert.equal(wav.bitsPerSample, 16);
    assert.equal(wav.frameCount, 2_400);
  },
);

test(
  "ports the audio-player multiband waveform schema without writing files",
  () => {
    const waveform =
      generateWaveformPeaksFromWav(
        createPcm16Wav(),
        400,
      );

    assert.equal(waveform.version, 2);
    assert.equal(
      waveform.durationSeconds,
      0.05,
    );
    assert.equal(
      waveform.peaksPerSecond,
      400,
    );
    assert.equal(waveform.peakCount, 20);
    assert.equal(
      waveform.peaks.length,
      waveform.peakCount,
    );
    assert.ok(
      waveform.peaks.every(
        (peak) =>
          peak.length === 5 &&
          peak.every(Number.isFinite),
      ),
    );
    assert.ok(
      waveform.peaks.some(
        ([minimum, maximum]) =>
          minimum < -0.5 &&
          maximum > 0.5,
      ),
    );
    assert.ok(
      waveform.peaks.some(
        ([, , low, mid]) => mid > low,
      ),
    );
    assert.deepEqual(
      waveform.analysis.peakFields,
      [
        "min",
        "max",
        "low",
        "mid",
        "high",
      ],
    );
  },
);

test(
  "rejects unsupported or malformed WAV input",
  () => {
    assert.throws(
      () =>
        generateWaveformPeaksFromWav(
          Buffer.from("not a wav"),
        ),
      /too small|RIFF/,
    );
  },
);
