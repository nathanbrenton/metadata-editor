import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const styles = await readFile(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);
const helpSource = await readFile(
  new URL("../src/workflow-help-content.ts", import.meta.url),
  "utf8",
);

test("shows file-spec guidance inline with ingest filenames without adding a column", () => {
  const inspectionStart = appSource.indexOf(
    "function IngestCandidateInspectionView",
  );
  const detailStart = appSource.indexOf(
    "function IngestFileInspectionDetail",
    inspectionStart,
  );
  const inspection = appSource.slice(
    inspectionStart,
    detailStart,
  );

  assert.match(appSource, /function IngestFileFormatBadge/);
  assert.match(appSource, /classifyMediaMasterExtension/);
  assert.match(appSource, /classifyMetadataFileExtension/);
  assert.match(
    inspection,
    /<strong>\{file\.filename\}<\/strong>[\s\S]*?<IngestFileFormatBadge file=\{file\}/,
  );
  assert.doesNotMatch(
    inspection,
    /<th scope="col">Format<\/th>/,
  );
});

test("distinguishes guidance labels without changing staging behavior", () => {
  assert.match(appSource, /label: "Preferred"/);
  assert.match(appSource, /label: "Compatible"/);
  assert.match(appSource, /label: "Sidecar"/);
  assert.match(appSource, /label: "Candidate metadata"/);
  assert.match(appSource, /label: "Outside spec"/);
  assert.match(styles, /\.ingest-file-format-badge\.preferred/);
  assert.match(styles, /\.ingest-file-format-badge\.compatible/);
});

test("Workflow Help distinguishes file-spec guidance from provenance", () => {
  assert.match(helpSource, /These badges are guidance, not provenance/i);
  assert.match(helpSource, /silently transcoding the archival master/i);
});
