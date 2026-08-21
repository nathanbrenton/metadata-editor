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
    (descriptor) => descriptor.category === "sonic-quality",
  );

test("every Sonic qualities descriptor has a direct definition", () => {
  assert.equal(descriptors.length, 69);

  for (const descriptor of descriptors) {
    const lexical =
      getEditorialSharedLexicalDefinition(
        descriptor.label,
      );

    assert.ok(
      lexical,
      `missing Sonic qualities definition: ${descriptor.label}`,
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

test("Sonic qualities definitions remove generic category boilerplate", () => {
  for (const descriptor of descriptors) {
    const definition =
      getEditorialDescriptorBrowserDefinition(descriptor);

    assert.doesNotMatch(
      definition,
      /an audible texture, space, density, finish, or tonal quality described as/i,
      descriptor.label,
    );
  }
});

test("sonic-quality definitions explain texture, space and finish in concrete terms", () => {
  const expected = new Map([
    ["colossal", /large perceived scale|breadth/i],
    ["sun-bleached", /faded|dry|pale/i],
    ["lo-fi", /hiss|restricted bandwidth|home-recorded/i],
    ["cavernous", /large chamber|deep or echoing/i],
    ["neon-lit", /artificial|nightlife energy/i],
  ]);

  for (const [label, pattern] of expected) {
    assert.match(
      getEditorialSharedLexicalDefinition(label) ?? "",
      pattern,
      label,
    );
  }
});
