import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
  buildIngestReceiptTrackRepairPlan,
  buildTrackDirectoryRenamePlan,
  executeIngestReceiptTrackRepair,
  executeTrackDirectoryRenamePlan,
  ingestReceiptTrackRepairConfirmation,
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
  await writeFile(
    path.join(trackRoot, "audio-master.m4a"),
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

async function writeReceipt(
  mediaRoot: string,
  tracks: Array<{
    id: string;
    number: number;
    marker: string;
  }>,
): Promise<void> {
  const releaseRelativePath = "releases/test-release";
  const copies = tracks.map((track) => ({
    sourceRelativePath:
      `source/${track.id}/audio-master.m4a`,
    destinationRelativePath:
      `${releaseRelativePath}/tracks/${track.id}/audio-master.m4a`,
    mediaKind: "audio",
    logicalRoles: [
      "audio-master",
      "audio-player-source",
    ],
    bytes: Buffer.byteLength(track.marker),
    sourceSha256: createHash("sha256")
      .update(track.marker)
      .digest("hex"),
  }));

  await writeFile(
    path.join(
      mediaRoot,
      releaseRelativePath,
      "ingest-receipt.json",
    ),
    `${JSON.stringify(
      {
        schema: {
          name: "metadata-editor-ingest-receipt",
          version: 3,
        },
        release: {
          id: "test-release",
          relativePath: releaseRelativePath,
        },
        tracks: tracks.map((track) => ({
          id: track.id,
          number: track.number,
          sourceRelativePath:
            `source/${track.id}/audio-master.m4a`,
          destinationRelativePath:
            `${releaseRelativePath}/tracks/${track.id}/audio-master.m4a`,
        })),
        videos: [
          {
            id: "video-1",
            relatedTrackId: tracks[0]?.id ?? "",
            destinationRelativePath:
              `${releaseRelativePath}/videos/video-1/video-master.mov`,
          },
        ],
        copies,
        copyReceipts: copies.map((copy) => ({
          ...copy,
          destinationSha256: copy.sourceSha256,
        })),
        updates: [
          {
            addedTrackIds: tracks.map((track) => track.id),
            trackOrder: tracks.map((track) => ({
              id: track.id,
              number: track.number,
            })),
          },
        ],
      },
      null,
      2,
    )}\n`,
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
    await writeReceipt(mediaRoot, [
      {
        id: "artist_01_first",
        number: 1,
        marker: "first asset",
      },
      {
        id: "artist_02_second",
        number: 2,
        marker: "second asset",
      },
    ]);

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
    assert.equal(receipt.ingestReceiptUpdated, true);
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

    const updatedReceipt = JSON.parse(
      await readFile(
        path.join(
          mediaRoot,
          "releases/test-release/ingest-receipt.json",
        ),
        "utf8",
      ),
    ) as Record<string, any>;
    assert.deepEqual(
      updatedReceipt.tracks.map(
        (track: Record<string, any>) => track.id,
      ),
      ["artist_02_first", "artist_01_second"],
    );
    assert.equal(
      updatedReceipt.copies[0].destinationRelativePath,
      "releases/test-release/tracks/artist_02_first/audio-master.m4a",
    );
    assert.equal(
      updatedReceipt.copyReceipts[1].destinationRelativePath,
      "releases/test-release/tracks/artist_02_second/audio-master.m4a",
    );
    assert.deepEqual(
      updatedReceipt.tracks.map(
        (track: Record<string, any>) => track.number,
      ),
      [2, 1],
    );
    assert.equal(
      updatedReceipt.videos[0].relatedTrackId,
      "artist_02_first",
    );
    assert.deepEqual(
      updatedReceipt.updates[0].trackOrder.map(
        (track: Record<string, any>) => track.id,
      ),
      ["artist_01_first", "artist_02_second"],
    );
    assert.deepEqual(
      updatedReceipt.updates[0].trackOrder.map(
        (track: Record<string, any>) => track.number,
      ),
      [1, 2],
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

test("repairs a stale ingest receipt by matching canonical audio hashes to current Library tracks", async () => {
  await withLibrary(async (mediaRoot) => {
    await createReleaseRoot(mediaRoot);
    await createTrack(
      mediaRoot,
      "artist_01_first-renamed",
      1,
      "first asset",
    );
    await createTrack(
      mediaRoot,
      "artist_02_second-renamed",
      2,
      "second asset",
    );
    await writeReceipt(mediaRoot, [
      {
        id: "artist_01_first",
        number: 2,
        marker: "first asset",
      },
      {
        id: "artist_02_second",
        number: 1,
        marker: "second asset",
      },
    ]);

    const release = await scanReleaseById(
      mediaRoot,
      "test-release",
    );
    assert.ok(release);

    const plan = await buildIngestReceiptTrackRepairPlan(
      mediaRoot,
      release,
    );
    assert.deepEqual(plan.blockedReasons, []);
    assert.equal(plan.items.length, 2);
    assert.equal(plan.verifiedCopyCount, 2);
    assert.deepEqual(
      plan.items.map((item) => ({
        previousTrackId: item.previousTrackId,
        previousTrackNumber: item.previousTrackNumber,
        trackId: item.trackId,
        trackNumber: item.trackNumber,
      })),
      [
        {
          previousTrackId: "artist_01_first",
          previousTrackNumber: 2,
          trackId: "artist_01_first-renamed",
          trackNumber: 1,
        },
        {
          previousTrackId: "artist_02_second",
          previousTrackNumber: 1,
          trackId: "artist_02_second-renamed",
          trackNumber: 2,
        },
      ],
    );

    const receipt = await executeIngestReceiptTrackRepair(
      mediaRoot,
      release,
      ingestReceiptTrackRepairConfirmation,
      plan.fingerprint,
    );
    assert.equal(receipt.repairedCount, 2);
    assert.ok(receipt.manifestRelativePath);

    const repaired = JSON.parse(
      await readFile(
        path.join(
          mediaRoot,
          "releases/test-release/ingest-receipt.json",
        ),
        "utf8",
      ),
    ) as Record<string, any>;
    assert.deepEqual(
      repaired.tracks.map(
        (track: Record<string, any>) => track.id,
      ),
      [
        "artist_01_first-renamed",
        "artist_02_second-renamed",
      ],
    );
    assert.deepEqual(
      repaired.tracks.map(
        (track: Record<string, any>) => track.number,
      ),
      [1, 2],
    );
    assert.equal(
      repaired.copies[0].destinationRelativePath,
      "releases/test-release/tracks/artist_01_first-renamed/audio-master.m4a",
    );
    assert.deepEqual(
      repaired.updates[0].trackOrder.map(
        (track: Record<string, any>) => track.number,
      ),
      [2, 1],
    );
  });
});

test("blocks ingest receipt repair when no current canonical master matches the recorded content hash", async () => {
  await withLibrary(async (mediaRoot) => {
    await createReleaseRoot(mediaRoot);
    await createTrack(
      mediaRoot,
      "artist_02_first-renamed",
      2,
      "changed! bytes",
    );
    await writeReceipt(mediaRoot, [
      {
        id: "artist_01_first",
        number: 2,
        marker: "expected bytes",
      },
    ]);

    const release = await scanReleaseById(
      mediaRoot,
      "test-release",
    );
    assert.ok(release);

    const plan = await buildIngestReceiptTrackRepairPlan(
      mediaRoot,
      release,
    );
    assert.equal(plan.items.length, 0);
    assert.match(
      plan.blockedReasons.join(" "),
      /no current Library canonical audio master matches the recorded SHA-256/i,
    );

    await assert.rejects(
      executeIngestReceiptTrackRepair(
        mediaRoot,
        release,
        ingestReceiptTrackRepairConfirmation,
        plan.fingerprint,
      ),
      /blocked/i,
    );
  });
});

test("blocks ingest receipt repair when identical canonical audio makes content identity ambiguous", async () => {
  await withLibrary(async (mediaRoot) => {
    await createReleaseRoot(mediaRoot);
    await createTrack(
      mediaRoot,
      "artist_01_duplicate-a",
      1,
      "same canonical bytes",
    );
    await createTrack(
      mediaRoot,
      "artist_02_duplicate-b",
      2,
      "same canonical bytes",
    );
    await writeReceipt(mediaRoot, [
      {
        id: "artist_09_historical",
        number: 9,
        marker: "same canonical bytes",
      },
    ]);

    const release = await scanReleaseById(
      mediaRoot,
      "test-release",
    );
    assert.ok(release);

    const plan = await buildIngestReceiptTrackRepairPlan(
      mediaRoot,
      release,
    );
    assert.equal(plan.items.length, 0);
    assert.match(
      plan.blockedReasons.join(" "),
      /multiple current Library tracks share the recorded canonical audio SHA-256/i,
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
