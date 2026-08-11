import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appSource = readFileSync(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const builderSource = readFileSync(
  new URL("../src/IngestReleaseBuilder.tsx", import.meta.url),
  "utf8",
);
const scannerSource = readFileSync(
  new URL("../server/scanner.ts", import.meta.url),
  "utf8",
);
const ingestBuilderServerSource = readFileSync(
  new URL("../server/ingest-builder.ts", import.meta.url),
  "utf8",
);
const typesSource = readFileSync(
  new URL("../server/types.ts", import.meta.url),
  "utf8",
);

test("Ingest separates source identity from the target Library release", () => {
  assert.match(appSource, /Target release/);
  assert.match(appSource, /Existing Library release/);
  assert.match(appSource, /New release/);
  assert.match(appSource, /Auto/);
  assert.match(
    appSource,
    /Source-folder naming is evidence only and never determines the destination by itself/,
  );
  assert.match(
    appSource,
    /releases=\{scan\?\.releases \?\? \[\]\}/,
  );
});

test("manual or automatic existing targets carry canonical release identity into Staging", () => {
  assert.match(
    appSource,
    /buildExistingReleaseIdentitySeed/,
  );
  assert.match(
    appSource,
    /evidence:\s*identityOverride\.evidence/,
  );
  assert.match(
    builderSource,
    /identitySeed\?\.targetReleaseId/,
  );
  assert.match(
    builderSource,
    /releaseTitle:\s*existing\.title/,
  );
  assert.match(
    builderSource,
    /releaseDate:\s*existing\.date/,
  );
  assert.match(
    builderSource,
    /releaseType:\s*existing\.type/,
  );
});

test("Library scan exposes canonical release date and type for target selection", () => {
  assert.match(typesSource, /releaseDate\?: string/);
  assert.match(typesSource, /releaseType\?: string/);
  assert.match(
    scannerSource,
    /releaseDate = readNonBlankString/,
  );
  assert.match(
    scannerSource,
    /releaseType = readNonBlankString/,
  );
});


test("Staging refreshes an explicit target from current canonical TOML rather than stale ingest identity", () => {
  assert.match(
    ingestBuilderServerSource,
    /existingReleaseMetadataValues\["release\.title"\]/,
  );
  assert.match(
    ingestBuilderServerSource,
    /"release\.primary_artist\.name"/,
  );
  assert.match(
    ingestBuilderServerSource,
    /"release\.dates\.release"/,
  );
  assert.match(
    ingestBuilderServerSource,
    /"release\.type"/,
  );
});
