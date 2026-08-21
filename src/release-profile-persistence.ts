import {
  releaseDescriptorOntology,
  type ReleaseDescriptor,
} from "./release-descriptor-ontology.js";
import type {
  ReleaseProfileCategoryId,
  ReleaseProfileSelection,
} from "./release-about-generator.js";
import {
  editorialProfileCategoryIds,
  type EditorialProfileCategoryId,
  type EditorialProfileCategoryValues,
  type ReleaseEditorialStorageSnapshot,
} from "../shared/editorial-profile.js";

type HydratedReleaseProfile = {
  profile: ReleaseProfileSelection;
  passthroughDescriptorIds: EditorialProfileCategoryValues;
};

const preferredOntologyCategories: Readonly<
  Record<
    ReleaseProfileCategoryId,
    readonly EditorialProfileCategoryId[]
  >
> = {
  genres: ["genre"],
  influences: ["influence", "genre", "direction"],
  direction: ["direction", "genre", "songwriting"],
  elements: ["element", "instrumentation", "rhythm"],
  instrumentation: ["instrumentation", "element"],
  production: ["production", "sonic-quality"],
  "harmony-theory": ["theory", "rhythm"],
  rhythm: ["rhythm", "element", "theory"],
  "moods-emotions": [
    "mood",
    "attitude",
    "energy",
    "sonic-quality",
  ],
  qualities: [
    "sonic-quality",
    "energy",
    "attitude",
    "mood",
  ],
  themes: ["theme", "context"],
  songwriting: ["songwriting", "theory", "identity"],
  identity: ["identity", "songwriting", "direction"],
  performance: ["performance", "energy", "attitude"],
  context: ["context", "place"],
  place: ["place", "context"],
};

const profileCategoryForOntologyCategory: Readonly<
  Record<
    EditorialProfileCategoryId,
    ReleaseProfileCategoryId
  >
> = {
  genre: "genres",
  influence: "influences",
  direction: "direction",
  element: "elements",
  instrumentation: "instrumentation",
  production: "production",
  theory: "harmony-theory",
  rhythm: "rhythm",
  mood: "moods-emotions",
  attitude: "moods-emotions",
  energy: "qualities",
  "sonic-quality": "qualities",
  theme: "themes",
  songwriting: "songwriting",
  identity: "identity",
  performance: "performance",
  context: "context",
  place: "place",
};

const descriptorById = new Map<
  string,
  ReleaseDescriptor
>(
  releaseDescriptorOntology.map(
    (descriptor) => [descriptor.id, descriptor],
  ),
);

function descriptorsMatchingLabel(
  label: string,
): ReleaseDescriptor[] {
  const normalized =
    label.trim().toLocaleLowerCase();

  return releaseDescriptorOntology.filter(
    (descriptor) =>
      descriptor.label.toLocaleLowerCase() ===
      normalized,
  );
}

function findDescriptorForProfileValue(
  profileCategory: ReleaseProfileCategoryId,
  label: string,
): ReleaseDescriptor | null {
  const matches =
    descriptorsMatchingLabel(label);

  if (matches.length === 0) return null;

  for (
    const preferred of
      preferredOntologyCategories[profileCategory]
  ) {
    const match = matches.find(
      (candidate) =>
        candidate.category === preferred,
    );

    if (match) return match;
  }

  return matches[0] ?? null;
}

function appendUnique(
  target: Record<string, string[]>,
  key: string,
  value: string,
): void {
  const values = target[key] ?? [];

  if (!values.includes(value)) {
    values.push(value);
  }

  target[key] = values;
}

export function hydrateReleaseProfileFromStorage(
  snapshot: ReleaseEditorialStorageSnapshot,
): HydratedReleaseProfile {
  const profile: Record<string, string[]> = {};
  const passthrough: Record<string, string[]> = {};

  for (const category of editorialProfileCategoryIds) {
    for (
      const descriptorId of
        snapshot.descriptorIds[category] ?? []
    ) {
      const descriptor =
        descriptorById.get(descriptorId);

      if (!descriptor) {
        appendUnique(
          passthrough,
          category,
          descriptorId,
        );
        continue;
      }

      appendUnique(
        profile,
        profileCategoryForOntologyCategory[
          descriptor.category
        ],
        descriptor.label,
      );
    }

    for (
      const custom of
        snapshot.customDescriptors[category] ?? []
    ) {
      appendUnique(
        profile,
        profileCategoryForOntologyCategory[category],
        custom,
      );
    }
  }

  return {
    profile:
      profile as ReleaseProfileSelection,
    passthroughDescriptorIds:
      passthrough as EditorialProfileCategoryValues,
  };
}

export function serializeReleaseProfileToStorage({
  profile,
  descriptionStyle,
  passthroughDescriptorIds = {},
}: {
  profile: ReleaseProfileSelection;
  descriptionStyle: string;
  passthroughDescriptorIds?: EditorialProfileCategoryValues;
}): ReleaseEditorialStorageSnapshot {
  const descriptorIds: Record<
    string,
    string[]
  > = {};
  const customDescriptors: Record<
    string,
    string[]
  > = {};

  for (const category of editorialProfileCategoryIds) {
    for (
      const descriptorId of
        passthroughDescriptorIds[category] ?? []
    ) {
      appendUnique(
        descriptorIds,
        category,
        descriptorId,
      );
    }
  }

  for (
    const [profileCategory, values] of
      Object.entries(profile) as Array<
        [
          ReleaseProfileCategoryId,
          readonly string[],
        ]
      >
  ) {
    for (const value of values ?? []) {
      const normalized = value.trim();

      if (!normalized) continue;

      const descriptor =
        findDescriptorForProfileValue(
          profileCategory,
          normalized,
        );

      if (descriptor) {
        appendUnique(
          descriptorIds,
          descriptor.category,
          descriptor.id,
        );
        continue;
      }

      const customCategory =
        preferredOntologyCategories[
          profileCategory
        ][0];

      appendUnique(
        customDescriptors,
        customCategory,
        normalized,
      );
    }
  }

  return {
    descriptionStyle,
    descriptorIds:
      descriptorIds as EditorialProfileCategoryValues,
    customDescriptors:
      customDescriptors as EditorialProfileCategoryValues,
  };
}
