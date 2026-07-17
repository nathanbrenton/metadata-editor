import assert from "node:assert/strict";
import test from "node:test";

import {
  getReleaseNumberingTotalsFromChanges,
} from "../server/numbering-sync.js";

test(
  "extracts authoritative release numbering totals",
  () => {
    assert.deepEqual(
      getReleaseNumberingTotalsFromChanges([
        {
          path:
            "release.numbering.track_total",
          value: 5,
        },
        {
          path:
            "release.numbering.disc_total",
          value: 1,
        },
        {
          path: "release.title",
          value: "Nebula Remixes",
        },
      ]),
      {
        trackTotal: 5,
        discTotal: 1,
      },
    );
  },
);

test(
  "ignores non-positive and unrelated numbering changes",
  () => {
    assert.deepEqual(
      getReleaseNumberingTotalsFromChanges([
        {
          path:
            "track.numbering.track_total",
          value: 7,
        },
        {
          path:
            "release.numbering.disc_total",
          value: 0,
        },
      ]),
      {},
    );
  },
);
