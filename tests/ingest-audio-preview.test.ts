import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  realpath,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  resolveIngestAudioPreviewSource,
} from "../server/ingest-audio.js";
import {
  buildIngestAudioPreviewUrl,
} from "../src/ingest-audio-preview.js";

test("builds a confined ingest audio preview URL", () => {
  assert.equal(
    buildIngestAudioPreviewUrl(
      "candidate/Track 01.mp3",
      "2026-07-25T12:00:00.000Z",
    ),
    "/api/ingest/audio-preview?path=candidate%2FTrack+01.mp3&version=2026-07-25T12%3A00%3A00.000Z",
  );
});

test("resolves a regular recognized audio source inside the ingest root", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "metadata-ingest-audio-"),
  );
  const candidate = path.join(root, "candidate");
  const source = path.join(candidate, "track.mp3");

  await mkdir(candidate);
  await writeFile(source, Buffer.from([1, 2, 3]));

  const resolved =
    await resolveIngestAudioPreviewSource(
      root,
      "candidate/track.mp3",
    );

  assert.equal(
    resolved.canonicalPath,
    await realpath(source),
  );
  assert.equal(resolved.extension, ".mp3");
  assert.equal(resolved.sizeBytes, 3);
});

test("rejects traversal, symbolic links, empty files, and non-audio types", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "metadata-ingest-audio-"),
  );
  const candidate = path.join(root, "candidate");
  const target = path.join(candidate, "target.mp3");

  await mkdir(candidate);
  await writeFile(target, Buffer.from([1]));
  await symlink(target, path.join(candidate, "linked.mp3"));
  await writeFile(path.join(candidate, "empty.mp3"), "");
  await writeFile(path.join(candidate, "notes.txt"), "notes");

  await assert.rejects(
    resolveIngestAudioPreviewSource(
      root,
      "../outside.mp3",
    ),
    /escapes configured ingest root/,
  );
  await assert.rejects(
    resolveIngestAudioPreviewSource(
      root,
      "candidate/linked.mp3",
    ),
    /Symbolic links cannot be previewed/,
  );
  await assert.rejects(
    resolveIngestAudioPreviewSource(
      root,
      "candidate/empty.mp3",
    ),
    /source is empty/,
  );
  await assert.rejects(
    resolveIngestAudioPreviewSource(
      root,
      "candidate/notes.txt",
    ),
    /not a recognized audio preview type/,
  );
});
