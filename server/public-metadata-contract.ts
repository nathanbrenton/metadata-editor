/*
 * Public metadata contract.
 *
 * Publication is allow-listed: only the paths named here leave the private
 * Library in release.json / track.json. A key that is in neither list is
 * "unclassified" — it is withheld from the public package and reported by
 * Library validation so a person decides whether it is public.
 *
 * Paths use `[]` for "each array entry". To publish a new field, add its
 * path to the matching public list; to keep a known field private on
 * purpose, add it to the private list so validation stays quiet.
 */

/*
 * Revision of the public projection (these lists plus the documents embedded
 * in catalog.json). It is part of every release's publication fingerprint:
 * bump it whenever a change here alters what an already-published release
 * would contain, so each release is offered "Update Web Package" instead of
 * being reported as up to date.
 *
 *   1  deny-list sanitizers
 *   2  allow-list; track artwork paths and release.editorial withheld;
 *      catalog.json embeds release and track documents
 */
export const publicMetadataContractVersion = 2;

const personCredit = ["name", "role", "sort_name"] as const;

function each(
  base: string,
  leaves: readonly string[],
): string[] {
  return leaves.map((leaf) => `${base}.${leaf}`);
}

const artworkEntryPublic = [
  "id",
  "role",
  "primary",
  "description",
  "credits",
  "copyright",
] as const;

/* Canonical-Library locations; never meaningful to a public consumer. */
const artworkEntryPrivate = [
  "master_path",
  "web_path",
  "embedded_path",
] as const;

export type PublicMetadataDocumentKind =
  | "release"
  | "track"
  | "track-credits";

type MetadataContract = {
  /* Name of the TOML table the document lives under. */
  root: "release" | "track";
  publicPaths: readonly string[];
  privatePaths: readonly string[];
};

const releaseContract: MetadataContract = {
  root: "release",
  publicPaths: [
    ...each("release", [
      "id",
      "title",
      "subtitle",
      "version",
      "type",
      "status",
      "language",
      "script",
      "description",
      "explicit",
      "genres",
      "styles",
      "moods",
      "tags",
    ]),
    ...each("release.identifiers", ["upc", "ean", "barcode"]),
    ...each("release.primary_artist", ["id", "name", "sort_name"]),
    ...each("release.dates", ["release", "original_release"]),
    ...each("release.numbering", ["track_total", "disc_total"]),
    ...each("release.rights", [
      "copyright",
      "phonographic_copyright",
      "publisher",
      "label",
      "distributor",
      "license",
    ]),
    ...each("release.provenance", ["origin", "note"]),
    ...each("release.artwork[]", artworkEntryPublic),
    ...[
      "performers",
      "contributors",
      "songwriters",
      "composers",
      "lyricists",
    ].flatMap((family) =>
      each(`release.credits.${family}[]`, personCredit),
    ),
  ],
  privatePaths: [
    ...each("release.artwork[]", artworkEntryPrivate),
    /* Authoring aid for the About generator, not listener-facing data. */
    "release.editorial",
  ],
};

const trackContract: MetadataContract = {
  root: "track",
  publicPaths: [
    ...each("track", [
      "id",
      "title",
      "version",
      "subtitle",
      "display_title",
      "sort_title",
      "language",
      "script",
      "explicit",
    ]),
    ...each("track.identifiers", [
      "isrc",
      "iswc",
      "discogs_track_position",
    ]),
    ...each("track.numbering", [
      "track_number",
      "track_total",
      "disc_number",
      "disc_total",
    ]),
    ...each("track.dates", ["release", "original_release"]),
    ...each("track.rights", [
      "copyright",
      "phonographic_copyright",
      "publisher",
      "license",
    ]),
    ...each("track.text", [
      "lyrics",
      "lyrics_language",
      "lyrics_script",
      "lyrics_copyright",
      "lyrics_source",
      "description",
      "comment",
    ]),
    ...each("track.audio", [
      "bpm",
      "key",
      "camelot_key",
      "time_signature",
      "tuning_hz",
    ]),
    ...each("track.classification", [
      "genres",
      "styles",
      "moods",
      "tags",
    ]),
    ...each("track.provenance", ["origin", "note"]),
    /* Registered against track.toml; normally stored in track-credits.toml. */
    ...each("track.album_artists[]", ["name", "sort_name"]),
    ...each("track.artwork[]", artworkEntryPublic),
  ],
  privatePaths: [
    ...each("track.artwork[]", artworkEntryPrivate),
    "track.assets",
    "track.credit_sources",
    "track.production_note_sources",
  ],
};

