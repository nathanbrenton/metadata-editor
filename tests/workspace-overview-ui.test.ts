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
  assert.match(appSource, /\["waveform", "Waveform", "Now Playing waveform and oscilloscope"\]/);
  assert.match(appSource, /Metadata complete/);
  assert.match(appSource, /Library ready/);
  assert.doesNotMatch(appSource, />\s*View metadata\s*<\/button>/);
  assert.match(styleSource, /\.library-release-list--rows/);
  assert.match(styleSource, /\.library-release-list--tiles/);
});

test("Library release detail keeps readiness in the sidebar and hides idle read-only status chrome", () => {
  assert.doesNotMatch(appSource, /<MetadataReadinessPanel/);
  assert.match(appSource, /showComplete/);
  assert.match(appSource, />\s*Metadata ✓\s*</);
  assert.doesNotMatch(appSource, /No filesystem writes/);
  assert.doesNotMatch(appSource, /Mode:\{" "\}/);
  assert.match(
    appSource,
    /\{\(isMetadataEmpty \|\| dirtyCount > 0\) && \(/,
  );
  assert.match(
    appSource,
    /editMode\s*\?\s*"Done editing"\s*:\s*"Edit metadata"/,
  );
});

test("Web Package keeps header status actionable and compact", () => {
  const start = appSource.indexOf("function PublishWorkspace");
  const end = appSource.indexOf("function IngestView", start);

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  const publishSource = appSource.slice(start, end);

  assert.match(
    publishSource,
    /presentation="web-package-header"/,
  );
  assert.doesNotMatch(
    publishSource,
    /badge warning publish-read-only-status/,
  );
  assert.doesNotMatch(
    publishSource,
    /Ready Check · read-only/,
  );
  assert.match(
    publishSource,
    /Target comparison · read-only/,
  );
  assert.doesNotMatch(
    publishSource,
    /<div className="workflow-workspace-notice planned">\s*<strong>Preflight planning is read-only<\/strong>/,
  );
  assert.doesNotMatch(
    helpSource,
    /amber Ready Check · read-only status/,
  );
  assert.match(
    helpSource,
    /non-blocking technical advisories appear as neutral technical notes/,
  );
});

test("Library release selection opens a browsing overview before the metadata editor", () => {
  assert.match(
    appSource,
    /useState<"overview" \| "metadata">\("overview"\)/,
  );
  assert.match(
    appSource,
    /function LibraryReleaseOverview/,
  );
  assert.match(
    appSource,
    /className="library-release-overview"/,
  );
  assert.match(
    appSource,
    />\s*Edit metadata\s*<\/button>/,
  );
  assert.match(
    appSource,
    /openReleaseOverview\(releaseId\)/,
  );
  assert.match(
    appSource,
    /openReleaseMetadata\(releaseId\)/,
  );
  assert.match(
    appSource,
    /selectedReleaseDetailMode === "metadata" \? \(/,
  );
  assert.match(
    appSource,
    /selectedReleaseDetailMode === "overview" \? \(/,
  );
  assert.match(
    styleSource,
    /\.library-release-overview-hero/,
  );
  assert.match(
    helpSource,
    /browsing-oriented Release overview/,
  );
});

test("Release overview uses track artwork as the play/pause control", () => {
  assert.match(
    appSource,
    /library-release-overview-track-artwork-button/,
  );
  assert.match(
    appSource,
    /library-release-overview-track-play-indicator/,
  );
  assert.match(
    appSource,
    /aria-label=\{`\$\{isPlaying \? "Pause" : "Play"\} \$\{title\}`\}/,
  );
  assert.match(
    appSource,
    /playback\.toggleTrack\(\s*trackKey,\s*playbackQueue,/,
  );
  assert.doesNotMatch(
    appSource,
    />\s*\{isPlaying \? "Pause" : "Play"\}\s*<\/button>/,
  );
  assert.match(
    styleSource,
    /\.library-release-overview-track-artwork-button/,
  );
  assert.match(appSource, /data-selected=\{isSelected \? "true" : "false"\}/);
  assert.match(appSource, /data-playing=\{isPlaying \? "true" : "false"\}/);
  assert.match(
    appSource,
    /onDoubleClick=[\s\S]*?playback\.playQueue\(\{[\s\S]*?autoplay:\s*true/,
  );
  assert.match(appSource, /event\.stopPropagation\(\)/);
  assert.match(
    styleSource,
    /li\[data-playable="true"\][\s\S]*?user-select:\s*none;/,
  );
  assert.match(
    styleSource,
    /li\[data-playing="true"\]:hover[\s\S]*?background:\s*var\(--library-track-playing-bg\)/,
  );
});
