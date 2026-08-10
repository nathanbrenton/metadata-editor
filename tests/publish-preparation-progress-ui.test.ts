import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const serverSource = readFileSync(
  new URL("../server/index.ts", import.meta.url),
  "utf8",
);
const prepareSource = readFileSync(
  new URL(
    "../server/media-processing/prepare.ts",
    import.meta.url,
  ),
  "utf8",
);
const helpSource = readFileSync(
  new URL(
    "../src/workflow-help-content.ts",
    import.meta.url,
  ),
  "utf8",
);

test("polls server-reported Publish preparation progress", () => {
  assert.match(
    appSource,
    /media-preparation-\$\{crypto\.randomUUID\(\)\}/,
  );
  assert.match(
    appSource,
    /\/api\/publish\/prepare-progress\?operationId=/,
  );
  assert.match(appSource, /window\.setInterval/);
  assert.match(appSource, /publish-preparation-progress/);
  assert.match(appSource, /aria-live="polite"/);
  assert.match(appSource, /<progress/);
});

test("reports track and phase milestones from the preparation executor", () => {
  assert.match(prepareSource, /onProgress\?:/);
  assert.match(
    prepareSource,
    /transcoding segmented AAC-LC HLS stream/,
  );
  assert.match(
    prepareSource,
    /preparing Library playback MP3/,
  );
  assert.match(prepareSource, /generating waveform peaks/);
  assert.match(
    prepareSource,
    /generating browser-compatible PNG from canonical TIFF\/TIF master/,
  );
  assert.match(prepareSource, /phase: "browser-artwork"/);
  assert.match(prepareSource, /phase: "validating"/);
  assert.match(prepareSource, /phase: "promoting"/);
  assert.match(prepareSource, /phase: "completed"/);
  assert.match(prepareSource, /phase: "failed"/);
});

test("exposes bounded in-memory preparation progress without changing write semantics", () => {
  assert.match(
    serverSource,
    /requestUrl\.pathname === "\/api\/publish\/prepare-progress"/,
  );
  assert.match(serverSource, /recordMediaPreparationProgress/);
  assert.match(serverSource, /operationId contains unsupported characters/);
});

test("documents live preparation progress without per-track toast noise", () => {
  assert.match(helpSource, /live server-reported progress/);
  assert.match(helpSource, /without flooding the interface with per-track toasts/);
});
