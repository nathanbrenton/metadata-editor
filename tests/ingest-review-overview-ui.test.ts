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
  "makes staging Build release-oriented with the plan action first",
  () => {
    assert.match(
      builderSource,
      /className="ingest-build-plan-launcher"/,
    );
    assert.match(
      builderSource,
      /className="ingest-review-release-card"/,
    );
    assert.match(
      builderSource,
      /Final release/,
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
      /<h4>Build readiness<\/h4>/,
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
  "keeps exact staging mechanics in collapsed Build details",
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
  "surfaces blocked destination reasons and routes artwork conflicts back to Artwork & files",
  () => {
    assert.match(
      builderSource,
      /const blockedPlanItems = preview\?\.items\.filter/,
    );
    assert.match(
      builderSource,
      /Blocked destination needs attention/,
    );
    assert.match(
      builderSource,
      /<strong>\{item\.reason\}<\/strong>/,
    );
    assert.match(
      builderSource,
      /Review Artwork &amp; files/,
    );
    assert.match(
      builderSource,
      /onReviewArtwork=\{\(\) => onStepChange\(4\)\}/,
    );
    assert.match(
      builderSource,
      /open=\{preview\.summary\.blockedCount > 0\}[\s\S]*Filesystem plan/,
    );
  },
);

test(
  "documents the release-first Build workflow",
  () => {
    assert.match(
      helpSource,
      /Build is the final Staging step before files are written/,
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
