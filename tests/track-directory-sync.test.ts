import assert from "node:assert/strict";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parse } from "smol-toml";

import {
  buildTrackDirectoryRenamePlan,
  executeTrackDirectoryRenamePlan,
  trackDirectoryRenameConfirmation,
} from "../server/track-directory-sync.js";
import {
  scanReleaseById,
} from "../server/scanner.js";

async function withLibrary(
  callback: (mediaRoot: string) => Promise<void>,
): Promise<void> {
  const mediaRoot = await mkdtemp(
    path.join(os.tmpdir(), "track-directory-sync-"),
  );

  try {
    await mkdir(
      path.join(mediaRoot, "releases"),
      { recursive: true },
    );
    await callback(mediaRoot);
  } finally {
    await rm(mediaRoot, {
      recursive: true,
      force: true,
    });
  }
}

async function createTrack(
  mediaRoot: string,
  trackId: string,
  trackNumber: number | null,
  marker: string,
): Promise<void> {
  const trackRoot = path.join(
    mediaRoot,
    "releases",
    "test-release",
    "tracks",
    trackId,
  );
  await mkdir(trackRoot, { recursive: true });
  await writeFile(
    path.join(trackRoot, "marker.txt"),
    marker,
  );

  if (trackNumber === null) {
    return;
  }

  await writeFile(
    path.join(trackRoot, "track.toml"),
    [
      "[track]",
      `id = ${JSON.stringify(trackId)}`,
      "",
      "[track.numbering]",
      `track_number = ${trackNumber}`,
      "disc_number = 1",
      "",
    ].join("\n"),
  );
  await writeFile(
    path.join(trackRoot, "track-credits.toml"),
    [
      "[track_reference]",
      `track_id = ${JSON.stringify(trackId)}`,
      "",
    ].join("\n"),
  );
  await writeFile(
    path.join(
      trackRoot,
      "track-production-notes.toml",
    ),
    [
      "[track_reference]",
      `track_id = ${JSON.stringify(trackId)}`,
      "",
    ].join("\n"),
  );
}

async function createReleaseRoot(
  mediaRoot: string,
): Promise<void> {
  await mkdir(
    path.join(
      mediaRoot,
      "releases",
      "test-release",
      "tracks",
    ),
    { recursive: true },
  );
}

test("renames all changed track directories through a guarded two-phase operation", async () => {
  await withLibrary(async (mediaRoot) => {
    await createReleaseRoot(mediaRoot);
    await createTrack(
      mediaRoot,
      "artist_01_first",
      2,
      "first asset",
    );
    await createTrack(
      mediaRoot,
      "artist_02_second",
      1,
      "second asset",
    );

    const release = await scanReleaseById(
      mediaRoot,
      "test-release",
    );
    assert.ok(release);

    const plan = await buildTrackDirectoryRenamePlan(
      mediaRoot,
      release,
    );
    assert.equal(plan.summary.renameCount, 2);
    assert.equal(plan.summary.blockedCount, 0);

    const receipt = await executeTrackDirectoryRenamePlan(
      mediaRoot,
      release,
      trackDirectoryRenameConfirmation,
      plan.fingerprint,
    );
    assert.equal(receipt.renamedCount, 2);
    assert.ok(receipt.manifestRelativePath);

    const firstTarget = path.join(
      mediaRoot,
      "releases/test-release/tracks/artist_02_first",
    );
    const secondTarget = path.join(
      mediaRoot,
      "releases/test-release/tracks/artist_01_second",
    );
    assert.equal(
      await readFile(path.join(firstTarget, "marker.txt"), "utf8"),
      "first asset",
    );
    assert.equal(
      await readFile(path.join(secondTarget, "marker.txt"), "utf8"),
      "second asset",
    );

    const firstTrack = parse(
      await readFile(
        path.join(firstTarget, "track.toml"),
        "utf8",
      ),
    ) as Record<string, any>;
    const firstCredits = parse(
      await readFile(
        path.join(firstTarget, "track-credits.toml"),
        "utf8",
      ),
    ) as Record<string, any>;
    assert.equal(
      firstTrack.track.id,
      "artist_02_first",
    );
    assert.equal(
      firstCredits.track_reference.track_id,
      "artist_02_first",
    );

    await assert.rejects(
      access(
        path.join(
          mediaRoot,
          "releases/test-release/tracks/artist_01_first",
        ),
      ),
    );

    const operationEntries = await readdir(
      path.join(
        mediaRoot,
        "releases/test-release/.metadata-editor-operations",
      ),
    );
    assert.equal(operationEntries.length, 1);
    const manifest = JSON.parse(
      await readFile(
        path.join(
          mediaRoot,
          "releases/test-release/.metadata-editor-operations",
          operationEntries[0] ?? "",
          "manifest.json",
        ),
        "utf8",
      ),
    ) as { status: string };
    assert.equal(manifest.status, "completed");
    await assert.rejects(
      access(
        path.join(
          mediaRoot,
          "releases/test-release/tracks/.metadata-editor-track-directory-rename.lock",
        ),
      ),
    );
  });
});

