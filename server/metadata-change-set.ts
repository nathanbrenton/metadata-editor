import {
  createMetadataValueAtPath,
  deleteMetadataValueAtPath,
  readMetadataValueAtPath,
  replaceMetadataValueAtPath,
} from "./metadata-document.js";
import {
  formatMetadataPath,
  parseMetadataPath,
  type MetadataPathSegment,
} from "./metadata-path.js";

import {
  classifyMetadataEditability,
  isEditableMetadataValue,
  type EditableMetadataValue,
} from "./metadata-editability.js";
import type {
  ArrangementContributorRecordInput,
  ContributorRecordInput,
  PerformerRecordInput,
  TechnicalContributorRecordInput,
  WritingCreditFamily,
  WritingCreditRecordInput,
} from "./types.js";
import {
  isArrangementContributorRole,
  isTechnicalContributorRole,
} from "./metadata-vocabularies.js";

export type MetadataValueChange = {
  path: string;
  value: EditableMetadataValue;
};

function describeEditableType(
  metadataPath: string,
  value: unknown,
): string {
  return classifyMetadataEditability(
    metadataPath,
    value,
  ).valueType;
}

function isPathPrefix(
  left: readonly MetadataPathSegment[],
  right: readonly MetadataPathSegment[],
): boolean {
  if (left.length >= right.length) {
    return false;
  }

  return left.every(
    (segment, index) =>
      segment === right[index],
  );
}

/*
 * Applies a complete set of edits to an already parsed TOML document.
 *
 * Every target must already exist and must contain an editable scalar
 * or string-array value. Edits cannot overlap, change value type, or
 * implicitly create new objects or array entries.
 */
export function applyMetadataChanges(
  document: unknown,
  changes: readonly MetadataValueChange[],
): unknown {
  if (changes.length === 0) {
    throw new Error(
      "At least one metadata change is required.",
    );
  }

  const normalizedChanges = changes.map(
    (change) => {
      const segments = parseMetadataPath(
        change.path,
      );

      return {
        ...change,
        segments,
        normalizedPath:
          formatMetadataPath(segments),
      };
    },
  );

  const uniquePaths = new Set<string>();

  for (const change of normalizedChanges) {
    if (
      uniquePaths.has(change.normalizedPath)
    ) {
      throw new Error(
        `Duplicate metadata change path "${change.normalizedPath}".`,
      );
    }

    uniquePaths.add(change.normalizedPath);
  }

  for (
    let leftIndex = 0;
    leftIndex < normalizedChanges.length;
    leftIndex += 1
  ) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < normalizedChanges.length;
      rightIndex += 1
    ) {
      const left =
        normalizedChanges[leftIndex];
      const right =
        normalizedChanges[rightIndex];

      if (
        isPathPrefix(
          left.segments,
          right.segments,
        ) ||
        isPathPrefix(
          right.segments,
          left.segments,
        )
      ) {
        throw new Error(
          `Overlapping metadata changes "${left.normalizedPath}" and "${right.normalizedPath}" are not allowed.`,
        );
      }
    }
  }

  let updatedDocument = document;

  for (const change of normalizedChanges) {
    const currentValue =
      readMetadataValueAtPath(
        updatedDocument,
        change.segments,
      );

    if (
      !isEditableMetadataValue(currentValue)
    ) {
      throw new Error(
        `Metadata path "${change.normalizedPath}" is not an editable scalar or string array.`,
      );
    }

    if (
      !isEditableMetadataValue(change.value)
    ) {
      throw new Error(
        `Only scalar values and string arrays may be saved: ${change.normalizedPath}`,
      );
    }

    if (
      typeof change.value === "number" &&
      !Number.isFinite(change.value)
    ) {
      throw new Error(
        `Metadata number must be finite: ${change.normalizedPath}`,
      );
    }

    const currentType =
      describeEditableType(
        change.normalizedPath,
        currentValue,
      );
    const nextType =
      describeEditableType(
        change.normalizedPath,
        change.value,
      );

    if (currentType !== nextType) {
      throw new Error(
        `Metadata type mismatch at ${change.normalizedPath}: expected ${currentType}; cannot change type from ${currentType} to ${nextType}`,
      );
    }

    updatedDocument =
      replaceMetadataValueAtPath(
        updatedDocument,
        change.segments,
        change.value,
      );
  }

  return updatedDocument;
}


