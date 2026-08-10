import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildVideoWebStreamInfo,
  buildVideoWebStreamPlan,
} from "../server/media-processing/video-web-stream.js";
import type {
  FfmpegCapabilities,
  ReleaseScanResult,
} from "../server/types.js";

const capabilities: FfmpegCapabilities = {
  available: true,
  executable: "ffmpeg",
  encoders: ["libx264", "aac"],
  containers: [],
  checkedAt: "2026-08-10T04:00:00.000Z",
};

function releaseFixture(): ReleaseScanResult {
  return {
    id: "2026-08-09_example",
    relativePath: "releases/2026-08-09_example",
    metadataFiles: [],
    artworkMasters: [],
    tracks: [],
    videos: [
      {
        id: "video_example",
        relativePath:
          "releases/2026-08-09_example/videos/video_example",
        title: "Example Video",
        masterPath: "video-master.mp4",
        metadataFiles: [],
        videoMasters: [
          {
            filename: "video-master.mp4",
            relativePath:
              "releases/2026-08-09_example/videos/video_example/video-master.mp4",
            extension: ".mp4",
          },
        ],
      },
    ],
  };
}

async function writeCurrentStream(
  root: string,
  plan: Awaited<ReturnType<typeof buildVideoWebStreamPlan>>,
): Promise<void> {
  const item = plan.items[0];
  assert.ok(item.master);
  const directory = path.join(
    root,
    ...item.directoryRelativePath.split("/"),
  );
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, "index.m3u8"),
    [
      "#EXTM3U",
      "#EXT-X-VERSION:7",
      "#EXT-X-INDEPENDENT-SEGMENTS",
      '#EXT-X-MAP:URI="init.mp4"',
      "#EXTINF:3.000000,",
      "segment-00001.m4s",
      "#EXT-X-ENDLIST",
      "",
    ].join("\n"),
  );
  await writeFile(
    path.join(directory, "init.mp4"),
    "init",
  );
  await writeFile(
    path.join(directory, "segment-00001.m4s"),
    "segment",
  );
  await writeFile(
    path.join(directory, "stream-info.json"),
    `${JSON.stringify(
      buildVideoWebStreamInfo(
        item.videoId,
        item.master,
        plan.profile,
        plan.generatedAt,
      ),
      null,
      2,
    )}\n`,
  );
}

test("plans missing, current, and stale private video HLS derivatives", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "metadata-video-plan-"),
  );

  try {
    const master = path.join(
      root,
      "releases/2026-08-09_example/videos/video_example/video-master.mp4",
    );
    await mkdir(path.dirname(master), {
      recursive: true,
    });
    await writeFile(master, "canonical-video-source");

    const missing = await buildVideoWebStreamPlan(
      root,
      releaseFixture(),
      capabilities,
      { generatedAt: "2026-08-10T04:00:00.000Z" },
    );
    assert.equal(missing.summary.videoCount, 1);
    assert.equal(missing.summary.createCount, 1);
    assert.equal(missing.items[0].status, "missing");
    assert.equal(missing.items[0].action, "create");
    assert.match(
      missing.planFingerprint,
      /^[a-f0-9]{64}$/,
    );

    await writeCurrentStream(root, missing);
    const current = await buildVideoWebStreamPlan(
      root,
      releaseFixture(),
      capabilities,
      { generatedAt: "2026-08-10T04:01:00.000Z" },
    );
    assert.equal(current.summary.currentCount, 1);
    assert.equal(current.items[0].status, "current");
    assert.equal(current.items[0].action, "none");

    await writeFile(
      master,
      "canonical-video-source-changed",
    );
    const changedStats = await stat(master);
    assert.ok(changedStats.size > 0);

    const stale = await buildVideoWebStreamPlan(
      root,
      releaseFixture(),
      capabilities,
      { generatedAt: "2026-08-10T04:02:00.000Z" },
    );
    assert.equal(stale.summary.replaceCount, 1);
    assert.equal(stale.items[0].status, "stale");
    assert.equal(stale.items[0].action, "replace");
    assert.match(
      stale.items[0].reason,
      /older source, profile, or video identity/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("blocks video preparation when required deterministic encoders are unavailable", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "metadata-video-plan-blocked-"),
  );

  try {
    const master = path.join(
      root,
      "releases/2026-08-09_example/videos/video_example/video-master.mp4",
    );
    await mkdir(path.dirname(master), {
      recursive: true,
    });
    await writeFile(master, "video");

    const plan = await buildVideoWebStreamPlan(
      root,
      releaseFixture(),
      {
        ...capabilities,
        encoders: ["aac"],
      },
    );
    assert.equal(plan.summary.blockedCount, 1);
    assert.match(plan.items[0].reason, /libx264 and AAC/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
