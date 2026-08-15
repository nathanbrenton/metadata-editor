import assert from "node:assert/strict";
import {
  access,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
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
} from "../server/publish-plan.js";
import {
  publishReleasePackage,
} from "../server/publish-writer.js";
import {
  listPublishOperations,
} from "../server/publish-operations.js";
import {
  generateWaveformPeaksFromWav,
} from "../server/media-processing/waveform-generator.js";
import {
  buildWebStreamProfile,
  hashWebStreamProfile,
} from "../server/media-processing/web-stream.js";
import type {
  FfmpegCapabilities,
} from "../server/types.js";

const readyCapabilities: FfmpegCapabilities = {
  available: true,
  version: "test",
  executable: "ffmpeg",
  encoders: ["libmp3lame", "aac"],
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
  checkedAt: "2026-08-09T20:00:00.000Z",
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

async function createFixture(): Promise<{
  temporaryRoot: string;
  mediaRoot: string;
  publishRoot: string;
  releaseId: string;
  trackId: string;
  releaseTomlPath: string;
  trackCreditsPath: string;
}> {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "metadata-publish-writer-"),
  );
  const mediaRootPath = path.join(
    temporaryRoot,
    "media-library",
  );
  await mkdir(mediaRootPath, { recursive: true });
  const mediaRoot = await realpath(mediaRootPath);
  const publishRoot = path.join(
    temporaryRoot,
    "published-media",
  );
  const releaseId = "2026-08-09_writer-test";
  const trackId = "artist_01_public-track";
  const releasePath = path.join(
    mediaRoot,
    "releases",
    releaseId,
  );
  const trackPath = path.join(
    releasePath,
    "tracks",
    trackId,
  );
  const releaseTomlPath = path.join(
    releasePath,
    "release.toml",
  );
  const trackCreditsPath = path.join(
    trackPath,
    "track-credits.toml",
  );

  await mkdir(
    path.join(releasePath, "artwork", "front"),
    { recursive: true },
  );
  await mkdir(
    path.join(trackPath, "artwork", "front"),
    { recursive: true },
  );

  await writeFile(
    releaseTomlPath,
    [
      "[schema]",
      'name = "audio-release-metadata"',
      "version = 1",
      "",
      "[release]",
      `id = "${releaseId}"`,
      'title = "Writer Test"',
      'type = "album"',
      "",
      "[release.primary_artist]",
      'name = "Writer Artist"',
      "",
      "[release.dates]",
      'release = "2026-08-09"',
      'original_release = ""',
      "",
      "[release.rights]",
      'copyright = "Copyright © 2026 Beyoncé. All rights reserved."',
      'phonographic_copyright = "Sound Recording Copyright ℗ 2026 Sigur Rós 日本語. All rights reserved."',
      "",
      "[release.numbering]",
      "track_total = 1",
      "disc_total = 1",
      "",
      "[[release.credits.performers]]",
      'name = "Release Performer"',
      'role = "synthesizer"',
      'sort_name = "Performer, Release"',
      "",
      "[[release.artwork]]",
      'id = "front"',
      'role = "front_cover"',
      "primary = true",
      'master_path = "artwork/front/artwork-master.jpg"',
      'web_path = ""',
      'embedded_path = ""',
      'description = "Release cover"',
      "",
    ].join("\n"),
  );
  await writeFile(
    path.join(releasePath, "release-settings.toml"),
    `[release_reference]\nrelease_id = "${releaseId}"\n`,
  );
  await writeFile(
    path.join(releasePath, "release-production-notes.toml"),
    `[release_reference]\nrelease_id = "${releaseId}"\n[production]\nnotes = "private"\n`,
  );
  await writeFile(
    path.join(
      releasePath,
      "artwork",
      "front",
      "artwork-master.jpg",
    ),
    Buffer.from("release artwork"),
  );

  const masterPath = path.join(
    trackPath,
    "audio-master.wav",
  );
  const playbackPath = path.join(
    trackPath,
    "audio-playback.mp3",
  );
  const waveformPath = path.join(
    trackPath,
    "waveform-peaks.json",
  );
  const wav = createPcm16Wav();
  const waveform = generateWaveformPeaksFromWav(wav);

  await writeFile(masterPath, wav);
  await writeFile(playbackPath, Buffer.from("private mp3"));
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
      'description = "Public description"',
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
      "[track.credit_sources]",
      'file = "track-credits.toml"',
      "",
      "[track.production_note_sources]",
      'file = "track-production-notes.toml"',
      "",
    ].join("\n"),
  );
  await writeFile(
    trackCreditsPath,
    [
      "[track_reference]",
      `track_id = "${trackId}"`,
      "",
      "[track.primary_artist]",
      'name = "Writer Artist"',
      'sort_name = "Artist, Writer"',
      "",
      "[[track.performers]]",
      'name = "Track Performer"',
      'role = "guitar"',
      'sort_name = "Performer, Track"',
      "",
      "[[track.samples]]",
      'relationship_type = "sample"',
      'source_title = "Public Source"',
      'credit_text = "Contains a licensed sample."',
      'notes = "private research note"',
      "",
      "[[track.sample_clearances]]",
      "sample_reference = 1",
      'status = "cleared"',
      'agreement_reference = "PRIVATE-CONTRACT-123"',
      'notes = "private clearance note"',
      "editor_only = true",
      "",
    ].join("\n"),
  );
  await writeFile(
    path.join(trackPath, "track-production-notes.toml"),
    `[track_reference]\ntrack_id = "${trackId}"\n[track.production]\nnotes = "private production note"\n`,
  );
  await writeFile(
    path.join(
      trackPath,
      "artwork",
      "front",
      "artwork-master.png",
    ),
    Buffer.from("track artwork"),
  );

  const oldDate = new Date(
    "2026-08-09T20:00:00.000Z",
  );
  const newDate = new Date(
    "2026-08-09T20:01:00.000Z",
  );
  await utimes(masterPath, oldDate, oldDate);
  await utimes(playbackPath, newDate, newDate);
  await utimes(waveformPath, newDate, newDate);

  const streamPath = path.join(trackPath, "stream");
  await mkdir(streamPath, { recursive: true });
  await writeFile(
    path.join(streamPath, "index.m3u8"),
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
    path.join(streamPath, "init.mp4"),
    Buffer.from("init"),
  );
  await writeFile(
    path.join(streamPath, "segment-00001.m4s"),
    Buffer.from("segment"),
  );
  const profileBase = buildWebStreamProfile();
  const profile = {
    ...profileBase,
    sha256: hashWebStreamProfile(profileBase),
  };
  await writeFile(
    path.join(streamPath, "stream-info.json"),
    `${JSON.stringify({
      schema: {
        name: "metadata-editor-web-stream",
        version: 1,
      },
      trackId,
      generatedAt: newDate.toISOString(),
      source: {
        relativePath: path.posix.join(
          "releases",
          releaseId,
          "tracks",
          trackId,
          "audio-master.wav",
        ),
        modifiedAt: oldDate.toISOString(),
      },
      profile,
    }, null, 2)}\n`,
  );

  return {
    temporaryRoot,
    mediaRoot,
    publishRoot,
    releaseId,
    trackId,
    releaseTomlPath,
    trackCreditsPath,
  };
}

