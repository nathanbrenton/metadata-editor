import assert from "node:assert/strict";
import test from "node:test";

import {
  buildIngestIdentitySourcePlan,
  candidateIdentitySegments,
  mergeIngestIdentityEvidence,
  selectIngestIdentityOverride,
} from "../src/ingest-identity-source.js";
import {
  createDefaultIngestBuildDraft,
} from "../shared/ingest-builder.js";
import type {
  IngestCandidateInspection,
  IngestFileInspection,
} from "../shared/ingest-types.js";

function audioFile(
  filename: string,
  embeddedMetadata: Record<string, string> = {},
): IngestFileInspection {
  return {
    relativePath: `candidate/${filename}`,
    filename,
    extension: ".m4a",
    sizeBytes: 100,
    modifiedAt: "2026-07-26T00:00:00.000Z",
    mediaKind: "audio",
    detectedBy: "extension",
    technical: {},
    embeddedMetadata,
    evidence: [],
    warnings: [],
  };
}

function inspection(
  files: IngestFileInspection[] = [audioFile("track.m4a")],
): IngestCandidateInspection {
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
      videoCount: 0,
      imageCount: 0,
      textCount: 0,
      unknownCount: 0,
      totalSizeBytes: files.reduce(
        (total, file) => total + file.sizeBytes,
        0,
      ),
      extensions: [".m4a"],
      dateCandidates: [],
      evidence: [
        {
          field: "release.title",
          value: "Crazy Eights",
          source: "foldername",
          rawValue: "CrazyEights_WeShareAWall",
          confidence: "medium",
          rule: "folder-first-segment-title-v1",
        },
      ],
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

test("offers independent folder ranges for release artist and title", () => {
  const candidate = inspection();
  const plan = buildIngestIdentitySourcePlan(candidate);

  assert.deepEqual(candidateIdentitySegments(candidate), [
    "Crazy Eights",
    "We Share A Wall",
  ]);
  assert.equal(
    plan.artistOptions.find(
      (option) => option.id === "folder:0:0",
    )?.value,
    "Crazy Eights",
  );
  assert.equal(
    plan.titleOptions.find(
      (option) => option.id === "folder:1:1",
    )?.value,
    "We Share A Wall",
  );

  const override = selectIngestIdentityOverride(
    plan,
    "folder:0:0",
    "folder:1:1",
  );
  const merged = mergeIngestIdentityEvidence(
    candidate.candidate.evidence,
    override,
  );

  assert.equal(override.releaseArtist, "Crazy Eights");
  assert.equal(override.releaseTitle, "We Share A Wall");
  assert.equal(
    merged.find((item) => item.field === "release.artist")
      ?.value,
    "Crazy Eights",
  );
  assert.equal(
    merged.find((item) => item.field === "release.title")
      ?.value,
    "We Share A Wall",
  );
});

test("prefers consistent embedded album artist and album title tags", () => {
  const candidate = inspection([
    audioFile("one.m4a", {
      album_artist: "Crazy Eights",
      album: "We Share A Wall",
    }),
    audioFile("two.m4a", {
      album_artist: "Crazy Eights",
      album: "We Share A Wall",
    }),
  ]);
  const plan = buildIngestIdentitySourcePlan(candidate);
  const override = selectIngestIdentityOverride(
    plan,
    plan.defaultArtistSourceId,
    plan.defaultTitleSourceId,
  );

  assert.match(plan.defaultArtistSourceId, /^embedded:album_artist:/);
  assert.match(plan.defaultTitleSourceId, /^embedded:album:/);
  assert.equal(override.releaseArtist, "Crazy Eights");
  assert.equal(override.releaseTitle, "We Share A Wall");
});

test("uses selected release-artist evidence when Staging creates its draft", () => {
  const candidate = inspection();
  const plan = buildIngestIdentitySourcePlan(candidate);
  const override = selectIngestIdentityOverride(
    plan,
    "folder:0:0",
    "folder:1:1",
  );
  const updatedInspection: IngestCandidateInspection = {
    ...candidate,
    candidate: {
      ...candidate.candidate,
      evidence: mergeIngestIdentityEvidence(
        candidate.candidate.evidence,
        override,
      ),
    },
  };
  const draft = createDefaultIngestBuildDraft(updatedInspection);

  assert.equal(draft.releaseArtist, "Crazy Eights");
  assert.equal(draft.releaseTitle, "We Share A Wall");
  assert.equal(draft.tracks[0]?.artist, "Crazy Eights");
});
