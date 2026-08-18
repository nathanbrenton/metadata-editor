import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  readReleasePublicationSettings,
  saveReleasePublicationSettings,
} from "../server/publication-settings.js";
import type {
  ReleaseScanResult,
} from "../server/types.js";

async function createFixture() {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "publication-settings-"),
  );
  const mediaRootPath = path.join(
    temporaryRoot,
    "media-library",
  );
  const releaseId = "2026-08-17_public-selection";
  const releaseRelativePath = path.posix.join(
    "releases",
    releaseId,
  );
  const releasePath = path.join(
    mediaRootPath,
    "releases",
    releaseId,
  );
  await mkdir(releasePath, { recursive: true });
  const mediaRoot = await realpath(mediaRootPath);
  const release: ReleaseScanResult = {
    id: releaseId,
    relativePath: releaseRelativePath,
    metadataFiles: [],
    artworkMasters: [],
    tracks: [
      {
        id: "artist_01_first-track",
        relativePath: `${releaseRelativePath}/tracks/artist_01_first-track`,
        metadataFiles: [],
        audioMasters: [],
        artworkMasters: [],
      },
      {
        id: "artist_02_second-track",
        relativePath: `${releaseRelativePath}/tracks/artist_02_second-track`,
        metadataFiles: [],
        audioMasters: [],
        artworkMasters: [],
      },
    ],
    videos: [],
  };

  return {
    temporaryRoot,
    mediaRoot,
    release,
    settingsPath: path.join(
      releasePath,
      "release-settings.toml",
    ),
  };
}

test("legacy releases default to all tracks public with video publication off", async (t) => {
  const fixture = await createFixture();
  t.after(() => rm(fixture.temporaryRoot, {
    recursive: true,
    force: true,
  }));

  const settings = await readReleasePublicationSettings(
    fixture.mediaRoot,
    fixture.release,
  );

  assert.equal(settings.exists, false);
  assert.equal(settings.includeVideo, false);
  assert.equal(settings.trackSelectionMode, "all");
  assert.deepEqual(
    settings.includedTrackIds,
    fixture.release.tracks.map((track) => track.id),
  );
  assert.deepEqual(settings.issues, []);
});

test("saves explicit public track selection without replacing unrelated release settings", async (t) => {
  const fixture = await createFixture();
  t.after(() => rm(fixture.temporaryRoot, {
    recursive: true,
    force: true,
  }));

  await writeFile(
    fixture.settingsPath,
    [
      "[schema]",
      'name = "audio-release-settings"',
      "version = 1",
      "",
      "[release_reference]",
      `release_id = "${fixture.release.id}"`,
      "",
      "[settings.files]",
      'missing_optional_file_policy = "notice"',
      "",
    ].join("\n"),
  );

  const before = await readReleasePublicationSettings(
    fixture.mediaRoot,
    fixture.release,
  );
  assert.ok(before.sha256);

  const saved = await saveReleasePublicationSettings(
    fixture.mediaRoot,
    fixture.release,
    {
      includeVideo: true,
      includedTrackIds: [fixture.release.tracks[1].id],
      expectedSha256: before.sha256,
    },
  );

  assert.equal(saved.includeVideo, true);
  assert.equal(saved.trackSelectionMode, "selected");
  assert.deepEqual(
    saved.includedTrackIds,
    [fixture.release.tracks[1].id],
  );
  assert.ok(saved.sha256);
  assert.notEqual(saved.sha256, before.sha256);

  const persisted = await readFile(
    fixture.settingsPath,
    "utf8",
  );
  assert.match(
    persisted,
    /missing_optional_file_policy\s*=\s*"notice"/,
  );
  assert.match(
    persisted,
    /include_video\s*=\s*true/,
  );
  assert.match(
    persisted,
    new RegExp(fixture.release.tracks[1].id),
  );
});

test("rejects empty public track selection and stale settings writes", async (t) => {
  const fixture = await createFixture();
  t.after(() => rm(fixture.temporaryRoot, {
    recursive: true,
    force: true,
  }));

  await assert.rejects(
    saveReleasePublicationSettings(
      fixture.mediaRoot,
      fixture.release,
      {
        includeVideo: false,
        includedTrackIds: [],
      },
    ),
    /At least one public track must be selected/,
  );

  await writeFile(
    fixture.settingsPath,
    `[release_reference]\nrelease_id = "${fixture.release.id}"\n`,
  );
  const loaded = await readReleasePublicationSettings(
    fixture.mediaRoot,
    fixture.release,
  );
  assert.ok(loaded.sha256);
  await writeFile(
    fixture.settingsPath,
    `[release_reference]\nrelease_id = "${fixture.release.id}"\n# changed\n`,
  );

  await assert.rejects(
    saveReleasePublicationSettings(
      fixture.mediaRoot,
      fixture.release,
      {
        includeVideo: false,
        includedTrackIds: [fixture.release.tracks[0].id],
        expectedSha256: loaded.sha256,
      },
    ),
    /changed after they were loaded/,
  );
});