async function listFiles(
  root: string,
  relativePath = "",
): Promise<string[]> {
  const directory = path.join(root, relativePath);
  const entries = await readdir(directory, {
    withFileTypes: true,
  });
  const files: string[] = [];

  for (const entry of entries) {
    const next = path.posix.join(
      relativePath,
      entry.name,
    );

    if (entry.isDirectory()) {
      files.push(...await listFiles(root, next));
    } else if (entry.isFile()) {
      files.push(next);
    }
  }

  return files.sort();
}

async function reviewedPlan(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  generatedAt: string,
) {
  return buildPublishPlan(
    fixture.mediaRoot,
    fixture.publishRoot,
    fixture.releaseId,
    {
      generatedAt,
      ffmpegCapabilities: readyCapabilities,
    },
  );
}

test("builds a sanitized HLS public package without canonical/private files", async () => {
  const fixture = await createFixture();

  try {
    const plan = await reviewedPlan(
      fixture,
      "2026-08-09T21:00:00.000Z",
    );

    assert.notEqual(plan.status, "blocked");
    assert.equal(plan.publication.state, "not-published");
    assert.equal(
      plan.publication.currentContentFingerprint.length,
      64,
    );
    assert.ok(plan.metadataInputs.length >= 3);
    assert.ok(
      plan.items.some(
        (item) =>
          item.kind === "track-artwork" &&
          item.sourceSha256,
      ),
    );

    const receipt = await publishReleasePackage(
      fixture.mediaRoot,
      fixture.publishRoot,
      fixture.releaseId,
      {
        expectedPublishPlanFingerprint:
          plan.planFingerprint,
        publishPlanGeneratedAt: plan.generatedAt,
        ffmpegCapabilities: readyCapabilities,
      },
    );

    assert.equal(receipt.mode, "build");
    assert.equal(receipt.trackCount, 1);
    assert.equal(receipt.streamCount, 1);
    assert.equal(receipt.waveformCount, 1);
    assert.equal(receipt.artworkCount, 2);

    const operationHistory = await listPublishOperations(
      fixture.publishRoot,
      { releaseId: fixture.releaseId },
    );
    assert.equal(operationHistory.interruptedCount, 0);
    assert.equal(operationHistory.operations.length, 1);
    assert.equal(operationHistory.operations[0]?.state, "completed");
    assert.equal(operationHistory.operations[0]?.phase, "completed");
    assert.equal(operationHistory.operations[0]?.legacy, false);

    const publicRelease = path.join(
      fixture.publishRoot,
      "releases",
      fixture.releaseId,
    );
    const files = await listFiles(publicRelease);

    assert.ok(files.includes("release.json"));
    assert.ok(files.includes("publication-manifest.json"));
    assert.ok(
      files.includes(
        `tracks/${fixture.trackId}/track.json`,
      ),
    );
    assert.ok(
      files.includes(
        `tracks/${fixture.trackId}/stream/index.m3u8`,
      ),
    );
    assert.ok(
      files.includes(
        `tracks/${fixture.trackId}/waveform-peaks.json`,
      ),
    );
    assert.ok(
      files.includes("artwork/front/artwork.jpg"),
    );
    assert.ok(
      files.includes(
        `tracks/${fixture.trackId}/artwork/front/artwork.png`,
      ),
    );
    assert.ok(
      files.every(
        (file) =>
          !file.endsWith(".toml") &&
          !file.includes("audio-master") &&
          !file.includes("audio-playback") &&
          !file.endsWith("stream-info.json"),
      ),
    );

    const releaseJson = JSON.parse(
      await readFile(
        path.join(publicRelease, "release.json"),
        "utf8",
      ),
    ) as Record<string, any>;
    assert.equal(
      releaseJson.metadata.title,
      "Writer Test",
    );
    assert.equal(
      releaseJson.metadata.rights.copyright,
      "Copyright © 2026 Beyoncé. All rights reserved.",
    );
    assert.equal(
      releaseJson.metadata.rights.phonographic_copyright,
      "Sound Recording Copyright ℗ 2026 Sigur Rós 日本語. All rights reserved.",
    );

    const releaseJsonBytes = await readFile(
      path.join(publicRelease, "release.json"),
    );
    assert.notDeepEqual(
      [...releaseJsonBytes.subarray(0, 3)],
      [0xef, 0xbb, 0xbf],
    );
    const releaseJsonText =
      releaseJsonBytes.toString("utf8");
    assert.match(releaseJsonText, /© 2026 Beyoncé/);
    assert.match(releaseJsonText, /℗ 2026 Sigur Rós 日本語/);
    assert.equal(
      releaseJson.artwork.front.href,
      "artwork/front/artwork.jpg",
    );
    assert.equal(
      releaseJson.metadata.artwork[0].master_path,
      undefined,
    );
    assert.equal(
      releaseJson.metadata.credits.performers[0].name,
      "Release Performer",
    );

    const trackJson = JSON.parse(
      await readFile(
        path.join(
          publicRelease,
          "tracks",
          fixture.trackId,
          "track.json",
        ),
        "utf8",
      ),
    ) as Record<string, any>;
    assert.equal(trackJson.stream.href, "stream/index.m3u8");
    assert.equal(
      trackJson.waveform.href,
      "waveform-peaks.json",
    );
    assert.equal(
      trackJson.artwork.href,
      "artwork/front/artwork.png",
    );
    assert.equal(
      trackJson.artwork.inheritedFromRelease,
      false,
    );
    assert.equal(
      trackJson.credits.performers[0].name,
      "Track Performer",
    );
    assert.equal(trackJson.credits.sample_clearances, undefined);
    assert.equal(trackJson.credits.samples[0].notes, undefined);
    assert.equal(trackJson.metadata.assets, undefined);
    assert.equal(
      JSON.stringify(trackJson).includes("PRIVATE-CONTRACT-123"),
      false,
    );
    assert.equal(
      JSON.stringify(trackJson).includes("private production note"),
      false,
    );

    const manifest = JSON.parse(
      await readFile(
        path.join(
          publicRelease,
          "publication-manifest.json",
        ),
        "utf8",
      ),
    ) as Record<string, any>;
    assert.equal(manifest.releaseId, fixture.releaseId);
    assert.equal(manifest.schema.version, 2);
    assert.equal(
      manifest.sourceContentFingerprint,
      plan.publication.currentContentFingerprint,
    );
    assert.ok(manifest.resources.length > 0);
    assert.ok(
      manifest.resources.every(
        (resource: Record<string, unknown>) =>
          typeof resource.sha256 === "string" &&
          resource.sha256.length === 64,
      ),
    );

    const catalog = JSON.parse(
      await readFile(
        path.join(fixture.publishRoot, "catalog.json"),
        "utf8",
      ),
    ) as Record<string, any>;
    assert.equal(catalog.releases.length, 1);
    assert.equal(catalog.releases[0].id, fixture.releaseId);
    assert.equal(
      catalog.releases[0].title,
      "Writer Test",
    );

    const currentPlan = await reviewedPlan(
      fixture,
      "2026-08-09T21:00:30.000Z",
    );
    assert.equal(
      currentPlan.publication.state,
      "up-to-date",
    );
    assert.ok(currentPlan.publication.publishedAt);
    await assert.rejects(
      publishReleasePackage(
        fixture.mediaRoot,
        fixture.publishRoot,
        fixture.releaseId,
        {
          expectedPublishPlanFingerprint:
            currentPlan.planFingerprint,
          publishPlanGeneratedAt: currentPlan.generatedAt,
          ffmpegCapabilities: readyCapabilities,
        },
      ),
      /already up to date/i,
    );
  } finally {
    await rm(fixture.temporaryRoot, {
      recursive: true,
      force: true,
    });
  }
});

