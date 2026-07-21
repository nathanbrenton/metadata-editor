import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildMediaProcessingPlan,
  inspectWaveformDocument,
} from "../server/media-processing/plan.js";
import {
  buildMediaProcessingProfile,
} from "../server/media-processing/profile.js";
import {
  generateWaveformPeaksFromWav,
} from "../server/media-processing/waveform-generator.js";
import { scanMediaLibrary } from "../server/scanner.js";
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
      note:
        "The preferred encoder is available.",
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
      note: "Not needed by this test.",
    })),
  ],
  checkedAt: "2026-07-21T00:00:00.000Z",
};

const unavailableCapabilities: FfmpegCapabilities = {
  available: false,
  executable: "ffmpeg",
  encoders: [],
  containers: readyCapabilities.containers.map(
    (container) => ({
      ...container,
      status: "unsupported" as const,
      selectedEncoder: undefined,
    }),
  ),
  checkedAt: "2026-07-21T00:00:00.000Z",
  error: "ffmpeg not found",
};

function createPcm16Wav(): Buffer {
  const sampleRate = 8_000;
  const frameCount = 800;
  const channels = 1;
  const blockAlign = 2;
  const dataSize = frameCount * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(
    sampleRate * blockAlign,
    28,
  );
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);

  for (
    let frame = 0;
    frame < frameCount;
    frame += 1
  ) {
    buffer.writeInt16LE(
      Math.round(
        Math.sin(
          (2 * Math.PI * 440 * frame) /
            sampleRate,
        ) * 20_000,
      ),
      44 + frame * blockAlign,
    );
  }

  return buffer;
}

async function withTemporaryLibrary(
  callback: (
    mediaRoot: string,
    releasePath: string,
    trackPath: string,
  ) => Promise<void>,
): Promise<void> {
  const mediaRoot = await mkdtemp(
    path.join(
      os.tmpdir(),
      "metadata-media-processing-",
    ),
  );
  const releasePath = path.join(
    mediaRoot,
    "releases",
    "2026-07-21_test-release",
  );
  const trackPath = path.join(
    releasePath,
    "tracks",
    "artist_01_test-track",
  );

  try {
    await mkdir(trackPath, {
      recursive: true,
    });
    await callback(
      mediaRoot,
      releasePath,
      trackPath,
    );
  } finally {
    await rm(mediaRoot, {
      recursive: true,
      force: true,
    });
  }
}

async function scanOnlyRelease(
  mediaRoot: string,
) {
  const library = await scanMediaLibrary(
    mediaRoot,
  );
  const release = library.releases[0];

  assert.ok(release);
  return release;
}

test(
  "plans missing MP3 and waveform derivatives without enabling writes",
  async () => {
    await withTemporaryLibrary(
      async (
        mediaRoot,
        _releasePath,
        trackPath,
      ) => {
        await writeFile(
          path.join(
            trackPath,
            "audio-master.wav",
          ),
          createPcm16Wav(),
        );

        const release =
          await scanOnlyRelease(mediaRoot);
        const plan =
          await buildMediaProcessingPlan(
            mediaRoot,
            release,
            readyCapabilities,
            {
              generatedAt:
                "2026-07-21T01:00:00.000Z",
            },
          );

        assert.equal(
          plan.writesEnabled,
          false,
        );
        assert.equal(plan.scope, "all");
        assert.equal(plan.items.length, 1);
        assert.equal(
          plan.items[0]?.master.status,
          "ready",
        );
        assert.equal(
          plan.items[0]?.playback.action,
          "create",
        );
        assert.equal(
          plan.items[0]?.waveform.action,
          "create",
        );
        assert.deepEqual(plan.summary, {
          trackCount: 1,
          currentCount: 0,
          createCount: 2,
          replaceCount: 0,
          blockedCount: 0,
        });
        assert.equal(
          plan.profile.waveform
            .peaksPerSecond,
          400,
        );
        assert.match(
          plan.profile.sha256,
          /^[a-f0-9]{64}$/,
        );
      },
    );
  },
);

