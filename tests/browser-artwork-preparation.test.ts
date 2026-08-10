import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildBrowserArtworkFfmpegArgs,
  buildBrowserArtworkInfo,
  buildBrowserArtworkPlan,
  buildBrowserArtworkProfile,
  buildBrowserArtworkVerificationArgs,
} from "../server/media-processing/browser-artwork.js";
import type {
  ReleaseScanResult,
} from "../server/types.js";

test("defines a sanitized single-frame PNG browser-artwork profile", () => {
  const profile = buildBrowserArtworkProfile();
  assert.equal(profile.format, "png");
  assert.equal(profile.filename, "artwork.png");
  assert.equal(profile.frameCount, 1);
  assert.equal(profile.stripMetadata, true);

  const args = buildBrowserArtworkFfmpegArgs(
    "/tmp/source art.tif",
    "/tmp/artwork.png",
  );
  assert.ok(args.includes("-frames:v"));
  assert.ok(args.includes("1"));
  assert.ok(args.includes("-map_metadata"));
  assert.ok(args.includes("-1"));
  assert.equal(args.at(-1), "/tmp/artwork.png");

  const verify = buildBrowserArtworkVerificationArgs(
    "/tmp/artwork.png",
  );
  assert.deepEqual(verify.slice(-3), ["-f", "null", "-"]);
});

test("marks TIFF release artwork missing then current only with matching freshness sidecar", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "metadata-browser-artwork-"),
  );
  const releaseId = "2026-08-10_artwork-test";
  const releaseRelativePath = path.posix.join(
    "releases",
    releaseId,
  );
  const artworkDirectory = path.join(
    root,
    "releases",
    releaseId,
    "artwork",
    "front",
  );

  try {
    await mkdir(artworkDirectory, { recursive: true });
    await writeFile(
      path.join(artworkDirectory, "artwork-master.tif"),
      Buffer.from("canonical-tiff-bytes"),
    );

    const release: ReleaseScanResult = {
      id: releaseId,
      relativePath: releaseRelativePath,
      metadataFiles: [],
      artworkMasters: [
        {
          filename: "artwork-master.tif",
          relativePath: path.posix.join(
            releaseRelativePath,
            "artwork/front/artwork-master.tif",
          ),
          extension: ".tif",
        },
      ],
      tracks: [],
    };

    const missing = await buildBrowserArtworkPlan(
      root,
      release,
    );
    assert.equal(missing.status, "missing");
    assert.equal(missing.action, "create");
    assert.ok(missing.sourceSha256);

    await writeFile(
      path.join(artworkDirectory, "artwork.png"),
      Buffer.from("generated-png-bytes"),
    );
    const stale = await buildBrowserArtworkPlan(root, release);
    assert.equal(stale.status, "stale");
    assert.equal(stale.action, "replace");

    await writeFile(
      path.join(artworkDirectory, "artwork-info.json"),
      `${JSON.stringify(
        buildBrowserArtworkInfo(stale, "2026-08-10T06:00:00.000Z"),
        null,
        2,
      )}\n`,
    );

    const current = await buildBrowserArtworkPlan(root, release);
    assert.equal(current.status, "current");
    assert.equal(current.action, "none");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
