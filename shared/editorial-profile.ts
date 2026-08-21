export const editorialProfileCategoryIds = [
  "genre",
  "influence",
  "direction",
  "element",
  "instrumentation",
  "production",
  "theory",
  "rhythm",
  "mood",
  "attitude",
  "energy",
  "sonic-quality",
  "theme",
  "songwriting",
  "identity",
  "performance",
  "context",
  "place",
] as const;

export type EditorialProfileCategoryId =
  (typeof editorialProfileCategoryIds)[number];

export type EditorialProfileCategoryValues = Partial<
  Record<EditorialProfileCategoryId, readonly string[]>
>;

export type ReleaseEditorialStorageSnapshot = {
  descriptionStyle: string;
  descriptorIds: EditorialProfileCategoryValues;
  customDescriptors: EditorialProfileCategoryValues;
};

export const defaultReleaseDescriptionStyle =
  "default-release";

export const releaseEditorialDescriptionStylePath =
  "release.editorial.description_style";

const categoryStorageKey: Readonly<
  Record<EditorialProfileCategoryId, string>
> = {
  genre: "genre",
  influence: "influence",
  direction: "direction",
  element: "element",
  instrumentation: "instrumentation",
  production: "production",
  theory: "theory",
  rhythm: "rhythm",
  mood: "mood",
  attitude: "attitude",
  energy: "energy",
  "sonic-quality": "sonic_quality",
  theme: "theme",
  songwriting: "songwriting",
  identity: "identity",
  performance: "performance",
  context: "context",
  place: "place",
};

const categoryByStorageKey = new Map(
  Object.entries(categoryStorageKey).map(
    ([category, key]) => [
      key,
      category as EditorialProfileCategoryId,
    ],
  ),
);

export function releaseEditorialDescriptorPath(
  category: EditorialProfileCategoryId,
): string {
  return `release.editorial.profile.${categoryStorageKey[category]}`;
}

export function releaseEditorialCustomDescriptorPath(
  category: EditorialProfileCategoryId,
): string {
  return `release.editorial.profile_custom.${categoryStorageKey[category]}`;
}

export const releaseEditorialStoragePaths = [
  releaseEditorialDescriptionStylePath,
  ...editorialProfileCategoryIds.map(
    releaseEditorialDescriptorPath,
  ),
  ...editorialProfileCategoryIds.map(
    releaseEditorialCustomDescriptorPath,
  ),
] as const;

export function isReleaseEditorialStoragePath(
  value: string,
): boolean {
  return (
    value === releaseEditorialDescriptionStylePath ||
    value.startsWith("release.editorial.profile.") ||
    value.startsWith("release.editorial.profile_custom.")
  );
}

