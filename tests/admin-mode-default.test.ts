import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);

test("starts Developer / Admin Tools disabled without persistence", () => {
  assert.match(
    appSource,
    /const \[showAdminTools, setShowAdminTools\] =\s*useState\(false\)/,
  );
  assert.doesNotMatch(
    appSource,
    /localStorage\.(?:getItem|setItem)\([^)]*show-admin-tools/s,
  );
  assert.doesNotMatch(
    appSource,
    /sessionStorage\.(?:getItem|setItem)\([^)]*show-admin-tools/s,
  );
});

test("clears legacy Admin preferences and restored-page state", () => {
  assert.match(
    appSource,
    /localStorage\.removeItem\(\s*["']metadata-editor\.show-admin-tools-v2/,
  );
  assert.match(
    appSource,
    /sessionStorage\.removeItem\(\s*["']metadata-editor\.show-admin-tools-v2/,
  );
  assert.match(
    appSource,
    /const disableAdminToolsOnPageRestore = \(\) => \{\s*setShowAdminTools\(false\);/,
  );
  assert.match(
    appSource,
    /addEventListener\(\s*["']pageshow["']\s*,\s*disableAdminToolsOnPageRestore/,
  );
  assert.equal(
    appSource.match(
      /<input\s+type="checkbox"\s+autoComplete="off"\s+checked=\{showAdminTools\}/g,
    )?.length,
    2,
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
