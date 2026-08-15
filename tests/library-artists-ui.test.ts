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
  assert.match(appSource, /Associated releases/);
  assert.match(styleSource, /\.library-entity-switcher/);
  assert.match(styleSource, /\.library-artist-roster/);
  assert.match(helpSource, /first-class Artist identities/);
  assert.match(helpSource, /release artwork never substitutes for an Artist photo/);
});

test("Artist migration is explicit plan/apply CLI work and not part of application startup", () => {
  assert.match(packageSource, /"migrate:artists": "tsx scripts\/migrate-artists\.ts"/);
  assert.doesNotMatch(appSource, /migrate-artists/);
});
