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

test(
  "updates indexed array-of-table fields and preserves sibling records",
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
          "releases/test-release/track-credits.toml";

        const originalContent = [
          "[[track.performers]]",
          'name = "First Artist"',
          'role = "guitar"',
          'sort_name = "Artist, First"',
          "",
          "[[track.performers]]",
          'name = "Second Artist"',
          'role = "vocals"',
          'sort_name = "Artist, Second"',
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
                path:
                  "track.performers[0].role",
                value: "electric guitar",
              },
              {
                path:
                  "track.performers[1].name",
                value: "Updated Artist",
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
          track: {
            performers: Array<{
              name: string;
              role: string;
              sort_name: string;
            }>;
          };
        };

        assert.equal(
          parsed.track.performers[0].role,
          "electric guitar",
        );

        assert.equal(
          parsed.track.performers[1].name,
          "Updated Artist",
        );

        /*
         * Unchanged fields and sibling records must survive the
         * parse/update/stringify cycle.
         */
        assert.equal(
          parsed.track.performers[0].name,
          "First Artist",
        );

        assert.equal(
          parsed.track.performers[0].sort_name,
          "Artist, First",
        );

        assert.equal(
          parsed.track.performers[1].role,
          "vocals",
        );

        assert.equal(
          parsed.track.performers[1].sort_name,
          "Artist, Second",
        );

        assert.match(
          receipt.backupRelativePath,
          /\.metadata-backups\/track-credits\.toml\..+\.bak$/,
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
      },
    );
  },
);


test(
  "saves paired performer additions, edits, and removals atomically",
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
          "releases/test-release/track-credits.toml";

        const originalContent = [
          "[[track.performers]]",
          'name = "First Artist"',
          'role = "guitar"',
          'credit_id = "keep-first"',
          "",
          "[[track.performers]]",
          'name = "Second Artist"',
          'role = "vocals"',
          'credit_id = "keep-second"',
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
            [],
            false,
            [
              {
                sourceIndex: 1,
                name: "Second Artist",
                role: "lead vocals",
                sortName:
                  "Artist, Second",
              },
              {
                sourceIndex: null,
                name: "New Artist",
                role: "drums",
                sortName: "",
              },
            ],
          );

        const parsed = parse(
          await readFile(
            path.join(
              mediaRoot,
              relativePath,
            ),
            "utf8",
          ),
        ) as {
          track: {
            performers: Array<{
              name: string;
              role: string;
              sort_name?: string;
              credit_id?: string;
            }>;
          };
        };

        assert.equal(
          parsed.track.performers.length,
          2,
        );
        assert.equal(
          parsed.track.performers[0]
            ?.credit_id,
          "keep-second",
        );
        assert.equal(
          parsed.track.performers[0]
            ?.role,
          "lead vocals",
        );
        assert.equal(
          parsed.track.performers[1]
            ?.name,
          "New Artist",
        );
        assert.match(
          receipt.backupRelativePath,
          /track-credits\.toml/,
        );
      },
    );
  },
);

test(
  "rejects performer replacement outside track-credits.toml",
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
          '[release]\\ntitle = "Test"\\n';

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
            [],
            false,
            [],
          ),
          /only be saved in track-credits\.toml/,
        );
      },
    );
  },
);

test(
  "saves technical contributor edits while preserving nontechnical credits",
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
          "releases/test-release/track-credits.toml";
        const originalContent = [
          "[[track.contributors]]",
          'name = "Producer Person"',
          'role = "producer"',
          'credit_id = "keep-production"',
          "",
          "[[track.contributors]]",
          'name = "Engineer Person"',
          'role = "recording engineer"',
          'credit_id = "keep-recording"',
          "",
          "[[track.contributors]]",
          'name = "Mix Person"',
          'role = "mix engineer"',
          'credit_id = "remove-mix"',
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
            [],
            false,
            undefined,
            [
              {
                sourceIndex: 1,
                name: "Engineer Person",
                role:
                  "recording and mix engineer",
                sortName:
                  "Person, Engineer",
              },
              {
                sourceIndex: null,
                name: "Master Person",
                role:
                  "mastering engineer",
                sortName: "",
              },
            ],
            [1, 2],
          );

        const parsed = parse(
          await readFile(
            path.join(
              mediaRoot,
              relativePath,
            ),
            "utf8",
          ),
        ) as {
          track: {
            contributors: Array<{
              name: string;
              role: string;
              sort_name?: string;
              credit_id?: string;
            }>;
          };
        };

        assert.equal(
          parsed.track.contributors.length,
          3,
        );
        assert.equal(
          parsed.track.contributors[0]
            ?.credit_id,
          "keep-production",
        );
        assert.equal(
          parsed.track.contributors[1]
            ?.credit_id,
          "keep-recording",
        );
        assert.equal(
          parsed.track.contributors[1]
            ?.role,
          "recording and mix engineer",
        );
        assert.equal(
          parsed.track.contributors[2]
            ?.name,
          "Master Person",
        );
        assert.equal(
          parsed.track.contributors.some(
            (record) =>
              record.credit_id ===
                "remove-mix",
          ),
          false,
        );
        assert.match(
          receipt.backupRelativePath,
          /track-credits\.toml/,
        );
      },
    );
  },
);

