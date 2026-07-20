import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  parse,
} from "smol-toml";

import {
  createDefaultIngestBuildDraft,
} from "../shared/ingest-builder.js";
import type {
  IngestCandidateInspection,
  IngestFileInspection,
} from "../shared/ingest-types.js";
import {
  executeIngestReleaseBuild,
  prepareIngestReleaseBuild,
} from "../server/ingest-builder.js";

async function createFixture() {
  const root = await mkdtemp(
    path.join(
      os.tmpdir(),
      "metadata-ingest-builder-",
    ),
  );
  const ingestRoot = path.join(
    root,
    "ingest-drop",
  );
  const outputRoot = path.join(
    root,
    "demo-media",
  );
  const candidateId = "session";
  const candidateRoot = path.join(
    ingestRoot,
    candidateId,
  );
  const sourcePath = path.join(
    candidateRoot,
    "160726_Pixels_v0.m4a",
  );
  const imagePath = path.join(
    candidateRoot,
    "cover.jpg",
  );
  const textPath = path.join(
    candidateRoot,
    "notes.txt",
  );

  await mkdir(candidateRoot, {
    recursive: true,
  });
  await mkdir(outputRoot, {
    recursive: true,
  });
  await writeFile(
    sourcePath,
    Buffer.from(
      "fake-m4a-source-bytes",
      "utf8",
    ),
  );
  await writeFile(
    imagePath,
    Buffer.from(
      "fake-image-source-bytes",
      "utf8",
    ),
  );
  await writeFile(
    textPath,
    "source notes\n",
    "utf8",
  );

  const fileInspection = async (
    filename: string,
    mediaKind:
      | "audio"
      | "image"
      | "text",
  ): Promise<IngestFileInspection> => {
    const source = path.join(
      candidateRoot,
      filename,
    );
    const stats = await stat(source);

    return {
      relativePath:
        `${candidateId}/${filename}`,
      filename,
      extension:
        path.extname(filename),
      sizeBytes: stats.size,
      modifiedAt:
        stats.mtime.toISOString(),
      mediaKind,
      detectedBy:
        mediaKind === "audio"
          ? "ffprobe"
          : "extension",
      technical: {},
      embeddedMetadata:
        mediaKind === "audio"
          ? {
              artist: "Nathan Brenton",
              title: "Pixels",
            }
          : {},
      evidence:
        mediaKind === "audio"
          ? [
              {
                field: "date",
                value: "2016-07-26",
                source: "filename",
                rawValue: filename,
                confidence: "high",
                rule:
                  "date-yymmdd-anchor-v1",
              },
              {
                field: "track.title",
                value: "Pixels",
                source: "filename",
                rawValue: filename,
                confidence: "high",
                rule:
                  "filename-title-v1",
              },
              {
                field: "track.version",
                value: "v0",
                source: "filename",
                rawValue: filename,
                confidence: "high",
                rule:
                  "filename-version-suffix-v1",
              },
            ]
          : [],
      warnings: [],
    };
  };

  const files = await Promise.all([
    fileInspection(
      "160726_Pixels_v0.m4a",
      "audio",
    ),
    fileInspection(
      "cover.jpg",
      "image",
    ),
    fileInspection(
      "notes.txt",
      "text",
    ),
  ]);

  const inspection:
    IngestCandidateInspection = {
      inspectedAt:
        "2026-07-20T00:00:00.000Z",
      candidate: {
        id: candidateId,
        name: candidateId,
        relativePath: candidateId,
        kind: "folder",
        displayTitle: "Pixels",
        fileCount: 3,
        audioCount: 1,
        imageCount: 1,
        textCount: 1,
        unknownCount: 0,
        totalSizeBytes: files.reduce(
          (total, file) =>
            total + file.sizeBytes,
          0,
        ),
        extensions: [
          ".jpg",
          ".m4a",
          ".txt",
        ],
        dateCandidates: [
          "2016-07-26",
        ],
        evidence: [
          {
            field: "date",
            value: "2016-07-26",
            source: "foldername",
            rawValue: candidateId,
            confidence: "high",
            rule:
              "date-yyyy-mm-dd-v1",
          },
          {
            field: "release.title",
            value: "Pixels",
            source: "foldername",
            rawValue: candidateId,
            confidence: "medium",
            rule:
              "folder-first-segment-title-v1",
          },
        ],
        warnings: [],
      },
      files,
      capabilities: {
        ffprobe: {
          available: true,
        },
        mediainfo: {
          available: true,
        },
      },
      warnings: [],
      readOnly: true,
    };

  const draft =
    createDefaultIngestBuildDraft(
      inspection,
    );

  draft.releaseArtist =
    "Nathan Brenton";
  draft.tracks = draft.tracks.map(
    (track) => ({
      ...track,
      artist: "Nathan Brenton",
    }),
  );

  return {
    root,
    ingestRoot,
    outputRoot,
    sourcePath,
    imagePath,
    textPath,
    inspection,
    draft,
  };
}

