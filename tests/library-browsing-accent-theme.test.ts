import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { readEditorStyles } from "./support/editor-source.js";

const styles = await readEditorStyles();

test("Library browsing accent defaults to gray and offers purple/blue beta variants", () => {
  assert.match(styles, /--library-track-selected-bg:/);
  assert.match(styles, /html\[data-interface-accent="purple"\]/);
  assert.match(styles, /html\[data-interface-accent="blue"\]/);
  assert.match(
    styles,
    /\.menu-card--interface-accent[\s\S]*?\.menu-beta-badge/,
  );
});