test(
  "rejects technical contributor replacement outside track-credits.toml",
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
          '[release]\ntitle = "Test"\n';

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
            [],
            false,
            undefined,
            [],
            [],
          ),
          /only be saved in track-credits\.toml/,
        );
      },
    );
  },
);

test(
  "saves release-level technical credits while preserving other contributors",
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
          "",
          "[[release.credits.contributors]]",
          'name = "Producer Person"',
          'role = "producer"',
          'credit_id = "keep-production"',
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
            [],
            false,
            undefined,
            [
              {
                sourceIndex: null,
                name: "Nathan Brenton",
                role: "Recorded By",
                sortName: "Brenton, Nathan",
              },
              {
                sourceIndex: null,
                name: "Kateri Lirio",
                role: "Mixed By",
                sortName: "",
              },
            ],
            [],
            "release.credits.contributors",
          );

        const parsed = parse(
          await readFile(
            path.join(
              mediaRoot,
              relativePath,
            ),
            "utf8",
          ),
        ) as {
          release: {
            credits: {
              contributors: Array<{
                name: string;
                role: string;
                sort_name?: string;
                credit_id?: string;
              }>;
            };
          };
        };

        assert.equal(
          parsed.release.credits.contributors.length,
          3,
        );
        assert.equal(
          parsed.release.credits.contributors[0]
            ?.credit_id,
          "keep-production",
        );
        assert.equal(
          parsed.release.credits.contributors[1]
            ?.name,
          "Nathan Brenton",
        );
        assert.equal(
          parsed.release.credits.contributors[2]
            ?.role,
          "Mixed By",
        );
        assert.match(
          receipt.backupRelativePath,
          /release\.toml/,
        );
      },
    );
  },
);

test(
  "rejects release technical credits outside release.toml",
  async () => {
    await withTemporaryLibrary(
      async (mediaRoot) => {
        const trackDirectory =
          path.join(
            mediaRoot,
            "releases",
            "test-release",
            "tracks",
            "track-1",
          );

        await mkdir(trackDirectory, {
          recursive: true,
        });

        const relativePath =
          "releases/test-release/tracks/track-1/track-credits.toml";
        const originalContent =
          "[track]\ncontributors = []\n";

        await writeFile(
          path.join(
            mediaRoot,
            relativePath,
          ),
          originalContent,
        );

        const release: ReleaseScanResult = {
          id: "test-release",
          relativePath:
            "releases/test-release",
          metadataFiles: [],
          artworkMasters: [],
          tracks: [
            {
              id: "track-1",
              relativePath:
                "releases/test-release/tracks/track-1",
              metadataFiles: [
                {
                  filename:
                    "track-credits.toml",
                  relativePath,
                  exists: true,
                },
              ],
              audioMasters: [],
              artworkMasters: [],
            },
          ],
        };

        await assert.rejects(
          saveScalarMetadataChanges(
            mediaRoot,
            release,
            relativePath,
            sha256(originalContent),
            [],
            false,
            undefined,
            [],
            [],
            "release.credits.contributors",
          ),
          /only be saved in release\.toml/,
        );
      },
    );
  },
);


test(
  "removes a metadata field atomically and preserves unknown sibling keys",
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
          'script = "Latn"',
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
            [],
            false,
            undefined,
            undefined,
            [],
            "track.contributors",
            ["release.script"],
          );

        const parsed = parse(
          await readFile(
            path.join(
              mediaRoot,
              relativePath,
            ),
            "utf8",
          ),
        ) as {
          release: {
            title: string;
            custom_key: string;
            script?: string;
          };
        };

        assert.equal(
          parsed.release.script,
          undefined,
        );
        assert.equal(
          parsed.release.custom_key,
          "preserve me",
        );
        assert.match(
          receipt.backupRelativePath,
          /release\.toml/,
        );
      },
    );
  },
);

test(
  "rejects combining metadata field removal with ordinary edits",
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
          'script = "Latn"',
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
                path: "release.title",
                value: "Updated",
              },
            ],
            false,
            undefined,
            undefined,
            [],
            "track.contributors",
            ["release.script"],
          ),
          /separate metadata operation/,
        );
      },
    );
  },
);
