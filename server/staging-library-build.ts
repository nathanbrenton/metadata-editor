import {
  createHash,
} from "node:crypto";
import {
  lstat,
  readFile,
} from "node:fs/promises";
import path from "node:path";

import {
  assertPathWithinRoot,
} from "./media-root.js";
import {
  scanReleaseById,
} from "./scanner.js";
import {
  inspectWaveformDocument,
} from "./media-processing/plan.js";
import {
  buildMediaProcessingProfile,
  hashMediaProcessingProfile,
} from "./media-processing/profile.js";
import {
  writeStagingWaveform,
  type StagingWaveformWriter,
} from "./media-processing/staging-waveform.js";

export const STAGING_LIBRARY_BUILD_CONFIRMATION_PHRASE =
  "BUILD_LIBRARY_DERIVATIVES";

export type StagingLibraryBuildTrackAction =
  | "create"
  | "refresh"
  | "current"
  | "blocked";

export type StagingLibraryBuildTrackPlan = {
  trackId: string;
  masterRelativePath: string | null;
  waveformRelativePath: string;
  action: StagingLibraryBuildTrackAction;
  reason: string;
};

export type StagingLibraryBuildPlan = {
  releaseId: string;
  generatedAt: string;
  planFingerprint: string;
  confirmationPhrase:
    typeof STAGING_LIBRARY_BUILD_CONFIRMATION_PHRASE;
  summary: {
    trackCount: number;
    createCount: number;
    refreshCount: number;
    currentCount: number;
    blockedCount: number;
  };
  tracks: StagingLibraryBuildTrackPlan[];
};

export type ExecuteStagingLibraryBuildOptions = {
  waveformWriter?: StagingWaveformWriter;
};

type FingerprintFileState = {
  relativePath: string;
  exists: boolean;
  regular: boolean;
  symbolicLink: boolean;
  sizeBytes?: number;
  modifiedAtMs?: number;
  validWaveform?: boolean;
};

function libraryPath(
  mediaRoot: string,
  relativePath: string,
): string {
  return assertPathWithinRoot(
    mediaRoot,
    path.resolve(
      mediaRoot,
      ...relativePath
        .replaceAll("\\", "/")
        .split("/")
        .filter(Boolean),
    ),
  );
}

async function inspectFileState(
  mediaRoot: string,
  relativePath: string,
): Promise<FingerprintFileState> {
  const absolutePath = libraryPath(
    mediaRoot,
    relativePath,
  );

  try {
    const stats = await lstat(absolutePath);

    return {
      relativePath,
      exists: true,
      regular: stats.isFile(),
      symbolicLink: stats.isSymbolicLink(),
      sizeBytes: stats.size,
      modifiedAtMs: stats.mtimeMs,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return {
        relativePath,
        exists: false,
        regular: false,
        symbolicLink: false,
      };
    }

    throw error;
  }
}

function fingerprintForPlan(
  releaseId: string,
  profileHash: string,
  states: readonly FingerprintFileState[],
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        version: 1,
        releaseId,
        profileHash,
        states,
      }),
    )
    .digest("hex");
}

