import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);

test("Library browsing accent defaults to gray and offers purple/blue beta variants", () => {
  assert.match(styles, /--library-track-selected-bg:/);
  assert.match(styles, /html\[data-interface-accent="purple"\]/);
  assert.match(styles, /html\[data-interface-accent="blue"\]/);
  assert.match(
    styles,
    /\.menu-card--interface-accent[\s\S]*?\.menu-beta-badge/,
  );
});
