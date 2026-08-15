import assert from "node:assert/strict";
import {
  createHash,
} from "node:crypto";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildArtistPublicationPlan,
  buildArtistWebpFfmpegArgs,
  publishArtistPackage,
  verifyPublishedArtistSnapshot,
} from "../server/artist-publication.js";
import {
  auditPublishedMediaDeployment,
} from "../server/published-media-deployment.js";
import type {
  FfmpegCapabilities,
} from "../server/types.js";

function sha256(
  content: Buffer | string,
): string {
  return createHash("sha256")
    .update(content)
    .digest("hex");
}

const capabilities: FfmpegCapabilities = {
  available: true,
  executable: "ffmpeg",
  encoders: ["libwebp"],
  containers: [],
  checkedAt:
    "2026-08-15T01:00:00.000Z",
};

async function writeArtist(
  root: string,
  withPhoto: boolean,
): Promise<void> {
  const artistRoot = path.join(
    root,
    "artists",
    "nathan-brenton",
  );
  await mkdir(
    path.join(
      artistRoot,
      "assets",
      "asset-001",
    ),
    {
      recursive: true,
    },
  );

  const source = Buffer.from(
    "canonical-artist-photo",
  );
  if (withPhoto) {
    await writeFile(
      path.join(
        artistRoot,
        "assets",
        "asset-001",
        "master.tif",
      ),
      source,
    );
  }

  await writeFile(
    path.join(
      artistRoot,
      "artist.toml",
    ),
    withPhoto
      ? [
          "[schema]",
          'name = "artist-metadata"',
          "version = 1",
          "",
          "[artist]",
          'id = "artist_nathan_brenton"',
          'slug = "nathan-brenton"',
          'display_name = "Nathan Brenton"',
          'sort_name = "Brenton, Nathan"',
          'primary_asset_id = "asset-001"',
          "",
          "[[artist.assets]]",
          'id = "asset-001"',
          'kind = "photo"',
          'master_path = "assets/asset-001/master.tif"',
          'source_filename = "portrait.tif"',
          `sha256 = "${sha256(source)}"`,
          "",
        ].join("\n")
      : [
          "[schema]",
          'name = "artist-metadata"',
          "version = 1",
          "",
          "[artist]",
          'id = "artist_nathan_brenton"',
          'slug = "nathan-brenton"',
          'display_name = "Nathan Brenton"',
          'sort_name = "Brenton, Nathan"',
          "assets = []",
          "",
        ].join("\n"),
  );
}

const fakeProcessRunner = async (
  _executable: string,
  args: readonly string[],
): Promise<void> => {
  const output = args.at(-1);
  if (
    output &&
    output !== "-"
  ) {
    await writeFile(
      output,
      Buffer.from("generated-webp"),
    );
  }
};

test("defines a no-crop no-upscale WebP Artist-photo profile", () => {
  const args =
    buildArtistWebpFfmpegArgs(
      "/tmp/master.tif",
      "/tmp/asset-001.webp",
    );

  assert.ok(
    args.includes("libwebp"),
  );
  assert.ok(
    args.includes("-map_metadata"),
  );
  assert.ok(
    args.includes("-1"),
  );
  assert.ok(
    args.some((value) =>
      value.includes(
        "force_original_aspect_ratio=decrease",
      ),
    ),
  );
  assert.ok(
    args.some((value) =>
      value.includes(
        "min(iw,1920)",
      ),
    ),
  );
  assert.ok(
    args.some((value) =>
      value.includes(
        "min(ih,1080)",
      ),
    ),
  );
});

