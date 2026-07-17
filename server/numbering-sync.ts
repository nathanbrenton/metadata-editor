import type {
  MetadataValueChange,
  ParsedMetadataDocument,
  ReleaseMetadataDetail,
  ReleaseScanResult,
  ScalarMetadataSaveReceipt,
} from "./types.js";
import {
  readMetadataValueAtPath,
} from "./metadata-document.js";
import {
  readReleaseMetadataDetail,
} from "./metadata-reader.js";
import {
  saveScalarMetadataChanges,
} from "./metadata-saver.js";

export type ReleaseNumberingTotals = {
  trackTotal?: number;
  discTotal?: number;
};

export type NumberingSynchronizationResult = {
  synchronizedTrackFiles: number;
  receipts: ScalarMetadataSaveReceipt[];
  skippedTrackFiles: number;
};

function positiveInteger(
  value: unknown,
): number | undefined {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0
  )
    ? value
    : undefined;
}

export function getReleaseNumberingTotalsFromChanges(
  changes: readonly MetadataValueChange[],
): ReleaseNumberingTotals {
  const totals: ReleaseNumberingTotals = {};

  for (const change of changes) {
    if (
      change.path ===
      "release.numbering.track_total"
    ) {
      const trackTotal =
        positiveInteger(change.value);

      if (trackTotal !== undefined) {
        totals.trackTotal = trackTotal;
      }
    }

    if (
      change.path ===
      "release.numbering.disc_total"
    ) {
      const discTotal =
        positiveInteger(change.value);

      if (discTotal !== undefined) {
        totals.discTotal = discTotal;
      }
    }
  }

  return totals;
}

function readOptionalNumber(
  document: ParsedMetadataDocument,
  path: string,
): number | undefined {
  try {
    return positiveInteger(
      readMetadataValueAtPath(
        document.parsed,
        path,
      ),
    );
  } catch {
    return undefined;
  }
}

function buildTrackTotalChanges(
  document: ParsedMetadataDocument,
  totals: ReleaseNumberingTotals,
): MetadataValueChange[] {
  const changes: MetadataValueChange[] = [];

  if (
    totals.trackTotal !== undefined &&
    readOptionalNumber(
      document,
      "track.numbering.track_total",
    ) !== undefined &&
    readOptionalNumber(
      document,
      "track.numbering.track_total",
    ) !== totals.trackTotal
  ) {
    changes.push({
      path: "track.numbering.track_total",
      value: totals.trackTotal,
    });
  }

  if (
    totals.discTotal !== undefined &&
    readOptionalNumber(
      document,
      "track.numbering.disc_total",
    ) !== undefined &&
    readOptionalNumber(
      document,
      "track.numbering.disc_total",
    ) !== totals.discTotal
  ) {
    changes.push({
      path: "track.numbering.disc_total",
      value: totals.discTotal,
    });
  }

  return changes;
}

/*
 * Synchronizes totals only when the corresponding fields already exist
 * in track.toml. Missing paths are not created implicitly.
 *
 * Each track save keeps the existing stale-hash, backup, fsync,
 * confinement, parse-validation, and no-overwrite protections.
 */
export async function synchronizeTrackNumberingTotals(
  mediaRoot: string,
  release: ReleaseScanResult,
  totals: ReleaseNumberingTotals,
): Promise<NumberingSynchronizationResult> {
  if (
    totals.trackTotal === undefined &&
    totals.discTotal === undefined
  ) {
    return {
      synchronizedTrackFiles: 0,
      receipts: [],
      skippedTrackFiles: 0,
    };
  }

  const detail: ReleaseMetadataDetail =
    await readReleaseMetadataDetail(
      mediaRoot,
      release,
    );

  const trackDocuments =
    detail.documents.filter(
      (document) =>
        document.scope === "track" &&
        document.filename === "track.toml",
    );

  const receipts: ScalarMetadataSaveReceipt[] =
    [];
  let skippedTrackFiles = 0;

  for (const document of trackDocuments) {
    const changes = buildTrackTotalChanges(
      document,
      totals,
    );

    if (changes.length === 0) {
      skippedTrackFiles += 1;
      continue;
    }

    receipts.push(
      await saveScalarMetadataChanges(
        mediaRoot,
        release,
        document.relativePath,
        document.sha256,
        changes,
      ),
    );
  }

  return {
    synchronizedTrackFiles:
      receipts.length,
    receipts,
    skippedTrackFiles,
  };
}
