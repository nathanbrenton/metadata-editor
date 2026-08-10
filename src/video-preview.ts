const browserDirectVideoExtensions = new Set([
  ".m4v",
  ".mov",
  ".mp4",
  ".webm",
]);

function normalizeExtension(
  extension: string,
): string {
  return extension.startsWith(".")
    ? extension.toLowerCase()
    : `.${extension.toLowerCase()}`;
}

export function canPreviewLibraryVideoExtension(
  extension: string,
): boolean {
  return browserDirectVideoExtensions.has(
    normalizeExtension(extension),
  );
}

export function buildLibraryVideoPreviewUrl(
  releaseId: string,
  videoId: string,
): string {
  const query = new URLSearchParams({
    release: releaseId,
    video: videoId,
  });

  return `/api/library/video-preview?${query.toString()}`;
}
