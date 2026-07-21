import assert from "node:assert/strict";
import {
  mkdtemp,
  readFile,
  rm,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createStoredIngestDraft,
} from "../shared/ingest-drafts.js";
import type {
  IngestCandidateInspection,
} from "../shared/ingest-types.js";
import {
  parseStoredIngestDraft,
  readStoredIngestDraft,
  writeStoredIngestDraft,
} from "../server/ingest-draft-store.js";

function inspection(): IngestCandidateInspection {
  return {
    inspectedAt: "2026-07-20T00:00:00.000Z",
    candidate: {
      id: "session",
      name: "session",
      relativePath: "session",
      kind: "folder",
      displayTitle: "Session",
      fileCount: 1,
      audioCount: 1,
      imageCount: 0,
      textCount: 0,
      unknownCount: 0,
      totalSizeBytes: 10,
      extensions: [".mp3"],
      dateCandidates: ["2026-07-20"],
      evidence: [{
        field: "date",
        value: "2026-07-20",
        source: "foldername",
        rawValue: "session",
        confidence: "medium",
        rule: "test-date",
      }],
      warnings: [],
    },
    files: [{
      relativePath: "session/audio.mp3",
      filename: "audio.mp3",
      extension: ".mp3",
      sizeBytes: 10,
      modifiedAt: "2026-07-20T00:00:00.000Z",
      mediaKind: "audio",
      detectedBy: "extension",
      technical: {},
      embeddedMetadata: {},
      evidence: [],
      warnings: [],
    }],
    capabilities: {
      ffprobe: { available: false },
      mediainfo: { available: false },
    },
    warnings: [],
    readOnly: true,
  };
}

test(
  "round-trips an ingest draft without media bytes",
  async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), "ingest-drafts-"),
    );

    try {
      const draft = createStoredIngestDraft(inspection());
      draft.draft.releaseArtist = "Nathan Brenton";
      draft.draft.tracks[0].artist = "Nathan Brenton";
      const saved = await writeStoredIngestDraft(draft, root);
      const loaded = await readStoredIngestDraft("session", root);

      assert.equal(loaded?.draft.releaseArtist, "Nathan Brenton");
      assert.equal(saved.candidateId, "session");

      const files = await import("node:fs/promises").then(({ readdir }) => readdir(root));
      assert.equal(files.length, 1);
      const content = await readFile(path.join(root, files[0]), "utf8");
      assert.doesNotMatch(content, /data:audio|base64/i);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

test(
  "persists an incomplete questionnaire draft before required fields are filled",
  async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), "ingest-drafts-incomplete-"),
    );

    try {
      const draft = createStoredIngestDraft(inspection());
      draft.draft.releaseArtist = "";
      draft.draft.releaseDate = "";
      draft.draft.tracks[0].artist = "";

      await writeStoredIngestDraft(draft, root);
      const loaded = await readStoredIngestDraft("session", root);

      assert.equal(loaded?.draft.releaseArtist, "");
      assert.equal(loaded?.draft.releaseDate, "");
      assert.equal(loaded?.draft.tracks[0].artist, "");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

test(
  "migrates an older included image draft to a release-level front-cover assignment",
  () => {
    const parsed = parseStoredIngestDraft({
      schemaVersion: 1,
      candidateId: "session",
      updatedAt: "2026-07-20T00:00:00.000Z",
      draft: {
        candidateId: "session",
        releaseId: "2026-07-20_session",
        releaseTitle: "Session",
        releaseArtist: "Artist",
        releaseDate: "2026-07-20",
        releaseType: "album",
        tracks: [],
        assets: [
          {
            sourceRelativePath: "session/cover.png",
            include: true,
            mediaKind: "image",
            destinationRelativePath:
              "artwork/front/artwork-master.png",
          },
        ],
      },
      sourceStatuses: [
        {
          sourceRelativePath: "session/cover.png",
          state: "unchanged",
          mediaKind: "image",
          sizeBytes: 12,
          modifiedAt: "2026-07-20T00:00:00.000Z",
          reviewed: true,
          attached: false,
        },
      ],
    });

    assert.deepEqual(
      parsed.draft.assets[0].artworkAssignments,
      [
        {
          id: "release-front-cover",
          scope: "release",
          role: "front_cover",
          trackSourceRelativePaths: [],
        },
      ],
    );
  },
);
