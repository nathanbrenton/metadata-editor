/*
 * Metadata readiness is intentionally derived in the client from scan/detail
 * responses. The filesystem scanner reports every expected TOML; this helper
 * explains which gaps are core, credit-oriented, or optional supplemental.
 */

export type ReadinessMetadataFile = {
  filename: string;
  relativePath: string;
  exists: boolean;
};

export type ReadinessTrack = {
  id: string;
  metadataFiles: ReadinessMetadataFile[];
};

export type ReadinessRelease = {
  id: string;
  metadataFiles: ReadinessMetadataFile[];
  tracks: ReadinessTrack[];
};

export type ReadinessDocument = {
  filename: string;
  scope: "release" | "track";
  trackId?: string;
  parsed: Record<string, unknown>;
};

export type ReadinessFieldDefinition = {
  label: string;
  scope: "release" | "track" | string;
  storageFileRole: string;
  tomlPath: string;
  required: boolean;
  presentation?: {
    group?: string;
  };
};

export type MetadataDocumentImportance =
  | "core"
  | "credits"
  | "supplemental";

export type MissingMetadataDocument =
  ReadinessMetadataFile & {
    importance: MetadataDocumentImportance;
    description: string;
    tab:
      | "overview"
      | "credits"
      | "recording"
      | "notes"
      | "settings";
  };

export type RequiredFieldIssue = {
  label: string;
  tomlPath: string;
  tab: "overview" | "credits" | "recording" | "rights" | "lyrics" | "artwork" | "notes";
};

export type MetadataReadinessScope = {
  id: "release" | string;
  kind: "release" | "track";
  missingDocuments: MissingMetadataDocument[];
  missingRequiredFields: RequiredFieldIssue[];
};

export type MetadataReadinessSummary = {
  scopes: MetadataReadinessScope[];
  missingCoreDocuments: number;
  missingCreditDocuments: number;
  missingSupplementalDocuments: number;
  missingRequiredFields: number;
  actionableCount: number;
  totalMissingDocuments: number;
};

const metadataDocumentDefinitions: Record<
  string,
  {
    importance: MetadataDocumentImportance;
    description: string;
    tab: MissingMetadataDocument["tab"];
  }
> = {
  "release.toml": {
    importance: "core",
    description: "Core release identity, dates, artists, rights, and numbering.",
    tab: "overview",
  },
  "track.toml": {
    importance: "core",
    description: "Core track identity, numbering, language, and musical analysis.",
    tab: "overview",
  },
  "track-credits.toml": {
    importance: "credits",
    description: "Performer and recording, mixing, mastering, and writing credits.",
    tab: "recording",
  },
  "release-settings.toml": {
    importance: "supplemental",
    description: "Optional release workflow and export settings.",
    tab: "settings",
  },
  "release-production-notes.toml": {
    importance: "supplemental",
    description: "Optional release-level production and text notes.",
    tab: "notes",
  },
  "track-production-notes.toml": {
    importance: "supplemental",
    description: "Optional track-level production and text notes.",
    tab: "notes",
  },
};

export function classifyMissingMetadataDocument(
  file: ReadinessMetadataFile,
): MissingMetadataDocument {
  const definition =
    metadataDocumentDefinitions[file.filename] ?? {
      importance: "supplemental" as const,
      description: "Additional metadata document expected by this workspace.",
      tab: "overview" as const,
    };

  return {
    ...file,
    ...definition,
  };
}

export function summarizeMissingMetadataDocuments(
  files: readonly ReadinessMetadataFile[],
): {
  core: number;
  credits: number;
  supplemental: number;
  total: number;
  documents: MissingMetadataDocument[];
} {
  const documents = files
    .filter((file) => !file.exists)
    .map(classifyMissingMetadataDocument);

  return {
    core: documents.filter(
      (file) => file.importance === "core",
    ).length,
    credits: documents.filter(
      (file) => file.importance === "credits",
    ).length,
    supplemental: documents.filter(
      (file) => file.importance === "supplemental",
    ).length,
    total: documents.length,
    documents,
  };
}

export function summarizeReleaseScanReadiness(
  release: ReadinessRelease,
): ReturnType<typeof summarizeMissingMetadataDocuments> {
  return summarizeMissingMetadataDocuments([
    ...release.metadataFiles,
    ...release.tracks.flatMap(
      (track) => track.metadataFiles,
    ),
  ]);
}

function readPathValue(
  document: ReadinessDocument,
  tomlPath: string,
): unknown {
  let current: unknown = document.parsed;

  for (const segment of tomlPath.split(".")) {
    if (
      typeof current !== "object" ||
      current === null ||
      Array.isArray(current) ||
      !(segment in current)
    ) {
      return undefined;
    }

    current = (
      current as Record<string, unknown>
    )[segment];
  }

  return current;
}

