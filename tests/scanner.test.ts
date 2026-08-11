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
            [
              "[release]",
              'id = "complete-release"',
              'title = "Indoor Lightning EP"',
              "",
              "[release.primary_artist]",
              'name = "Nathan Brenton"',
              "",
            ].join("\n"),
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
          writeFile(
            path.join(
              trackPath,
              "audio-playback.mp3",
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
        assert.equal(
          release.releaseTitle,
          "Indoor Lightning EP",
        );
        assert.equal(
          release.primaryArtistName,
          "Nathan Brenton",
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
        assert.deepEqual(
          track.playbackAudio?.map(
            (asset) => asset.filename,
          ),
          ["audio-playback.mp3"],
        );
      },
    );
  },
);

test(
  "discovers extended archival audio-master formats for live preview transcoding",
  async () => {
    await withTemporaryLibrary(
      async (mediaRoot) => {
        const releasePath = path.join(
          mediaRoot,
          "releases",
          "2026-07-21_extended-audio",
        );
        const cafTrackPath = path.join(
          releasePath,
          "tracks",
          "artist_01_caf-track",
        );
        const wmaTrackPath = path.join(
          releasePath,
          "tracks",
          "artist_02_wma-track",
        );

        await mkdir(cafTrackPath, {
          recursive: true,
        });
        await mkdir(wmaTrackPath, {
          recursive: true,
        });
        await writeFile(
          path.join(
            cafTrackPath,
            "audio-master.caf",
          ),
          "",
        );
        await writeFile(
          path.join(
            wmaTrackPath,
            "audio-master.wma",
          ),
          "",
        );

        const result =
          await scanMediaLibrary(mediaRoot);
        const tracks =
          result.releases[0]?.tracks ?? [];

        assert.deepEqual(
          tracks.flatMap((track) =>
            track.audioMasters.map(
              (asset) => asset.filename,
            ),
          ),
          [
            "audio-master.caf",
            "audio-master.wma",
          ],
        );
      },
    );
  },
);

test(
  "ignores hidden operation directories beside canonical releases",
  async () => {
    await withTemporaryLibrary(async (mediaRoot) => {
      const releasesRoot = path.join(mediaRoot, "releases");
      await mkdir(
        path.join(releasesRoot, "2026-08-01_visible-release"),
        { recursive: true },
      );
      await mkdir(
        path.join(
          releasesRoot,
          ".metadata-editor-release-rename-operation",
        ),
        { recursive: true },
      );

      const result = await scanMediaLibrary(mediaRoot);

      assert.deepEqual(
        result.releases.map((release) => release.id),
        ["2026-08-01_visible-release"],
      );
    });
  },
);
test(
  "discovers canonical release-scoped videos and their metadata identity",
  async () => {
    await withTemporaryLibrary(async (mediaRoot) => {
      const releasePath = path.join(
        mediaRoot,
        "releases",
        "2026-08-09_video-release",
      );
      const trackPath = path.join(
        releasePath,
        "tracks",
        "artist_01_track",
      );
      const videoPath = path.join(
        releasePath,
        "videos",
        "video_wednesday-night",
      );

      await mkdir(trackPath, { recursive: true });
      await mkdir(videoPath, { recursive: true });
      await writeFile(
        path.join(trackPath, "audio-master.wav"),
        "",
      );
      await writeFile(
        path.join(videoPath, "video-master.mp4"),
        "",
      );
      await writeFile(
        path.join(videoPath, "video.toml"),
        [
          "[schema]",
          'name = "video-metadata"',
          "version = 2",
          "",
          "[video]",
          'id = "video_wednesday-night"',
          'title = "Wednesday Night Visualizer"',
          'type = "visualizer"',
          'description = "Visualizer presentation master"',
          'date = "2026-08-09"',
          'location = "Costa Mesa, CA"',
          'director = "Nathan Brenton"',
          'camera_operator = "Camera Operator"',
          'master_path = "video-master.mp4"',
          'related_track_id = "artist_01_track"',
          "",
        ].join("\n"),
      );

      const result = await scanMediaLibrary(mediaRoot);
      const release = result.releases[0];
      const video = release?.videos?.[0];

      assert.ok(video);
      assert.equal(video.id, "video_wednesday-night");
      assert.equal(video.title, "Wednesday Night Visualizer");
      assert.equal(video.videoType, "visualizer");
      assert.equal(video.description, "Visualizer presentation master");
      assert.equal(video.date, "2026-08-09");
      assert.equal(video.location, "Costa Mesa, CA");
      assert.equal(video.director, "Nathan Brenton");
      assert.equal(video.cameraOperator, "Camera Operator");
      assert.equal(video.relatedTrackId, "artist_01_track");
      assert.equal(video.masterPath, "video-master.mp4");
      assert.equal(
        video.metadataFiles.find(
          (file) => file.filename === "video.toml",
        )?.exists,
        true,
      );
      assert.deepEqual(
        video.videoMasters.map((asset) => asset.filename),
        ["video-master.mp4"],
      );
      assert.equal(
        result.warnings.some((warning) =>
          warning.includes("video_wednesday-night"),
        ),
        false,
      );
    });
  },
);

test(
  "reports incomplete or broken canonical video relationships",
  async () => {
    await withTemporaryLibrary(async (mediaRoot) => {
      const videoPath = path.join(
        mediaRoot,
        "releases",
        "2026-08-09_broken-video",
        "videos",
        "video_orphaned",
      );

      await mkdir(videoPath, { recursive: true });
      await writeFile(
        path.join(videoPath, "video.toml"),
        [
          "[video]",
          'id = "video_orphaned"',
          'title = "Orphaned"',
          'type = "studio_footage"',
          'related_track_id = "missing_track"',
          "",
        ].join("\n"),
      );

      const result = await scanMediaLibrary(mediaRoot);

      assert.ok(
        result.warnings.some((warning) =>
          warning.includes("no video master detected"),
        ),
      );
      assert.ok(
        result.warnings.some((warning) =>
          warning.includes(
            "related track missing_track was not found",
          ),
        ),
      );
    });
  },
);
