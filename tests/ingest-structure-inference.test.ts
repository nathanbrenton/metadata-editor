import assert from "node:assert/strict";
import test from "node:test";

import {
  createDefaultIngestBuildDraft,
} from "../shared/ingest-builder.js";
import {
  addIngestStructureEvidence,
  analyzeIngestStructure,
  inferTrackNumberFromFolderName,
  sourcePathWithinCandidate,
} from "../shared/ingest-structure-inference.js";
import type {
  IngestCandidateInspection,
  IngestFileInspection,
  IngestMediaKind,
} from "../shared/ingest-types.js";

const candidateId =
  "2025-08-31_NathanBrenton_KILLCHAIN";

function file(
  relativeWithinCandidate: string,
  mediaKind: IngestMediaKind,
): IngestFileInspection {
  const filename =
    relativeWithinCandidate.split("/").at(-1) ??
    relativeWithinCandidate;
  const dot = filename.lastIndexOf(".");

  return {
    relativePath:
      `${candidateId}/${relativeWithinCandidate}`,
    filename,
    extension:
      dot > 0 ? filename.slice(dot).toLowerCase() : "",
    sizeBytes: mediaKind === "audio" ? 20_000_000 : 50_000,
    modifiedAt: "2026-08-08T00:00:00.000Z",
    mediaKind,
    detectedBy: "extension",
    technical: {},
    embeddedMetadata: {},
    evidence: [],
    warnings: [],
  };
}

