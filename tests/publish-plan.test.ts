import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildPublishPlan,
  formatPublishPlan,
} from "../server/publish-plan.js";
import {
  generateWaveformPeaksFromWav,
} from "../server/media-processing/waveform-generator.js";
import type {
  FfmpegCapabilities,
} from "../server/types.js";

const readyCapabilities: FfmpegCapabilities = {
  available: true,
  version: "test",
  executable: "ffmpeg",
  encoders: ["libmp3lame"],
  containers: [
    {
      container: "mp3",
      status: "ready",
      preferredEncoder: "libmp3lame",
      selectedEncoder: "libmp3lame",
      fallbackEncoders: ["mp3"],
      note: "ready",
    },
    ...(
      [
        "flac",
        "m4a",
        "ogg-vorbis",
        "opus",
        "wav",
      ] as const
    ).map((container) => ({
      container,
      status: "unsupported" as const,
      preferredEncoder: "unused",
      fallbackEncoders: [],
      note: "not needed",
    })),
  ],
  checkedAt: "2026-08-01T00:00:00.000Z",
};

function createPcm16Wav(): Buffer {
  const sampleRate = 8_000;
  const frameCount = 800;
  const blockAlign = 2;
  const dataSize = frameCount * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * blockAlign, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);

  for (let frame = 0; frame < frameCount; frame += 1) {
    buffer.writeInt16LE(
      Math.round(
        Math.sin((2 * Math.PI * 440 * frame) / sampleRate) * 20_000,
      ),
      44 + frame * blockAlign,
    );
  }

  return buffer;
}

async function createPublishFixture(options: {
  includePlayback?: boolean;
  includeBrowserArtwork?: boolean;
} = {}): Promise<{
  temporaryRoot: string;
  mediaRoot: string;
  publishRoot: string;
  releaseId: string;
}> {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "metadata-publish-plan-"),
  );
  const mediaRoot = await realpath(
    path.join(temporaryRoot, "library"),
  ).catch(async () => {
    await mkdir(path.join(temporaryRoot, "library"), { recursive: true });
    return realpath(path.join(temporaryRoot, "library"));
  });
  const publishRoot = path.join(
    temporaryRoot,
    "published-media",
  );
  const releaseId = "2026-08-01_publish-test";
  const releasePath = path.join(
    mediaRoot,
    "releases",
    releaseId,
  );
  const trackId = "artist_01_public-track";
  const trackPath = path.join(
    releasePath,
    "tracks",
    trackId,
  );
  const artworkExtension = options.includeBrowserArtwork === false
    ? ".tif"
    : ".jpg";
  const artworkFilename = `artwork-master${artworkExtension}`;

  await mkdir(path.join(releasePath, "artwork", "front"), {
    recursive: true,
  });
  await mkdir(trackPath, { recursive: true });

  await writeFile(
    path.join(releasePath, "release.toml"),
    [
      "[schema]",
      'name = "audio-release-metadata"',
      "version = 1",
      "",
      "[release]",
      `id = "${releaseId}"`,
      'title = "Publish Test"',
      "",
      "[release.primary_artist]",
      'name = "Artist"',
      "",
      "[release.dates]",
      'release = "2026-08-01"',
      'original_release = ""',
      "",
      "[release.numbering]",
      "track_total = 1",
      "disc_total = 1",
      "",
      "[[release.artwork]]",
      'id = "front"',
      'role = "front_cover"',
      "primary = true",
      `master_path = "artwork/front/${artworkFilename}"`,
      'web_path = ""',
      'embedded_path = ""',
      "",
    ].join("\n"),
  );
  await writeFile(
    path.join(releasePath, "release-settings.toml"),
    `[release_reference]\nrelease_id = "${releaseId}"\n`,
  );
  await writeFile(
    path.join(releasePath, "release-production-notes.toml"),
    `[release_reference]\nrelease_id = "${releaseId}"\n`,
  );
  await writeFile(
    path.join(releasePath, "artwork", "front", artworkFilename),
    Buffer.from("artwork"),
  );

  const masterPath = path.join(trackPath, "audio-master.wav");
  const playbackPath = path.join(trackPath, "audio-playback.mp3");
  const waveformPath = path.join(trackPath, "waveform-peaks.json");
  const wav = createPcm16Wav();
  const waveform = generateWaveformPeaksFromWav(wav);

  await writeFile(masterPath, wav);

  if (options.includePlayback !== false) {
    await writeFile(playbackPath, Buffer.from("mp3"));
  }

  await writeFile(
    waveformPath,
    `${JSON.stringify(waveform, null, 2)}\n`,
  );
  await writeFile(
    path.join(trackPath, "track.toml"),
    [
      "[release_reference]",
      `release_id = "${releaseId}"`,
      "",
      "[track]",
      `id = "${trackId}"`,
      'title = "Public Track"',
      "",
      "[track.numbering]",
      "track_number = 1",
      "track_total = 1",
      "disc_number = 1",
      "disc_total = 1",
      "",
      "[track.assets]",
      'audio_master = "audio-master.wav"',
      'audio_playback = "audio-playback.mp3"',
      'waveform_peaks = "waveform-peaks.json"',
      "",
      "[track.dates]",
      'release = "2026-08-01"',
      'original_release = ""',
      "",
    ].join("\n"),
  );
  await writeFile(
    path.join(trackPath, "track-credits.toml"),
    `[track_reference]\ntrack_id = "${trackId}"\n`,
  );
  await writeFile(
    path.join(trackPath, "track-production-notes.toml"),
    `[track_reference]\ntrack_id = "${trackId}"\n`,
  );

  const oldDate = new Date("2026-08-01T00:00:00.000Z");
  const newDate = new Date("2026-08-01T00:01:00.000Z");
  await utimes(masterPath, oldDate, oldDate);

  if (options.includePlayback !== false) {
    await utimes(playbackPath, newDate, newDate);
  }
  await utimes(waveformPath, newDate, newDate);

  return {
    temporaryRoot,
    mediaRoot,
    publishRoot,
    releaseId,
  };
}

