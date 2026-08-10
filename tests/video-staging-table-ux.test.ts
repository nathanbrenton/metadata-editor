import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const builderSource = readFileSync(
  new URL("../src/IngestReleaseBuilder.tsx", import.meta.url),
  "utf8",
);
const sharedBuilderSource = readFileSync(
  new URL("../shared/ingest-builder.ts", import.meta.url),
  "utf8",
);
const serverBuilderSource = readFileSync(
  new URL("../server/ingest-builder.ts", import.meta.url),
  "utf8",
);

test("keeps the Staging video table compact and hides managed stable identity", () => {
  assert.doesNotMatch(
    builderSource,
    /<th scope="col">Stable video ID<\/th>/,
  );
  assert.match(
    builderSource,
    /reviewSourceFilename\(video\.sourceRelativePath\)/,
  );
  assert.match(
    builderSource,
    /title=\{video\.sourceRelativePath\}/,
  );
  assert.match(
    builderSource,
    /ingest-video-path-disclosure/,
  );
});

test("offers human-readable video type suggestions", () => {
  for (const value of [
    "music video",
    "promo video",
    "behind the scenes",
    "social media post",
    "social media short",
    "social media reel",
    "social media story",
    "bonus content",
    "other",
  ]) {
    assert.match(
      sharedBuilderSource,
      new RegExp(`"${value}"`),
    );
  }
});

test("allows video-only revisions to relate to canonical Library tracks", () => {
  assert.match(builderSource, /existingTrackOptions\.map/);
  assert.match(builderSource, /relatedTrackId/);
  assert.match(serverBuilderSource, /trackById/);
  assert.match(serverBuilderSource, /video\.relatedTrackId/);
});
