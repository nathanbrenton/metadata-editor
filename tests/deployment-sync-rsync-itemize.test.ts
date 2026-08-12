import assert from "node:assert/strict";
import test from "node:test";

import {
  parseRsyncChangeLine,
} from "../server/deployment-sync.js";

test("classifies legacy and current rsync new-file itemization as add", () => {
  assert.equal(
    parseRsyncChangeLine("<f+++++++|catalog.json")?.action,
    "add",
  );
  assert.equal(
    parseRsyncChangeLine("<f+++++++++|catalog.json")?.action,
    "add",
  );
});

test("keeps transferred existing files classified as updates", () => {
  assert.equal(
    parseRsyncChangeLine("<fc.......|catalog.json")?.action,
    "update",
  );
});

test("keeps deletions distinct from transfers", () => {
  assert.equal(
    parseRsyncChangeLine("*deleting|obsolete.json")?.action,
    "remove",
  );
});
