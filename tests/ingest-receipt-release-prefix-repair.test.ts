import assert from "node:assert/strict";
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
import { createHash } from "node:crypto";

import {
  buildReceiptReleasePrefixRepairPlan,
  executeReceiptReleasePrefixRepair,
  receiptReleasePrefixRepairConfirmation,
} from "../scripts/repair-ingest-receipt-release-prefix.js";

function hash(value: Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

test("repairs one verified stale release prefix without changing media bytes", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "receipt-prefix-repair-"),
  );
  const releaseId = "2016-10-23_indoor-lightning";
  const staleId = "2016-10-23_indoor-lightning-ep";
  const releaseRoot = path.join(root, "releases", releaseId);
  const trackRoot = path.join(releaseRoot, "tracks", "artist_01_song");
  const artworkRoot = path.join(releaseRoot, "artwork", "front");
  const audio = Buffer.from("canonical audio bytes");
  const artwork = Buffer.from("canonical artwork bytes");

  try {
    await mkdir(trackRoot, { recursive: true });
    await mkdir(artworkRoot, { recursive: true });
    await writeFile(path.join(trackRoot, "audio-master.m4a"), audio);
    await writeFile(path.join(artworkRoot, "artwork-master.png"), artwork);

    const receipt = {
      schema: {
        name: "metadata-editor-ingest-receipt",
        version: 2,
      },
      release: {
        id: releaseId,
        relativePath: `releases/${releaseId}`,
        title: "Indoor Lightning",
      },
      tracks: [
        {
          id: "artist_01_song",
          destinationRelativePath:
            `releases/${staleId}/tracks/artist_01_song/audio-master.m4a`,
        },
      ],
      copies: [
        {
          destinationRelativePath:
            `releases/${staleId}/tracks/artist_01_song/audio-master.m4a`,
          bytes: audio.length,
          sourceSha256: hash(audio),
        },
        {
          destinationRelativePath:
            `releases/${staleId}/artwork/front/artwork-master.png`,
          bytes: artwork.length,
          sourceSha256: hash(artwork),
        },
      ],
      copyReceipts: [
        {
          destinationRelativePath:
            `releases/${staleId}/tracks/artist_01_song/audio-master.m4a`,
          bytes: audio.length,
          destinationSha256: hash(audio),
        },
      ],
    };

    await writeFile(
      path.join(releaseRoot, "ingest-receipt.json"),
      `${JSON.stringify(receipt, null, 2)}\n`,
    );

    const plan = await buildReceiptReleasePrefixRepairPlan(
      root,
      releaseId,
    );

    assert.equal(
      plan.staleReleasePrefix,
      `releases/${staleId}`,
    );
    assert.equal(plan.occurrenceCount, 4);
    assert.equal(plan.uniqueDestinationCount, 2);
    assert.equal(plan.verifiedDestinationCount, 2);
    assert.deepEqual(plan.blockedReasons, []);

    const result = await executeReceiptReleasePrefixRepair(
      root,
      releaseId,
      receiptReleasePrefixRepairConfirmation,
      plan.fingerprint,
    );

    assert.equal(result.rewrittenCount, 4);

    const updated = JSON.parse(
      await readFile(
        path.join(releaseRoot, "ingest-receipt.json"),
        "utf8",
      ),
    ) as typeof receipt;

    assert.equal(
      updated.tracks[0].destinationRelativePath,
      `releases/${releaseId}/tracks/artist_01_song/audio-master.m4a`,
    );
    assert.equal(
      updated.copies[1].destinationRelativePath,
      `releases/${releaseId}/artwork/front/artwork-master.png`,
    );
    assert.deepEqual(
      await readFile(path.join(trackRoot, "audio-master.m4a")),
      audio,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("blocks repair when canonical bytes do not match receipt evidence", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "receipt-prefix-repair-blocked-"),
  );
  const releaseId = "release-current";
  const staleId = "release-old";
  const releaseRoot = path.join(root, "releases", releaseId);
  const trackRoot = path.join(releaseRoot, "tracks", "track-01");

  try {
    await mkdir(trackRoot, { recursive: true });
    await writeFile(
      path.join(trackRoot, "audio-master.wav"),
      Buffer.from("different bytes"),
    );
    await writeFile(
      path.join(releaseRoot, "ingest-receipt.json"),
      `${JSON.stringify({
        release: {
          id: releaseId,
          relativePath: `releases/${releaseId}`,
        },
        copies: [
          {
            destinationRelativePath:
              `releases/${staleId}/tracks/track-01/audio-master.wav`,
            bytes: 999,
          },
        ],
      }, null, 2)}\n`,
    );

    const plan = await buildReceiptReleasePrefixRepairPlan(
      root,
      releaseId,
    );

    assert.ok(plan.blockedReasons.some((item) =>
      item.includes("Size mismatch")
    ));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
