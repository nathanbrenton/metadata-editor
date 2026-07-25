import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const builderSource = await readFile(
  new URL(
    "../src/IngestReleaseBuilder.tsx",
    import.meta.url,
  ),
  "utf8",
);

const styleSource = await readFile(
  new URL(
    "../src/styles.css",
    import.meta.url,
  ),
  "utf8",
);

test(
  "keeps the staging release directory ID synchronized until overridden",
  () => {
    assert.match(
      builderSource,
      /buildReleaseDirectoryId/,
    );
    assert.match(
      builderSource,
      /shouldSynchronizeReleaseDirectoryId/,
    );
    assert.match(
      builderSource,
      /Use generated ID/,
    );
    assert.match(
      builderSource,
      /Custom override active/,
    );
    assert.match(
      styleSource,
      /\.ingest-release-id-guidance/,
    );
  },
);
