import type {
  SampleClearanceRecordInput,
  SampleClearanceStatus,
  SampleRelationshipRecordInput,
  SampleRelationshipType,
} from "./types.js";

const relationshipTypes = new Set<SampleRelationshipType>([
  "sample",
  "interpolation",
  "musical quotation",
  "lyrical quotation",
  "unknown sample source",
]);

const clearanceStatuses = new Set<SampleClearanceStatus>([
  "not reviewed",
  "identification pending",
  "clearance pending",
  "cleared",
  "restricted",
  "rejected",
  "not required",
]);

function sourceIndex(value: unknown, label: string): number | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== "number") {
    throw new Error(`${label} sourceIndex must be a number or null.`);
  }
  return value;
}

function stringField(
  record: Record<string, unknown>,
  key: string,
  label: string,
): string {
  const value = record[key];
  if (typeof value !== "string") {
    throw new Error(`${label} requires ${key}.`);
  }
  return value;
}

function stringArrayField(
  record: Record<string, unknown>,
  key: string,
  label: string,
): string[] {
  const value = record[key];
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw new Error(`${label} requires ${key} as an array of strings.`);
  }
  return value;
}

export function normalizeSampleRelationshipRequest(
  value: unknown,
): SampleRelationshipRecordInput[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error("sampleRelationships must be an array.");
  }

  return value.map((entry, index) => {
    const label = `Sample relationship ${index + 1}`;
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error(`${label} must be an object.`);
    }
    const record = entry as Record<string, unknown>;
    const relationshipType = stringField(record, "relationshipType", label);
    if (!relationshipTypes.has(relationshipType as SampleRelationshipType)) {
      throw new Error(`${label} has an unsupported relationshipType.`);
    }
    const sourceYearValue = record.sourceYear;
    if (!(sourceYearValue === null || typeof sourceYearValue === "number")) {
      throw new Error(`${label} sourceYear must be a number or null.`);
    }

    return {
      sourceIndex: sourceIndex(record.sourceIndex, label),
      relationshipType: relationshipType as SampleRelationshipType,
      sourceTitle: stringField(record, "sourceTitle", label),
      sourceArtist: stringField(record, "sourceArtist", label),
      sourceWriters: stringArrayField(record, "sourceWriters", label),
      sourceRelease: stringField(record, "sourceRelease", label),
      sourceYear: sourceYearValue,
      sourceIsrc: stringField(record, "sourceIsrc", label),
      sourceIswc: stringField(record, "sourceIswc", label),
      usageDescription: stringField(record, "usageDescription", label),
      creditText: stringField(record, "creditText", label),
      notes: stringField(record, "notes", label),
    };
  });
}

export function normalizeSampleClearanceRequest(
  value: unknown,
): SampleClearanceRecordInput[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error("sampleClearances must be an array.");
  }

  return value.map((entry, index) => {
    const label = `Sample clearance ${index + 1}`;
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new Error(`${label} must be an object.`);
    }
    const record = entry as Record<string, unknown>;
    const status = stringField(record, "status", label);
    if (!clearanceStatuses.has(status as SampleClearanceStatus)) {
      throw new Error(`${label} has an unsupported status.`);
    }
    if (typeof record.sampleReference !== "number") {
      throw new Error(`${label} requires sampleReference.`);
    }
    if (typeof record.masterUseCleared !== "boolean" || typeof record.publishingCleared !== "boolean") {
      throw new Error(`${label} requires both clearance booleans.`);
    }

    return {
      sourceIndex: sourceIndex(record.sourceIndex, label),
      sampleReference: record.sampleReference,
      status: status as SampleClearanceStatus,
      masterUseCleared: record.masterUseCleared,
      publishingCleared: record.publishingCleared,
      agreementReference: stringField(record, "agreementReference", label),
      territories: stringArrayField(record, "territories", label),
      expirationDate: stringField(record, "expirationDate", label),
      notes: stringField(record, "notes", label),
    };
  });
}