export async function buildStagingLibraryBuildPlan(
  mediaRoot: string,
  releaseId: string,
): Promise<StagingLibraryBuildPlan> {
  const normalizedReleaseId = releaseId.trim();

  if (!normalizedReleaseId) {
    throw new Error(
      "Staging Library Build requires a release ID.",
    );
  }

  const release = await scanReleaseById(
    mediaRoot,
    normalizedReleaseId,
  );

  if (!release) {
    throw new Error(
      `Library release was not found: ${normalizedReleaseId}`,
    );
  }

  const profile = buildMediaProcessingProfile();
  const profileHash =
    hashMediaProcessingProfile(profile);
  const fingerprintStates: FingerprintFileState[] = [];
  const tracks: StagingLibraryBuildTrackPlan[] = [];

  for (const track of release.tracks) {
    const waveformRelativePath = path.posix.join(
      track.relativePath.replaceAll("\\", "/"),
      profile.waveform.filename,
    );

    if (track.audioMasters.length !== 1) {
      tracks.push({
        trackId: track.id,
        masterRelativePath: null,
        waveformRelativePath,
        action: "blocked",
        reason:
          track.audioMasters.length === 0
            ? "No canonical audio master is available for waveform generation."
            : "More than one canonical audio master is present; choose one canonical master before waveform generation.",
      });
      fingerprintStates.push({
        relativePath: `${track.relativePath}/<canonical-audio-master>`,
        exists: track.audioMasters.length > 0,
        regular: false,
        symbolicLink: false,
        sizeBytes: track.audioMasters.length,
      });
      continue;
    }

    const masterRelativePath =
      track.audioMasters[0]!.relativePath;
    const masterState = await inspectFileState(
      mediaRoot,
      masterRelativePath,
    );
    fingerprintStates.push(masterState);

    if (
      !masterState.exists ||
      !masterState.regular ||
      masterState.symbolicLink
    ) {
      tracks.push({
        trackId: track.id,
        masterRelativePath,
        waveformRelativePath,
        action: "blocked",
        reason:
          "The canonical audio master is not a regular Library file.",
      });
      continue;
    }

    const waveformState = await inspectFileState(
      mediaRoot,
      waveformRelativePath,
    );

    if (!waveformState.exists) {
      fingerprintStates.push(waveformState);
      tracks.push({
        trackId: track.id,
        masterRelativePath,
        waveformRelativePath,
        action: "create",
        reason:
          "Waveform peaks are missing and will be generated from the canonical audio master.",
      });
      continue;
    }

    if (
      !waveformState.regular ||
      waveformState.symbolicLink
    ) {
      fingerprintStates.push(waveformState);
      tracks.push({
        trackId: track.id,
        masterRelativePath,
        waveformRelativePath,
        action: "blocked",
        reason:
          "The waveform destination exists but is not a regular Library file.",
      });
      continue;
    }

    let validWaveform = false;
    try {
      const waveformDocument = JSON.parse(
        await readFile(
          libraryPath(
            mediaRoot,
            waveformRelativePath,
          ),
          "utf8",
        ),
      ) as unknown;
      validWaveform =
        inspectWaveformDocument(
          waveformDocument,
          profile.waveform,
        ).valid;
    } catch {
      validWaveform = false;
    }

    waveformState.validWaveform = validWaveform;
    fingerprintStates.push(waveformState);

    const stale =
      (waveformState.modifiedAtMs ?? 0) <
      (masterState.modifiedAtMs ?? 0);

    tracks.push({
      trackId: track.id,
      masterRelativePath,
      waveformRelativePath,
      action:
        stale || !validWaveform
          ? "refresh"
          : "current",
      reason: stale
        ? "Waveform peaks are older than the canonical audio master and will be refreshed."
        : !validWaveform
          ? "Waveform peaks do not match the active Library waveform profile and will be refreshed."
          : "Waveform peaks are current for the canonical audio master and active profile.",
    });
  }

  const summary = {
    trackCount: tracks.length,
    createCount: tracks.filter(
      (track) => track.action === "create",
    ).length,
    refreshCount: tracks.filter(
      (track) => track.action === "refresh",
    ).length,
    currentCount: tracks.filter(
      (track) => track.action === "current",
    ).length,
    blockedCount: tracks.filter(
      (track) => track.action === "blocked",
    ).length,
  };

  return {
    releaseId: normalizedReleaseId,
    generatedAt: new Date().toISOString(),
    planFingerprint: fingerprintForPlan(
      normalizedReleaseId,
      profileHash,
      fingerprintStates,
    ),
    confirmationPhrase:
      STAGING_LIBRARY_BUILD_CONFIRMATION_PHRASE,
    summary,
    tracks,
  };
}

export async function executeStagingLibraryBuild(
  mediaRoot: string,
  releaseId: string,
  expectedPlanFingerprint: string,
  confirmation: string,
  options: ExecuteStagingLibraryBuildOptions = {},
): Promise<{
  releaseId: string;
  planFingerprint: string;
  generatedCount: number;
  refreshedCount: number;
  currentCount: number;
  completedAt: string;
}> {
  if (
    confirmation !==
    STAGING_LIBRARY_BUILD_CONFIRMATION_PHRASE
  ) {
    throw new Error(
      `Staging Library Build requires confirmation: ${STAGING_LIBRARY_BUILD_CONFIRMATION_PHRASE}`,
    );
  }

  const reviewedPlan =
    await buildStagingLibraryBuildPlan(
      mediaRoot,
      releaseId,
    );

  if (
    reviewedPlan.planFingerprint !==
    expectedPlanFingerprint
  ) {
    throw new Error(
      "The current Library Build plan differs from the reviewed plan. Refresh the plan before writing waveforms.",
    );
  }

  if (reviewedPlan.summary.blockedCount > 0) {
    throw new Error(
      "The reviewed Library Build plan is blocked. Resolve the blocked track state before writing waveforms.",
    );
  }

  const waveformWriter =
    options.waveformWriter ??
    writeStagingWaveform;

  let generatedCount = 0;
  let refreshedCount = 0;

  for (const track of reviewedPlan.tracks) {
    if (
      track.action !== "create" &&
      track.action !== "refresh"
    ) {
      continue;
    }

    if (!track.masterRelativePath) {
      throw new Error(
        `${track.trackId}: canonical audio master is unavailable.`,
      );
    }

    await waveformWriter(
      libraryPath(
        mediaRoot,
        track.masterRelativePath,
      ),
      libraryPath(
        mediaRoot,
        track.waveformRelativePath,
      ),
    );

    if (track.action === "create") {
      generatedCount += 1;
    } else {
      refreshedCount += 1;
    }
  }

  const verifiedPlan =
    await buildStagingLibraryBuildPlan(
      mediaRoot,
      releaseId,
    );
  const unfinished = verifiedPlan.tracks.filter(
    (track) => track.action !== "current",
  );

  if (unfinished.length > 0) {
    throw new Error(
      `Library waveform verification did not finish cleanly for ${unfinished
        .map((track) => track.trackId)
        .join(", ")}.`,
    );
  }

  return {
    releaseId: reviewedPlan.releaseId,
    planFingerprint:
      verifiedPlan.planFingerprint,
    generatedCount,
    refreshedCount,
    currentCount:
      verifiedPlan.summary.currentCount,
    completedAt: new Date().toISOString(),
  };
}
