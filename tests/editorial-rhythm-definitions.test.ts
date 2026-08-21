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

const descriptors =
  releaseDescriptorOntology.filter(
    (descriptor) => descriptor.category === "rhythm",
  );

test("every Rhythm & meter descriptor has a direct definition", () => {
  assert.equal(descriptors.length, 49);

  for (const descriptor of descriptors) {
    const lexical =
      getEditorialSharedLexicalDefinition(
        descriptor.label,
      );

    assert.ok(
      lexical,
      `missing Rhythm & meter definition: ${descriptor.label}`,
    );

    assert.equal(
      getEditorialDescriptorBrowserDefinition(descriptor),
      lexical,
    );

    assert.ok(
      lexical.length >= 45,
      `definition is too thin: ${descriptor.label}`,
    );
  }
});

test("Rhythm & meter definitions remove generic category boilerplate", () => {
  for (const descriptor of descriptors) {
    const definition =
      getEditorialDescriptorBrowserDefinition(descriptor);

    assert.doesNotMatch(
      definition,
      /a rhythmic or metric characteristic described as/i,
      descriptor.label,
    );
  }
});

test("meter and groove definitions identify concrete rhythmic practice", () => {
  const expected = new Map([
    ["additive meter", /2\+3|3\+2\+2|unequal beat groupings/i],
    ["2-step garage rhythm", /UK garage|syncopated snares|shuffling hi-hats/i],
    ["Amen break", /Winstons|1969|drum & bass|jungle/i],
    ["metric modulation", /new beat unit|old and new pulse/i],
    ["hemiola", /three groups of two|two groups of three/i],
  ]);

  for (const [label, pattern] of expected) {
    assert.match(
      getEditorialSharedLexicalDefinition(label) ?? "",
      pattern,
      label,
    );
  }
});
