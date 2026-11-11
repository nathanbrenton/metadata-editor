import { flattenMetadata } from "../metadata-flattener.js";
import {
  isArrangementContributorRoleValue,
  normalizeArrangementCreditRole,
} from "../arrangement-credit-role.js";
import {
  defaultWritingRoleForFamily,
  type WritingCreditFamily,
} from "../writing-credit-role.js";
import {
  sampleClearanceStatusOptions,
  sampleRelationshipTypeOptions,
  type SampleClearanceRecordDraft,
  type SampleRelationshipRecordDraft,
} from "../sample-relationship.js";
import { isTechnicalContributorRoleValue } from "../technical-credit-role.js";
import type { MetadataActivityEntry } from "../activity-log.js";
import { findMetadataValueAcrossDocuments } from "../release-inheritance.js";
import { sortPerformerRoleDisplayValues } from "../performer-role-display-order.js";
import { deriveTrackSaveChanges } from "../track-derived-metadata.js";
import { deriveArtistSortNameChanges } from "../artist-sort-name.js";
import {
  buildReleaseEditorialStorageSnapshot,
  isReleaseEditorialStoragePath,
  readEditorialObjectPath,
  type ReleaseEditorialStorageSnapshot,
} from "../../shared/editorial-profile.js";
import {
  resolveCreditSortName,
  synchronizeCreditSortName,
} from "../credit-sort-name.js";
import { unmappedMetadataGroup } from "../metadata-presentation.js";
import { lyricsMetadataGroupOrder } from "../lyrics-language.js";
import type {
  MetadataFieldDefinition,
  ParsedMetadataDocument,
  TrackScanResult,
} from "./types.js";
import {
  MetadataPanel,
} from "./library-panels.js";

function TrackMetadataSummary({
  track,
}: {
  track: TrackScanResult;
}) {
  const missingCount =
    track.metadataFiles.filter(
      (file) => !file.exists,
    ).length;

  return (
    <article className="track-card track-metadata-summary">
      <header className="track-header">
        <div>
          <p className="card-type">
            Track
          </p>
          <h4>{track.id}</h4>
          <code>{track.relativePath}</code>
        </div>

        <span
          className={
            missingCount > 0
              ? "badge missing"
              : "badge complete"
          }
        >
          {missingCount > 0
            ? `${missingCount} missing`
            : "Complete"}
        </span>
      </header>

      <MetadataPanel
        title="Track metadata files"
        files={track.metadataFiles}
      />
    </article>
  );
}

type EditableMetadataValue =
  | string
  | number
  | boolean
  | string[];

type MetadataDraft = Record<
  string,
  EditableMetadataValue
>;

type PerformerRecordDraft = {
  key: string;
  sourceIndex: number | null;
  name: string;
  role: string;
  sortName: string;
};

type PerformerDraftMap = Record<
  string,
  PerformerRecordDraft[]
>;

type TechnicalCreditDraftMap = Record<
  string,
  PerformerRecordDraft[]
>;

type ArrangementCreditDraftMap = Record<
  string,
  PerformerRecordDraft[]
>;

type WritingCreditRecordDraft =
  PerformerRecordDraft & {
    family: WritingCreditFamily;
    sourceFamily: WritingCreditFamily | null;
  };

type WritingCreditDraftMap = Record<
  string,
  WritingCreditRecordDraft[]
>;

type SampleRelationshipDraftMap = Record<
  string,
  SampleRelationshipRecordDraft[]
>;

type SampleClearanceDraftMap = Record<
  string,
  SampleClearanceRecordDraft[]
>;

function applyCreditRecordUpdates<
  RecordType extends {
    name: string;
    sortName: string;
  },
>(
  record: RecordType,
  updates: Partial<RecordType>,
): RecordType {
  const nextName =
    typeof updates.name === "string"
      ? updates.name
      : record.name;
  const updatesSortName =
    Object.prototype.hasOwnProperty.call(
      updates,
      "sortName",
    );

  return {
    ...record,
    ...updates,
    name: nextName,
    sortName: updatesSortName
      ? updates.sortName ?? ""
      : nextName !== record.name
        ? synchronizeCreditSortName({
            previousName: record.name,
            nextName,
            currentSortName:
              record.sortName,
          })
        : record.sortName,
  } as RecordType;
}

type MetadataValueChange = {
  path: string;
  value: EditableMetadataValue;
};

type ScalarMetadataSaveReceipt = {
  relativePath: string;
  backupRelativePath: string;
  previousSha256: string;
  savedSha256: string;
  bytes: number;
  savedAt: string;
  synchronizedTrackFiles?: number;
  skippedTrackFiles?: number;
};

type TrackDirectoryRenameReceipt = {
  releaseId: string;
  operationId: string | null;
  manifestRelativePath: string | null;
  renamed: Array<{
    previousTrackId: string;
    trackId: string;
    previousRelativePath: string;
    relativePath: string;
  }>;
  renamedCount: number;
  completedAt: string;
};

type TrackDirectoryRenamePlanItem = {
  trackId: string;
  sourceRelativePath: string;
  targetId: string;
  targetRelativePath: string;
  trackNumber: number | null;
  discNumber: number;
  action: "rename" | "unchanged" | "blocked";
  reason: string;
  metadataRelativePaths: string[];
};

type TrackDirectoryRenamePlan = {
  releaseId: string;
  confirmation: "RENAME_TRACK_DIRECTORIES";
  generatedAt: string;
  items: TrackDirectoryRenamePlanItem[];
  summary: {
    renameCount: number;
    unchangedCount: number;
    blockedCount: number;
  };
  fingerprint: string;
};

type PerformerCopyTargetPlan = {
  trackId: string;
  relativePath: string;
  documentExists: boolean;
  addCount: number;
  duplicateCount: number;
  resultingCount: number;
  status: "ready" | "blocked";
  reason?: string;
};

