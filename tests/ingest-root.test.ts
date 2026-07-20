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
  assertPathWithinIngestRoot,
  resolveIngestCandidate,
  toIngestRelativePath,
} from "../server/ingest-root.js";

test("confines ingest candidates and returns slash-separated paths", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "ingest-root-"),
  );

  /*
   * macOS may expose its temporary directory through /var while
   * realpath() returns the equivalent /private/var location. Build
   * test paths from the canonical root so confinement comparisons
   * use one filesystem namespace.
   */
  const canonicalRoot = await realpath(root);
  const candidate = path.join(
    canonicalRoot,
    "candidate",
  );
  await mkdir(candidate);

  assert.equal(
    assertPathWithinIngestRoot(canonicalRoot, candidate),
    candidate,
  );
  assert.equal(
    toIngestRelativePath(canonicalRoot, candidate),
    "candidate",
  );
  await assert.rejects(
    async () =>
      assertPathWithinIngestRoot(
        canonicalRoot,
        path.join(
          canonicalRoot,
          "..",
          "outside",
        ),
      ),
    /escapes configured ingest root/,
  );
});

test("rejects traversal identifiers and symbolic-link candidates", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "ingest-candidate-"),
  );
  const outside = await mkdtemp(
    path.join(os.tmpdir(), "ingest-outside-"),
  );
  await writeFile(path.join(outside, "audio.mp3"), "audio");
  await symlink(outside, path.join(root, "linked"));
  const canonicalRoot = await realpath(root);

  await assert.rejects(
    resolveIngestCandidate(canonicalRoot, "../outside"),
    /Invalid ingest candidate identifier/,
  );
  await assert.rejects(
    resolveIngestCandidate(canonicalRoot, "linked"),
    /Symbolic links are not valid ingest candidates/,
  );
});
