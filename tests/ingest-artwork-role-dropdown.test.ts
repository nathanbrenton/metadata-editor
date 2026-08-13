import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ingestArtworkRoleOptions,
} from "../shared/ingest-builder.js";

const builderSource = readFileSync(
  new URL("../src/IngestReleaseBuilder.tsx", import.meta.url),
  "utf8",
);
const serverSource = readFileSync(
  new URL("../server/ingest-builder.ts", import.meta.url),
  "utf8",
);
const helpSource = readFileSync(
  new URL("../src/workflow-help-content.ts", import.meta.url),
  "utf8",
);

test("offers a controlled alternate-front artwork role", () => {
  assert.ok(
    ingestArtworkRoleOptions.includes("alternate_front_cover"),
  );
  assert.match(
    builderSource,
    /<select[\s\S]*?value=\{assignment\.role\}[\s\S]*?ingestArtworkRoleOptions\.map/,
  );
  assert.match(
    builderSource,
    /case "alternate_front_cover":[\s\S]*?return "Alternate front cover"/,
  );
});

test("stores alternate front artwork separately and keeps it non-primary", () => {
  assert.match(
    serverSource,
    /role === "alternate_front_cover"[\s\S]*?return `alternate\/\$\{assignmentSlug\}`/,
  );
  assert.match(
    serverSource,
    /assignment\.role !== "alternate_front_cover"/,
  );
  assert.match(
    helpSource,
    /controlled Artwork role dropdown[\s\S]*Alternate front cover/i,
  );
});