type PerformerCopyExecutionTarget =
  PerformerCopyTargetPlan & {
    createdDocument: boolean;
    receipt?: ScalarMetadataSaveReceipt;
    error?: string;
  };

type PerformerCopyResponse = {
  releaseId: string;
  sourceTrackId: string;
  sourceRelativePath: string;
  sourceSha256: string;
  selectedCredits: Array<{
    sourceIndex: number;
    name: string;
    role: string;
    sortName: string;
  }>;
  destinations: PerformerCopyTargetPlan[];
  summary: {
    selectedCreditCount: number;
    destinationCount: number;
    readyCount: number;
    blockedCount: number;
    addCount: number;
    duplicateCount: number;
  };
  execution?: {
    status: "verified" | "partial" | "failed";
    targets: PerformerCopyExecutionTarget[];
    addedCount: number;
    duplicateCount: number;
    failedCount: number;
  };
};

type PerformerCopySource = {
  document: ParsedMetadataDocument;
  records: PerformerRecordDraft[];
};

type PerformerCopyTrackOption = {
  trackId: string;
  label: string;
  discNumber: number;
  trackNumber: number;
  title: string;
};

function createMetadataActivityEntry({
  releaseId,
  document,
  action,
  status,
  message,
  receipt,
}: {
  releaseId: string;
  document: ParsedMetadataDocument;
  action: MetadataActivityEntry["action"];
  status: MetadataActivityEntry["status"];
  message: string;
  receipt?: ScalarMetadataSaveReceipt;
}): MetadataActivityEntry {
  const occurredAt =
    receipt?.savedAt ??
    new Date().toISOString();

  return {
    id: [
      occurredAt,
      document.relativePath,
      action,
      status,
      Math.random().toString(36).slice(2),
    ].join(":"),
    occurredAt,
    releaseId,
    documentRelativePath:
      document.relativePath,
    documentFilename: document.filename,
    scope: document.scope,
    trackId: document.trackId,
    action,
    status,
    message,
    receipt: receipt
      ? {
          backupRelativePath:
            receipt.backupRelativePath,
          previousSha256:
            receipt.previousSha256,
          savedSha256:
            receipt.savedSha256,
          bytes: receipt.bytes,
          synchronizedTrackFiles:
            receipt.synchronizedTrackFiles,
          skippedTrackFiles:
            receipt.skippedTrackFiles,
        }
      : undefined,
  };
}

function createPerformerCopyActivityEntry({
  releaseId,
  sourceTrackId,
  target,
}: {
  releaseId: string;
  sourceTrackId: string;
  target: PerformerCopyExecutionTarget;
}): MetadataActivityEntry {
  const occurredAt =
    target.receipt?.savedAt ??
    new Date().toISOString();
  const verified =
    Boolean(target.receipt) &&
    !target.error;

  return {
    id: [
      occurredAt,
      target.relativePath,
      "copy-performers",
      verified ? "verified" : "failed",
      Math.random().toString(36).slice(2),
    ].join(":"),
    occurredAt,
    releaseId,
    documentRelativePath:
      target.relativePath,
    documentFilename:
      "track-credits.toml",
    scope: "track",
    trackId: target.trackId,
    action: "copy-performers",
    status: verified
      ? "verified"
      : "failed",
    message: verified
      ? `${target.addCount} ${
          target.addCount === 1
            ? "performer credit was"
            : "performer credits were"
        } copied from ${sourceTrackId} and verified.`
      : target.error ??
        `Performer credits from ${sourceTrackId} could not be copied.`,
    receipt: target.receipt
      ? {
          backupRelativePath:
            target.receipt.backupRelativePath,
          previousSha256:
            target.receipt.previousSha256,
          savedSha256:
            target.receipt.savedSha256,
          bytes: target.receipt.bytes,
        }
      : undefined,
  };
}

function isEditableMetadataValue(
  value: unknown,
): value is EditableMetadataValue {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    (
      Array.isArray(value) &&
      value.every(
        (entry) => typeof entry === "string",
      )
    )
  );
}

function metadataValuesEqual(
  left: EditableMetadataValue,
  right: EditableMetadataValue,
): boolean {
  if (
    Array.isArray(left) &&
    Array.isArray(right)
  ) {
    return (
      left.length === right.length &&
      left.every(
        (entry, index) =>
          entry === right[index],
      )
    );
  }

  return left === right;
}

function stringArrayToEditorText(
  values: string[],
): string {
  return values.join("\n");
}

function editorTextToStringArray(
  value: string,
): string[] {
  // Preserve the editor's exact line text while the user is typing.
  // Trimming here makes a controlled textarea immediately erase a trailing
  // space or newline, which prevents entering ordinary multi-word values.
  return value.split("\n");
}

