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

const elements =
  releaseDescriptorOntology.filter(
    (descriptor) =>
      descriptor.category === "element",
  );

test("every Musical elements descriptor has a direct definition", () => {
  assert.equal(elements.length, 80);

  for (const descriptor of elements) {
    const lexical =
      getEditorialSharedLexicalDefinition(
        descriptor.label,
      );

    assert.ok(
      lexical,
      `missing Musical elements definition: ${descriptor.label}`,
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

test("Musical elements definitions remove recurring-feature boilerplate", () => {
  for (const descriptor of elements) {
    const definition =
      getEditorialDescriptorBrowserDefinition(
        descriptor,
      );

    assert.doesNotMatch(
      definition,
      /a recurring musical or sonic feature built around/i,
      descriptor.label,
    );
  }
});

test("guitar definitions explain playing or texture rather than restating labels", () => {
  const expected = new Map([
    ["palm-muted riffs", /picking hand|damps the strings|percussive attack/i],
    ["wall-of-guitars texture", /overdubs|doubled parts|merge into/i],
    ["counterpoint guitar lines", /independent guitar melodies|simultaneously/i],
    ["open-string drones", /open strings|constant resonant pitch/i],
  ]);

  for (const [label, pattern] of expected) {
    assert.match(
      getEditorialSharedLexicalDefinition(label) ?? "",
      pattern,
      label,
    );
  }
});

test("keyboard definitions explain synthesis and keyboard characteristics", () => {
  const expected = new Map([
    ["synthesizer arpeggios", /chord tones|sequentially|tempo/i],
    ["supersaw chords", /detuned sawtooth|wide|dense/i],
    ["acid basslines", /TB-303|cutoff|resonance/i],
    ["Mellotron layers", /tape-recorded|strings|choir|flute/i],
  ]);

  for (const [label, pattern] of expected) {
    assert.match(
      getEditorialSharedLexicalDefinition(label) ?? "",
      pattern,
      label,
    );
  }
});

test("rhythm definitions identify historically or technically specific devices", () => {
  const expected = new Map([
    ["2-step garage drums", /kick skips|shuffled hats|syncopated/i],
    ["Amen-style breaks", /Winstons|1969|jungle|drum & bass/i],
    ["four-on-the-floor kick", /every quarter-note beat|4\/4/i],
    ["half-time drums", /backbeat|beat three|half as fast/i],
    ["IDM-derived beats", /intricate edits|irregular accents|microvariation/i],
  ]);

  for (const [label, pattern] of expected) {
    assert.match(
      getEditorialSharedLexicalDefinition(label) ?? "",
      pattern,
      label,
    );
  }
});

test("texture definitions distinguish recording artifacts, processing, and atmosphere", () => {
  const expected = new Map([
    ["vinyl texture", /crackle|rumble|pitch instability/i],
    ["granular clouds", /short grains|layering|stretching/i],
    ["dub echoes", /delay feedback|filtering|decay/i],
    ["cinematic sample collage", /speech|ambience|montage|film-like/i],
  ]);

  for (const [label, pattern] of expected) {
    assert.match(
      getEditorialSharedLexicalDefinition(label) ?? "",
      pattern,
      label,
    );
  }
});

test("vocal definitions distinguish recording technique, performance, and arrangement", () => {
  const expected = new Map([
    ["close-miked vocals", /microphone positioned near|proximity effect/i],
    ["layered vocal harmonies", /chord tones|melodic intervals|overdubs/i],
    ["call-and-response vocals", /call|answers|exchange/i],
    ["processed vocal chops", /slicing|repitching|time-stretching|sequencing/i],
  ]);

  for (const [label, pattern] of expected) {
    assert.match(
      getEditorialSharedLexicalDefinition(label) ?? "",
      pattern,
      label,
    );
  }
});

test("cross-category Musical elements retain one shared meaning", () => {
  for (const label of [
    "Hammond organ",
    "motorik pulse",
    "sampled dialogue",
    "found sound",
  ]) {
    const key = label.toLocaleLowerCase();

    const matches =
      releaseDescriptorOntology.filter(
        (descriptor) =>
          descriptor.label.toLocaleLowerCase() === key,
      );

    assert.ok(
      matches.length >= 2,
      `expected shared descriptor: ${label}`,
    );

    const definitions =
      new Set(
        matches.map((descriptor) =>
          getEditorialDescriptorBrowserDefinition(
            descriptor,
          ),
        ),
      );

    assert.equal(
      definitions.size,
      1,
      `shared definition drifted: ${label}`,
    );
  }
});

test("shared lexical lookup normalizes capitalized definition keys", () => {
  const examples = [
    "Mellotron layers",
    "Amen-style breaks",
    "Hammond organ",
    "IDM-derived beats",
  ];

  for (const label of examples) {
    const normal =
      getEditorialSharedLexicalDefinition(label);
    const upper =
      getEditorialSharedLexicalDefinition(
        label.toLocaleUpperCase(),
      );

    assert.ok(
      normal,
      `missing normalized shared definition: ${label}`,
    );
    assert.equal(
      upper,
      normal,
      `case-insensitive lookup drifted: ${label}`,
    );
  }
});
