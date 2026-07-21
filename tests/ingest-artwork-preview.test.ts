import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  isIngestArtworkPreviewExtension,
  readIngestArtworkPreview,
} from "../server/ingest-artwork.js";

async function createFixture() {
  const temporaryRoot = await mkdtemp(
    path.join(
      os.tmpdir(),
      "metadata-ingest-artwork-",
    ),
  );
  const root = await realpath(temporaryRoot);
  const candidate = path.join(
    root,
    "candidate",
  );
  await mkdir(candidate);
  const artworkPath = path.join(
    candidate,
    "front.png",
  );
  await writeFile(
    artworkPath,
    Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  );

  return {
    root,
    temporaryRoot,
    artworkPath,
  };
}

test(
  "reads confined browser-previewable ingest artwork",
  async (context) => {
    const fixture = await createFixture();
    context.after(async () => {
      await rm(fixture.temporaryRoot, {
        recursive: true,
        force: true,
      });
    });

    const preview =
      await readIngestArtworkPreview(
        fixture.root,
        "candidate/front.png",
      );

    assert.equal(
      preview.contentType,
      "image/png",
    );
    assert.deepEqual(
      [...preview.bytes],
      [0x89, 0x50, 0x4e, 0x47],
    );
  },
);

test(
  "rejects traversal outside the ingest root",
  async (context) => {
    const fixture = await createFixture();
    context.after(async () => {
      await rm(fixture.temporaryRoot, {
        recursive: true,
        force: true,
      });
    });

    await assert.rejects(
      readIngestArtworkPreview(
        fixture.root,
        "../outside.png",
      ),
      /escapes configured ingest root/,
    );
  },
);

test(
  "rejects active or unsupported inline artwork types",
  async () => {
    assert.equal(
      isIngestArtworkPreviewExtension(
        "candidate/front.svg",
      ),
      false,
    );
    assert.equal(
      isIngestArtworkPreviewExtension(
        "candidate/front.tiff",
      ),
      false,
    );
    assert.equal(
      isIngestArtworkPreviewExtension(
        "candidate/front.webp",
      ),
      true,
    );
  },
);

test(
  "rejects symbolic-link artwork targets",
  async (context) => {
    const fixture = await createFixture();
    context.after(async () => {
      await rm(fixture.temporaryRoot, {
        recursive: true,
        force: true,
      });
    });

    const linkedPath = path.join(
      fixture.root,
      "candidate",
      "linked.png",
    );
    await symlink(
      fixture.artworkPath,
      linkedPath,
    );

    await assert.rejects(
      readIngestArtworkPreview(
        fixture.root,
        "candidate/linked.png",
      ),
      /Symbolic links cannot be previewed/,
    );
  },
);
