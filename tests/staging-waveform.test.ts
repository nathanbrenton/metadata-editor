import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  decodeWaveformBinary,
} from "../../packages/media-player/src/waveform-binary.js";

import {
  writeStagingWaveform,
} from "../server/media-processing/staging-waveform.js";

function createPcm16Wav(): Buffer {
  const sampleRate = 48_000;
  const channels = 1;
  const frameCount = 2_400;
  const bytesPerSample = 2;
  const blockAlign =
    channels * bytesPerSample;
  const dataSize =
    frameCount * blockAlign;
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
        (2 * Math.PI * 440 * frame) /
          sampleRate,
      ) * 20_000,
    );
    buffer.writeInt16LE(
      sample,
      44 + frame * blockAlign,
    );
  }

  return buffer;
}

test(
  "writes a validated Library waveform directly from a canonical PCM WAV",
  async (t) => {
    const root = await mkdtemp(
      path.join(
        os.tmpdir(),
        "metadata-staging-waveform-",
      ),
    );

    t.after(async () => {
      await rm(
        root,
        {
          recursive: true,
          force: true,
        },
      );
    });

    const masterPath =
      path.join(root, "audio-master.wav");
    const waveformPath =
      path.join(root, "waveform-peaks.wfp");

    await writeFile(
      masterPath,
      createPcm16Wav(),
    );

    await writeStagingWaveform(
      masterPath,
      waveformPath,
    );

    const waveform = decodeWaveformBinary(
      await readFile(waveformPath),
    );

    assert.equal(waveform.version, 2);
    assert.equal(
      waveform.peaksPerSecond,
      400,
    );
    assert.ok(waveform.peakCount > 0);
    assert.equal(
      waveform.peaks.length,
      waveform.peakCount,
    );
  },
);