/*
 * Creates missing scalar or string-array fields without permitting
 * overwrites, arrays, overlapping paths, or unsafe values.
 */
export function applyMetadataCreations(
  document: unknown,
  changes: readonly MetadataValueChange[],
): unknown {
  if (changes.length === 0) {
    throw new Error(
      "At least one metadata field creation is required.",
    );
  }

  const normalizedChanges = changes.map(
    (change) => {
      const segments =
        parseMetadataPath(
          change.path,
        );

      if (
        segments.some(
          (segment) =>
            typeof segment === "number",
        )
      ) {
        throw new Error(
          `Creating array metadata is not supported: ${change.path}`,
        );
      }

      if (
        !isEditableMetadataValue(
          change.value,
        )
      ) {
        throw new Error(
          `Only scalar values and string arrays may be created: ${change.path}`,
        );
      }

      return {
        ...change,
        segments,
        normalizedPath:
          formatMetadataPath(segments),
      };
    },
  );

  const paths = new Set<string>();

  for (const change of normalizedChanges) {
    if (
      paths.has(change.normalizedPath)
    ) {
      throw new Error(
        `Duplicate metadata creation path "${change.normalizedPath}".`,
      );
    }

    paths.add(change.normalizedPath);
  }

  let updatedDocument = document;

  for (const change of normalizedChanges) {
    try {
      readMetadataValueAtPath(
        updatedDocument,
        change.segments,
      );

      throw new Error(
        `Metadata path already exists: ${change.normalizedPath}`,
      );
    } catch (error) {
      if (
        error instanceof Error &&
        !error.message.includes(
          "does not exist",
        )
      ) {
        throw error;
      }
    }

    updatedDocument =
      createMetadataValueAtPath(
        updatedDocument,
        change.segments,
        change.value,
      );
  }

  return updatedDocument;
}


/*
 * Removes registered optional scalar or string-array fields without allowing
 * array-record surgery, duplicate paths, overlapping paths, or object/table
 * deletion. Empty parent tables are pruned by deleteMetadataValueAtPath().
 */
export function applyMetadataDeletions(
  document: unknown,
  metadataPaths: readonly string[],
): unknown {
  if (metadataPaths.length === 0) {
    throw new Error(
      "At least one metadata field removal is required.",
    );
  }

  const normalizedPaths = metadataPaths.map(
    (metadataPath) => {
      const segments = parseMetadataPath(
        metadataPath,
      );

      if (
        segments.some(
          (segment) =>
            typeof segment === "number",
        )
      ) {
        throw new Error(
          `Removing array metadata is not supported: ${metadataPath}`,
        );
      }

      return {
        segments,
        normalizedPath:
          formatMetadataPath(segments),
      };
    },
  );

  const uniquePaths = new Set<string>();

  for (const metadataPath of normalizedPaths) {
    if (
      uniquePaths.has(
        metadataPath.normalizedPath,
      )
    ) {
      throw new Error(
        `Duplicate metadata removal path "${metadataPath.normalizedPath}".`,
      );
    }

    uniquePaths.add(
      metadataPath.normalizedPath,
    );
  }

  for (
    let leftIndex = 0;
    leftIndex < normalizedPaths.length;
    leftIndex += 1
  ) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < normalizedPaths.length;
      rightIndex += 1
    ) {
      const left = normalizedPaths[leftIndex];
      const right = normalizedPaths[rightIndex];

      if (
        isPathPrefix(
          left.segments,
          right.segments,
        ) ||
        isPathPrefix(
          right.segments,
          left.segments,
        )
      ) {
        throw new Error(
          `Overlapping metadata removals "${left.normalizedPath}" and "${right.normalizedPath}" are not allowed.`,
        );
      }
    }
  }

  let updatedDocument = document;

  for (const metadataPath of normalizedPaths) {
    const currentValue =
      readMetadataValueAtPath(
        updatedDocument,
        metadataPath.segments,
      );

    if (!isEditableMetadataValue(currentValue)) {
      throw new Error(
        `Metadata path "${metadataPath.normalizedPath}" is not an editable scalar or string array.`,
      );
    }

    updatedDocument =
      deleteMetadataValueAtPath(
        updatedDocument,
        metadataPath.segments,
      );
  }

  return updatedDocument;
}


function isMetadataRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function validatePerformerText(
  label: string,
  value: string,
): void {
  if (value.length > 500) {
    throw new Error(
      `${label} must not exceed 500 characters.`,
    );
  }

  if (value.includes("\0")) {
    throw new Error(
      `${label} must not contain null characters.`,
    );
  }
}

/*
 * Rebuilds track.performers from paired record inputs.
 *
 * Existing records are referenced by their original array index so
 * unknown sibling keys survive edits. Omitted source indexes are removed;
 * null source indexes append new name/role records.
 */
export function applyPerformerRecords(
  document: unknown,
  performers: readonly PerformerRecordInput[],
  performerPath:
    | "track.performers"
    | "release.credits.performers" =
      "track.performers",
): unknown {
  const scopeLabel =
    performerPath === "release.credits.performers"
      ? "release"
      : "track";

  if (performers.length > 500) {
    throw new Error(
      `A ${scopeLabel} may not contain more than 500 performer records.`,
    );
  }

  let existingValue: unknown = [];
  let pathExists = true;

  try {
    existingValue =
      readMetadataValueAtPath(
        document,
        performerPath,
      );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes(
        "does not exist",
      )
    ) {
      pathExists = false;
    } else {
      throw error;
    }
  }

  if (
    pathExists &&
    !Array.isArray(existingValue)
  ) {
    throw new Error(
      `${performerPath} must be an array.`,
    );
  }

  const existingRecords =
    Array.isArray(existingValue)
      ? existingValue
      : [];

  const usedSourceIndexes =
    new Set<number>();

  const nextRecords =
    performers.map(
      (performer, recordIndex) => {
        validatePerformerText(
          `Performer ${recordIndex + 1} name`,
          performer.name,
        );
        validatePerformerText(
          `Performer ${recordIndex + 1} role`,
          performer.role,
        );
        validatePerformerText(
          `Performer ${recordIndex + 1} sort name`,
          performer.sortName,
        );

        if (
          !performer.name.trim() ||
          !performer.role.trim()
        ) {
          throw new Error(
            `Performer ${recordIndex + 1} requires both a name and role.`,
          );
        }

        if (
          performer.sourceIndex === null
        ) {
          return {
            name: performer.name,
            role: performer.role,
            ...(performer.sortName
              ? {
                  sort_name:
                    performer.sortName,
                }
              : {}),
          };
        }

        if (
          !Number.isSafeInteger(
            performer.sourceIndex,
          ) ||
          performer.sourceIndex < 0 ||
          performer.sourceIndex >=
            existingRecords.length
        ) {
          throw new Error(
            `Performer source index is out of bounds: ${performer.sourceIndex}`,
          );
        }

        if (
          usedSourceIndexes.has(
            performer.sourceIndex,
          )
        ) {
          throw new Error(
            `Duplicate performer source index: ${performer.sourceIndex}`,
          );
        }

        usedSourceIndexes.add(
          performer.sourceIndex,
        );

        const existingRecord =
          existingRecords[
            performer.sourceIndex
          ];

        if (
          !isMetadataRecord(
            existingRecord,
          )
        ) {
          throw new Error(
            `Existing performer ${performer.sourceIndex + 1} is not a record.`,
          );
        }

        const nextRecord: Record<
          string,
          unknown
        > = {
          ...existingRecord,
          name: performer.name,
          role: performer.role,
        };

        if (
          performer.sortName ||
          Object.prototype.hasOwnProperty.call(
            existingRecord,
            "sort_name",
          )
        ) {
          nextRecord.sort_name =
            performer.sortName;
        }

        return nextRecord;
      },
    );

  return pathExists
    ? replaceMetadataValueAtPath(
        document,
        performerPath,
        nextRecords,
      )
    : createMetadataValueAtPath(
        document,
        performerPath,
        nextRecords,
      );
}


/*
 * Contributor editors manage disjoint role families inside one shared
 * contributors array. Rebuild every changed family against the same original
 * source indexes so saving technical and arrangement edits together cannot
 * shift or overwrite neighboring contributor records.
 */
type ContributorPath =
  | "track.contributors"
  | "release.credits.contributors";

type ManagedContributorFamily = {
  label: string;
  records: readonly ContributorRecordInput[];
  managedSourceIndexes: readonly number[];
  acceptsRole: (role: string) => boolean;
  invalidExistingRoleDescription: string;
};

