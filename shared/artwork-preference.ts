export type ArtworkPreferenceCandidate = {
  filename: string;
  relativePath: string;
  extension: string;
};

const artworkExtensionPriority = new Map<string, number>([
  [".tif", 0],
  [".tiff", 0],
  [".png", 1],
  [".webp", 2],
  [".avif", 3],
  [".jpg", 4],
  [".jpeg", 4],
  [".gif", 5],
]);

const artworkRolePriority = [
  ["front", 0],
  ["cover-front", 0],
  ["front-cover", 0],
  ["master", 1],
  ["print", 2],
  ["web", 3],
  ["thumbnail", 4],
  ["thumb", 4],
] as const;

function normalizedExtension(candidate: ArtworkPreferenceCandidate): string {
  const extension = candidate.extension.trim().toLowerCase();

  if (extension.length === 0) {
    return "";
  }

  return extension.startsWith(".")
    ? extension
    : `.${extension}`;
}

function normalizedArtworkText(
  candidate: ArtworkPreferenceCandidate,
): string {
  return `${candidate.relativePath}/${candidate.filename}`
    .replaceAll("\\", "/")
    .toLowerCase();
}

function tokenRank(candidate: ArtworkPreferenceCandidate): number {
  const normalized = normalizedArtworkText(candidate);

  for (const [token, rank] of artworkRolePriority) {
    const pattern = new RegExp(
      `(?:^|[\\/_\\-.])${token}(?:$|[\\/_\\-.])`,
      "i",
    );

    if (pattern.test(normalized)) {
      return rank;
    }
  }

  return 5;
}

function extensionRank(candidate: ArtworkPreferenceCandidate): number {
  return artworkExtensionPriority.get(normalizedExtension(candidate)) ?? 99;
}

export function compareArtworkPreference(
  left: ArtworkPreferenceCandidate,
  right: ArtworkPreferenceCandidate,
): number {
  const roleDifference = tokenRank(left) - tokenRank(right);

  if (roleDifference !== 0) {
    return roleDifference;
  }

  const extensionDifference =
    extensionRank(left) - extensionRank(right);

  if (extensionDifference !== 0) {
    return extensionDifference;
  }

  return left.relativePath.localeCompare(
    right.relativePath,
    undefined,
    { numeric: true },
  );
}

export function sortArtworkCandidatesByPreference<
  T extends ArtworkPreferenceCandidate,
>(candidates: readonly T[]): T[] {
  return [...candidates].sort(compareArtworkPreference);
}

export function selectPreferredArtworkCandidate<
  T extends ArtworkPreferenceCandidate,
>(candidates: readonly T[]): T | null {
  return sortArtworkCandidatesByPreference(candidates)[0] ?? null;
}

export function describeArtworkPreference(
  candidate: ArtworkPreferenceCandidate,
): string {
  switch (normalizedExtension(candidate)) {
    case ".tif":
    case ".tiff":
      return "preferred archival TIFF master";
    case ".png":
      return "preferred lossless PNG master";
    case ".webp":
      return "preferred WebP master";
    case ".avif":
      return "preferred AVIF master";
    case ".jpg":
    case ".jpeg":
      return "preferred JPEG master";
    case ".gif":
      return "preferred GIF master";
    default:
      return "highest-ranked artwork candidate";
  }
}
