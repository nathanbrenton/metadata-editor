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
    (descriptor) => descriptor.category === "context",
  );

test("every Release context descriptor has a direct definition", () => {
  assert.equal(descriptors.length, 40);

  for (const descriptor of descriptors) {
    const lexical =
      getEditorialSharedLexicalDefinition(
        descriptor.label,
      );

    assert.ok(
      lexical,
      `missing Release context definition: ${descriptor.label}`,
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

test("Release context definitions remove generic category boilerplate", () => {
  for (const descriptor of descriptors) {
    const definition =
      getEditorialDescriptorBrowserDefinition(descriptor);

    assert.doesNotMatch(
      definition,
      /release context concerning/i,
      descriptor.label,
    );
  }
});

test("release-context definitions explain stage and circumstance", () => {
  const expected = new Map([
    ["debut release", /first official release|introduces/i],
    ["return after a hiatus", /significant break|re-entry|reassessment/i],
    ["home-studio recording period", /home-studio|autonomy|intimacy/i],
    ["archival release", /historical|previously unissued/i],
    ["remote collaboration", /separate locations|distance/i],
  ]);

  for (const [label, pattern] of expected) {
    assert.match(
      getEditorialSharedLexicalDefinition(label) ?? "",
      pattern,
      label,
    );
  }
});
