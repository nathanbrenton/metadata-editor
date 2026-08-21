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
    (descriptor) => descriptor.category === "songwriting",
  );

test("every Songwriting & composition descriptor has a direct definition", () => {
  assert.equal(descriptors.length, 42);

  for (const descriptor of descriptors) {
    const lexical =
      getEditorialSharedLexicalDefinition(
        descriptor.label,
      );

    assert.ok(
      lexical,
      `missing Songwriting & composition definition: ${descriptor.label}`,
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

test("Songwriting & composition definitions remove generic category boilerplate", () => {
  for (const descriptor of descriptors) {
    const definition =
      getEditorialDescriptorBrowserDefinition(descriptor);

    assert.doesNotMatch(
      definition,
      /a songwriting or compositional approach involving/i,
      descriptor.label,
    );
  }
});

test("songwriting definitions explain form, process and lyric strategy", () => {
  const expected = new Map([
    ["AABA songwriting", /two similar opening sections|contrasting bridge|return/i],
    ["verse-refrain songwriting", /repeated refrain|less contrasting than a full chorus/i],
    ["minimalist process writing", /repetition|small shifts|gradual process/i],
    ["stream-of-consciousness lyrics", /associative thought flow/i],
    ["tight unison writing", /multiple instruments articulating the same line/i],
  ]);

  for (const [label, pattern] of expected) {
    assert.match(
      getEditorialSharedLexicalDefinition(label) ?? "",
      pattern,
      label,
    );
  }
});
