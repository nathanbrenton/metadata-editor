import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  readEditorAppSource,
  readEditorStyles,
} from "./support/editor-source.js";

const appSource = await readEditorAppSource();
const styles = await readEditorStyles();

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