export type ContributorRecordFamilies = {
  technical?: {
    records: readonly TechnicalContributorRecordInput[];
    managedSourceIndexes: readonly number[];
  };
  arrangement?: {
    records: readonly ArrangementContributorRecordInput[];
    managedSourceIndexes: readonly number[];
  };
};

function buildManagedContributorFamilies(
  families: ContributorRecordFamilies,
): ManagedContributorFamily[] {
  return [
    ...(families.technical
      ? [
          {
            label: "Technical contributor",
            records: families.technical.records,
            managedSourceIndexes:
              families.technical.managedSourceIndexes,
            acceptsRole: isTechnicalContributorRole,
            invalidExistingRoleDescription:
              "a recording, mixing, or mastering credit",
          },
        ]
      : []),
    ...(families.arrangement
      ? [
          {
            label: "Arrangement contributor",
            records: families.arrangement.records,
            managedSourceIndexes:
              families.arrangement.managedSourceIndexes,
            acceptsRole: isArrangementContributorRole,
            invalidExistingRoleDescription:
              "an arrangement or orchestration credit",
          },
        ]
      : []),
  ];
}

export function applyContributorRecordFamilies(
  document: unknown,
  families: ContributorRecordFamilies,
  contributorPath: ContributorPath =
    "track.contributors",
): unknown {
  const managedFamilies =
    buildManagedContributorFamilies(families);

  if (managedFamilies.length === 0) {
    throw new Error(
      "At least one contributor record family is required.",
    );
  }

  const scopeLabel =
    contributorPath ===
    "release.credits.contributors"
      ? "release"
      : "track";

  for (const family of managedFamilies) {
    if (family.records.length > 500) {
      throw new Error(
        `A ${scopeLabel} may not contain more than 500 ${family.label.toLowerCase()} records.`,
      );
    }
  }

  let existingValue: unknown = [];
  let pathExists = true;

  try {
    existingValue = readMetadataValueAtPath(
      document,
      contributorPath,
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("does not exist")
    ) {
      pathExists = false;
    } else {
      throw error;
    }
  }

  if (pathExists && !Array.isArray(existingValue)) {
    throw new Error(
      `${contributorPath} must be an array.`,
    );
  }

  const existingRecords = Array.isArray(existingValue)
    ? existingValue
    : [];
  const globallyManagedIndexes = new Set<number>();
  const updatedBySourceIndex = new Map<
    number,
    Record<string, unknown>
  >();
  const appendedRecords: Record<string, unknown>[] = [];

  for (const family of managedFamilies) {
    const familyManagedIndexes = new Set<number>();

    family.managedSourceIndexes.forEach(
      (sourceIndex) => {
        if (
          !Number.isSafeInteger(sourceIndex) ||
          sourceIndex < 0 ||
          sourceIndex >= existingRecords.length
        ) {
          throw new Error(
            `${family.label} source index is out of bounds: ${sourceIndex}`,
          );
        }

        if (familyManagedIndexes.has(sourceIndex)) {
          throw new Error(
            `Duplicate managed ${family.label.toLowerCase()} source index: ${sourceIndex}`,
          );
        }

        if (globallyManagedIndexes.has(sourceIndex)) {
          throw new Error(
            `Contributor source index is managed by more than one editor: ${sourceIndex}`,
          );
        }

        const existingRecord =
          existingRecords[sourceIndex];

        if (
          !isMetadataRecord(existingRecord) ||
          typeof existingRecord.role !== "string" ||
          !family.acceptsRole(existingRecord.role)
        ) {
          throw new Error(
            `Contributor source index is not ${family.invalidExistingRoleDescription}: ${sourceIndex}`,
          );
        }

        familyManagedIndexes.add(sourceIndex);
        globallyManagedIndexes.add(sourceIndex);
      },
    );

    const usedSourceIndexes = new Set<number>();

    family.records.forEach(
      (contributor, recordIndex) => {
        validatePerformerText(
          `${family.label} ${recordIndex + 1} name`,
          contributor.name,
        );
        validatePerformerText(
          `${family.label} ${recordIndex + 1} role`,
          contributor.role,
        );
        validatePerformerText(
          `${family.label} ${recordIndex + 1} sort name`,
          contributor.sortName,
        );

        if (
          !contributor.name.trim() ||
          !contributor.role.trim()
        ) {
          throw new Error(
            `${family.label} ${recordIndex + 1} requires both a name and role.`,
          );
        }

        if (!family.acceptsRole(contributor.role)) {
          throw new Error(
            `${family.label} ${recordIndex + 1} role is not supported by this editor.`,
          );
        }

        if (contributor.sourceIndex === null) {
          appendedRecords.push({
            name: contributor.name,
            role: contributor.role,
            ...(contributor.sortName
              ? { sort_name: contributor.sortName }
              : {}),
          });
          return;
        }

        if (
          !familyManagedIndexes.has(
            contributor.sourceIndex,
          )
        ) {
          throw new Error(
            `${family.label} source index is not managed by this editor: ${contributor.sourceIndex}`,
          );
        }

        if (
          usedSourceIndexes.has(
            contributor.sourceIndex,
          )
        ) {
          throw new Error(
            `Duplicate ${family.label.toLowerCase()} source index: ${contributor.sourceIndex}`,
          );
        }

        usedSourceIndexes.add(
          contributor.sourceIndex,
        );

        const existingRecord =
          existingRecords[
            contributor.sourceIndex
          ];

        if (!isMetadataRecord(existingRecord)) {
          throw new Error(
            `Existing contributor ${contributor.sourceIndex + 1} is not a record.`,
          );
        }

        const nextRecord: Record<string, unknown> = {
          ...existingRecord,
          name: contributor.name,
          role: contributor.role,
        };

        if (
          contributor.sortName ||
          Object.prototype.hasOwnProperty.call(
            existingRecord,
            "sort_name",
          )
        ) {
          nextRecord.sort_name = contributor.sortName;
        }

        updatedBySourceIndex.set(
          contributor.sourceIndex,
          nextRecord,
        );
      },
    );
  }

  const nextRecords: Record<string, unknown>[] = [];

  existingRecords.forEach((record, sourceIndex) => {
    if (!globallyManagedIndexes.has(sourceIndex)) {
      if (!isMetadataRecord(record)) {
        throw new Error(
          `Existing contributor ${sourceIndex + 1} is not a record.`,
        );
      }

      nextRecords.push(record);
      return;
    }

    const replacement =
      updatedBySourceIndex.get(sourceIndex);

    if (replacement) {
      nextRecords.push(replacement);
    }
  });

  nextRecords.push(...appendedRecords);

  return pathExists
    ? replaceMetadataValueAtPath(
        document,
        contributorPath,
        nextRecords,
      )
    : createMetadataValueAtPath(
        document,
        contributorPath,
        nextRecords,
      );
}

