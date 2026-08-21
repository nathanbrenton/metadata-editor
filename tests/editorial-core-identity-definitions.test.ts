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
    (descriptor) => descriptor.category === "identity",
  );

test("every Core identity descriptor has a direct definition", () => {
  assert.equal(descriptors.length, 32);

  for (const descriptor of descriptors) {
    const lexical =
      getEditorialSharedLexicalDefinition(
        descriptor.label,
      );

    assert.ok(
      lexical,
      `missing Core identity definition: ${descriptor.label}`,
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

test("Core identity definitions remove generic category boilerplate", () => {
  for (const descriptor of descriptors) {
    const definition =
      getEditorialDescriptorBrowserDefinition(descriptor);

    assert.doesNotMatch(
      definition,
      /a high-level statement of musical identity centered on/i,
      descriptor.label,
    );
  }
});

test("core-identity definitions express recurring artistic stance", () => {
  const expected = new Map([
    ["hooks inside experimental arrangements", /memorable hooks|exploratory/i],
    ["mechanical rhythm with human emotion", /machine-like pulse|emotionally resonant/i],
    ["texture over virtuosity", /sonority|timbral experience|technical skill/i],
    ["harmonic ambiguity as an expressive device", /uncertain tonal center|unstable harmonic meaning/i],
    ["carefully controlled contrast", /balancing of opposites|raw and polished/i],
  ]);

  for (const [label, pattern] of expected) {
    assert.match(
      getEditorialSharedLexicalDefinition(label) ?? "",
      pattern,
      label,
    );
  }
});
