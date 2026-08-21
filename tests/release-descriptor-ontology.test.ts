import assert from "node:assert/strict";
import test from "node:test";

import {
  getRelatedReleaseDescriptors,
  getReleaseDescriptorFamilies,
  getReleaseDescriptorOntologyStats,
  getReleaseDescriptorsByCategory,
  releaseDescriptorCategoryDefinitions,
  releaseDescriptorOntology,
  searchReleaseDescriptors,
} from "../src/release-descriptor-ontology.js";

function labels(
  category:
    | "genre"
    | "influence"
    | "direction"
    | "element"
    | "instrumentation"
    | "production"
    | "theory"
    | "rhythm"
    | "mood"
    | "attitude"
    | "energy"
    | "sonic-quality"
    | "theme"
    | "songwriting"
    | "identity"
    | "performance"
    | "context"
    | "place",
): Set<string> {
  return new Set(
    getReleaseDescriptorsByCategory(
      category,
    ).map((descriptor) => descriptor.label),
  );
}

test("normalized release ontology is large, categorized, and non-empty", () => {
  const stats =
    getReleaseDescriptorOntologyStats();

  assert.ok(
    stats.total >= 1180,
    `expected at least 1180 descriptors; found ${stats.total}`,
  );
  assert.ok(stats.common > stats.advanced);

  assert.equal(
    releaseDescriptorCategoryDefinitions.length,
    18,
  );

  for (
    const category of
      releaseDescriptorCategoryDefinitions
  ) {
    assert.ok(
      stats.byCategory[category.id] > 0,
      `expected descriptors for ${category.id}`,
    );
  }
});

test("descriptor ids and category-local labels are unique", () => {
  const ids = new Set<string>();
  const categoryLabels = new Set<string>();

  for (
    const descriptor of
      releaseDescriptorOntology
  ) {
    assert.ok(
      !ids.has(descriptor.id),
      `duplicate id: ${descriptor.id}`,
    );
    ids.add(descriptor.id);

    const categoryLabel =
      `${descriptor.category}:${descriptor.label.toLocaleLowerCase()}`;

    assert.ok(
      !categoryLabels.has(categoryLabel),
      `duplicate category label: ${categoryLabel}`,
    );
    categoryLabels.add(categoryLabel);
  }
});

test("electronic genre vocabulary preserves current Beatport terminology", () => {
  const genreLabels = labels("genre");

  for (const expected of [
    "Melodic House & Techno",
    "Melodic Techno",
    "Progressive House",
    "Techno (Peak Time / Driving)",
    "Techno (Raw / Deep / Hypnotic)",
    "Progressive Trance",
    "Uplifting Trance",
    "Trance (Raw / Deep / Hypnotic)",
    "Liquid Drum & Bass",
    "Jungle",
    "2-Step",
    "Speed Garage",
    "Dark Disco",
    "Future Rave",
    "Psy-Trance",
    "UK Garage / Bassline",
  ]) {
    assert.ok(
      genreLabels.has(expected),
      `missing Beatport-aligned descriptor: ${expected}`,
    );
  }
});

test("rock, alternative, indie, progressive, psychedelic, punk, and shoegaze vocabulary is represented", () => {
  const genreLabels = labels("genre");
  const elementLabels = labels("element");
  const qualityLabels =
    labels("sonic-quality");

  for (const expected of [
    "Alternative Rock",
    "Indie Rock",
    "Progressive Rock",
    "Progressive Metal",
    "Psychedelic Rock",
    "Neo-Psychedelia",
    "Shoegaze",
    "Dream Pop",
    "Noise Rock",
    "Garage Rock",
    "Post-Rock",
    "Math Rock",
    "Punk Rock",
  ]) {
    assert.ok(
      genreLabels.has(expected),
      `missing rock-family descriptor: ${expected}`,
    );
  }

  for (const expected of [
    "jangling guitars",
    "feedback-drenched guitars",
    "wall-of-guitars texture",
    "fuzz guitar",
    "interlocking guitar lines",
    "palm-muted riffs",
    "Mellotron layers",
  ]) {
    assert.ok(
      elementLabels.has(expected),
      `missing rock element: ${expected}`,
    );
  }

  for (const expected of [
    "hazy",
    "wiry",
    "angular",
    "sludgy",
    "searing",
    "ghostly",
    "serrated",
    "bone-crunching",
  ]) {
    assert.ok(
      qualityLabels.has(expected),
      `missing rock/editorial quality: ${expected}`,
    );
  }
});

