import type {
  DiscoveredAsset,
  VideoScanResult,
} from "./types.js";

const browserDirectVideoContentTypes = new Map([
  [".m4v", "video/mp4"],
  [".mov", "video/quicktime"],
  [".mp4", "video/mp4"],
  [".webm", "video/webm"],
]);

export function getVideoPreviewContentType(
  extension: string,
): string | undefined {
  const normalized = extension.startsWith(".")
    ? extension.toLowerCase()
    : `.${extension.toLowerCase()}`;

  return browserDirectVideoContentTypes.get(
    normalized,
  );
}

export function selectVideoPreviewMaster(
  video: VideoScanResult,
): DiscoveredAsset {
  if (video.videoMasters.length > 1) {
    throw new Error(
      "Multiple canonical video masters were detected for this video.",
    );
  }

  if (video.videoMasters.length === 0) {
    throw new Error(
      "No canonical video master was detected for this video.",
    );
  }

  return video.videoMasters[0];
}
