import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const styleSource = readFileSync(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);
const helpSource = readFileSync(
  new URL("../src/workflow-help-content.ts", import.meta.url),
  "utf8",
);

test("models canonical videos in Library scan results", () => {
  assert.match(appSource, /type VideoScanResult = \{/);
  assert.match(appSource, /videos: VideoScanResult\[\];/);
  assert.match(appSource, /summary\.videoCount/);
  assert.match(appSource, /selectedRelease\.videos\.length/);
});

test("shows a compact first-class Videos disclosure on Library release cards", () => {
  assert.match(appSource, /className="library-video-disclosure"/);
  assert.match(appSource, /className="library-video-row"/);
  assert.match(appSource, /video\.title\?\.trim\(\) \|\| video\.id/);
  assert.match(appSource, /normalizedVideoType\.replaceAll\("_", " "\)/);
  assert.match(appSource, /Release-level/);
  assert.match(appSource, /Related ·/);
  assert.match(appSource, /Missing master/);
  assert.match(styleSource, /\.library-video-row\s*\{[\s\S]*?grid-template-columns:/);
});

test("documents Library video inspection, preview, and guarded V3b private preparation", () => {
  assert.match(
    helpSource,
    /Library scanner recognizes those canonical video directories/,
  );
  assert.match(
    helpSource,
    /previewed read-only from the Library without generating a derivative/,
  );
  assert.match(
    helpSource,
    /codec support still depends on the browser/,
  );
  assert.match(
    helpSource,
    /V3b H\.264\/AAC HLS backend can now produce the private/,
  );
  assert.match(
    helpSource,
    /reviewed video-plan fingerprint/,
  );
  assert.match(
    helpSource,
    /existing Publish UI still operates on audio readiness/,
  );
  assert.match(
    helpSource,
    /public web-video publication remain later milestones/,
  );
});