test("updates a public release as a complete snapshot and removes obsolete files", async () => {
  const fixture = await createFixture();

  try {
    const firstPlan = await reviewedPlan(
      fixture,
      "2026-08-09T21:10:00.000Z",
    );
    await publishReleasePackage(
      fixture.mediaRoot,
      fixture.publishRoot,
      fixture.releaseId,
      {
        expectedPublishPlanFingerprint:
          firstPlan.planFingerprint,
        publishPlanGeneratedAt: firstPlan.generatedAt,
        ffmpegCapabilities: readyCapabilities,
      },
    );

    const publicRelease = path.join(
      fixture.publishRoot,
      "releases",
      fixture.releaseId,
    );
    const obsoletePath = path.join(
      publicRelease,
      "obsolete-public-file.txt",
    );
    await writeFile(obsoletePath, "obsolete");

    const releaseToml = await readFile(
      fixture.releaseTomlPath,
      "utf8",
    );
    await writeFile(
      fixture.releaseTomlPath,
      releaseToml.replace(
        'title = "Writer Test"',
        'title = "Writer Test Revised"',
      ),
    );

    const updatePlan = await reviewedPlan(
      fixture,
      "2026-08-09T21:11:00.000Z",
    );
    assert.equal(
      updatePlan.destinationReleaseExists,
      true,
    );
    assert.equal(
      updatePlan.publication.state,
      "update-available",
    );
    assert.ok(
      updatePlan.issues.every(
        (issue) =>
          issue.code !== "existing-public-release",
      ),
    );

    const receipt = await publishReleasePackage(
      fixture.mediaRoot,
      fixture.publishRoot,
      fixture.releaseId,
      {
        expectedPublishPlanFingerprint:
          updatePlan.planFingerprint,
        publishPlanGeneratedAt: updatePlan.generatedAt,
        ffmpegCapabilities: readyCapabilities,
      },
    );

    assert.equal(receipt.mode, "update");
    await assert.rejects(
      access(obsoletePath),
    );

    const catalog = JSON.parse(
      await readFile(
        path.join(fixture.publishRoot, "catalog.json"),
        "utf8",
      ),
    ) as Record<string, any>;
    assert.equal(
      catalog.releases[0].title,
      "Writer Test Revised",
    );

    const currentPlan = await reviewedPlan(
      fixture,
      "2026-08-09T21:11:30.000Z",
    );
    assert.equal(
      currentPlan.publication.state,
      "up-to-date",
    );
  } finally {
    await rm(fixture.temporaryRoot, {
      recursive: true,
      force: true,
    });
  }
});

