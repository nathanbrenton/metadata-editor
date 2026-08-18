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

test("direct release navigation cannot retain the Artists Library subview", () => {
  const start = appSource.indexOf(
    "const openReleaseInLibrary = useCallback",
  );
  const end = appSource.indexOf(
    "const openReleaseMetadataAtTarget",
    start,
  );

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);

  const source = appSource.slice(start, end);
  assert.match(source, /setLibraryEntityView\("releases"\)/);
  assert.match(source, /setSelectedLibraryArtistId\(null\)/);
  assert.match(source, /setApplicationView\("library"\)/);
  assert.match(
    appSource,
    /const openReleaseOverviewInLibrary = useCallback[\s\S]*?setLibraryEntityView\("releases"\)[\s\S]*?setSelectedLibraryArtistId\(null\)[\s\S]*?await openReleaseOverview\(releaseId\)/,
  );
  assert.match(
    appSource,
    /onOpenRelease=\{\(releaseId\) =>[\s\S]*?openReleaseOverviewInLibrary\([\s\S]*?releaseId/,
  );
});

test("Waveform view has an explicit Releases action that returns to tiles", () => {
  assert.match(
    appSource,
    /viewMode === "waveform"[\s\S]*?className="secondary-button library-waveform-release-back-button"[\s\S]*?onClick=\{\(\) => chooseViewMode\("tiles"\)\}[\s\S]*?← Releases/,
  );
  assert.match(
    styleSource,
    /\.library-waveform-release-back-button\s*\{/,
  );
});
