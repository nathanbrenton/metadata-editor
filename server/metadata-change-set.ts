import {
  createMetadataValueAtPath,
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
