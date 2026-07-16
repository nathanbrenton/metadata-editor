export type MetadataPathSegment =
  | string
  | number;

const forbiddenSegments = new Set([
  "__proto__",
  "prototype",
  "constructor",
]);

const keyPattern =
  /^[A-Za-z_][A-Za-z0-9_-]*/;

const arrayIndexPattern =
  /^\[(0|[1-9][0-9]*)\]/;

/*
 * Parses canonical paths such as:
 *
 *   track.title
 *   track.performers[0].name
 *
 * Numeric array indexes are returned as numbers. Unsafe prototype
 * segments and malformed path syntax are rejected.
 */
export function parseMetadataPath(
  metadataPath: string,
): MetadataPathSegment[] {
  if (metadataPath.length === 0) {
    throw new Error(
      "Metadata path must not be empty.",
    );
  }

  const segments: MetadataPathSegment[] = [];
  let remaining = metadataPath;
  let expectKey = true;

  while (remaining.length > 0) {
    if (expectKey) {
      const keyMatch =
        remaining.match(keyPattern);

      if (!keyMatch) {
        throw new Error(
          `Invalid metadata path near "${remaining}".`,
        );
      }

      const key = keyMatch[0];

      if (forbiddenSegments.has(key)) {
        throw new Error(
          `Unsafe metadata path segment "${key}".`,
        );
      }

      segments.push(key);
      remaining = remaining.slice(key.length);
      expectKey = false;
      continue;
    }

    if (remaining.startsWith("[")) {
      const indexMatch =
        remaining.match(arrayIndexPattern);

      if (!indexMatch) {
        throw new Error(
          `Invalid array index near "${remaining}".`,
        );
      }

      segments.push(Number(indexMatch[1]));
      remaining = remaining.slice(
        indexMatch[0].length,
      );
      continue;
    }

    if (remaining.startsWith(".")) {
      remaining = remaining.slice(1);

      if (remaining.length === 0) {
        throw new Error(
          "Metadata path must not end with a dot.",
        );
      }

      expectKey = true;
      continue;
    }

    throw new Error(
      `Invalid metadata path near "${remaining}".`,
    );
  }

  if (expectKey) {
    throw new Error(
      "Metadata path ended unexpectedly.",
    );
  }

  return segments;
}

/*
 * Reconstructs a canonical path from validated segments.
 */
export function formatMetadataPath(
  segments: readonly MetadataPathSegment[],
): string {
  if (segments.length === 0) {
    throw new Error(
      "Metadata path requires at least one segment.",
    );
  }

  let result = "";

  for (const segment of segments) {
    if (typeof segment === "number") {
      if (
        !Number.isSafeInteger(segment) ||
        segment < 0
      ) {
        throw new Error(
          `Invalid metadata array index "${segment}".`,
        );
      }

      if (result.length === 0) {
        throw new Error(
          "Metadata paths cannot begin with an array index.",
        );
      }

      result += `[${segment}]`;
      continue;
    }

    if (!keyPattern.test(segment)) {
      throw new Error(
        `Invalid metadata key "${segment}".`,
      );
    }

    if (forbiddenSegments.has(segment)) {
      throw new Error(
        `Unsafe metadata path segment "${segment}".`,
      );
    }

    result +=
      result.length === 0
        ? segment
        : `.${segment}`;
  }

  return result;
}