function normalizeStringArrayEditorValue(
  value: string,
): string[] {
  return value
    .split("\n")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function getPerformerPath(
  document: ParsedMetadataDocument,
):
  | "track.performers"
  | "release.credits.performers" {
  return document.scope === "release"
    ? "release.credits.performers"
    : "track.performers";
}

function isPerformerRecordPath(
  metadataPath: string,
): boolean {
  return (
    metadataPath === "track.performers" ||
    metadataPath ===
      "release.credits.performers" ||
    /^(?:track\.performers|release\.credits\.performers)\[\d+\]\.(name|role|sort_name)$/.test(
      metadataPath,
    )
  );
}

function readPerformerRecords(
  document: ParsedMetadataDocument,
): PerformerRecordDraft[] {
  const performerContainer =
    document.scope === "release"
      ? (
          typeof document.parsed.release === "object" &&
          document.parsed.release !== null &&
          !Array.isArray(document.parsed.release) &&
          "credits" in document.parsed.release &&
          typeof document.parsed.release.credits === "object" &&
          document.parsed.release.credits !== null &&
          !Array.isArray(document.parsed.release.credits)
            ? document.parsed.release.credits
            : null
        )
      : (
          typeof document.parsed.track === "object" &&
          document.parsed.track !== null &&
          !Array.isArray(document.parsed.track)
            ? document.parsed.track
            : null
        );

  if (
    !performerContainer ||
    !("performers" in performerContainer) ||
    !Array.isArray(performerContainer.performers)
  ) {
    return [];
  }

  return performerContainer.performers.flatMap(
    (value, sourceIndex) => {
      if (
        typeof value !== "object" ||
        value === null ||
        Array.isArray(value)
      ) {
        return [];
      }

      return [
        {
          key:
            `existing-${sourceIndex}`,
          sourceIndex,
          name:
            "name" in value &&
            typeof value.name === "string"
              ? value.name
              : "",
          role:
            "role" in value &&
            typeof value.role === "string"
              ? value.role
              : "",
          sortName: resolveCreditSortName(
            "name" in value &&
            typeof value.name === "string"
              ? value.name
              : "",
            "sort_name" in value &&
            typeof value.sort_name === "string"
              ? value.sort_name
              : "",
          ),
        },
      ];
    },
  );
}

function performerRecordsEqual(
  left: readonly PerformerRecordDraft[],
  right: readonly PerformerRecordDraft[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (record, index) => {
        const comparison =
          right[index];

        return (
          comparison !== undefined &&
          record.sourceIndex ===
            comparison.sourceIndex &&
          record.name ===
            comparison.name &&
          record.role ===
            comparison.role &&
          record.sortName ===
            comparison.sortName
        );
      },
    )
  );
}

function serializePerformerRecords(
  records:
    | readonly PerformerRecordDraft[]
    | undefined,
): Array<{
  sourceIndex: number | null;
  name: string;
  role: string;
  sortName: string;
}> | undefined {
  return records?.map(
    ({
      sourceIndex,
      name,
      role,
      sortName,
    }) => ({
      sourceIndex,
      name,
      role,
      sortName,
    }),
  );
}

type TechnicalContributorPath =
  | "track.contributors"
  | "release.credits.contributors";

function getTechnicalContributorPath(
  document: ParsedMetadataDocument,
): TechnicalContributorPath {
  return document.scope === "release"
    ? "release.credits.contributors"
    : "track.contributors";
}

function readTechnicalContributorArray(
  document: ParsedMetadataDocument,
): unknown[] {
  if (document.scope === "release") {
    const release =
      document.parsed.release;

    if (
      typeof release !== "object" ||
      release === null ||
      Array.isArray(release) ||
      !("credits" in release)
    ) {
      return [];
    }

    const credits = release.credits;

    if (
      typeof credits !== "object" ||
      credits === null ||
      Array.isArray(credits) ||
      !("contributors" in credits) ||
      !Array.isArray(
        credits.contributors,
      )
    ) {
      return [];
    }

    return credits.contributors;
  }

  const track =
    document.parsed.track;

  if (
    typeof track !== "object" ||
    track === null ||
    Array.isArray(track) ||
    !("contributors" in track) ||
    !Array.isArray(track.contributors)
  ) {
    return [];
  }

  return track.contributors;
}

function readTechnicalCreditRecords(
  document: ParsedMetadataDocument,
): PerformerRecordDraft[] {
  return readTechnicalContributorArray(
    document,
  ).flatMap(
    (value, sourceIndex) => {
      if (
        typeof value !== "object" ||
        value === null ||
        Array.isArray(value)
      ) {
        return [];
      }

      const role =
        "role" in value &&
        typeof value.role === "string"
          ? value.role
          : "";

      if (
        !isTechnicalContributorRoleValue(
          role,
        )
      ) {
        return [];
      }

      return [
        {
          key: [
            "existing-technical",
            document.scope,
            sourceIndex,
          ].join("-"),
          sourceIndex,
          name:
            "name" in value &&
            typeof value.name === "string"
              ? value.name
              : "",
          role,
          sortName: resolveCreditSortName(
            "name" in value &&
            typeof value.name === "string"
              ? value.name
              : "",
            "sort_name" in value &&
            typeof value.sort_name === "string"
              ? value.sort_name
              : "",
          ),
        },
      ];
    },
  );
}

function readManagedTechnicalCreditSourceIndexes(
  document: ParsedMetadataDocument,
): number[] {
  return readTechnicalCreditRecords(
    document,
  ).flatMap((record) =>
    record.sourceIndex === null
      ? []
      : [record.sourceIndex],
  );
}

function normalizeTechnicalCreditRole(
  role: string,
): string {
  return role
    .trim()
    .toLocaleLowerCase()
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ");
}

/*
 * Primary liner-note variants share one override key so a track-level
 * "Recorded By" credit can replace a release-level "Recording Engineer"
 * credit without affecting assistant or additional engineering credits.
 */
function technicalCreditOverrideKey(
  role: string,
): string {
  const normalized =
    normalizeTechnicalCreditRole(role);

  if (
    /^(recorded by|recording engineer|tracking engineer)$/.test(
      normalized,
    )
  ) {
    return "recording:primary";
  }

  if (
    /^(mixed by|mix engineer|mixing engineer|mixer)$/.test(
      normalized,
    )
  ) {
    return "mixing:primary";
  }

  if (
    /^(mastered by|mastering engineer|remastering engineer)$/.test(
      normalized,
    )
  ) {
    return "mastering:primary";
  }

  return normalized;
}

function mergeInheritedTechnicalCredits(
  releaseRecords: readonly PerformerRecordDraft[],
  trackRecords: readonly PerformerRecordDraft[],
): {
  effective: PerformerRecordDraft[];
  inherited: PerformerRecordDraft[];
} {
  const trackOverrideKeys =
    new Set(
      trackRecords.map((record) =>
        technicalCreditOverrideKey(
          record.role,
        ),
      ),
    );

  const inherited =
    releaseRecords
      .filter(
        (record) =>
          !trackOverrideKeys.has(
            technicalCreditOverrideKey(
              record.role,
            ),
          ),
      )
      .map((record, index) => ({
        ...record,
        key: [
          "inherited-release-technical",
          index,
          record.key,
        ].join("-"),
        sourceIndex: null,
      }));

  return {
    effective: [
      ...trackRecords,
      ...inherited,
    ],
    inherited,
  };
}

