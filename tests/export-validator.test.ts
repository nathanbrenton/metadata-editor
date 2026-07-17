import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  validateMetadataExportPlan,
} from "../server/export-validator.js";
import type {
  FfmpegCapabilities,
  MetadataExportPlan,
} from "../server/types.js";

function capabilities(
  status:
    | "ready"
    | "fallback-required"
    | "unsupported" = "ready",
): FfmpegCapabilities {
  return {
    available: true,
    version: "test",
    executable: "ffmpeg",
    encoders: ["libmp3lame"],
    checkedAt: new Date(0).toISOString(),
    containers: [{
      container: "mp3",
      status,
      preferredEncoder: "libmp3lame",
      ...(status !== "unsupported"
        ? { selectedEncoder: "libmp3lame" }
        : {}),
      fallbackEncoders: ["mp3"],
      note: "test capability",
    }],
  };
}

function plan(
  destination =
    "deployment-output/metadata-export/song.mp3",
): MetadataExportPlan {
  return {
    releaseId: "2026-01-01_test",
    container: "mp3",
    scope: "all",
    outputDirectory:
      "deployment-output/metadata-export",
    items: [{
      trackId: "01_song",
      sourceAudioRelativePath:
        "releases/2026-01-01_test/tracks/01_song/master.wav",
      destinationRelativePath: destination,
      action: "ready",
      fields: [],
      warnings: [],
    }],
    summary: {
      readyCount: 1,
      blockedCount: 0,
      writeCount: 0,
      normalizedCount: 0,
      omittedCount: 0,
      unverifiedCount: 0,
    },
    warnings: [],
  };
}

test(
  "passes readable source and unused destination",
  async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), "export-validator-"),
    );
    const mediaRoot = path.join(root, "media");
    const outputRoot = path.join(
      root,
      "deployment-output",
    );
    const source = path.join(
      mediaRoot,
      "releases/2026-01-01_test/tracks/01_song/master.wav",
    );

    await mkdir(path.dirname(source), {
      recursive: true,
    });
    await mkdir(outputRoot, {
      recursive: true,
    });
    await writeFile(source, "audio");

    const result =
      await validateMetadataExportPlan(
        plan(),
        mediaRoot,
        capabilities(),
        outputRoot,
      );

    assert.equal(result.canExport, true);
    assert.equal(
      result.summary.readyCount,
      1,
    );
    assert.equal(
      result.summary.blockedCount,
      0,
    );
  },
);

test(
  "blocks an existing destination",
  async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), "export-validator-"),
    );
    const mediaRoot = path.join(root, "media");
    const outputRoot = path.join(
      root,
      "deployment-output",
    );
    const source = path.join(
      mediaRoot,
      "releases/2026-01-01_test/tracks/01_song/master.wav",
    );
    const destination = path.join(
      outputRoot,
      "metadata-export/song.mp3",
    );

    await mkdir(path.dirname(source), {
      recursive: true,
    });
    await mkdir(path.dirname(destination), {
      recursive: true,
    });
    await writeFile(source, "audio");
    await writeFile(destination, "existing");

    const result =
      await validateMetadataExportPlan(
        plan(),
        mediaRoot,
        capabilities(),
        outputRoot,
      );

    assert.equal(result.canExport, false);
    assert.equal(
      result.items[0]?.checks.some(
        (check) =>
          check.code ===
            "destination-collision" &&
          check.status === "blocked",
      ),
      true,
    );
  },
);

test(
  "blocks destinations outside the output root",
  async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), "export-validator-"),
    );
    const mediaRoot = path.join(root, "media");
    const outputRoot = path.join(
      root,
      "deployment-output",
    );
    const source = path.join(
      mediaRoot,
      "releases/2026-01-01_test/tracks/01_song/master.wav",
    );

    await mkdir(path.dirname(source), {
      recursive: true,
    });
    await mkdir(outputRoot, {
      recursive: true,
    });
    await writeFile(source, "audio");

    const result =
      await validateMetadataExportPlan(
        plan("../escape.mp3"),
        mediaRoot,
        capabilities(),
        outputRoot,
      );

    assert.equal(result.canExport, false);
    assert.equal(
      result.items[0]?.checks.some(
        (check) =>
          check.code ===
            "destination-confinement" &&
          check.status === "blocked",
      ),
      true,
    );
  },
);

test(
  "reports fallback encoder as a warning",
  async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), "export-validator-"),
    );
    const mediaRoot = path.join(root, "media");
    const outputRoot = path.join(
      root,
      "deployment-output",
    );
    const source = path.join(
      mediaRoot,
      "releases/2026-01-01_test/tracks/01_song/master.wav",
    );

    await mkdir(path.dirname(source), {
      recursive: true,
    });
    await mkdir(outputRoot, {
      recursive: true,
    });
    await writeFile(source, "audio");

    const result =
      await validateMetadataExportPlan(
        plan(),
        mediaRoot,
        capabilities("fallback-required"),
        outputRoot,
      );

    assert.equal(result.canExport, true);
    assert.equal(
      result.summary.warningCount,
      1,
    );
  },
);
