export type AudioPreviewAsset = {
  relativePath: string;
};

export type AudioPreviewTrack = {
  id: string;
  audioMasters: readonly AudioPreviewAsset[];
  playbackAudio?: readonly AudioPreviewAsset[];
};

export function trackHasAudioPreview(
  track: AudioPreviewTrack,
): boolean {
  const playbackAudio =
    track.playbackAudio ?? [];

  if (playbackAudio.length === 1) {
    return true;
  }

  return (
    playbackAudio.length === 0 &&
    track.audioMasters.length === 1
  );
}

export function getPlayableTrackIds(
  tracks: readonly AudioPreviewTrack[],
): string[] {
  return tracks
    .filter(trackHasAudioPreview)
    .map((track) => track.id);
}

export function getAdjacentPlayableTrackId(
  playableTrackIds: readonly string[],
  currentTrackId: string | null,
  direction: -1 | 1,
): string | null {
  if (playableTrackIds.length === 0) {
    return null;
  }

  const currentIndex = currentTrackId
    ? playableTrackIds.indexOf(currentTrackId)
    : -1;

  if (currentIndex === -1) {
    return direction === 1
      ? playableTrackIds[0]
      : playableTrackIds[
          playableTrackIds.length - 1
        ];
  }

  const nextIndex =
    (
      currentIndex +
      direction +
      playableTrackIds.length
    ) % playableTrackIds.length;

  return playableTrackIds[nextIndex] ?? null;
}

function isDirectMp3Preview(
  asset: AudioPreviewAsset,
): boolean {
  return asset.relativePath
    .toLowerCase()
    .endsWith(".mp3");
}

export function getAudioPreviewSourceLabel(
  track: AudioPreviewTrack | null,
): string {
  if (!track) {
    return "Unavailable";
  }

  const playbackAudio =
    track.playbackAudio ?? [];

  if (playbackAudio.length === 1) {
    return isDirectMp3Preview(
      playbackAudio[0],
    )
      ? "Playback audio"
      : "Playback audio · live MP3 preview";
  }

  if (
    playbackAudio.length === 0 &&
    track.audioMasters.length === 1
  ) {
    return isDirectMp3Preview(
      track.audioMasters[0],
    )
      ? "Audio master fallback"
      : "Audio master · live MP3 preview";
  }

  return "Unavailable";
}

export function buildAudioPreviewUrl(
  releaseId: string,
  trackId: string,
): string {
  return `/api/library/audio-preview?${new URLSearchParams({
    release: releaseId,
    track: trackId,
  }).toString()}`;
}
