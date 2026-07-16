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

import { scanMediaLibrary } from "../server/scanner.js";

async function withTemporaryLibrary(
  callback: (mediaRoot: string) => Promise<void>,
): Promise<void> {
  const mediaRoot = await mkdtemp(
    path.join(
      os.tmpdir(),
      "metadata-editor-test-",
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
  "discovers releases and tracks without TOML files",
  async () => {
    await withTemporaryLibrary(
      async (mediaRoot) => {
        const releasePath = path.join(
          mediaRoot,
          "releases",
          "2026-07-30_incomplete-release",
        );
        const trackPath = path.join(
          releasePath,
          "tracks",
          "example-artist_01_first-track",
        );

        await mkdir(trackPath, {
          recursive: true,
        });

        await writeFile(
          path.join(
            trackPath,
            "audio-master.m4a",
          ),
          "",
        );

        const result =
          await scanMediaLibrary(mediaRoot);

        assert.equal(
          result.releases.length,
          1,
        );

        const release = result.releases[0];

        assert.ok(release);
        assert.equal(
          release.id,
          "2026-07-30_incomplete-release",
        );
        assert.equal(
          release.metadataFiles.every(
            (file) => !file.exists,
          ),
          true,
        );
        assert.equal(
          release.tracks.length,
          1,
        );

        const track = release.tracks[0];

        assert.ok(track);
        assert.equal(
          track.metadataFiles.every(
            (file) => !file.exists,
          ),
          true,
        );
        assert.deepEqual(
          track.audioMasters.map(
            (asset) => asset.filename,
          ),
          ["audio-master.m4a"],
        );
      },
    );
  },
);

test(
  "reports populated metadata and nested artwork masters",
  async () => {
    await withTemporaryLibrary(
      async (mediaRoot) => {
        const releasePath = path.join(
          mediaRoot,
          "releases",
          "2026-07-13_complete-release",
        );
        const artworkPath = path.join(
          releasePath,
          "artwork",
          "front",
        );
        const trackPath = path.join(
          releasePath,
          "tracks",
          "artist_01_track",
        );

        await mkdir(artworkPath, {
          recursive: true,
        });
        await mkdir(trackPath, {
          recursive: true,
        });

        await Promise.all([
          writeFile(
            path.join(
              releasePath,
              "release.toml",
            ),
            '[release]\nid = "complete-release"\n',
          ),
          writeFile(
            path.join(
              artworkPath,
              "artwork-master.jpeg",
            ),
            "",
          ),
          writeFile(
            path.join(
              trackPath,
              "track.toml",
            ),
            '[track]\nid = "track"\n',
          ),
          writeFile(
            path.join(
              trackPath,
              "audio-master.wav",
            ),
            "",
          ),
        ]);

        const result =
          await scanMediaLibrary(mediaRoot);
        const release = result.releases[0];

        assert.ok(release);
        assert.equal(
          release.metadataFiles.find(
            (file) =>
              file.filename ===
              "release.toml",
          )?.exists,
          true,
        );
        assert.deepEqual(
          release.artworkMasters.map(
            (asset) => asset.filename,
          ),
          ["artwork-master.jpeg"],
        );

        const track = release.tracks[0];

        assert.ok(track);
        assert.equal(
          track.metadataFiles.find(
            (file) =>
              file.filename ===
              "track.toml",
          )?.exists,
          true,
        );
        assert.deepEqual(
          track.audioMasters.map(
            (asset) => asset.filename,
          ),
          ["audio-master.wav"],
        );
      },
    );
  },
);
