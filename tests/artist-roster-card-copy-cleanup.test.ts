import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);

test("Artist roster cards omit implementation-facing ID and slug rows", () => {
  assert.match(
    appSource,
    /\{artist\.displayName\}/,
  );
  assert.match(
    appSource,
    /Associated releases:/,
  );

  assert.doesNotMatch(
    appSource,
    /<(?:code|small|span)(?:\s+[^>]*)?>\s*\{artist\.id\}\s*<\/(?:code|small|span)>/,
  );

  assert.doesNotMatch(
    appSource,
    /<(?:code|small|span)(?:\s+[^>]*)?>\s*\{artist\.slug\}\s*<\/(?:code|small|span)>/,
  );
});