function serializeTechnicalCreditRecords(
  records:
    | readonly PerformerRecordDraft[]
    | undefined,
): Array<{
  sourceIndex: number | null;
  name: string;
  role: string;
  sortName: string;
}> | undefined {
  return serializePerformerRecords(
    records,
  );
}

type ArrangementContributorPath =
  TechnicalContributorPath;

function getArrangementContributorPath(
  document: ParsedMetadataDocument,
): ArrangementContributorPath {
  return getTechnicalContributorPath(document);
}

function readArrangementCreditRecords(
  document: ParsedMetadataDocument,
): PerformerRecordDraft[] {
  return readTechnicalContributorArray(
    document,
  ).flatMap((value, sourceIndex) => {
    if (
      typeof value !== "object" ||
      value === null ||
      Array.isArray(value)
    ) {
      return [];
    }

    const role =
      "role" in value &&
      typeof value.role === "string"
        ? value.role
        : "";

    if (
      !isArrangementContributorRoleValue(
        role,
      )
    ) {
      return [];
    }

    return [
      {
        key: [
          "existing-arrangement",
          document.scope,
          sourceIndex,
        ].join("-"),
        sourceIndex,
        name:
          "name" in value &&
          typeof value.name === "string"
            ? value.name
            : "",
        role,
        sortName: resolveCreditSortName(
          "name" in value &&
          typeof value.name === "string"
            ? value.name
            : "",
          "sort_name" in value &&
          typeof value.sort_name === "string"
            ? value.sort_name
            : "",
        ),
      },
    ];
  });
}

function readManagedArrangementCreditSourceIndexes(
  document: ParsedMetadataDocument,
): number[] {
  return readArrangementCreditRecords(
    document,
  ).flatMap((record) =>
    record.sourceIndex === null
      ? []
      : [record.sourceIndex],
  );
}

function arrangementCreditOverrideKey(
  role: string,
): string {
  const normalized =
    normalizeArrangementCreditRole(role);

  if (
    /^(arranger|arranged by|arrangement by)$/.test(
      normalized,
    )
  ) {
    return "arrangement:general";
  }

  const specializedFamilies: Array<{
    pattern: RegExp;
    key: string;
  }> = [
    {
      pattern: /\b(?:background vocal|vocal|choir)\b/,
      key: "arrangement:vocal",
    },
    {
      pattern: /\bstring\b/,
      key: "arrangement:string",
    },
    {
      pattern: /\b(?:brass|horn)\b/,
      key: "arrangement:brass",
    },
    {
      pattern: /\bwoodwind\b/,
      key: "arrangement:woodwind",
    },
    {
      pattern: /\brhythm\b/,
      key: "arrangement:rhythm",
    },
    {
      pattern: /\b(?:percussion|drum)\b/,
      key: "arrangement:percussion",
    },
    {
      pattern: /\b(?:keyboard|synthesizer|synth)\b/,
      key: "arrangement:keyboard",
    },
  ];
  const specialized =
    specializedFamilies.find(({ pattern }) =>
      pattern.test(normalized),
    );

  if (specialized) {
    return specialized.key;
  }

  if (/\borchestrat/.test(normalized)) {
    return "orchestration:general";
  }

  return normalized;
}

function mergeInheritedArrangementCredits(
  releaseRecords: readonly PerformerRecordDraft[],
  trackRecords: readonly PerformerRecordDraft[],
): {
  effective: PerformerRecordDraft[];
  inherited: PerformerRecordDraft[];
} {
  const trackOverrideKeys = new Set(
    trackRecords.map((record) =>
      arrangementCreditOverrideKey(
        record.role,
      ),
    ),
  );
  const inherited = releaseRecords
    .filter(
      (record) =>
        !trackOverrideKeys.has(
          arrangementCreditOverrideKey(
            record.role,
          ),
        ),
    )
    .map((record, index) => ({
      ...record,
      key: [
        "inherited-release-arrangement",
        index,
        record.key,
      ].join("-"),
      sourceIndex: null,
    }));

  return {
    effective: [
      ...trackRecords,
      ...inherited,
    ],
    inherited,
  };
}

function serializeArrangementCreditRecords(
  records:
    | readonly PerformerRecordDraft[]
    | undefined,
): Array<{
  sourceIndex: number | null;
  name: string;
  role: string;
  sortName: string;
}> | undefined {
  return serializePerformerRecords(records);
}

type WritingCreditBasePath =
  | "track"
  | "release.credits";

function getWritingCreditBasePath(
  document: ParsedMetadataDocument,
): WritingCreditBasePath {
  return document.scope === "release"
    ? "release.credits"
    : "track";
}

function readWritingCreditFamilyArray(
  document: ParsedMetadataDocument,
  family: WritingCreditFamily,
): unknown[] {
  const root = document.parsed;
  const scopeRecord =
    document.scope === "release"
      ? root.release
      : root.track;

  if (
    typeof scopeRecord !== "object" ||
    scopeRecord === null ||
    Array.isArray(scopeRecord)
  ) {
    return [];
  }

  const record =
    document.scope === "release"
      ? (
          "credits" in scopeRecord &&
          typeof scopeRecord.credits === "object" &&
          scopeRecord.credits !== null &&
          !Array.isArray(scopeRecord.credits)
            ? scopeRecord.credits
            : null
        )
      : scopeRecord;

  if (!record) {
    return [];
  }

  const familyValue =
    (record as Record<string, unknown>)[family];

  return Array.isArray(familyValue)
    ? familyValue
    : [];
}

