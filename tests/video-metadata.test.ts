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
import { parse } from "smol-toml";

import {
  readVideoMetadataForEdit,
  saveVideoMetadataEdits,
} from "../server/video-metadata.js";
import type {
  ReleaseScanResult,
} from "../server/types.js";

async function createFixture() {
  const mediaRoot = await mkdtemp(
    path.join(os.tmpdir(), "metadata-editor-video-metadata-"),
  );
  const releaseId = "2026-08-09_video-test";
  const releaseRelativePath = `releases/${releaseId}`;
  const videoId = "video_session";
  const videoRelativePath = `${releaseRelativePath}/videos/${videoId}`;
  const videoPath = path.join(
    mediaRoot,
    videoRelativePath,
  );

  await mkdir(videoPath, { recursive: true });
  await writeFile(
    path.join(videoPath, "video-master.mp4"),
    Buffer.from("canonical-video"),
  );
  await writeFile(
    path.join(videoPath, "video.toml"),
    [
      "[schema]",
      'name = "video-metadata"',
      "version = 2",
      "",
      "[video]",
      `id = "${videoId}"`,
      'title = "Session Footage"',
      'type = "studio_footage"',
      'description = "Camera test from the rehearsal room."',
      'date = "2026-08-09"',
      'location = "Costa Mesa, CA"',
      'director = "Nathan Brenton"',
      'camera_operator = "Camera Operator"',
      'master_path = "video-master.mp4"',
      'related_track_id = ""',
      'future_field = "preserve-me"',
      "",
    ].join("\n"),
  );

  const release: ReleaseScanResult = {
    id: releaseId,
    relativePath: releaseRelativePath,
    metadataFiles: [],
    artworkMasters: [],
    tracks: [
      {
        id: "01_song",
        relativePath: `${releaseRelativePath}/tracks/01_song`,
        metadataFiles: [],
        audioMasters: [],
        artworkMasters: [],
      },
    ],
    videos: [
      {
        id: videoId,
        relativePath: videoRelativePath,
        metadataFiles: [
          {
            filename: "video.toml",
            relativePath: `${videoRelativePath}/video.toml`,
            exists: true,
          },
        ],
        videoMasters: [
          {
            filename: "video-master.mp4",
            relativePath: `${videoRelativePath}/video-master.mp4`,
            extension: ".mp4",
          },
        ],
      },
    ],
  };

  return {
    mediaRoot,
    release,
    videoId,
    videoPath,
  };
}

test("reads editable video metadata with a concurrency hash", async () => {
  const fixture = await createFixture();

  try {
    const snapshot = await readVideoMetadataForEdit(
      fixture.mediaRoot,
      fixture.release,
      fixture.videoId,
    );

    assert.equal(snapshot.title, "Session Footage");
    assert.equal(snapshot.videoType, "studio_footage");
    assert.equal(
      snapshot.description,
      "Camera test from the rehearsal room.",
    );
    assert.equal(snapshot.date, "2026-08-09");
    assert.equal(snapshot.location, "Costa Mesa, CA");
    assert.equal(snapshot.director, "Nathan Brenton");
    assert.equal(snapshot.cameraOperator, "Camera Operator");
    assert.equal(snapshot.relatedTrackId, "");
    assert.equal(snapshot.masterPath, "video-master.mp4");
    assert.match(snapshot.originalSha256, /^[a-f0-9]{64}$/);
  } finally {
    await rm(fixture.mediaRoot, {
      recursive: true,
      force: true,
    });
  }
});

test("updates only editable video fields and preserves identity/master/unknown data", async () => {
  const fixture = await createFixture();

  try {
    const before = await readVideoMetadataForEdit(
      fixture.mediaRoot,
      fixture.release,
      fixture.videoId,
    );
    const receipt = await saveVideoMetadataEdits(
      fixture.mediaRoot,
      fixture.release,
      {
        videoId: fixture.videoId,
        originalSha256: before.originalSha256,
        title: "Edited Session Footage",
        videoType: "live_performance",
        description: "Live performance camera master.",
        date: "2026-08-10",
        location: "Los Angeles, CA",
        director: "Director Name",
        cameraOperator: "Operator Name",
        relatedTrackId: "01_song",
      },
    );

    const parsed = parse(
      await readFile(
        path.join(fixture.videoPath, "video.toml"),
        "utf8",
      ),
    ) as Record<string, any>;

    assert.equal(parsed.video.id, fixture.videoId);
    assert.equal(parsed.video.master_path, "video-master.mp4");
    assert.equal(parsed.video.title, "Edited Session Footage");
    assert.equal(parsed.video.type, "live_performance");
    assert.equal(
      parsed.video.description,
      "Live performance camera master.",
    );
    assert.equal(parsed.video.date, "2026-08-10");
    assert.equal(parsed.video.location, "Los Angeles, CA");
    assert.equal(parsed.video.director, "Director Name");
    assert.equal(parsed.video.camera_operator, "Operator Name");
    assert.equal(parsed.video.related_track_id, "01_song");
    assert.equal(parsed.video.future_field, "preserve-me");
    assert.match(receipt.savedSha256, /^[a-f0-9]{64}$/);

    const backups = await readdir(
      path.join(fixture.videoPath, ".metadata-backups"),
    );
    assert.equal(backups.length, 1);
    assert.match(backups[0] ?? "", /^video\.toml\..+\.bak$/);
  } finally {
    await rm(fixture.mediaRoot, {
      recursive: true,
      force: true,
    });
  }
});

test("rejects stale saves and broken related-track references", async () => {
  const fixture = await createFixture();

  try {
    const snapshot = await readVideoMetadataForEdit(
      fixture.mediaRoot,
      fixture.release,
      fixture.videoId,
    );

    await assert.rejects(
      saveVideoMetadataEdits(
        fixture.mediaRoot,
        fixture.release,
        {
          videoId: fixture.videoId,
          originalSha256: "0".repeat(64),
          title: "Changed",
          videoType: "other",
          relatedTrackId: "",
        },
      ),
      /changed externally/,
    );

    await assert.rejects(
      saveVideoMetadataEdits(
        fixture.mediaRoot,
        fixture.release,
        {
          videoId: fixture.videoId,
          originalSha256: snapshot.originalSha256,
          title: "Changed",
          videoType: "other",
          date: "08/10/2026",
          relatedTrackId: "",
        },
      ),
      /YYYY-MM-DD/,
    );

    await assert.rejects(
      saveVideoMetadataEdits(
        fixture.mediaRoot,
        fixture.release,
        {
          videoId: fixture.videoId,
          originalSha256: snapshot.originalSha256,
          title: "Changed",
          videoType: "other",
          relatedTrackId: "missing_track",
        },
      ),
      /Related track does not exist/,
    );
  } finally {
    await rm(fixture.mediaRoot, {
      recursive: true,
      force: true,
    });
  }
});
