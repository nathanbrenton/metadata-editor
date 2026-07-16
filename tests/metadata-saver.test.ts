import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import {
  createHash,
} from "node:crypto";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { parse } from "smol-toml";

import {
  saveScalarMetadataChanges,
} from "../server/metadata-saver.js";
import type {
  ReleaseScanResult,
} from "../server/types.js";

function sha256(content: string): string {
  return createHash("sha256")
    .update(content, "utf8")
    .digest("hex");
}

async function withTemporaryLibrary(
  callback: (
    mediaRoot: string,
  ) => Promise<void>,
): Promise<void> {
  const mediaRoot = await mkdtemp(
    path.join(
      os.tmpdir(),
      "metadata-saver-test-",
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

function buildRelease(
  relativePath: string,
): ReleaseScanResult {
  return {
    id: "test-release",
    relativePath: "releases/test-release",
    metadataFiles: [
      {
        filename: "release.toml",
        relativePath,
        exists: true,
      },
    ],
    artworkMasters: [],
    tracks: [],
  };
}

test(
  "updates scalar values and preserves unknown fields and arrays",
  async () => {
    await withTemporaryLibrary(
      async (mediaRoot) => {
        const releaseDirectory =
          path.join(
            mediaRoot,
            "releases",
            "test-release",
          );

        await mkdir(releaseDirectory, {
          recursive: true,
        });

        const relativePath =
          "releases/test-release/release.toml";

        const originalContent = [
          "[release]",
          'id = "test-release"',
          'title = "Original Title"',
          'language = ""',
          'genres = ["rock", "pop"]',
          "",
          "[release.unknown_section]",
          'custom_key = "preserve me"',
          "",
        ].join("\n");

        await writeFile(
          path.join(
            mediaRoot,
            relativePath,
          ),
          originalContent,
        );

        const receipt =
          await saveScalarMetadataChanges(
            mediaRoot,
            buildRelease(relativePath),
            relativePath,
            sha256(originalContent),
            [
              {
                path: "release.title",
                value: "Updated Title",
              },
              {
                path: "release.language",
                value: "en",
              },
            ],
          );

        const savedContent =
          await readFile(
            path.join(
              mediaRoot,
              relativePath,
            ),
            "utf8",
          );

        const parsed = parse(
          savedContent,
        ) as {
          release: {
            title: string;
            language: string;
            genres: string[];
            unknown_section: {
              custom_key: string;
            };
          };
        };

        assert.equal(
          parsed.release.title,
          "Updated Title",
        );
        assert.equal(
          parsed.release.language,
          "en",
        );
        assert.deepEqual(
          parsed.release.genres,
          ["rock", "pop"],
        );
        assert.equal(
          parsed.release
            .unknown_section
            .custom_key,
          "preserve me",
        );

        assert.match(
          receipt.previousSha256,
          /^[a-f0-9]{64}$/,
        );
        assert.match(
          receipt.savedSha256,
          /^[a-f0-9]{64}$/,
        );
        assert.notEqual(
          receipt.previousSha256,
          receipt.savedSha256,
        );
      },
    );
  },
);

test(
  "creates a timestamped backup containing the original bytes",
  async () => {
    await withTemporaryLibrary(
      async (mediaRoot) => {
        const releaseDirectory =
          path.join(
            mediaRoot,
            "releases",
            "test-release",
          );

        await mkdir(releaseDirectory, {
          recursive: true,
        });

        const relativePath =
          "releases/test-release/release.toml";

        const originalContent =
          '[release]\ntitle = "Original"\n';

        await writeFile(
          path.join(
            mediaRoot,
            relativePath,
          ),
          originalContent,
        );

        const receipt =
          await saveScalarMetadataChanges(
            mediaRoot,
            buildRelease(relativePath),
            relativePath,
            sha256(originalContent),
            [
              {
                path: "release.title",
                value: "Updated",
              },
            ],
          );

        assert.match(
          receipt.backupRelativePath,
          /\.metadata-backups\/release\.toml\..+\.bak$/,
        );

        assert.equal(
          await readFile(
            path.join(
              mediaRoot,
              receipt.backupRelativePath,
            ),
            "utf8",
          ),
          originalContent,
        );

        const backupEntries =
          await readdir(
            path.join(
              releaseDirectory,
              ".metadata-backups",
            ),
          );

        assert.equal(
          backupEntries.length,
          1,
        );
      },
    );
  },
);

test(
  "rejects stale external-change hashes",
  async () => {
    await withTemporaryLibrary(
      async (mediaRoot) => {
        const releaseDirectory =
          path.join(
            mediaRoot,
            "releases",
            "test-release",
          );

        await mkdir(releaseDirectory, {
          recursive: true,
        });

        const relativePath =
          "releases/test-release/release.toml";

        const originalContent =
          '[release]\ntitle = "Current"\n';

        await writeFile(
          path.join(
            mediaRoot,
            relativePath,
          ),
          originalContent,
        );

        await assert.rejects(
          saveScalarMetadataChanges(
            mediaRoot,
            buildRelease(relativePath),
            relativePath,
            sha256(
              '[release]\ntitle = "Stale"\n',
            ),
            [
              {
                path: "release.title",
                value: "Updated",
              },
            ],
          ),
          /changed externally/,
        );

        assert.equal(
          await readFile(
            path.join(
              mediaRoot,
              relativePath,
            ),
            "utf8",
          ),
          originalContent,
        );
      },
    );
  },
);

test(
  "rejects arrays, missing paths, and type changes",
  async () => {
    await withTemporaryLibrary(
      async (mediaRoot) => {
        const releaseDirectory =
          path.join(
            mediaRoot,
            "releases",
            "test-release",
          );

        await mkdir(releaseDirectory, {
          recursive: true,
        });

        const relativePath =
          "releases/test-release/release.toml";

        const originalContent = [
          "[release]",
          'title = "Original"',
          'genres = ["rock"]',
          "",
        ].join("\n");

        await writeFile(
          path.join(
            mediaRoot,
            relativePath,
          ),
          originalContent,
        );

        const release =
          buildRelease(relativePath);
        const originalHash =
          sha256(originalContent);

        await assert.rejects(
          saveScalarMetadataChanges(
            mediaRoot,
            release,
            relativePath,
            originalHash,
            [
              {
                path: "release.genres",
                value: "rock",
              },
            ],
          ),
          /type mismatch.*expected string-array/,
        );

        await assert.rejects(
          saveScalarMetadataChanges(
            mediaRoot,
            release,
            relativePath,
            originalHash,
            [
              {
                path: "release.missing",
                value: "value",
              },
            ],
          ),
          /does not exist/,
        );

        await assert.rejects(
          saveScalarMetadataChanges(
            mediaRoot,
            release,
            relativePath,
            originalHash,
            [
              {
                path: "release.title",
                value: 42,
              },
            ],
          ),
          /type mismatch/,
        );
      },
    );
  },
);

test(
  "updates and preserves string arrays",
  async () => {
    await withTemporaryLibrary(
      async (mediaRoot) => {
        const releaseDirectory =
          path.join(
            mediaRoot,
            "releases",
            "test-release",
          );

        await mkdir(releaseDirectory, {
          recursive: true,
        });

        const relativePath =
          "releases/test-release/release.toml";

        const originalContent = [
          "[release]",
          'title = "Test Release"',
          'genres = ["rock"]',
          'keywords = []',
          "",
        ].join("\n");

        await writeFile(
          path.join(
            mediaRoot,
            relativePath,
          ),
          originalContent,
        );

        await saveScalarMetadataChanges(
          mediaRoot,
          buildRelease(relativePath),
          relativePath,
          sha256(originalContent),
          [
            {
              path: "release.genres",
              value: ["rock", "pop"],
            },
            {
              path: "release.keywords",
              value: ["demo", "synth"],
            },
          ],
        );

        const savedContent =
          await readFile(
            path.join(
              mediaRoot,
              relativePath,
            ),
            "utf8",
          );

        const parsed = parse(
          savedContent,
        ) as {
          release: {
            genres: string[];
            keywords: string[];
          };
        };

        assert.deepEqual(
          parsed.release.genres,
          ["rock", "pop"],
        );

        assert.deepEqual(
          parsed.release.keywords,
          ["demo", "synth"],
        );

        assert.match(
          savedContent,
          /genres = \[\s*"rock", "pop"\s*\]/,
        );
      },
    );
  },
);

test(
  "rejects mixed-type and object arrays",
  async () => {
    await withTemporaryLibrary(
      async (mediaRoot) => {
        const releaseDirectory =
          path.join(
            mediaRoot,
            "releases",
            "test-release",
          );

        await mkdir(releaseDirectory, {
          recursive: true,
        });

        const relativePath =
          "releases/test-release/release.toml";

        const originalContent = [
          "[release]",
          'genres = ["rock"]',
          "",
        ].join("\n");

        await writeFile(
          path.join(
            mediaRoot,
            relativePath,
          ),
          originalContent,
        );

        await assert.rejects(
          saveScalarMetadataChanges(
            mediaRoot,
            buildRelease(relativePath),
            relativePath,
            sha256(originalContent),
            [
              {
                path: "release.genres",
                value: [
                  "rock",
                  42,
                ] as unknown as string[],
              },
            ],
          ),
          /string arrays/,
        );
      },
    );
  },
);
