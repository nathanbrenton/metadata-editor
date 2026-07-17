import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  EXPORT_CONFIRMATION_PHRASE,
  executeValidatedExportPlan,
} from "../server/export-executor.js";
import type {
  FfmpegCapabilities,
  MetadataExportPlan,
} from "../server/types.js";

function capabilities(): FfmpegCapabilities {
  return {
    available: true,
    executable: "ffmpeg",
    encoders: ["libmp3lame"],
    checkedAt: new Date(0).toISOString(),
    containers: [
      {
        container: "mp3",
        status: "ready",
        preferredEncoder: "libmp3lame",
        selectedEncoder: "libmp3lame",
        fallbackEncoders: [],
        note:
          "The preferred encoder is available.",
      },
    ],
  };
}

function plan(): MetadataExportPlan {
  return {
    releaseId: "2026-01-01_test",
    container: "mp3",
    scope: "all",
    outputDirectory:
      "deployment-output/test",
    warnings: [],
    summary: {
      readyCount: 1,
      blockedCount: 0,
      writeCount: 1,
      normalizedCount: 0,
      omittedCount: 0,
      unverifiedCount: 0,
    },
    items: [
      {
        trackId: "artist_01_track",
        action: "ready",
        sourceAudioRelativePath:
          "releases/2026-01-01_test/tracks/artist_01_track/audio-master.wav",
        destinationRelativePath:
          "deployment-output/test/artist_01_track.mp3",
        warnings: [],
        fields: [
          {
            canonicalPath: "track.title",
            label: "Title",
            targetTags: ["title"],
            value: "Track",
            status: "write",
            note: "",
            sourceDocument: "track.toml",
          },
        ],
      },
    ],
  };
}

test(
  "requires the exact confirmation phrase",
  async () => {
    await assert.rejects(
      executeValidatedExportPlan(
        plan(),
        "/tmp/media",
        "/tmp/output",
        capabilities(),
        "wrong",
        async () => undefined,
      ),
      /CREATE_VALIDATED_EXPORTS/,
    );
  },
);

test(
  "creates a destination and SHA-256 receipt without overwriting",
  async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), "export-executor-"),
    );
    const mediaRoot = path.join(root, "media");
    const outputRoot = path.join(root, "deployment-output");
    const sourcePath = path.join(
      mediaRoot,
      "releases/2026-01-01_test/tracks/artist_01_track/audio-master.wav",
    );

    await mkdir(path.dirname(sourcePath), {
      recursive: true,
    });
    await mkdir(outputRoot, {
      recursive: true,
    });
    await writeFile(sourcePath, "source");

    const runCommand = async (
      _executable: string,
      args: string[],
    ) => {
      const temporaryPath =
        args[args.length - 1];
      await writeFile(
        temporaryPath,
        "encoded",
        { flag: "wx" },
      );
    };

    const result =
      await executeValidatedExportPlan(
        plan(),
        mediaRoot,
        outputRoot,
        capabilities(),
        EXPORT_CONFIRMATION_PHRASE,
        runCommand,
      );

    assert.equal(
      result.summary.createdCount,
      1,
    );
    assert.equal(
      result.items[0].status,
      "created",
    );
    assert.match(
      result.items[0].sha256 ?? "",
      /^[a-f0-9]{64}$/,
    );

    const destination = path.join(
      outputRoot,
      "test/artist_01_track.mp3",
    );
    assert.equal(
      await readFile(destination, "utf8"),
      "encoded",
    );

    const second =
      await executeValidatedExportPlan(
        plan(),
        mediaRoot,
        outputRoot,
        capabilities(),
        EXPORT_CONFIRMATION_PHRASE,
        runCommand,
      );

    assert.equal(
      second.summary.failedCount,
      1,
    );
    assert.match(
      second.items[0].error ?? "",
      /already exists/,
    );
    assert.equal(
      await readFile(destination, "utf8"),
      "encoded",
    );
  },
);
