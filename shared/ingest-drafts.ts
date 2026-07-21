import type {
  IngestBuildAssetDraft,
  IngestBuildDraft,
  IngestBuildTrackDraft,
} from "./ingest-builder.js";
import {
  createDefaultIngestBuildDraft,
  defaultReleaseArtworkAssignment,
} from "./ingest-builder.js";
import type {
  IngestCandidateInspection,
  IngestFileInspection,
} from "./ingest-types.js";

export const INGEST_DRAFT_SCHEMA_VERSION = 1;

export type IngestSourceState =
  | "unchanged"
  | "new"
  | "changed"
  | "missing";

export type IngestDraftSourceStatus = {
  sourceRelativePath: string;
  state: IngestSourceState;
  mediaKind: IngestFileInspection["mediaKind"];
  sizeBytes?: number;
  modifiedAt?: string;
  reviewed: boolean;
  attached: boolean;
};

export type StoredIngestDraft = {
  schemaVersion: typeof INGEST_DRAFT_SCHEMA_VERSION;
  candidateId: string;
  updatedAt: string;
  draft: IngestBuildDraft;
  sourceStatuses: IngestDraftSourceStatus[];
};

export type IngestDraftMergeResult = {
  draft: IngestBuildDraft;
  sourceStatuses: IngestDraftSourceStatus[];
  counts: {
    unchanged: number;
    new: number;
    changed: number;
    missing: number;
  };
};

function statusMap(
  statuses: IngestDraftSourceStatus[],
): Map<string, IngestDraftSourceStatus> {
  return new Map(
    statuses.map((status) => [
      status.sourceRelativePath,
      status,
    ]),
  );
}

function fileMap(
  files: IngestFileInspection[],
): Map<string, IngestFileInspection> {
  return new Map(
    files.map((file) => [
      file.relativePath,
      file,
    ]),
  );
}

function defaultStatuses(
  inspection: IngestCandidateInspection,
): IngestDraftSourceStatus[] {
  return inspection.files.map((file) => ({
    sourceRelativePath: file.relativePath,
    state: "unchanged",
    mediaKind: file.mediaKind,
    sizeBytes: file.sizeBytes,
    modifiedAt: file.modifiedAt,
    reviewed: true,
    attached: false,
  }));
}

export function createStoredIngestDraft(
  inspection: IngestCandidateInspection,
): StoredIngestDraft {
  return {
    schemaVersion: INGEST_DRAFT_SCHEMA_VERSION,
    candidateId: inspection.candidate.id,
    updatedAt: new Date().toISOString(),
    draft: createDefaultIngestBuildDraft(
      inspection,
    ),
    sourceStatuses: defaultStatuses(
      inspection,
    ),
  };
}

function preserveTrack(
  previous: IngestBuildTrackDraft,
  fallback: IngestBuildTrackDraft,
): IngestBuildTrackDraft {
  return {
    ...fallback,
    ...previous,
    sourceRelativePath:
      fallback.sourceRelativePath,
  };
}

function preserveAsset(
  previous: IngestBuildAssetDraft,
  fallback: IngestBuildAssetDraft,
): IngestBuildAssetDraft {
  return {
    ...fallback,
    ...previous,
    sourceRelativePath:
      fallback.sourceRelativePath,
    mediaKind: fallback.mediaKind,
    artworkAssignments:
      previous.artworkAssignments ??
      (previous.mediaKind === "image" &&
      previous.include
        ? [defaultReleaseArtworkAssignment()]
        : fallback.artworkAssignments),
  };
}

function countStates(
  statuses: IngestDraftSourceStatus[],
): IngestDraftMergeResult["counts"] {
  return statuses.reduce(
    (counts, status) => ({
      ...counts,
      [status.state]:
        counts[status.state] + 1,
    }),
    {
      unchanged: 0,
      new: 0,
      changed: 0,
      missing: 0,
    },
  );
}

