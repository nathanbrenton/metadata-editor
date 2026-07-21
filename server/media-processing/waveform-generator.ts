export const DEFAULT_WAVEFORM_PEAKS_PER_SECOND = 400;
export const MAXIMUM_WAVEFORM_PEAKS_PER_SECOND = 1_000;
export const WAVEFORM_FFT_SIZE = 1_024;
export const WAVEFORM_NORMALIZATION_PERCENTILE = 95;

export const WAVEFORM_FREQUENCY_BANDS = {
  low: [20, 250],
  mid: [250, 4_000],
  high: [4_000, 20_000],
} as const;

export type WaveformPeak = [
  minimum: number,
  maximum: number,
  low: number,
  mid: number,
  high: number,
];

export type WaveformPeaksDocument = {
  version: 2;
  durationSeconds: number;
  sampleRate: number;
  sourceChannels: number;
  waveformChannels: 1;
  bitsPerSample: number;
  peaksPerSecond: number;
  analysis: {
    fftSize: number;
    window: "hann";
    bandsHz: typeof WAVEFORM_FREQUENCY_BANDS;
    peakFields: [
      "min",
      "max",
      "low",
      "mid",
      "high",
    ];
    normalization: {
      method: "per-band-percentile";
      percentile: number;
      compression: "square-root";
      references: {
        low: number;
        mid: number;
        high: number;
      };
    };
  };
  peakCount: number;
  peaks: WaveformPeak[];
};

type ParsedWav = {
  audioFormat: number;
  channels: number;
  sampleRate: number;
  blockAlign: number;
  bitsPerSample: number;
  bytesPerSample: number;
  dataOffset: number;
  dataSize: number;
  frameCount: number;
};

type RawWaveformBucket = {
  min: number;
  max: number;
  low: number;
  mid: number;
  high: number;
};

export function parseWaveformPeaksPerSecond(
  value: unknown,
  fallback = DEFAULT_WAVEFORM_PEAKS_PER_SECOND,
): number {
  if (
    value === undefined ||
    value === null ||
    value === ""
  ) {
    return fallback;
  }

  const peaksPerSecond = Number(value);

  if (
    !Number.isInteger(peaksPerSecond) ||
    peaksPerSecond < 1 ||
    peaksPerSecond >
      MAXIMUM_WAVEFORM_PEAKS_PER_SECOND
  ) {
    throw new Error(
      "peaks per second must be an integer between " +
        `1 and ${MAXIMUM_WAVEFORM_PEAKS_PER_SECOND}`,
    );
  }

  return peaksPerSecond;
}

function readPcm24LE(
  buffer: Buffer,
  offset: number,
): number {
  let value =
    buffer[offset] |
    (buffer[offset + 1] << 8) |
    (buffer[offset + 2] << 16);

  if (value & 0x800000) {
    value |= 0xff000000;
  }

  return value / 8_388_608;
}

