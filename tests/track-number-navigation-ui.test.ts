import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const styleSource = await readFile(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);
const registrySource = await readFile(
  new URL(
    "../server/metadata-registry.ts",
    import.meta.url,
  ),
  "utf8",
);

test("orders Library track navigation from effective numbering", () => {
  assert.match(
    appSource,
    /buildTrackNavigationOrder/,
  );
  assert.match(
    appSource,
    /track\.numbering\.track_number/,
  );
  assert.match(
    appSource,
    /trackNavigation\.entries\.map/,
  );
  assert.match(
    appSource,
    /orderedScannedTracks/,
  );
});

test("shows duplicate numbering warnings in the workspace and sidebar", () => {
  assert.match(
    appSource,
    /Duplicate track numbering/,
  );
  assert.match(
    appSource,
    /has-numbering-conflict/,
  );
  assert.match(
    appSource,
    /track-number-conflict-badge/,
  );
  assert.match(
    styleSource,
    /\.track-number-conflict-notice\s*\{/,
  );
  assert.match(
    registrySource,
    /warns when two tracks share the same number on one disc/,
  );
});
