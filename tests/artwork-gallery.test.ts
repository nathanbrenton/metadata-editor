import assert from "node:assert/strict";
import test from "node:test";

import {
  buildArtworkGallery,
  inferArtworkRole,
  isBrowserPreviewableArtwork,
  selectPreferredReleaseArtwork,
  type ArtworkAssetLike,
} from "../src/artwork-gallery.js";

const asset = (
  relativePath: string,
  extension = ".png",
): ArtworkAssetLike => ({
  filename: relativePath.split("/").at(-1) ?? "artwork-master.png",
  relativePath,
  extension,
});

test("infers common artwork roles from directory and filename tokens", () => {
  assert.equal(
    inferArtworkRole(asset("releases/demo/artwork/front/artwork-master.png")),
    "front",
  );
  assert.equal(
    inferArtworkRole(asset("releases/demo/artwork/back/back-cover.png")),
    "back",
  );
  assert.equal(
    inferArtworkRole(asset("releases/demo/artwork/disc/disc-label.png")),
    "disc",
  );
  assert.equal(
    inferArtworkRole(asset("releases/demo/artwork/alternate/variant-2.png")),
    "alternate",
  );
});

test("release galleries include release artwork only and use role order", () => {
  const gallery = buildArtworkGallery({
    scope: "release",
    releaseArtwork: [
      asset("releases/demo/artwork/back/artwork-master.png"),
      asset("releases/demo/artwork/front/artwork-master.png"),
      asset("releases/demo/artwork/disc/artwork-master.png"),
    ],
  });

  assert.deepEqual(
    gallery.map((item) => item.role),
    ["front", "back", "disc"],
  );
  assert.equal(gallery.every((item) => item.source === "release"), true);
});

test("track galleries prefer all track-specific artwork", () => {
  const gallery = buildArtworkGallery({
    scope: "track",
    releaseArtwork: [
      asset("releases/demo/artwork/front/artwork-master.png"),
    ],
    trackArtwork: [
      asset("releases/demo/tracks/track-1/artwork/alternate/alt.png"),
      asset("releases/demo/tracks/track-1/artwork/front/front.png"),
    ],
  });

  assert.equal(gallery.length, 2);
  assert.equal(gallery.every((item) => item.source === "track"), true);
  assert.equal(gallery.some((item) => item.inherited), false);
});

test("tracks without local artwork inherit release front artwork only", () => {
  const gallery = buildArtworkGallery({
    scope: "track",
    releaseArtwork: [
      asset("releases/demo/artwork/back/artwork-master.png"),
      asset("releases/demo/artwork/front/front.png"),
      asset("releases/demo/artwork/front/front.tif", ".tif"),
    ],
    trackArtwork: [],
  });

  assert.equal(gallery.length, 2);
  assert.equal(gallery.every((item) => item.role === "front"), true);
  assert.equal(gallery.every((item) => item.inherited), true);
  assert.equal(
    gallery.every((item) => item.source === "inherited-release"),
    true,
  );
});

test("uses the first release asset as a conservative front fallback", () => {
  const first = asset("releases/demo/artwork/artwork-master.png");
  const second = asset("releases/demo/artwork/promotional/press.png");

  assert.equal(
    selectPreferredReleaseArtwork([first, second])?.relativePath,
    first.relativePath,
  );

  const gallery = buildArtworkGallery({
    scope: "track",
    releaseArtwork: [first, second],
    trackArtwork: [],
  });

  assert.equal(gallery.length, 1);
  assert.equal(gallery[0]?.asset.relativePath, first.relativePath);
  assert.equal(gallery[0]?.role, "front");
});


test("marks browser-friendly artwork formats without assuming TIFF or PDF support", () => {
  assert.equal(
    isBrowserPreviewableArtwork(asset("release/front.svg", ".svg")),
    false,
  );
  assert.equal(
    isBrowserPreviewableArtwork(asset("release/front.tif", ".tif")),
    false,
  );
  assert.equal(
    isBrowserPreviewableArtwork(asset("release/booklet.pdf", ".pdf")),
    false,
  );
});
