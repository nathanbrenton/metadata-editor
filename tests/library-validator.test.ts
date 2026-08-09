import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  formatLibraryValidationReport,
  validateMediaLibrary,
} from "../server/library-validator.js";
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

async function createReleaseFixture(
  options: {
    releaseDirectoryId?: string;
    authoredReleaseId?: string;
    duplicateTrackNumber?: boolean;
  } = {},
): Promise<{
  temporaryRoot: string;
  mediaRoot: string;
  releaseId: string;
  releasePath: string;
}> {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "metadata-validator-"),
  );
  const mediaRoot = await realpath(temporaryRoot);
  const releaseId =
    options.releaseDirectoryId ??
    "2026-08-01_validation-test";
  const releasePath = path.join(
    mediaRoot,
    "releases",
    releaseId,
  );
  const trackIds = [
    "artist_01_first-track",
    "artist_02_second-track",
  ];

  await mkdir(
    path.join(releasePath, "artwork", "front"),
    { recursive: true },
  );

  await writeFile(
    path.join(releasePath, "release.toml"),
    [
      "[schema]",
      'name = "audio-release-metadata"',
      "version = 1",
      "",
      "[release]",
      `id = "${options.authoredReleaseId ?? releaseId}"`,
      'title = "Validation Test"',
      "",
      "[release.primary_artist]",
      'name = "Artist"',
      "",
      "[release.dates]",
      'release = "2026-08-01"',
      'original_release = ""',
      "",
      "[release.numbering]",
      "track_total = 2",
      "disc_total = 1",
      "",
      "[[release.artwork]]",
      'id = "front"',
      'role = "front_cover"',
      "primary = true",
      'master_path = "artwork/front/artwork-master.png"',
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
    path.join(
      releasePath,
      "artwork",
      "front",
      "artwork-master.png",
    ),
    Buffer.from("png"),
  );

  for (let index = 0; index < trackIds.length; index += 1) {
    const trackId = trackIds[index] as string;
    const trackPath = path.join(
      releasePath,
      "tracks",
      trackId,
    );
    const trackNumber =
      options.duplicateTrackNumber ? 1 : index + 1;

    await mkdir(trackPath, { recursive: true });
    await writeFile(
      path.join(trackPath, "audio-master.wav"),
      Buffer.from("audio"),
    );
    await writeFile(
      path.join(trackPath, "track.toml"),
      [
        "[release_reference]",
        `release_id = "${releaseId}"`,
        "",
        "[track]",
        `id = "${trackId}"`,
        `title = "Track ${index + 1}"`,
        "",
        "[track.numbering]",
        `track_number = ${trackNumber}`,
        "track_total = 2",
        "disc_number = 1",
        "disc_total = 1",
        "",
        "[track.assets]",
        'audio_master = "audio-master.wav"',
        'audio_playback = ""',
        'waveform_peaks = ""',
        "",
        "[track.assets.artwork]",
        'master = ""',
        'web = ""',
        'embedded = ""',
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
  }

  return {
    temporaryRoot,
    mediaRoot,
    releaseId,
    releasePath,
  };
}

test("validates a release read-only and reports derivative gaps as warnings", async () => {
  const fixture = await createReleaseFixture();

  try {
    const releaseTomlPath = path.join(
      fixture.releasePath,
      "release.toml",
    );
    const before = await readFile(releaseTomlPath, "utf8");
    const report = await validateMediaLibrary(
      fixture.mediaRoot,
      {
        releaseId: fixture.releaseId,
        generatedAt: "2026-08-01T00:00:00.000Z",
        ffmpegCapabilities: readyCapabilities,
      },
    );

    assert.equal(report.readOnly, true);
    assert.equal(report.scope, "release");
    assert.equal(report.summary.releaseCount, 1);
    assert.equal(report.summary.trackCount, 2);
    assert.equal(report.summary.blockedCount, 0);
    assert.ok(report.summary.warningCount >= 4);
    assert.equal(report.status, "warning");
    assert.match(
      formatLibraryValidationReport(report),
      /Release .* validation: WARNING/,
    );
    assert.equal(
      await readFile(releaseTomlPath, "utf8"),
      before,
    );
  } finally {
    await rm(fixture.temporaryRoot, {
      recursive: true,
      force: true,
    });
  }
});

test("blocks release identity mismatches and duplicate same-disc track numbers", async () => {
  const fixture = await createReleaseFixture({
    authoredReleaseId: "2026-08-01_wrong-id",
    duplicateTrackNumber: true,
  });

  try {
    const report = await validateMediaLibrary(
      fixture.mediaRoot,
      {
        releaseId: fixture.releaseId,
        ffmpegCapabilities: readyCapabilities,
      },
    );
    const codes = new Set(
      report.releases[0]?.issues.map((item) => item.code),
    );

    assert.equal(report.status, "blocked");
    assert.ok(report.summary.blockedCount >= 2);
    assert.equal(
      codes.has("release-id-directory-mismatch"),
      true,
    );
    assert.equal(
      codes.has("duplicate-track-number"),
      true,
    );
  } finally {
    await rm(fixture.temporaryRoot, {
      recursive: true,
      force: true,
    });
  }
});

test("returns a blocked report for an unknown release ID", async () => {
  const fixture = await createReleaseFixture();

  try {
    const report = await validateMediaLibrary(
      fixture.mediaRoot,
      {
        releaseId: "missing-release",
        ffmpegCapabilities: readyCapabilities,
      },
    );

    assert.equal(report.status, "blocked");
    assert.equal(report.summary.releaseCount, 0);
    assert.equal(
      report.issues[0]?.code,
      "release-not-found",
    );
  } finally {
    await rm(fixture.temporaryRoot, {
      recursive: true,
      force: true,
    });
  }
});

test("warns when track artwork points back to release-level artwork", async () => {
  const fixture = await createReleaseFixture();

  try {
    const trackId = "artist_01_first-track";
    const trackTomlPath = path.join(
      fixture.releasePath,
      "tracks",
      trackId,
      "track.toml",
    );
    const content = await readFile(trackTomlPath, "utf8");
    await writeFile(
      trackTomlPath,
      content.replace(
        'master = ""',
        'master = "../../artwork/front/artwork-master.png"',
      ),
    );

    const report = await validateMediaLibrary(
      fixture.mediaRoot,
      {
        releaseId: fixture.releaseId,
        generatedAt: "2026-08-01T00:00:00.000Z",
        ffmpegCapabilities: readyCapabilities,
      },
    );

    const trackIssues =
      report.releases
        .find((release) => release.releaseId === fixture.releaseId)
        ?.tracks.find((track) => track.trackId === trackId)
        ?.issues ?? [];

    assert.ok(
      trackIssues.some(
        (item) =>
          item.code === "nonlocal-track-artwork-reference" &&
          item.severity === "warning",
      ),
    );
  } finally {
    await rm(fixture.temporaryRoot, {
      recursive: true,
      force: true,
    });
  }
});
