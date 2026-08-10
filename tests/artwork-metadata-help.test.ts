import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const helpSource = readFileSync(
  new URL("../src/workflow-help-content.ts", import.meta.url),
  "utf8",
);

test("provides dedicated guidance for indexed artwork metadata fields", () => {
  assert.match(
    appSource,
    /id\|role\|primary\|description\|credits\|copyright/,
  );
  assert.match(
    appSource,
    /Artwork credits identify who created or contributed to this visual asset/,
  );
  assert.match(appSource, /Artwork by Jane Doe/);
  assert.match(appSource, /Photography by Alex Smith/);
  assert.match(appSource, /Design by Example Studio/);
  assert.match(appSource, /Artwork prompt by Jane Doe/);
});

test("distinguishes artwork credits from description role id and copyright", () => {
  assert.match(
    appSource,
    /Put creator names and contribution roles in Artwork Credits instead/,
  );
  assert.match(
    appSource,
    /Do not use Description as the creator-credit field/,
  );
  assert.match(
    appSource,
    /ownership\/rightsholder information, not the general creator-credit field/,
  );
});

test("documents artwork creator credits in Workflow and Help", () => {
  assert.match(
    helpSource,
    /Where do artwork creator names and roles go\?/,
  );
  assert.match(
    helpSource,
    /Use Artwork Credits for the people or organizations responsible for an image/,
  );
});