test("builds a read-only audio-player package plan for a publishable release", async () => {
  const fixture = await createPublishFixture();

  try {
    const plan = await buildPublishPlan(
      fixture.mediaRoot,
      fixture.publishRoot,
      fixture.releaseId,
      {
        generatedAt: "2026-08-01T01:00:00.000Z",
        ffmpegCapabilities: readyCapabilities,
      },
    );

    assert.equal(plan.readOnly, true);
    assert.equal(plan.writesEnabled, false);
    assert.notEqual(plan.status, "blocked");
    assert.equal(plan.summary.blockedCount, 0);
    assert.ok(
      plan.items.some(
        (item) => item.kind === "track-playback" && item.action === "create",
      ),
    );
    assert.ok(
      plan.items.some(
        (item) => item.kind === "track-waveform" && item.action === "create",
      ),
    );
    assert.ok(
      plan.items.some(
        (item) => item.kind === "catalog" && item.action === "update",
      ),
    );
    assert.match(formatPublishPlan(plan), /Writes enabled: no/);
  } finally {
    await rm(fixture.temporaryRoot, {
      recursive: true,
      force: true,
    });
  }
});

test("blocks publish when playback media is missing", async () => {
  const fixture = await createPublishFixture({
    includePlayback: false,
  });

  try {
    const plan = await buildPublishPlan(
      fixture.mediaRoot,
      fixture.publishRoot,
      fixture.releaseId,
      {
        generatedAt: "2026-08-01T01:00:00.000Z",
        ffmpegCapabilities: readyCapabilities,
      },
    );

    assert.equal(plan.status, "blocked");
    assert.ok(
      plan.issues.some((item) => item.code === "playback-not-current"),
    );
    assert.ok(
      plan.items.some(
        (item) => item.kind === "track-playback" && item.action === "blocked",
      ),
    );
  } finally {
    await rm(fixture.temporaryRoot, {
      recursive: true,
      force: true,
    });
  }
});

test("blocks archival-only artwork until a browser derivative exists", async () => {
  const fixture = await createPublishFixture({
    includeBrowserArtwork: false,
  });

  try {
    const plan = await buildPublishPlan(
      fixture.mediaRoot,
      fixture.publishRoot,
      fixture.releaseId,
      {
        generatedAt: "2026-08-01T01:00:00.000Z",
        ffmpegCapabilities: readyCapabilities,
      },
    );

    assert.equal(plan.status, "blocked");
    assert.ok(
      plan.issues.some((item) => item.code === "browser-artwork-required"),
    );
  } finally {
    await rm(fixture.temporaryRoot, {
      recursive: true,
      force: true,
    });
  }
});
