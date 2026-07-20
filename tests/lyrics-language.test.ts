import assert from "node:assert/strict";
import test from "node:test";

import {
  lyricsMetadataGroupOrder,
  resolveEffectiveLyricsLanguage,
  resolveEffectiveTrackLanguage,
} from "../src/lyrics-language.js";

test(
  "orders lyrics before language and lyrics-specific rights",
  () => {
    assert.deepEqual(
      lyricsMetadataGroupOrder,
      [
        "Lyrics",
        "Language & Writing System",
        "Lyrics Rights & Source",
      ],
    );
  },
);

test(
  "prefers a local Track Language over the release language",
  () => {
    assert.deepEqual(
      resolveEffectiveTrackLanguage({
        trackLanguage: "es",
        releaseLanguage: "en",
      }),
      {
        value: "es",
        source: "Track Language",
      },
    );
  },
);

test(
  "uses Release Language when Track Language has no local value",
  () => {
    assert.deepEqual(
      resolveEffectiveTrackLanguage({
        trackLanguage: "",
        releaseLanguage: "en",
      }),
      {
        value: "en",
        source: "Release Language",
      },
    );
  },
);

test(
  "generates Lyrics Language from effective Track Language until overridden",
  () => {
    assert.deepEqual(
      resolveEffectiveLyricsLanguage({
        lyricsLanguage: "",
        trackLanguage: "",
        releaseLanguage: "en",
      }),
      {
        value: "en",
        source: "Track Language",
        generated: true,
      },
    );

    assert.deepEqual(
      resolveEffectiveLyricsLanguage({
        lyricsLanguage: "es",
        trackLanguage: "en",
        releaseLanguage: "en",
      }),
      {
        value: "es",
        source: "Lyrics Language",
        generated: false,
      },
    );
  },
);
