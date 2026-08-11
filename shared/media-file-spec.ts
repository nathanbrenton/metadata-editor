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
] as const;

export const mediaMasterPreferredFormatGuidance: Record<
  CanonicalMediaMasterRole,
  string
> = {
  "artwork-master":
    "Prefer lossless TIFF/TIF or PNG for canonical artwork masters. JPEG remains accepted when it is the authoritative source, but it is not the preferred archival happy path.",
  "audio-master":
    "Prefer lossless WAV, FLAC, AIF, or AIFF for canonical audio masters. M4A, MP3, AAC, and other recognized formats remain accepted source-preserving compatibility inputs rather than preferred archival masters.",
  "video-master":
    "MOV, MP4, MXF, and MKV remain preferred source containers for now. Container extension alone is not a quality grade; codec/profile-aware video-master policy is a later file-spec milestone.",
};

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


export type MediaMasterFormatClass =
  | "preferred"
  | "compatible"
  | "unsupported";

export type MetadataFileFormatClass =
  | "canonical"
  | "recognized-sidecar"
  | "candidate-evidence"
  | "unsupported";

export function normalizeMediaFileExtension(
  extension: string,
): string {
  const trimmed = extension.trim().toLowerCase();

  if (!trimmed) {
    return "";
  }

  return trimmed.startsWith(".")
    ? trimmed
    : `.${trimmed}`;
}

function preferredSet(
  role: CanonicalMediaMasterRole,
): ReadonlySet<string> {
  switch (role) {
    case "artwork-master":
      return new Set(preferredArtworkMasterExtensions);
    case "audio-master":
      return new Set(preferredAudioMasterExtensions);
    case "video-master":
      return new Set(preferredVideoMasterExtensions);
  }
}

function acceptedSet(
  role: CanonicalMediaMasterRole,
): ReadonlySet<string> {
  switch (role) {
    case "artwork-master":
      return acceptedArtworkMasterExtensions;
    case "audio-master":
      return acceptedAudioMasterExtensions;
    case "video-master":
      return acceptedVideoMasterExtensions;
  }
}

export function classifyMediaMasterExtension(
  role: CanonicalMediaMasterRole,
  extension: string,
): MediaMasterFormatClass {
  const normalized = normalizeMediaFileExtension(extension);

  if (preferredSet(role).has(normalized)) {
    return "preferred";
  }

  if (acceptedSet(role).has(normalized)) {
    return "compatible";
  }

  return "unsupported";
}

export function classifyMetadataFileExtension(
  extension: string,
): MetadataFileFormatClass {
  const normalized = normalizeMediaFileExtension(extension);

  if (normalized === canonicalMetadataExtension) {
    return "canonical";
  }

  if (
    new Set<string>(recognizedMetadataSidecarExtensions).has(
      normalized,
    )
  ) {
    return "recognized-sidecar";
  }

  if (
    new Set<string>(metadataEvidenceCandidateExtensions).has(
      normalized,
    )
  ) {
    return "candidate-evidence";
  }

  return "unsupported";
}


export function canonicalMediaMasterFilename(
  role: CanonicalMediaMasterRole,
  extension: string,
): string {
  const normalizedExtension =
    normalizeMediaFileExtension(extension);

  if (!normalizedExtension) {
    return canonicalMediaMasterBasenames[role];
  }

  return `${canonicalMediaMasterBasenames[role]}${normalizedExtension}`;
}