function categoryForStoragePath(
  metadataPath: string,
): EditorialProfileCategoryId | null {
  const prefixes = [
    "release.editorial.profile.",
    "release.editorial.profile_custom.",
  ];

  for (const prefix of prefixes) {
    if (!metadataPath.startsWith(prefix)) continue;

    return (
      categoryByStorageKey.get(
        metadataPath.slice(prefix.length),
      ) ?? null
    );
  }

  return null;
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

export function readEditorialObjectPath(
  document: unknown,
  metadataPath: string,
): unknown {
  let current = document;

  for (const segment of metadataPath.split(".")) {
    if (
      !isRecord(current) ||
      !Object.prototype.hasOwnProperty.call(
        current,
        segment,
      )
    ) {
      return undefined;
    }

    current = current[segment];
  }

  return current;
}

function readStringArray(
  value: unknown,
): string[] {
  if (!Array.isArray(value)) return [];

  return value.filter(
    (entry): entry is string =>
      typeof entry === "string" &&
      entry.trim().length > 0,
  );
}

export function buildReleaseEditorialStorageSnapshot(
  readValue: (metadataPath: string) => unknown,
): ReleaseEditorialStorageSnapshot {
  const styleValue = readValue(
    releaseEditorialDescriptionStylePath,
  );
  const descriptorIds: Record<
    string,
    readonly string[]
  > = {};
  const customDescriptors: Record<
    string,
    readonly string[]
  > = {};

  for (const category of editorialProfileCategoryIds) {
    const ids = readStringArray(
      readValue(
        releaseEditorialDescriptorPath(category),
      ),
    );
    const custom = readStringArray(
      readValue(
        releaseEditorialCustomDescriptorPath(category),
      ),
    );

    if (ids.length > 0) {
      descriptorIds[category] = ids;
    }

    if (custom.length > 0) {
      customDescriptors[category] = custom;
    }
  }

  return {
    descriptionStyle:
      typeof styleValue === "string" &&
      styleValue.trim()
        ? styleValue.trim()
        : defaultReleaseDescriptionStyle,
    descriptorIds:
      descriptorIds as EditorialProfileCategoryValues,
    customDescriptors:
      customDescriptors as EditorialProfileCategoryValues,
  };
}

export function releaseEditorialSnapshotEntries(
  snapshot: ReleaseEditorialStorageSnapshot,
): Array<{
  path: string;
  value: string | string[];
}> {
  return [
    {
      path: releaseEditorialDescriptionStylePath,
      value: snapshot.descriptionStyle,
    },
    ...editorialProfileCategoryIds.flatMap(
      (category) => [
        {
          path: releaseEditorialDescriptorPath(category),
          value: [
            ...(snapshot.descriptorIds[category] ?? []),
          ],
        },
        {
          path: releaseEditorialCustomDescriptorPath(category),
          value: [
            ...(snapshot.customDescriptors[category] ?? []),
          ],
        },
      ],
    ),
  ];
}

export function releaseEditorialSnapshotValue(
  snapshot: ReleaseEditorialStorageSnapshot,
  metadataPath: string,
): string | string[] {
  if (
    metadataPath ===
    releaseEditorialDescriptionStylePath
  ) {
    return snapshot.descriptionStyle;
  }

  const category =
    categoryForStoragePath(metadataPath);

  if (!category) return [];

  if (
    metadataPath.startsWith(
      "release.editorial.profile_custom.",
    )
  ) {
    return [
      ...(snapshot.customDescriptors[category] ?? []),
    ];
  }

  return [
    ...(snapshot.descriptorIds[category] ?? []),
  ];
}

function assertUniqueStringArray(
  value: unknown,
  label: string,
  validateEntry: (entry: string) => boolean,
): asserts value is string[] {
  if (
    !Array.isArray(value) ||
    value.length > 128 ||
    !value.every(
      (entry) =>
        typeof entry === "string" &&
        entry === entry.trim() &&
        entry.length > 0 &&
        entry.length <= 240 &&
        !entry.includes("\n") &&
        !entry.includes("\r") &&
        validateEntry(entry),
    ) ||
    new Set(value).size !== value.length
  ) {
    throw new Error(
      `${label} must be a unique string array with valid descriptor values.`,
    );
  }
}

export function assertReleaseEditorialStorageValue(
  metadataPath: string,
  value: unknown,
): void {
  if (
    metadataPath ===
    releaseEditorialDescriptionStylePath
  ) {
    if (
      typeof value !== "string" ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) ||
      value.length > 80
    ) {
      throw new Error(
        "release editorial description_style must be a short kebab-case template id.",
      );
    }
    return;
  }

  const category =
    categoryForStoragePath(metadataPath);

  if (!category) {
    throw new Error(
      `Unsupported release editorial metadata path: ${metadataPath}`,
    );
  }

  if (
    metadataPath.startsWith(
      "release.editorial.profile_custom.",
    )
  ) {
    assertUniqueStringArray(
      value,
      metadataPath,
      () => true,
    );
    return;
  }

  assertUniqueStringArray(
    value,
    metadataPath,
    (entry) =>
      entry.startsWith(`${category}.`) &&
      /^[a-z0-9-]+(?:\.[a-z0-9-]+){3}$/.test(entry),
  );
}
