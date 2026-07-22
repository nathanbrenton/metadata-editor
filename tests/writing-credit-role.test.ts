import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultWritingRoleForFamily,
  sortWritingCreditDisplayRecords,
  writingCreditFamilyForRole,
} from "../src/writing-credit-role.js";

test("maps guided writing roles to canonical TOML families", () => {
  assert.equal(
    writingCreditFamilyForRole("Written by"),
    "songwriters",
  );
  assert.equal(
    writingCreditFamilyForRole("Music by"),
    "composers",
  );
  assert.equal(
    writingCreditFamilyForRole("Lyrics by"),
    "lyricists",
  );
  assert.equal(
    writingCreditFamilyForRole(
      "custom author credit",
      "composers",
    ),
    "composers",
  );
});

test("provides readable defaults for legacy records without roles", () => {
  assert.equal(
    defaultWritingRoleForFamily("songwriters"),
    "written by",
  );
  assert.equal(
    defaultWritingRoleForFamily("composers"),
    "composer",
  );
  assert.equal(
    defaultWritingRoleForFamily("lyricists"),
    "lyricist",
  );
});

test("sorts combined writing before music and lyric-specific credits", () => {
  const sorted = sortWritingCreditDisplayRecords([
    { role: "lyrics by", family: "lyricists" as const },
    { role: "composer", family: "composers" as const },
    { role: "written by", family: "songwriters" as const },
    { role: "additional songwriter", family: "songwriters" as const },
  ]);

  assert.deepEqual(
    sorted.map(({ role }) => role),
    [
      "written by",
      "additional songwriter",
      "composer",
      "lyrics by",
    ],
  );
});
