import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { executeMetadataCreationPlan } from "../server/metadata-writer.js";
import type {
  MetadataGenerationPlan,
} from "../server/types.js";

async function withTemporaryLibrary(
  callback: (mediaRoot: string) => Promise<void>,
): Promise<void> {
  const mediaRoot = await mkdtemp(
    path.join(
      os.tmpdir(),
      "metadata-writer-test-",
    ),
  );

  try {
    await callback(mediaRoot);
  } finally {
    await rm(mediaRoot, {
      recursive: true,
      force: true,
    });
  }
}

function createPlan(
  relativePath: string,
  content = '[release]\nid = "test-release"\n',
): MetadataGenerationPlan {
  return {
    releaseId: "test-release",
    scope: "all",
    items: [
      {
        storageRole: "release",
        filename: "release.toml",
        relativePath,
        action: "create",
        reason:
          "Target file is missing and may be created.",
        content,
        validated: true,
      },
    ],
    summary: {
      createCount: 1,
      blockedCount: 0,
    },
    warnings: [],
  };
}

test(
  "creates validated metadata without temporary-file residue",
  async () => {
    await withTemporaryLibrary(
      async (mediaRoot) => {
        const releaseDirectory = path.join(
          mediaRoot,
          "releases",
          "test-release",
        );

        await mkdir(releaseDirectory, {
          recursive: true,
        });

        const relativePath =
          "releases/test-release/release.toml";

        const result =
          await executeMetadataCreationPlan(
            mediaRoot,
            createPlan(relativePath),
          );

        assert.deepEqual(
          result.created,
          [relativePath],
        );

        assert.equal(result.receipts.length, 1);
        assert.equal(
          result.receipts[0]?.relativePath,
          relativePath,
        );
        assert.equal(
          result.receipts[0]?.bytes,
          Buffer.byteLength(
            '[release]\nid = "test-release"\n',
          ),
        );
        assert.match(
          result.receipts[0]?.sha256 ?? "",
          /^[a-f0-9]{64}$/,
        );
        assert.doesNotThrow(() =>
          new Date(
            result.receipts[0]?.verifiedAt ?? "",
          ).toISOString(),
        );

        assert.equal(
          await readFile(
            path.join(mediaRoot, relativePath),
            "utf8",
          ),
          '[release]\nid = "test-release"\n',
        );

        const directoryEntries =
          await readdir(releaseDirectory);

        assert.deepEqual(directoryEntries, [
          "release.toml",
        ]);
      },
    );
  },
);

test(
  "refuses to replace an existing metadata file",
  async () => {
    await withTemporaryLibrary(
      async (mediaRoot) => {
        const releaseDirectory = path.join(
          mediaRoot,
          "releases",
          "test-release",
        );

        await mkdir(releaseDirectory, {
          recursive: true,
        });

        const relativePath =
          "releases/test-release/release.toml";

        const targetPath = path.join(
          mediaRoot,
          relativePath,
        );

        await writeFile(
          targetPath,
          '[release]\nid = "original"\n',
        );

        await assert.rejects(
          executeMetadataCreationPlan(
            mediaRoot,
            createPlan(relativePath),
          ),
          /Refusing to overwrite existing file/,
        );

        assert.equal(
          await readFile(targetPath, "utf8"),
          '[release]\nid = "original"\n',
        );
      },
    );
  },
);

test(
  "rejects a target outside the media root",
  async () => {
    await withTemporaryLibrary(
      async (mediaRoot) => {
        await assert.rejects(
          executeMetadataCreationPlan(
            mediaRoot,
            createPlan(
              "../outside-release.toml",
            ),
          ),
          /escapes configured media root/,
        );
      },
    );
  },
);

test(
  "revalidates TOML immediately before writing",
  async () => {
    await withTemporaryLibrary(
      async (mediaRoot) => {
        await mkdir(
          path.join(
            mediaRoot,
            "releases",
            "test-release",
          ),
          {
            recursive: true,
          },
        );

        await assert.rejects(
          executeMetadataCreationPlan(
            mediaRoot,
            createPlan(
              "releases/test-release/release.toml",
              "[release\ninvalid",
            ),
          ),
        );
      },
    );
  },
);
