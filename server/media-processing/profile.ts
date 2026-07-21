import { createHash } from "node:crypto";

import {
  DEFAULT_WAVEFORM_PEAKS_PER_SECOND,
  WAVEFORM_FFT_SIZE,
  WAVEFORM_FREQUENCY_BANDS,
  WAVEFORM_NORMALIZATION_PERCENTILE,
} from "./waveform-generator.js";

export const MEDIA_PROCESSING_PROFILE_VERSION = 1;

export type MediaProcessingProfile = {
  version: number;
  playback: {
    filename: "audio-playback.mp3";
    container: "mp3";
    preferredEncoder: "libmp3lame";
    bitrateKbps: 320;
    id3v2Version: 3;
  };
  waveform: {
    filename: "waveform-peaks.json";
    schemaVersion: 2;
    peaksPerSecond: number;
    fftSize: number;
    window: "hann";
    normalizationPercentile: number;
    bandsHz: typeof WAVEFORM_FREQUENCY_BANDS;
  };
};

export function buildMediaProcessingProfile(
  peaksPerSecond = DEFAULT_WAVEFORM_PEAKS_PER_SECOND,
): MediaProcessingProfile {
  return {
    version: MEDIA_PROCESSING_PROFILE_VERSION,
    playback: {
      filename: "audio-playback.mp3",
      container: "mp3",
      preferredEncoder: "libmp3lame",
      bitrateKbps: 320,
      id3v2Version: 3,
    },
    waveform: {
      filename: "waveform-peaks.json",
      schemaVersion: 2,
      peaksPerSecond,
      fftSize: WAVEFORM_FFT_SIZE,
      window: "hann",
      normalizationPercentile:
        WAVEFORM_NORMALIZATION_PERCENTILE,
      bandsHz: WAVEFORM_FREQUENCY_BANDS,
    },
  };
}

export function hashMediaProcessingProfile(
  profile: MediaProcessingProfile,
): string {
  return createHash("sha256")
    .update(JSON.stringify(profile))
    .digest("hex");
}
