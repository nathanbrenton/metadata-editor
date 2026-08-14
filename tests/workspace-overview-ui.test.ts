import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const styleSource = await readFile(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);
const helpSource = await readFile(
  new URL("../src/workflow-help-content.ts", import.meta.url),
  "utf8",
);

test("Ingest keeps date evidence compact in the candidate overview", () => {
  assert.match(appSource, /<th scope="col">Date<\/th>/);
  assert.match(appSource, /ingest-date-evidence/);
  assert.match(appSource, /candidate\.dateCandidates\.join\(", "\)/);
  assert.doesNotMatch(appSource, /<th scope="col">Date evidence<\/th>/);
});

test("Staging uses metadata readiness icons and compact guarded update guidance", () => {
  assert.match(appSource, /<th scope="col">Metadata<\/th>/);
  assert.match(appSource, /staging-metadata-readiness-icon/);
  assert.match(appSource, /Guarded update/);
  assert.match(appSource, /staging-update-mode/);
  assert.match(appSource, /className="staging-release-row staging-release-row--clickable"/);
  assert.match(appSource, /tabIndex=\{0\}/);
});

test("Library offers in-session Rows Cards Tiles and Waveform views without a redundant metadata button", () => {
  assert.doesNotMatch(appSource, /LIBRARY_RELEASE_VIEW_STORAGE_KEY/);
  assert.doesNotMatch(appSource, /metadata-editor\.library-release-view/);
  assert.match(
    appSource,
    /useState<LibraryReleaseViewMode>\("tiles"\)/,
  );
  assert.match(appSource, /LIBRARY_RELEASE_SORT_STORAGE_KEY/);
  assert.match(appSource, /metadata-editor\.library-release-sort/);
  assert.match(appSource, /LibraryReleaseViewIcon/);
  assert.match(appSource, /\["rows", "Rows", "Dense column view"\]/);
  assert.match(appSource, /\["cards", "Cards", "Expanded release cards"\]/);
  assert.match(appSource, /\["tiles", "Tiles", "Artwork-first browsing"\]/);
  assert.match(appSource, /\["waveform", "Waveform", "Single-release artwork and waveform player"\]/);
  assert.match(appSource, /Metadata complete/);
  assert.match(appSource, /Library ready/);
  assert.doesNotMatch(appSource, />\s*View metadata\s*<\/button>/);
  assert.match(styleSource, /\.library-release-list--rows/);
  assert.match(styleSource, /\.library-release-list--tiles/);
});

test("Web Package keeps Ready Check read-only and compact", () => {
  const start = appSource.indexOf("function PublishWorkspace");
  const end = appSource.indexOf("function IngestView", start);

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  const publishSource = appSource.slice(start, end);

  assert.match(publishSource, /badge warning publish-read-only-status/);
  assert.match(publishSource, />\s*Ready Check · read-only\s*<\/span>/);
  assert.match(publishSource, /Ready Check is read-only/);
  assert.doesNotMatch(
    publishSource,
    /<div className="workflow-workspace-notice planned">\s*<strong>Preflight planning is read-only<\/strong>/,
  );
  assert.match(helpSource, /amber Ready Check · read-only status/);
});
