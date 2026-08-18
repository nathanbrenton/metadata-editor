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

import {
  executeLegacyArtworkReceiptRepair,
  executeLegacyIngestReceiptMigration,
  inspectIngestStagingTarget,
  prepareLegacyArtworkReceiptRepair,
  prepareLegacyIngestReceiptMigration,
} from "../server/ingest-builder.js";

async function createLegacyRelease() {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "metadata-editor-legacy-receipt-"),
  );
  const mediaRoot = path.join(root, "media-library");
  const releaseId = "legacy-release";
  const releaseRoot = path.join(
    mediaRoot,
    "releases",
    releaseId,
  );
  const trackId = "artist_01_song";
  const trackRoot = path.join(
    releaseRoot,
    "tracks",
    trackId,
  );

  await mkdir(
    path.join(releaseRoot, "artwork", "front"),
    { recursive: true },
  );
  await mkdir(trackRoot, { recursive: true });

  await writeFile(
    path.join(releaseRoot, "release.toml"),
    [
      "[schema]",
      'name = "audio-release-metadata"',
      "version = 1",
      "",
      "[release]",
      `id = "${releaseId}"`,
      'title = "Legacy Release"',
      'type = "album"',
      "",
      "[release.primary_artist]",
      'name = "Legacy Artist"',
      "",
      "[release.dates]",
      'release = "2020-01-01"',
      "",
      "[[release.artwork]]",
      'id = "front"',
      'role = "front_cover"',
      "primary = true",
      'master_path = "artwork/front/artwork-master.tif"',
      'web_path = ""',
      'embedded_path = ""',
      "",
    ].join("\n"),
  );
  await writeFile(
    path.join(releaseRoot, "release-settings.toml"),
    `[release_reference]\nrelease_id = "${releaseId}"\n`,
  );
  await writeFile(
    path.join(releaseRoot, "release-production-notes.toml"),
    `[release_reference]\nrelease_id = "${releaseId}"\n`,
  );
  await writeFile(
    path.join(releaseRoot, "artwork", "front", "artwork-master.tif"),
    Buffer.from("legacy artwork"),
  );

  await writeFile(
    path.join(trackRoot, "track.toml"),
    [
      "[release_reference]",
      `release_id = "${releaseId}"`,
      "",
      "[track]",
      `id = "${trackId}"`,
      'title = "Song"',
      'version = ""',
      "",
      "[track.primary_artist]",
      'name = "Legacy Artist"',
      "",
      "[track.numbering]",
      "track_number = 1",
      "track_total = 1",
      "disc_number = 1",
      "disc_total = 1",
      "",
      "[track.assets]",
      'audio_master = "audio-master.wav"',
      'audio_playback = ""',
      'waveform_peaks = ""',
      "",
      "[track.assets.artwork]",
      'master = ""',
      'web = ""',
      'embedded = ""',
      "",
    ].join("\n"),
  );
  await writeFile(
    path.join(trackRoot, "track-credits.toml"),
    `[track_reference]\ntrack_id = "${trackId}"\n`,
  );
  await writeFile(
    path.join(trackRoot, "track-production-notes.toml"),
    `[track_reference]\ntrack_id = "${trackId}"\n`,
  );
  await writeFile(
    path.join(trackRoot, "audio-master.wav"),
    Buffer.from("legacy audio"),
  );

  return {
    root,
    mediaRoot,
    releaseId,
    releaseRoot,
    trackId,
  };
}

