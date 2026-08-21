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
    (descriptor) => descriptor.category === "performance",
  );

test("every Performance descriptor has a direct definition", () => {
  assert.equal(descriptors.length, 38);

  for (const descriptor of descriptors) {
    const lexical =
      getEditorialSharedLexicalDefinition(
        descriptor.label,
      );

    assert.ok(
      lexical,
      `missing Performance definition: ${descriptor.label}`,
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

test("Performance definitions remove generic category boilerplate", () => {
  for (const descriptor of descriptors) {
    const definition =
      getEditorialDescriptorBrowserDefinition(descriptor);

    assert.doesNotMatch(
      definition,
      /a performance quality or delivery characteristic described as/i,
      descriptor.label,
    );
  }
});

test("performance definitions distinguish delivery and ensemble interaction", () => {
  const expected = new Map([
    ["live-off-the-floor feel", /single pass|near-live setup|ensemble interaction/i],
    ["metronomic precision", /metronome|sequencer/i],
    ["melismatic delivery", /multiple pitches/i],
    ["deadpan delivery", /irony|detachment|understated tension/i],
    ["drums-and-bass lock", /rhythm-section|shared groove/i],
  ]);

  for (const [label, pattern] of expected) {
    assert.match(
      getEditorialSharedLexicalDefinition(label) ?? "",
      pattern,
      label,
    );
  }
});
