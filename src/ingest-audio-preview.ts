export function buildIngestAudioPreviewUrl(
  sourceRelativePath: string,
  modifiedAt?: string,
): string {
  const parameters = new URLSearchParams({
    path: sourceRelativePath,
  });

  if (modifiedAt) {
    parameters.set("version", modifiedAt);
  }

  return `/api/ingest/audio-preview?${parameters.toString()}`;
}
