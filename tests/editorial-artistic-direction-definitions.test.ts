import assert from "node:assert/strict";
import test from "node:test";

import {
  getEditorialDescriptorBrowserDefinition,
} from "../src/editorial-descriptor-browser.js";
import {
  getEditorialSharedLexicalDefinition,
} from "../src/editorial-descriptor-knowledge.js";
import {
  releaseDescriptorOntology,
} from "../src/release-descriptor-ontology.js";

const directions =
  releaseDescriptorOntology.filter(
    (descriptor) =>
      descriptor.category === "direction",
  );

test("every Artistic direction descriptor has a direct curated definition", () => {
  assert.equal(directions.length, 54);

  for (const descriptor of directions) {
    const lexical =
      getEditorialSharedLexicalDefinition(
        descriptor.label,
      );

    assert.ok(
      lexical,
      `missing direction definition: ${descriptor.label}`,
    );

    assert.equal(
      getEditorialDescriptorBrowserDefinition(
        descriptor,
      ),
      lexical,
    );

    assert.ok(
      lexical.length >= 80,
      `definition is too thin: ${descriptor.label}`,
    );
  }
});

test("Artistic direction definitions do not repeat generic orientation boilerplate", () => {
  for (const descriptor of directions) {
    const definition =
      getEditorialDescriptorBrowserDefinition(
        descriptor,
      );

    assert.doesNotMatch(
      definition,
      /describing how the project is moving or changing/i,
      descriptor.label,
    );
    assert.doesNotMatch(
      definition,
      /an artistic orientation toward/i,
      descriptor.label,
    );
  }
});

test("electronic direction definitions describe concrete production characteristics", () => {
  const expected = new Map([
    [
      "toward progressive house",
      /layered harmony|evolving texture|long transitions/i,
    ],
    [
      "toward broken-beat production",
      /syncopated|non-four-on-the-floor|chopped breaks/i,
    ],
    [
      "toward sample-based production",
      /looping|chopping|resampling/i,
    ],
    [
      "toward ambient electronic soundscapes",
      /pads|drones|spatial effects/i,
    ],
  ]);

  for (const [label, pattern] of expected) {
    const definition =
      getEditorialSharedLexicalDefinition(
        label,
      ) ?? "";

    assert.match(definition, pattern, label);
  }
});

test("rock direction definitions describe the audible arrangement change", () => {
  const expected = new Map([
    [
      "toward post-rock dynamics",
      /crescendos|dynamic contrast|gradual development/i,
    ],
    [
      "toward shoegaze texture",
      /distortion|feedback|reverb/i,
    ],
    [
      "toward punk immediacy",
      /short forms|urgent rhythm|performance-first/i,
    ],
    [
      "toward progressive rock arrangements",
      /multi-section forms|thematic development|instrumental interplay/i,
    ],
  ]);

  for (const [label, pattern] of expected) {
    const definition =
      getEditorialSharedLexicalDefinition(
        label,
      ) ?? "";

    assert.match(definition, pattern, label);
  }
});

test("composition direction definitions use music-theory and form concepts", () => {
  const expected = new Map([
    [
      "toward more diatonic songwriting",
      /prevailing key|diatonic mode/i,
    ],
    [
      "toward more chromatic harmony",
      /outside the prevailing key|borrowed chords/i,
    ],
    [
      "toward odd-meter composition",
      /5\/4|7\/8|mixed meter/i,
    ],
    [
      "toward motif-driven composition",
      /structural seed|fragmentation|inversion/i,
    ],
    [
      "toward through-composed forms",
      /develops continuously|large-scale repetition/i,
    ],
  ]);

  for (const [label, pattern] of expected) {
    const definition =
      getEditorialSharedLexicalDefinition(
        label,
      ) ?? "";

    assert.match(definition, pattern, label);
  }
});

test("arrangement-character directions distinguish space, intimacy, palette, and performance", () => {
  const expected = new Map([
    [
      "toward more spacious arrangements",
      /negative space|lower simultaneous density/i,
    ],
    [
      "toward a more intimate sound",
      /proximity to the listener|perceived distance/i,
    ],
    [
      "toward tighter studio precision",
      /controlled timing|deliberate editing/i,
    ],
    [
      "toward lo-fi immediacy",
      /roughness|limited fidelity|saturation|noise/i,
    ],
  ]);

  for (const [label, pattern] of expected) {
    const definition =
      getEditorialSharedLexicalDefinition(
        label,
      ) ?? "";

    assert.match(definition, pattern, label);
  }
});
