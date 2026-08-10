import {
  buildReleaseDirectoryId,
} from "../shared/ingest-builder.js";

export type IngestTargetRelease = {
  id: string;
  releaseTitle?: string;
  primaryArtistName?: string;
  releaseDate?: string;
  releaseType?: string;
};

export type IngestTargetReleaseMode =
  | "auto"
  | "new"
  | "existing";

export type IngestTargetIdentity = {
  releaseTitle: string;
  releaseArtist: string;
  releaseDate?: string;
};

function normalizeIdentityValue(
  value: string | undefined,
): string {
  return (value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

export function findAutomaticIngestTargetRelease(
  releases: readonly IngestTargetRelease[],
  identity: IngestTargetIdentity,
): IngestTargetRelease | null {
  const releaseTitle = normalizeIdentityValue(
    identity.releaseTitle,
  );
  const releaseArtist = normalizeIdentityValue(
    identity.releaseArtist,
  );
  const releaseDate = identity.releaseDate?.trim() ?? "";

  if (!releaseTitle) {
    return null;
  }

  if (
    releaseDate &&
    /^\d{4}-\d{2}-\d{2}$/.test(releaseDate)
  ) {
    const generatedId = buildReleaseDirectoryId(
      releaseDate,
      identity.releaseTitle,
    );
    const idMatch = releases.find(
      (release) => release.id === generatedId,
    );

    if (idMatch) {
      return idMatch;
    }
  }

  if (!releaseArtist) {
    return null;
  }

  const matches = releases.filter(
    (release) =>
      normalizeIdentityValue(
        release.releaseTitle,
      ) === releaseTitle &&
      normalizeIdentityValue(
        release.primaryArtistName,
      ) === releaseArtist,
  );

  return matches.length === 1
    ? matches[0]
    : null;
}

export function buildExistingReleaseIdentitySeed(
  release: IngestTargetRelease,
): {
  releaseArtist: string;
  releaseTitle: string;
  targetReleaseId: string;
  releaseDate?: string;
  releaseType?: string;
} {
  return {
    releaseArtist:
      release.primaryArtistName?.trim() ?? "",
    releaseTitle:
      release.releaseTitle?.trim() ||
      release.id,
    targetReleaseId: release.id,
    ...(release.releaseDate
      ? { releaseDate: release.releaseDate }
      : {}),
    ...(release.releaseType
      ? { releaseType: release.releaseType }
      : {}),
  };
}
