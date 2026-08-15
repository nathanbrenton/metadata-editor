import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parse } from "smol-toml";

import {
  importArtistPhoto,
  listArtistPhotoCandidates,
  removeArtistPhoto,
  setPrimaryArtistPhoto,
} from "../server/artist-assets.js";

async function createArtistFixture(
  mediaRoot: string,
): Promise<void> {
  const artistDirectory = path.join(
    mediaRoot,
    "artists",
    "nathan-brenton",
  );
  await mkdir(artistDirectory, { recursive: true });
  await writeFile(
    path.join(artistDirectory, "artist.toml"),
    [
      "[schema]",
      'name = "artist-metadata"',
      "version = 1",
      "",
      "[artist]",
      'id = "artist_nathan_brenton"',
      'slug = "nathan-brenton"',
      'display_name = "Nathan Brenton"',
      'sort_name = "Brenton, Nathan"',
      'primary_asset_id = ""',
      "assets = []",
      "",
    ].join("\n"),
  );
}

test("lists previewable Artist-photo candidates without following ingest symlinks", async () => {
  const ingestRoot = await mkdtemp(
    path.join(os.tmpdir(), "metadata-editor-artist-photo-candidates-"),
  );

  try {
    await mkdir(path.join(ingestRoot, "nested"));
    await writeFile(path.join(ingestRoot, "artist-one.tif"), "one");
    await writeFile(path.join(ingestRoot, "nested", "artist-two.jpg"), "two");
    await writeFile(path.join(ingestRoot, "notes.txt"), "ignore");
    await writeFile(path.join(ingestRoot, ".hidden.png"), "ignore");
    await symlink(
      path.join(ingestRoot, "artist-one.tif"),
      path.join(ingestRoot, "linked.tif"),
    );

    const candidates = await listArtistPhotoCandidates(ingestRoot);
    assert.deepEqual(
      candidates.map(({ relativePath }) => relativePath),
      ["artist-one.tif", "nested/artist-two.jpg"],
    );
  } finally {
    await rm(ingestRoot, { recursive: true, force: true });
  }
});

