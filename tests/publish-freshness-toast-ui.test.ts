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
    /Web Package is up to date/,
  );
  assert.match(
    appSource,
    /Current canonical metadata and web-facing media inputs match the Web Package snapshot/,
  );
});

test("uses the shared success toast for publish and preparation writes", () => {
  assert.match(appSource, /"Web Package updated successfully\."/);
  assert.match(
    appSource,
    /"Release is now Public in the Web Package\."/,
  );
  assert.match(
    appSource,
    /Prepared \$\{payload\.streamCount\} video HLS/,
  );
  assert.match(appSource, /onNotify\(/);
  assert.match(appSource, /"success"/);
});

test("documents publish freshness and transient success feedback", () => {
  assert.match(helpSource, /stable content fingerprint/i);
  assert.match(helpSource, /row reports Current and removes the repeat publish action/i);
  assert.match(helpSource, /transient success toast/i);
});
