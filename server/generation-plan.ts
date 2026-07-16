import type {
  GeneratedMetadataDocument,
  GeneratedMetadataPreview,
  MetadataFileStatus,
  MetadataGenerationPlan,
  MetadataGenerationScope,
  ReleaseScanResult,
} from "./types.js";

type GenerationPlanOptions = {
  scope?: MetadataGenerationScope;
  trackId?: string;
};

function buildExistingFileMap(
  release: ReleaseScanResult,
): Map<string, MetadataFileStatus> {
  const files = new Map<
    string,
    MetadataFileStatus
  >();

  for (const file of release.metadataFiles) {
    files.set(file.relativePath, file);
  }

  for (const track of release.tracks) {
    for (const file of track.metadataFiles) {
      files.set(file.relativePath, file);
    }
  }

  return files;
}

function documentMatchesScope(
  document: GeneratedMetadataDocument,
  release: ReleaseScanResult,
  scope: MetadataGenerationScope,
  trackId?: string,
): boolean {
  if (scope === "all") {
    return true;
  }

  if (scope === "release") {
    return document.relativePath.startsWith(
      `${release.relativePath}/`,
    ) && !document.relativePath.includes("/tracks/");
  }

  if (!trackId) {
    throw new Error(
      "trackId is required for track-scoped generation",
    );
  }

  const track = release.tracks.find(
    (candidate) => candidate.id === trackId,
  );

  if (!track) {
    throw new Error(
      `Track not found in release: ${trackId}`,
    );
  }

  return document.relativePath.startsWith(
    `${track.relativePath}/`,
  );
}

export function buildMetadataGenerationPlan(
  release: ReleaseScanResult,
  generatedPreview: GeneratedMetadataPreview,
  options: GenerationPlanOptions = {},
): MetadataGenerationPlan {
  const scope = options.scope ?? "all";
  const trackId = options.trackId;

  const existingFiles =
    buildExistingFileMap(release);

  const selectedDocuments =
    generatedPreview.documents.filter(
      (document) =>
        documentMatchesScope(
          document,
          release,
          scope,
          trackId,
        ),
    );

  const items = selectedDocuments.map(
    (document) => {
      const existingFile = existingFiles.get(
        document.relativePath,
      );

      const exists = existingFile?.exists ?? false;

      return {
        storageRole: document.storageRole,
        filename: document.filename,
        relativePath: document.relativePath,
        action: exists
          ? ("blocked" as const)
          : ("create" as const),
        reason: exists
          ? "Target file already exists; overwrite is not allowed."
          : "Target file is missing and may be created.",
        content: document.content,
        validated: document.validated,
      };
    },
  );

  const createCount = items.filter(
    (item) => item.action === "create",
  ).length;

  const blockedCount = items.filter(
    (item) => item.action === "blocked",
  ).length;

  return {
    releaseId: release.id,
    scope,
    ...(trackId ? { trackId } : {}),
    items,
    summary: {
      createCount,
      blockedCount,
    },
    warnings: [...generatedPreview.warnings],
  };
}
