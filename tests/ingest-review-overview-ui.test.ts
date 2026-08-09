import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import test from "node:test";

const builderSource = readFileSync(
  new URL(
    "../src/IngestReleaseBuilder.tsx",
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
  "makes staging Review release-oriented before technical plan detail",
  () => {
    assert.match(
      builderSource,
      /className="ingest-review-release-card"/,
    );
    assert.match(
      builderSource,
      /Release review/,
    );
    assert.match(
      builderSource,
      /className="ingest-table ingest-review-track-table"/,
    );
    assert.match(
      builderSource,
      /Confirm titles, source audio, and the effective front artwork each track will use/,
    );
    assert.match(
      builderSource,
      /<h4>Preflight<\/h4>/,
    );
  },
);

test(
  "shows track front-artwork overrides before inherited release artwork",
  () => {
    const helper = builderSource.match(
      /function reviewTrackFrontArtwork\([\s\S]*?\n}\n\nfunction reviewArtworkSourceStatus/,
    );

    assert.ok(helper);
    assert.match(
      helper[0],
      /assignment\.scope === "track"[\s\S]*assignment\.role === "front_cover"/,
    );
    assert.match(
      helper[0],
      /if \(trackArtwork\)[\s\S]*inherited: false/,
    );
    assert.match(
      helper[0],
      /reviewReleaseFrontArtwork\(draft\)[\s\S]*inherited: true/,
    );
    assert.match(
      builderSource,
      /effectiveArtwork\.inherited[\s\S]*"Release"[\s\S]*"Track"/,
    );
  },
);

test(
  "keeps exact staging mechanics in collapsed Review details",
  () => {
    assert.match(
      builderSource,
      /<details className="ingest-review-details">[\s\S]*Artwork placement details/,
    );
    assert.match(
      builderSource,
      /<details className="ingest-review-details">[\s\S]*Filesystem plan/,
    );
    assert.match(
      builderSource,
      /Metadata \/ TOML updates/,
    );
    assert.match(
      builderSource,
      /function BuildPlanItemsTable/,
    );
    assert.match(
      styleSource,
      /\.ingest-review-details > summary/,
    );
  },
);

test(
  "documents the release-first Review workflow",
  () => {
    assert.match(
      helpSource,
      /Review the release as a release before writing files/,
    );
    assert.match(
      helpSource,
      /release-level inheritance and track-level overrides/,
    );
    assert.match(
      helpSource,
      /metadata\/TOML updates stay collapsed as technical details/,
    );
  },
);
