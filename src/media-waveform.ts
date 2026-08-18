import {
  decodeWaveformPayload,
  type WaveformPeak,
} from "@hiplingo/media-player";

export {
  WAVEFORM_COLOR_OPTIONS,
  type WaveformColorMode,
} from "@hiplingo/media-player";

export type MediaWaveformPeak = WaveformPeak;

export type MediaWaveformData = {
  version: number;
  durationSeconds: number;
  sampleRate: number;
  sourceChannels: number;
  waveformChannels: number;
  bitsPerSample: number;
  peaksPerSecond: number;
  peakCount: number;
  peaks: MediaWaveformPeak[];
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function parseMediaWaveformData(
  value: unknown,
): MediaWaveformData {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error("Waveform data is not an object.");
  }

  const record = value as Record<string, unknown>;
  const peaks = record.peaks;

  if (
    !isFiniteNumber(record.version) ||
    !isFiniteNumber(record.durationSeconds) ||
    record.durationSeconds < 0 ||
    !isFiniteNumber(record.sampleRate) ||
    !isFiniteNumber(record.sourceChannels) ||
    !isFiniteNumber(record.waveformChannels) ||
    !isFiniteNumber(record.bitsPerSample) ||
    !isFiniteNumber(record.peaksPerSecond) ||
    !isFiniteNumber(record.peakCount) ||
    !Array.isArray(peaks)
  ) {
    throw new Error("Waveform data is missing required fields.");
  }

  const normalizedPeaks = peaks.map((peak) => {
    if (
      !Array.isArray(peak) ||
      peak.length !== 5 ||
      !peak.every(isFiniteNumber)
    ) {
      throw new Error("Waveform data contains an invalid peak.");
    }

    return peak as MediaWaveformPeak;
  });

  if (record.peakCount !== normalizedPeaks.length) {
    throw new Error("Waveform peak count does not match the peak array.");
  }

  return {
    version: record.version,
    durationSeconds: record.durationSeconds,
    sampleRate: record.sampleRate,
    sourceChannels: record.sourceChannels,
    waveformChannels: record.waveformChannels,
    bitsPerSample: record.bitsPerSample,
    peaksPerSecond: record.peaksPerSecond,
    peakCount: record.peakCount,
    peaks: normalizedPeaks,
  };
}

export function decodeMediaWaveformPayload(
  value: ArrayBuffer | Uint8Array,
): MediaWaveformData {
  return parseMediaWaveformData(
    decodeWaveformPayload(value),
  );
}
