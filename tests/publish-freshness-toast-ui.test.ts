import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const helpSource = await readFile(
  new URL("../src/workflow-help-content.ts", import.meta.url),
  "utf8",
);

test("shows persistent up-to-date publish state instead of a repeat write action", () => {
  assert.match(appSource, /function publicPackageIsUpToDate/);
  assert.match(
    appSource,
    /publication\.state === "up-to-date"/,
  );
  assert.match(
    appSource,
    /Public package is up to date/,
  );
  assert.match(
    appSource,
    /Current canonical metadata and public media inputs match the published snapshot/,
  );
});

test("uses the shared success toast for publish and preparation writes", () => {
  assert.match(
    appSource,
    /Public package .* successfully\.`,[\s\S]*?"success"/,
  );
  assert.match(appSource, /const preparedParts =/);
  assert.match(
    appSource,
    /`Prepared \$\{preparedParts\.join\(", "\)\}\.`/,
  );
  assert.match(appSource, /aria-label="Dismiss notification"/);
  assert.match(appSource, /}, 4200\);/);
});

test("documents publish freshness and transient success feedback", () => {
  assert.match(helpSource, /stable content fingerprint/i);
  assert.match(helpSource, /Public package is up to date/i);
  assert.match(helpSource, /transient success toast/i);
});
