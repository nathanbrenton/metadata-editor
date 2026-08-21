import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  getReleaseAboutProfileSuggestions,
  getReleaseAboutSuggestions,
} from "../src/release-about-generator.js";

const generatorSource = await readFile(
  new URL(
    "../src/ReleaseAboutGenerator.tsx",
    import.meta.url,
  ),
  "utf8",
);

const styles = await readFile(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);

test("template fields expose relevant values selected in the Release Profile", () => {
  const profile = {
    genres: [
      "Alternative Rock",
      "Electronica",
    ],
    instrumentation: [
      "live drums",
      "synthesizer performance",
    ],
    elements: [
      "synth bass",
    ],
    "harmony-theory": [
      "riff-based harmony",
    ],
    qualities: [
      "raw",
      "spacious",
      "kinetic",
    ],
    "moods-emotions": [
      "rebellious",
    ],
  };

  assert.deepEqual(
    getReleaseAboutProfileSuggestions(
      "instrument 1",
      profile,
    ),
    [
      "live drums",
      "synthesizer performance",
      "synth bass",
    ],
  );

  assert.deepEqual(
    getReleaseAboutProfileSuggestions(
      "reference category A",
      profile,
    ),
    [
      "Alternative Rock",
      "Electronica",
    ],
  );

  assert.deepEqual(
    getReleaseAboutProfileSuggestions(
      "rhythmic / harmonic characteristic",
      profile,
    ),
    [
      "riff-based harmony",
    ],
  );
});

test("three-adjective profile choices include a ready-made combination and editable individual values", () => {
  const result =
    getReleaseAboutProfileSuggestions(
      "three-adjective",
      {
        qualities: [
          "raw",
          "spacious",
        ],
        "moods-emotions": [
          "rebellious",
          "hopeful",
        ],
      },
    );

  assert.equal(
    result[0],
    "raw, spacious, rebellious",
  );
  assert.ok(result.includes("raw"));
  assert.ok(result.includes("hopeful"));
});

test("identity fields are not polluted with Artist or Release profile choices", () => {
  const profile = {
    identity: [
      "emotionally direct songwriting",
    ],
  };

  assert.deepEqual(
    getReleaseAboutProfileSuggestions(
      "Artist",
      profile,
    ),
    [],
  );
  assert.deepEqual(
    getReleaseAboutProfileSuggestions(
      "Release",
      profile,
    ),
    [],
  );
  assert.deepEqual(
    getReleaseAboutProfileSuggestions(
      "number",
      profile,
    ),
    [],
  );
});

test("the full legacy suggestion vocabulary remains available independently", () => {
  const more =
    getReleaseAboutSuggestions(
      "reference category A",
    );

  assert.ok(more.length > 0);
  assert.ok(
    more.includes("progressive rock") ||
      more.includes("Progressive Rock"),
  );
});

test("About Template renders Release Profile choices plus a complete More menu", () => {
  assert.match(
    generatorSource,
    /getReleaseAboutProfileSuggestions/,
  );
  assert.match(
    generatorSource,
    /Release Profile choices for \$\{placeholder\}/,
  );
  assert.match(
    generatorSource,
    /<option value="">Profile…<\/option>/,
  );
  assert.match(
    generatorSource,
    /aria-label=\{`More suggestions for \$\{placeholder\}`\}/,
  );
  assert.match(
    generatorSource,
    /<option value="">More…<\/option>/,
  );
  assert.doesNotMatch(
    generatorSource,
    /Choose a suggestion…/,
  );
});

test("template choice menus share a compact two-column row with mobile fallback", () => {
  assert.match(
    styles,
    /\.release-about-generator__choice-row\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/,
  );
  assert.match(
    styles,
    /\.release-about-generator__profile-select/,
  );
  assert.match(
    styles,
    /@media \(max-width:\s*52rem\)[\s\S]*?\.release-about-generator__choice-row\s*\{[\s\S]*?grid-template-columns:\s*1fr/,
  );
});
