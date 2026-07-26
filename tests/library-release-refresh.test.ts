import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);

test("refreshes the release detail and Library scan together", () => {
  assert.match(
    appSource,
    /onRefresh=\{async \(\) => \{[\s\S]*?Promise\.all\(\[[\s\S]*?refreshLibrary\(\)[\s\S]*?openReleaseDetail\(releaseId\)[\s\S]*?\]\)/,
  );
});

test("keeps playable track lookup grounded in the refreshed Library scan", () => {
  assert.match(
    appSource,
    /const orderedScannedTracks = trackIds[\s\S]*?release\?\.tracks\.find[\s\S]*?const playableTrackIds = getPlayableTrackIds/,
  );
});
