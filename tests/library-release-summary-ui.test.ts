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

test("shows the authored release title and artist in Library rows", () => {
  assert.match(
    appSource,
    /resolveReleaseDisplayTitle\(\s*release\.releaseTitle,\s*formatReleaseTitle\(release\.id\)/,
  );
  assert.match(
    appSource,
    /className=\{`release-artist\$\{[\s\S]*?Artist not set/,
  );
  assert.match(
    appSource,
    /releaseArtistName \|\| "Artist not set"/,
  );
});

test("styles the artist as a distinct truncated sub-header", () => {
  assert.match(
    styleSource,
    /\.release-artist\s*\{[\s\S]*?font-size:\s*0\.88rem;[\s\S]*?font-weight:/,
  );
  assert.match(
    styleSource,
    /\.release-artist,\s*\.release-subtitle\s*\{[\s\S]*?text-overflow:\s*ellipsis;/,
  );
  assert.match(
    styleSource,
    /\.release-artist\.missing\s*\{/,
  );
});