function hasMeaningfulMetadataValue(
  value: unknown,
): boolean {
  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (typeof value === "boolean") {
    return true;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return value !== undefined && value !== null;
}

function fieldTab(
  field: ReadinessFieldDefinition,
): RequiredFieldIssue["tab"] {
  const group = field.presentation?.group ?? "";

  if (/artist|performer|writer/i.test(group)) {
    return "credits";
  }

  if (/recording|mixing|mastering/i.test(group)) {
    return "recording";
  }

  if (/right|copyright|publishing/i.test(group)) {
    return "rights";
  }

  if (/lyric|language|writing system/i.test(group)) {
    return "lyrics";
  }

  if (/artwork/i.test(group)) {
    return "artwork";
  }

  if (/notes|text|production/i.test(group)) {
    return "notes";
  }

  return "overview";
}

function requiredFieldIssuesForScope({
  kind,
  trackId,
  documents,
  fields,
}: {
  kind: "release" | "track";
  trackId?: string;
  documents: readonly ReadinessDocument[];
  fields: readonly ReadinessFieldDefinition[];
}): RequiredFieldIssue[] {
  const relevantDocuments = documents.filter(
    (document) =>
      document.scope === kind &&
      (kind === "release" ||
        document.trackId === trackId),
  );

  return fields
    .filter(
      (field) =>
        field.required &&
        field.scope === kind &&
        !field.tomlPath.includes("[]"),
    )
    .filter((field) => {
      const expectedFilename =
        field.storageFileRole === "release"
          ? "release.toml"
          : field.storageFileRole === "track"
            ? "track.toml"
            : null;

      if (!expectedFilename) {
        return false;
      }

      const document = relevantDocuments.find(
        (candidate) =>
          candidate.filename === expectedFilename,
      );

      if (!document) {
        // The missing core document already represents this problem.
        return false;
      }

      return !hasMeaningfulMetadataValue(
        readPathValue(document, field.tomlPath),
      );
    })
    .map((field) => ({
      label: field.label,
      tomlPath: field.tomlPath,
      tab: fieldTab(field),
    }));
}

export function buildMetadataReadiness({
  release,
  documents,
  fields,
}: {
  release: ReadinessRelease;
  documents: readonly ReadinessDocument[];
  fields: readonly ReadinessFieldDefinition[];
}): MetadataReadinessSummary {
  const releaseMissing =
    summarizeMissingMetadataDocuments(
      release.metadataFiles,
    );

  const scopes: MetadataReadinessScope[] = [
    {
      id: "release",
      kind: "release",
      missingDocuments:
        releaseMissing.documents,
      missingRequiredFields:
        requiredFieldIssuesForScope({
          kind: "release",
          documents,
          fields,
        }),
    },
    ...release.tracks.map((track) => {
      const missing =
        summarizeMissingMetadataDocuments(
          track.metadataFiles,
        );

      return {
        id: track.id,
        kind: "track" as const,
        missingDocuments: missing.documents,
        missingRequiredFields:
          requiredFieldIssuesForScope({
            kind: "track",
            trackId: track.id,
            documents,
            fields,
          }),
      };
    }),
  ];

  const missingDocuments = scopes.flatMap(
    (scope) => scope.missingDocuments,
  );
  const missingRequiredFields = scopes.reduce(
    (total, scope) =>
      total + scope.missingRequiredFields.length,
    0,
  );
  const missingCoreDocuments =
    missingDocuments.filter(
      (file) => file.importance === "core",
    ).length;
  const missingCreditDocuments =
    missingDocuments.filter(
      (file) => file.importance === "credits",
    ).length;
  const missingSupplementalDocuments =
    missingDocuments.filter(
      (file) =>
        file.importance === "supplemental",
    ).length;

  return {
    scopes,
    missingCoreDocuments,
    missingCreditDocuments,
    missingSupplementalDocuments,
    missingRequiredFields,
    actionableCount:
      missingCoreDocuments +
      missingCreditDocuments +
      missingRequiredFields,
    totalMissingDocuments:
      missingDocuments.length,
  };
}

export function readinessBadgeLabel(
  summary: {
    core: number;
    credits: number;
    supplemental: number;
  },
): string {
  if (summary.core > 0) {
    return `${summary.core} core missing`;
  }

  if (summary.credits > 0) {
    return `${summary.credits} credit ${
      summary.credits === 1 ? "file" : "files"
    } missing`;
  }

  if (summary.supplemental > 0) {
    return `${summary.supplemental} optional`;
  }

  return "Core complete";
}

export function readinessTone(
  summary: {
    core: number;
    credits: number;
    supplemental: number;
  },
): "missing" | "warning" | "supplemental" | "complete" {
  if (summary.core > 0) {
    return "missing";
  }

  if (summary.credits > 0) {
    return "warning";
  }

  if (summary.supplemental > 0) {
    return "supplemental";
  }

  return "complete";
}