const trackCreditsContract: MetadataContract = {
  root: "track",
  publicPaths: [
    ...each("track.primary_artist", ["name", "sort_name"]),
    ...each("track.album_artists[]", ["name", "sort_name"]),
    ...[
      "featured_artists",
      "remixers",
      "performers",
      "contributors",
      "songwriters",
      "composers",
      "lyricists",
    ].flatMap((family) => [
      `track.${family}[]`,
      ...each(`track.${family}[]`, personCredit),
    ]),
    ...each("track.samples[]", [
      "relationship_type",
      "source_title",
      "source_artist",
      "source_writers",
      "source_release",
      "source_year",
      "source_isrc",
      "source_iswc",
      "usage_description",
      "credit_text",
    ]),
  ],
  privatePaths: [
    "track.samples[].notes",
    "track.sample_clearances",
  ],
};

/* Editor bookkeeping that is private wherever it appears. */
const privateKeysAnywhere: ReadonlySet<string> = new Set([
  "editor_only",
]);

const contracts: Record<
  PublicMetadataDocumentKind,
  MetadataContract
> = {
  release: releaseContract,
  track: trackContract,
  "track-credits": trackCreditsContract,
};

export function publicMetadataContractPaths(
  kind: PublicMetadataDocumentKind,
): {
  publicPaths: readonly string[];
  privatePaths: readonly string[];
} {
  const { publicPaths, privatePaths } = contracts[kind];
  return { publicPaths, privatePaths };
}

export type PublicMetadataFilterResult = {
  /* The public projection of the document's root table. */
  value: Record<string, unknown>;
  /* Paths that are in neither list and were therefore withheld. */
  unclassifiedPaths: string[];
};

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isUnder(
  candidatePath: string,
  listedPath: string,
): boolean {
  return (
    candidatePath === listedPath ||
    candidatePath.startsWith(`${listedPath}.`) ||
    candidatePath.startsWith(`${listedPath}[]`)
  );
}

/* True when the listed paths contain `path` itself or something beneath it. */
function leadsTo(
  listedPaths: readonly string[],
  candidatePath: string,
): boolean {
  return listedPaths.some((listedPath) =>
    isUnder(listedPath, candidatePath),
  );
}

/*
 * Projects one document's root table (`[release]` or `[track]`) onto the
 * public contract. Input is never mutated.
 */
export function filterPublicMetadata(
  kind: PublicMetadataDocumentKind,
  rootValue: unknown,
): PublicMetadataFilterResult {
  const contract = contracts[kind];
  const unclassified = new Set<string>();
  const dropped = Symbol("dropped");

  const isPrivate = (candidatePath: string, key: string | null) =>
    (key !== null && privateKeysAnywhere.has(key)) ||
    contract.privatePaths.some((privatePath) =>
      isUnder(candidatePath, privatePath),
    );
  const isPublicLeaf = (candidatePath: string) =>
    contract.publicPaths.includes(candidatePath);

  const project = (
    value: unknown,
    candidatePath: string,
    key: string | null,
  ): unknown => {
    if (isPrivate(candidatePath, key)) {
      return dropped;
    }

    if (Array.isArray(value)) {
      const entryPath = `${candidatePath}[]`;
      const holdsStructuredEntries = value.some(
        (entry) => isRecord(entry) || Array.isArray(entry),
      );

      if (!holdsStructuredEntries) {
        /* A list of scalars (or an empty list) is one value. */
        if (
          isPublicLeaf(candidatePath) ||
          isPublicLeaf(entryPath) ||
          (value.length === 0 &&
            leadsTo(contract.publicPaths, entryPath))
        ) {
          return [...value];
        }

        unclassified.add(candidatePath);
        return dropped;
      }

      if (!leadsTo(contract.publicPaths, entryPath)) {
        unclassified.add(candidatePath);
        return dropped;
      }

      return value
        .map((entry) => project(entry, entryPath, null))
        .filter((entry) => entry !== dropped);
    }

    if (isRecord(value)) {
      const entries = Object.entries(value);

      if (!leadsTo(contract.publicPaths, candidatePath)) {
        unclassified.add(candidatePath);
        return dropped;
      }

      const projected: Record<string, unknown> = {};

      for (const [childKey, childValue] of entries) {
        const child = project(
          childValue,
          `${candidatePath}.${childKey}`,
          childKey,
        );

        if (child !== dropped) {
          projected[childKey] = child;
        }
      }

      if (
        entries.length > 0 &&
        Object.keys(projected).length === 0 &&
        candidatePath !== contract.root
      ) {
        /* Nothing public remained; do not publish an empty shell. */
        return dropped;
      }

      return projected;
    }

    if (isPublicLeaf(candidatePath)) {
      return value;
    }

    unclassified.add(candidatePath);
    return dropped;
  };

  const projected = project(
    isRecord(rootValue) ? rootValue : {},
    contract.root,
    null,
  );

  return {
    value: isRecord(projected) ? projected : {},
    unclassifiedPaths: [...unclassified].sort(),
  };
}
