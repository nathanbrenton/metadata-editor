import assert from "node:assert/strict";
import test from "node:test";
import path from "node:path";

import {
  assertPathWithinRoot,
  toLibraryRelativePath,
} from "../server/media-root.js";

test("accepts a path inside the media root", () => {
  const mediaRoot = path.resolve(
    "/tmp/example-media",
  );
  const candidate = path.join(
    mediaRoot,
    "releases",
    "release-one",
  );

  assert.equal(
    assertPathWithinRoot(
      mediaRoot,
      candidate,
    ),
    candidate,
  );
});

test("rejects a path outside the media root", () => {
  const mediaRoot = path.resolve(
    "/tmp/example-media",
  );
  const outsidePath = path.resolve(
    mediaRoot,
    "..",
    "private.txt",
  );

  assert.throws(
    () =>
      assertPathWithinRoot(
        mediaRoot,
        outsidePath,
      ),
    /escapes configured media root/,
  );
});

test("returns slash-separated library-relative paths", () => {
  const mediaRoot = path.resolve(
    "/tmp/example-media",
  );

  assert.equal(
    toLibraryRelativePath(
      mediaRoot,
      path.join(
        mediaRoot,
        "releases",
        "release-one",
      ),
    ),
    "releases/release-one",
  );
});