export function parseWavBuffer(
  buffer: Buffer,
): ParsedWav {
  if (buffer.length < 12) {
    throw new Error("WAV file is too small");
  }

  if (
    buffer.toString("ascii", 0, 4) !== "RIFF"
  ) {
    throw new Error(
      "only little-endian RIFF WAV files are supported",
    );
  }

  if (
    buffer.toString("ascii", 8, 12) !== "WAVE"
  ) {
    throw new Error(
      "file is not a valid WAVE container",
    );
  }

  let format:
    | Omit<
        ParsedWav,
        | "bytesPerSample"
        | "dataOffset"
        | "dataSize"
        | "frameCount"
      >
    | null = null;
  let dataOffset: number | null = null;
  let dataSize: number | null = null;
  let offset = 12;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString(
      "ascii",
      offset,
      offset + 4,
    );
    const chunkSize = buffer.readUInt32LE(
      offset + 4,
    );
    const chunkDataOffset = offset + 8;
    const chunkEnd = chunkDataOffset + chunkSize;

    if (chunkEnd > buffer.length) {
      throw new Error(
        `invalid ${chunkId} chunk size`,
      );
    }

    if (chunkId === "fmt ") {
      if (chunkSize < 16) {
        throw new Error("invalid fmt chunk");
      }

      let audioFormat = buffer.readUInt16LE(
        chunkDataOffset,
      );
      const channels = buffer.readUInt16LE(
        chunkDataOffset + 2,
      );
      const sampleRate = buffer.readUInt32LE(
        chunkDataOffset + 4,
      );
      const blockAlign = buffer.readUInt16LE(
        chunkDataOffset + 12,
      );
      const bitsPerSample = buffer.readUInt16LE(
        chunkDataOffset + 14,
      );

      if (audioFormat === 0xfffe) {
        if (chunkSize < 40) {
          throw new Error(
            "invalid WAVE_FORMAT_EXTENSIBLE fmt chunk",
          );
        }

        audioFormat = buffer.readUInt16LE(
          chunkDataOffset + 24,
        );
      }

      format = {
        audioFormat,
        channels,
        sampleRate,
        blockAlign,
        bitsPerSample,
      };
    }

    if (chunkId === "data") {
      dataOffset = chunkDataOffset;
      dataSize = chunkSize;
    }

    offset = chunkEnd + (chunkSize % 2);
  }

  if (!format) {
    throw new Error(
      "WAV file does not contain a fmt chunk",
    );
  }

  if (
    dataOffset === null ||
    dataSize === null
  ) {
    throw new Error(
      "WAV file does not contain a data chunk",
    );
  }

  if (
    format.channels < 1 ||
    format.sampleRate < 1
  ) {
    throw new Error(
      "WAV file has an invalid channel count or sample rate",
    );
  }

  const supportedPcm =
    format.audioFormat === 1 &&
    [16, 24, 32].includes(
      format.bitsPerSample,
    );
  const supportedFloat =
    format.audioFormat === 3 &&
    format.bitsPerSample === 32;

  if (!supportedPcm && !supportedFloat) {
    throw new Error(
      `unsupported WAV encoding: format=${format.audioFormat}, ` +
        `bits=${format.bitsPerSample}`,
    );
  }

  const bytesPerSample =
    format.bitsPerSample / 8;
  const expectedBlockAlign =
    format.channels * bytesPerSample;

  if (
    format.blockAlign !== expectedBlockAlign
  ) {
    throw new Error(
      `unsupported block alignment: expected ${expectedBlockAlign}, ` +
        `found ${format.blockAlign}`,
    );
  }

  return {
    ...format,
    bytesPerSample,
    dataOffset,
    dataSize,
    frameCount: Math.floor(
      dataSize / format.blockAlign,
    ),
  };
}

function readSample(
  buffer: Buffer,
  offset: number,
  audioFormat: number,
  bitsPerSample: number,
): number {
  if (
    audioFormat === 3 &&
    bitsPerSample === 32
  ) {
    const value = buffer.readFloatLE(offset);

    return Number.isFinite(value)
      ? Math.max(-1, Math.min(1, value))
      : 0;
  }

  switch (bitsPerSample) {
    case 16:
      return buffer.readInt16LE(offset) / 32_768;
    case 24:
      return readPcm24LE(buffer, offset);
    case 32:
      return (
        buffer.readInt32LE(offset) /
        2_147_483_648
      );
    default:
      throw new Error(
        `unsupported sample size: ${bitsPerSample}`,
      );
  }
}

function buildMonoSamples(
  buffer: Buffer,
  wav: ParsedWav,
): Float64Array {
  const samples = new Float64Array(
    wav.frameCount,
  );

  for (
    let frameIndex = 0;
    frameIndex < wav.frameCount;
    frameIndex += 1
  ) {
    const frameOffset =
      wav.dataOffset +
      frameIndex * wav.blockAlign;
    let monoSample = 0;

    for (
      let channel = 0;
      channel < wav.channels;
      channel += 1
    ) {
      monoSample += readSample(
        buffer,
        frameOffset +
          channel * wav.bytesPerSample,
        wav.audioFormat,
        wav.bitsPerSample,
      );
    }

    samples[frameIndex] =
      monoSample / wav.channels;
  }

  return samples;
}

function createHannWindow(
  size: number,
): Float64Array {
  const window = new Float64Array(size);

  for (
    let index = 0;
    index < size;
    index += 1
  ) {
    window[index] =
      0.5 -
      0.5 *
        Math.cos(
          (2 * Math.PI * index) /
            (size - 1),
        );
  }

  return window;
}

function reverseBits(
  value: number,
  bitCount: number,
): number {
  let reversed = 0;

  for (
    let bit = 0;
    bit < bitCount;
    bit += 1
  ) {
    reversed =
      (reversed << 1) | (value & 1);
    value >>>= 1;
  }

  return reversed;
}