test("staging exposes a guarded migration plan for a canonical legacy release without ingest-receipt.json", async (t) => {
  const fixture = await createLegacyRelease();
  t.after(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  const status = await inspectIngestStagingTarget(
    fixture.mediaRoot,
    fixture.releaseId,
  );

  assert.equal(status.exists, true);
  assert.equal(status.existingRelease?.title, "Legacy Release");
  assert.equal(status.existingTracks.length, 1);
  assert.equal(status.existingTracks[0]?.id, fixture.trackId);
  assert.equal(status.existingArtwork.length, 1);
  assert.equal(status.existingArtwork[0]?.role, "front_cover");
  assert.equal(status.legacyReceiptMigration?.required, true);
  assert.equal(status.legacyReceiptMigration?.trackCount, 1);
  assert.equal(status.legacyReceiptMigration?.copyCount, 2);

  const plan = await prepareLegacyIngestReceiptMigration(
    fixture.mediaRoot,
    fixture.releaseId,
  );
  assert.equal(plan.fingerprint, status.legacyReceiptMigration?.fingerprint);

  await executeLegacyIngestReceiptMigration(
    fixture.mediaRoot,
    fixture.releaseId,
    plan.fingerprint,
    plan.confirmationPhrase,
  );

  const receipt = JSON.parse(
    await readFile(
      path.join(fixture.releaseRoot, "ingest-receipt.json"),
      "utf8",
    ),
  ) as {
    schema?: { version?: number };
    migration?: { kind?: string };
    tracks?: Array<{ id?: string }>;
    copies?: Array<{
      destinationRelativePath?: string;
      sourceSha256?: string;
    }>;
  };

  assert.equal(receipt.schema?.version, 3);
  assert.equal(receipt.migration?.kind, "legacy-library-baseline");
  assert.equal(receipt.tracks?.[0]?.id, fixture.trackId);
  assert.equal(receipt.copies?.length, 2);
  assert.ok(receipt.copies?.every((copy) => copy.sourceSha256?.length === 64));

  const migratedStatus = await inspectIngestStagingTarget(
    fixture.mediaRoot,
    fixture.releaseId,
  );
  assert.equal(migratedStatus.legacyReceiptMigration, undefined);
  assert.equal(migratedStatus.existingTracks.length, 1);
  assert.equal(migratedStatus.existingArtwork.length, 1);
});

test("legacy receipt migration fingerprint invalidates if canonical Library bytes change after review", async (t) => {
  const fixture = await createLegacyRelease();
  t.after(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  const plan = await prepareLegacyIngestReceiptMigration(
    fixture.mediaRoot,
    fixture.releaseId,
  );

  await writeFile(
    path.join(
      fixture.releaseRoot,
      "artwork",
      "front",
      "artwork-master.tif",
    ),
    Buffer.from("changed after review"),
  );

  await assert.rejects(
    executeLegacyIngestReceiptMigration(
      fixture.mediaRoot,
      fixture.releaseId,
      plan.fingerprint,
      plan.confirmationPhrase,
    ),
    /changed after migration review/i,
  );
});

test("legacy receipt migration discovers canonical artwork-master files even when old release metadata does not enumerate them", async (t) => {
  const fixture = await createLegacyRelease();
  t.after(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  const releaseTomlPath = path.join(fixture.releaseRoot, "release.toml");
  const original = await readFile(releaseTomlPath, "utf8");
  await writeFile(
    releaseTomlPath,
    original.replace(
      /\n\[\[release\.artwork\]\][\s\S]*?embedded_path = ""\n/,
      "\n",
    ),
  );

  const plan = await prepareLegacyIngestReceiptMigration(
    fixture.mediaRoot,
    fixture.releaseId,
  );
  assert.equal(plan.copyCount, 2);

  await executeLegacyIngestReceiptMigration(
    fixture.mediaRoot,
    fixture.releaseId,
    plan.fingerprint,
    plan.confirmationPhrase,
  );

  const status = await inspectIngestStagingTarget(
    fixture.mediaRoot,
    fixture.releaseId,
  );
  assert.equal(status.existingArtwork.length, 1);
  assert.equal(status.existingArtwork[0]?.role, "front_cover");
});

test("already-migrated legacy receipts can baseline canonical artwork entries that an older migration omitted", async (t) => {
  const fixture = await createLegacyRelease();
  t.after(async () => {
    await rm(fixture.root, { recursive: true, force: true });
  });

  const migration = await prepareLegacyIngestReceiptMigration(
    fixture.mediaRoot,
    fixture.releaseId,
  );
  await executeLegacyIngestReceiptMigration(
    fixture.mediaRoot,
    fixture.releaseId,
    migration.fingerprint,
    migration.confirmationPhrase,
  );

  const receiptPath = path.join(fixture.releaseRoot, "ingest-receipt.json");
  const receipt = JSON.parse(await readFile(receiptPath, "utf8")) as {
    copies: Array<{ mediaKind?: string }>;
    copyReceipts?: Array<{ mediaKind?: string }>;
  };
  receipt.copies = receipt.copies.filter(
    (copy) => copy.mediaKind !== "image",
  );
  receipt.copyReceipts = receipt.copyReceipts?.filter(
    (copy) => copy.mediaKind !== "image",
  );
  await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);

  const statusBefore = await inspectIngestStagingTarget(
    fixture.mediaRoot,
    fixture.releaseId,
  );
  assert.equal(statusBefore.existingArtwork.length, 0);
  assert.equal(
    statusBefore.legacyArtworkReceiptRepair?.artworkCount,
    1,
  );

  const repair = await prepareLegacyArtworkReceiptRepair(
    fixture.mediaRoot,
    fixture.releaseId,
  );
  assert.ok(repair);
  assert.equal(repair?.artworkCount, 1);

  await executeLegacyArtworkReceiptRepair(
    fixture.mediaRoot,
    fixture.releaseId,
    repair!.fingerprint,
    repair!.confirmationPhrase,
  );

  const statusAfter = await inspectIngestStagingTarget(
    fixture.mediaRoot,
    fixture.releaseId,
  );
  assert.equal(statusAfter.legacyArtworkReceiptRepair, undefined);
  assert.equal(statusAfter.existingArtwork.length, 1);
  assert.equal(statusAfter.existingArtwork[0]?.role, "front_cover");
});
