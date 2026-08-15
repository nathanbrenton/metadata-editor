import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parse } from "smol-toml";

import {
  applyArtistFoundationMigration,
  INITIAL_ARTISTS,
  INITIAL_RELEASE_ARTIST_ASSIGNMENTS,
  planArtistFoundationMigration,
} from "../server/artist-migration.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

test("plans then applies the deterministic four-Artist thirteen-release migration with backups", async () => {
  const mediaRoot = await mkdtemp(
    path.join(os.tmpdir(), "metadata-editor-artist-migration-"),
  );

  try {
    for (const assignment of INITIAL_RELEASE_ARTIST_ASSIGNMENTS) {
      const releasePath = path.join(mediaRoot, "releases", assignment.releaseId);
      await mkdir(releasePath, { recursive: true });
      await writeFile(
        path.join(releasePath, "release.toml"),
        [
          "[release]",
          `id = "${assignment.releaseId}"`,
          'title = "Migration fixture"',
          "",
          "[release.primary_artist]",
          `name = "${assignment.expectedArtistName}"`,
          'sort_name = ""',
          "",
        ].join("\n"),
      );
    }

    const plan = await planArtistFoundationMigration(mediaRoot);
    assert.equal(plan.summary.createCount, 4);
    assert.equal(plan.summary.updateCount, 13);
    assert.equal(plan.summary.blockedCount, 0);

    const applied = await applyArtistFoundationMigration(mediaRoot);
    assert.equal(applied.createdArtists.length, 4);
    assert.equal(applied.updatedReleases.length, 13);

    for (const artist of INITIAL_ARTISTS) {
      const content = await readFile(
        path.join(mediaRoot, "artists", artist.slug, "artist.toml"),
        "utf8",
      );
      const parsed = parse(content);
      assert.equal(
        isRecord(parsed) && isRecord(parsed.artist) ? parsed.artist.id : undefined,
        artist.id,
      );
    }

    for (const assignment of INITIAL_RELEASE_ARTIST_ASSIGNMENTS) {
      const content = await readFile(
        path.join(mediaRoot, "releases", assignment.releaseId, "release.toml"),
        "utf8",
      );
      const parsed = parse(content);
      const release = isRecord(parsed) && isRecord(parsed.release)
        ? parsed.release
        : null;
      const primaryArtist = release && isRecord(release.primary_artist)
        ? release.primary_artist
        : null;
      assert.equal(primaryArtist?.id, assignment.artistId);
      assert.equal(primaryArtist?.name, assignment.expectedArtistName);
      assert.equal(primaryArtist?.sort_name, "");

      const appliedUpdate = applied.updatedReleases.find(
        (update) => update.releaseId === assignment.releaseId,
      );
      assert.ok(appliedUpdate);
      const backupContent = await readFile(
        path.join(
          mediaRoot,
          ...appliedUpdate.backupRelativePath.split("/"),
        ),
        "utf8",
      );
      const backupParsed = parse(backupContent);
      const backupRelease =
        isRecord(backupParsed) && isRecord(backupParsed.release)
          ? backupParsed.release
          : null;
      const backupPrimaryArtist =
        backupRelease && isRecord(backupRelease.primary_artist)
          ? backupRelease.primary_artist
          : null;
      assert.equal(backupPrimaryArtist?.id, undefined);
      assert.equal(
        backupPrimaryArtist?.name,
        assignment.expectedArtistName,
      );
    }

    const after = await planArtistFoundationMigration(mediaRoot);
    assert.equal(after.summary.currentCount, 17);
    assert.equal(after.summary.createCount, 0);
    assert.equal(after.summary.updateCount, 0);
    assert.equal(after.summary.blockedCount, 0);
  } finally {
    await rm(mediaRoot, { recursive: true, force: true });
  }
});

test("blocks instead of fuzzy-matching an unexpected release artist name", async () => {
  const mediaRoot = await mkdtemp(
    path.join(os.tmpdir(), "metadata-editor-artist-migration-block-"),
  );

  try {
    for (const assignment of INITIAL_RELEASE_ARTIST_ASSIGNMENTS) {
      const releasePath = path.join(mediaRoot, "releases", assignment.releaseId);
      await mkdir(releasePath, { recursive: true });
      const name = assignment.releaseId === "2025-08-31_killchain"
        ? "Nathan B."
        : assignment.expectedArtistName;
      await writeFile(
        path.join(releasePath, "release.toml"),
        `[release]\nid = "${assignment.releaseId}"\n[release.primary_artist]\nname = "${name}"\n`,
      );
    }

    const plan = await planArtistFoundationMigration(mediaRoot);
    const blocked = plan.items.find((item) => item.id === "2025-08-31_killchain");
    assert.equal(blocked?.action, "blocked");
    assert.match(blocked?.reason ?? "", /Expected release artist Nathan Brenton/);
  } finally {
    await rm(mediaRoot, { recursive: true, force: true });
  }
});