test("rejects a reviewed publish plan after public metadata changes", async () => {
  const fixture = await createFixture();

  try {
    const plan = await reviewedPlan(
      fixture,
      "2026-08-09T21:20:00.000Z",
    );
    const credits = await readFile(
      fixture.trackCreditsPath,
      "utf8",
    );
    await writeFile(
      fixture.trackCreditsPath,
      credits.replace(
        'name = "Track Performer"',
        'name = "Changed Performer"',
      ),
    );

    await assert.rejects(
      publishReleasePackage(
        fixture.mediaRoot,
        fixture.publishRoot,
        fixture.releaseId,
        {
          expectedPublishPlanFingerprint:
            plan.planFingerprint,
          publishPlanGeneratedAt: plan.generatedAt,
          ffmpegCapabilities: readyCapabilities,
        },
      ),
      /preflight is stale/i,
    );
  } finally {
    await rm(fixture.temporaryRoot, {
      recursive: true,
      force: true,
    });
  }
});

test("refuses to overwrite a non-directory public release target", async () => {
  const fixture = await createFixture();

  try {
    const plan = await reviewedPlan(
      fixture,
      "2026-08-09T21:30:00.000Z",
    );
    const target = path.join(
      fixture.publishRoot,
      "releases",
      fixture.releaseId,
    );
    await mkdir(path.dirname(target), {
      recursive: true,
    });
    await writeFile(target, "collision");

    await assert.rejects(
      publishReleasePackage(
        fixture.mediaRoot,
        fixture.publishRoot,
        fixture.releaseId,
        {
          expectedPublishPlanFingerprint:
            plan.planFingerprint,
          publishPlanGeneratedAt: plan.generatedAt,
          ffmpegCapabilities: readyCapabilities,
        },
      ),
      /ENOTDIR|not a regular directory|destination/i,
    );

    assert.equal(
      await readFile(target, "utf8"),
      "collision",
    );
  } finally {
    await rm(fixture.temporaryRoot, {
      recursive: true,
      force: true,
    });
  }
});
