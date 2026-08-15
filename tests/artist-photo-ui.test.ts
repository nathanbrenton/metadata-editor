import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const serverSource = await readFile(
  new URL("../server/index.ts", import.meta.url),
  "utf8",
);
const assetSource = await readFile(
  new URL("../server/artist-assets.ts", import.meta.url),
  "utf8",
);
const styleSource = await readFile(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);

test("Library Artist detail assigns ingest-drop photos without reusing release artwork", () => {
  assert.match(appSource, /Primary Artist Photo/);
  assert.match(appSource, /Artist Photos/);
  assert.match(appSource, /Artist Bio \/ Info/);
  assert.match(appSource, /Save Artist bio/);
  assert.match(appSource, /\/api\/library\/save-artist-bio/);
  assert.match(appSource, />\s*Add Photo\s*</);
  assert.match(appSource, /Make imported photo Primary/);
  assert.match(appSource, /First Artist photo becomes Primary/);
  assert.match(appSource, /\/api\/library\/artist-photo-candidates/);
  assert.match(appSource, /\/api\/library\/import-artist-photo/);
  assert.match(appSource, /\/api\/library\/set-primary-artist-photo/);
  assert.match(appSource, /\/api\/library\/remove-artist-photo/);
  assert.match(appSource, /artworkPreviewUrl\(primaryAsset\.relativePath\)/);
  assert.match(appSource, /buildIngestArtworkPreviewUrl/);
  assert.match(
    appSource,
    /className="library-artist-photo-candidate-image-button"[\s\S]*onClick=\{\(\) => void importPhoto\(candidate\)\}/,
  );
  assert.match(
    appSource,
    /aria-label=\{`Add \$\{candidate\.filename\} to \$\{selectedArtist\.displayName\}`\}/,
  );
  assert.doesNotMatch(
    appSource,
    />Add to Artist<|: "Add to Artist"/,
  );
  assert.doesNotMatch(
    appSource,
    />\s*Set Primary\s*</,
  );
  assert.match(
    appSource,
    /library-artist-asset-preview-button[\s\S]*onClick=\{\(\) => void choosePrimaryPhoto\(asset\)\}/,
  );
  assert.match(
    appSource,
    /window\.confirm\([\s\S]*canonical source will be archived/,
  );
  assert.match(
    appSource,
    /This is the Primary Artist photo[\s\S]*no Primary photo/,
  );
  assert.match(
    appSource,
    /library-artist-asset-remove-button/,
  );
  assert.match(
    appSource,
    /Artist-scoped canonical sources/,
  );
  assert.match(
    appSource,
    /Click an alternate photo to make it Primary/,
  );
  assert.doesNotMatch(
    appSource,
    /primaryAsset.*release\.artworkMasters|release\.artworkMasters.*primaryAsset/,
  );
  assert.match(styleSource, /\.library-artist-detail-grid/);
  assert.match(styleSource, /\.library-artist-photo-candidate-grid/);
});

test("Artist-photo API keeps source implementation private to metadata-editor", () => {
  assert.match(serverSource, /\/api\/library\/save-artist-bio/);
  assert.match(serverSource, /\/api\/library\/artist-photo-candidates/);
  assert.match(serverSource, /\/api\/library\/import-artist-photo/);
  assert.match(serverSource, /\/api\/library\/set-primary-artist-photo/);
  assert.match(serverSource, /\/api\/library\/remove-artist-photo/);
  assert.match(assetSource, /saveArtistBio/);
  assert.match(assetSource, /metadata-backups/);
  assert.match(assetSource, /source_filename/);
  assert.match(assetSource, /sha256/);
  assert.match(assetSource, /same source bytes/);
  assert.match(assetSource, /\.asset-trash/);
  assert.match(
    assetSource,
    /delete artistTable\.primary_asset_id/,
  );
  assert.doesNotMatch(
    assetSource,
    /Primary Artist photo cannot be removed/,
  );
  assert.match(assetSource, /copyFile\(/);
  assert.match(assetSource, /assertPathWithinIngestRoot/);
  assert.match(assetSource, /assertPathWithinRoot/);
  assert.doesNotMatch(assetSource, /published-media|hiplingo|hls\.js/i);
});