test(
  "plans a fresh release with copied media and six TOMLs per track",
  async (t) => {
    const fixture =
      await createFixture();

    t.after(async () => {
      await rm(fixture.root, {
        recursive: true,
        force: true,
      });
    });

    const prepared =
      await prepareIngestReleaseBuild(
        fixture.ingestRoot,
        fixture.outputRoot,
        fixture.inspection,
        fixture.draft,
      );

    assert.equal(
      prepared.preview.releaseRelativePath,
      "releases/2016-07-26_pixels",
    );
    assert.equal(
      prepared.preview.summary.trackCount,
      1,
    );
    assert.equal(
      prepared.preview.summary.copiedFileCount,
      3,
    );
    assert.equal(
      prepared.preview.summary.tomlCount,
      6,
    );
    assert.equal(
      prepared.preview.summary.blockedCount,
      0,
    );

    const audioCopy =
      prepared.preview.items.find(
        (item) =>
          item.kind === "copy" &&
          item.mediaKind === "audio",
      );

    assert.equal(
      audioCopy?.destinationRelativePath,
      "releases/2016-07-26_pixels/tracks/nathan-brenton_01_pixels-v0/audio-master.m4a",
    );
    assert.deepEqual(
      audioCopy?.logicalRoles,
      [
        "audio-master",
        "audio-player-source",
      ],
    );

    assert.ok(
      prepared.preview.items.some(
        (item) =>
          item.destinationRelativePath ===
          "releases/2016-07-26_pixels/artwork/front/artwork-master.jpg",
      ),
    );
    assert.ok(
      prepared.preview.items.some(
        (item) =>
          item.destinationRelativePath ===
          "releases/2016-07-26_pixels/notes/imported/notes.txt",
      ),
    );
  },
);

test(
  "copies and renames sources, writes templates, verifies hashes, and preserves sources",
  async (t) => {
    const fixture =
      await createFixture();

    t.after(async () => {
      await rm(fixture.root, {
        recursive: true,
        force: true,
      });
    });

    const sourceBefore =
      await readFile(
        fixture.sourcePath,
      );
    const result =
      await executeIngestReleaseBuild(
        fixture.ingestRoot,
        fixture.outputRoot,
        fixture.inspection,
        fixture.draft,
        "CREATE_STAGING_RELEASE",
      );
    const releaseRoot = path.join(
      fixture.outputRoot,
      result.releaseRelativePath,
    );
    const trackRoot = path.join(
      releaseRoot,
      "tracks",
      "nathan-brenton_01_pixels-v0",
    );
    const copiedAudio =
      await readFile(
        path.join(
          trackRoot,
          "audio-master.m4a",
        ),
      );

    assert.deepEqual(
      copiedAudio,
      sourceBefore,
    );
    assert.deepEqual(
      await readFile(
        fixture.sourcePath,
      ),
      sourceBefore,
    );

    for (const filename of [
      "release.toml",
      "release-settings.toml",
      "release-production-notes.toml",
    ]) {
      parse(
        await readFile(
          path.join(
            releaseRoot,
            filename,
          ),
          "utf8",
        ),
      );
    }

    const releaseToml = parse(
      await readFile(
        path.join(
          releaseRoot,
          "release.toml",
        ),
        "utf8",
      ),
    ) as {
      release?: {
        primary_artist?: {
          name?: string;
        };
      };
    };

    assert.equal(
      releaseToml.release
        ?.primary_artist?.name,
      "Nathan Brenton",
    );

    const releaseSettings = parse(
      await readFile(
        path.join(
          releaseRoot,
          "release-settings.toml",
        ),
        "utf8",
      ),
    ) as {
      settings?: {
        inheritance?: {
          release_artwork_fallback_path?: string;
        };
      };
    };

    assert.equal(
      releaseSettings.settings
        ?.inheritance
        ?.release_artwork_fallback_path,
      "artwork/front/artwork-master.jpg",
    );

    for (const filename of [
      "track.toml",
      "track-credits.toml",
      "track-production-notes.toml",
    ]) {
      parse(
        await readFile(
          path.join(
            trackRoot,
            filename,
          ),
          "utf8",
        ),
      );
    }

    const trackToml = parse(
      await readFile(
        path.join(
          trackRoot,
          "track.toml",
        ),
        "utf8",
      ),
    ) as {
      track?: {
        assets?: {
          audio_master?: string;
          audio_playback?: string;
        };
        numbering?: {
          track_total?: number;
        };
      };
    };

    assert.equal(
      trackToml.track?.assets
        ?.audio_master,
      "audio-master.m4a",
    );
    assert.equal(
      trackToml.track?.assets
        ?.audio_playback,
      "audio-master.m4a",
    );
    assert.equal(
      trackToml.track?.numbering
        ?.track_total,
      1,
    );

    const receipt = JSON.parse(
      await readFile(
        path.join(
          releaseRoot,
          "ingest-receipt.json",
        ),
        "utf8",
      ),
    ) as {
      copyReceipts?: Array<{
        sourceSha256: string;
        destinationSha256: string;
      }>;
    };

    assert.equal(
      receipt.copyReceipts?.length,
      3,
    );
    assert.equal(
      receipt.copyReceipts?.[0]
        ?.sourceSha256,
      receipt.copyReceipts?.[0]
        ?.destinationSha256,
    );
  },
);

test(
  "refuses an existing release and a changed inspected source",
  async (t) => {
    const fixture =
      await createFixture();

    t.after(async () => {
      await rm(fixture.root, {
        recursive: true,
        force: true,
      });
    });

    await mkdir(
      path.join(
        fixture.outputRoot,
        "releases",
        fixture.draft.releaseId,
      ),
      {
        recursive: true,
      },
    );

    const blocked =
      await prepareIngestReleaseBuild(
        fixture.ingestRoot,
        fixture.outputRoot,
        fixture.inspection,
        fixture.draft,
      );

    assert.ok(
      blocked.preview.summary
        .blockedCount > 0,
    );

    await rm(
      path.join(
        fixture.outputRoot,
        "releases",
      ),
      {
        recursive: true,
        force: true,
      },
    );

    await writeFile(
      fixture.sourcePath,
      "changed source bytes",
      "utf8",
    );

    await assert.rejects(
      prepareIngestReleaseBuild(
        fixture.ingestRoot,
        fixture.outputRoot,
        fixture.inspection,
        fixture.draft,
      ),
      /changed after inspection/i,
    );
  },
);
