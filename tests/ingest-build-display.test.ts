import assert from "node:assert/strict";
import test from "node:test";

import {
  stagingDestinationPathForDisplay,
} from "../src/ingest-build-display.js";

const releaseRoot =
  "releases/2014-07-05_summer-graffiti";

test(
  "shows build-plan destinations relative to the displayed release root",
  () => {
    assert.equal(
      stagingDestinationPathForDisplay(
        `${releaseRoot}/tracks/crazy-eights_01_summer-graffiti/audio-master.m4a`,
        releaseRoot,
      ),
      "tracks/crazy-eights_01_summer-graffiti/audio-master.m4a",
    );

    assert.equal(
      stagingDestinationPathForDisplay(
        `${releaseRoot}/release.toml`,
        releaseRoot,
      ),
      "release.toml",
    );

    assert.equal(
      stagingDestinationPathForDisplay(
        releaseRoot,
        releaseRoot,
      ),
      ".",
    );
  },
);

test(
  "normalizes separators without hiding an unexpected outside destination",
  () => {
    assert.equal(
      stagingDestinationPathForDisplay(
        ".\\releases\\2014-07-05_summer-graffiti\\artwork\\front\\artwork-master.png",
        `${releaseRoot}/`,
      ),
      "artwork/front/artwork-master.png",
    );

    assert.equal(
      stagingDestinationPathForDisplay(
        "releases/another-release/release.toml",
        releaseRoot,
      ),
      "releases/another-release/release.toml",
    );
  },
);
