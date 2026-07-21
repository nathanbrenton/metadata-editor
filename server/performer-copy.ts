import type {
  ParsedMetadataDocument,
  PerformerRecordInput,
} from "./types.js";

export const MAX_PERFORMER_RECORDS = 500;

export type CopyablePerformerRecord = {
  sourceIndex: number;
  name: string;
  role: string;
  sortName: string;
};

export type PerformerCopyTargetPlan = {
  trackId: string;
  relativePath: string;
  documentExists: boolean;
  addCount: number;
  duplicateCount: number;
  resultingCount: number;
  status: "ready" | "blocked";
  reason?: string;
};

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function readOptionalText(
  record: Record<string, unknown>,
  key: string,
): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

export function normalizePerformerPairPart(
  value: string,
): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en-US");
}

export function performerPairKey(
  record: Pick<CopyablePerformerRecord, "name" | "role">,
): string {
  return [
    normalizePerformerPairPart(record.name),
    normalizePerformerPairPart(record.role),
  ].join("\u0000");
}

export function readCopyablePerformerRecords(
  document: ParsedMetadataDocument,
): CopyablePerformerRecord[] {
  let performers: unknown;

  if (document.scope === "release") {
    const release = document.parsed.release;

    if (!isRecord(release)) {
      return [];
    }

    const credits = release.credits;

    if (!isRecord(credits)) {
      return [];
    }

    performers = credits.performers;
  } else {
    const track = document.parsed.track;

    if (!isRecord(track)) {
      return [];
    }

    performers = track.performers;
  }

  if (!Array.isArray(performers)) {
    return [];
  }

  return performers.flatMap(
    (value, sourceIndex) => {
      if (!isRecord(value)) {
        return [];
      }

      const name = readOptionalText(
        value,
        "name",
      ).trim();
      const role = readOptionalText(
        value,
        "role",
      ).trim();

      if (!name || !role) {
        return [];
      }

      return [
        {
          sourceIndex,
          name,
          role,
          sortName: readOptionalText(
            value,
            "sort_name",
          ).trim(),
        },
      ];
    },
  );
}

export function selectPerformerRecords(
  records: readonly CopyablePerformerRecord[],
  sourceIndexes: readonly number[],
): CopyablePerformerRecord[] {
  if (sourceIndexes.length === 0) {
    throw new Error(
      "Select at least one performer credit to copy.",
    );
  }

  const uniqueIndexes = new Set<number>();

  return sourceIndexes.map((sourceIndex) => {
    if (
      !Number.isSafeInteger(sourceIndex) ||
      sourceIndex < 0
    ) {
      throw new Error(
        `Invalid performer source index: ${sourceIndex}`,
      );
    }

    if (uniqueIndexes.has(sourceIndex)) {
      throw new Error(
        `Duplicate performer source index: ${sourceIndex}`,
      );
    }

    uniqueIndexes.add(sourceIndex);

    const record = records.find(
      (candidate) =>
        candidate.sourceIndex === sourceIndex,
    );

    if (!record) {
      throw new Error(
        `Performer source index is unavailable: ${sourceIndex}`,
      );
    }

    return record;
  });
}

export function planPerformerCopyToTarget(
  selectedRecords: readonly CopyablePerformerRecord[],
  existingRecords: readonly CopyablePerformerRecord[],
  target: {
    trackId: string;
    relativePath: string;
    documentExists: boolean;
  },
): PerformerCopyTargetPlan & {
  additions: CopyablePerformerRecord[];
} {
  const existingKeys = new Set(
    existingRecords.map(performerPairKey),
  );
  const plannedKeys = new Set(existingKeys);
  const additions: CopyablePerformerRecord[] = [];
  let duplicateCount = 0;

  for (const selectedRecord of selectedRecords) {
    const key = performerPairKey(
      selectedRecord,
    );

    if (plannedKeys.has(key)) {
      duplicateCount += 1;
      continue;
    }

    plannedKeys.add(key);
    additions.push(selectedRecord);
  }

  const resultingCount =
    existingRecords.length + additions.length;

  if (resultingCount > MAX_PERFORMER_RECORDS) {
    return {
      ...target,
      addCount: additions.length,
      duplicateCount,
      resultingCount,
      status: "blocked",
      reason:
        `Copy would exceed the ${MAX_PERFORMER_RECORDS}-performer limit.`,
      additions,
    };
  }

  return {
    ...target,
    addCount: additions.length,
    duplicateCount,
    resultingCount,
    status: "ready",
    additions,
  };
}

export function buildPerformerReplacementInputs(
  existingRecords: readonly CopyablePerformerRecord[],
  additions: readonly CopyablePerformerRecord[],
): PerformerRecordInput[] {
  return [
    ...existingRecords.map(
      (record): PerformerRecordInput => ({
        sourceIndex: record.sourceIndex,
        name: record.name,
        role: record.role,
        sortName: record.sortName,
      }),
    ),
    ...additions.map(
      (record): PerformerRecordInput => ({
        sourceIndex: null,
        name: record.name,
        role: record.role,
        sortName: record.sortName,
      }),
    ),
  ];
}
