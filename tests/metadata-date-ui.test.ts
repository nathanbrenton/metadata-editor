import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { readEditorAppSource } from "./support/editor-source.js";

const appSource = await readEditorAppSource();
const sampleSource = await readFile(new URL("../src/SampleRecordEditors.tsx", import.meta.url), "utf8");

test("uses native calendar inputs for general metadata and sample clearance dates", () => {
  assert.match(appSource, /isCalendarDateMetadataPath/);
  assert.match(appSource, /className="metadata-editor-field metadata-date-field"/);
  assert.match(appSource, /type="date"/);
  assert.match(sampleSource, /<span>Expiration date<\/span>[\s\S]*type="date"/);
  assert.match(sampleSource, /getLegacyCalendarDateValue/);
});
