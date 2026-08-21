import type {
  ReleaseProfileCategoryId,
} from "./release-about-generator.js";
import type {
  ReleaseDescriptor,
  ReleaseDescriptorCategoryId,
} from "./release-descriptor-ontology.js";

const ontologyCategoriesByProfileCategory: Readonly<
  Record<
    ReleaseProfileCategoryId,
    readonly ReleaseDescriptorCategoryId[]
  >
> = {
  genres: ["genre"],
  influences: ["influence"],
  direction: ["direction"],
  elements: ["element"],
  instrumentation: ["instrumentation"],
  production: ["production"],
  "harmony-theory": ["theory"],
  rhythm: ["rhythm"],
  "moods-emotions": ["mood", "attitude"],
  qualities: ["sonic-quality", "energy"],
  themes: ["theme"],
  songwriting: ["songwriting"],
  identity: ["identity"],
  performance: ["performance"],
  context: ["context"],
  place: ["place"],
};

const profileCategoryByOntologyCategory: Readonly<
  Record<
    ReleaseDescriptorCategoryId,
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

export function getReleaseProfileDescriptorScope(
  profileCategoryId: ReleaseProfileCategoryId,
): readonly ReleaseDescriptorCategoryId[] {
  return ontologyCategoriesByProfileCategory[
    profileCategoryId
  ];
}

export function getReleaseProfileCategoryForDescriptor(
  descriptor: ReleaseDescriptor,
): ReleaseProfileCategoryId {
  return profileCategoryByOntologyCategory[
    descriptor.category
  ];
}
