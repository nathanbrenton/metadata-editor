import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);

test("starts Developer / Admin Tools disabled without browser persistence", () => {
  assert.match(
    appSource,
    /const \[showAdminTools, setShowAdminTools\] =\s*useState\(false\)/,
  );
  assert.doesNotMatch(
    appSource,
    /metadata-editor\.show-admin-tools/,
  );
  assert.doesNotMatch(
    appSource,
    /localStorage\.(?:getItem|setItem)\([^)]*show-admin-tools/s,
  );
});

test("uses the same temporary admin state across Library and release detail", () => {
  assert.match(
    appSource,
    /<ReleaseMetadataDetailView[\s\S]*?showAdminTools=\{showAdminTools\}/,
  );
  assert.match(
    appSource,
    /<ReleaseCard[\s\S]*?showAdminTools=\{[\s\S]*?showAdminTools[\s\S]*?\}/,
  );
  assert.match(
    appSource,
    /!tab\.adminOnly \|\|\s*showAdminTools/,
  );
});
