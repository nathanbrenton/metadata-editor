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

test("selected release Artist name navigates to the canonical Library Artist", () => {
  assert.match(
    appSource,
    /function LibraryReleaseOverview\(\{[\s\S]*?artists,[\s\S]*?onOpenArtist,[\s\S]*?artists: ArtistScanResult\[\][\s\S]*?onOpenArtist: \(artistId: string\) => void/,
  );

  assert.match(
    appSource,
    /const releaseArtist =[\s\S]*?artists\.find\([\s\S]*?artist\.id === release\.primaryArtistId[\s\S]*?artist\.displayName === release\.primaryArtistName\.trim\(\)/,
  );

  assert.match(
    appSource,
    /className="library-release-overview-artist-link"[\s\S]*?onClick=\{\(\) => onOpenArtist\(releaseArtist\.id\)\}/,
  );

  assert.match(
    appSource,
    /<LibraryReleaseOverview[\s\S]*?artists=\{[^}]+\}[\s\S]*?onOpenArtist=\{openArtistInLibrary\}/,
  );

  assert.match(
    styleSource,
    /\.library-release-overview-artist-link\s*\{/,
  );
});

test("missing canonical Artist remains non-clickable instead of guessing identity", () => {
  assert.match(
    appSource,
    /No canonical Artist profile is registered for this release yet\./,
  );
  assert.match(
    appSource,
    /releaseArtist \? \([\s\S]*?library-release-overview-artist-link[\s\S]*?\) : \([\s\S]*?<span/,
  );
});
