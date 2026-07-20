import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_METADATA_ACTIVITY_ENTRIES,
  clearMetadataActivityLog,
  isMetadataActivityEntry,
  normalizeMetadataActivityLog,
  prependMetadataActivityEntry,
  readMetadataActivityLog,
  writeMetadataActivityLog,
  type MetadataActivityEntry,
} from "../src/activity-log.js";

function createEntry(
  index: number,
): MetadataActivityEntry {
  return {
    id: `entry-${index}`,
    occurredAt: `2026-07-19T00:00:${String(
      index,
    ).padStart(2, "0")}Z`,
    releaseId: "2026-07-13_sine-sweeps",
    documentRelativePath:
      "releases/2026-07-13_sine-sweeps/release.toml",
    documentFilename: "release.toml",
    scope: "release",
    action: "save",
    status: "verified",
    message: "Metadata saved and verified",
    receipt: {
      backupRelativePath:
        "releases/2026-07-13_sine-sweeps/.metadata-backups/release.toml.bak",
      previousSha256: "a".repeat(64),
      savedSha256: "b".repeat(64),
      bytes: 745,
    },
  };
}

function createStorage() {
  const values = new Map<string, string>();

  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
  };
}

test(
  "keeps newest metadata activity entries first and limits session history",
  () => {
    let entries: MetadataActivityEntry[] = [];

    for (
      let index = 0;
      index < MAX_METADATA_ACTIVITY_ENTRIES + 5;
      index += 1
    ) {
      entries = prependMetadataActivityEntry(
        entries,
        createEntry(index),
      );
    }

    assert.equal(
      entries.length,
      MAX_METADATA_ACTIVITY_ENTRIES,
    );
    assert.equal(entries[0]?.id, "entry-54");
    assert.equal(entries.at(-1)?.id, "entry-5");
  },
);

test(
  "filters malformed session activity records",
  () => {
    const validEntry = createEntry(1);

    assert.deepEqual(
      normalizeMetadataActivityLog([
        validEntry,
        null,
        {
          ...validEntry,
          id: 17,
        },
      ]),
      [validEntry],
    );
  },
);

test(
  "round-trips and clears metadata activity through session storage",
  () => {
    const storage = createStorage();
    const entries = [createEntry(1)];

    writeMetadataActivityLog(
      storage,
      entries,
    );
    assert.deepEqual(
      readMetadataActivityLog(storage),
      entries,
    );

    clearMetadataActivityLog(storage);
    assert.deepEqual(
      readMetadataActivityLog(storage),
      [],
    );
  },
);


test(
  "accepts verified metadata field removal activity",
  () => {
    const entry = {
      ...createEntry(2),
      action: "remove-fields" as const,
      message: "Track Script was removed and verified.",
    };

    assert.deepEqual(
      normalizeMetadataActivityLog([entry]),
      [entry],
    );
  },
);


test(
  "accepts performer-copy activity receipts",
  () => {
    const entry = {
      ...createEntry(3),
      action: "copy-performers" as const,
      scope: "track" as const,
      trackId: "destination-track",
      message:
        "2 performer credits copied and verified.",
    };

    assert.deepEqual(
      normalizeMetadataActivityLog([entry]),
      [entry],
    );
  },
);


test(
  "accepts metadata document creation activity",
  () => {
    assert.equal(
      isMetadataActivityEntry({
        id: "create-1",
        occurredAt: "2026-07-20T00:00:00.000Z",
        releaseId: "release-a",
        documentRelativePath:
          "releases/release-a/release-production-notes.toml",
        documentFilename:
          "release-production-notes.toml",
        scope: "release",
        action: "create-document",
        status: "verified",
        message: "Created and verified.",
      }),
      true,
    );
  },
);
