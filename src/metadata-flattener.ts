export type FlattenedMetadataRow = {
  path: string;
  value: unknown;
  valueType: string;
};

function describeValueType(
  value: unknown,
): string {
  if (Array.isArray(value)) {
    if (
      value.every(
        (entry) => typeof entry === "string",
      )
    ) {
      return "string-array";
    }

    if (
      value.every(
        (entry) =>
          typeof entry === "object" &&
          entry !== null &&
          !Array.isArray(entry),
      )
    ) {
      return "object-array";
    }

    return "array";
  }

  if (value === null) {
    return "null";
  }

  return typeof value;
}

export function flattenMetadata(
  value: unknown,
  parentPath = "",
): FlattenedMetadataRow[] {
  if (Array.isArray(value)) {
    if (
      value.every(
        (entry) => typeof entry === "string",
      )
    ) {
      return [
        {
          path: parentPath,
          value,
          valueType: "string-array",
        },
      ];
    }

    if (value.length === 0) {
      return [
        {
          path: parentPath,
          value,
          valueType: "array",
        },
      ];
    }

    return value.flatMap((entry, index) =>
      flattenMetadata(
        entry,
        `${parentPath}[${index}]`,
      ),
    );
  }

  if (
    typeof value === "object" &&
    value !== null
  ) {
    const entries = Object.entries(
      value as Record<string, unknown>,
    );

    if (entries.length === 0) {
      return [
        {
          path: parentPath,
          value: {},
          valueType: "object",
        },
      ];
    }

    return entries.flatMap(
      ([key, childValue]) =>
        flattenMetadata(
          childValue,
          parentPath
            ? `${parentPath}.${key}`
            : key,
        ),
    );
  }

  return [
    {
      path: parentPath,
      value,
      valueType: describeValueType(value),
    },
  ];
}