export function mergeIngestDraftAfterRescan(
  stored: StoredIngestDraft,
  inspection: IngestCandidateInspection,
  attachedFiles: IngestFileInspection[] = [],
): IngestDraftMergeResult {
  const combinedFiles = [
    ...inspection.files,
    ...attachedFiles.filter(
      (file) =>
        !inspection.files.some(
          (candidateFile) =>
            candidateFile.relativePath ===
            file.relativePath,
        ),
    ),
  ];
  const combinedInspection: IngestCandidateInspection = {
    ...inspection,
    files: combinedFiles,
  };
  const defaults = createDefaultIngestBuildDraft(
    combinedInspection,
  );
  const previousTracks = new Map(
    stored.draft.tracks.map((track) => [
      track.sourceRelativePath,
      track,
    ]),
  );
  const previousAssets = new Map(
    stored.draft.assets.map((asset) => [
      asset.sourceRelativePath,
      asset,
    ]),
  );
  const previousStatuses = statusMap(
    stored.sourceStatuses,
  );
  const currentFiles = fileMap(combinedFiles);

  const tracks = defaults.tracks.map(
    (fallback) => {
      const previous = previousTracks.get(
        fallback.sourceRelativePath,
      );

      return previous
        ? preserveTrack(previous, fallback)
        : {
            ...fallback,
            include: false,
          };
    },
  );

  const assets = defaults.assets.map(
    (fallback) => {
      const previous = previousAssets.get(
        fallback.sourceRelativePath,
      );

      return previous
        ? preserveAsset(previous, fallback)
        : {
            ...fallback,
            include: false,
            artworkAssignments: [],
          };
    },
  );

  for (const previous of stored.draft.tracks) {
    if (!currentFiles.has(previous.sourceRelativePath)) {
      tracks.push(previous);
    }
  }

  for (const previous of stored.draft.assets) {
    if (!currentFiles.has(previous.sourceRelativePath)) {
      assets.push(previous);
    }
  }

  const allPaths = new Set([
    ...currentFiles.keys(),
    ...previousTracks.keys(),
    ...previousAssets.keys(),
  ]);
  const sourceStatuses: IngestDraftSourceStatus[] = [];

  for (const sourceRelativePath of allPaths) {
    const current = currentFiles.get(
      sourceRelativePath,
    );
    const previous = previousStatuses.get(
      sourceRelativePath,
    );
    const attached = attachedFiles.some(
      (file) =>
        file.relativePath === sourceRelativePath,
    );

    if (!current) {
      sourceStatuses.push({
        sourceRelativePath,
        state: "missing",
        mediaKind:
          previous?.mediaKind ?? "unknown",
        reviewed: false,
        attached: previous?.attached ?? attached,
      });
      continue;
    }

    if (!previous) {
      sourceStatuses.push({
        sourceRelativePath,
        state: "new",
        mediaKind: current.mediaKind,
        sizeBytes: current.sizeBytes,
        modifiedAt: current.modifiedAt,
        reviewed: false,
        attached,
      });
      continue;
    }

    const changed =
      previous.sizeBytes !== current.sizeBytes ||
      previous.modifiedAt !== current.modifiedAt;
    const pendingPreviousReview =
      !changed &&
      !previous.reviewed &&
      (previous.state === "new" ||
        previous.state === "changed");
    const restored =
      !changed &&
      previous.state === "missing";
    const state: IngestSourceState = changed || restored
      ? "changed"
      : pendingPreviousReview
        ? previous.state
        : "unchanged";

    sourceStatuses.push({
      sourceRelativePath,
      state,
      mediaKind: current.mediaKind,
      sizeBytes: current.sizeBytes,
      modifiedAt: current.modifiedAt,
      reviewed:
        state === "unchanged"
          ? true
          : pendingPreviousReview
            ? previous.reviewed
            : false,
      attached:
        previous.attached || attached,
    });
  }

  return {
    draft: {
      ...defaults,
      ...stored.draft,
      candidateId:
        inspection.candidate.id,
      tracks,
      assets,
    },
    sourceStatuses,
    counts: countStates(sourceStatuses),
  };
}

export function setIngestSourceReviewed(
  statuses: IngestDraftSourceStatus[],
  sourceRelativePath: string,
  reviewed: boolean,
): IngestDraftSourceStatus[] {
  return statuses.map((status) =>
    status.sourceRelativePath ===
    sourceRelativePath
      ? {
          ...status,
          reviewed,
        }
      : status,
  );
}

export function buildBlockingSourceStatuses(
  draft: IngestBuildDraft,
  statuses: IngestDraftSourceStatus[],
): IngestDraftSourceStatus[] {
  const includedPaths = new Set([
    ...draft.tracks
      .filter((track) => track.include)
      .map((track) =>
        track.sourceRelativePath,
      ),
    ...draft.assets
      .filter((asset) => asset.include)
      .map((asset) =>
        asset.sourceRelativePath,
      ),
  ]);
  const statusByPath = statusMap(statuses);
  const blocking = statuses.filter(
    (status) =>
      includedPaths.has(
        status.sourceRelativePath,
      ) &&
      (status.state === "missing" ||
        !status.reviewed),
  );

  for (const sourceRelativePath of includedPaths) {
    if (!statusByPath.has(sourceRelativePath)) {
      blocking.push({
        sourceRelativePath,
        state: "changed",
        mediaKind: "unknown",
        reviewed: false,
        attached: false,
      });
    }
  }

  return blocking;
}
