import {
  createMetadataValueAtPath,
  readMetadataValueAtPath,
  replaceMetadataValueAtPath,
} from "./metadata-document.js";
import type {
  SampleClearanceRecordInput,
  SampleClearanceStatus,
  SampleRelationshipRecordInput,
  SampleRelationshipType,
} from "./types.js";

const relationshipTypes: readonly SampleRelationshipType[] = [
  "sample",
  "interpolation",
  "musical quotation",
  "lyrical quotation",
  "unknown sample source",
];

const clearanceStatuses: readonly SampleClearanceStatus[] = [
  "not reviewed",
  "identification pending",
  "clearance pending",
  "cleared",
  "restricted",
  "rejected",
  "not required",
];

function readRecordArray(
  document: unknown,
  path: string,
): { exists: boolean; records: unknown[] } {
  try {
    const value = readMetadataValueAtPath(document, path);

    if (!Array.isArray(value)) {
      throw new Error(`${path} must be an array.`);
    }

    return { exists: true, records: value };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("does not exist")
    ) {
      return { exists: false, records: [] };
    }

    throw error;
  }
}

function preservedRecord(
  records: readonly unknown[],
  sourceIndex: number | null,
  label: string,
): Record<string, unknown> {
  if (sourceIndex === null) {
    return {};
  }

  if (
    !Number.isSafeInteger(sourceIndex) ||
    sourceIndex < 0 ||
    sourceIndex >= records.length
  ) {
    throw new Error(`${label} source index is out of bounds.`);
  }

  const source = records[sourceIndex];

  if (
    typeof source !== "object" ||
    source === null ||
    Array.isArray(source)
  ) {
    throw new Error(`${label} source record is not an object.`);
  }

  return { ...source } as Record<string, unknown>;
}

function validateText(label: string, value: string): string {
  if (value.length > 4_000) {
    throw new Error(`${label} may not exceed 4000 characters.`);
  }

  return value.trim();
}

function validateStringArray(
  label: string,
  values: readonly string[],
): string[] {
  if (values.length > 100) {
    throw new Error(`${label} may not contain more than 100 values.`);
  }

  return values.map((value, index) =>
    validateText(`${label} value ${index + 1}`, value),
  ).filter(Boolean);
}

function writeRecordArray(
  document: unknown,
  path: string,
  exists: boolean,
  records: Record<string, unknown>[],
): unknown {
  return exists
    ? replaceMetadataValueAtPath(document, path, records)
    : createMetadataValueAtPath(document, path, records);
}

export function applySampleRelationshipRecords(
  document: unknown,
  records: readonly SampleRelationshipRecordInput[],
): unknown {
  if (records.length > 250) {
    throw new Error("A track may not contain more than 250 sample relationships.");
  }

  const existing = readRecordArray(document, "track.samples");
  const usedSources = new Set<number>();
  const nextRecords = records.map((record, index) => {
    const label = `Sample relationship ${index + 1}`;

    if (!relationshipTypes.includes(record.relationshipType)) {
      throw new Error(`${label} has an unsupported relationship type.`);
    }

    const sourceTitle = validateText(`${label} source title`, record.sourceTitle);
    const sourceArtist = validateText(`${label} source artist`, record.sourceArtist);
    if (record.relationshipType === "unknown sample source") {
      if (!sourceArtist) {
        throw new Error(`${label} requires a source artist when the exact source title is unknown.`);
      }
    } else if (!sourceTitle) {
      throw new Error(`${label} requires a source title.`);
    }

    if (record.sourceIndex !== null) {
      if (usedSources.has(record.sourceIndex)) {
        throw new Error(`${label} reuses an existing source record.`);
      }
      usedSources.add(record.sourceIndex);
    }

    const result = preservedRecord(existing.records, record.sourceIndex, label);
    for (const key of [
      "relationship_type",
      "source_title",
      "source_artist",
      "source_writers",
      "source_release",
      "source_year",
      "source_isrc",
      "source_iswc",
      "usage_description",
      "credit_text",
      "notes",
    ]) {
      delete result[key];
    }

    result.relationship_type = record.relationshipType;
    if (sourceTitle) {
      result.source_title = sourceTitle;
    }

    const optionalText: Array<[string, string]> = [
      ["source_artist", sourceArtist],
      ["source_release", record.sourceRelease],
      ["source_isrc", record.sourceIsrc],
      ["source_iswc", record.sourceIswc],
      ["usage_description", record.usageDescription],
      ["credit_text", record.creditText],
      ["notes", record.notes],
    ];
    for (const [key, value] of optionalText) {
      const normalized = validateText(`${label} ${key}`, value);
      if (normalized) {
        result[key] = normalized;
      }
    }

    const writers = validateStringArray(`${label} source writers`, record.sourceWriters);
    if (writers.length > 0) {
      result.source_writers = writers;
    }

    if (record.sourceYear !== null) {
      if (
        !Number.isSafeInteger(record.sourceYear) ||
        record.sourceYear < 1000 ||
        record.sourceYear > 9999
      ) {
        throw new Error(`${label} source year must be a four-digit year.`);
      }
      result.source_year = record.sourceYear;
    }

    return result;
  });

  return writeRecordArray(
    document,
    "track.samples",
    existing.exists,
    nextRecords,
  );
}

export function applySampleClearanceRecords(
  document: unknown,
  records: readonly SampleClearanceRecordInput[],
): unknown {
  if (records.length > 250) {
    throw new Error("A track may not contain more than 250 sample-clearance records.");
  }

  const existing = readRecordArray(document, "track.sample_clearances");
  const usedSources = new Set<number>();
  const nextRecords = records.map((record, index) => {
    const label = `Sample clearance ${index + 1}`;

    if (!clearanceStatuses.includes(record.status)) {
      throw new Error(`${label} has an unsupported status.`);
    }
    if (
      !Number.isSafeInteger(record.sampleReference) ||
      record.sampleReference < 1
    ) {
      throw new Error(`${label} requires a positive sample reference.`);
    }

    if (record.sourceIndex !== null) {
      if (usedSources.has(record.sourceIndex)) {
        throw new Error(`${label} reuses an existing source record.`);
      }
      usedSources.add(record.sourceIndex);
    }

    const result = preservedRecord(existing.records, record.sourceIndex, label);
    for (const key of [
      "sample_reference",
      "status",
      "master_use_cleared",
      "publishing_cleared",
      "agreement_reference",
      "territories",
      "expiration_date",
      "notes",
      "editor_only",
    ]) {
      delete result[key];
    }

    result.sample_reference = record.sampleReference;
    result.status = record.status;
    result.master_use_cleared = record.masterUseCleared;
    result.publishing_cleared = record.publishingCleared;
    result.editor_only = true;

    const agreementReference = validateText(
      `${label} agreement reference`,
      record.agreementReference,
    );
    if (agreementReference) {
      result.agreement_reference = agreementReference;
    }

    const territories = validateStringArray(`${label} territories`, record.territories);
    if (territories.length > 0) {
      result.territories = territories;
    }

    const expirationDate = validateText(`${label} expiration date`, record.expirationDate);
    if (expirationDate) {
      if (!/^\d{4}(?:-\d{2}(?:-\d{2})?)?$/.test(expirationDate)) {
        throw new Error(`${label} expiration date must use YYYY, YYYY-MM, or YYYY-MM-DD.`);
      }
      result.expiration_date = expirationDate;
    }

    const notes = validateText(`${label} notes`, record.notes);
    if (notes) {
      result.notes = notes;
    }

    return result;
  });

  return writeRecordArray(
    document,
    "track.sample_clearances",
    existing.exists,
    nextRecords,
  );
}
