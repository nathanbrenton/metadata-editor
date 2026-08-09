import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const builderSource = readFileSync(
  new URL(
    "../src/IngestReleaseBuilder.tsx",
    import.meta.url,
  ),
  "utf8",
);
const assignmentSource = readFileSync(
  new URL(
    "../src/ingest-artwork-assignment.ts",
    import.meta.url,
  ),
  "utf8",
);
const styleSource = readFileSync(
  new URL(
    "../src/styles.css",
    import.meta.url,
  ),
  "utf8",
);
const helpSource = readFileSync(
  new URL(
    "../src/workflow-help-content.ts",
    import.meta.url,
  ),
  "utf8",
);

test(
  "presents staging artwork as draggable tiles above release and track targets",
  () => {
    assert.match(
      builderSource,
      /label: "Artwork & files"/,
    );
    assert.match(
      builderSource,
      /<h3>Assign artwork & other files<\/h3>/,
    );
    assert.match(
      builderSource,
      /className="ingest-artwork-tile-grid"/,
    );
    assert.match(
      builderSource,
      /draggable=\{!sourceMissing\}/,
    );
    assert.match(
      builderSource,
      /event\.dataTransfer\.setData\(\s*"text\/plain",\s*asset\.sourceRelativePath,/s,
    );
    assert.match(
      builderSource,
      /Drop artwork here/,
    );
    assert.match(
      builderSource,
      /Release and track artwork/,
    );
    assert.match(
      builderSource,
      /releaseTitle \|\| "Untitled release"/,
    );
    assert.match(
      builderSource,
      /String\(track\.trackNumber\)\.padStart\(2, "0"\).*track\.title/s,
    );
  },
);

test(
  "supports non-drag assignment and confirms replacement of occupied front artwork",
  () => {
    assert.match(
      builderSource,
      /Select artwork/,
    );
    assert.match(
      builderSource,
      /Assign selected/,
    );
    assert.match(
      builderSource,
      /Replace with selected/,
    );
    assert.match(
      builderSource,
      /window\.confirm\([\s\S]*?`Replace the current front artwork for/s,
    );
    assert.match(
      builderSource,
      /buildFrontArtworkAssignmentUpdates/,
    );
    assert.match(
      assignmentSource,
      /assignmentsWithoutTarget/,
    );
    assert.match(
      assignmentSource,
      /role: "front_cover"/,
    );
  },
);

test(
  "keeps advanced artwork roles available without making them the primary workflow",
  () => {
    assert.match(
      builderSource,
      /<details className="ingest-artwork-advanced-assignments">/,
    );
    assert.match(
      builderSource,
      /Advanced artwork roles & multi-target assignments/,
    );
    assert.match(
      builderSource,
      /<ArtworkAssignmentsEditor/,
    );
    assert.match(
      helpSource,
      /compact thumbnail-only palette above release and track destination rows/,
    );
    assert.match(
      helpSource,
      /Replacing an occupied front-artwork target requires confirmation/,
    );
  },
);

test(
  "styles the artwork workspace as a dense desktop grid and target list",
  () => {
    assert.match(
      styleSource,
      /\.ingest-artwork-tile-grid\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fill, 5\.5rem\)/s,
    );
    assert.match(
      styleSource,
      /\.ingest-artwork-target-row\s*\{[^}]*grid-template-columns:/s,
    );
    assert.match(
      styleSource,
      /\.ingest-artwork-target-row\.release/,
    );
  },
);