export function applyTechnicalContributorRecords(
  document: unknown,
  contributors: readonly TechnicalContributorRecordInput[],
  managedSourceIndexes: readonly number[],
  contributorPath: ContributorPath =
    "track.contributors",
): unknown {
  return applyContributorRecordFamilies(
    document,
    {
      technical: {
        records: contributors,
        managedSourceIndexes,
      },
    },
    contributorPath,
  );
}

export function applyArrangementContributorRecords(
  document: unknown,
  contributors: readonly ArrangementContributorRecordInput[],
  managedSourceIndexes: readonly number[],
  contributorPath: ContributorPath =
    "track.contributors",
): unknown {
  return applyContributorRecordFamilies(
    document,
    {
      arrangement: {
        records: contributors,
        managedSourceIndexes,
      },
    },
    contributorPath,
  );
}

const writingCreditFamilies: readonly WritingCreditFamily[] = [
  "songwriters",
  "composers",
  "lyricists",
];

type WritingCreditBasePath =
  | "track"
  | "release.credits";

type ExistingWritingCreditFamily = {
  pathExists: boolean;
  records: unknown[];
};

function readExistingWritingCreditFamily(
  document: unknown,
  family: WritingCreditFamily,
  basePath: WritingCreditBasePath,
): ExistingWritingCreditFamily {
  const metadataPath = `${basePath}.${family}`;

  try {
    const value = readMetadataValueAtPath(
      document,
      metadataPath,
    );

    if (!Array.isArray(value)) {
      throw new Error(`${metadataPath} must be an array.`);
    }

    return {
      pathExists: true,
      records: value,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("does not exist")
    ) {
      return {
        pathExists: false,
        records: [],
      };
    }

    throw error;
  }
}

