import {
  createArtworkAssignmentId,
  type IngestArtworkAssignmentDraft,
  type IngestBuildAssetDraft,
} from "../shared/ingest-builder.js";

export type ArtworkAssignmentTarget =
  | { scope: "release" }
  | {
      scope: "track";
      trackSourceRelativePath: string;
    };

export type ArtworkAssignmentUpdate = {
  sourceRelativePath: string;
  include: boolean;
  artworkAssignments: IngestArtworkAssignmentDraft[];
};

export function isFrontCoverAssignment(
  assignment: IngestArtworkAssignmentDraft,
): boolean {
  return assignment.role.trim().toLowerCase() === "front_cover";
}

export function artworkAssetMatchesTarget(
  asset: IngestBuildAssetDraft,
  target: ArtworkAssignmentTarget,
): boolean {
  return asset.artworkAssignments.some((assignment) => {
    if (!isFrontCoverAssignment(assignment)) {
      return false;
    }

    if (target.scope === "release") {
      return assignment.scope === "release";
    }

    return (
      assignment.scope === "track" &&
      assignment.trackSourceRelativePaths.includes(
        target.trackSourceRelativePath,
      )
    );
  });
}

export function artworkAssetsAssignedToTarget(
  assets: IngestBuildAssetDraft[],
  target: ArtworkAssignmentTarget,
): IngestBuildAssetDraft[] {
  return assets.filter(
    (asset) =>
      asset.mediaKind === "image" &&
      asset.include &&
      artworkAssetMatchesTarget(asset, target),
  );
}

function assignmentsWithoutTarget(
  artworkAssignments: IngestArtworkAssignmentDraft[],
  target: ArtworkAssignmentTarget,
): IngestArtworkAssignmentDraft[] {
  return artworkAssignments
    .map((assignment) => {
      if (!isFrontCoverAssignment(assignment)) {
        return assignment;
      }

      if (target.scope === "release") {
        return assignment.scope === "release"
          ? null
          : assignment;
      }

      if (assignment.scope !== "track") {
        return assignment;
      }

      const trackSourceRelativePaths =
        assignment.trackSourceRelativePaths.filter(
          (path) =>
            path !== target.trackSourceRelativePath,
        );

      return trackSourceRelativePaths.length === 0
        ? null
        : {
            ...assignment,
            trackSourceRelativePaths,
          };
    })
    .filter(
      (assignment): assignment is IngestArtworkAssignmentDraft =>
        assignment !== null,
    );
}

function addTargetAssignment(
  artworkAssignments: IngestArtworkAssignmentDraft[],
  target: ArtworkAssignmentTarget,
): IngestArtworkAssignmentDraft[] {
  if (target.scope === "release") {
    return [
      ...artworkAssignments,
      {
        id: createArtworkAssignmentId(artworkAssignments),
        scope: "release",
        role: "front_cover",
        trackSourceRelativePaths: [],
      },
    ];
  }

  const existingIndex = artworkAssignments.findIndex(
    (assignment) =>
      assignment.scope === "track" &&
      isFrontCoverAssignment(assignment),
  );

  if (existingIndex >= 0) {
    return artworkAssignments.map((assignment, index) =>
      index === existingIndex
        ? {
            ...assignment,
            trackSourceRelativePaths: [
              ...new Set([
                ...assignment.trackSourceRelativePaths,
                target.trackSourceRelativePath,
              ]),
            ],
          }
        : assignment,
    );
  }

  return [
    ...artworkAssignments,
    {
      id: createArtworkAssignmentId(artworkAssignments),
      scope: "track",
      role: "front_cover",
      trackSourceRelativePaths: [
        target.trackSourceRelativePath,
      ],
    },
  ];
}

export function buildFrontArtworkAssignmentUpdates(
  assets: IngestBuildAssetDraft[],
  sourceRelativePath: string,
  target: ArtworkAssignmentTarget,
): ArtworkAssignmentUpdate[] {
  const source = assets.find(
    (asset) =>
      asset.mediaKind === "image" &&
      asset.sourceRelativePath === sourceRelativePath,
  );

  if (!source) {
    return [];
  }

  return assets.flatMap((asset) => {
    if (asset.mediaKind !== "image") {
      return [];
    }

    const alreadyAssigned =
      asset.sourceRelativePath === sourceRelativePath &&
      artworkAssetMatchesTarget(asset, target);
    const withoutTarget = assignmentsWithoutTarget(
      asset.artworkAssignments,
      target,
    );
    const artworkAssignments = alreadyAssigned
      ? asset.artworkAssignments
      : asset.sourceRelativePath === sourceRelativePath
        ? addTargetAssignment(withoutTarget, target)
        : withoutTarget;
    const include = artworkAssignments.length > 0;

    if (
      include === asset.include &&
      JSON.stringify(artworkAssignments) ===
        JSON.stringify(asset.artworkAssignments)
    ) {
      return [];
    }

    return [{
      sourceRelativePath: asset.sourceRelativePath,
      include,
      artworkAssignments,
    }];
  });
}

export function removeFrontArtworkTarget(
  asset: IngestBuildAssetDraft,
  target: ArtworkAssignmentTarget,
): ArtworkAssignmentUpdate {
  const artworkAssignments = assignmentsWithoutTarget(
    asset.artworkAssignments,
    target,
  );

  return {
    sourceRelativePath: asset.sourceRelativePath,
    include: artworkAssignments.length > 0,
    artworkAssignments,
  };
}
