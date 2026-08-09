import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildWebStreamFfmpegArgs,
  buildWebStreamPlan,
  inspectWebStreamDirectory,
  WEB_STREAM_BITRATE_KBPS,
  WEB_STREAM_SEGMENT_DURATION_SECONDS,
} from "../server/media-processing/web-stream.js";
import type {
  MediaProcessingPlan,
} from "../server/media-processing/types.js";
import type {
  FfmpegCapabilities,
} from "../server/types.js";

const capabilities = {
  available: true,
  version: "test",
  executable: "ffmpeg",
  encoders: ["aac"],
  containers: [],
  checkedAt: "2026-08-09T00:00:00.000Z",
} as FfmpegCapabilities;

function mediaPlan(
  modifiedAt = "2026-08-09T00:00:00.000Z",
): MediaProcessingPlan {
  return {
    releaseId: "2026-08-09_release",
    scope: "all",
    generatedAt: "2026-08-09T00:01:00.000Z",
    writesEnabled: false,
    profile: {} as MediaProcessingPlan["profile"],
    items: [
      {
        trackId: "artist_01_track",
        trackRelativePath:
          "releases/2026-08-09_release/tracks/artist_01_track",
        master: {
          status: "ready",
          filename: "audio-master.wav",
          relativePath:
            "releases/2026-08-09_release/tracks/artist_01_track/audio-master.wav",
          extension: ".wav",
          sizeBytes: 100,
          modifiedAt,
          checks: [],
        },
        playback: {} as MediaProcessingPlan["items"][number]["playback"],
        waveform: {} as MediaProcessingPlan["items"][number]["waveform"],
        canProcess: true,
        warnings: [],
      },
    ],
    summary: {
      trackCount: 1,
      currentCount: 0,
      createCount: 0,
      replaceCount: 0,
      blockedCount: 0,
    },
    warnings: [],
  };
}

async function writeValidStream(
  root: string,
  plan: Awaited<ReturnType<typeof buildWebStreamPlan>>,
): Promise<void> {
  const item = plan.items[0];
  const directoryPath = path.join(
    root,
    ...item.directoryRelativePath.split("/"),
  );
  await mkdir(directoryPath, { recursive: true });
  await writeFile(
    path.join(directoryPath, "index.m3u8"),
    [
      "#EXTM3U",
      "#EXT-X-VERSION:7",
      '#EXT-X-MAP:URI="init.mp4"',
      "#EXTINF:3.000000,",
      "segment-00001.m4s",
      "#EXT-X-ENDLIST",
      "",
    ].join("\n"),
  );
  await writeFile(
    path.join(directoryPath, "init.mp4"),
    Buffer.from("init"),
  );
  await writeFile(
    path.join(directoryPath, "segment-00001.m4s"),
    Buffer.from("segment"),
  );
  await writeFile(
    path.join(directoryPath, "stream-info.json"),
    `${JSON.stringify({
      schema: {
        name: "metadata-editor-web-stream",
        version: 1,
      },
      trackId: "artist_01_track",
      generatedAt: "2026-08-09T00:01:00.000Z",
      source: {
        relativePath:
          "releases/2026-08-09_release/tracks/artist_01_track/audio-master.wav",
        modifiedAt: "2026-08-09T00:00:00.000Z",
      },
      profile: plan.profile,
    }, null, 2)}\n`,
  );
}

test("builds the centralized AAC-LC HLS command with short fMP4 segments", () => {
  const args = buildWebStreamFfmpegArgs(
    "/tmp/source.wav",
    "/tmp/stream",
  );

  assert.equal(WEB_STREAM_BITRATE_KBPS, 192);
  assert.equal(WEB_STREAM_SEGMENT_DURATION_SECONDS, 3);
  assert.deepEqual(
    args.slice(args.indexOf("-c:a"), args.indexOf("-c:a") + 2),
    ["-c:a", "aac"],
  );
  assert.ok(args.includes("aac_low"));
  assert.ok(args.includes("192k"));
  assert.ok(args.includes("-hls_time"));
  assert.ok(args.includes("3"));
  assert.ok(args.includes("fmp4"));
  assert.ok(
    args.some((value) => value.endsWith("segment-%05d.m4s")),
  );
  assert.ok(args.at(-1)?.endsWith("index.m3u8"));
  assert.ok(!args.includes("-ar"));
});

test("validates relative HLS resources and rejects unsafe playlist URIs", async () => {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "metadata-web-stream-"),
  );

  try {
    const firstPlan = await buildWebStreamPlan(
      temporaryRoot,
      mediaPlan(),
      capabilities,
    );
    assert.equal(firstPlan.items[0]?.action, "create");

    await writeValidStream(temporaryRoot, firstPlan);
    const inspected = await inspectWebStreamDirectory(
      temporaryRoot,
      firstPlan.items[0].directoryRelativePath,
    );
    assert.equal(inspected.files.length, 3);

    const current = await buildWebStreamPlan(
      temporaryRoot,
      mediaPlan(),
      capabilities,
    );
    assert.equal(current.items[0]?.status, "current");
    assert.equal(current.items[0]?.action, "none");

    const playlistPath = path.join(
      temporaryRoot,
      ...firstPlan.items[0].manifestRelativePath.split("/"),
    );
    await writeFile(
      playlistPath,
      [
        "#EXTM3U",
        '#EXT-X-MAP:URI="init.mp4"',
        "#EXTINF:3,",
        "../master.wav",
        "#EXT-X-ENDLIST",
        "",
      ].join("\n"),
    );

    await assert.rejects(
      inspectWebStreamDirectory(
        temporaryRoot,
        firstPlan.items[0].directoryRelativePath,
      ),
      /unsafe or unexpected segment URI/,
    );
  } finally {
    await rm(temporaryRoot, {
      recursive: true,
      force: true,
    });
  }
});

test("blocks a symbolic-link web-stream target instead of replacing through it", async () => {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "metadata-web-stream-link-"),
  );

  try {
    const firstPlan = await buildWebStreamPlan(
      temporaryRoot,
      mediaPlan(),
      capabilities,
    );
    const directoryPath = path.join(
      temporaryRoot,
      ...firstPlan.items[0].directoryRelativePath.split("/"),
    );
    await mkdir(path.dirname(directoryPath), { recursive: true });
    await symlink(temporaryRoot, directoryPath);

    const blocked = await buildWebStreamPlan(
      temporaryRoot,
      mediaPlan(),
      capabilities,
    );
    assert.equal(blocked.items[0]?.status, "blocked");
    assert.equal(blocked.items[0]?.action, "blocked");
  } finally {
    await rm(temporaryRoot, {
      recursive: true,
      force: true,
    });
  }
});
