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

test("Tiles has a rich release detail tooltip with identity and source provenance", () => {
  assert.match(appSource, /library-tile-details-tooltip/);
  assert.match(appSource, /Release details/);
  assert.match(appSource, /Artist · \{releaseArtistName/);
  assert.match(appSource, /release\.tracks\.length/);
  assert.match(appSource, /release\.videos\.length/);
  assert.match(appSource, /<span>Library<\/span>/);
  assert.match(appSource, /release\.relativePath/);
  assert.match(appSource, /<span>Artwork<\/span>/);
  assert.match(appSource, /releaseArtwork\?\.relativePath/);
  assert.match(appSource, /Health &amp; provenance/);
});

test("Tiles hides persistent health badges from artwork and reveals them with tooltip hover or focus", () => {
  assert.match(
    styleSource,
    /\.library-tile-details-tooltip\s*\{\s*display:\s*none;/,
  );
  assert.match(
    styleSource,
    /\.library-release-list--tiles \.release-status-actions\s*\{[\s\S]*opacity:\s*0;[\s\S]*visibility:\s*hidden;/,
  );
  assert.match(
    styleSource,
    /\.library-release-list--tiles[\s\S]*\.library-release-card:hover[\s\S]*\.release-status-actions[\s\S]*opacity:\s*1;/,
  );
  assert.match(
    styleSource,
    /\.library-release-list--tiles[\s\S]*\.library-release-card:focus-within[\s\S]*\.release-status-actions/,
  );
});

test("Rows and Cards retain the shared status block while Help documents the Tiles-only presentation", () => {
  assert.match(appSource, /className="release-status-actions"/);
  assert.doesNotMatch(
    styleSource,
    /\.library-release-list--(?:rows|cards) \.release-status-actions\s*\{[\s\S]{0,120}?display:\s*none/,
  );
  assert.match(helpSource, /Rows and Cards keep their existing visible provenance and health information/);
  assert.match(helpSource, /Tiles keeps the album artwork clear at rest/);
});
