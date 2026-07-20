import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultTrackIdentityFieldPaths,
  defaultTrackOverviewFieldPaths,
  getDefaultTrackOverviewFieldOrder,
  getMissingTrackOverviewFieldPresentation,
  isDefaultTrackIdentityFieldPath,
  isDefaultTrackOverviewFieldPath,
  shouldShowDefaultTrackOverviewFields,
} from "../src/default-track-overview-fields.js";

test(
  "keeps the core musical-analysis fields discoverable in track Overview",
  () => {
    assert.deepEqual(
      defaultTrackOverviewFieldPaths,
      [
        "track.audio.bpm",
        "track.audio.key",
        "track.audio.camelot_key",
        "track.audio.time_signature",
        "track.audio.tuning_hz",
      ],
    );

    assert.equal(
      isDefaultTrackOverviewFieldPath(
        "track.audio.bpm",
      ),
      true,
    );
    assert.equal(
      isDefaultTrackOverviewFieldPath(
        "release.audio.bpm",
      ),
      false,
    );
  },
);

test(
  "keeps present and missing musical-analysis fields in one stable order",
  () => {
    const paths = [
      "track.audio.tuning_hz",
      "track.audio.bpm",
      "track.audio.time_signature",
      "track.audio.camelot_key",
      "track.audio.key",
    ].sort(
      (left, right) =>
        getDefaultTrackOverviewFieldOrder(
          left,
        ) -
        getDefaultTrackOverviewFieldOrder(
          right,
        ),
    );

    assert.deepEqual(
      paths,
      defaultTrackOverviewFieldPaths,
    );
    assert.equal(
      getDefaultTrackOverviewFieldOrder(
        "track.audio.unknown",
      ),
      Number.MAX_SAFE_INTEGER,
    );
  },
);

test(
  "shows default musical analysis only for track.toml Overview",
  () => {
    assert.equal(
      shouldShowDefaultTrackOverviewFields({
        scope: "track",
        filename: "track.toml",
        activeTab: "overview",
      }),
      true,
    );

    for (const context of [
      {
        scope: "release",
        filename: "release.toml",
        activeTab: "overview",
      },
      {
        scope: "track",
        filename: "track-credits.toml",
        activeTab: "overview",
      },
      {
        scope: "track",
        filename: "track.toml",
        activeTab: "rights",
      },
    ]) {
      assert.equal(
        shouldShowDefaultTrackOverviewFields(
          context,
        ),
        false,
      );
    }
  },
);

test(
  "presents a generated Camelot value as an overrideable default",
  () => {
    assert.deepEqual(
      getMissingTrackOverviewFieldPresentation({
        path: "track.audio.camelot_key",
        label: "Camelot Key",
        initialValue: "11A",
      }),
      {
        generatedValue: "11A",
        generatedNote: "Generated from Key",
        actionLabel: "Override Camelot Key",
      },
    );

    assert.deepEqual(
      getMissingTrackOverviewFieldPresentation({
        path: "track.audio.time_signature",
        label: "Time Signature",
        initialValue: "4/4",
      }),
      {
        generatedValue: null,
        generatedNote: null,
        actionLabel: "Add Time Signature",
      },
    );
  },
);


test(
  "keeps Track Sort Title discoverable as a track identity default",
  () => {
    assert.deepEqual(
      defaultTrackIdentityFieldPaths,
      ["track.sort_title"],
    );
    assert.equal(
      isDefaultTrackIdentityFieldPath(
        "track.sort_title",
      ),
      true,
    );
    assert.equal(
      isDefaultTrackIdentityFieldPath(
        "release.sort_title",
      ),
      false,
    );
  },
);
