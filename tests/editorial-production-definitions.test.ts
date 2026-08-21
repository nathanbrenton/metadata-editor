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

const production =
  releaseDescriptorOntology.filter(
    (descriptor) =>
      descriptor.category === "production",
  );

test("every Production descriptor has a direct definition", () => {
  assert.equal(production.length, 94);

  for (const descriptor of production) {
    const lexical =
      getEditorialSharedLexicalDefinition(
        descriptor.label,
      );

    assert.ok(
      lexical,
      `missing Production definition: ${descriptor.label}`,
    );

    assert.equal(
      getEditorialDescriptorBrowserDefinition(
        descriptor,
      ),
      lexical,
    );

    assert.ok(
      lexical.length >= 65,
      `definition is too thin: ${descriptor.label}`,
    );
  }
});

test("Production definitions remove generic production boilerplate", () => {
  for (const descriptor of production) {
    const definition =
      getEditorialDescriptorBrowserDefinition(
        descriptor,
      );

    assert.doesNotMatch(
      definition,
      /a recording, mixing, editing, effects, or sound-design approach involving/i,
      descriptor.label,
    );
  }
});

test("Recording definitions explain capture and layering practice", () => {
  const expected = new Map([
    ["re-amping", /previously recorded dry signal|amplifier|processed result/i],
    ["room bleed", /leaking into microphones|cohesion|shared room/i],
    ["double-tracked guitars", /separately performed|panned|width|density/i],
    ["DI bass recording", /directly through a DI|clean full-range signal/i],
  ]);

  for (const [label, pattern] of expected) {
    assert.match(
      getEditorialSharedLexicalDefinition(label) ?? "",
      pattern,
      label,
    );
  }
});

test("Dynamics definitions distinguish compression techniques", () => {
  const expected = new Map([
    ["parallel compression", /compressed copy|uncompressed original|density/i],
    ["sidechain compression", /separate key signal|dynamically reduce/i],
    ["transient shaping", /attack and sustain|independently/i],
    ["upward compression", /raises quieter material|without reducing peaks/i],
  ]);

  for (const [label, pattern] of expected) {
    assert.match(
      getEditorialSharedLexicalDefinition(label) ?? "",
      pattern,
      label,
    );
  }
});

test("Spatial definitions distinguish reverb and delay behaviors", () => {
  const expected = new Map([
    ["gated reverb", /abruptly cut|stops suddenly/i],
    ["reverse reverb", /swells toward|lead-in/i],
    ["pre-delay shaping", /between the dry sound and the onset of reverb/i],
    ["ping-pong delay", /alternate|left and right/i],
  ]);

  for (const [label, pattern] of expected) {
    assert.match(
      getEditorialSharedLexicalDefinition(label) ?? "",
      pattern,
      label,
    );
  }
});

test("Synthesis definitions describe the actual synthesis or processing method", () => {
  const expected = new Map([
    ["subtractive synthesis", /removes parts of their spectrum|filters/i],
    ["FM synthesis", /changes the frequency of another|sidebands/i],
    ["wavetable synthesis", /table of single-cycle waveforms|morph/i],
    ["granular synthesis", /very short grains|stretches|scatters/i],
    ["ring modulation", /sum-and-difference frequencies/i],
    ["Reese bass design", /detuned oscillators|phase interaction|growling/i],
  ]);

  for (const [label, pattern] of expected) {
    assert.match(
      getEditorialSharedLexicalDefinition(label) ?? "",
      pattern,
      label,
    );
  }
});

test("Mixing definitions explain stereo, EQ, and balance concepts", () => {
  const expected = new Map([
    ["mid-side processing", /Mid \\(sum\\)|Side \\(difference\\)|Stereo processing/i],
    ["dynamic EQ", /gain changes in response to signal level|trigger/i],
    ["frequency carving", /overlapping spectral energy|competing sources/i],
    ["low-end mono control", /bass frequencies|stereo-difference|mono/i],
  ]);

  for (const [label, pattern] of expected) {
    assert.match(
      getEditorialSharedLexicalDefinition(label) ?? "",
      pattern,
      label,
    );
  }
});

test("Editing definitions explain structural manipulation", () => {
  const expected = new Map([
    ["micro-edits", /note, transient, syllable, or sub-beat/i],
    ["stutter edits", /rapid repetition|short audio fragment/i],
    ["varispeed", /pitch and tempo together|time-stretching|pitch-shifting/i],
    ["beat slicing", /individual hits|reordered|retriggered/i],
  ]);

  for (const [label, pattern] of expected) {
    assert.match(
      getEditorialSharedLexicalDefinition(label) ?? "",
      pattern,
      label,
    );
  }
});

test("Production lookup remains case-insensitive after normalized shared indexing", () => {
  for (const label of [
    "FM synthesis",
    "DI bass recording",
    "Reese bass design",
    "LFO modulation",
  ]) {
    const normal =
      getEditorialSharedLexicalDefinition(label);
    const upper =
      getEditorialSharedLexicalDefinition(
        label.toLocaleUpperCase(),
      );

    assert.ok(normal, label);
    assert.equal(upper, normal, label);
  }
});
