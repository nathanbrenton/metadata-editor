export type ArtworkAssetLike = {
  filename: string;
  relativePath: string;
  extension: string;
};

export type ArtworkRole =
  | "front"
  | "back"
  | "disc"
  | "booklet"
  | "insert"
  | "tray"
  | "spine"
  | "alternate"
  | "promotional"
  | "other";

export type ArtworkGallerySource =
  | "release"
  | "track"
  | "inherited-release";

export type ArtworkGalleryItem = {
  asset: ArtworkAssetLike;
  role: ArtworkRole;
  roleLabel: string;
  source: ArtworkGallerySource;
  inherited: boolean;
  previewable: boolean;
};

const artworkRoleOrder: ArtworkRole[] = [
  "front",
  "back",
  "disc",
  "booklet",
  "insert",
  "tray",
  "spine",
  "alternate",
  "promotional",
  "other",
];

const roleLabels: Record<ArtworkRole, string> = {
  front: "Front",
  back: "Back",
  disc: "Disc",
  booklet: "Booklet",
  insert: "Insert",
  tray: "Tray",
  spine: "Spine",
  alternate: "Alternate",
  promotional: "Promotional",
  other: "Other artwork",
};

const browserPreviewExtensions = new Set([
  ".avif",
  ".gif",
  ".jpeg",
  ".jpg",
  ".png",
  ".webp",
]);

function normalizeArtworkText(asset: ArtworkAssetLike): string {
  return `${asset.relativePath}/${asset.filename}`
    .replaceAll("\\", "/")
    .toLowerCase();
}

function hasArtworkToken(
  normalized: string,
  tokens: readonly string[],
): boolean {
  return tokens.some((token) =>
    new RegExp(`(?:^|[\\/_\\-.])${token}(?:$|[\\/_\\-.])`, "i").test(
      normalized,
    ),
  );
}

export function inferArtworkRole(
  asset: ArtworkAssetLike,
): ArtworkRole {
  const normalized = normalizeArtworkText(asset);

  if (
    hasArtworkToken(normalized, [
      "front",
      "front-cover",
      "front_cover",
      "cover-front",
      "cover_front",
    ])
  ) {
    return "front";
  }

  if (
    hasArtworkToken(normalized, [
      "back",
      "back-cover",
      "back_cover",
      "cover-back",
      "cover_back",
    ])
  ) {
    return "back";
  }

  if (
    hasArtworkToken(normalized, [
      "disc",
      "disc-art",
      "disc_art",
      "disc-label",
      "disc_label",
      "cd",
    ])
  ) {
    return "disc";
  }

  if (hasArtworkToken(normalized, ["booklet"])) {
    return "booklet";
  }

  if (hasArtworkToken(normalized, ["insert", "inlay"])) {
    return "insert";
  }

  if (hasArtworkToken(normalized, ["tray", "tray-card", "tray_card"])) {
    return "tray";
  }

  if (hasArtworkToken(normalized, ["spine"])) {
    return "spine";
  }

  if (
    hasArtworkToken(normalized, [
      "alternate",
      "alternative",
      "alt",
      "variant",
    ])
  ) {
    return "alternate";
  }

  if (
    hasArtworkToken(normalized, [
      "promotional",
      "promo",
      "press",
    ])
  ) {
    return "promotional";
  }

  return "other";
}

export function getArtworkRoleLabel(role: ArtworkRole): string {
  return roleLabels[role];
}

export function isBrowserPreviewableArtwork(
  asset: ArtworkAssetLike,
): boolean {
  const extension = asset.extension.startsWith(".")
    ? asset.extension.toLowerCase()
    : `.${asset.extension.toLowerCase()}`;

  return browserPreviewExtensions.has(extension);
}

function deduplicateArtworkAssets(
  assets: readonly ArtworkAssetLike[],
): ArtworkAssetLike[] {
  const seen = new Set<string>();

  return assets.filter((asset) => {
    const key = asset.relativePath
      .replaceAll("\\", "/")
      .toLowerCase();

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function buildGalleryItems(
  assets: readonly ArtworkAssetLike[],
  source: ArtworkGallerySource,
  forceRole?: ArtworkRole,
): ArtworkGalleryItem[] {
  return deduplicateArtworkAssets(assets)
    .map((asset, sourceIndex) => {
      const role = forceRole ?? inferArtworkRole(asset);

      return {
        asset,
        role,
        roleLabel: getArtworkRoleLabel(role),
        source,
        inherited: source === "inherited-release",
        previewable: isBrowserPreviewableArtwork(asset),
        sourceIndex,
      };
    })
    .sort((left, right) => {
      const roleDifference =
        artworkRoleOrder.indexOf(left.role) -
        artworkRoleOrder.indexOf(right.role);

      return roleDifference !== 0
        ? roleDifference
        : left.sourceIndex - right.sourceIndex;
    })
    .map(({ sourceIndex: _sourceIndex, ...item }) => item);
}

export function selectPreferredReleaseArtwork(
  assets: readonly ArtworkAssetLike[],
): ArtworkAssetLike | null {
  const uniqueAssets = deduplicateArtworkAssets(assets);

  return (
    uniqueAssets.find((asset) => inferArtworkRole(asset) === "front") ??
    uniqueAssets[0] ??
    null
  );
}

export function buildArtworkGallery({
  releaseArtwork,
  trackArtwork,
  scope,
}: {
  releaseArtwork: readonly ArtworkAssetLike[];
  trackArtwork?: readonly ArtworkAssetLike[];
  scope: "release" | "track";
}): ArtworkGalleryItem[] {
  if (scope === "release") {
    return buildGalleryItems(releaseArtwork, "release");
  }

  if (trackArtwork && trackArtwork.length > 0) {
    return buildGalleryItems(trackArtwork, "track");
  }

  const explicitFrontArtwork = releaseArtwork.filter(
    (asset) => inferArtworkRole(asset) === "front",
  );
  const inheritedFrontArtwork =
    explicitFrontArtwork.length > 0
      ? explicitFrontArtwork
      : releaseArtwork.slice(0, 1);

  return buildGalleryItems(
    inheritedFrontArtwork,
    "inherited-release",
    "front",
  );
}
