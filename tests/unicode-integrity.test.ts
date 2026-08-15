import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeUtf8Strict,
  encodeUtf8WithoutBom,
  hasUtf8Bom,
} from "../server/unicode-integrity.js";

const unicodeSample =
  "© 2026 Hiplingo · ℗ 2026 Hiplingo · Beyoncé · Sigur Rós · 日本語";

test("encodes canonical text as UTF-8 without a BOM and round-trips Unicode exactly", () => {
  const bytes = encodeUtf8WithoutBom(
    unicodeSample,
    "Unicode test fixture",
  );

  assert.equal(hasUtf8Bom(bytes), false);
  assert.equal(
    decodeUtf8Strict(bytes, {
      context: "Unicode test fixture",
    }),
    unicodeSample,
  );
});

test("can read a legacy UTF-8 BOM only when the caller explicitly allows it", () => {
  const bytes = Buffer.concat([
    Buffer.from([0xef, 0xbb, 0xbf]),
    Buffer.from(unicodeSample, "utf8"),
  ]);

  assert.equal(hasUtf8Bom(bytes), true);
  assert.throws(
    () =>
      decodeUtf8Strict(bytes, {
        context: "Canonical output",
      }),
    /without a BOM/,
  );
  assert.equal(
    decodeUtf8Strict(bytes, {
      allowBom: true,
      context: "Legacy input",
    }),
    unicodeSample,
  );
});

test("rejects invalid UTF-8 instead of silently replacing bytes", () => {
  assert.throws(
    () =>
      decodeUtf8Strict(
        Buffer.from([0xc3, 0x28]),
        { context: "Invalid fixture" },
      ),
    /not valid UTF-8/,
  );
});
