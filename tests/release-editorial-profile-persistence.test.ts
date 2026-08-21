import assert from "node:assert/strict";
import test from "node:test";

import { applyMetadataCreations } from "../server/metadata-change-set.js";
import {
  assertReleaseEditorialStorageValue,
  buildReleaseEditorialStorageSnapshot,
  editorialProfileCategoryIds,
  readEditorialObjectPath,
  releaseEditorialCustomDescriptorPath,
  releaseEditorialDescriptorPath,
  releaseEditorialDescriptionStylePath,
  releaseEditorialSnapshotEntries,
} from "../shared/editorial-profile.js";
import {
  hydrateReleaseProfileFromStorage,
  serializeReleaseProfileToStorage,
} from "../src/release-profile-persistence.js";
import { releaseDescriptorOntology } from "../src/release-descriptor-ontology.js";

function descriptorId(category: string, label: string): string {
  const descriptor = releaseDescriptorOntology.find(
    (candidate) => candidate.category === category && candidate.label === label,
  );
  assert.ok(descriptor, `missing test descriptor ${category}:${label}`);
  return descriptor.id;
}

test("release editorial storage supports every ontology category", () => {
  assert.equal(editorialProfileCategoryIds.length, 18);
  for (const category of editorialProfileCategoryIds) {
    assert.match(releaseEditorialDescriptorPath(category), /^release\.editorial\.profile\./);
    assert.match(releaseEditorialCustomDescriptorPath(category), /^release\.editorial\.profile_custom\./);
  }
});

test("profile labels serialize to stable ontology ids while custom values stay separate", () => {
  const snapshot = serializeReleaseProfileToStorage({
    descriptionStyle: "debut",
    profile: {
      genres: ["Progressive Rock"],
      "moods-emotions": ["rebellious"],
      "harmony-theory": ["diatonic harmony"],
      production: ["made-up cassette vortex"],
    },
  });

  assert.deepEqual(snapshot.descriptorIds.genre, [descriptorId("genre", "Progressive Rock")]);
  assert.deepEqual(snapshot.descriptorIds.attitude, [descriptorId("attitude", "rebellious")]);
  assert.deepEqual(snapshot.descriptorIds.theory, [descriptorId("theory", "diatonic harmony")]);
  assert.deepEqual(snapshot.customDescriptors.production, ["made-up cassette vortex"]);
});

test("canonical profile hydrates into the existing Release Profile UI model", () => {
  const source = {
    descriptionStyle: "instrumental-release",
    descriptorIds: {
      genre: [descriptorId("genre", "Trip-Hop")],
      attitude: [descriptorId("attitude", "defiant")],
      rhythm: [descriptorId("rhythm", "odd meter")],
    },
    customDescriptors: {
      production: ["home-built feedback loop"],
    },
  } as const;

  const hydrated = hydrateReleaseProfileFromStorage(source);
  assert.deepEqual(hydrated.profile.genres, ["Trip-Hop"]);
  assert.deepEqual(hydrated.profile["moods-emotions"], ["defiant"]);
  assert.deepEqual(hydrated.profile.rhythm, ["odd meter"]);
  assert.deepEqual(hydrated.profile.production, ["home-built feedback loop"]);
});

test("unknown future descriptor ids survive a hydrate/serialize round trip", () => {
  const futureId = "genre.future-family.future-subfamily.future-style";
  const source = {
    descriptionStyle: "default-release",
    descriptorIds: { genre: [futureId] },
    customDescriptors: {},
  } as const;
  const hydrated = hydrateReleaseProfileFromStorage(source);
  const serialized = serializeReleaseProfileToStorage({
    profile: hydrated.profile,
    descriptionStyle: source.descriptionStyle,
    passthroughDescriptorIds: hydrated.passthroughDescriptorIds,
  });
  assert.deepEqual(serialized.descriptorIds.genre, [futureId]);
});

test("release editorial fields create nested TOML-compatible tables without replacing sibling metadata", () => {
  const genreId = descriptorId("genre", "Progressive Rock");
  const created = applyMetadataCreations(
    { release: { title: "Gateway", description: "Existing public copy" } },
    [
      { path: releaseEditorialDescriptionStylePath, value: "debut" },
      { path: releaseEditorialDescriptorPath("genre"), value: [genreId] },
      { path: releaseEditorialCustomDescriptorPath("mood"), value: ["late-night restlessness"] },
    ],
  );

  assert.equal(readEditorialObjectPath(created, "release.title"), "Gateway");
  assert.equal(readEditorialObjectPath(created, "release.description"), "Existing public copy");
  assert.equal(readEditorialObjectPath(created, releaseEditorialDescriptionStylePath), "debut");
  assert.deepEqual(readEditorialObjectPath(created, releaseEditorialDescriptorPath("genre")), [genreId]);
});

test("storage validator accepts canonical ids/custom text and rejects mismatched category ids", () => {
  const progressiveRock = descriptorId("genre", "Progressive Rock");
  assert.doesNotThrow(() => assertReleaseEditorialStorageValue(releaseEditorialDescriptorPath("genre"), [progressiveRock]));
  assert.doesNotThrow(() => assertReleaseEditorialStorageValue(releaseEditorialCustomDescriptorPath("genre"), ["regional art-rock scene"]));
  assert.throws(() => assertReleaseEditorialStorageValue(releaseEditorialDescriptorPath("mood"), [progressiveRock]));
});

test("snapshot reader restores nested canonical release.toml values", () => {
  const genreId = descriptorId("genre", "Progressive Rock");
  const document = {
    release: {
      editorial: {
        description_style: "debut",
        profile: { genre: [genreId] },
        profile_custom: { mood: ["storm-before-the-show energy"] },
      },
    },
  };
  const snapshot = buildReleaseEditorialStorageSnapshot(
    (path) => readEditorialObjectPath(document, path),
  );
  assert.equal(snapshot.descriptionStyle, "debut");
  assert.deepEqual(snapshot.descriptorIds.genre, [genreId]);
  assert.deepEqual(snapshot.customDescriptors.mood, ["storm-before-the-show energy"]);
  assert.equal(releaseEditorialSnapshotEntries(snapshot).length, 37);
});
