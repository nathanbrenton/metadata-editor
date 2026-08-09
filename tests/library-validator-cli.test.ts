import assert from "node:assert/strict";
import test from "node:test";

import {
  parseValidationCliOptions,
} from "../scripts/validate-library.js";

test("parses library and release validation CLI options", () => {
  assert.deepEqual(
    parseValidationCliOptions([
      "--json",
      "--verify-hashes",
      "--media-root",
      "../demo-media",
    ]),
    {
      json: true,
      verifyHashes: true,
      mediaRoot: "../demo-media",
    },
  );

  assert.deepEqual(
    parseValidationCliOptions([
      "--release",
      "2026-08-01_release",
    ]),
    {
      json: false,
      verifyHashes: false,
      releaseId: "2026-08-01_release",
    },
  );

  assert.deepEqual(
    parseValidationCliOptions([
      "2026-08-01_release",
      "--json",
    ]),
    {
      json: true,
      verifyHashes: false,
      releaseId: "2026-08-01_release",
    },
  );
});

test("rejects incomplete or unknown validation CLI options", () => {
  assert.throws(
    () => parseValidationCliOptions(["--release"]),
    /requires a release directory ID/,
  );
  assert.throws(
    () => parseValidationCliOptions(["--unknown"]),
    /Unknown option/,
  );
});
