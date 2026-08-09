import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import {
  mkdtemp,
  mkdir,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { parse } from "smol-toml";

import {
  buildReleaseRenamePlan,
  executeReleaseRenamePlan,
  releaseRenameConfirmation,
} from "../server/release-rename.js";
import type {
  ReleaseScanResult,
} from "../server/types.js";

async function createFixture() {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "metadata-release-rename-"),
  );
  const mediaRoot = await realpath(temporaryRoot);
  const oldId = "2016-10-23_indoor-lightning-ep";
  const newId = "2016-10-23_indoor-lightning";
  const releasePath = path.join(mediaRoot, "releases", oldId);
  const trackPath = path.join(releasePath, "tracks", "artist_01_song");
  await mkdir(trackPath, { recursive: true });

  await writeFile(
    path.join(releasePath, "release.toml"),
    `
[schema]
name = "audio-release-metadata"
version = 1

[release]
id = "${oldId}"
title = "Indoor Lightning EP"

[release.dates]
release = "2016-10-23"
`.trimStart(),
  );
  await writeFile(
    path.join(releasePath, "release-settings.toml"),
    `
[release_reference]
release_id = "${oldId}"

[settings]
unknown_value = "preserved"
`.trimStart(),
  );
  await writeFile(
    path.join(trackPath, "track.toml"),
    `
[release_reference]
release_id = "${oldId}"

[track]
id = "artist_01_song"
title = "Song"
`.trimStart(),
  );
  await writeFile(
    path.join(trackPath, "track-credits.toml"),
    `
[release_reference]
release_id = "${oldId}"

[track_reference]
track_id = "artist_01_song"
`.trimStart(),
  );
  const masterBytes = Buffer.from("unchanged audio bytes");
  await writeFile(path.join(trackPath, "audio-master.m4a"), masterBytes);
  await writeFile(
    path.join(releasePath, "ingest-receipt.json"),
    `${JSON.stringify({
      schema: {
        name: "metadata-editor-ingest-receipt",
        version: 2,
      },
      release: {
        id: oldId,
        relativePath: `releases/${oldId}`,
        title: "Indoor Lightning EP",
      },
      tracks: [
        {
          id: "artist_01_song",
          destinationRelativePath:
            `releases/${oldId}/tracks/artist_01_song/audio-master.m4a`,
        },
      ],
    }, null, 2)}\n`,
  );

  const release: ReleaseScanResult = {
    id: oldId,
    relativePath: `releases/${oldId}`,
    releaseTitle: "Indoor Lightning EP",
    primaryArtistName: "Artist",
    metadataFiles: [
      {
        filename: "release.toml",
        relativePath: `releases/${oldId}/release.toml`,
        exists: true,
      },
      {
        filename: "release-settings.toml",
        relativePath: `releases/${oldId}/release-settings.toml`,
        exists: true,
      },
    ],
    artworkMasters: [],
    tracks: [
      {
        id: "artist_01_song",
        relativePath: `releases/${oldId}/tracks/artist_01_song`,
        metadataFiles: [
          {
            filename: "track.toml",
            relativePath:
              `releases/${oldId}/tracks/artist_01_song/track.toml`,
            exists: true,
          },
          {
            filename: "track-credits.toml",
            relativePath:
              `releases/${oldId}/tracks/artist_01_song/track-credits.toml`,
            exists: true,
          },
        ],
        audioMasters: [
          {
            filename: "audio-master.m4a",
            relativePath:
              `releases/${oldId}/tracks/artist_01_song/audio-master.m4a`,
            extension: ".m4a",
          },
        ],
        artworkMasters: [],
      },
    ],
  };

  return {
    temporaryRoot,
    mediaRoot,
    oldId,
    newId,
    release,
    masterBytes,
  };
}

