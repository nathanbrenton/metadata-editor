import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const styles = await readFile(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);

test("uses page-native metadata scrolling without a metadata-pane wheel layer", () => {
  assert.doesNotMatch(
    appSource,
    /metadata-scroll-handoff|data-metadata-scroll-handoff/,
  );
  assert.doesNotMatch(
    appSource,
    /normalizeMetadataWheelDelta|planMetadataScrollHandoff/,
  );
  assert.match(
    styles,
    /\.release-metadata-content \{[\s\S]*?overflow-y: visible;/,
  );
});
