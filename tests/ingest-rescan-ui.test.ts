import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const builderSource = readFileSync(
  new URL("../src/IngestReleaseBuilder.tsx", import.meta.url),
  "utf8",
);
const hookSource = readFileSync(
  new URL("../src/useIngestDraft.ts", import.meta.url),
  "utf8",
);
const serverSource = readFileSync(
  new URL("../server/index.ts", import.meta.url),
  "utf8",
);

test(
  "offers rescan, durable draft status, and loose attachments",
  () => {
    assert.match(builderSource, /Rescan candidate/);
    assert.match(builderSource, /Draft saved locally/);
    assert.match(builderSource, /Loose files available to attach/);
    assert.match(builderSource, /Attach to draft/);
    assert.match(builderSource, /Source missing/);
  },
);

test(
  "persists drafts locally and invalidates stale build plans",
  () => {
    assert.match(hookSource, /\/api\/ingest\/draft/);
    assert.match(hookSource, /mergeIngestDraftAfterRescan/);
    assert.match(serverSource, /\/api\/ingest\/attachments/);
    assert.match(serverSource, /assertIngestSourcesReviewed/);
  },
);

test(
  "shows local artwork previews after rescan",
  () => {
    assert.match(
      builderSource,
      /\/api\/ingest\/artwork/,
    );
    assert.match(
      builderSource,
      /ingest-artwork-thumbnail/,
    );
    assert.match(
      serverSource,
      /\/api\/ingest\/artwork/,
    );
    assert.match(
      serverSource,
      /readIngestArtworkPreview/,
    );
  },
);

test(
  "offers direct decisions for blocking review sources",
  () => {
    assert.match(
      builderSource,
      /Include as artwork/,
    );
    assert.match(
      builderSource,
      /Skip this file/,
    );
    assert.match(
      builderSource,
      /Review in Other Files/,
    );
    assert.match(
      builderSource,
      /Exclude missing file/,
    );
  },
);

test(
  "removes missing optional assets from the unfinished draft",
  () => {
    assert.match(
      builderSource,
      /aria-label="Remove missing asset from draft"/,
    );
    assert.match(
      builderSource,
      /Missing optional files retained in this draft/,
    );
    assert.match(
      hookSource,
      /assets: current\.assets\.filter/,
    );
  },
);

test(
  "distinguishes release-level and track-level artwork assignments",
  () => {
    assert.match(
      builderSource,
      /Release level/,
    );
    assert.match(
      builderSource,
      /Track level/,
    );
    assert.match(
      builderSource,
      /Apply to tracks/,
    );
    assert.match(
      builderSource,
      /Add assignment/,
    );
    assert.match(
      builderSource,
      /Artwork use/,
    );
    assert.match(
      builderSource,
      /TOMLs updated/,
    );
  },
);