/*
 * Writing records are stored in separate songwriter, composer, and lyricist
 * arrays. Source identity remains attached while a guided role moves between
 * arrays, preserving identifiers and any unknown sibling keys.
 */
export function applyWritingCreditRecords(
  document: unknown,
  records: readonly WritingCreditRecordInput[],
  basePath: WritingCreditBasePath = "track",
): unknown {
  if (records.length > 500) {
    throw new Error(
      `A ${basePath === "track" ? "track" : "release"} may not contain more than 500 writing-credit records.`,
    );
  }

  const existingFamilies = new Map<
    WritingCreditFamily,
    ExistingWritingCreditFamily
  >(
    writingCreditFamilies.map((family) => [
      family,
      readExistingWritingCreditFamily(
        document,
        family,
        basePath,
      ),
    ]),
  );
  const nextFamilies = new Map<
    WritingCreditFamily,
    Record<string, unknown>[]
  >(
    writingCreditFamilies.map((family) => [family, []]),
  );
  const usedSources = new Set<string>();

  records.forEach((record, recordIndex) => {
    validatePerformerText(
      `Writing credit ${recordIndex + 1} name`,
      record.name,
    );
    validatePerformerText(
      `Writing credit ${recordIndex + 1} role`,
      record.role,
    );
    validatePerformerText(
      `Writing credit ${recordIndex + 1} sort name`,
      record.sortName,
    );

    if (!writingCreditFamilies.includes(record.family)) {
      throw new Error(
        `Writing credit ${recordIndex + 1} has an unsupported family.`,
      );
    }

    if (!record.name.trim() || !record.role.trim()) {
      throw new Error(
        `Writing credit ${recordIndex + 1} requires both a name and role.`,
      );
    }

    if (
      (record.sourceIndex === null) !==
      (record.sourceFamily === null)
    ) {
      throw new Error(
        `Writing credit ${recordIndex + 1} must provide sourceFamily and sourceIndex together.`,
      );
    }

    let existingRecord: Record<string, unknown> = {};

    if (
      record.sourceFamily !== null &&
      record.sourceIndex !== null
    ) {
      const sourceFamily = existingFamilies.get(
        record.sourceFamily,
      );

      if (
        !sourceFamily ||
        !Number.isSafeInteger(record.sourceIndex) ||
        record.sourceIndex < 0 ||
        record.sourceIndex >= sourceFamily.records.length
      ) {
        throw new Error(
          `Writing credit source index is out of bounds: ${record.sourceFamily}[${record.sourceIndex}]`,
        );
      }

      const sourceKey =
        `${record.sourceFamily}:${record.sourceIndex}`;

      if (usedSources.has(sourceKey)) {
        throw new Error(
          `Duplicate writing credit source: ${sourceKey}`,
        );
      }
      usedSources.add(sourceKey);

      const sourceRecord =
        sourceFamily.records[record.sourceIndex];

      if (!isMetadataRecord(sourceRecord)) {
        throw new Error(
          `Existing writing credit ${record.sourceIndex + 1} in ${basePath}.${record.sourceFamily} is not a record.`,
        );
      }

      existingRecord = sourceRecord;
    }

    const nextRecord: Record<string, unknown> = {
      ...existingRecord,
      name: record.name,
      role: record.role,
    };

    if (
      record.sortName ||
      Object.prototype.hasOwnProperty.call(
        existingRecord,
        "sort_name",
      )
    ) {
      nextRecord.sort_name = record.sortName;
    }

    nextFamilies.get(record.family)?.push(nextRecord);
  });

  let updatedDocument = document;

  for (const family of writingCreditFamilies) {
    const existingFamily = existingFamilies.get(family);
    const nextRecords = nextFamilies.get(family) ?? [];
    const metadataPath = `${basePath}.${family}`;

    if (!existingFamily?.pathExists && nextRecords.length === 0) {
      continue;
    }

    updatedDocument = existingFamily?.pathExists
      ? replaceMetadataValueAtPath(
          updatedDocument,
          metadataPath,
          nextRecords,
        )
      : createMetadataValueAtPath(
          updatedDocument,
          metadataPath,
          nextRecords,
        );
  }

  return updatedDocument;
}
