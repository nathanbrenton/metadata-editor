import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultLicenseValue,
  isLicenseMetadataPath,
} from "../shared/rights-defaults.js";

test(
  "uses one exact default license at release and track levels",
  () => {
    assert.equal(
      defaultLicenseValue,
      "All rights reserved.",
    );
    assert.equal(
      isLicenseMetadataPath(
        "release.rights.license",
      ),
      true,
    );
    assert.equal(
      isLicenseMetadataPath(
        "track.rights.license",
      ),
      true,
    );
    assert.equal(
      isLicenseMetadataPath(
        "track.rights.publisher",
      ),
      false,
    );
  },
);
