import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  readReleaseMetadataDetail,
} from "../server/metadata-reader.js";
import type {
  ReleaseScanResult,
} from "../server/types.js";

async function withTemporaryLibrary(
  callback: (
    mediaRoot: string,
  ) => Promise<void>,
): Promise<void> {
  const mediaRoot = await mkdtemp(
    path.join(
      os.tmpdir(),
      "metadata-reader-test-",
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

test(
  "reads and parses existing release and track TOMLs",
  async () => {
    await withTemporaryLibrary(
      async (mediaRoot) => {
        const releasePath =
          "releases/test-release";
        const trackPath =
          `${releasePath}/tracks/test-track`;

        await mkdir(
          path.join(
            mediaRoot,
            trackPath,
          ),
          {
            recursive: true,
          },
        );

        await writeFile(
          path.join(
            mediaRoot,
            releasePath,
            "release.toml",
          ),
          [
            "[release]",
            'id = "test-release"',
            'title = "Test Release"',
            "",
            "[release.dates]",
            'release = "2026-07-16"',
            "",
          ].join("\n"),
        );

        await writeFile(
          path.join(
            mediaRoot,
            trackPath,
            "track.toml",
          ),
          [
            "[track]",
            'id = "test-track"',
            'title = "Test Track"',
            "",
            "[track.numbering]",
            "track_number = 1",
            "",
          ].join("\n"),
        );

        const release:
          ReleaseScanResult = {
            id: "test-release",
            relativePath: releasePath,
            metadataFiles: [
              {
                filename: "release.toml",
                relativePath:
                  `${releasePath}/release.toml`,
                exists: true,
              },
              {
                filename:
                  "release-settings.toml",
                relativePath:
                  `${releasePath}/release-settings.toml`,
                exists: false,
              },
            ],
            artworkMasters: [],
            tracks: [
              {
                id: "test-track",
                relativePath: trackPath,
                metadataFiles: [
                  {
                    filename:
                      "track.toml",
                    relativePath:
                      `${trackPath}/track.toml`,
                    exists: true,
                  },
                ],
                audioMasters: [],
                artworkMasters: [],
              },
            ],
          };

        const detail =
          await readReleaseMetadataDetail(
            mediaRoot,
            release,
          );

        assert.equal(
          detail.documents.length,
          2,
        );

        assert.equal(
          detail.missingFiles.length,
          1,
        );

        const releaseDocument =
          detail.documents.find(
            (document) =>
              document.filename ===
              "release.toml",
          );

        assert.ok(releaseDocument);
        assert.equal(
          releaseDocument.scope,
          "release",
        );

        const releaseTable =
          releaseDocument.parsed.release;

        assert.equal(
          typeof releaseTable,
          "object",
        );

        const trackDocument =
          detail.documents.find(
            (document) =>
              document.filename ===
              "track.toml",
          );

        assert.ok(trackDocument);
        assert.equal(
          trackDocument.trackId,
          "test-track",
        );
        assert.deepEqual(
          detail.warnings,
          [],
        );
      },
    );
  },
);

test(
  "reports invalid TOML as a warning",
  async () => {
    await withTemporaryLibrary(
      async (mediaRoot) => {
        const releasePath =
          "releases/invalid-release";

        await mkdir(
          path.join(
            mediaRoot,
            releasePath,
          ),
          {
            recursive: true,
          },
        );

        await writeFile(
          path.join(
            mediaRoot,
            releasePath,
            "release.toml",
          ),
          "[release\ninvalid",
        );

        const release:
          ReleaseScanResult = {
            id: "invalid-release",
            relativePath: releasePath,
            metadataFiles: [
              {
                filename: "release.toml",
                relativePath:
                  `${releasePath}/release.toml`,
                exists: true,
              },
            ],
            artworkMasters: [],
            tracks: [],
          };

        const detail =
          await readReleaseMetadataDetail(
            mediaRoot,
            release,
          );

        assert.equal(
          detail.documents.length,
          0,
        );
        assert.equal(
          detail.warnings.length,
          1,
        );
        assert.match(
          detail.warnings[0] ?? "",
          /release\.toml/,
        );
      },
    );
  },
);
