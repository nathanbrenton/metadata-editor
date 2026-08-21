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

const theory =
  releaseDescriptorOntology.filter(
    (descriptor) =>
      descriptor.category === "theory",
  );

test("every Harmony & theory descriptor has a direct definition", () => {
  assert.equal(theory.length, 95);

  const uniqueLabels = new Set(
    theory.map((descriptor) =>
      descriptor.label.toLocaleLowerCase(),
    ),
  );
  assert.equal(
    uniqueLabels.size,
    theory.length,
    "Harmony & theory labels should be unique within the ontology",
  );

  for (const descriptor of theory) {
    const lexical =
      getEditorialSharedLexicalDefinition(
        descriptor.label,
      );

    assert.ok(
      lexical,
      `missing Harmony & theory definition: ${descriptor.label}`,
    );

    assert.equal(
      getEditorialDescriptorBrowserDefinition(
        descriptor,
      ),
      lexical,
    );

    assert.ok(
      lexical.length >= 55,
      `definition is too thin: ${descriptor.label}`,
    );
  }
});

test("Harmony & theory definitions remove generic category boilerplate", () => {
  for (const descriptor of theory) {
    const definition =
      getEditorialDescriptorBrowserDefinition(
        descriptor,
      );

    assert.doesNotMatch(
      definition,
      /a tonal or scalar framework based on/i,
      descriptor.label,
    );
    assert.doesNotMatch(
      definition,
      /a harmonic language or chordal device based on/i,
      descriptor.label,
    );
    assert.doesNotMatch(
      definition,
      /a voice-leading or contrapuntal concept involving/i,
      descriptor.label,
    );
    assert.doesNotMatch(
      definition,
      /a melodic-writing or development technique involving/i,
      descriptor.label,
    );
    assert.doesNotMatch(
      definition,
      /a formal or compositional concept involving/i,
      descriptor.label,
    );
  }
});

test("modes and scales explain pitch structure rather than restating labels", () => {
  const expected = new Map([
    ["Dorian mode", /natural sixth|1–2–♭3–4–5–6–♭7/i],
    ["Lydian mode", /raised fourth|♯4/i],
    ["Locrian mode", /diminished fifth|♭5/i],
    ["whole-tone scale", /whole steps|six-note symmetrical/i],
    ["altered scale", /seventh mode of melodic minor|altered ninths|fifths/i],
  ]);

  for (const [label, pattern] of expected) {
    assert.match(
      getEditorialSharedLexicalDefinition(label) ?? "",
      pattern,
      label,
    );
  }
});

test("chromatic harmony definitions distinguish functional techniques", () => {
  const expected = new Map([
    ["modal mixture", /parallel major or minor|same tonic/i],
    ["secondary dominants", /temporarily tonicize|V\/x/i],
    ["Neapolitan harmony", /lowered scale degree 2|predominant/i],
    ["augmented-sixth harmony", /♭6 to ♯4|expand outward|scale degree 5/i],
    ["enharmonic modulation", /respelling|new harmonic function|another key/i],
  ]);

  for (const [label, pattern] of expected) {
    assert.match(
      getEditorialSharedLexicalDefinition(label) ?? "",
      pattern,
      label,
    );
  }
});

test("non-tertian and extended harmony definitions identify interval construction", () => {
  const expected = new Map([
    ["tertian harmony", /stacking thirds/i],
    ["quartal harmony", /stacked fourths/i],
    ["quintal harmony", /stacked fifths/i],
    ["secundal harmony", /stacked seconds/i],
    ["cluster harmony", /adjacent|closely spaced pitches/i],
    ["harmonic planing", /parallel movement|unchanged chord shape/i],
  ]);

  for (const [label, pattern] of expected) {
    assert.match(
      getEditorialSharedLexicalDefinition(label) ?? "",
      pattern,
      label,
    );
  }
});

test("voice-leading definitions distinguish contrapuntal motion and technique", () => {
  const expected = new Map([
    ["contrary motion", /opposite directions/i],
    ["parallel motion", /same direction|same generic interval/i],
    ["oblique motion", /one voice remains stationary/i],
    ["imitative counterpoint", /restated|another voice|time offset/i],
    ["common-tone voice leading", /preserves one or more pitches/i],
  ]);

  for (const [label, pattern] of expected) {
    assert.match(
      getEditorialSharedLexicalDefinition(label) ?? "",
      pattern,
      label,
    );
  }
});

test("motivic and melodic definitions explain transformation and contour", () => {
  const expected = new Map([
    ["sequence", /successively higher or lower pitch levels/i],
    ["melodic inversion", /reversing interval direction/i],
    ["augmentation", /durations.*lengthened|unfold more slowly/i],
    ["diminution", /durations.*shortened|unfold more quickly/i],
    ["retrograde", /order.*reversed|backward/i],
    ["angular melody", /abrupt changes of direction|disjunct/i],
  ]);

  for (const [label, pattern] of expected) {
    assert.match(
      getEditorialSharedLexicalDefinition(label) ?? "",
      pattern,
      label,
    );
  }
});

test("formal definitions distinguish repeated and developmental structures", () => {
  const expected = new Map([
    ["verse-chorus form", /alternating verses|recurring chorus/i],
    ["strophic form", /successive verses|same music/i],
    ["through-composed form", /continues developing new musical material/i],
    ["binary form", /two-part form|A–B/i],
    ["ternary form", /A–B–A|contrasting middle/i],
    ["conceptual song cycle", /sequence of songs|larger unified work/i],
  ]);

  for (const [label, pattern] of expected) {
    assert.match(
      getEditorialSharedLexicalDefinition(label) ?? "",
      pattern,
      label,
    );
  }
});

test("chromatic voice leading has a direct canonical theory definition", () => {
  const matches =
    theory.filter(
      (descriptor) =>
        descriptor.label ===
        "chromatic voice leading",
    );

  assert.equal(matches.length, 1);

  const definition =
    getEditorialDescriptorBrowserDefinition(
      matches[0],
    );

  assert.match(
    definition,
    /semitone|outside the prevailing diatonic collection/i,
  );
});


test("shared theory descriptors retain one meaning across categories", () => {
  for (const label of [
    "motivic development",
    "through-composed form",
    "thematic reprise",
    "call and response",
  ]) {
    const key = label.toLocaleLowerCase();
    const matches =
      releaseDescriptorOntology.filter(
        (descriptor) =>
          descriptor.label.toLocaleLowerCase() === key,
      );

    assert.ok(
      matches.length >= 1,
      `missing descriptor: ${label}`,
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

test("Harmony & theory lookup remains case-insensitive", () => {
  for (const label of [
    "Ionian mode",
    "Neapolitan harmony",
    "Lydian dominant",
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
