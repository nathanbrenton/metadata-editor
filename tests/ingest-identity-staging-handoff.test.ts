import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  applyIngestDraftIdentitySeed,
  createStoredIngestDraft,
} from "../shared/ingest-drafts.js";
import type {
  IngestCandidateInspection,
  IngestFileInspection,
} from "../shared/ingest-types.js";

function audioFile(filename: string): IngestFileInspection {
  return {
    relativePath: `candidate/${filename}`,
    filename,
    extension: ".m4a",
    sizeBytes: 100,
    modifiedAt: "2026-07-26T00:00:00.000Z",
    mediaKind: "audio",
    detectedBy: "extension",
    technical: {},
    embeddedMetadata: {},
    evidence: [],
    warnings: [],
  };
}

function inspection(): IngestCandidateInspection {
  const files = [
    audioFile("one.m4a"),
    audioFile("two.m4a"),
  ];

  return {
    inspectedAt: "2026-07-26T00:00:00.000Z",
    candidate: {
      id: "CrazyEights_WeShareAWall",
      name: "CrazyEights_WeShareAWall",
      relativePath: "CrazyEights_WeShareAWall",
      kind: "folder",
      displayTitle: "Crazy Eights",
      fileCount: files.length,
      audioCount: files.length,
      imageCount: 0,
      textCount: 0,
      unknownCount: 0,
      totalSizeBytes: 200,
      extensions: [".m4a"],
      dateCandidates: [],
      evidence: [],
      warnings: [],
    },
    files,
    capabilities: {
      ffprobe: { available: true },
      mediainfo: { available: true },
    },
    warnings: [],
    readOnly: true,
  };
}

test("applies the explicit Ingest identity over a locally saved inferred draft", () => {
  const stored = createStoredIngestDraft(inspection());
  stored.draft.releaseDate = "2026-07-26";
  stored.draft.releaseTitle = "Crazy Eights";
  stored.draft.releaseArtist = "";
  stored.draft.releaseId = "2026-07-26_crazy-eights";
  stored.draft.tracks[0].artist = "";
  stored.draft.tracks[1].artist = "Guest Artist";

  const updated = applyIngestDraftIdentitySeed(
    stored.draft,
    {
      releaseArtist: "Crazy Eights",
      releaseTitle: "We Share A Wall",
    },
  );

  assert.equal(updated.releaseArtist, "Crazy Eights");
  assert.equal(updated.releaseTitle, "We Share A Wall");
  assert.equal(
    updated.releaseId,
    "2026-07-26_we-share-a-wall",
  );
  assert.equal(updated.tracks[0].artist, "Crazy Eights");
  assert.equal(updated.tracks[1].artist, "Guest Artist");
});

test("preserves an explicitly customized staging directory ID", () => {
  const stored = createStoredIngestDraft(inspection());
  stored.draft.releaseId = "manual-release-directory";

  const updated = applyIngestDraftIdentitySeed(
    stored.draft,
    {
      releaseArtist: "Crazy Eights",
      releaseTitle: "We Share A Wall",
    },
  );

  assert.equal(updated.releaseId, "manual-release-directory");
});

const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const builderSource = await readFile(
  new URL("../src/IngestReleaseBuilder.tsx", import.meta.url),
  "utf8",
);
const draftHookSource = await readFile(
  new URL("../src/useIngestDraft.ts", import.meta.url),
  "utf8",
);

test("carries the selected identity into the Staging draft hydration path", () => {
  assert.match(appSource, /setIngestIdentityOverride\(identityOverride\)/);
  assert.match(appSource, /identitySeed=\{ingestIdentityOverride\}/);
  assert.match(builderSource, /useIngestDraft\([\s\S]*identitySeed/);
  assert.match(
    draftHookSource,
    /applyIngestDraftIdentitySeed\([\s\S]*merged\.draft/,
  );
  assert.match(
    draftHookSource,
    /applyIngestDraftIdentitySeed\([\s\S]*fresh\.draft/,
  );
});

test("removes the redundant staging safety banner copy", () => {
  assert.doesNotMatch(builderSource, /Copy-only staging workflow/);
  assert.doesNotMatch(
    builderSource,
    /The builder writes only to the configured staging media root/,
  );
  assert.doesNotMatch(builderSource, /ingest-safety-banner/);
});
