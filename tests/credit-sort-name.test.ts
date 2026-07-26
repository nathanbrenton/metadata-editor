import assert from "node:assert/strict";
import test from "node:test";

import {
  creditNamePathForSortNamePath,
  creditSortNamePathForNamePath,
  generateCreditSortName,
  resolveCreditSortName,
  synchronizeCreditSortName,
} from "../src/credit-sort-name.js";

test(
  "generates practical person and group sort names",
  () => {
    assert.equal(
      generateCreditSortName("Nathan Brenton"),
      "Brenton, Nathan",
    );
    assert.equal(
      generateCreditSortName("Martin Luther King Jr."),
      "King Jr., Martin Luther",
    );
    assert.equal(
      generateCreditSortName("Ludwig van Beethoven"),
      "van Beethoven, Ludwig",
    );
    assert.equal(
      generateCreditSortName("The Chemical Brothers"),
      "Chemical Brothers, The",
    );
    assert.equal(
      generateCreditSortName("Björk"),
      "Björk",
    );
  },
);

test(
  "preserves authored overrides and synchronizes generated values",
  () => {
    assert.equal(
      resolveCreditSortName(
        "Nathan Brenton",
        "Custom, Sort",
      ),
      "Custom, Sort",
    );
    assert.equal(
      resolveCreditSortName(
        "Nathan Brenton",
        "",
      ),
      "Brenton, Nathan",
    );
    assert.equal(
      synchronizeCreditSortName({
        previousName: "Nathan Brenton",
        nextName: "Nathaniel Brenton",
        currentSortName: "Brenton, Nathan",
      }),
      "Brenton, Nathaniel",
    );
    assert.equal(
      synchronizeCreditSortName({
        previousName: "Nathan Brenton",
        nextName: "Nathaniel Brenton",
        currentSortName: "NB",
      }),
      "NB",
    );
  },
);

test(
  "maps indexed credit name and sort-name paths",
  () => {
    assert.equal(
      creditSortNamePathForNamePath(
        "release.credits.songwriters[2].name",
      ),
      "release.credits.songwriters[2].sort_name",
    );
    assert.equal(
      creditNamePathForSortNamePath(
        "track.contributors[4].sort_name",
      ),
      "track.contributors[4].name",
    );
    assert.equal(
      creditSortNamePathForNamePath(
        "release.primary_artist.name",
      ),
      null,
    );
  },
);
