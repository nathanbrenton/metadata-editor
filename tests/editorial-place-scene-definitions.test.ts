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
    (descriptor) =>
      descriptor.category === "place",
  );

test("every Place / scene descriptor has a direct definition", () => {
  assert.equal(descriptors.length, 25);

  for (const descriptor of descriptors) {
    const lexical =
      getEditorialSharedLexicalDefinition(
        descriptor.label,
      );

    assert.ok(
      lexical,
      `missing Place / scene definition: ${descriptor.label}`,
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

test("Place / scene definitions remove generic fallback prose", () => {
  for (const descriptor of descriptors) {
    const definition =
      getEditorialDescriptorBrowserDefinition(
        descriptor,
      );

    assert.doesNotMatch(
      definition,
      /a geographic, scene, studio, or imagined setting described as/i,
      descriptor.label,
    );
  }
});

test("geography definitions describe place without inventing a single genre sound", () => {
  const expected = new Map([
    ["Orange County", /Southern California|coastal cities|suburbs/i],
    ["Los Angeles", /recording studios|clubs|DIY spaces|media industries/i],
    ["Southern California", /urban centers|suburbs|coastline|desert/i],
    ["coastal Southern California", /Pacific coast|Los Angeles|Orange County|San Diego/i],
  ]);

  for (const [label, pattern] of expected) {
    assert.match(
      getEditorialSharedLexicalDefinition(label) ?? "",
      pattern,
      label,
    );
  }
});

test("scene definitions distinguish club, DIY, underground, and independent contexts", () => {
  const expected = new Map([
    ["club culture", /DJs|dancing|sound systems|promoters/i],
    ["warehouse scene", /industrial|raves|DIY|sound systems/i],
    ["DIY venue culture", /artist-|community-run|house shows|volunteer/i],
    ["underground scene", /outside.*commercial|informal networks|niche audiences/i],
    ["electronic club scene", /DJs|producers|continuous programmed sets/i],
  ]);

  for (const [label, pattern] of expected) {
    assert.match(
      getEditorialSharedLexicalDefinition(label) ?? "",
      pattern,
      label,
    );
  }
});

test("recording-space definitions distinguish home, bedroom, rehearsal, live, project, and warehouse spaces", () => {
  const expected = new Map([
    ["home studio", /residence|commercial studio|schedule flexibility/i],
    ["bedroom studio", /bedroom|headphone monitoring|software instruments/i],
    ["rehearsal room", /practicing|arranging|ensemble|bleed/i],
    ["live room", /recording studio|reflections|microphone distance/i],
    ["project studio", /professional|semi-professional|compact environment/i],
    ["warehouse studio", /industrial-style building|physical volume|reflections/i],
  ]);

  for (const [label, pattern] of expected) {
    assert.match(
      getEditorialSharedLexicalDefinition(label) ?? "",
      pattern,
      label,
    );
  }
});

test("imagined-setting definitions describe scene and atmosphere rather than literal metadata", () => {
  const expected = new Map([
    ["night-drive setting", /road after dark|passing lights|nighttime driving/i],
    ["desert landscape", /arid space|long horizons|scale/i],
    ["industrial landscape", /factories|warehouses|machinery|concrete/i],
    ["smoky lounge atmosphere", /dim light|close seating|late hours/i],
    ["cinematic interior space", /film-like scene|architecture|lighting|reverberation/i],
  ]);

  for (const [label, pattern] of expected) {
    assert.match(
      getEditorialSharedLexicalDefinition(label) ?? "",
      pattern,
      label,
    );
  }
});