test("blocks a matching target without overwriting its files", async () => {
  await withLibrary(async (mediaRoot) => {
    await createReleaseRoot(mediaRoot);
    await createTrack(
      mediaRoot,
      "artist_01_first",
      2,
      "moving asset",
    );
    await createTrack(
      mediaRoot,
      "artist_02_first",
      null,
      "protected asset",
    );

    const release = await scanReleaseById(
      mediaRoot,
      "test-release",
    );
    assert.ok(release);

    const plan = await buildTrackDirectoryRenamePlan(
      mediaRoot,
      release,
    );
    assert.ok(plan.summary.blockedCount > 0);
    assert.match(
      plan.items.find(
        (item) => item.trackId === "artist_01_first",
      )?.reason ?? "",
      /target directory|Multiple tracks/i,
    );

    await assert.rejects(
      executeTrackDirectoryRenamePlan(
        mediaRoot,
        release,
        trackDirectoryRenameConfirmation,
        plan.fingerprint,
      ),
      /blocked/i,
    );

    assert.equal(
      await readFile(
        path.join(
          mediaRoot,
          "releases/test-release/tracks/artist_02_first/marker.txt",
        ),
        "utf8",
      ),
      "protected asset",
    );
  });
});

test("leaves custom unnumbered directory IDs unchanged without blocking other work", async () => {
  await withLibrary(async (mediaRoot) => {
    await createReleaseRoot(mediaRoot);
    await createTrack(
      mediaRoot,
      "custom-track-directory",
      2,
      "custom asset",
    );

    const release = await scanReleaseById(
      mediaRoot,
      "test-release",
    );
    assert.ok(release);

    const plan = await buildTrackDirectoryRenamePlan(
      mediaRoot,
      release,
    );
    assert.equal(plan.summary.blockedCount, 0);
    assert.equal(plan.summary.renameCount, 0);
    assert.match(
      plan.items[0]?.reason ?? "",
      /left unchanged for manual review/i,
    );
  });
});

test("requires the explicit rename confirmation phrase", async () => {
  await withLibrary(async (mediaRoot) => {
    await createReleaseRoot(mediaRoot);
    await createTrack(
      mediaRoot,
      "artist_01_first",
      2,
      "asset",
    );
    const release = await scanReleaseById(
      mediaRoot,
      "test-release",
    );
    assert.ok(release);

    await assert.rejects(
      executeTrackDirectoryRenamePlan(
        mediaRoot,
        release,
        "YES",
        "unused-for-invalid-confirmation",
      ),
      /RENAME_TRACK_DIRECTORIES/,
    );
  });
});

test("rejects a stale plan fingerprint before moving directories", async () => {
  await withLibrary(async (mediaRoot) => {
    await createReleaseRoot(mediaRoot);
    await createTrack(
      mediaRoot,
      "artist_01_first",
      2,
      "asset",
    );
    const release = await scanReleaseById(
      mediaRoot,
      "test-release",
    );
    assert.ok(release);

    await assert.rejects(
      executeTrackDirectoryRenamePlan(
        mediaRoot,
        release,
        trackDirectoryRenameConfirmation,
        "stale-fingerprint",
      ),
      /plan changed/i,
    );

    assert.equal(
      await readFile(
        path.join(
          mediaRoot,
          "releases/test-release/tracks/artist_01_first/marker.txt",
        ),
        "utf8",
      ),
      "asset",
    );
  });
});