test("publishes and atomically refreshes the complete Artist snapshot without stale removed photos", async (t) => {
  const mediaRoot = await mkdtemp(
    path.join(
      os.tmpdir(),
      "metadata-artist-publication-library-",
    ),
  );
  const publishRoot = await mkdtemp(
    path.join(
      os.tmpdir(),
      "metadata-artist-publication-public-",
    ),
  );

  t.after(async () => {
    await rm(mediaRoot, {
      recursive: true,
      force: true,
    });
    await rm(publishRoot, {
      recursive: true,
      force: true,
    });
  });

  await writeArtist(
    mediaRoot,
    true,
  );

  const initialPlan =
    await buildArtistPublicationPlan(
      mediaRoot,
      publishRoot,
      {
        ffmpegCapabilities:
          capabilities,
        generatedAt:
          "2026-08-15T01:00:00.000Z",
      },
    );
  assert.equal(
    initialPlan.state,
    "not-published",
  );
  assert.equal(
    initialPlan.status,
    "ready",
  );
  assert.equal(
    initialPlan.summary.artistCount,
    1,
  );
  assert.equal(
    initialPlan.summary.photoCount,
    1,
  );

  const firstReceipt =
    await publishArtistPackage(
      mediaRoot,
      publishRoot,
      {
        expectedPlanFingerprint:
          initialPlan.planFingerprint,
        planGeneratedAt:
          initialPlan.generatedAt,
        ffmpegCapabilities:
          capabilities,
        processRunner:
          fakeProcessRunner,
      },
    );
  assert.equal(
    firstReceipt.mode,
    "build",
  );

  const firstVerification =
    await verifyPublishedArtistSnapshot(
      publishRoot,
    );
  assert.equal(
    firstVerification.ok,
    true,
  );

  const publicArtist = JSON.parse(
    await readFile(
      path.join(
        publishRoot,
        "artists/nathan-brenton/artist.json",
      ),
      "utf8",
    ),
  ) as Record<string, unknown>;
  const serialized =
    JSON.stringify(publicArtist);
  assert.match(
    serialized,
    /asset-001\.webp/,
  );
  assert.doesNotMatch(
    serialized,
    /master_path|source_filename|portrait\.tif|sha256/,
  );
  assert.equal(
    await readFile(
      path.join(
        publishRoot,
        "artists/nathan-brenton/assets/asset-001.webp",
      ),
      "utf8",
    ),
    "generated-webp",
  );

  await writeArtist(
    mediaRoot,
    false,
  );

  const updatePlan =
    await buildArtistPublicationPlan(
      mediaRoot,
      publishRoot,
      {
        ffmpegCapabilities:
          capabilities,
        generatedAt:
          "2026-08-15T01:05:00.000Z",
      },
    );
  assert.equal(
    updatePlan.state,
    "update-available",
  );
  assert.equal(
    updatePlan.summary.photoCount,
    0,
  );

  const secondReceipt =
    await publishArtistPackage(
      mediaRoot,
      publishRoot,
      {
        expectedPlanFingerprint:
          updatePlan.planFingerprint,
        planGeneratedAt:
          updatePlan.generatedAt,
        ffmpegCapabilities:
          capabilities,
        processRunner:
          fakeProcessRunner,
      },
    );
  assert.equal(
    secondReceipt.mode,
    "update",
  );

  const after = JSON.parse(
    await readFile(
      path.join(
        publishRoot,
        "artists/nathan-brenton/artist.json",
      ),
      "utf8",
    ),
  ) as {
    photos: unknown[];
    primaryPhoto?: unknown;
  };
  assert.deepEqual(
    after.photos,
    [],
  );
  assert.equal(
    "primaryPhoto" in after,
    false,
  );

  await assert.rejects(
    readFile(
      path.join(
        publishRoot,
        "artists/nathan-brenton/assets/asset-001.webp",
      ),
    ),
    /ENOENT/,
  );

  await writeFile(
    path.join(
      publishRoot,
      "catalog.json",
    ),
    `${JSON.stringify({
      schema: {
        name: "audio-player-catalog",
        version: 1,
      },
      generatedAt:
        "2026-08-15T01:06:00.000Z",
      releases: [],
    }, null, 2)}\n`,
  );

  const deployment =
    await auditPublishedMediaDeployment(
      publishRoot,
      "2026-08-15T01:07:00.000Z",
    );
  assert.equal(
    deployment.summary.blockedCount,
    0,
  );
  assert.ok(
    deployment.candidateManifest?.files.some(
      (file) =>
        file.path === "artists.json",
    ),
  );
  assert.ok(
    deployment.candidateManifest?.files.some(
      (file) =>
        file.path ===
          "artist-publication-manifest.json",
    ),
  );
});
