import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const styleSource = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const helpSource = await readFile(new URL("../src/workflow-help-content.ts", import.meta.url), "utf8");

test("Library metadata sidebar uses explicit actionable health labels", () => {
  assert.match(appSource, /return `Block \$\{summary\.blocked\}`;/);
  assert.match(appSource, /return `Warn \$\{summary\.warning\}`;/);
  assert.match(appSource, /return `Web prep \$\{summary\.preparation\}`;/);
  assert.match(styleSource, /\.library-health-row-badge[\s\S]*?white-space: nowrap;/);
  assert.match(helpSource, /Block, Warn, or Web prep badges/);
});

test("Library release and track sidebar no longer repeats metadata-document counts", () => {
  const start = appSource.indexOf('className="metadata-document-tabs"');
  const end = appSource.indexOf('className="metadata-sidebar-resize-handle"', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  assert.doesNotMatch(appSource.slice(start, end), /className="document-count"/);
});
