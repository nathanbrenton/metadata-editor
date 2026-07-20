import assert from "node:assert/strict";
import test from "node:test";

import {
  addReadinessSkip,
  readReadinessSkips,
  removeReadinessSkip,
  writeReadinessSkips,
} from "../src/readiness-skips.js";

class MemoryStorage {
  values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

test("persists readiness skips by release", () => {
  const storage = new MemoryStorage();

  writeReadinessSkips(storage, "release-a", [
    "b.toml",
    "a.toml",
    "a.toml",
  ]);

  assert.deepEqual(
    readReadinessSkips(storage, "release-a"),
    ["a.toml", "b.toml"],
  );
  assert.deepEqual(
    readReadinessSkips(storage, "release-b"),
    [],
  );
});

test("adds and removes one skipped path", () => {
  const added = addReadinessSkip(
    ["a.toml"],
    "b.toml",
  );

  assert.deepEqual(added, ["a.toml", "b.toml"]);
  assert.deepEqual(
    removeReadinessSkip(added, "a.toml"),
    ["b.toml"],
  );
});

test("ignores malformed stored data", () => {
  const storage = new MemoryStorage();
  storage.setItem(
    "metadata-editor:readiness-skips:release-a",
    "not-json",
  );

  assert.deepEqual(
    readReadinessSkips(storage, "release-a"),
    [],
  );
});
