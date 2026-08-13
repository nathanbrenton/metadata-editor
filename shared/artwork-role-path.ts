export type ArtworkRolePathCandidate = {
  relativePath: string;
};

function normalizedArtworkRolePath(
  ownerRelativePath: string,
  artworkRelativePath: string,
): string | null {
  const owner = ownerRelativePath
    .replaceAll("\\", "/")
    .replace(/\/+$/, "");
  const artworkPath = artworkRelativePath.replaceAll("\\", "/");
  const prefix = `${owner}/artwork/`;

  if (!artworkPath.startsWith(prefix)) {
    return null;
  }

  return artworkPath.slice(prefix.length);
}

/**
 * Return true only for artwork that competes for the canonical primary/front
 * role. Modern role-aware Library layouts reserve artwork/front/ for the
 * primary front. A direct artwork/artwork-master.* remains primary for legacy
 * compatibility. Unexpected paths are treated conservatively as primary so a
 * malformed legacy layout remains visible for review rather than being hidden.
 */
export function isPrimaryArtworkMasterForOwner(
  ownerRelativePath: string,
  artwork: ArtworkRolePathCandidate,
): boolean {
  const rolePath = normalizedArtworkRolePath(
    ownerRelativePath,
    artwork.relativePath,
  );

  if (rolePath === null) {
    return true;
  }

  const segments = rolePath
    .split("/")
    .filter((segment) => segment.length > 0);

  if (segments.length <= 1) {
    return true;
  }

  return segments[0]?.toLowerCase() === "front";
}