test("imports canonical Artist photos once, preserves ingest sources, and changes Primary explicitly", async () => {
  const mediaRoot = await mkdtemp(
    path.join(os.tmpdir(), "metadata-editor-artist-photo-library-"),
  );
  const ingestRoot = await mkdtemp(
    path.join(os.tmpdir(), "metadata-editor-artist-photo-ingest-"),
  );

  try {
    await createArtistFixture(mediaRoot);
    const firstSource = path.join(ingestRoot, "first.tif");
    const secondSource = path.join(ingestRoot, "second.tif");
    await writeFile(firstSource, Buffer.from("first-artist-photo"));
    await writeFile(secondSource, Buffer.from("second-artist-photo"));

    const first = await importArtistPhoto(
      mediaRoot,
      ingestRoot,
      {
        artistId: "artist_nathan_brenton",
        sourceRelativePath: "first.tif",
      },
    );
    assert.equal(first.assetId, "asset-001");
    assert.equal(first.primaryAssetId, "asset-001");
    assert.equal(first.sourceFilename, "first.tif");
    assert.equal(
      await readFile(
        path.join(
          mediaRoot,
          "artists/nathan-brenton/assets/asset-001/master.tif",
        ),
        "utf8",
      ),
      "first-artist-photo",
    );
    assert.equal(await readFile(firstSource, "utf8"), "first-artist-photo");

    await assert.rejects(
      importArtistPhoto(mediaRoot, ingestRoot, {
        artistId: "artist_nathan_brenton",
        sourceRelativePath: "first.tif",
      }),
      /same source bytes as asset-001/,
    );

    const second = await importArtistPhoto(
      mediaRoot,
      ingestRoot,
      {
        artistId: "artist_nathan_brenton",
        sourceRelativePath: "second.tif",
        setPrimary: false,
      },
    );
    assert.equal(second.assetId, "asset-002");
    assert.equal(second.primaryAssetId, "asset-001");

    const primaryUpdate = await setPrimaryArtistPhoto(
      mediaRoot,
      {
        artistId: "artist_nathan_brenton",
        assetId: "asset-002",
      },
    );
    assert.equal(primaryUpdate.primaryAssetId, "asset-002");

    const document = parse(
      await readFile(
        path.join(
          mediaRoot,
          "artists/nathan-brenton/artist.toml",
        ),
        "utf8",
      ),
    ) as Record<string, unknown>;
    const artist = document.artist as Record<string, unknown>;
    assert.equal(artist.primary_asset_id, "asset-002");
    const assets = artist.assets as Array<Record<string, unknown>>;
    assert.equal(assets.length, 2);
    assert.equal(assets[0]?.source_filename, "first.tif");
    assert.match(String(assets[0]?.sha256), /^[a-f0-9]{64}$/);
    assert.equal(assets[1]?.master_path, "assets/asset-002/master.tif");

    const removal = await removeArtistPhoto(
      mediaRoot,
      {
        artistId: "artist_nathan_brenton",
        assetId: "asset-001",
      },
    );
    assert.equal(removal.removedAssetId, "asset-001");
    assert.match(
      removal.archivedRelativePath,
      /^artists\/nathan-brenton\/\.asset-trash\/asset-001-/,
    );

    const afterRemovalDocument = parse(
      await readFile(
        path.join(
          mediaRoot,
          "artists/nathan-brenton/artist.toml",
        ),
        "utf8",
      ),
    ) as Record<string, unknown>;
    const afterRemovalArtist =
      afterRemovalDocument.artist as Record<string, unknown>;
    assert.equal(
      afterRemovalArtist.primary_asset_id,
      "asset-002",
    );
    const remainingAssets =
      afterRemovalArtist.assets as Array<Record<string, unknown>>;
    assert.deepEqual(
      remainingAssets.map((asset) => asset.id),
      ["asset-002"],
    );

    await assert.rejects(
      readFile(
        path.join(
          mediaRoot,
          "artists/nathan-brenton/assets/asset-001/master.tif",
        ),
      ),
      /ENOENT/,
    );
    assert.equal(
      await readFile(
        path.join(
          mediaRoot,
          removal.archivedRelativePath,
          "master.tif",
        ),
        "utf8",
      ),
      "first-artist-photo",
    );

    const primaryRemoval = await removeArtistPhoto(
      mediaRoot,
      {
        artistId: "artist_nathan_brenton",
        assetId: "asset-002",
      },
    );
    assert.equal(primaryRemoval.removedAssetId, "asset-002");
    assert.match(
      primaryRemoval.archivedRelativePath,
      /^artists\/nathan-brenton\/\.asset-trash\/asset-002-/,
    );

    const afterPrimaryRemovalDocument = parse(
      await readFile(
        path.join(
          mediaRoot,
          "artists/nathan-brenton/artist.toml",
        ),
        "utf8",
      ),
    ) as Record<string, unknown>;
    const afterPrimaryRemovalArtist =
      afterPrimaryRemovalDocument.artist as Record<string, unknown>;
    assert.equal(
      "primary_asset_id" in afterPrimaryRemovalArtist,
      false,
    );
    assert.deepEqual(
      afterPrimaryRemovalArtist.assets,
      [],
    );

    const backups = await readdir(
      path.join(
        mediaRoot,
        "artists/nathan-brenton/.metadata-backups",
      ),
    );
    assert.equal(backups.length, 5);
  } finally {
    await rm(mediaRoot, { recursive: true, force: true });
    await rm(ingestRoot, { recursive: true, force: true });
  }
});

test("rejects Artist-photo paths that escape ingest-drop and unknown primary assets", async () => {
  const mediaRoot = await mkdtemp(
    path.join(os.tmpdir(), "metadata-editor-artist-photo-guards-"),
  );
  const ingestRoot = await mkdtemp(
    path.join(os.tmpdir(), "metadata-editor-artist-photo-guards-ingest-"),
  );

  try {
    await createArtistFixture(mediaRoot);
    await assert.rejects(
      importArtistPhoto(mediaRoot, ingestRoot, {
        artistId: "artist_nathan_brenton",
        sourceRelativePath: "../escape.tif",
      }),
      /escapes configured ingest root/,
    );
    await assert.rejects(
      setPrimaryArtistPhoto(mediaRoot, {
        artistId: "artist_nathan_brenton",
        assetId: "asset-999",
      }),
      /not declared/,
    );
  } finally {
    await rm(mediaRoot, { recursive: true, force: true });
    await rm(ingestRoot, { recursive: true, force: true });
  }
});
