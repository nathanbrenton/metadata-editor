import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(new URL("../src/App.tsx", import.meta.url), "utf8");
const styleSource = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
const helpSource = await readFile(new URL("../src/workflow-help-content.ts", import.meta.url), "utf8");
const packageSource = await readFile(new URL("../package.json", import.meta.url), "utf8");

test("Library exposes Releases and first-class Artists without inventing a sixth workflow stage", () => {
  assert.match(appSource, /type LibraryEntityView = "releases" \| "artists"/);
  assert.match(appSource, /aria-label="Library entity"/);
  assert.match(appSource, />\s*Releases\s*</);
  assert.match(appSource, />\s*Artists\s*</);
  assert.match(appSource, /function LibraryArtistRoster/);
  assert.match(appSource, /hiplingo-artwork-fallback/);
  assert.match(appSource, /src=\{hiplingoLogoUrl\}/);
  assert.doesNotMatch(appSource, /No artist photos yet/);
  assert.match(appSource, /selectedArtistId=\{selectedLibraryArtistId\}/);
  assert.match(appSource, /onSelectedArtistIdChange=\{setSelectedLibraryArtistId\}/);
  assert.match(appSource, /releases=\{associatedReleases\}/);
  assert.match(appSource, /heading=\{`\$\{selectedArtist\.displayName\} releases`\}/);
  assert.match(appSource, /viewMode=\{artistReleaseViewMode\}/);
  assert.match(appSource, /onViewModeChange=\{setArtistReleaseViewMode\}/);
  assert.match(appSource, /library-artist-release-browser-section/);
  assert.match(styleSource, /\.library-entity-switcher/);
  assert.match(styleSource, /\.library-artist-roster/);
  assert.match(helpSource, /first-class Artist identities/);
  assert.match(helpSource, /release artwork never substitutes for an Artist photo/);
});

test("Artist migration is explicit plan/apply CLI work and not part of application startup", () => {
  assert.match(packageSource, /"migrate:artists": "tsx scripts\/migrate-artists\.ts"/);
  assert.doesNotMatch(appSource, /migrate-artists/);
});


test("Library metadata drill-down preserves the browser context that opened it", () => {
  assert.match(appSource, /const returnToLibraryContext = useCallback/);
  assert.match(appSource, /onBack=\{returnToLibraryContext\}/);

  const start = appSource.indexOf(
    "const returnToLibraryContext",
  );
  const end = appSource.indexOf(
    "const returnToLibraryHome",
    start,
  );

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  const contextSource = appSource.slice(start, end);

  assert.doesNotMatch(
    contextSource,
    /setLibraryEntityView/,
  );
  assert.doesNotMatch(
    contextSource,
    /setLibraryReleaseViewMode/,
  );
  assert.doesNotMatch(
    contextSource,
    /setArtistReleaseViewMode/,
  );
});
