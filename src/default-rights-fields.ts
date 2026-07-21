export const releaseDefaultRightsFieldPaths = [
  "release.rights.copyright",
  "release.rights.phonographic_copyright",
  "release.rights.publisher",
  "release.rights.label",
  "release.rights.distributor",
  "release.rights.license",
] as const;

export const trackDefaultRightsFieldPaths = [
  "track.rights.copyright",
  "track.rights.phonographic_copyright",
  "track.rights.publisher",
  "track.rights.license",
] as const;

const releasePathSet = new Set<string>(
  releaseDefaultRightsFieldPaths,
);
const trackPathSet = new Set<string>(
  trackDefaultRightsFieldPaths,
);

export function isDefaultRightsFieldPath(
  scope: "release" | "track",
  path: string,
): boolean {
  return scope === "release"
    ? releasePathSet.has(path)
    : trackPathSet.has(path);
}

export function shouldShowDefaultRightsFields({
  scope,
  filename,
  activeTab,
}: {
  scope: "release" | "track";
  filename: string;
  activeTab: string;
}): boolean {
  return (
    activeTab === "rights" &&
    (
      (scope === "release" && filename === "release.toml") ||
      (scope === "track" && filename === "track.toml")
    )
  );
}
