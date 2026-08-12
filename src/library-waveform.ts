import {
  parseMediaWaveformData,
  type MediaWaveformData,
  type MediaWaveformPeak,
} from "./media-waveform.js";

export type LibraryWaveformPeak = MediaWaveformPeak;
export type LibraryWaveformData = MediaWaveformData;

export function buildLibraryWaveformUrl(
  releaseId: string,
  trackId: string,
): string {
  return `/api/library/waveform?${new URLSearchParams({
    release: releaseId,
    track: trackId,
  }).toString()}`;
}

export const parseLibraryWaveformData = parseMediaWaveformData;
