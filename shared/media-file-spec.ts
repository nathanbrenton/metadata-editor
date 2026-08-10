export type CanonicalMediaMasterRole =
  | "artwork-master"
  | "audio-master"
  | "video-master";

export const canonicalMetadataExtension = ".toml" as const;

export const recognizedMetadataSidecarExtensions = [
  ".ffmeta",
  ".ffmetadata",
] as const;

export const metadataEvidenceCandidateExtensions = [
  ".json",
  ".txt",
] as const;

export const preferredArtworkMasterExtensions = [
  ".tif",
  ".tiff",
  ".png",
  ".jpg",
  ".jpeg",
] as const;

export const acceptedArtworkMasterExtensions = new Set([
  ".avif",
  ".gif",
  ".jpeg",
  ".jpg",
  ".png",
  ".tif",
  ".tiff",
  ".webp",
]);

export const preferredAudioMasterExtensions = [
  ".wav",
  ".flac",
  ".aif",
  ".aiff",
  ".m4a",
  ".mp3",
] as const;

export const acceptedAudioMasterExtensions = new Set([
  ".aac",
  ".aif",
  ".aiff",
  ".alac",
  ".ape",
  ".au",
  ".caf",
  ".dff",
  ".dsf",
  ".flac",
  ".m4a",
  ".mka",
  ".mp3",
  ".ogg",
  ".opus",
  ".snd",
  ".tta",
  ".wav",
  ".wave",
  ".wma",
  ".wv",
]);

export const preferredVideoMasterExtensions = [
  ".mov",
  ".mp4",
  ".mxf",
  ".mkv",
] as const;

export const acceptedVideoMasterExtensions = new Set([
  ".3gp",
  ".avi",
  ".m2ts",
  ".m4v",
  ".mkv",
  ".mov",
  ".mp4",
  ".mpeg",
  ".mpg",
  ".mts",
  ".mxf",
  ".ogv",
  ".ts",
  ".webm",
]);

export const canonicalMediaMasterBasenames: Record<
  CanonicalMediaMasterRole,
  CanonicalMediaMasterRole
> = {
  "artwork-master": "artwork-master",
  "audio-master": "audio-master",
  "video-master": "video-master",
};

export const mediaMasterExtensionPolicy =
  "preserve-source-container-extension" as const;
