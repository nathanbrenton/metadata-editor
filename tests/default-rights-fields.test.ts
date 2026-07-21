import assert from "node:assert/strict";
import test from "node:test";

import {
  isDefaultRightsFieldPath,
  releaseDefaultRightsFieldPaths,
  shouldShowDefaultRightsFields,
  trackDefaultRightsFieldPaths,
} from "../src/default-rights-fields.js";

test(
  "keeps release business and rights fields discoverable before they are authored",
  () => {
    assert.deepEqual(
      releaseDefaultRightsFieldPaths,
      [
        "release.rights.copyright",
        "release.rights.phonographic_copyright",
        "release.rights.publisher",
        "release.rights.label",
        "release.rights.distributor",
        "release.rights.license",
      ],
    );
  },
);

test(
  "keeps inheritable track rights fields discoverable",
  () => {
    assert.equal(
      trackDefaultRightsFieldPaths.includes(
        "track.rights.phonographic_copyright",
      ),
      true,
    );
    assert.equal(
      trackDefaultRightsFieldPaths.includes(
        "track.rights.license",
      ),
      true,
    );
    assert.equal(
      isDefaultRightsFieldPath(
        "track",
        "release.rights.label",
      ),
      false,
    );
  },
);

test(
  "shows default rights only in the canonical release or track document",
  () => {
    assert.equal(
      shouldShowDefaultRightsFields({
        scope: "release",
        filename: "release.toml",
        activeTab: "rights",
      }),
      true,
    );
    assert.equal(
      shouldShowDefaultRightsFields({
        scope: "track",
        filename: "track.toml",
        activeTab: "rights",
      }),
      true,
    );
    assert.equal(
      shouldShowDefaultRightsFields({
        scope: "track",
        filename: "track-credits.toml",
        activeTab: "rights",
      }),
      false,
    );
  },
);