function readWritingCreditRecords(
  document: ParsedMetadataDocument,
): WritingCreditRecordDraft[] {
  const families: readonly WritingCreditFamily[] = [
    "songwriters",
    "composers",
    "lyricists",
  ];

  return families.flatMap((family) =>
    readWritingCreditFamilyArray(document, family).flatMap(
      (value, sourceIndex) => {
        if (
          typeof value !== "object" ||
          value === null ||
          Array.isArray(value)
        ) {
          return [];
        }

        const role =
          "role" in value &&
          typeof value.role === "string" &&
          value.role.trim()
            ? value.role
            : defaultWritingRoleForFamily(family);

        return [
          {
            key: [
              "existing-writing",
              document.scope,
              family,
              sourceIndex,
            ].join("-"),
            family,
            sourceFamily: family,
            sourceIndex,
            name:
              "name" in value &&
              typeof value.name === "string"
                ? value.name
                : "",
            role,
            sortName: resolveCreditSortName(
              "name" in value &&
              typeof value.name === "string"
                ? value.name
                : "",
              "sort_name" in value &&
              typeof value.sort_name === "string"
                ? value.sort_name
                : "",
            ),
          },
        ];
      },
    ),
  );
}

function writingCreditRecordsEqual(
  left: readonly WritingCreditRecordDraft[],
  right: readonly WritingCreditRecordDraft[],
): boolean {
  return (
    left.length === right.length &&
    left.every((record, index) => {
      const other = right[index];

      return (
        other !== undefined &&
        record.family === other.family &&
        record.sourceFamily === other.sourceFamily &&
        record.sourceIndex === other.sourceIndex &&
        record.name === other.name &&
        record.role === other.role &&
        record.sortName === other.sortName
      );
    })
  );
}

function mergeInheritedWritingCredits(
  releaseRecords: readonly WritingCreditRecordDraft[],
  trackRecords: readonly WritingCreditRecordDraft[],
): {
  effective: WritingCreditRecordDraft[];
  inherited: WritingCreditRecordDraft[];
} {
  const localFamilies = new Set(
    trackRecords.map((record) => record.family),
  );
  const inherited = releaseRecords
    .filter((record) => !localFamilies.has(record.family))
    .map((record, index) => ({
      ...record,
      key: [
        "inherited-release-writing",
        index,
        record.key,
      ].join("-"),
      sourceFamily: null,
      sourceIndex: null,
    }));

  return {
    effective: [...trackRecords, ...inherited],
    inherited,
  };
}

function serializeWritingCreditRecords(
  records:
    | readonly WritingCreditRecordDraft[]
    | undefined,
): Array<{
  family: WritingCreditFamily;
  sourceFamily: WritingCreditFamily | null;
  sourceIndex: number | null;
  name: string;
  role: string;
  sortName: string;
}> | undefined {
  return records?.map((record) => ({
    family: record.family,
    sourceFamily: record.sourceFamily,
    sourceIndex: record.sourceIndex,
    name: record.name,
    role: record.role,
    sortName: record.sortName,
  }));
}

