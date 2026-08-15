import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { scanMediaLibrary } from "../server/scanner.js";

test("scans first-class Artist identities separately from release artwork", async () => {
  const mediaRoot = await mkdtemp(
    path.join(os.tmpdir(), "metadata-editor-artist-library-"),
  );

  try {
    const artistPath = path.join(mediaRoot, "artists", "nathan-brenton");
    const releasePath = path.join(mediaRoot, "releases", "2025-08-31_killchain");
    await mkdir(artistPath, { recursive: true });
    await mkdir(releasePath, { recursive: true });
    await writeFile(
      path.join(artistPath, "artist.toml"),
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
    await writeFile(
      path.join(releasePath, "release.toml"),
      [
        "[release]",
        'id = "2025-08-31_killchain"',
        'title = "KILLCHAIN"',
        "",
        "[release.primary_artist]",
        'id = "artist_nathan_brenton"',
        'name = "Nathan Brenton"',
        "",
      ].join("\n"),
    );

    const result = await scanMediaLibrary(mediaRoot);
    assert.equal(result.artists.length, 1);
    assert.equal(result.artists[0]?.id, "artist_nathan_brenton");
    assert.equal(result.artists[0]?.slug, "nathan-brenton");
    assert.equal(result.artists[0]?.displayName, "Nathan Brenton");
    assert.deepEqual(result.artists[0]?.assets, []);
    assert.equal(result.releases[0]?.primaryArtistId, "artist_nathan_brenton");
    assert.equal(
      result.warnings.some((warning) => warning.includes("unknown Artist ID")),
      false,
    );
  } finally {
    await rm(mediaRoot, { recursive: true, force: true });
  }
});

test("reports an explicit release reference to an unknown Artist without guessing by name", async () => {
  const mediaRoot = await mkdtemp(
    path.join(os.tmpdir(), "metadata-editor-artist-reference-"),
  );

  try {
    const releasePath = path.join(mediaRoot, "releases", "release-one");
    await mkdir(releasePath, { recursive: true });
    await writeFile(
      path.join(releasePath, "release.toml"),
      [
        "[release]",
        'id = "release-one"',
        "",
        "[release.primary_artist]",
        'id = "artist_missing"',
        'name = "Display Name"',
        "",
      ].join("\n"),
    );

    const result = await scanMediaLibrary(mediaRoot);
    assert.match(result.warnings.join(" "), /unknown Artist ID artist_missing/);
  } finally {
    await rm(mediaRoot, { recursive: true, force: true });
  }
});
