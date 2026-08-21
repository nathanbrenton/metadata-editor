import assert from "node:assert/strict";
import test from "node:test";

import {
  getEditorialDescriptorBrowserDefinition,
} from "../src/editorial-descriptor-browser.js";
import {
  getEditorialGenreKnowledgeForDescriptor,
  getEditorialSharedLexicalDefinition,
} from "../src/editorial-descriptor-knowledge.js";
import {
  releaseDescriptorOntology,
} from "../src/release-descriptor-ontology.js";

test("shared descriptor labels keep the same information across categories", () => {
  const byLabel = new Map<
    string,
    typeof releaseDescriptorOntology[number][]
  >();

  for (const descriptor of releaseDescriptorOntology) {
    const key =
      descriptor.label.toLocaleLowerCase();
    const current = byLabel.get(key) ?? [];
    current.push(descriptor);
    byLabel.set(key, current);
  }

  const duplicates =
    [...byLabel.values()].filter(
      (entries) =>
        new Set(
          entries.map(
            (entry) => entry.category,
          ),
        ).size > 1,
    );

  assert.ok(
    duplicates.length >= 20,
    "expected cross-category descriptor labels",
  );

  for (const entries of duplicates) {
    const definitions = new Set(
      entries.map((entry) =>
        getEditorialDescriptorBrowserDefinition(
          entry,
        ),
      ),
    );

    assert.equal(
      definitions.size,
      1,
      `definition drifted across categories: ${entries[0].label}`,
    );
  }
});

test("every canonical genre receives historical lineage and characteristic sound information", () => {
  const genres =
    releaseDescriptorOntology.filter(
      (descriptor) =>
        descriptor.category === "genre",
    );

  assert.ok(genres.length >= 190);

  for (const descriptor of genres) {
    const definition =
      getEditorialDescriptorBrowserDefinition(
        descriptor,
      );

    assert.match(
      definition,
      /^(?:Origin|Lineage):/i,
      `missing origin/lineage for ${descriptor.label}`,
    );
    assert.match(
      definition,
      /Sounds:/i,
      `missing characteristic sounds for ${descriptor.label}`,
    );

    const knowledge =
      getEditorialGenreKnowledgeForDescriptor(
        descriptor,
      );

    assert.ok(
      knowledge,
      `missing genre knowledge for ${descriptor.label}`,
    );
    assert.ok(knowledge.origin.length > 5);
    assert.ok(knowledge.description.length > 25);
    assert.ok(knowledge.sounds.length >= 3);
  }
});

test("genre facts are reused when the same style appears under Influences", () => {
  for (const label of [
    "Progressive Rock",
    "Trip-Hop",
    "Techno",
    "Shoegaze",
    "Drum & Bass",
  ]) {
    const normalizedLabel =
      label.toLocaleLowerCase();

    const genre =
      releaseDescriptorOntology.find(
        (descriptor) =>
          descriptor.category === "genre" &&
          descriptor.label.toLocaleLowerCase() ===
            normalizedLabel,
      );
    const influence =
      releaseDescriptorOntology.find(
        (descriptor) =>
          descriptor.category === "influence" &&
          descriptor.label.toLocaleLowerCase() ===
            normalizedLabel,
      );

    assert.ok(genre);
    assert.ok(influence);

    assert.equal(
      getEditorialDescriptorBrowserDefinition(
        genre,
      ),
      getEditorialDescriptorBrowserDefinition(
        influence,
      ),
    );
  }
});

test("Mood & emotion uses dictionary-style lexical definitions for every descriptor", () => {
  const moods =
    releaseDescriptorOntology.filter(
      (descriptor) =>
        descriptor.category === "mood",
    );

  assert.equal(moods.length, 84);

  for (const descriptor of moods) {
    const lexical =
      getEditorialSharedLexicalDefinition(
        descriptor.label,
      );

    assert.ok(
      lexical,
      `missing mood definition: ${descriptor.label}`,
    );
    assert.equal(
      getEditorialDescriptorBrowserDefinition(
        descriptor,
      ),
      lexical,
    );
  }

  assert.match(
    getEditorialSharedLexicalDefinition(
      "anxious",
    ) ?? "",
    /worry|unease|apprehension/i,
  );
  assert.match(
    getEditorialSharedLexicalDefinition(
      "bittersweet",
    ) ?? "",
    /pleasure|beauty|affection/i,
  );
  assert.match(
    getEditorialSharedLexicalDefinition(
      "bleak",
    ) ?? "",
    /grim|hope/i,
  );
});

test("Themes & subjects uses dictionary-style lexical definitions for every descriptor", () => {
  const themes =
    releaseDescriptorOntology.filter(
      (descriptor) =>
        descriptor.category === "theme",
    );

  assert.equal(themes.length, 60);

  for (const descriptor of themes) {
    const lexical =
      getEditorialSharedLexicalDefinition(
        descriptor.label,
      );

    assert.ok(
      lexical,
      `missing theme definition: ${descriptor.label}`,
    );
    assert.equal(
      getEditorialDescriptorBrowserDefinition(
        descriptor,
      ),
      lexical,
    );
  }

  assert.match(
    getEditorialSharedLexicalDefinition(
      "betrayal",
    ) ?? "",
    /trust|loyalty/i,
  );
  assert.match(
    getEditorialSharedLexicalDefinition(
      "authority",
    ) ?? "",
    /power|right to direct|command/i,
  );
  assert.match(
    getEditorialSharedLexicalDefinition(
      "conformity",
    ) ?? "",
    /standards|customs|authority/i,
  );
});

test("descriptor definitions no longer repeat authoring instructions", () => {
  for (
    const descriptor of
      releaseDescriptorOntology
  ) {
    const definition =
      getEditorialDescriptorBrowserDefinition(
        descriptor,
      );

    assert.doesNotMatch(
      definition,
      /\buse it when\b/i,
      `${descriptor.category}:${descriptor.label}`,
    );
    assert.doesNotMatch(
      definition,
      /\bmeaningfully describes the release\b/i,
      `${descriptor.category}:${descriptor.label}`,
    );
    assert.doesNotMatch(
      definition,
      /\bmaterially shapes the meaning of the release\b/i,
      `${descriptor.category}:${descriptor.label}`,
    );
  }
});