test("renames a release directory and synchronizes release references", async () => {
  const fixture = await createFixture();

  try {
    const plan = await buildReleaseRenamePlan(
      fixture.mediaRoot,
      fixture.release,
      fixture.newId,
      "Indoor Lightning",
    );

    assert.equal(plan.summary.blockedCount, 0);
    assert.equal(plan.summary.renameCount, 1);
    assert.ok(plan.summary.updateCount >= 4);

    const receipt = await executeReleaseRenamePlan(
      fixture.mediaRoot,
      fixture.release,
      fixture.newId,
      "Indoor Lightning",
      releaseRenameConfirmation,
      plan.fingerprint,
    );

    assert.equal(receipt.releaseId, fixture.newId);
    assert.equal(
      existsSync(
        path.join(
          fixture.mediaRoot,
          "releases",
          fixture.oldId,
        ),
      ),
      false,
    );

    const renamedPath = path.join(
      fixture.mediaRoot,
      "releases",
      fixture.newId,
    );
    assert.equal(existsSync(renamedPath), true);

    const releaseToml = parse(
      await readFile(path.join(renamedPath, "release.toml"), "utf8"),
    ) as Record<string, any>;
    assert.equal(releaseToml.release.id, fixture.newId);
    assert.equal(releaseToml.release.title, "Indoor Lightning");

    const settingsToml = parse(
      await readFile(
        path.join(renamedPath, "release-settings.toml"),
        "utf8",
      ),
    ) as Record<string, any>;
    assert.equal(
      settingsToml.release_reference.release_id,
      fixture.newId,
    );
    assert.equal(settingsToml.settings.unknown_value, "preserved");

    const trackToml = parse(
      await readFile(
        path.join(
          renamedPath,
          "tracks",
          "artist_01_song",
          "track.toml",
        ),
        "utf8",
      ),
    ) as Record<string, any>;
    assert.equal(
      trackToml.release_reference.release_id,
      fixture.newId,
    );
    assert.equal(trackToml.track.id, "artist_01_song");

    const ingestReceipt = JSON.parse(
      await readFile(
        path.join(renamedPath, "ingest-receipt.json"),
        "utf8",
      ),
    ) as Record<string, any>;
    assert.equal(ingestReceipt.release.id, fixture.newId);
    assert.equal(ingestReceipt.release.title, "Indoor Lightning");
    assert.equal(
      ingestReceipt.release.relativePath,
      `releases/${fixture.newId}`,
    );
    assert.equal(
      ingestReceipt.tracks[0].destinationRelativePath,
      `releases/${fixture.newId}/tracks/artist_01_song/audio-master.m4a`,
    );

    assert.deepEqual(
      await readFile(
        path.join(
          renamedPath,
          "tracks",
          "artist_01_song",
          "audio-master.m4a",
        ),
      ),
      fixture.masterBytes,
    );
    assert.ok(receipt.manifestRelativePath);
  } finally {
    await rm(fixture.temporaryRoot, {
      recursive: true,
      force: true,
    });
  }
});

test("blocks an existing release directory target without overwriting", async () => {
  const fixture = await createFixture();

  try {
    const targetPath = path.join(
      fixture.mediaRoot,
      "releases",
      fixture.newId,
    );
    await mkdir(targetPath, { recursive: true });
    await writeFile(path.join(targetPath, "keep.txt"), "keep");

    const plan = await buildReleaseRenamePlan(
      fixture.mediaRoot,
      fixture.release,
      fixture.newId,
      "Indoor Lightning",
    );

    assert.equal(plan.summary.blockedCount, 1);
    await assert.rejects(
      executeReleaseRenamePlan(
        fixture.mediaRoot,
        fixture.release,
        fixture.newId,
        "Indoor Lightning",
        releaseRenameConfirmation,
        plan.fingerprint,
      ),
      /blocked/i,
    );
    assert.equal(
      await readFile(path.join(targetPath, "keep.txt"), "utf8"),
      "keep",
    );
  } finally {
    await rm(fixture.temporaryRoot, {
      recursive: true,
      force: true,
    });
  }
});

test("updates the authored title without moving a custom release directory", async () => {
  const fixture = await createFixture();

  try {
    const plan = await buildReleaseRenamePlan(
      fixture.mediaRoot,
      fixture.release,
      fixture.oldId,
      "Indoor Lightning",
    );

    assert.equal(plan.summary.blockedCount, 0);
    assert.equal(plan.summary.renameCount, 0);
    assert.ok(plan.summary.updateCount >= 2);

    const receipt = await executeReleaseRenamePlan(
      fixture.mediaRoot,
      fixture.release,
      fixture.oldId,
      "Indoor Lightning",
      releaseRenameConfirmation,
      plan.fingerprint,
    );

    assert.equal(receipt.previousReleaseId, fixture.oldId);
    assert.equal(receipt.releaseId, fixture.oldId);
    assert.equal(
      existsSync(
        path.join(fixture.mediaRoot, "releases", fixture.oldId),
      ),
      true,
    );

    const releaseToml = parse(
      await readFile(
        path.join(
          fixture.mediaRoot,
          "releases",
          fixture.oldId,
          "release.toml",
        ),
        "utf8",
      ),
    ) as Record<string, any>;
    assert.equal(releaseToml.release.id, fixture.oldId);
    assert.equal(releaseToml.release.title, "Indoor Lightning");
    assert.match(
      receipt.manifestRelativePath ?? "",
      /^\.metadata-editor-operations\/release-rename-/,
    );
  } finally {
    await rm(fixture.temporaryRoot, {
      recursive: true,
      force: true,
    });
  }
});
