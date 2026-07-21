import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getPatternMetadataHelpCommonValues,
  productionTypeCommonValues,
} from "../src/metadata-help-common-values.js";

const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);

test(
  "offers practical production-type guidance without network lookup",
  () => {
    for (const value of [
      "studio recording",
      "home recording",
      "rehearsal",
      "jam session",
      "field recording",
      "archive transfer",
    ]) {
      assert.equal(
        (
          productionTypeCommonValues as readonly string[]
        ).includes(value),
        true,
      );
    }

    assert.deepEqual(
      getPatternMetadataHelpCommonValues(
        "production.production_type",
      ),
      [...productionTypeCommonValues],
    );
  },
);

test(
  "provides reusable common values for language script country and production paths",
  () => {
    assert.equal(
      getPatternMetadataHelpCommonValues(
        "track.text.lyrics_language",
      ).includes("en"),
      true,
    );
    assert.equal(
      getPatternMetadataHelpCommonValues(
        "track.text.lyrics_script",
      ).includes("Latn"),
      true,
    );
    assert.equal(
      getPatternMetadataHelpCommonValues(
        "production.location_type",
      ).includes("home studio"),
      true,
    );
    assert.equal(
      getPatternMetadataHelpCommonValues(
        "release.country",
      ).includes("US"),
      true,
    );
  },
);

test(
  "places common values first and integrates examples into value guidance",
  () => {
    const commonValuesIndex = appSource.indexOf(
      "<h4>Common values</h4>",
    );
    const valueGuidanceIndex = appSource.indexOf(
      "<h4>Value guidance</h4>",
    );
    const aboutIndex = appSource.indexOf(
      "<h4>About this field</h4>",
    );

    assert.notEqual(commonValuesIndex, -1);
    assert.notEqual(valueGuidanceIndex, -1);
    assert.notEqual(aboutIndex, -1);
    assert.equal(
      commonValuesIndex < valueGuidanceIndex,
      true,
    );
    assert.equal(
      valueGuidanceIndex < aboutIndex,
      true,
    );
    assert.match(
      appSource,
      /metadata-field-value-guidance[\s\S]*<h5>Examples<\/h5>/,
    );
    assert.doesNotMatch(
      appSource,
      /<section className="metadata-field-guidance metadata-field-examples">\s*<h4>Example<\/h4>/,
    );
  },
);

test(
  "collapses technical details in single-field and paired-field help",
  () => {
    const disclosures = appSource.match(
      /metadata-help-technical-disclosure/g,
    );

    assert.ok(disclosures);
    assert.equal(disclosures.length >= 2, true);
    assert.doesNotMatch(
      appSource,
      /<section className="metadata-field-guidance metadata-field-technical-details">/,
    );
    assert.match(
      appSource,
      /Canonical path, data type, and field behavior/,
    );
    assert.match(
      appSource,
      /Canonical paths, data types, and field behavior/,
    );
  },
);
