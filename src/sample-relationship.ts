export const sampleRelationshipTypeOptions = [
  "sample",
  "interpolation",
  "musical quotation",
  "lyrical quotation",
  "unknown sample source",
] as const;

export type SampleRelationshipType =
  typeof sampleRelationshipTypeOptions[number];

export const sampleClearanceStatusOptions = [
  "not reviewed",
  "identification pending",
  "clearance pending",
  "cleared",
  "restricted",
  "rejected",
  "not required",
] as const;

export type SampleClearanceStatus =
  typeof sampleClearanceStatusOptions[number];

export type SampleRelationshipRecordDraft = {
  key: string;
  sourceIndex: number | null;
  relationshipType: SampleRelationshipType;
  sourceTitle: string;
  sourceArtist: string;
  sourceWriters: string[];
  sourceRelease: string;
  sourceYear: number | null;
  sourceIsrc: string;
  sourceIswc: string;
  usageDescription: string;
  creditText: string;
  notes: string;
};

export type SampleClearanceRecordDraft = {
  key: string;
  sourceIndex: number | null;
  sampleReference: number;
  status: SampleClearanceStatus;
  masterUseCleared: boolean;
  publishingCleared: boolean;
  agreementReference: string;
  territories: string[];
  expirationDate: string;
  notes: string;
};

export function suggestSampleCreditText(
  record: Pick<
    SampleRelationshipRecordDraft,
    | "relationshipType"
    | "sourceTitle"
    | "sourceArtist"
    | "sourceWriters"
  >,
): string {
  const title = record.sourceTitle.trim();
  const artist = record.sourceArtist.trim();
  const writers = record.sourceWriters
    .map((writer) => writer.trim())
    .filter(Boolean);

  if (record.relationshipType === "unknown sample source") {
    return artist
      ? `Contains an unidentified sample associated with ${artist}.`
      : "";
  }

  if (!title) {
    return "";
  }

  const quotedTitle = `“${title}”`;
  const writerPhrase = writers.length > 0
    ? `, written by ${writers.join(" and ")}`
    : "";

  if (record.relationshipType === "interpolation") {
    return `Contains an interpolation of ${quotedTitle}${writerPhrase}.`;
  }

  if (record.relationshipType === "musical quotation") {
    return `Contains a musical quotation from ${quotedTitle}${writerPhrase}.`;
  }

  if (record.relationshipType === "lyrical quotation") {
    return `Contains a lyrical quotation from ${quotedTitle}${writerPhrase}.`;
  }

  if (artist) {
    return `Contains samples from ${quotedTitle} as performed by ${artist}.`;
  }

  return `Contains samples from ${quotedTitle}.`;
}

export function commaSeparatedValues(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}