test(
  "recognizes current derivatives and marks them stale after the master changes",
  async () => {
    await withTemporaryLibrary(
      async (
        mediaRoot,
        _releasePath,
        trackPath,
      ) => {
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

        await writeFile(masterPath, wav);
        await writeFile(
          playbackPath,
          "playback",
        );
        await writeFile(
          waveformPath,
          `${JSON.stringify(
            generateWaveformPeaksFromWav(
              wav,
              400,
            ),
          )}\n`,
        );

        const oldDate = new Date(
          "2026-07-20T00:00:00.000Z",
        );
        const newDate = new Date(
          "2026-07-21T00:00:00.000Z",
        );

        await utimes(
          masterPath,
          oldDate,
          oldDate,
        );
        await utimes(
          playbackPath,
          newDate,
          newDate,
        );
        await utimes(
          waveformPath,
          newDate,
          newDate,
        );

        const release =
          await scanOnlyRelease(mediaRoot);
        const current =
          await buildMediaProcessingPlan(
            mediaRoot,
            release,
            readyCapabilities,
          );

        assert.equal(
          current.items[0]?.playback.status,
          "current",
        );
        assert.equal(
          current.items[0]?.waveform.status,
          "current",
        );
        assert.equal(
          current.summary.currentCount,
          2,
        );

        const newestDate = new Date(
          "2026-07-22T00:00:00.000Z",
        );
        await utimes(
          masterPath,
          newestDate,
          newestDate,
        );

        const stale =
          await buildMediaProcessingPlan(
            mediaRoot,
            release,
            readyCapabilities,
          );

        assert.equal(
          stale.items[0]?.playback.action,
          "replace",
        );
        assert.equal(
          stale.items[0]?.waveform.action,
          "replace",
        );
        assert.equal(
          stale.summary.replaceCount,
          2,
        );
      },
    );
  },
);

test(
  "marks a mismatched waveform profile stale",
  async () => {
    const profile =
      buildMediaProcessingProfile(400);
    const waveform =
      generateWaveformPeaksFromWav(
        createPcm16Wav(),
        100,
      );
    const inspection =
      inspectWaveformDocument(
        waveform,
        profile.waveform,
      );

    assert.equal(inspection.valid, false);
    assert.ok(
      inspection.checks.some(
        (check) =>
          check.code ===
          "waveform-resolution",
      ),
    );
  },
);

test(
  "blocks derivatives when no audio master exists",
  async () => {
    await withTemporaryLibrary(
      async (mediaRoot) => {
        const release =
          await scanOnlyRelease(mediaRoot);
        const plan =
          await buildMediaProcessingPlan(
            mediaRoot,
            release,
            readyCapabilities,
          );

        assert.equal(
          plan.items[0]?.master.status,
          "missing",
        );
        assert.equal(
          plan.items[0]?.playback.action,
          "blocked",
        );
        assert.equal(
          plan.items[0]?.waveform.action,
          "blocked",
        );
        assert.equal(
          plan.summary.blockedCount,
          2,
        );
      },
    );
  },
);

test(
  "requires FFmpeg for MP3 creation and non-WAV waveform decoding",
  async () => {
    await withTemporaryLibrary(
      async (
        mediaRoot,
        _releasePath,
        trackPath,
      ) => {
        await writeFile(
          path.join(
            trackPath,
            "audio-master.aif",
          ),
          "test",
        );

        const release =
          await scanOnlyRelease(mediaRoot);
        const plan =
          await buildMediaProcessingPlan(
            mediaRoot,
            release,
            unavailableCapabilities,
          );

        assert.equal(
          plan.items[0]?.playback.action,
          "blocked",
        );
        assert.equal(
          plan.items[0]?.waveform.action,
          "blocked",
        );
        assert.match(
          plan.items[0]?.waveform.reason ??
            "",
          /FFmpeg decoding/,
        );
      },
    );
  },
);

test(
  "supports a track-scoped dry-run plan",
  async () => {
    await withTemporaryLibrary(
      async (
        mediaRoot,
        releasePath,
        firstTrackPath,
      ) => {
        await writeFile(
          path.join(
            firstTrackPath,
            "audio-master.wav",
          ),
          createPcm16Wav(),
        );
        const secondTrackPath = path.join(
          releasePath,
          "tracks",
          "artist_02_second-track",
        );
        await mkdir(secondTrackPath, {
          recursive: true,
        });
        await writeFile(
          path.join(
            secondTrackPath,
            "audio-master.wav",
          ),
          createPcm16Wav(),
        );

        const release =
          await scanOnlyRelease(mediaRoot);
        const plan =
          await buildMediaProcessingPlan(
            mediaRoot,
            release,
            readyCapabilities,
            {
              trackId:
                "artist_02_second-track",
              peaksPerSecond: 250,
            },
          );

        assert.equal(plan.scope, "track");
        assert.equal(
          plan.trackId,
          "artist_02_second-track",
        );
        assert.equal(plan.items.length, 1);
        assert.equal(
          plan.items[0]?.trackId,
          "artist_02_second-track",
        );
        assert.equal(
          plan.profile.waveform
            .peaksPerSecond,
          250,
        );
      },
    );
  },
);
