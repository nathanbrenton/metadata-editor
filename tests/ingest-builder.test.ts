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
  INGEST_BUILD_CONFIRMATION_PHRASE,
  INGEST_UPDATE_CONFIRMATION_PHRASE,
  createDefaultIngestBuildDraft,
  type IngestBuildDraft,
} from "../shared/ingest-builder.js";
import type {
  IngestCandidateInspection,
  IngestFileInspection,
} from "../shared/ingest-types.js";
import {
  executeIngestReleaseBuild as executeIngestReleaseBuildReal,
  inspectIngestStagingTarget,
  prepareIngestReleaseBuild,
} from "../server/ingest-builder.js";

async function executeIngestReleaseBuild(
  ingestRoot: string,
  outputRoot: string,
  inspection: IngestCandidateInspection,
  draft: IngestBuildDraft,
  confirmation: string,
  outputRootLabel?: string,
) {
  return executeIngestReleaseBuildReal(
    ingestRoot,
    outputRoot,
    inspection,
    draft,
    confirmation,
    outputRootLabel,
    {
      waveformWriter: async (
        _masterPath,
        waveformPath,
      ) => {
        await writeFile(
          waveformPath,
          '{"testWaveform":true}\n',
          "utf8",
        );
      },
    },
  );
}

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
        videoCount: 0,
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
  "requires an ingest receipt before updating an existing release and still rejects changed inspected sources",
  async (t) => {
    const fixture = await createFixture();

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

    await assert.rejects(
      prepareIngestReleaseBuild(
        fixture.ingestRoot,
        fixture.outputRoot,
        fixture.inspection,
        fixture.draft,
      ),
      /ingest-receipt\.json is missing/i,
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

test(
  "adds and reorders tracks while preserving stable IDs and authored metadata",
  async (t) => {
    const fixture = await createFixture();

    t.after(async () => {
      await rm(fixture.root, {
        recursive: true,
        force: true,
      });
    });

    const created = await executeIngestReleaseBuild(
      fixture.ingestRoot,
      fixture.outputRoot,
      fixture.inspection,
      fixture.draft,
      INGEST_BUILD_CONFIRMATION_PHRASE,
    );

    assert.equal(created.operation, "create");

    const releaseRoot = path.join(
      fixture.outputRoot,
      created.releaseRelativePath,
    );
    const initialReceipt = JSON.parse(
      await readFile(
        path.join(releaseRoot, "ingest-receipt.json"),
        "utf8",
      ),
    ) as {
      tracks: Array<{
        id: string;
        sourceRelativePath: string;
        destinationRelativePath: string;
      }>;
    };
    const originalTrack = initialReceipt.tracks[0];
    const originalTrackRoot = path.join(
      fixture.outputRoot,
      path.posix.dirname(
        originalTrack.destinationRelativePath,
      ),
    );
    const originalTrackTomlPath = path.join(
      originalTrackRoot,
      "track.toml",
    );
    await writeFile(
      originalTrackTomlPath,
      `${await readFile(originalTrackTomlPath, "utf8")}\n[editor]\ncustom_note = "preserve me"\n`,
      "utf8",
    );

    const secondFilename = "160726_New_Song_v1.m4a";
    const secondSourcePath = path.join(
      fixture.ingestRoot,
      fixture.inspection.candidate.id,
      secondFilename,
    );
    await writeFile(
      secondSourcePath,
      "second-fake-m4a-source-bytes",
      "utf8",
    );
    const secondStats = await stat(secondSourcePath);
    const firstAudio = fixture.inspection.files.find(
      (file) => file.mediaKind === "audio",
    );
    assert.ok(firstAudio);

    const secondInspection: IngestFileInspection = {
      ...firstAudio,
      relativePath: `${fixture.inspection.candidate.id}/${secondFilename}`,
      filename: secondFilename,
      sizeBytes: secondStats.size,
      modifiedAt: secondStats.mtime.toISOString(),
      embeddedMetadata: {
        artist: "Nathan Brenton",
        title: "New Song",
      },
      evidence: [
        {
          field: "date",
          value: "2016-07-26",
          source: "filename",
          rawValue: secondFilename,
          confidence: "high",
          rule: "date-yymmdd-anchor-v1",
        },
        {
          field: "track.title",
          value: "New Song",
          source: "filename",
          rawValue: secondFilename,
          confidence: "high",
          rule: "filename-title-v1",
        },
      ],
    };
    const updateInspection: IngestCandidateInspection = {
      ...fixture.inspection,
      files: [
        ...fixture.inspection.files,
        secondInspection,
      ],
      candidate: {
        ...fixture.inspection.candidate,
        fileCount:
          fixture.inspection.candidate.fileCount + 1,
        audioCount:
          fixture.inspection.candidate.audioCount + 1,
        totalSizeBytes:
          fixture.inspection.candidate.totalSizeBytes +
          secondStats.size,
      },
    };
    const updateDraft = createDefaultIngestBuildDraft(
      updateInspection,
    );
    updateDraft.releaseArtist = "Nathan Brenton";
    updateDraft.tracks = updateDraft.tracks.map((track) => ({
      ...track,
      artist: "Nathan Brenton",
      trackNumber:
        track.sourceRelativePath ===
        originalTrack.sourceRelativePath
          ? 2
          : 1,
    }));

    const status = await inspectIngestStagingTarget(
      fixture.outputRoot,
      updateDraft.releaseId,
    );
    assert.equal(status.operation, "update");
    assert.equal(status.exists, true);

    const prepared = await prepareIngestReleaseBuild(
      fixture.ingestRoot,
      fixture.outputRoot,
      updateInspection,
      updateDraft,
    );

    assert.equal(prepared.preview.operation, "update");
    assert.equal(
      prepared.preview.summary.addedTrackCount,
      1,
    );
    assert.equal(
      prepared.preview.summary.reorderedTrackCount,
      1,
    );
    assert.equal(
      prepared.preview.summary.removedFileCount,
      0,
    );
    assert.ok(
      prepared.preview.items.some(
        (item) => item.action === "add",
      ),
    );
    assert.ok(
      prepared.preview.items.some(
        (item) => item.action === "reorder",
      ),
    );
    assert.ok(
      prepared.preview.items.some(
        (item) => item.action === "preserve",
      ),
    );
    assert.ok(
      prepared.preview.items.some(
        (item) =>
          item.destinationRelativePath ===
            path.posix.dirname(
              originalTrack.destinationRelativePath,
            ) &&
          item.adjustment?.includes(originalTrack.id),
      ),
    );

    await assert.rejects(
      executeIngestReleaseBuild(
        fixture.ingestRoot,
        fixture.outputRoot,
        updateInspection,
        updateDraft,
        INGEST_BUILD_CONFIRMATION_PHRASE,
      ),
      /UPDATE_STAGING_RELEASE/,
    );

    const updated = await executeIngestReleaseBuild(
      fixture.ingestRoot,
      fixture.outputRoot,
      updateInspection,
      updateDraft,
      INGEST_UPDATE_CONFIRMATION_PHRASE,
    );

    assert.equal(updated.operation, "update");
    assert.ok(updated.createdFiles.length > 0);
    assert.ok(updated.updatedFiles.length > 0);
    assert.ok(updated.preservedFiles.length > 0);

    const preservedTrackToml = parse(
      await readFile(originalTrackTomlPath, "utf8"),
    ) as {
      track?: {
        numbering?: {
          track_number?: number;
          track_total?: number;
        };
      };
      editor?: {
        custom_note?: string;
      };
    };
    assert.equal(
      preservedTrackToml.track?.numbering?.track_number,
      2,
    );
    assert.equal(
      preservedTrackToml.track?.numbering?.track_total,
      2,
    );
    assert.equal(
      preservedTrackToml.editor?.custom_note,
      "preserve me",
    );

    const updatedReceipt = JSON.parse(
      await readFile(
        path.join(releaseRoot, "ingest-receipt.json"),
        "utf8",
      ),
    ) as {
      tracks: Array<{
        id: string;
        number: number;
        sourceRelativePath: string;
      }>;
      updates?: unknown[];
    };
    assert.equal(updatedReceipt.tracks.length, 2);
    assert.equal(
      updatedReceipt.tracks.find(
        (track) =>
          track.sourceRelativePath ===
          originalTrack.sourceRelativePath,
      )?.id,
      originalTrack.id,
    );
    assert.equal(updatedReceipt.updates?.length, 1);
  },
);

test(
  "preserves existing Library tracks when a later ingest candidate only adds new audio",
  async (t) => {
    const fixture = await createFixture();

    t.after(async () => {
      await rm(fixture.root, {
        recursive: true,
        force: true,
      });
    });

    const created = await executeIngestReleaseBuild(
      fixture.ingestRoot,
      fixture.outputRoot,
      fixture.inspection,
      fixture.draft,
      INGEST_BUILD_CONFIRMATION_PHRASE,
    );
    const releaseRoot = path.join(
      fixture.outputRoot,
      created.releaseRelativePath,
    );
    const initialReceipt = JSON.parse(
      await readFile(
        path.join(releaseRoot, "ingest-receipt.json"),
        "utf8",
      ),
    ) as {
      tracks: Array<{
        id: string;
        sourceRelativePath: string;
        destinationRelativePath: string;
      }>;
    };
    const originalTrack = initialReceipt.tracks[0];

    const candidateId = "later-addition";
    const candidateRoot = path.join(fixture.ingestRoot, candidateId);
    const filename = "new-track.m4a";
    const source = path.join(candidateRoot, filename);
    await mkdir(candidateRoot, { recursive: true });
    await writeFile(source, "new-track-bytes", "utf8");
    const stats = await stat(source);
    const originalAudio = fixture.inspection.files.find(
      (file) => file.mediaKind === "audio",
    );
    assert.ok(originalAudio);

    const newFile: IngestFileInspection = {
      ...originalAudio,
      relativePath: `${candidateId}/${filename}`,
      filename,
      sizeBytes: stats.size,
      modifiedAt: stats.mtime.toISOString(),
      embeddedMetadata: { title: "New Track" },
      evidence: [],
    };
    const updateInspection: IngestCandidateInspection = {
      ...fixture.inspection,
      candidate: {
        ...fixture.inspection.candidate,
        id: candidateId,
        name: candidateId,
        relativePath: candidateId,
        fileCount: 1,
        audioCount: 1,
        imageCount: 0,
        textCount: 0,
        totalSizeBytes: stats.size,
        extensions: [".m4a"],
      },
      files: [newFile],
    };
    const updateDraft = createDefaultIngestBuildDraft(updateInspection);
    updateDraft.releaseId = created.releaseId;
    updateDraft.releaseTitle = fixture.draft.releaseTitle;
    updateDraft.releaseArtist = fixture.draft.releaseArtist;
    updateDraft.releaseDate = fixture.draft.releaseDate;
    updateDraft.releaseType = fixture.draft.releaseType;
    updateDraft.tracks = updateDraft.tracks.map((track) => ({
      ...track,
      trackNumber: 2,
      title: "New Track",
      artist: fixture.draft.releaseArtist,
    }));

    const prepared = await prepareIngestReleaseBuild(
      fixture.ingestRoot,
      fixture.outputRoot,
      updateInspection,
      updateDraft,
    );
    assert.equal(prepared.preview.summary.trackCount, 2);
    assert.equal(prepared.preview.summary.addedTrackCount, 1);
    assert.equal(prepared.preview.summary.replacedTrackCount, 0);
    assert.equal(prepared.preview.summary.blockedCount, 0);
    assert.ok(
      prepared.preview.items.some(
        (item) =>
          item.action === "preserve" &&
          item.destinationRelativePath ===
            originalTrack.destinationRelativePath,
      ),
    );

    await executeIngestReleaseBuild(
      fixture.ingestRoot,
      fixture.outputRoot,
      updateInspection,
      updateDraft,
      INGEST_UPDATE_CONFIRMATION_PHRASE,
    );
    const receipt = JSON.parse(
      await readFile(
        path.join(releaseRoot, "ingest-receipt.json"),
        "utf8",
      ),
    ) as {
      tracks: Array<{ id: string; sourceRelativePath: string }>;
    };
    assert.equal(receipt.tracks.length, 2);
    assert.equal(
      receipt.tracks.find(
        (track) => track.sourceRelativePath === originalTrack.sourceRelativePath,
      )?.id,
      originalTrack.id,
    );
  },
);

test(
  "explicitly replaces canonical audio from a new ingest candidate while preserving track identity and invalidating derivatives",
  async (t) => {
    const fixture = await createFixture();

    t.after(async () => {
      await rm(fixture.root, {
        recursive: true,
        force: true,
      });
    });

    const created = await executeIngestReleaseBuild(
      fixture.ingestRoot,
      fixture.outputRoot,
      fixture.inspection,
      fixture.draft,
      INGEST_BUILD_CONFIRMATION_PHRASE,
    );
    const releaseRoot = path.join(
      fixture.outputRoot,
      created.releaseRelativePath,
    );
    const initialReceipt = JSON.parse(
      await readFile(
        path.join(releaseRoot, "ingest-receipt.json"),
        "utf8",
      ),
    ) as {
      tracks: Array<{
        id: string;
        number: number;
        title: string;
        version: string;
        artist: string;
        sourceDate: string;
        sourceRelativePath: string;
        destinationRelativePath: string;
      }>;
    };
    const originalTrack = initialReceipt.tracks[0];
    const trackRoot = path.join(
      fixture.outputRoot,
      path.posix.dirname(originalTrack.destinationRelativePath),
    );
    const trackTomlPath = path.join(trackRoot, "track.toml");
    await writeFile(
      trackTomlPath,
      `${await readFile(trackTomlPath, "utf8")}\n[editor]\ncustom_note = "preserve me"\n`,
      "utf8",
    );
    await writeFile(
      path.join(trackRoot, "audio-playback.mp3"),
      "old private playback",
      "utf8",
    );
    await writeFile(
      path.join(trackRoot, "waveform-peaks.json"),
      "{}\n",
      "utf8",
    );
    await mkdir(path.join(trackRoot, "stream"));
    await writeFile(
      path.join(trackRoot, "stream", "index.m3u8"),
      "#EXTM3U\n",
      "utf8",
    );

    const candidateId = "revision-candidate";
    const candidateRoot = path.join(
      fixture.ingestRoot,
      candidateId,
    );
    const replacementFilename = "revised-master.wav";
    const replacementSource = path.join(
      candidateRoot,
      replacementFilename,
    );
    await mkdir(candidateRoot, { recursive: true });
    await writeFile(
      replacementSource,
      "replacement-wave-bytes",
      "utf8",
    );
    const replacementStats = await stat(replacementSource);
    const originalAudio = fixture.inspection.files.find(
      (file) => file.mediaKind === "audio",
    );
    assert.ok(originalAudio);

    const replacementFile: IngestFileInspection = {
      ...originalAudio,
      relativePath: `${candidateId}/${replacementFilename}`,
      filename: replacementFilename,
      extension: ".wav",
      sizeBytes: replacementStats.size,
      modifiedAt: replacementStats.mtime.toISOString(),
      embeddedMetadata: {
        artist: originalTrack.artist,
        title: originalTrack.title,
      },
      evidence: [],
    };
    const replacementInspection: IngestCandidateInspection = {
      ...fixture.inspection,
      candidate: {
        ...fixture.inspection.candidate,
        id: candidateId,
        name: candidateId,
        relativePath: candidateId,
        fileCount: 1,
        audioCount: 1,
        videoCount: 0,
        imageCount: 0,
        textCount: 0,
        totalSizeBytes: replacementStats.size,
        extensions: [".wav"],
      },
      files: [replacementFile],
    };
    const replacementDraft = createDefaultIngestBuildDraft(
      replacementInspection,
    );
    replacementDraft.releaseId = created.releaseId;
    replacementDraft.releaseTitle = fixture.draft.releaseTitle;
    replacementDraft.releaseArtist = fixture.draft.releaseArtist;
    replacementDraft.releaseDate = fixture.draft.releaseDate;
    replacementDraft.releaseType = fixture.draft.releaseType;
    replacementDraft.tracks = replacementDraft.tracks.map(
      (track) => ({
        ...track,
        trackNumber: originalTrack.number,
        title: originalTrack.title,
        version: originalTrack.version,
        artist: originalTrack.artist,
        date: originalTrack.sourceDate,
        replacementTrackId: originalTrack.id,
      }),
    );

    const status = await inspectIngestStagingTarget(
      fixture.outputRoot,
      created.releaseId,
    );
    assert.equal(status.existingTracks.length, 1);
    assert.equal(status.existingTracks[0]?.id, originalTrack.id);

    const prepared = await prepareIngestReleaseBuild(
      fixture.ingestRoot,
      fixture.outputRoot,
      replacementInspection,
      replacementDraft,
    );
    assert.equal(prepared.preview.operation, "update");
    assert.equal(prepared.preview.summary.replacedTrackCount, 1);
    assert.equal(prepared.preview.summary.addedTrackCount, 0);
    assert.equal(prepared.preview.summary.blockedCount, 0);
    assert.ok(prepared.preview.summary.removedFileCount >= 3);
    assert.equal(
      prepared.preview.summary.waveformReplaceCount,
      1,
    );
    assert.ok(
      prepared.preview.items.some(
        (item) =>
          item.action === "update" &&
          item.adjustment === "Explicit canonical-audio replacement",
      ),
    );
    assert.ok(
      prepared.preview.items.some(
        (item) =>
          item.action === "remove" &&
          item.destinationRelativePath.endsWith("/stream"),
      ),
    );

    const updated = await executeIngestReleaseBuild(
      fixture.ingestRoot,
      fixture.outputRoot,
      replacementInspection,
      replacementDraft,
      INGEST_UPDATE_CONFIRMATION_PHRASE,
    );
    assert.equal(updated.operation, "update");
    assert.ok(
      updated.removedFiles.some((item) => item.endsWith("/stream")),
    );

    await assert.rejects(
      stat(path.join(trackRoot, "audio-master.m4a")),
    );
    assert.equal(
      await readFile(path.join(trackRoot, "audio-master.wav"), "utf8"),
      "replacement-wave-bytes",
    );
    await assert.rejects(
      stat(path.join(trackRoot, "audio-playback.mp3")),
    );
    assert.equal(
      await readFile(
        path.join(trackRoot, "waveform-peaks.json"),
        "utf8",
      ),
      '{"testWaveform":true}\n',
    );
    await assert.rejects(
      stat(path.join(trackRoot, "stream")),
    );

    const trackToml = parse(
      await readFile(trackTomlPath, "utf8"),
    ) as {
      track?: { assets?: { audio_playback?: string } };
      editor?: { custom_note?: string };
    };
    assert.equal(
      trackToml.track?.assets?.audio_playback,
      "audio-master.wav",
    );
    assert.equal(trackToml.editor?.custom_note, "preserve me");

    const updatedReceipt = JSON.parse(
      await readFile(
        path.join(releaseRoot, "ingest-receipt.json"),
        "utf8",
      ),
    ) as {
      tracks: Array<{
        id: string;
        sourceRelativePath: string;
        destinationRelativePath: string;
      }>;
      copies: Array<{ destinationRelativePath: string }>;
    };
    assert.equal(updatedReceipt.tracks[0]?.id, originalTrack.id);
    assert.equal(
      updatedReceipt.tracks[0]?.sourceRelativePath,
      replacementFile.relativePath,
    );
    assert.ok(
      updatedReceipt.tracks[0]?.destinationRelativePath.endsWith(
        "/audio-master.wav",
      ),
    );
    assert.equal(
      updatedReceipt.copies.some((copy) =>
        copy.destinationRelativePath.endsWith("/audio-master.m4a")
      ),
      false,
    );
  },
);

test(
  "updates canonical artwork from an artwork-only candidate while preserving existing tracks and authored metadata",
  async (t) => {
    const fixture = await createFixture();

    t.after(async () => {
      await rm(fixture.root, {
        recursive: true,
        force: true,
      });
    });

    const created = await executeIngestReleaseBuild(
      fixture.ingestRoot,
      fixture.outputRoot,
      fixture.inspection,
      fixture.draft,
      INGEST_BUILD_CONFIRMATION_PHRASE,
    );
    const releaseRoot = path.join(
      fixture.outputRoot,
      created.releaseRelativePath,
    );
    const releaseTomlPath = path.join(
      releaseRoot,
      "release.toml",
    );
    await writeFile(
      releaseTomlPath,
      `${await readFile(releaseTomlPath, "utf8")}\n[editor]\ncustom_note = "preserve release note"\n`,
      "utf8",
    );

    const status = await inspectIngestStagingTarget(
      fixture.outputRoot,
      created.releaseId,
    );
    assert.equal(status.existingTracks.length, 1);
    assert.equal(status.existingArtwork.length, 1);
    assert.equal(status.existingArtwork[0]?.scope, "release");
    assert.equal(status.existingArtwork[0]?.role, "front_cover");

    const candidateId = "artwork-revision";
    const candidateRoot = path.join(
      fixture.ingestRoot,
      candidateId,
    );
    const artworkFilename = "new-cover.png";
    const artworkSource = path.join(
      candidateRoot,
      artworkFilename,
    );
    await mkdir(candidateRoot, { recursive: true });
    await writeFile(
      artworkSource,
      "replacement-png-bytes",
      "utf8",
    );
    const artworkStats = await stat(artworkSource);
    const artworkFile: IngestFileInspection = {
      relativePath: `${candidateId}/${artworkFilename}`,
      filename: artworkFilename,
      extension: ".png",
      sizeBytes: artworkStats.size,
      modifiedAt: artworkStats.mtime.toISOString(),
      mediaKind: "image",
      detectedBy: "extension",
      technical: {},
      embeddedMetadata: {},
      evidence: [],
      warnings: [],
    };
    const revisionInspection: IngestCandidateInspection = {
      inspectedAt: "2026-08-09T18:00:00.000Z",
      candidate: {
        id: candidateId,
        name: candidateId,
        relativePath: candidateId,
        kind: "folder",
        displayTitle: "Artwork revision",
        fileCount: 1,
        audioCount: 0,
        videoCount: 0,
        imageCount: 1,
        textCount: 0,
        unknownCount: 0,
        totalSizeBytes: artworkStats.size,
        extensions: [".png"],
        dateCandidates: [],
        evidence: [],
        warnings: [],
      },
      files: [artworkFile],
      capabilities: fixture.inspection.capabilities,
      warnings: [],
      readOnly: true,
    };
    const revisionDraft = createDefaultIngestBuildDraft(
      revisionInspection,
    );
    revisionDraft.releaseId = created.releaseId;
    revisionDraft.releaseTitle = fixture.draft.releaseTitle;
    revisionDraft.releaseArtist = fixture.draft.releaseArtist;
    revisionDraft.releaseDate = fixture.draft.releaseDate;
    revisionDraft.releaseType = fixture.draft.releaseType;
    revisionDraft.tracks = [];
    revisionDraft.assets = revisionDraft.assets.map((asset) => ({
      ...asset,
      include: true,
      destinationRelativePath: "artwork/revision/new-cover.png",
      artworkAssignments: [
        {
          id: "release-front-revision",
          scope: "release" as const,
          role: "front_cover",
          trackSourceRelativePaths: [],
        },
        {
          id: "track-front-revision",
          scope: "track" as const,
          role: "front_cover",
          trackSourceRelativePaths: [
            status.existingTracks[0]!.sourceRelativePath,
          ],
        },
      ],
    }));

    const unconfirmed = await prepareIngestReleaseBuild(
      fixture.ingestRoot,
      fixture.outputRoot,
      revisionInspection,
      revisionDraft,
    );
    assert.equal(unconfirmed.preview.operation, "update");
    assert.equal(unconfirmed.preview.summary.trackCount, 1);
    assert.equal(unconfirmed.preview.summary.blockedCount, 1);
    assert.ok(
      unconfirmed.preview.items.some(
        (item) =>
          item.action === "blocked" &&
          item.reason?.includes("Confirm the replacement"),
      ),
    );

    revisionDraft.assets[0]!.artworkAssignments[0]!.replaceExisting = true;

    const prepared = await prepareIngestReleaseBuild(
      fixture.ingestRoot,
      fixture.outputRoot,
      revisionInspection,
      revisionDraft,
    );
    assert.equal(prepared.preview.summary.blockedCount, 0);
    assert.equal(prepared.preview.summary.trackCount, 1);
    assert.ok(
      prepared.preview.items.some(
        (item) =>
          item.action === "update" &&
          item.adjustment === "Explicit canonical-artwork replacement",
      ),
    );
    assert.ok(
      prepared.preview.items.some(
        (item) =>
          item.action === "add" &&
          item.logicalRoles?.some((role) =>
            role.startsWith("track-artwork:front_cover:"),
          ),
      ),
    );
    assert.ok(
      prepared.preview.items.some(
        (item) =>
          item.action === "remove" &&
          item.destinationRelativePath.endsWith(
            "/artwork/front/artwork-master.jpg",
          ),
      ),
    );

    const updated = await executeIngestReleaseBuild(
      fixture.ingestRoot,
      fixture.outputRoot,
      revisionInspection,
      revisionDraft,
      INGEST_UPDATE_CONFIRMATION_PHRASE,
    );
    assert.equal(updated.operation, "update");

    await assert.rejects(
      stat(
        path.join(
          releaseRoot,
          "artwork",
          "front",
          "artwork-master.jpg",
        ),
      ),
    );
    assert.equal(
      await readFile(
        path.join(
          releaseRoot,
          "artwork",
          "front",
          "artwork-master.png",
        ),
        "utf8",
      ),
      "replacement-png-bytes",
    );

    const trackId = status.existingTracks[0]!.id;
    assert.equal(
      await readFile(
        path.join(
          releaseRoot,
          "tracks",
          trackId,
          "artwork",
          "front",
          "artwork-master.png",
        ),
        "utf8",
      ),
      "replacement-png-bytes",
    );

    const releaseToml = parse(
      await readFile(releaseTomlPath, "utf8"),
    ) as {
      release?: {
        artwork?: Array<{
          id?: string;
          role?: string;
          master_path?: string;
        }>;
      };
      editor?: { custom_note?: string };
    };
    const releaseFrontArtwork =
      releaseToml.release?.artwork?.find(
        (artwork) => artwork.role === "front_cover",
      );
    assert.equal(
      releaseFrontArtwork?.master_path,
      "artwork/front/artwork-master.png",
    );
    assert.equal(
      releaseFrontArtwork?.id,
      "release-front-cover",
      "replacing canonical artwork should preserve the existing authored artwork ID",
    );
    assert.equal(
      releaseToml.editor?.custom_note,
      "preserve release note",
    );

    const releaseSettings = parse(
      await readFile(
        path.join(releaseRoot, "release-settings.toml"),
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
      releaseSettings.settings?.inheritance
        ?.release_artwork_fallback_path,
      "artwork/front/artwork-master.png",
    );

    const trackToml = parse(
      await readFile(
        path.join(releaseRoot, "tracks", trackId, "track.toml"),
        "utf8",
      ),
    ) as {
      track?: {
        assets?: { artwork?: { master?: string } };
      };
    };
    assert.equal(
      trackToml.track?.assets?.artwork?.master,
      "artwork/front/artwork-master.png",
    );

    const receipt = JSON.parse(
      await readFile(
        path.join(releaseRoot, "ingest-receipt.json"),
        "utf8",
      ),
    ) as {
      tracks: Array<{ id: string }>;
      copies: Array<{ destinationRelativePath: string }>;
    };
    assert.equal(receipt.tracks[0]?.id, trackId);
    assert.equal(
      receipt.copies.some((copy) =>
        copy.destinationRelativePath.endsWith(
          "/artwork/front/artwork-master.jpg",
        ),
      ),
      false,
    );
    assert.ok(
      receipt.copies.some((copy) =>
        copy.destinationRelativePath.endsWith(
          "/artwork/front/artwork-master.png",
        ),
      ),
    );
  },
);

test(
  "copies artwork into release and track-local destinations from assignments",
  async (t) => {
    const fixture = await createFixture();

    t.after(async () => {
      await rm(fixture.root, {
        recursive: true,
        force: true,
      });
    });

    const trackSource =
      fixture.draft.tracks[0].sourceRelativePath;
    fixture.draft.assets = fixture.draft.assets.map(
      (asset) =>
        asset.mediaKind === "image"
          ? {
              ...asset,
              include: true,
              destinationRelativePath:
                "artwork/supplemental/manually-assigned.jpg",
              artworkAssignments: [
                {
                  id: "release-front",
                  scope: "release" as const,
                  role: "front_cover",
                  trackSourceRelativePaths: [],
                },
                {
                  id: "track-front",
                  scope: "track" as const,
                  role: "track_artwork",
                  trackSourceRelativePaths: [
                    trackSource,
                  ],
                },
              ],
            }
          : {
              ...asset,
              include: false,
            },
    );

    const prepared =
      await prepareIngestReleaseBuild(
        fixture.ingestRoot,
        fixture.outputRoot,
        fixture.inspection,
        fixture.draft,
      );

    assert.equal(
      prepared.preview.summary.artworkSourceCount,
      1,
    );
    assert.equal(
      prepared.preview.summary.artworkAssignmentCount,
      2,
    );

    const artworkCopies = prepared.preview.items.filter(
      (item) =>
        item.kind === "copy" &&
        item.mediaKind === "image",
    );

    assert.equal(artworkCopies.length, 2);
    assert.deepEqual(
      artworkCopies.map(
        (item) => item.destinationRelativePath,
      ),
      [
        "releases/2016-07-26_pixels/artwork/front/artwork-master.jpg",
        "releases/2016-07-26_pixels/tracks/nathan-brenton_01_pixels-v0/artwork/front/artwork-master.jpg",
      ],
    );
    assert.deepEqual(
      artworkCopies.map((item) => item.logicalRoles),
      [
        ["release-artwork:front_cover"],
        [
          `track-artwork:track_artwork:${trackSource}`,
        ],
      ],
    );

    const result = await executeIngestReleaseBuild(
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
    assert.equal(
      (await stat(
        path.join(
          releaseRoot,
          "artwork",
          "front",
          "artwork-master.jpg",
        ),
      )).isFile(),
      true,
    );
    assert.equal(
      (await stat(
        path.join(
          trackRoot,
          "artwork",
          "front",
          "artwork-master.jpg",
        ),
      )).isFile(),
      true,
    );
    const releaseToml = parse(
      await readFile(
        path.join(releaseRoot, "release.toml"),
        "utf8",
      ),
    ) as {
      release?: {
        artwork?: Array<{
          role?: string;
          master_path?: string;
        }>;
      };
    };
    const trackToml = parse(
      await readFile(
        path.join(trackRoot, "track.toml"),
        "utf8",
      ),
    ) as {
      track?: {
        artwork?: Array<{
          role?: string;
          master_path?: string;
        }>;
        assets?: {
          artwork?: {
            master?: string;
          };
        };
      };
    };

    assert.deepEqual(
      releaseToml.release?.artwork?.map(
        (artwork) => artwork.role,
      ),
      ["front_cover"],
    );
    assert.equal(
      releaseToml.release?.artwork?.[0]
        ?.master_path,
      "artwork/front/artwork-master.jpg",
    );
    assert.deepEqual(
      trackToml.track?.artwork?.map(
        (artwork) => artwork.role,
      ),
      ["track_artwork"],
    );
    assert.equal(
      trackToml.track?.artwork?.[0]
        ?.master_path,
      "artwork/front/artwork-master.jpg",
    );
    assert.equal(
      trackToml.track?.assets?.artwork?.master,
      "artwork/front/artwork-master.jpg",
    );
  },
);

test(
  "rejects included artwork without a metadata assignment",
  async (t) => {
    const fixture = await createFixture();

    t.after(async () => {
      await rm(fixture.root, {
        recursive: true,
        force: true,
      });
    });

    fixture.draft.assets = fixture.draft.assets.map(
      (asset) =>
        asset.mediaKind === "image"
          ? {
              ...asset,
              include: true,
              artworkAssignments: [],
            }
          : asset,
    );

    await assert.rejects(
      prepareIngestReleaseBuild(
        fixture.ingestRoot,
        fixture.outputRoot,
        fixture.inspection,
        fixture.draft,
      ),
      /requires at least one release-level or track-level assignment/,
    );
  },
);
