import assert from "node:assert/strict";
import test from "node:test";

import {
  artworkAssetsAssignedToTarget,
  buildFrontArtworkAssignmentUpdates,
  removeFrontArtworkTarget,
} from "../src/ingest-artwork-assignment.js";
import type {
  IngestBuildAssetDraft,
} from "../shared/ingest-builder.js";

function imageAsset(
  sourceRelativePath: string,
  artworkAssignments: IngestBuildAssetDraft["artworkAssignments"] = [],
): IngestBuildAssetDraft {
  return {
    sourceRelativePath,
    include: artworkAssignments.length > 0,
    mediaKind: "image",
    destinationRelativePath: "",
    artworkAssignments,
  };
}

test(
  "assigns release front artwork and removes another release front without disturbing track roles",
  () => {
    const assets = [
      imageAsset("release-old.jpg", [
        {
          id: "release-front-cover",
          scope: "release",
          role: "front_cover",
          trackSourceRelativePaths: [],
        },
      ]),
      imageAsset("replacement.jpg", [
        {
          id: "track-front-cover",
          scope: "track",
          role: "front_cover",
          trackSourceRelativePaths: ["03/track.wav"],
        },
      ]),
    ];

    const updates = buildFrontArtworkAssignmentUpdates(
      assets,
      "replacement.jpg",
      { scope: "release" },
    );

    const oldUpdate = updates.find(
      (update) => update.sourceRelativePath === "release-old.jpg",
    );
    const replacementUpdate = updates.find(
      (update) => update.sourceRelativePath === "replacement.jpg",
    );

    assert.deepEqual(oldUpdate?.artworkAssignments, []);
    assert.equal(oldUpdate?.include, false);
    assert.ok(
      replacementUpdate?.artworkAssignments.some(
        (assignment) =>
          assignment.scope === "release" &&
          assignment.role === "front_cover",
      ),
    );
    assert.ok(
      replacementUpdate?.artworkAssignments.some(
        (assignment) =>
          assignment.scope === "track" &&
          assignment.trackSourceRelativePaths.includes("03/track.wav"),
      ),
    );
  },
);

test(
  "one artwork source can be front artwork for several tracks while each target remains singular",
  () => {
    const assets = [
      imageAsset("shared.jpg", [
        {
          id: "track-front-cover",
          scope: "track",
          role: "front_cover",
          trackSourceRelativePaths: ["01/a.wav"],
        },
      ]),
      imageAsset("track-two-old.jpg", [
        {
          id: "track-front-cover",
          scope: "track",
          role: "front_cover",
          trackSourceRelativePaths: ["02/b.wav"],
        },
      ]),
    ];

    const updates = buildFrontArtworkAssignmentUpdates(
      assets,
      "shared.jpg",
      {
        scope: "track",
        trackSourceRelativePath: "02/b.wav",
      },
    );
    const nextAssets = assets.map((asset) => {
      const update = updates.find(
        (item) => item.sourceRelativePath === asset.sourceRelativePath,
      );

      return update
        ? {
            ...asset,
            include: update.include,
            artworkAssignments: update.artworkAssignments,
          }
        : asset;
    });

    assert.deepEqual(
      artworkAssetsAssignedToTarget(
        nextAssets,
        {
          scope: "track",
          trackSourceRelativePath: "01/a.wav",
        },
      ).map((asset) => asset.sourceRelativePath),
      ["shared.jpg"],
    );
    assert.deepEqual(
      artworkAssetsAssignedToTarget(
        nextAssets,
        {
          scope: "track",
          trackSourceRelativePath: "02/b.wav",
        },
      ).map((asset) => asset.sourceRelativePath),
      ["shared.jpg"],
    );
  },
);

test(
  "removing one track target preserves the same artwork assignment for other tracks",
  () => {
    const asset = imageAsset("shared.jpg", [
      {
        id: "track-front-cover",
        scope: "track",
        role: "front_cover",
        trackSourceRelativePaths: [
          "01/a.wav",
          "02/b.wav",
        ],
      },
      {
        id: "back-cover",
        scope: "release",
        role: "back_cover",
        trackSourceRelativePaths: [],
      },
    ]);

    const update = removeFrontArtworkTarget(
      asset,
      {
        scope: "track",
        trackSourceRelativePath: "01/a.wav",
      },
    );

    assert.equal(update.include, true);
    assert.deepEqual(
      update.artworkAssignments[0]?.trackSourceRelativePaths,
      ["02/b.wav"],
    );
    assert.equal(update.artworkAssignments[1]?.role, "back_cover");
  },
);
