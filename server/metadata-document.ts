import {
  parseMetadataPath,
  type MetadataPathSegment,
} from "./metadata-path.js";

type MetadataContainer =
  | Record<string, unknown>
  | unknown[];

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function assertContainer(
  value: unknown,
  segment: MetadataPathSegment,
): asserts value is MetadataContainer {
  if (
    !Array.isArray(value) &&
    !isRecord(value)
  ) {
    throw new Error(
      `Cannot traverse metadata segment "${segment}" through a scalar value.`,
    );
  }
}

/*
 * Reads an existing value from a parsed TOML document.
 *
 * Array indexes must exist. Object properties must be own properties;
 * inherited values are never followed.
 */
export function readMetadataValueAtPath(
  document: unknown,
  metadataPath:
    | string
    | readonly MetadataPathSegment[],
): unknown {
  const segments =
    typeof metadataPath === "string"
      ? parseMetadataPath(metadataPath)
      : [...metadataPath];

  let current = document;

  for (const segment of segments) {
    assertContainer(current, segment);

    if (typeof segment === "number") {
      if (!Array.isArray(current)) {
        throw new Error(
          `Metadata segment "[${segment}]" requires an array.`,
        );
      }

      if (
        segment < 0 ||
        segment >= current.length
      ) {
        throw new Error(
          `Metadata array index "${segment}" is out of bounds.`,
        );
      }

      current = current[segment];
      continue;
    }

    if (Array.isArray(current)) {
      throw new Error(
        `Metadata key "${segment}" cannot be read directly from an array.`,
      );
    }

    if (
      !Object.prototype.hasOwnProperty.call(
        current,
        segment,
      )
    ) {
      throw new Error(
        `Metadata path does not exist; document does not contain "${segment}".`,
      );
    }

    current = current[segment];
  }

  return current;
}

/*
 * Replaces one existing value and returns a new root document.
 *
 * Containers along the selected path are shallow-cloned. Unchanged
 * branches retain their existing references. Missing fields and array
 * elements are rejected rather than created implicitly.
 */
export function replaceMetadataValueAtPath(
  document: unknown,
  metadataPath:
    | string
    | readonly MetadataPathSegment[],
  nextValue: unknown,
): unknown {
  const segments =
    typeof metadataPath === "string"
      ? parseMetadataPath(metadataPath)
      : [...metadataPath];

  if (segments.length === 0) {
    throw new Error(
      "Metadata replacement requires a path.",
    );
  }

  // Confirm that the entire path already exists before cloning.
  readMetadataValueAtPath(
    document,
    segments,
  );

  const replaceAt = (
    current: unknown,
    segmentIndex: number,
  ): unknown => {
    if (segmentIndex === segments.length) {
      return nextValue;
    }

    const segment = segments[segmentIndex];
    assertContainer(current, segment);

    if (typeof segment === "number") {
      if (!Array.isArray(current)) {
        throw new Error(
          `Metadata segment "[${segment}]" requires an array.`,
        );
      }

      const clone = [...current];

      clone[segment] = replaceAt(
        current[segment],
        segmentIndex + 1,
      );

      return clone;
    }

    if (Array.isArray(current)) {
      throw new Error(
        `Metadata key "${segment}" cannot be written directly to an array.`,
      );
    }

    return {
      ...current,
      [segment]: replaceAt(
        current[segment],
        segmentIndex + 1,
      ),
    };
  };

  return replaceAt(document, 0);
}


/*
 * Creates one previously missing object-path value. Array creation is
 * intentionally excluded from this first milestone.
 */
export function createMetadataValueAtPath(
  document: unknown,
  metadataPath:
    | string
    | readonly MetadataPathSegment[],
  nextValue: unknown,
): unknown {
  const segments =
    typeof metadataPath === "string"
      ? parseMetadataPath(metadataPath)
      : [...metadataPath];

  if (
    segments.length === 0 ||
    segments.some(
      (segment) =>
        typeof segment === "number",
    )
  ) {
    throw new Error(
      "Metadata field creation requires a non-array object path.",
    );
  }

  if (!isRecord(document)) {
    throw new Error(
      "Expected a metadata document object.",
    );
  }

  const createAt = (
    current: Record<string, unknown>,
    segmentIndex: number,
  ): Record<string, unknown> => {
    const segment =
      segments[segmentIndex];

    if (typeof segment !== "string") {
      throw new Error(
        "Metadata creation supports object paths only.",
      );
    }

    const isLeaf =
      segmentIndex ===
      segments.length - 1;

    if (isLeaf) {
      if (
        Object.prototype.hasOwnProperty.call(
          current,
          segment,
        )
      ) {
        throw new Error(
          `Metadata path already exists: "${metadataPath}".`,
        );
      }

      return {
        ...current,
        [segment]: nextValue,
      };
    }

    const existing =
      Object.prototype.hasOwnProperty.call(
        current,
        segment,
      )
        ? current[segment]
        : undefined;

    if (
      existing !== undefined &&
      !isRecord(existing)
    ) {
      throw new Error(
        `Cannot create metadata below scalar path segment "${segment}".`,
      );
    }

    return {
      ...current,
      [segment]: createAt(
        existing ?? {},
        segmentIndex + 1,
      ),
    };
  };

  return createAt(document, 0);
}
