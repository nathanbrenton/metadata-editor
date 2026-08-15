import assert from "node:assert/strict";
import {
  readFile,
} from "node:fs/promises";
import test from "node:test";

const app = await readFile(
  new URL(
    "../src/App.tsx",
    import.meta.url,
  ),
  "utf8",
);
const server = await readFile(
  new URL(
    "../server/index.ts",
    import.meta.url,
  ),
  "utf8",
);
const fleet = await readFile(
  new URL(
    "../server/publish-fleet.ts",
    import.meta.url,
  ),
  "utf8",
);
const deployment = await readFile(
  new URL(
    "../server/published-media-deployment.ts",
    import.meta.url,
  ),
  "utf8",
);
const publication = await readFile(
  new URL(
    "../server/artist-publication.ts",
    import.meta.url,
  ),
  "utf8",
);
const help = await readFile(
  new URL(
    "../src/workflow-help-content.ts",
    import.meta.url,
  ),
  "utf8",
);

test("Web Package exposes a first-class complete Artist snapshot", () => {
  assert.match(
    fleet,
    /buildArtistPublicationPlan/,
  );
  assert.match(
    app,
    /Artist Web Package/,
  );
  assert.match(
    app,
    /Prepare Artist Snapshot/,
  );
  assert.match(
    app,
    /Prepare Artist Updates/,
  );
  assert.match(
    app,
    /\/api\/publish\/artists-build/,
  );
  assert.match(
    app,
    /Artists · selection follows releases/,
  );
  assert.match(
    app,
    /includedReleaseCount/,
  );
  assert.match(
    app,
    /Artist inclusion follows the Public release set automatically/,
  );
  assert.doesNotMatch(
    app,
    /Add Artists to Web Package/,
  );
  assert.match(
    publication,
    /listPublicCatalogMembership/,
  );
  assert.match(
    publication,
    /scanMediaLibrary/,
  );
  assert.match(
    publication,
    /published-only-release-primary-artist-id-unresolved/,
  );
  assert.match(
    publication,
    /release\.primary_artist\.id/,
  );
  assert.match(
    server,
    /\/api\/publish\/artists-plan/,
  );
  assert.match(
    server,
    /\/api\/publish\/artists-build/,
  );
});

test("Artist publication is sanitized, WebP-only, and complete-snapshot based", () => {
  assert.match(
    publication,
    /hiplingo-artist-catalog/,
  );
  assert.match(
    publication,
    /hiplingo-artist/,
  );
  assert.match(
    publication,
    /artist-publication-manifest\.json/,
  );
  assert.match(
    publication,
    /libwebp/,
  );
  assert.match(
    publication,
    /force_original_aspect_ratio=decrease/,
  );
  assert.match(
    publication,
    /min\(iw,1920\)/,
  );
  assert.match(
    publication,
    /min\(ih,1080\)/,
  );
  assert.match(
    publication,
    /does not silently fall back to PNG/,
  );
  assert.match(
    publication,
    /targetNames = \[[\s\S]*artistsDirectoryName[\s\S]*artistCatalogFilename[\s\S]*artistManifestFilename/,
  );
});

test("deployment integrity accepts only a verified Artist snapshot", () => {
  assert.match(
    deployment,
    /artistsDirectoryName = "artists"/,
  );
  assert.match(
    deployment,
    /artistCatalogFilename = "artists\.json"/,
  );
  assert.match(
    deployment,
    /artistManifestFilename/,
  );
  assert.match(
    deployment,
    /verifyPublishedArtistSnapshot/,
  );
  assert.match(
    deployment,
    /artist-package-integrity-failed/,
  );
});

test("Workflow Help documents removal cleanup and consumer-side brand fallback", () => {
  assert.match(
    help,
    /Removing a canonical Artist photo cleans artist\.toml immediately/,
  );
  assert.match(
    help,
    /replaces the complete public Artist snapshot, removing its JSON reference and stale WebP/,
  );
  assert.match(
    help,
    /shared Hiplingo brand fallback as UI chrome/,
  );
  assert.match(
    help,
    /primary_artist\.id/,
  );
});