function readTrackRecordArray(
  document: ParsedMetadataDocument,
  key: string,
): unknown[] {
  const track = document.parsed.track;

  if (
    typeof track !== "object" ||
    track === null ||
    Array.isArray(track)
  ) {
    return [];
  }

  const value = (track as Record<string, unknown>)[key];
  return Array.isArray(value) ? value : [];
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function readSampleRelationshipRecords(
  document: ParsedMetadataDocument,
): SampleRelationshipRecordDraft[] {
  return readTrackRecordArray(document, "samples").flatMap(
    (value, sourceIndex) => {
      if (
        typeof value !== "object" ||
        value === null ||
        Array.isArray(value)
      ) {
        return [];
      }

      const record = value as Record<string, unknown>;
      const relationshipType =
        typeof record.relationship_type === "string" &&
        sampleRelationshipTypeOptions.includes(
          record.relationship_type as
            typeof sampleRelationshipTypeOptions[number],
        )
          ? record.relationship_type as
              typeof sampleRelationshipTypeOptions[number]
          : "sample";

      return [{
        key: `existing-sample-${sourceIndex}`,
        sourceIndex,
        relationshipType,
        sourceTitle:
          typeof record.source_title === "string"
            ? record.source_title
            : "",
        sourceArtist:
          typeof record.source_artist === "string"
            ? record.source_artist
            : "",
        sourceWriters: stringArrayValue(record.source_writers),
        sourceRelease:
          typeof record.source_release === "string"
            ? record.source_release
            : "",
        sourceYear:
          typeof record.source_year === "number"
            ? record.source_year
            : null,
        sourceIsrc:
          typeof record.source_isrc === "string"
            ? record.source_isrc
            : "",
        sourceIswc:
          typeof record.source_iswc === "string"
            ? record.source_iswc
            : "",
        usageDescription:
          typeof record.usage_description === "string"
            ? record.usage_description
            : "",
        creditText:
          typeof record.credit_text === "string"
            ? record.credit_text
            : "",
        notes:
          typeof record.notes === "string"
            ? record.notes
            : "",
      }];
    },
  );
}

function readSampleClearanceRecords(
  document: ParsedMetadataDocument,
): SampleClearanceRecordDraft[] {
  return readTrackRecordArray(document, "sample_clearances").flatMap(
    (value, sourceIndex) => {
      if (
        typeof value !== "object" ||
        value === null ||
        Array.isArray(value)
      ) {
        return [];
      }

      const record = value as Record<string, unknown>;
      const status =
        typeof record.status === "string" &&
        sampleClearanceStatusOptions.includes(
          record.status as
            typeof sampleClearanceStatusOptions[number],
        )
          ? record.status as
              typeof sampleClearanceStatusOptions[number]
          : "not reviewed";

      return [{
        key: `existing-sample-clearance-${sourceIndex}`,
        sourceIndex,
        sampleReference:
          typeof record.sample_reference === "number"
            ? record.sample_reference
            : sourceIndex + 1,
        status,
        masterUseCleared: record.master_use_cleared === true,
        publishingCleared: record.publishing_cleared === true,
        agreementReference:
          typeof record.agreement_reference === "string"
            ? record.agreement_reference
            : "",
        territories: stringArrayValue(record.territories),
        expirationDate:
          typeof record.expiration_date === "string"
            ? record.expiration_date
            : "",
        notes:
          typeof record.notes === "string"
            ? record.notes
            : "",
      }];
    },
  );
}

function sampleRelationshipRecordsEqual(
  left: readonly SampleRelationshipRecordDraft[],
  right: readonly SampleRelationshipRecordDraft[],
): boolean {
  return JSON.stringify(left.map(({ key, ...record }) => record)) ===
    JSON.stringify(right.map(({ key, ...record }) => record));
}

function sampleClearanceRecordsEqual(
  left: readonly SampleClearanceRecordDraft[],
  right: readonly SampleClearanceRecordDraft[],
): boolean {
  return JSON.stringify(left.map(({ key, ...record }) => record)) ===
    JSON.stringify(right.map(({ key, ...record }) => record));
}

function serializeSampleRelationshipRecords(
  records: readonly SampleRelationshipRecordDraft[] | undefined,
) {
  return records?.map(({ key: _key, ...record }) => record);
}

function serializeSampleClearanceRecords(
  records: readonly SampleClearanceRecordDraft[] | undefined,
) {
  return records?.map(({ key: _key, ...record }) => record);
}

type PersonRoleDisplayRecord = {
  key: string;
  name: string;
  role: string;
  sortName?: string;
};

type GroupedPersonRoleDisplay = {
  key: string;
  name: string;
  roles: string[];
  sortNames: string[];
  sourceCount: number;
};

function normalizePersonCreditValue(
  value: string,
): string {
  return value
    .trim()
    .replace(/\s+/g, " ");
}

function appendDistinctCreditValue(
  values: string[],
  value: string,
) {
  const normalized =
    normalizePersonCreditValue(value);

  if (!normalized) {
    return;
  }

  const comparison =
    normalized.toLocaleLowerCase();

  if (
    values.some(
      (existingValue) =>
        existingValue.toLocaleLowerCase() ===
        comparison,
    )
  ) {
    return;
  }

  values.push(normalized);
}

/*
 * Read-only credit views collapse repeated names while preserving the
 * authored record-per-role structure used by edit mode and TOML saves.
 */
function groupPersonRoleDisplayRecords(
  records: readonly PersonRoleDisplayRecord[],
): GroupedPersonRoleDisplay[] {
  const grouped = new Map<
    string,
    GroupedPersonRoleDisplay
  >();

  records.forEach((record) => {
    const name =
      normalizePersonCreditValue(
        record.name,
      );
    const groupKey = name
      ? name.toLocaleLowerCase()
      : `missing-name:${record.key}`;
    const existing =
      grouped.get(groupKey);

    if (existing) {
      appendDistinctCreditValue(
        existing.roles,
        record.role,
      );
      appendDistinctCreditValue(
        existing.sortNames,
        record.sortName ?? "",
      );
      existing.sourceCount += 1;
      return;
    }

    const nextGroup: GroupedPersonRoleDisplay = {
      key: groupKey,
      name,
      roles: [],
      sortNames: [],
      sourceCount: 1,
    };

    appendDistinctCreditValue(
      nextGroup.roles,
      record.role,
    );
    appendDistinctCreditValue(
      nextGroup.sortNames,
      record.sortName ?? "",
    );
    grouped.set(groupKey, nextGroup);
  });

  return Array.from(grouped.values());
}

function sortGroupedPerformerRoleDisplays(
  records: readonly GroupedPersonRoleDisplay[],
): GroupedPersonRoleDisplay[] {
  return records.map((record) => ({
    ...record,
    roles: sortPerformerRoleDisplayValues(
      record.roles,
    ),
  }));
}

function isTrackTitleDraftPath(
  metadataPath: string,
): metadataPath is
  | "track.title"
  | "track.version"
  | "track.display_title" {
  return (
    metadataPath === "track.title" ||
    metadataPath === "track.version" ||
    metadataPath === "track.display_title"
  );
}

function buildDocumentDraftKey(
  document: ParsedMetadataDocument,
  metadataPath: string,
): string {
  return `${document.relativePath}::${metadataPath}`;
}

function readDocumentDraftString(
  document: ParsedMetadataDocument,
  metadataPath: string,
  draft: MetadataDraft,
): string {
  const draftKey = buildDocumentDraftKey(
    document,
    metadataPath,
  );
  const draftValue = draft[draftKey];

  if (typeof draftValue === "string") {
    return draftValue;
  }

  const row = flattenMetadata(
    document.parsed,
  ).find(
    (candidate) =>
      candidate.path === metadataPath,
  );

  return typeof row?.value === "string"
    ? row.value
    : "";
}

function readReleaseEditorialSnapshot(
  document: ParsedMetadataDocument,
  draft: MetadataDraft,
): ReleaseEditorialStorageSnapshot {
  return buildReleaseEditorialStorageSnapshot(
    (metadataPath) => {
      const draftKey = buildDocumentDraftKey(
        document,
        metadataPath,
      );

      if (
        Object.prototype.hasOwnProperty.call(
          draft,
          draftKey,
        )
      ) {
        return draft[draftKey];
      }

      return readEditorialObjectPath(
        document.parsed,
        metadataPath,
      );
    },
  );
}

function getDocumentDraftChanges(
  document: ParsedMetadataDocument,
  draft: MetadataDraft,
): MetadataValueChange[] {
  const prefix = `${document.relativePath}::`;

  return Object.entries(draft)
    .filter(([key]) =>
      key.startsWith(prefix),
    )
    .map(([key, value]) => ({
      path: key.slice(prefix.length),
      value: Array.isArray(value)
        ? value
            .map((entry) => entry.trim())
            .filter((entry) => entry.length > 0)
        : value,
    }));
}

function getDocumentSaveChanges(
  document: ParsedMetadataDocument,
  draft: MetadataDraft,
  releaseDocuments: ParsedMetadataDocument[] = [],
): {
  changes: MetadataValueChange[];
  createChanges: MetadataValueChange[];
} {
  const authoredChanges = getDocumentDraftChanges(
    document,
    draft,
  );
  const existing = new Map<
    string,
    EditableMetadataValue
  >();

  for (const row of flattenMetadata(document.parsed)) {
    if (isEditableMetadataValue(row.value)) {
      existing.set(row.path, row.value);
    }
  }

  const baseResult =
    document.scope === "track" &&
    document.filename === "track.toml"
      ? deriveTrackSaveChanges(
          existing,
          authoredChanges,
        )
      : document.scope === "release" &&
          document.filename === "release.toml"
        ? {
            changes: authoredChanges.filter(
              (change) =>
                !isReleaseEditorialStoragePath(change.path) ||
                existing.has(change.path),
            ),
            createChanges: authoredChanges.filter(
              (change) =>
                isReleaseEditorialStoragePath(change.path) &&
                !existing.has(change.path),
            ),
          }
        : {
            changes: authoredChanges,
            createChanges: [],
          };
  const releaseArtistDocument =
    releaseDocuments.find(
      (candidate) =>
        candidate.filename ===
        "release.toml",
    );
  const releaseArtistValue =
    releaseArtistDocument
      ? readDocumentDraftString(
          releaseArtistDocument,
          "release.primary_artist.name",
          draft,
        )
      : findMetadataValueAcrossDocuments(
          releaseDocuments,
          "release.primary_artist.name",
        );
  const artistSortChanges =
    deriveArtistSortNameChanges(
      existing,
      [
        ...baseResult.changes,
        ...baseResult.createChanges,
      ],
      {
        scope: document.scope,
        filename: document.filename,
        releaseArtistName:
          typeof releaseArtistValue ===
          "string"
            ? releaseArtistValue
            : "",
      },
    );

  return {
    changes: [
      ...baseResult.changes,
      ...artistSortChanges,
    ],
    createChanges:
      baseResult.createChanges,
  };
}

function removeDocumentDraftChanges(
  document: ParsedMetadataDocument,
  draft: MetadataDraft,
): MetadataDraft {
  const prefix = `${document.relativePath}::`;

  return Object.fromEntries(
    Object.entries(draft).filter(
      ([key]) => !key.startsWith(prefix),
    ),
  );
}

function parseDraftNumber(
  value: string,
): number | null {
  if (value.trim() === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function readEffectiveTrackNavigationInteger({
  trackId,
  metadataPath,
  documents,
  draft,
}: {
  trackId: string;
  metadataPath:
    | "track.numbering.track_number"
    | "track.numbering.disc_number";
  documents: ParsedMetadataDocument[];
  draft: MetadataDraft;
}): number | null {
  const trackDocuments = documents.filter(
    (document) =>
      document.scope === "track" &&
      document.trackId === trackId,
  );

  for (const document of trackDocuments) {
    const draftKey = buildDocumentDraftKey(
      document,
      metadataPath,
    );
    const row = flattenMetadata(
      document.parsed,
    ).find(
      (candidate) =>
        candidate.path === metadataPath,
    );
    const value = Object.prototype.hasOwnProperty.call(
      draft,
      draftKey,
    )
      ? draft[draftKey]
      : row?.value;
    const parsed =
      typeof value === "number"
        ? value
        : typeof value === "string"
          ? Number(value)
          : Number.NaN;

    if (
      Number.isSafeInteger(parsed) &&
      parsed > 0
    ) {
      return parsed;
    }
  }

  return null;
}

function normalizeMetadataRegistryPath(
  metadataPath: string,
): string {
  return metadataPath.replace(
    /\[\d+\]/g,
    "[]",
  );
}

function findRegisteredMetadataField(
  metadataRegistry: MetadataFieldDefinition[],
  metadataPath: string,
): MetadataFieldDefinition | undefined {
  const normalizedPath =
    normalizeMetadataRegistryPath(
      metadataPath,
    );

  return metadataRegistry.find(
    (field) =>
      field.tomlPath === metadataPath ||
      field.tomlPath === normalizedPath,
  );
}

type MetadataAliasGroup = {
  label: string;
  values: string[];
  verified?: boolean;
};

function buildMetadataAliasGroups(
  field: MetadataFieldDefinition,
): MetadataAliasGroup[] {
  const groups: MetadataAliasGroup[] = [];

  const addGroup = (
    label: string,
    values: string[] | undefined,
    verified = true,
  ) => {
    if (values && values.length > 0) {
      groups.push({
        label,
        values,
        verified,
      });
    }
  };

  addGroup("FFmpeg", field.aliases?.ffmpeg);
  addGroup("ID3", field.aliases?.id3);
  addGroup("Vorbis", field.aliases?.vorbis);
  addGroup("MP4", field.aliases?.mp4);
  addGroup("RIFF", field.aliases?.riff);

  groups.push({
    label: "VLC",
    values:
      field.aliases?.players?.vlc?.length
        ? field.aliases.players.vlc
        : ["Not yet verified"],
    verified:
      Boolean(
        field.aliases?.players?.vlc?.length,
      ),
  });

  groups.push({
    label: "Apple Music",
    values:
      field.aliases?.players?.appleMusic
        ?.length
        ? field.aliases.players.appleMusic
        : ["Not yet verified"],
    verified:
      Boolean(
        field.aliases?.players?.appleMusic
          ?.length,
      ),
  });

  groups.push({
    label: "Windows Media Player",
    values:
      field.aliases?.players
        ?.windowsMediaPlayer?.length
        ? field.aliases.players
            .windowsMediaPlayer
        : ["Not yet verified"],
    verified:
      Boolean(
        field.aliases?.players
          ?.windowsMediaPlayer?.length,
      ),
  });

  groups.push({
    label: "Windows Media Player Legacy",
    values:
      field.aliases?.players
        ?.windowsMediaPlayerLegacy?.length
        ? field.aliases.players
            .windowsMediaPlayerLegacy
        : ["Not yet verified"],
    verified:
      Boolean(
        field.aliases?.players
          ?.windowsMediaPlayerLegacy?.length,
      ),
  });

  return groups;
}

const contributorRoleGroups: Array<{
  pattern: RegExp;
  group: NonNullable<
    MetadataFieldDefinition["presentation"]
  >["group"];
}> = [
  {
    pattern:
      /\b(mix(?:ed|er|ing)?|mixdown)\b/i,
    group: "Mixing",
  },
  {
    pattern:
      /\b(master(?:ed|ing)?|remaster(?:ed|ing)?)\b/i,
    group: "Mastering",
  },
  {
    pattern:
      /\b(edit(?:ed|ing|or)?|transfer(?:red|ring)?|restor(?:ation|ed|ing)?)\b/i,
    group: "Editing",
  },
  {
    pattern:
      /\b(record(?:ed|ing)?|tracking|engineer(?:ed|ing)?|tape operator)\b/i,
    group: "Recording",
  },
  {
    pattern:
      /\b(arrang|orchestrat)\b/i,
    group: "Arrangement & Orchestration",
  },
  {
    pattern:
      /\b(conductor|conducting|musical director|music director|bandleader)\b/i,
    group: "Conducting & Musical Direction",
  },
  {
    pattern:
      /\b(composer|lyricist|songwriter|written|lyrics|music by)\b/i,
    group: "Songwriting & Composition",
  },
  {
    pattern:
      /\b(publisher|publishing|administrator)\b/i,
    group: "Music Business & Rights",
  },
  {
    pattern:
      /\b(producer|production|programmer|sound designer|creative director|art director|coordinator|studio assistant|technician)\b/i,
    group: "Production",
  },
];

const metadataGroupOrder = [
  "Release & Track Identity",
  "Track & Disc Numbering",
  "Artists",
  "Music Business & Rights",
  "Sample Clearance",
  "Dates",
  "Musical Analysis",
  "Movement & Work",
  "Performers",
  "Songwriting & Composition",
  "Samples & Interpolations",
  "Writing, Lyrics & Language",
  ...lyricsMetadataGroupOrder,
  "Arrangement & Orchestration",
  "Conducting & Musical Direction",
  "Production",
  "Recording",
  "Editing",
  "Mixing",
  "Mastering",
  "Identifiers",
  "Text and Notes",
  "Artwork",
  "Technical Audio",
  "Files and Sources",
  unmappedMetadataGroup,
  "Developer / Advanced",
] as const;

const metadataGroupRank = new Map(
  metadataGroupOrder.map(
    (group, index) => [
      group,
      index,
    ],
  ),
);

export {
  TrackMetadataSummary,
  type EditableMetadataValue,
  type MetadataDraft,
  type PerformerRecordDraft,
  type PerformerDraftMap,
  type TechnicalCreditDraftMap,
  type ArrangementCreditDraftMap,
  type WritingCreditRecordDraft,
  type WritingCreditDraftMap,
  type SampleRelationshipDraftMap,
  type SampleClearanceDraftMap,
  applyCreditRecordUpdates,
  type MetadataValueChange,
  type ScalarMetadataSaveReceipt,
  type TrackDirectoryRenameReceipt,
  type TrackDirectoryRenamePlanItem,
  type TrackDirectoryRenamePlan,
  type PerformerCopyTargetPlan,
  type PerformerCopyExecutionTarget,
  type PerformerCopyResponse,
  type PerformerCopySource,
  type PerformerCopyTrackOption,
  createMetadataActivityEntry,
  createPerformerCopyActivityEntry,
  isEditableMetadataValue,
  metadataValuesEqual,
  stringArrayToEditorText,
  editorTextToStringArray,
  normalizeStringArrayEditorValue,
  getPerformerPath,
  isPerformerRecordPath,
  readPerformerRecords,
  performerRecordsEqual,
  serializePerformerRecords,
  type TechnicalContributorPath,
  getTechnicalContributorPath,
  readTechnicalContributorArray,
  readTechnicalCreditRecords,
  readManagedTechnicalCreditSourceIndexes,
  normalizeTechnicalCreditRole,
  technicalCreditOverrideKey,
  mergeInheritedTechnicalCredits,
  serializeTechnicalCreditRecords,
  type ArrangementContributorPath,
  getArrangementContributorPath,
  readArrangementCreditRecords,
  readManagedArrangementCreditSourceIndexes,
  arrangementCreditOverrideKey,
  mergeInheritedArrangementCredits,
  serializeArrangementCreditRecords,
  type WritingCreditBasePath,
  getWritingCreditBasePath,
  readWritingCreditFamilyArray,
  readWritingCreditRecords,
  writingCreditRecordsEqual,
  mergeInheritedWritingCredits,
  serializeWritingCreditRecords,
  readTrackRecordArray,
  stringArrayValue,
  readSampleRelationshipRecords,
  readSampleClearanceRecords,
  sampleRelationshipRecordsEqual,
  sampleClearanceRecordsEqual,
  serializeSampleRelationshipRecords,
  serializeSampleClearanceRecords,
  type PersonRoleDisplayRecord,
  type GroupedPersonRoleDisplay,
  normalizePersonCreditValue,
  appendDistinctCreditValue,
  groupPersonRoleDisplayRecords,
  sortGroupedPerformerRoleDisplays,
  isTrackTitleDraftPath,
  buildDocumentDraftKey,
  readDocumentDraftString,
  readReleaseEditorialSnapshot,
  getDocumentDraftChanges,
  getDocumentSaveChanges,
  removeDocumentDraftChanges,
  parseDraftNumber,
  readEffectiveTrackNavigationInteger,
  normalizeMetadataRegistryPath,
  findRegisteredMetadataField,
  type MetadataAliasGroup,
  buildMetadataAliasGroups,
  contributorRoleGroups,
  metadataGroupOrder,
  metadataGroupRank,
};