function killchainInspection(): IngestCandidateInspection {
  const files = [
    file("01/BeingNotScene_Remastered-01B.wav", "audio"),
    file("01/BeingNotScene.jpeg", "image"),
    file("02/PleaseStopUs_Remastered-01A.wav", "audio"),
    file("02/PleaseStopUs.jpeg", "image"),
    file("03/Saturate_Cover-04_Extend-03_awesome.wav", "audio"),
    file("03/Saturate_Cover-04_Extend-03_awesome.jpeg", "image"),
    file("04/SeenNotHeard_Remastered-01B.wav", "audio"),
    file("04/SeenNotHeard.jpeg", "image"),
    file("05/Nebula_Remastered-01B.wav", "audio"),
    file("05/Nebula.jpeg", "image"),
    file("06/OneAndLonely_Original Mix_Remastered.wav", "audio"),
    file("06/OneAndLonely.jpeg", "image"),
    file("07/Abjectify-CP_Remastered-01A.wav", "audio"),
    file("07/Abjectify_01.jpeg", "image"),
    file("08/Runtime 2.wav", "audio"),
    file("08/Runtime_01.jpeg", "image"),
    file("ChatGPT Image Aug 6, 2026, 09_38_13 AM.png", "image"),
  ];

  return {
    inspectedAt: "2026-08-08T00:00:00.000Z",
    candidate: {
      id: candidateId,
      name: candidateId,
      relativePath: candidateId,
      kind: "folder",
      displayTitle: "KILLCHAIN",
      fileCount: files.length,
      audioCount: 8,
      videoCount: 0,
      imageCount: 9,
      textCount: 0,
      unknownCount: 0,
      totalSizeBytes: files.reduce(
        (total, source) => total + source.sizeBytes,
        0,
      ),
      extensions: [".jpeg", ".png", ".wav"],
      dateCandidates: ["2025-08-31"],
      evidence: [
        {
          field: "date",
          value: "2025-08-31",
          source: "foldername",
          rawValue: candidateId,
          confidence: "high",
          rule: "date-yyyy-mm-dd-v1",
        },
        {
          field: "release.title",
          value: "KILLCHAIN",
          source: "foldername",
          rawValue: candidateId,
          confidence: "medium",
          rule: "folder-last-segment-title-v1",
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

test("recognizes flexible numbered track-folder names", () => {
  assert.equal(inferTrackNumberFromFolderName("01"), 1);
  assert.equal(inferTrackNumberFromFolderName("track-02"), 2);
  assert.equal(inferTrackNumberFromFolderName("Track 003 demo"), 3);
  assert.equal(inferTrackNumberFromFolderName("04_track-name"), 4);
  assert.equal(inferTrackNumberFromFolderName("artwork"), undefined);
  assert.equal(inferTrackNumberFromFolderName("2025"), undefined);
});

test("resolves source paths relative to the candidate root", () => {
  assert.equal(
    sourcePathWithinCandidate(
      candidateId,
      `${candidateId}/03/Saturate.wav`,
    ),
    "03/Saturate.wav",
  );
  assert.equal(
    sourcePathWithinCandidate(
      candidateId,
      `${candidateId}/cover.png`,
    ),
    "cover.png",
  );
});

test("uses numbered folder scope before filename similarity for KILLCHAIN", () => {
  const inspection = killchainInspection();
  const structure = analyzeIngestStructure(inspection);
  const draft = createDefaultIngestBuildDraft(inspection);

  assert.deepEqual(
    draft.tracks.map((track) => track.trackNumber),
    [1, 2, 3, 4, 5, 6, 7, 8],
  );

  const releaseArtwork = draft.assets.find(
    (asset) =>
      asset.sourceRelativePath.endsWith(
        "ChatGPT Image Aug 6, 2026, 09_38_13 AM.png",
      ),
  );
  assert.deepEqual(
    releaseArtwork?.artworkAssignments,
    [
      {
        id: "release-front-cover",
        scope: "release",
        role: "front_cover",
        trackSourceRelativePaths: [],
      },
    ],
  );

  const saturateArtwork = draft.assets.find(
    (asset) =>
      asset.sourceRelativePath.endsWith(
        "03/Saturate_Cover-04_Extend-03_awesome.jpeg",
      ),
  );
  const saturateAudio = draft.tracks.find(
    (track) => track.trackNumber === 3,
  );
  assert.equal(
    saturateArtwork?.artworkAssignments[0]?.scope,
    "track",
  );
  assert.equal(
    saturateArtwork?.artworkAssignments[0]?.role,
    "front_cover",
  );
  assert.deepEqual(
    saturateArtwork?.artworkAssignments[0]
      ?.trackSourceRelativePaths,
    [saturateAudio?.sourceRelativePath],
  );
  assert.equal(
    structure.uniqueAudioSourceByTrackNumber.size,
    8,
  );
  assert.equal(
    structure.uniqueImageSourceByTrackNumber.size,
    8,
  );
});

test("adds visible source-structure evidence to candidate and file inspection", () => {
  const inspection = addIngestStructureEvidence(
    killchainInspection(),
  );
  const structureEvidence =
    inspection.candidate.evidence.find(
      (item) =>
        item.rule ===
        "structure-numbered-track-folders-v1",
    );
  const runtimeArtwork = inspection.files.find(
    (source) =>
      source.relativePath.endsWith(
        "08/Runtime_01.jpeg",
      ),
  );

  assert.equal(
    structureEvidence?.value,
    "8 numbered track folders",
  );
  assert.ok(
    runtimeArtwork?.evidence.some(
      (item) =>
        item.field === "artwork.track_number" &&
        item.value === 8,
    ),
  );
  assert.ok(
    runtimeArtwork?.evidence.some(
      (item) =>
        item.field === "artwork.scope" &&
        item.value === "track",
    ),
  );
  assert.ok(
    runtimeArtwork?.evidence.some(
      (item) =>
        item.field === "artwork.role" &&
        item.value === "front_cover",
    ),
  );
});

test("does not guess one track cover when a numbered folder has multiple images", () => {
  const inspection = killchainInspection();
  inspection.files.push(
    file("03/alternate.jpeg", "image"),
  );
  const draft = createDefaultIngestBuildDraft(inspection);
  const trackThreeImages = draft.assets.filter(
    (asset) =>
      asset.sourceRelativePath.includes("/03/") &&
      asset.mediaKind === "image",
  );

  assert.equal(trackThreeImages.length, 2);
  assert.ok(
    trackThreeImages.every(
      (asset) => asset.artworkAssignments.length === 0,
    ),
  );
});

test("does not guess release front when multiple root images are present", () => {
  const inspection = killchainInspection();
  inspection.files.push(
    file("alternate-release-cover.jpeg", "image"),
  );
  const draft = createDefaultIngestBuildDraft(inspection);
  const rootImages = draft.assets.filter(
    (asset) =>
      !sourcePathWithinCandidate(
        candidateId,
        asset.sourceRelativePath,
      ).includes("/") &&
      asset.mediaKind === "image",
  );

  assert.equal(rootImages.length, 2);
  assert.ok(
    rootImages.every(
      (asset) => asset.artworkAssignments.length === 0,
    ),
  );
});
