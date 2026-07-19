import assert from "node:assert/strict";
import test from "node:test";

import {
  formatTrackDisplayTitle,
  inferTrackTitleMetadata,
  recommendedTrackVersionOptions,
} from "../shared/track-title.js";

test(
  "formats display titles from base title and local version",
  () => {
    assert.equal(
      formatTrackDisplayTitle(
        "Angel",
        "",
      ),
      "Angel",
    );
    assert.equal(
      formatTrackDisplayTitle(
        "Nebula",
        "Original Mix",
      ),
      "Nebula (Original Mix)",
    );
  },
);

test(
  "does not duplicate a version already present in the title",
  () => {
    assert.equal(
      formatTrackDisplayTitle(
        "Nebula (Original Mix)",
        "Original Mix",
      ),
      "Nebula (Original Mix)",
    );
    assert.equal(
      formatTrackDisplayTitle(
        "Signal Radio Edit",
        "Radio Edit",
      ),
      "Signal Radio Edit",
    );
  },
);

test(
  "infers a recommended version suffix from a folder-derived title",
  () => {
    assert.deepEqual(
      inferTrackTitleMetadata(
        "Nebula Original Mix",
        "Nebula Remixes",
      ),
      {
        title: "Nebula",
        version: "Original Mix",
        displayTitle:
          "Nebula (Original Mix)",
      },
    );
  },
);

test(
  "uses the release-title base for a custom remix suffix",
  () => {
    assert.deepEqual(
      inferTrackTitleMetadata(
        "Nebula Nathan Brenton Remix",
        "Nebula Remixes",
      ),
      {
        title: "Nebula",
        version:
          "Nathan Brenton Remix",
        displayTitle:
          "Nebula (Nathan Brenton Remix)",
      },
    );
  },
);

test(
  "keeps a simple title simple",
  () => {
    assert.deepEqual(
      inferTrackTitleMetadata("Angel"),
      {
        title: "Angel",
        version: "",
        displayTitle: "Angel",
      },
    );
  },
);

test(
  "offers requested recommended track versions",
  () => {
    for (const value of [
      "Original Version",
      "Original Mix",
      "Clean",
      "Radio Edit",
    ]) {
      assert.equal(
        recommendedTrackVersionOptions.some(
          (option) => option === value,
        ),
        true,
      );
    }
  },
);
