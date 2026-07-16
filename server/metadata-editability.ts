import {
  parseMetadataPath,
  type MetadataPathSegment,
} from "./metadata-path.js";

export type EditableMetadataValue =
  | string
  | number
  | boolean
  | string[];

export type MetadataEditability = {
  editable: boolean;
  indexed: boolean;
  valueType:
    | "string"
    | "number"
    | "boolean"
    | "string-array"
    | "unsupported";
  reason: string | null;
};

function isStringArray(
  value: unknown,
): value is string[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) => typeof entry === "string",
    )
  );
}

function containsArrayIndex(
  segments: readonly MetadataPathSegment[],
): boolean {
  return segments.some(
    (segment) => typeof segment === "number",
  );
}

/*
 * Describes whether an existing parsed TOML value is editable.
 *
 * Indexed scalar fields are classified as editable here, but the
 * persistence endpoint may still apply a temporary feature gate until
 * indexed writes are fully integrated and tested.
 */
export function classifyMetadataEditability(
  metadataPath: string,
  value: unknown,
): MetadataEditability {
  let segments: MetadataPathSegment[];

  try {
    segments = parseMetadataPath(
      metadataPath,
    );
  } catch (error) {
    return {
      editable: false,
      indexed: false,
      valueType: "unsupported",
      reason:
        error instanceof Error
          ? error.message
          : "Invalid metadata path.",
    };
  }

  const indexed =
    containsArrayIndex(segments);

  if (typeof value === "string") {
    return {
      editable: true,
      indexed,
      valueType: "string",
      reason: null,
    };
  }

  if (typeof value === "number") {
    return {
      editable: true,
      indexed,
      valueType: "number",
      reason: null,
    };
  }

  if (typeof value === "boolean") {
    return {
      editable: true,
      indexed,
      valueType: "boolean",
      reason: null,
    };
  }

  if (isStringArray(value)) {
    return {
      editable: true,
      indexed,
      valueType: "string-array",
      reason: null,
    };
  }

  if (Array.isArray(value)) {
    return {
      editable: false,
      indexed,
      valueType: "unsupported",
      reason:
        "Only arrays containing strings are directly editable.",
    };
  }

  if (
    typeof value === "object" &&
    value !== null
  ) {
    return {
      editable: false,
      indexed,
      valueType: "unsupported",
      reason:
        "Metadata objects must be edited through their individual fields.",
    };
  }

  return {
    editable: false,
    indexed,
    valueType: "unsupported",
    reason:
      "This metadata value type is not editable.",
  };
}

export function isEditableMetadataValue(
  value: unknown,
): value is EditableMetadataValue {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    isStringArray(value)
  );
}
