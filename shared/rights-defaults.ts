export const defaultLicenseValue =
  "All rights reserved.";

export function isLicenseMetadataPath(
  path: string,
): boolean {
  return (
    path === "release.rights.license" ||
    path === "track.rights.license"
  );
}
