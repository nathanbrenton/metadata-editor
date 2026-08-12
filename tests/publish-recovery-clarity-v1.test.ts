import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const app = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const server = await readFile(
  new URL("../server/index.ts", import.meta.url),
  "utf8",
);
const prepare = await readFile(
  new URL("../server/media-processing/prepare.ts", import.meta.url),
  "utf8",
);

test("Publish problem table has a stable human-readable row number column", () => {
  assert.match(
    app,
    /<th scope="col" className="publish-issue-number-column">#<\/th>/,
  );
  assert.match(
    app,
    /className="publish-issue-number-cell"[\s\S]*\{index \+ 1\}/,
  );
});

test("Library MP3 preparation uses a playback-only preparation scope", () => {
  assert.match(
    app,
    /prepareRelease\(selectedPlan, "playback"\)/,
  );
  assert.match(
    app,
    /operationId,[\s\S]*scope,/,
  );
  assert.match(server, /scope must be all or playback/);
  assert.match(prepare, /scope\?: "all" \| "playback"/);
  assert.match(
    prepare,
    /scope === "all" \|\|[\s\S]*derivative\.kind === "playback-mp3"/,
  );
});

test("Web Package state is distinct from generic Library health", () => {
  assert.match(app, /return \{ label: "Prepared", tone: "success" \};/);
  assert.match(app, /return \{ label: "Update ready", tone: "warning" \};/);
  assert.match(app, /return \{ label: "Not prepared", tone: "preview" \};/);
  assert.match(app, /: "Library ready";/);
});
