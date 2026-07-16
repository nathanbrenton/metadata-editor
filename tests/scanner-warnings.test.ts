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
      "metadata-editor-warning-test-",
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
  "warns when a release contains no tracks",
  async () => {
    await withTemporaryLibrary(
      async (mediaRoot) => {
        await mkdir(
          path.join(
            mediaRoot,
            "releases",
            "2026-08-01_empty-release",
          ),
          {
            recursive: true,
          },
        );

        const result =
          await scanMediaLibrary(mediaRoot);

        assert.deepEqual(result.warnings, [
          "releases/2026-08-01_empty-release: no track directories detected",
        ]);
      },
    );
  },
);

test(
  "warns about missing and ambiguous master assets",
  async () => {
    await withTemporaryLibrary(
      async (mediaRoot) => {
        const releasePath = path.join(
          mediaRoot,
          "releases",
          "2026-08-02_ambiguous-release",
        );
        const releaseArtworkPath = path.join(
          releasePath,
          "artwork",
          "front",
        );
        const firstTrackPath = path.join(
          releasePath,
          "tracks",
          "artist_01_multiple-masters",
        );
        const firstTrackArtworkPath = path.join(
          firstTrackPath,
          "artwork",
          "front",
        );
        const secondTrackPath = path.join(
          releasePath,
          "tracks",
          "artist_02_missing-master",
        );

        await Promise.all([
          mkdir(releaseArtworkPath, {
            recursive: true,
          }),
          mkdir(firstTrackArtworkPath, {
            recursive: true,
          }),
          mkdir(secondTrackPath, {
            recursive: true,
          }),
        ]);

        await Promise.all([
          writeFile(
            path.join(
              releaseArtworkPath,
              "artwork-master.jpeg",
            ),
            "",
          ),
          writeFile(
            path.join(
              releaseArtworkPath,
              "artwork-master.png",
            ),
            "",
          ),
          writeFile(
            path.join(
              firstTrackPath,
              "audio-master.wav",
            ),
            "",
          ),
          writeFile(
            path.join(
              firstTrackPath,
              "audio-master.flac",
            ),
            "",
          ),
          writeFile(
            path.join(
              firstTrackArtworkPath,
              "artwork-master.jpg",
            ),
            "",
          ),
          writeFile(
            path.join(
              firstTrackArtworkPath,
              "artwork-master.webp",
            ),
            "",
          ),
        ]);

        const result =
          await scanMediaLibrary(mediaRoot);

        assert.deepEqual(result.warnings, [
          "releases/2026-08-02_ambiguous-release: multiple release artwork masters detected",
          "releases/2026-08-02_ambiguous-release/tracks/artist_01_multiple-masters: multiple audio masters detected",
          "releases/2026-08-02_ambiguous-release/tracks/artist_01_multiple-masters: multiple track artwork masters detected",
          "releases/2026-08-02_ambiguous-release/tracks/artist_02_missing-master: no audio master detected",
        ]);
      },
    );
  },
);
