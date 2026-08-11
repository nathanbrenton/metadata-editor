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
const scannerSource = readFileSync(
  new URL("../server/scanner.ts", import.meta.url),
  "utf8",
);
const metadataSource = readFileSync(
  new URL("../server/video-metadata.ts", import.meta.url),
  "utf8",
);
const profileSource = readFileSync(
  new URL("../server/media-processing/video-web-stream.ts", import.meta.url),
  "utf8",
);

test("Library video presentation supports ordered poster-aware editorial metadata", () => {
  assert.match(appSource, /Poster frame · seconds/);
  assert.match(appSource, /Display order/);
  assert.match(appSource, /buildLibraryVideoPosterUrl/);
  assert.match(appSource, /library-video-poster/);
  assert.match(appSource, /left\.displayOrder/);
  assert.match(metadataSource, /display_order/);
  assert.match(metadataSource, /poster_time_seconds/);
  assert.match(scannerSource, /video display order/);
});

test("prepared video poster preview is private and poster selection participates in freshness", () => {
  assert.match(serverSource, /\/api\/library\/video-poster/);
  assert.match(serverSource, /prepared-video-poster/);
  assert.match(profileSource, /posterTimeSeconds\?: number/);
  assert.match(profileSource, /auto-or-authored-seek/);
  assert.match(profileSource, /"-ss"/);
  assert.match(profileSource, /info\.source\.posterTimeSeconds/);
});

test("application header uses the supplied image logo without a visible Hiplingo wordmark", () => {
  assert.match(
    appSource,
    /const hiplingoLogoUrl = new URL\([\s\S]*"\.\/assets\/hiplingo-logo\.png"/,
  );
  assert.match(appSource, /src=\{hiplingoLogoUrl\}/);
  assert.doesNotMatch(appSource, />HIPLINGO</);
});
