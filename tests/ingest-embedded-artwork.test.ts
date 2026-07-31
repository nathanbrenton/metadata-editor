import assert from "node:assert/strict";
import { mkdtemp, realpath, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createDefaultIngestBuildDraft } from "../shared/ingest-builder.js";
import { createStoredIngestDraft, mergeIngestDraftAfterRescan } from "../shared/ingest-drafts.js";
import type { IngestCandidateInspection, IngestFileInspection } from "../shared/ingest-types.js";
import {
  inspectIngestCandidate,
  type IngestCommandRunner,
  type IngestEmbeddedArtworkReader,
} from "../server/ingest-scanner.js";

const pictureBytes = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);

const commandRunner: IngestCommandRunner = async (command, args) => {
  if (command === "ffprobe" && args[0] === "-version") {
    return { exitCode: 0, stdout: "ffprobe test\n", stderr: "" };
  }
  if (command === "mediainfo" && args[0] === "--Version") {
    return { exitCode: 1, stdout: "", stderr: "unavailable" };
  }
  if (command === "ffprobe") {
    return {
      exitCode: 0,
      stdout: JSON.stringify({
        streams: [
          { index: 0, codec_type: "audio", codec_name: "mp3" },
          {
            index: 1,
            codec_type: "video",
            codec_name: "mjpeg",
            width: 1200,
            height: 1200,
            disposition: { attached_pic: 1 },
            tags: { title: "Front cover", comment: "Cover (front)" },
          },
        ],
        format: { format_name: "mp3", tags: { album: "Yours" } },
      }),
      stderr: "",
    };
  }
  return { exitCode: 1, stdout: "", stderr: "unsupported" };
};

const artworkReader: IngestEmbeddedArtworkReader = async () => ({
  bytes: pictureBytes,
  extension: ".jpg",
  contentType: "image/jpeg",
});

test("detects attached MP3 artwork without writing a sidecar", async () => {
  const root = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "metadata-embedded-art-")),
  );
  await writeFile(path.join(root, "01 Lets.mp3"), "audio");

  const inspection = await inspectIngestCandidate(
    root,
    "01 Lets.mp3",
    "../ingest-drop",
    commandRunner,
    artworkReader,
  );

  assert.equal(inspection.files[0].embeddedArtwork?.length, 1);
  assert.deepEqual(
    inspection.files[0].embeddedArtwork?.[0],
    {
      id: "embedded-artwork-1-32461d5bd177",
      streamIndex: 1,
      codecName: "mjpeg",
      extension: ".jpg",
      contentType: "image/jpeg",
      width: 1200,
      height: 1200,
      title: "Front cover",
      comment: "Cover (front)",
      sizeBytes: 4,
      sha256: "32461d5bd1773012acef0ba15636752949bd7c2ce50f9172159d9f56cf0dd9af",
    },
  );
});

function audioFile(relativePath: string, sha256: string): IngestFileInspection {
  return {
    relativePath,
    filename: path.basename(relativePath),
    extension: ".mp3",
    sizeBytes: 100,
    modifiedAt: "2026-07-30T00:00:00.000Z",
    mediaKind: "audio",
    detectedBy: "ffprobe",
    technical: {},
    embeddedMetadata: {},
    embeddedArtwork: [{
      id: `embedded-${sha256.slice(0, 8)}`,
      streamIndex: 1,
      codecName: "mjpeg",
      extension: ".jpg",
      contentType: "image/jpeg",
      sizeBytes: 4,
      sha256,
    }],
    evidence: [],
    warnings: [],
  };
}

function inspection(files: IngestFileInspection[]): IngestCandidateInspection {
  return {
    inspectedAt: "2026-07-30T00:00:00.000Z",
    candidate: {
      id: "Yours",
      name: "Yours",
      relativePath: "Yours",
      kind: "folder",
      displayTitle: "Yours",
      fileCount: files.length,
      audioCount: files.length,
      imageCount: 0,
      textCount: 0,
      unknownCount: 0,
      totalSizeBytes: files.reduce((sum, file) => sum + file.sizeBytes, 0),
      extensions: [".mp3"],
      dateCandidates: [],
      evidence: [{
        field: "release.title",
        value: "Yours",
        source: "foldername",
        rawValue: "Yours",
        confidence: "medium",
        rule: "test",
      }],
      warnings: [],
    },
    files,
    capabilities: {
      ffprobe: { available: true },
      mediainfo: { available: false },
    },
    warnings: [],
    readOnly: true,
  };
}

test("deduplicates identical embedded covers and assigns one unambiguous front master", () => {
  const sha = "a".repeat(64);
  const draft = createDefaultIngestBuildDraft(inspection([
    audioFile("Yours/01 Lets.mp3", sha),
    audioFile("Yours/02 Mine.mp3", sha),
  ]));

  assert.equal(draft.assets.length, 1);
  assert.equal(draft.assets[0].sourceType, "embedded-artwork");
  assert.equal(draft.assets[0].include, true);
  assert.equal(draft.assets[0].destinationRelativePath, "artwork/front/artwork-master.jpg");
  assert.equal(draft.assets[0].artworkAssignments[0]?.role, "front_cover");
});

test("does not guess when tracks contain different embedded covers", () => {
  const draft = createDefaultIngestBuildDraft(inspection([
    audioFile("Yours/01 Lets.mp3", "a".repeat(64)),
    audioFile("Yours/02 Mine.mp3", "b".repeat(64)),
  ]));

  assert.equal(draft.assets.length, 2);
  assert.equal(draft.assets.every((asset) => !asset.include), true);
  assert.equal(draft.assets.every((asset) => asset.artworkAssignments.length === 0), true);
});


test("adds one newly detected unambiguous embedded cover to an existing saved draft", () => {
  const sha = "c".repeat(64);
  const originalFile = audioFile("Yours/01 Lets.mp3", sha);
  const withoutArtwork = { ...originalFile, embeddedArtwork: [] };
  const stored = createStoredIngestDraft(inspection([withoutArtwork]));
  const merged = mergeIngestDraftAfterRescan(
    stored,
    inspection([originalFile]),
  );

  assert.equal(merged.draft.assets.length, 1);
  assert.equal(merged.draft.assets[0].include, true);
  assert.equal(merged.draft.assets[0].artworkAssignments[0]?.role, "front_cover");
});
