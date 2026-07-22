/*
 * Build-plan destinations are stored relative to the staging-library root.
 * The release root is already displayed above the table, so table rows show
 * only the path within that release workspace.
 */
function normalizeDisplayPath(value: string): string {
  return value
    .replaceAll("\\", "/")
    .replace(/^\.\/+/, "")
    .replace(/\/{2,}/g, "/")
    .replace(/\/+$/, "");
}

export function stagingDestinationPathForDisplay(
  destinationRelativePath: string,
  releaseRelativePath: string,
): string {
  const destination = normalizeDisplayPath(
    destinationRelativePath,
  );
  const releaseRoot = normalizeDisplayPath(
    releaseRelativePath,
  );

  if (!releaseRoot) {
    return destination || ".";
  }

  if (destination === releaseRoot) {
    return ".";
  }

  const releasePrefix = `${releaseRoot}/`;

  if (destination.startsWith(releasePrefix)) {
    return destination.slice(releasePrefix.length) || ".";
  }

  // Do not hide unexpected destinations that fall outside the release root.
  return destination || ".";
}