test("music-theory vocabulary has browseable scale, harmony, voice-leading, and form families", () => {
  const theoryLabels = labels("theory");
  const families =
    getReleaseDescriptorFamilies("theory");

  for (const expectedFamily of [
    "Tonality & scales",
    "Harmony",
    "Voice leading",
    "Melody",
    "Form",
  ]) {
    assert.ok(
      families.includes(expectedFamily),
      `missing theory family: ${expectedFamily}`,
    );
  }

  for (const expected of [
    "diatonic harmony",
    "functional harmony",
    "modal mixture",
    "secondary dominants",
    "secondary diminished chords",
    "diminished seventh harmony",
    "chromatic harmony",
    "quartal harmony",
    "quintal harmony",
    "secundal harmony",
    "Dorian mode",
    "Phrygian mode",
    "Lydian mode",
    "Mixolydian mode",
    "whole-tone scale",
    "octatonic half-whole scale",
    "altered scale",
    "classical voice leading",
    "counterpoint",
    "motivic development",
    "thematic reprise",
  ]) {
    assert.ok(
      theoryLabels.has(expected),
      `missing theory descriptor: ${expected}`,
    );
  }
});

test("music-specific emotion families and separate attitude vocabulary are preserved", () => {
  const moodFamilies =
    getReleaseDescriptorFamilies("mood");

  for (const expected of [
    "Wonder",
    "Transcendence",
    "Tenderness",
    "Nostalgia",
    "Peacefulness",
    "Power",
    "Joyful activation",
    "Tension",
    "Sadness",
  ]) {
    assert.ok(
      moodFamilies.includes(expected),
      `missing music-emotion family: ${expected}`,
    );
  }

  const attitudeLabels = labels("attitude");

  for (const expected of [
    "rebellious",
    "defiant",
    "irreverent",
    "confrontational",
    "provocative",
    "unapologetic",
    "swaggering",
    "cocky",
    "brazen",
    "mischievous",
    "sarcastic",
    "sardonic",
    "edgy",
    "reckless",
    "rowdy",
    "unhinged",
    "nervy",
  ]) {
    assert.ok(
      attitudeLabels.has(expected),
      `missing attitude descriptor: ${expected}`,
    );
  }
});

test("named artist research is distilled into generic reusable vocabulary rather than artist tags", () => {
  const allLabels =
    releaseDescriptorOntology.map(
      (descriptor) =>
        descriptor.label.toLocaleLowerCase(),
    );

  for (const artistName of [
    "thievery corporation",
    "mindless self indulgence",
    "lights",
    "deadmau5",
    "dream theater",
    "portishead",
  ]) {
    assert.equal(
      allLabels.some((label) =>
        label.includes(artistName),
      ),
      false,
      `artist name should not become a generic descriptor: ${artistName}`,
    );
  }

  for (const expected of [
    ["influence", "dub"],
    ["influence", "bossa nova"],
    ["influence", "acid jazz"],
    ["influence", "spy soundtracks"],
    ["element", "IDM-derived beats"],
    ["direction", "toward synth-heavy atmospheric pop"],
    ["identity", "deep grooves and atmospheric soundscapes"],
    ["rhythm", "odd meter"],
    ["rhythm", "syncopated unison riffs"],
    ["element", "slow breakbeats"],
    ["element", "hypnotic samples"],
  ] as const) {
    assert.ok(
      labels(expected[0]).has(expected[1]),
      `missing reusable artist-reference concept: ${expected[0]}:${expected[1]}`,
    );
  }
});

test("aliases make common shorthand searchable", () => {
  assert.equal(
    searchReleaseDescriptors(
      "prog rock",
      { limit: 1 },
    )[0]?.label,
    "Progressive Rock",
  );

  assert.equal(
    searchReleaseDescriptors(
      "D&B",
      { limit: 1 },
    )[0]?.label,
    "Drum & Bass",
  );

  assert.equal(
    searchReleaseDescriptors(
      "mode mixture",
      {
        category: "theory",
        limit: 2,
      },
    ).some(
      (descriptor) =>
        descriptor.label ===
        "modal mixture",
    ),
    true,
  );
});

test("related descriptors provide discovery links across semantic categories", () => {
  const rebellious =
    searchReleaseDescriptors(
      "rebellious",
      {
        category: "attitude",
        limit: 1,
      },
    )[0];

  assert.ok(rebellious);

  const related =
    getRelatedReleaseDescriptors(
      rebellious.id,
    ).map(
      (descriptor) =>
        `${descriptor.category}:${descriptor.label}`,
    );

  assert.ok(
    related.includes(
      "attitude:defiant",
    ),
  );
  assert.ok(
    related.includes(
      "attitude:irreverent",
    ),
  );
  assert.ok(
    related.includes(
      "energy:live-wire",
    ),
  );

  const prog =
    searchReleaseDescriptors(
      "Progressive Rock",
      {
        category: "genre",
        limit: 1,
      },
    )[0];

  assert.ok(prog);

  const progRelated =
    getRelatedReleaseDescriptors(
      prog.id,
    ).map(
      (descriptor) =>
        `${descriptor.category}:${descriptor.label}`,
    );

  assert.ok(
    progRelated.includes(
      "rhythm:odd meter",
    ),
  );
  assert.ok(
    progRelated.includes(
      "performance:virtuosic interplay",
    ),
  );
});