function fftRealMagnitude(
  samples: Float64Array,
): Float64Array {
  const size = samples.length;
  const levels = Math.log2(size);

  if (!Number.isInteger(levels)) {
    throw new Error(
      "FFT size must be a power of two",
    );
  }

  const real = new Float64Array(size);
  const imaginary = new Float64Array(size);

  for (
    let index = 0;
    index < size;
    index += 1
  ) {
    real[reverseBits(index, levels)] =
      samples[index];
  }

  for (
    let blockSize = 2;
    blockSize <= size;
    blockSize *= 2
  ) {
    const halfSize = blockSize / 2;
    const angleStep =
      (-2 * Math.PI) / blockSize;

    for (
      let blockStart = 0;
      blockStart < size;
      blockStart += blockSize
    ) {
      for (
        let offset = 0;
        offset < halfSize;
        offset += 1
      ) {
        const angle = angleStep * offset;
        const cosine = Math.cos(angle);
        const sine = Math.sin(angle);
        const evenIndex = blockStart + offset;
        const oddIndex = evenIndex + halfSize;
        const oddReal =
          real[oddIndex] * cosine -
          imaginary[oddIndex] * sine;
        const oddImaginary =
          real[oddIndex] * sine +
          imaginary[oddIndex] * cosine;

        real[oddIndex] =
          real[evenIndex] - oddReal;
        imaginary[oddIndex] =
          imaginary[evenIndex] -
          oddImaginary;
        real[evenIndex] += oddReal;
        imaginary[evenIndex] +=
          oddImaginary;
      }
    }
  }

  const magnitudes = new Float64Array(
    size / 2 + 1,
  );

  for (
    let bin = 0;
    bin < magnitudes.length;
    bin += 1
  ) {
    magnitudes[bin] = Math.hypot(
      real[bin],
      imaginary[bin],
    );
  }

  return magnitudes;
}

function calculateBandEnergy(
  magnitudes: Float64Array,
  sampleRate: number,
  minimumFrequency: number,
  maximumFrequency: number,
): number {
  const cappedMaximum = Math.min(
    maximumFrequency,
    sampleRate / 2,
  );
  const binWidth =
    sampleRate / WAVEFORM_FFT_SIZE;
  const firstBin = Math.max(
    1,
    Math.ceil(minimumFrequency / binWidth),
  );
  const finalBin = Math.min(
    magnitudes.length - 1,
    Math.floor(cappedMaximum / binWidth),
  );

  if (finalBin < firstBin) {
    return 0;
  }

  let energy = 0;
  let binCount = 0;

  for (
    let bin = firstBin;
    bin <= finalBin;
    bin += 1
  ) {
    const magnitude = magnitudes[bin];
    energy += magnitude * magnitude;
    binCount += 1;
  }

  return binCount > 0
    ? Math.sqrt(energy / binCount)
    : 0;
}

function percentile(
  values: number[],
  requestedPercentile: number,
): number {
  if (values.length === 0) {
    return 1;
  }

  const sorted = [...values].sort(
    (left, right) => left - right,
  );
  const normalized = Math.max(
    0,
    Math.min(100, requestedPercentile),
  );
  const index = Math.min(
    sorted.length - 1,
    Math.floor(
      (normalized / 100) *
        (sorted.length - 1),
    ),
  );

  return sorted[index] > 0
    ? sorted[index]
    : 1;
}

function compressEnergy(
  value: number,
  reference: number,
): number {
  return Math.sqrt(
    Math.min(1, value / reference),
  );
}

