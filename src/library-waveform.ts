import {
  parseMediaWaveformData,
} from "./media-waveform.js";

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
