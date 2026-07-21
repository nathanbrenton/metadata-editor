import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBlockingSourceStatuses,
  createStoredIngestDraft,
  mergeIngestDraftAfterRescan,
} from "../shared/ingest-drafts.js";
import type {
  IngestCandidateInspection,
  IngestFileInspection,
} from "../shared/ingest-types.js";

function file(
  relativePath: string,
  mediaKind: IngestFileInspection["mediaKind"],
  sizeBytes = 100,
  modifiedAt = "2026-07-20T00:00:00.000Z",
): IngestFileInspection {
  const filename = relativePath.split("/").at(-1) ?? relativePath;
  const extension = filename.includes(".")
    ? `.${filename.split(".").at(-1)}`
    : "";

  return {
    relativePath,
    filename,
    extension,
    sizeBytes,
    modifiedAt,
    mediaKind,
    detectedBy: "extension",
    technical: {},
    embeddedMetadata: {},
    evidence: [],
    warnings: [],
  };
}

function inspection(
  files: IngestFileInspection[],
): IngestCandidateInspection {
  return {
    inspectedAt: "2026-07-20T00:00:00.000Z",
    candidate: {
      id: "session",
      name: "session",
      relativePath: "session",
      kind: "folder",
      displayTitle: "Session",
      fileCount: files.length,
      audioCount: files.filter((item) => item.mediaKind === "audio").length,
      imageCount: files.filter((item) => item.mediaKind === "image").length,
      textCount: files.filter((item) => item.mediaKind === "text").length,
      unknownCount: 0,
      totalSizeBytes: files.reduce((total, item) => total + item.sizeBytes, 0),
      extensions: [],
      dateCandidates: [],
      evidence: [],
      warnings: [],
    },
    files,
    capabilities: {
      ffprobe: { available: false },
      mediainfo: { available: false },
    },
    warnings: [],
    readOnly: true,
  };
}

test(
  "preserves authored values while adding new sources unselected",
  () => {
    const original = inspection([
      file("session/audio.mp3", "audio"),
    ]);
    const stored = createStoredIngestDraft(original);
    stored.draft.releaseTitle = "Authored title";
    stored.draft.tracks[0].title = "Authored track";

    const merged = mergeIngestDraftAfterRescan(
      stored,
      inspection([
        file("session/audio.mp3", "audio"),
        file("session/front.tiff", "image"),
      ]),
    );

    assert.equal(merged.draft.releaseTitle, "Authored title");
    assert.equal(merged.draft.tracks[0].title, "Authored track");
    assert.equal(merged.draft.assets.length, 1);
    assert.equal(merged.draft.assets[0].include, false);
    assert.equal(
      merged.sourceStatuses.find((status) => status.sourceRelativePath === "session/front.tiff")?.state,
      "new",
    );
  },
);

test(
  "marks changed and missing sources without dropping draft rows",
  () => {
    const original = inspection([
      file("session/audio-1.mp3", "audio"),
      file("session/audio-2.mp3", "audio"),
    ]);
    const stored = createStoredIngestDraft(original);
    const merged = mergeIngestDraftAfterRescan(
      stored,
      inspection([
        file(
          "session/audio-1.mp3",
          "audio",
          101,
          "2026-07-20T01:00:00.000Z",
        ),
      ]),
    );

    assert.equal(merged.draft.tracks.length, 2);
    assert.equal(
      merged.sourceStatuses.find((status) => status.sourceRelativePath === "session/audio-1.mp3")?.state,
      "changed",
    );
    assert.equal(
      merged.sourceStatuses.find((status) => status.sourceRelativePath === "session/audio-2.mp3")?.state,
      "missing",
    );
  },
);

test(
  "adds explicitly attached loose files without changing the candidate",
  () => {
    const original = inspection([
      file("session/audio.mp3", "audio"),
    ]);
    const stored = createStoredIngestDraft(original);
    const merged = mergeIngestDraftAfterRescan(
      stored,
      original,
      [file("front.png", "image")],
    );

    assert.equal(merged.draft.candidateId, "session");
    assert.equal(merged.draft.assets[0].sourceRelativePath, "front.png");
    assert.equal(
      merged.sourceStatuses.find((status) => status.sourceRelativePath === "front.png")?.attached,
      true,
    );
  },
);

test(
  "allows a missing source to remain in the draft after it is excluded",
  () => {
    const original = inspection([
      file("session/audio.mp3", "audio"),
    ]);
    const stored = createStoredIngestDraft(original);
    const merged = mergeIngestDraftAfterRescan(
      stored,
      inspection([]),
    );

    assert.equal(
      buildBlockingSourceStatuses(
        merged.draft,
        merged.sourceStatuses,
      ).length,
      1,
    );

    merged.draft.tracks[0].include = false;

    assert.equal(
      buildBlockingSourceStatuses(
        merged.draft,
        merged.sourceStatuses,
      ).length,
      0,
    );
  },
);