function generateAnalysis(
  samples: Float64Array,
  wav: ParsedWav,
  peaksPerSecond: number,
): {
  peaks: WaveformPeak[];
  normalizationReferences: {
    low: number;
    mid: number;
    high: number;
  };
} {
  const hopSize = Math.max(
    1,
    Math.round(
      wav.sampleRate / peaksPerSecond,
    ),
  );
  const bucketCount = Math.ceil(
    wav.frameCount / hopSize,
  );
  const window = createHannWindow(
    WAVEFORM_FFT_SIZE,
  );
  const rawBuckets: RawWaveformBucket[] =
    new Array(bucketCount);
  const lowValues: number[] =
    new Array(bucketCount);
  const midValues: number[] =
    new Array(bucketCount);
  const highValues: number[] =
    new Array(bucketCount);

  for (
    let bucketIndex = 0;
    bucketIndex < bucketCount;
    bucketIndex += 1
  ) {
    const firstFrame =
      bucketIndex * hopSize;
    const finalFrame = Math.min(
      firstFrame + hopSize,
      wav.frameCount,
    );
    let minimum = 1;
    let maximum = -1;

    for (
      let frameIndex = firstFrame;
      frameIndex < finalFrame;
      frameIndex += 1
    ) {
      const sample = samples[frameIndex];
      minimum = Math.min(minimum, sample);
      maximum = Math.max(maximum, sample);
    }

    const fftStart =
      firstFrame +
      Math.floor(hopSize / 2) -
      Math.floor(WAVEFORM_FFT_SIZE / 2);
    const fftInput = new Float64Array(
      WAVEFORM_FFT_SIZE,
    );

    for (
      let index = 0;
      index < WAVEFORM_FFT_SIZE;
      index += 1
    ) {
      const sourceIndex = fftStart + index;
      const sample =
        sourceIndex >= 0 &&
        sourceIndex < samples.length
          ? samples[sourceIndex]
          : 0;

      fftInput[index] =
        sample * window[index];
    }

    const magnitudes =
      fftRealMagnitude(fftInput);
    const low = calculateBandEnergy(
      magnitudes,
      wav.sampleRate,
      ...WAVEFORM_FREQUENCY_BANDS.low,
    );
    const mid = calculateBandEnergy(
      magnitudes,
      wav.sampleRate,
      ...WAVEFORM_FREQUENCY_BANDS.mid,
    );
    const high = calculateBandEnergy(
      magnitudes,
      wav.sampleRate,
      ...WAVEFORM_FREQUENCY_BANDS.high,
    );

    rawBuckets[bucketIndex] = {
      min: minimum,
      max: maximum,
      low,
      mid,
      high,
    };
    lowValues[bucketIndex] = low;
    midValues[bucketIndex] = mid;
    highValues[bucketIndex] = high;
  }

  const lowReference = percentile(
    lowValues,
    WAVEFORM_NORMALIZATION_PERCENTILE,
  );
  const midReference = percentile(
    midValues,
    WAVEFORM_NORMALIZATION_PERCENTILE,
  );
  const highReference = percentile(
    highValues,
    WAVEFORM_NORMALIZATION_PERCENTILE,
  );

  return {
    peaks: rawBuckets.map(
      (bucket): WaveformPeak => [
        Number(bucket.min.toFixed(6)),
        Number(bucket.max.toFixed(6)),
        Number(
          compressEnergy(
            bucket.low,
            lowReference,
          ).toFixed(6),
        ),
        Number(
          compressEnergy(
            bucket.mid,
            midReference,
          ).toFixed(6),
        ),
        Number(
          compressEnergy(
            bucket.high,
            highReference,
          ).toFixed(6),
        ),
      ],
    ),
    normalizationReferences: {
      low: Number(lowReference.toFixed(6)),
      mid: Number(midReference.toFixed(6)),
      high: Number(highReference.toFixed(6)),
    },
  };
}

export function generateWaveformPeaksFromWav(
  buffer: Buffer,
  requestedPeaksPerSecond: unknown =
    DEFAULT_WAVEFORM_PEAKS_PER_SECOND,
): WaveformPeaksDocument {
  const peaksPerSecond =
    parseWaveformPeaksPerSecond(
      requestedPeaksPerSecond,
    );
  const wav = parseWavBuffer(buffer);
  const monoSamples = buildMonoSamples(
    buffer,
    wav,
  );
  const generated = generateAnalysis(
    monoSamples,
    wav,
    peaksPerSecond,
  );

  return {
    version: 2,
    durationSeconds: Number(
      (
        wav.frameCount / wav.sampleRate
      ).toFixed(6),
    ),
    sampleRate: wav.sampleRate,
    sourceChannels: wav.channels,
    waveformChannels: 1,
    bitsPerSample: wav.bitsPerSample,
    peaksPerSecond,
    analysis: {
      fftSize: WAVEFORM_FFT_SIZE,
      window: "hann",
      bandsHz: WAVEFORM_FREQUENCY_BANDS,
      peakFields: [
        "min",
        "max",
        "low",
        "mid",
        "high",
      ],
      normalization: {
        method: "per-band-percentile",
        percentile:
          WAVEFORM_NORMALIZATION_PERCENTILE,
        compression: "square-root",
        references:
          generated.normalizationReferences,
      },
    },
    peakCount: generated.peaks.length,
    peaks: generated.peaks,
  };
}
