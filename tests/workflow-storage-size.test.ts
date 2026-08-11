import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  directorySizeBytes,
} from "../server/workflow-locations.js";

test("totals regular files recursively while ignoring symbolic links", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "metadata-storage-size-"),
  );
  const nested = path.join(root, "nested");
  await mkdir(nested);
  await writeFile(path.join(root, "one.bin"), Buffer.alloc(5));
  await writeFile(path.join(nested, "two.bin"), Buffer.alloc(7));
  await symlink(
    path.join(root, "one.bin"),
    path.join(nested, "linked.bin"),
  );

  assert.equal(await directorySizeBytes(root), 12);
});

test("reports a missing published tree as zero bytes", async () => {
  const root = path.join(
    os.tmpdir(),
    `metadata-missing-${crypto.randomUUID()}`,
  );

  assert.equal(await directorySizeBytes(root), 0);
});
