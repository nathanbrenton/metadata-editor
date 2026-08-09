import assert from "node:assert/strict";
import test from "node:test";

import {
  parsePublishCliOptions,
} from "../scripts/plan-publish.js";

test("parses publish plan and strict preflight options", () => {
  assert.deepEqual(
    parsePublishCliOptions([
      "2026-08-01_release",
      "--json",
      "--media-root",
      "../demo-media",
      "--publish-root",
      "../published-media",
    ]),
    {
      releaseId: "2026-08-01_release",
      json: true,
      strict: false,
      mediaRoot: "../demo-media",
      publishRoot: "../published-media",
    },
  );

  assert.deepEqual(
    parsePublishCliOptions([
      "--strict",
      "2026-08-01_release",
    ]),
    {
      releaseId: "2026-08-01_release",
      json: false,
      strict: true,
    },
  );
});

test("rejects missing release IDs and incomplete publish options", () => {
  assert.throws(
    () => parsePublishCliOptions([]),
    /requires a release directory ID/,
  );
  assert.throws(
    () => parsePublishCliOptions(["--publish-root"]),
    /requires a directory path/,
  );
  assert.throws(
    () => parsePublishCliOptions(["release", "--unknown"]),
    /Unknown option/,
  );
});
