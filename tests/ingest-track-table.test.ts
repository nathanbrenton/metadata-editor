import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  formatIngestSourceDisplayPath,
  sourceDateIsAfterReleaseDate,
  sourcePathsForBulkDate,
  synchronizeBulkSourceDate,
} from "../src/ingest-track-table.js";

const builderSource = await readFile(
  new URL("../src/IngestReleaseBuilder.tsx", import.meta.url),
  "utf8",
);

const styleSource = await readFile(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);

test("shows ingest source paths relative to the selected candidate folder", () => {
  assert.equal(
    formatIngestSourceDisplayPath(
      "2016-07-26_CrazyEights/160726_afternoon-1.m4a",
    ),
    "160726_afternoon-1.m4a",
  );
  assert.equal(
    formatIngestSourceDisplayPath(
      "candidate/subfolder/audio.wav",
    ),
    "subfolder/audio.wav",
  );
  assert.equal(
    formatIngestSourceDisplayPath("loose-file.wav"),
    "loose-file.wav",
  );
  assert.equal(
    formatIngestSourceDisplayPath(
      "candidate\\nested\\audio.aif",
    ),
    "nested/audio.aif",
  );
});

test("targets included non-missing sources for bulk date changes", () => {
  const targets = sourcePathsForBulkDate(
    [
      {
        sourceRelativePath: "release/one.wav",
        include: true,
      },
      {
        sourceRelativePath: "release/two.wav",
        include: false,
      },
      {
        sourceRelativePath: "release/missing.wav",
        include: true,
      },
    ],
    new Set(["release/missing.wav"]),
  );

  assert.deepEqual(targets, ["release/one.wav"]);
});

test("keeps the bulk source date synchronized with release date until manually overridden", () => {
  assert.equal(
    synchronizeBulkSourceDate("", "", "2025-08-31"),
    "2025-08-31",
  );
  assert.equal(
    synchronizeBulkSourceDate(
      "2025-08-31",
      "2025-08-31",
      "2025-09-01",
    ),
    "2025-09-01",
  );
  assert.equal(
    synchronizeBulkSourceDate(
      "2025-08-30",
      "2025-08-31",
      "2025-09-01",
    ),
    "2025-08-30",
  );
});

test("shows where the bulk source date came from", () => {
  assert.match(builderSource, /Prefilled from Release Date/);
  assert.match(builderSource, /Release Date available:/);
  assert.match(builderSource, /synchronizeBulkSourceDate/);
});

test("identifies source dates after the release date as a non-blocking advisory", () => {
  assert.equal(
    sourceDateIsAfterReleaseDate(
      "2024-09-26",
      "2016-07-26",
    ),
    true,
  );
  assert.equal(
    sourceDateIsAfterReleaseDate(
      "2016-07-26",
      "2016-07-26",
    ),
    false,
  );
  assert.equal(
    sourceDateIsAfterReleaseDate(
      "2016-07-25",
      "2016-07-26",
    ),
    false,
  );
  assert.equal(
    sourceDateIsAfterReleaseDate("", "2016-07-26"),
    false,
  );
});

test("keeps the staging track table compact and reserves room for titles", () => {
  assert.doesNotMatch(builderSource, /<th scope="col">Order<\/th>/);
  assert.doesNotMatch(builderSource, /Destination filename/);
  assert.match(builderSource, /maxLength=\{3\}/);
  assert.match(builderSource, /formatIngestSourceDisplayPath/);
  assert.match(builderSource, /Source dates after the release date/);
  assert.match(builderSource, /Source date tools/);
  assert.match(
    builderSource,
    /Apply to \{bulkDateSourceCount\} selected/,
  );
  assert.doesNotMatch(builderSource, /Copy to selected/);
  assert.match(builderSource, /Missing sources are skipped/);
  assert.match(builderSource, /does not block[\s\S]*staging plan/i);
  assert.match(
    styleSource,
    /\.ingest-source-date-tools[\s\S]*grid-template-columns:/,
  );
  assert.doesNotMatch(styleSource, /ingest-source-date-copy-button/);
  assert.match(styleSource, /\.ingest-track-title-column[\s\S]*width:\s*17rem;/);
  assert.match(styleSource, /\.ingest-builder-track-table[\s\S]*min-width:\s*72rem;/);
});
