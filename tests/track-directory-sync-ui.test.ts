import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const serverSource = await readFile(
  new URL("../server/index.ts", import.meta.url),
  "utf8",
);
const syncSource = await readFile(
  new URL("../server/track-directory-sync.ts", import.meta.url),
  "utf8",
);
const browserChecklist = await readFile(
  new URL(
    "../docs/browser-tests/track-directory-sync.md",
    import.meta.url,
  ),
  "utf8",
);

test("separates metadata saves from reviewed directory synchronization", () => {
  assert.match(
    appSource,
    /Saving metadata does not rename folders/,
  );
  assert.match(
    appSource,
    /Review directory rename plan/,
  );
  assert.match(
    appSource,
    /Review track directory synchronization/,
  );
  assert.match(
    appSource,
    /Type <code>\{trackDirectoryRenameReview\.confirmation\}<\/code>/,
  );
  assert.match(
    appSource,
    /planFingerprint: plan\.fingerprint/,
  );
  assert.doesNotMatch(
    appSource,
    /if \(changesTrackNumber\) \{\s*const directoryReceipt/s,
  );
  assert.doesNotMatch(
    appSource,
    /if \(hasTrackNumberChanges\) \{\s*const directoryReceipt/s,
  );
  assert.doesNotMatch(
    appSource,
    /before saving a directory-renaming change/,
  );
  assert.doesNotMatch(
    appSource,
    /before saving directory-renaming changes/,
  );
});

test("requires the reviewed server plan when applying directory renames", () => {
  assert.match(
    serverSource,
    /\/api\/library\/track-directory-rename-plan/,
  );
  assert.match(
    serverSource,
    /\/api\/library\/apply-track-directory-renames/,
  );
  assert.match(
    serverSource,
    /releaseId, confirmation, and planFingerprint are required/,
  );
  assert.match(
    syncSource,
    /Track directory rename plan changed/,
  );
});

test("documents the browser validation path and stale-plan check", () => {
  assert.match(browserChecklist, /Save does not rename/);
  assert.match(browserChecklist, /Reviewed apply/);
  assert.match(browserChecklist, /Swap and cycle safety/);
  assert.match(browserChecklist, /Blocked plans/);
  assert.match(browserChecklist, /Stale-plan rejection/);
  assert.match(browserChecklist, /media bytes are unchanged/);
});
