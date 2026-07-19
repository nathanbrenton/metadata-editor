export const METADATA_ACTIVITY_STORAGE_KEY =
  "metadata-editor.activity-log.v1";

export const MAX_METADATA_ACTIVITY_ENTRIES =
  50;

export type MetadataActivityStatus =
  | "verified"
  | "failed";

export type MetadataActivityReceipt = {
  backupRelativePath: string;
  previousSha256: string;
  savedSha256: string;
  bytes: number;
  synchronizedTrackFiles?: number;
  skippedTrackFiles?: number;
};

export type MetadataActivityEntry = {
  id: string;
  occurredAt: string;
  releaseId: string;
  documentRelativePath: string;
  documentFilename: string;
  scope: "release" | "track";
  trackId?: string;
  action:
    | "save"
    | "add-fields"
    | "remove-fields"
    | "copy-performers";
  status: MetadataActivityStatus;
  message: string;
  receipt?: MetadataActivityReceipt;
};

type ActivityStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isMetadataActivityReceipt(
  value: unknown,
): value is MetadataActivityReceipt {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.backupRelativePath ===
      "string" &&
    typeof value.previousSha256 === "string" &&
    typeof value.savedSha256 === "string" &&
    typeof value.bytes === "number" &&
    (
      value.synchronizedTrackFiles ===
        undefined ||
      typeof value.synchronizedTrackFiles ===
        "number"
    ) &&
    (
      value.skippedTrackFiles === undefined ||
      typeof value.skippedTrackFiles ===
        "number"
    )
  );
}

export function isMetadataActivityEntry(
  value: unknown,
): value is MetadataActivityEntry {
  if (!isRecord(value)) {
    return false;
  }

  const scopeIsValid =
    value.scope === "release" ||
    value.scope === "track";
  const actionIsValid =
    value.action === "save" ||
    value.action === "add-fields" ||
    value.action === "remove-fields" ||
    value.action === "copy-performers";
  const statusIsValid =
    value.status === "verified" ||
    value.status === "failed";

  return (
    typeof value.id === "string" &&
    typeof value.occurredAt === "string" &&
    typeof value.releaseId === "string" &&
    typeof value.documentRelativePath ===
      "string" &&
    typeof value.documentFilename ===
      "string" &&
    scopeIsValid &&
    (
      value.trackId === undefined ||
      typeof value.trackId === "string"
    ) &&
    actionIsValid &&
    statusIsValid &&
    typeof value.message === "string" &&
    (
      value.receipt === undefined ||
      isMetadataActivityReceipt(value.receipt)
    )
  );
}

export function normalizeMetadataActivityLog(
  value: unknown,
): MetadataActivityEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isMetadataActivityEntry)
    .slice(0, MAX_METADATA_ACTIVITY_ENTRIES);
}

export function prependMetadataActivityEntry(
  entries: MetadataActivityEntry[],
  entry: MetadataActivityEntry,
): MetadataActivityEntry[] {
  return [
    entry,
    ...entries.filter(
      (candidate) => candidate.id !== entry.id,
    ),
  ].slice(0, MAX_METADATA_ACTIVITY_ENTRIES);
}

export function readMetadataActivityLog(
  storage: ActivityStorage,
): MetadataActivityEntry[] {
  try {
    const storedValue = storage.getItem(
      METADATA_ACTIVITY_STORAGE_KEY,
    );

    if (!storedValue) {
      return [];
    }

    return normalizeMetadataActivityLog(
      JSON.parse(storedValue) as unknown,
    );
  } catch {
    return [];
  }
}

export function writeMetadataActivityLog(
  storage: ActivityStorage,
  entries: MetadataActivityEntry[],
): void {
  try {
    storage.setItem(
      METADATA_ACTIVITY_STORAGE_KEY,
      JSON.stringify(
        entries.slice(
          0,
          MAX_METADATA_ACTIVITY_ENTRIES,
        ),
      ),
    );
  } catch {
    // Activity history is optional and must never block metadata saves.
  }
}

export function clearMetadataActivityLog(
  storage: ActivityStorage,
): void {
  try {
    storage.removeItem(
      METADATA_ACTIVITY_STORAGE_KEY,
    );
  } catch {
    // Clearing optional session history is best-effort.
  }
}
