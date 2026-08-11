import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  auditMediaLibraryFileSpec,
} from "../server/media-file-spec-audit.js";

test("audits preferred, compatible, unsupported, and non-canonical master files read-only", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "metadata-file-spec-"),
  );
  const release = path.join(
    root,
    "releases",
    "2026-01-01_example",
  );
  const track = path.join(release, "tracks", "track_01");

  await mkdir(
    path.join(release, "artwork", "front"),
    { recursive: true },
  );
  await mkdir(track, { recursive: true });
  await mkdir(
    path.join(release, "videos", "clip"),
    { recursive: true },
  );

  await writeFile(
    path.join(track, "audio-master.wav"),
    "audio",
  );
  await writeFile(
    path.join(
      release,
      "artwork",
      "front",
      "artwork-master.webp",
    ),
    "art",
  );
  await writeFile(
    path.join(
      release,
      "videos",
      "clip",
      "video-master.xyz",
    ),
    "video",
  );
  await writeFile(
    path.join(track, "audio-master.AIFF"),
    "audio-2",
  );

  const result = await auditMediaLibraryFileSpec(
    root,
    "2026-01-01_example",
  );

  assert.equal(result.summary.total, 4);
  assert.equal(result.summary.preferred, 2);
  assert.equal(result.summary.compatible, 1);
  assert.equal(result.summary.unsupported, 1);
  assert.equal(result.summary.nonCanonicalNames, 1);
  assert.equal(
    result.summary.roles["audio-master"].total,
    2,
  );
  assert.equal(
    result.summary.roles["artwork-master"].compatible,
    1,
  );
  assert.equal(
    result.summary.roles["video-master"].unsupported,
    1,
  );

  const uppercase = result.items.find(
    (item) =>
      item.relativePath.endsWith("audio-master.AIFF"),
  );

  assert.equal(uppercase?.canonicalName, false);
  assert.equal(
    uppercase?.canonicalFilename,
    "audio-master.aiff",
  );
});
