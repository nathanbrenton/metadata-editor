import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import test from "node:test";

const appSource = readFileSync(
  new URL(
    "../src/App.tsx",
    import.meta.url,
  ),
  "utf8",
);
const builderSource = readFileSync(
  new URL(
    "../src/IngestReleaseBuilder.tsx",
    import.meta.url,
  ),
  "utf8",
);
const serverSource = readFileSync(
  new URL(
    "../server/ingest-builder.ts",
    import.meta.url,
  ),
  "utf8",
);
const apiServerSource = readFileSync(
  new URL(
    "../server/index.ts",
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

test(
  "offers guided and quick-review staging workflows from candidate inspection",
  () => {
    assert.match(
      appSource,
      /Continue to Staging/,
    );
    assert.match(
      builderSource,
      /Guided setup/,
    );
    assert.match(
      builderSource,
      /Quick review/,
    );
    assert.match(
      builderSource,
      /Confirm release identity/,
    );
    assert.match(
      builderSource,
      /Track tags and file mapping/,
    );
    assert.match(
      builderSource,
      /Preview build plan/,
    );
    assert.match(
      builderSource,
      /Preview update plan/,
    );
    assert.match(
      builderSource,
      /Apply staging update/,
    );
  },
);

test(
  "requires explicit confirmation and exposes no source mutation operation",
  () => {
    assert.match(
      builderSource,
      /leave all ingest sources\s+unchanged/s,
    );
    assert.match(
      serverSource,
      /INGEST_BUILD_CONFIRMATION_PHRASE/,
    );
    assert.match(
      serverSource,
      /copyFile\(/,
    );
    assert.doesNotMatch(
      serverSource,
      /rename\(\s*copy\.sourcePath/,
    );
    assert.doesNotMatch(
      serverSource,
      /unlink\(\s*copy\.sourcePath/,
    );
  },
);

test(
  "uses recognized release types and keeps jam in production context",
  () => {
    const optionsMatch = builderSource.match(
      /const releaseTypeOptions = \[([\s\S]*?)\] as const;/,
    );

    assert.ok(optionsMatch);

    assert.match(
      optionsMatch[1],
      /"field recording"/,
    );

    assert.doesNotMatch(
      optionsMatch[1],
      /"jam"/,
    );

    assert.match(
      builderSource,
      /working-session context[\s\S]*jam[\s\S]*Production Notes/i,
    );
  },
);

test(
  "uses track numbers for ordering and clearly labels staging deltas",
  () => {
    assert.match(
      builderSource,
      /maxLength=\{3\}/,
    );
    assert.doesNotMatch(
      builderSource,
      /Move track earlier/,
    );
    assert.doesNotMatch(
      builderSource,
      /Destination filename/,
    );
    assert.match(
      builderSource,
      /Existing staging release detected/,
    );
    assert.match(
      builderSource,
      /Adjustment \/ reason/,
    );
    assert.match(
      builderSource,
      /Files preserved/,
    );
    assert.match(
      serverSource,
      /stable ID will be retained/i,
    );
  },
);

test(
  "keeps the build-plan action readable while kind and status use compact icons",
  () => {
    assert.match(
      styleSource,
      /\.ingest-build-plan-table tr > :first-child\s*\{[^}]*min-width:\s*6\.5rem;[^}]*white-space:\s*nowrap;/s,
    );
    assert.match(
      builderSource,
      /<PlanKindIcon[\s\S]*kind=\{item\.kind\}[\s\S]*mediaKind=\{item\.mediaKind\}/,
    );
    assert.match(
      builderSource,
      /ingest-plan-status-icon[\s\S]*item\.action === "blocked" \? "×" : "✓"/,
    );
    assert.match(
      styleSource,
      /\.ingest-plan-status-icon\.ready[\s\S]*\.ingest-plan-status-icon\.blocked/,
    );
  },
);

test(
  "previews inspected source audio from Tracks and Review without writing derivatives",
  () => {
    assert.match(
      builderSource,
      /function IngestAudioPreviewButton/,
    );
    assert.match(
      builderSource,
      /className="ingest-track-preview-column"/,
    );
    assert.match(
      builderSource,
      /item\.mediaKind === "audio"[\s\S]*<IngestAudioPreviewButton/,
    );
    assert.match(
      apiServerSource,
      /\/api\/ingest\/audio-preview/,
    );
    assert.match(
      apiServerSource,
      /sendAudioFilePreview\([\s\S]*"ingest"/,
    );
    assert.doesNotMatch(
      apiServerSource,
      /writeFile\([^)]*audio-preview/,
    );
  },
);


test(
  "renders staging destinations relative to the release root shown above the table",
  () => {
    assert.match(
      builderSource,
      /stagingDestinationPathForDisplay\(\s*item\.destinationRelativePath,\s*preview\.releaseRelativePath,/s,
    );
    assert.match(
      builderSource,
      /stagingDestinationPathForDisplay\(\s*receipt\.destinationRelativePath,\s*result\.releaseRelativePath,/s,
    );
  },
);
