import {
  createReadStream,
} from "node:fs";
import {
  createHash,
} from "node:crypto";
import {
  lstat,
  readFile,
  readdir,
  realpath,
} from "node:fs/promises";
import path from "node:path";

import { parse } from "smol-toml";

import {
  detectFfmpegCapabilities,
} from "./ffmpeg-capabilities.js";
import {
  assertPathWithinRoot,
  toLibraryRelativePath,
} from "./media-root.js";
import {
  metadataFieldRegistry,
} from "./metadata-registry.js";
import {
  buildMediaProcessingPlan,
} from "./media-processing/plan.js";
import {
  scanMediaLibrary,
} from "./scanner.js";
import type {
  FfmpegCapabilities,
  ReleaseScanResult,
  TrackScanResult,
} from "./types.js";
import {
  parseTrackDirectoryId,
} from "../shared/track-directory-naming.js";
import {
  isPrimaryArtworkMasterForOwner,
} from "../shared/artwork-role-path.js";

export type LibraryValidationSeverity =
  | "warning"
  | "blocked";

export type LibraryValidationStatus =
  | "ok"
  | "warning"
  | "blocked";

export type LibraryValidationIssue = {
  code: string;
  severity: LibraryValidationSeverity;
  relativePath: string;
  message: string;
  suggestion?: string;
};

export type TrackValidationResult = {
  trackId: string;
  relativePath: string;
  status: LibraryValidationStatus;
  issues: LibraryValidationIssue[];
};

export type ReleaseValidationResult = {
  releaseId: string;
  relativePath: string;
  status: LibraryValidationStatus;
  issues: LibraryValidationIssue[];
  tracks: TrackValidationResult[];
};

export type LibraryValidationReport = {
  schema: {
    name: "metadata-editor-library-validation";
    version: 1;
  };
  scope: "library" | "release";
  releaseId?: string;
  mediaRoot: string;
  generatedAt: string;
  readOnly: true;
  verifyHashes: boolean;
  status: LibraryValidationStatus;
  summary: {
    releaseCount: number;
    trackCount: number;
    okReleaseCount: number;
    warningReleaseCount: number;
    blockedReleaseCount: number;
    warningCount: number;
    blockedCount: number;
  };
  issues: LibraryValidationIssue[];
  releases: ReleaseValidationResult[];
};

export type ValidateMediaLibraryOptions = {
  releaseId?: string;
  verifyHashes?: boolean;
  generatedAt?: string;
  ffmpegCapabilities?: FfmpegCapabilities;
};

type ParsedTomlDocument = {
  filename: string;
  relativePath: string;
  parsed: Record<string, unknown>;
};

type ReleaseDocuments = {
  byRelativePath: Map<string, ParsedTomlDocument>;
  release: Map<string, ParsedTomlDocument>;
  tracks: Map<string, Map<string, ParsedTomlDocument>>;
};

type TreeEntry = {
  relativePath: string;
  absolutePath: string;
  kind: "file" | "directory" | "symlink" | "other";
};

const requiredReleaseDocument = "release.toml";
const optionalReleaseDocuments = [
  "release-settings.toml",
  "release-production-notes.toml",
] as const;
const requiredTrackDocument = "track.toml";
const optionalTrackDocuments = [
  "track-credits.toml",
  "track-production-notes.toml",
] as const;
const ignoredDirectoryNames = new Set([
  ".metadata-backups",
  ".metadata-editor-operations",
]);
const ignoredFilenames = new Set([
  ".DS_Store",
]);
const releaseIdPattern = /^\d{4}-\d{2}-\d{2}_[A-Za-z0-9][A-Za-z0-9._-]*$/;
const completeIsoDatePattern = /^\d{4}-\d{2}-\d{2}$/;
const partialIsoDatePattern = /^\d{4}(?:-\d{2})?$/;
const dateLeafNames = new Set([
  "date",
  "release_date",
  "original_release",
  "source_date",
  "recorded_start",
  "recorded_end",
  "mixed",
  "mastered",
  "composed",
  "arranged",
  "remixed",
  "remastered",
  "expiration_date",
]);

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function isNonBlankString(
  value: unknown,
): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0
  );
}

function issue(
  code: string,
  severity: LibraryValidationSeverity,
  relativePath: string,
  message: string,
  suggestion?: string,
): LibraryValidationIssue {
  return {
    code,
    severity,
    relativePath,
    message,
    ...(suggestion ? { suggestion } : {}),
  };
}

function statusForIssues(
  issues: readonly LibraryValidationIssue[],
): LibraryValidationStatus {
  if (issues.some((item) => item.severity === "blocked")) {
    return "blocked";
  }

  if (issues.some((item) => item.severity === "warning")) {
    return "warning";
  }

  return "ok";
}

function readPath(
  root: unknown,
  dottedPath: string,
): unknown {
  let current = root;

  for (const segment of dottedPath.split(".")) {
    if (!isRecord(current) || !(segment in current)) {
      return undefined;
    }

    current = current[segment];
  }

  return current;
}

function isCompleteIsoDate(
  value: string,
): boolean {
  if (!completeIsoDatePattern.test(value)) {
    return false;
  }

  const [yearText, monthText, dayText] = value.split("-");
  const year = Number.parseInt(yearText ?? "", 10);
  const month = Number.parseInt(monthText ?? "", 10);
  const day = Number.parseInt(dayText ?? "", 10);
  const candidate = new Date(Date.UTC(year, month - 1, day));

  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

function isDatePath(
  dottedPath: string,
): boolean {
  const normalized = dottedPath
    .replace(/\[\d+\]/g, "[]")
    .toLowerCase();
  const leaf = normalized.split(".").at(-1) ?? normalized;

  return (
    /\.dates\.(release|original_release)$/.test(normalized) ||
    dateLeafNames.has(leaf) ||
    leaf.endsWith("_date")
  );
}

function collectDateIssues(
  value: unknown,
  relativePath: string,
  dottedPath = "",
): LibraryValidationIssue[] {
  const issues: LibraryValidationIssue[] = [];

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      issues.push(
        ...collectDateIssues(
          entry,
          relativePath,
          `${dottedPath}[${index}]`,
        ),
      );
    });
    return issues;
  }

  if (!isRecord(value)) {
    if (
      typeof value === "string" &&
      value.trim() &&
      isDatePath(dottedPath)
    ) {
      const trimmed = value.trim();

      if (isCompleteIsoDate(trimmed)) {
        return issues;
      }

      issues.push(
        issue(
          partialIsoDatePattern.test(trimmed)
            ? "partial-date-value"
            : "invalid-date-value",
          "warning",
          relativePath,
          `${dottedPath} contains ${JSON.stringify(trimmed)} instead of a complete valid YYYY-MM-DD calendar date.`,
          "Preserve intentional historical uncertainty, or replace the value through the calendar field when a complete date is known.",
        ),
      );
    }

    return issues;
  }

  for (const [key, child] of Object.entries(value)) {
    issues.push(
      ...collectDateIssues(
        child,
        relativePath,
        dottedPath ? `${dottedPath}.${key}` : key,
      ),
    );
  }

  return issues;
}

async function collectTreeEntries(
  mediaRoot: string,
  rootPath: string,
): Promise<TreeEntry[]> {
  const entries: TreeEntry[] = [];

  async function walk(directoryPath: string): Promise<void> {
    const children = await readdir(directoryPath, {
      withFileTypes: true,
    });

    for (const child of children) {
      if (
        ignoredFilenames.has(child.name) ||
        ignoredDirectoryNames.has(child.name) ||
        child.name.startsWith(".metadata-editor-")
      ) {
        continue;
      }

      const absolutePath = assertPathWithinRoot(
        mediaRoot,
        path.join(directoryPath, child.name),
      );
      const relativePath = toLibraryRelativePath(
        mediaRoot,
        absolutePath,
      );
      const stats = await lstat(absolutePath);

      if (stats.isSymbolicLink()) {
        entries.push({
          relativePath,
          absolutePath,
          kind: "symlink",
        });
        continue;
      }

      if (stats.isDirectory()) {
        entries.push({
          relativePath,
          absolutePath,
          kind: "directory",
        });
        await walk(absolutePath);
        continue;
      }

      entries.push({
        relativePath,
        absolutePath,
        kind: stats.isFile() ? "file" : "other",
      });
    }
  }

  await walk(rootPath);
  return entries;
}

async function parseTomlDocuments(
  mediaRoot: string,
  release: ReleaseScanResult,
  entries: readonly TreeEntry[],
): Promise<{
  documents: ReleaseDocuments;
  issues: LibraryValidationIssue[];
}> {
  const issues: LibraryValidationIssue[] = [];
  const documents: ReleaseDocuments = {
    byRelativePath: new Map(),
    release: new Map(),
    tracks: new Map(),
  };

  for (const entry of entries) {
    if (
      entry.kind !== "file" ||
      !entry.relativePath.toLowerCase().endsWith(".toml")
    ) {
      continue;
    }

    try {
      const canonicalPath = await realpath(entry.absolutePath);
      assertPathWithinRoot(mediaRoot, canonicalPath);
      const parsed = parse(
        await readFile(canonicalPath, "utf8"),
      );

      if (!isRecord(parsed)) {
        throw new Error("Expected a TOML table at the document root.");
      }

      const document: ParsedTomlDocument = {
        filename: path.basename(entry.relativePath),
        relativePath: entry.relativePath,
        parsed,
      };
      documents.byRelativePath.set(entry.relativePath, document);

      const releasePrefix = `${release.relativePath}/`;
      const trackPrefix = `${release.relativePath}/tracks/`;

      if (
        entry.relativePath.startsWith(releasePrefix) &&
        !entry.relativePath.startsWith(trackPrefix) &&
        path.dirname(entry.relativePath) === release.relativePath
      ) {
        documents.release.set(document.filename, document);
      }

      if (entry.relativePath.startsWith(trackPrefix)) {
        const rest = entry.relativePath.slice(trackPrefix.length);
        const [trackId, ...remaining] = rest.split("/");

        if (trackId && remaining.length === 1) {
          const trackDocuments =
            documents.tracks.get(trackId) ?? new Map();
          trackDocuments.set(document.filename, document);
          documents.tracks.set(trackId, trackDocuments);
        }
      }
    } catch (error) {
      issues.push(
        issue(
          "invalid-toml",
          "blocked",
          entry.relativePath,
          error instanceof Error
            ? error.message
            : "Unable to parse TOML.",
          "Repair the TOML syntax before editing, synchronizing, or publishing this release.",
        ),
      );
    }
  }

  return { documents, issues };
}

function validateRequiredDocuments(
  release: ReleaseScanResult,
): LibraryValidationIssue[] {
  const issues: LibraryValidationIssue[] = [];
  const releaseFiles = new Map(
    release.metadataFiles.map((file) => [file.filename, file]),
  );
  const coreRelease = releaseFiles.get(requiredReleaseDocument);

  if (!coreRelease?.exists) {
    issues.push(
      issue(
        "missing-release-document",
        "blocked",
        `${release.relativePath}/${requiredReleaseDocument}`,
        `${requiredReleaseDocument} is required for release identity and public metadata.`,
      ),
    );
  }

  for (const filename of optionalReleaseDocuments) {
    if (!releaseFiles.get(filename)?.exists) {
      issues.push(
        issue(
          "missing-optional-release-document",
          "warning",
          `${release.relativePath}/${filename}`,
          `${filename} is missing. The release can remain in Library, but its optional authoring surface is incomplete.`,
        ),
      );
    }
  }

  for (const track of release.tracks) {
    const trackFiles = new Map(
      track.metadataFiles.map((file) => [file.filename, file]),
    );

    if (!trackFiles.get(requiredTrackDocument)?.exists) {
      issues.push(
        issue(
          "missing-track-document",
          "blocked",
          `${track.relativePath}/${requiredTrackDocument}`,
          `${requiredTrackDocument} is required for track identity, numbering, and assets.`,
        ),
      );
    }

    for (const filename of optionalTrackDocuments) {
      if (!trackFiles.get(filename)?.exists) {
        issues.push(
          issue(
            "missing-optional-track-document",
            "warning",
            `${track.relativePath}/${filename}`,
            `${filename} is missing. The track remains reviewable, but optional credits or production notes are incomplete.`,
          ),
        );
      }
    }
  }

  return issues;
}

function validateRequiredFields(
  release: ReleaseScanResult,
  documents: ReleaseDocuments,
): LibraryValidationIssue[] {
  const issues: LibraryValidationIssue[] = [];
  const roleToFilename: Record<string, string> = {
    release: "release.toml",
    track: "track.toml",
  };

  for (const field of metadataFieldRegistry) {
    if (!field.required || (field.scope !== "release" && field.scope !== "track")) {
      continue;
    }

    const filename = roleToFilename[field.storageFileRole];

    if (!filename) {
      continue;
    }

    if (field.scope === "release") {
      const document = documents.release.get(filename);

      if (
        document &&
        !isNonBlankString(readPath(document.parsed, field.tomlPath))
      ) {
        issues.push(
          issue(
            "missing-required-release-field",
            "blocked",
            document.relativePath,
            `${field.tomlPath} (${field.label}) is required and must contain a nonblank string.`,
          ),
        );
      }
      continue;
    }

    for (const track of release.tracks) {
      const document = documents.tracks.get(track.id)?.get(filename);

      if (
        document &&
        !isNonBlankString(readPath(document.parsed, field.tomlPath))
      ) {
        issues.push(
          issue(
            "missing-required-track-field",
            "blocked",
            document.relativePath,
            `${field.tomlPath} (${field.label}) is required and must contain a nonblank string.`,
          ),
        );
      }
    }
  }

  return issues;
}

function validateReferencesAndIdentity(
  release: ReleaseScanResult,
  documents: ReleaseDocuments,
): LibraryValidationIssue[] {
  const issues: LibraryValidationIssue[] = [];
  const releaseDocument = documents.release.get("release.toml");

  if (releaseDocument) {
    const authoredId = readPath(releaseDocument.parsed, "release.id");

    if (authoredId !== release.id) {
      issues.push(
        issue(
          "release-id-directory-mismatch",
          "blocked",
          releaseDocument.relativePath,
          `The release directory is ${release.id}, but release.id is ${JSON.stringify(authoredId)}.`,
          "Use Library → Release identity & directory to review a guarded synchronization plan; do not rename only one side manually.",
        ),
      );
    }
  }

  if (!releaseIdPattern.test(release.id)) {
    issues.push(
      issue(
        "noncanonical-release-directory-id",
        "warning",
        release.relativePath,
        "The release directory does not follow the recommended YYYY-MM-DD_release-title convention.",
      ),
    );
  }

  for (const document of documents.byRelativePath.values()) {
    const releaseReference = readPath(
      document.parsed,
      "release_reference.release_id",
    );

    if (
      releaseReference !== undefined &&
      releaseReference !== release.id
    ) {
      issues.push(
        issue(
          "release-reference-mismatch",
          "blocked",
          document.relativePath,
          `release_reference.release_id is ${JSON.stringify(releaseReference)} but the containing release is ${release.id}.`,
        ),
      );
    }
  }

  for (const track of release.tracks) {
    const trackDocuments = documents.tracks.get(track.id);
    const trackDocument = trackDocuments?.get("track.toml");

    if (trackDocument) {
      const authoredTrackId = readPath(
        trackDocument.parsed,
        "track.id",
      );

      if (authoredTrackId !== track.id) {
        issues.push(
          issue(
            "track-id-directory-mismatch",
            "blocked",
            trackDocument.relativePath,
            `The track directory is ${track.id}, but track.id is ${JSON.stringify(authoredTrackId)}.`,
            "Use the guarded track-directory synchronization workflow rather than renaming only the folder or TOML field.",
          ),
        );
      }

      const releaseReference = readPath(
        trackDocument.parsed,
        "release_reference.release_id",
      );

      if (releaseReference !== release.id) {
        issues.push(
          issue(
            "missing-or-invalid-track-release-reference",
            "blocked",
            trackDocument.relativePath,
            `track.toml must reference the containing release ${release.id}; found ${JSON.stringify(releaseReference)}.`,
          ),
        );
      }
    }

    for (const filename of optionalTrackDocuments) {
      const document = trackDocuments?.get(filename);

      if (!document) {
        continue;
      }

      const trackReference = readPath(
        document.parsed,
        "track_reference.track_id",
      );

      if (trackReference !== track.id) {
        issues.push(
          issue(
            "track-reference-mismatch",
            "blocked",
            document.relativePath,
            `track_reference.track_id must be ${track.id}; found ${JSON.stringify(trackReference)}.`,
          ),
        );
      }
    }
  }

  return issues;
}

function positiveIntegerOrNull(
  value: unknown,
): number | null {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0
  )
    ? value
    : null;
}

function validateNumbering(
  release: ReleaseScanResult,
  documents: ReleaseDocuments,
): LibraryValidationIssue[] {
  const issues: LibraryValidationIssue[] = [];
  const groups = new Map<string, string[]>();
  let maximumDiscNumber = 1;

  for (const track of release.tracks) {
    const document = documents.tracks.get(track.id)?.get("track.toml");

    if (!document) {
      continue;
    }

    const trackNumber = positiveIntegerOrNull(
      readPath(document.parsed, "track.numbering.track_number"),
    );
    const discNumber = positiveIntegerOrNull(
      readPath(document.parsed, "track.numbering.disc_number"),
    ) ?? 1;
    maximumDiscNumber = Math.max(maximumDiscNumber, discNumber);

    if (trackNumber === null) {
      issues.push(
        issue(
          "missing-or-invalid-track-number",
          "warning",
          document.relativePath,
          "track.numbering.track_number should be a positive TOML integer.",
        ),
      );
    } else {
      const key = `${discNumber}:${trackNumber}`;
      const existing = groups.get(key) ?? [];
      existing.push(track.id);
      groups.set(key, existing);
    }

    const parsedDirectory = parseTrackDirectoryId(track.id);

    if (!parsedDirectory) {
      issues.push(
        issue(
          "custom-track-directory-id",
          "warning",
          track.relativePath,
          "The track directory does not contain a recognized artist_number_title numeric segment, so automatic number synchronization cannot verify it.",
        ),
      );
    } else if (
      trackNumber !== null &&
      parsedDirectory.trackNumber !== trackNumber
    ) {
      issues.push(
        issue(
          "track-directory-number-mismatch",
          "warning",
          track.relativePath,
          `The directory numeric segment is ${parsedDirectory.trackNumber}, but track.numbering.track_number is ${trackNumber}.`,
          "Review the guarded track-directory synchronization plan.",
        ),
      );
    }

    const authoredTrackTotal = positiveIntegerOrNull(
      readPath(document.parsed, "track.numbering.track_total"),
    );

    if (
      authoredTrackTotal !== null &&
      authoredTrackTotal !== release.tracks.length
    ) {
      issues.push(
        issue(
          "track-total-mismatch",
          "warning",
          document.relativePath,
          `track.numbering.track_total is ${authoredTrackTotal}, but the release currently contains ${release.tracks.length} track directories.`,
        ),
      );
    }
  }

  for (const [key, trackIds] of groups) {
    if (trackIds.length < 2) {
      continue;
    }

    const [discNumber, trackNumber] = key.split(":");
    issues.push(
      issue(
        "duplicate-track-number",
        "blocked",
        release.relativePath,
        `Disc ${discNumber}, track ${trackNumber} is assigned to multiple tracks: ${trackIds.join(", ")}.`,
      ),
    );
  }

  const releaseDocument = documents.release.get("release.toml");

  if (releaseDocument) {
    const releaseTrackTotal = positiveIntegerOrNull(
      readPath(releaseDocument.parsed, "release.numbering.track_total"),
    );
    const releaseDiscTotal = positiveIntegerOrNull(
      readPath(releaseDocument.parsed, "release.numbering.disc_total"),
    );

    if (
      releaseTrackTotal !== null &&
      releaseTrackTotal !== release.tracks.length
    ) {
      issues.push(
        issue(
          "release-track-total-mismatch",
          "warning",
          releaseDocument.relativePath,
          `release.numbering.track_total is ${releaseTrackTotal}, but ${release.tracks.length} track directories were detected.`,
        ),
      );
    }

    if (
      releaseDiscTotal !== null &&
      releaseDiscTotal < maximumDiscNumber
    ) {
      issues.push(
        issue(
          "release-disc-total-mismatch",
          "warning",
          releaseDocument.relativePath,
          `release.numbering.disc_total is ${releaseDiscTotal}, but at least disc ${maximumDiscNumber} is referenced by a track.`,
        ),
      );
    }
  }

  return issues;
}

function resolveRelativeAssetPath(
  mediaRoot: string,
  baseRelativePath: string,
  authoredPath: string,
): string {
  const normalized = authoredPath.replaceAll("\\", "/");

  if (
    path.posix.isAbsolute(normalized) ||
    path.win32.isAbsolute(authoredPath)
  ) {
    throw new Error("Asset references must be release-relative paths.");
  }

  const absolute = assertPathWithinRoot(
    mediaRoot,
    path.resolve(
      mediaRoot,
      ...baseRelativePath.split("/").filter(Boolean),
      ...normalized.split("/").filter(Boolean),
    ),
  );

  return toLibraryRelativePath(mediaRoot, absolute);
}

async function validateReferencedAsset(
  mediaRoot: string,
  baseRelativePath: string,
  authoredPath: unknown,
  ownerRelativePath: string,
  fieldPath: string,
): Promise<LibraryValidationIssue[]> {
  if (!isNonBlankString(authoredPath)) {
    return [];
  }

  try {
    const relativePath = resolveRelativeAssetPath(
      mediaRoot,
      baseRelativePath,
      authoredPath,
    );
    const absolutePath = assertPathWithinRoot(
      mediaRoot,
      path.join(mediaRoot, relativePath),
    );
    const stats = await lstat(absolutePath);

    if (!stats.isFile() || stats.isSymbolicLink()) {
      return [
        issue(
          "invalid-asset-reference",
          "blocked",
          ownerRelativePath,
          `${fieldPath} points to ${authoredPath}, which is not a regular non-symbolic file.`,
        ),
      ];
    }

    return [];
  } catch (error) {
    return [
      issue(
        "missing-or-unsafe-asset-reference",
        "blocked",
        ownerRelativePath,
        `${fieldPath} points to ${JSON.stringify(authoredPath)}, but that path is missing, unreadable, or outside its allowed release directory.`,
        error instanceof Error ? error.message : undefined,
      ),
    ];
  }
}

async function validateAssets(
  mediaRoot: string,
  release: ReleaseScanResult,
  documents: ReleaseDocuments,
): Promise<LibraryValidationIssue[]> {
  const issues: LibraryValidationIssue[] = [];
  const primaryReleaseArtworkMasters =
    release.artworkMasters.filter((artwork) =>
      isPrimaryArtworkMasterForOwner(
        release.relativePath,
        artwork,
      ),
    );

  if (release.artworkMasters.length === 0) {
    issues.push(
      issue(
        "missing-release-artwork-master",
        "warning",
        release.relativePath,
        "No release artwork-master file was detected. Library editing can continue, but public presentation artwork is incomplete.",
      ),
    );
  } else if (primaryReleaseArtworkMasters.length > 1) {
    issues.push(
      issue(
        "multiple-release-artwork-masters",
        "warning",
        release.relativePath,
        `Multiple primary release artwork masters were detected: ${primaryReleaseArtworkMasters.map((asset) => asset.relativePath).join(", ")}.`,
      ),
    );
  }

  const releaseDocument = documents.release.get("release.toml");
  const releaseArtwork = releaseDocument
    ? readPath(releaseDocument.parsed, "release.artwork")
    : undefined;

  if (Array.isArray(releaseArtwork)) {
    for (let index = 0; index < releaseArtwork.length; index += 1) {
      const record = releaseArtwork[index];

      if (!isRecord(record)) {
        continue;
      }

      for (const field of ["master_path", "web_path", "embedded_path"] as const) {
        issues.push(
          ...(await validateReferencedAsset(
            mediaRoot,
            release.relativePath,
            record[field],
            releaseDocument?.relativePath ?? release.relativePath,
            `release.artwork[${index}].${field}`,
          )),
        );
      }
    }
  }

  for (const track of release.tracks) {
    if (track.audioMasters.length === 0) {
      issues.push(
        issue(
          "missing-audio-master",
          "blocked",
          track.relativePath,
          "No audio-master file was detected.",
        ),
      );
    } else if (track.audioMasters.length > 1) {
      issues.push(
        issue(
          "multiple-audio-masters",
          "blocked",
          track.relativePath,
          `Multiple audio masters were detected: ${track.audioMasters.map((asset) => asset.filename).join(", ")}.`,
        ),
      );
    }

    if ((track.playbackAudio?.length ?? 0) > 1) {
      issues.push(
        issue(
          "multiple-playback-files",
          "blocked",
          track.relativePath,
          `Multiple audio-playback files were detected: ${track.playbackAudio?.map((asset) => asset.filename).join(", ")}.`,
        ),
      );
    }

    const primaryTrackArtworkMasters =
      track.artworkMasters.filter((artwork) =>
        isPrimaryArtworkMasterForOwner(
          track.relativePath,
          artwork,
        ),
      );

    if (primaryTrackArtworkMasters.length > 1) {
      issues.push(
        issue(
          "multiple-track-artwork-masters",
          "warning",
          track.relativePath,
          `Multiple primary track artwork masters were detected: ${primaryTrackArtworkMasters.map((asset) => asset.relativePath).join(", ")}.`,
        ),
      );
    }

    const document = documents.tracks.get(track.id)?.get("track.toml");

    if (!document) {
      continue;
    }

    const trackArtworkMaster = readPath(
      document.parsed,
      "track.assets.artwork.master",
    );

    if (
      isNonBlankString(trackArtworkMaster) &&
      path.posix.normalize(
        trackArtworkMaster.replaceAll("\\", "/"),
      ).startsWith("../")
    ) {
      issues.push(
        issue(
          "nonlocal-track-artwork-reference",
          "warning",
          document.relativePath,
          `track.assets.artwork.master points outside the track directory (${trackArtworkMaster}). Canonical track artwork should be staged locally under artwork/ so the scanner, sidebar thumbnails, and Publish workflow resolve the same asset.`,
          "Rebuild the release with assignment-driven artwork placement or use a future reviewed artwork-migration workflow.",
        ),
      );
    }

    const assetPaths = [
      ["track.assets.audio_master", readPath(document.parsed, "track.assets.audio_master")],
      ["track.assets.audio_playback", readPath(document.parsed, "track.assets.audio_playback")],
      ["track.assets.waveform_peaks", readPath(document.parsed, "track.assets.waveform_peaks")],
      ["track.assets.artwork.master", readPath(document.parsed, "track.assets.artwork.master")],
      ["track.assets.artwork.web", readPath(document.parsed, "track.assets.artwork.web")],
      ["track.assets.artwork.embedded", readPath(document.parsed, "track.assets.artwork.embedded")],
    ] as const;

    for (const [fieldPath, authoredPath] of assetPaths) {
      if (
        fieldPath === "track.assets.waveform_peaks" &&
        authoredPath === "waveform-peaks.json"
      ) {
        const compactWaveformPath = assertPathWithinRoot(
          mediaRoot,
          path.join(
            mediaRoot,
            track.relativePath,
            "waveform-peaks.wfp",
          ),
        );

        try {
          const compactStats = await lstat(compactWaveformPath);
          if (
            compactStats.isFile() &&
            !compactStats.isSymbolicLink()
          ) {
            // Migration compatibility: an older track.toml may still name
            // waveform-peaks.json after the compact canonical derivative has
            // been prepared. Do not make that stale private pointer block the
            // public package; new Staging output authors waveform-peaks.wfp.
            continue;
          }
        } catch {
          // Fall through to normal validation of the legacy authored path.
        }
      }

      issues.push(
        ...(await validateReferencedAsset(
          mediaRoot,
          track.relativePath,
          authoredPath,
          document.relativePath,
          fieldPath,
        )),
      );
    }
  }

  return issues;
}

async function hashFile(
  filename: string,
): Promise<string> {
  const hash = createHash("sha256");

  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filename);
    stream.on("data", (chunk: Buffer | string) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });

  return hash.digest("hex");
}

async function validateIngestReceipt(
  mediaRoot: string,
  release: ReleaseScanResult,
  verifyHashes: boolean,
): Promise<LibraryValidationIssue[]> {
  const relativePath = `${release.relativePath}/ingest-receipt.json`;
  const absolutePath = assertPathWithinRoot(
    mediaRoot,
    path.join(mediaRoot, relativePath),
  );

  try {
    const stats = await lstat(absolutePath);

    if (!stats.isFile() || stats.isSymbolicLink()) {
      return [
        issue(
          "invalid-ingest-receipt",
          "warning",
          relativePath,
          "ingest-receipt.json exists but is not a regular non-symbolic file.",
        ),
      ];
    }
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return [];
    }

    return [
      issue(
        "unreadable-ingest-receipt",
        "warning",
        relativePath,
        error instanceof Error ? error.message : "Unable to inspect ingest receipt.",
      ),
    ];
  }

  const issues: LibraryValidationIssue[] = [];
  let receipt: unknown;

  try {
    receipt = JSON.parse(await readFile(absolutePath, "utf8"));
  } catch (error) {
    return [
      issue(
        "invalid-ingest-receipt-json",
        "blocked",
        relativePath,
        error instanceof Error ? error.message : "Unable to parse ingest receipt JSON.",
      ),
    ];
  }

  if (!isRecord(receipt)) {
    return [
      issue(
        "invalid-ingest-receipt-shape",
        "blocked",
        relativePath,
        "ingest-receipt.json must contain a JSON object.",
      ),
    ];
  }

  const receiptRelease = isRecord(receipt.release) ? receipt.release : null;

  if (!receiptRelease) {
    issues.push(
      issue(
        "missing-ingest-receipt-release",
        "warning",
        relativePath,
        "The ingest receipt does not contain a release identity object.",
      ),
    );
  } else {
    if (receiptRelease.id !== release.id) {
      issues.push(
        issue(
          "ingest-receipt-release-id-mismatch",
          "blocked",
          relativePath,
          `The ingest receipt release ID is ${JSON.stringify(receiptRelease.id)}, but the directory ID is ${release.id}.`,
        ),
      );
    }

    if (receiptRelease.relativePath !== release.relativePath) {
      issues.push(
        issue(
          "ingest-receipt-release-path-mismatch",
          "blocked",
          relativePath,
          `The ingest receipt release path is ${JSON.stringify(receiptRelease.relativePath)}, but the current path is ${release.relativePath}.`,
        ),
      );
    }
  }

  const knownTrackIds = new Set(release.tracks.map((track) => track.id));

  if (Array.isArray(receipt.tracks)) {
    for (const item of receipt.tracks) {
      if (!isRecord(item) || !isNonBlankString(item.id)) {
        continue;
      }

      if (!knownTrackIds.has(item.id)) {
        issues.push(
          issue(
            "ingest-receipt-orphan-track",
            "warning",
            relativePath,
            `The ingest receipt references track ${item.id}, which is not present in the release directory.`,
          ),
        );
      }
    }
  }

  if (!Array.isArray(receipt.copies)) {
    return issues;
  }

  for (const copy of receipt.copies) {
    if (!isRecord(copy) || !isNonBlankString(copy.destinationRelativePath)) {
      continue;
    }

    const destination = copy.destinationRelativePath;

    try {
      if (
        path.posix.isAbsolute(destination.replaceAll("\\", "/")) ||
        path.win32.isAbsolute(destination)
      ) {
        throw new Error("Receipt destinations must be library-relative paths.");
      }

      const absoluteDestination = assertPathWithinRoot(
        mediaRoot,
        path.resolve(
          mediaRoot,
          ...destination.replaceAll("\\", "/").split("/").filter(Boolean),
        ),
      );
      const destinationRelativePath = toLibraryRelativePath(
        mediaRoot,
        absoluteDestination,
      );

      if (
        destinationRelativePath !== release.relativePath &&
        !destinationRelativePath.startsWith(`${release.relativePath}/`)
      ) {
        throw new Error("Destination is outside the containing release.");
      }

      const destinationStats = await lstat(absoluteDestination);

      if (!destinationStats.isFile() || destinationStats.isSymbolicLink()) {
        throw new Error("Destination is not a regular non-symbolic file.");
      }

      if (
        typeof copy.bytes === "number" &&
        Number.isFinite(copy.bytes) &&
        destinationStats.size !== copy.bytes
      ) {
        issues.push(
          issue(
            "ingest-receipt-size-mismatch",
            "warning",
            destinationRelativePath,
            `The current file size is ${destinationStats.size} bytes, but the ingest receipt recorded ${copy.bytes} bytes.`,
            "Confirm whether the canonical file was intentionally replaced.",
          ),
        );
      }

      if (
        verifyHashes &&
        isNonBlankString(copy.sourceSha256)
      ) {
        const currentHash = await hashFile(absoluteDestination);

        if (currentHash !== copy.sourceSha256) {
          issues.push(
            issue(
              "ingest-receipt-hash-mismatch",
              "warning",
              destinationRelativePath,
              `The current SHA-256 ${currentHash} does not match the ingest receipt ${copy.sourceSha256}.`,
              "Confirm whether the canonical file was intentionally replaced before publishing.",
            ),
          );
        }
      }
    } catch (error) {
      issues.push(
        issue(
          "missing-or-unsafe-ingest-destination",
          "blocked",
          relativePath,
          `The ingest receipt destination ${JSON.stringify(destination)} is missing or unsafe.`,
          error instanceof Error ? error.message : undefined,
        ),
      );
    }
  }

  return issues;
}

function validateUnexpectedFiles(
  release: ReleaseScanResult,
  entries: readonly TreeEntry[],
): LibraryValidationIssue[] {
  const issues: LibraryValidationIssue[] = [];
  const allowedReleaseFiles = new Set([
    requiredReleaseDocument,
    ...optionalReleaseDocuments,
    "ingest-receipt.json",
  ]);
  const allowedTrackFile = (
    filename: string,
  ): boolean => {
    const lower = filename.toLowerCase();

    return (
      filename === requiredTrackDocument ||
      optionalTrackDocuments.includes(
        filename as (typeof optionalTrackDocuments)[number],
      ) ||
      /^audio-master\.[^.]+$/i.test(filename) ||
      /^audio-playback\.[^.]+$/i.test(filename) ||
      filename === "waveform-peaks.wfp" ||
      // Temporary migration allowance: old Library snapshots may retain the
      // oversized JSON derivative after the compact canonical WFP is created.
      // New builds never generate or publish this legacy file.
      filename === "waveform-peaks.json" ||
      /^artwork-master\.[^.]+$/i.test(filename) ||
      lower.endsWith(".md") ||
      lower.endsWith(".txt")
    );
  };

  for (const entry of entries) {
    if (entry.kind === "symlink") {
      issues.push(
        issue(
          "symbolic-link-in-release",
          "blocked",
          entry.relativePath,
          "Symbolic links are not allowed inside a canonical release because they can escape the configured media root or change without review.",
        ),
      );
      continue;
    }

    if (entry.kind !== "file") {
      continue;
    }

    const parent = path.posix.dirname(entry.relativePath);
    const filename = path.posix.basename(entry.relativePath);

    if (
      parent === release.relativePath &&
      !allowedReleaseFiles.has(filename)
    ) {
      issues.push(
        issue(
          "unexpected-release-root-file",
          "warning",
          entry.relativePath,
          "This file is not one of the recognized release-root metadata or receipt files.",
        ),
      );
    }

    for (const track of release.tracks) {
      if (
        parent === track.relativePath &&
        !allowedTrackFile(filename)
      ) {
        issues.push(
          issue(
            "unexpected-track-root-file",
            "warning",
            entry.relativePath,
            "This file is not a recognized track metadata, master, derivative, or documentation file.",
          ),
        );
      }
    }
  }

  return issues;
}

async function validateDerivatives(
  mediaRoot: string,
  release: ReleaseScanResult,
  capabilities: FfmpegCapabilities,
): Promise<LibraryValidationIssue[]> {
  const issues: LibraryValidationIssue[] = [];
  const plan = await buildMediaProcessingPlan(
    mediaRoot,
    release,
    capabilities,
  );

  for (const item of plan.items) {
    for (const derivative of [item.playback, item.waveform]) {
      if (derivative.status === "current") {
        continue;
      }

      issues.push(
        issue(
          `derivative-${derivative.kind}-${derivative.status}`,
          derivative.status === "blocked" ? "blocked" : "warning",
          derivative.relativePath,
          `${derivative.kind} is ${derivative.status}: ${derivative.reason}`,
        ),
      );
    }
  }

  return issues;
}

async function validateRelease(
  mediaRoot: string,
  release: ReleaseScanResult,
  capabilities: FfmpegCapabilities,
  verifyHashes: boolean,
): Promise<ReleaseValidationResult> {
  const releasePath = assertPathWithinRoot(
    mediaRoot,
    path.join(mediaRoot, release.relativePath),
  );
  const entries = await collectTreeEntries(mediaRoot, releasePath);
  const parsed = await parseTomlDocuments(mediaRoot, release, entries);
  const releaseIssues: LibraryValidationIssue[] = [
    ...parsed.issues,
    ...validateRequiredDocuments(release),
    ...validateRequiredFields(release, parsed.documents),
    ...validateReferencesAndIdentity(release, parsed.documents),
    ...validateNumbering(release, parsed.documents),
    ...validateUnexpectedFiles(release, entries),
    ...(await validateAssets(mediaRoot, release, parsed.documents)),
    ...(await validateIngestReceipt(mediaRoot, release, verifyHashes)),
    ...(await validateDerivatives(mediaRoot, release, capabilities)),
  ];

  for (const document of parsed.documents.byRelativePath.values()) {
    releaseIssues.push(
      ...collectDateIssues(document.parsed, document.relativePath),
    );
  }

  const tracks = release.tracks.map(
    (track): TrackValidationResult => {
      const issues = releaseIssues.filter(
        (item) =>
          item.relativePath === track.relativePath ||
          item.relativePath.startsWith(`${track.relativePath}/`),
      );

      return {
        trackId: track.id,
        relativePath: track.relativePath,
        status: statusForIssues(issues),
        issues,
      };
    },
  );

  return {
    releaseId: release.id,
    relativePath: release.relativePath,
    status: statusForIssues(releaseIssues),
    issues: releaseIssues,
    tracks,
  };
}

function validateCaseInsensitiveCollisions(
  releases: readonly ReleaseScanResult[],
): LibraryValidationIssue[] {
  const issues: LibraryValidationIssue[] = [];
  const releaseGroups = new Map<string, string[]>();

  for (const release of releases) {
    const key = release.id.toLocaleLowerCase("en-US");
    const values = releaseGroups.get(key) ?? [];
    values.push(release.id);
    releaseGroups.set(key, values);

    const trackGroups = new Map<string, string[]>();

    for (const track of release.tracks) {
      const trackKey = track.id.toLocaleLowerCase("en-US");
      const trackIds = trackGroups.get(trackKey) ?? [];
      trackIds.push(track.id);
      trackGroups.set(trackKey, trackIds);
    }

    for (const trackIds of trackGroups.values()) {
      if (trackIds.length > 1) {
        issues.push(
          issue(
            "case-insensitive-track-id-collision",
            "blocked",
            release.relativePath,
            `Track directory IDs collide case-insensitively: ${trackIds.join(", ")}.`,
          ),
        );
      }
    }
  }

  for (const releaseIds of releaseGroups.values()) {
    if (releaseIds.length > 1) {
      issues.push(
        issue(
          "case-insensitive-release-id-collision",
          "blocked",
          "releases",
          `Release directory IDs collide case-insensitively: ${releaseIds.join(", ")}.`,
        ),
      );
    }
  }

  return issues;
}

function summarizeReport(
  releases: readonly ReleaseValidationResult[],
  globalIssues: readonly LibraryValidationIssue[],
): LibraryValidationReport["summary"] {
  const allIssues = [
    ...globalIssues,
    ...releases.flatMap((release) => release.issues),
  ];

  return {
    releaseCount: releases.length,
    trackCount: releases.reduce(
      (total, release) => total + release.tracks.length,
      0,
    ),
    okReleaseCount: releases.filter(
      (release) => release.status === "ok",
    ).length,
    warningReleaseCount: releases.filter(
      (release) => release.status === "warning",
    ).length,
    blockedReleaseCount: releases.filter(
      (release) => release.status === "blocked",
    ).length,
    warningCount: allIssues.filter(
      (item) => item.severity === "warning",
    ).length,
    blockedCount: allIssues.filter(
      (item) => item.severity === "blocked",
    ).length,
  };
}

export async function validateMediaLibrary(
  mediaRoot: string,
  options: ValidateMediaLibraryOptions = {},
): Promise<LibraryValidationReport> {
  const canonicalMediaRoot = await realpath(mediaRoot);
  const library = await scanMediaLibrary(canonicalMediaRoot);
  const selectedReleases = options.releaseId
    ? library.releases.filter(
        (release) => release.id === options.releaseId,
      )
    : library.releases;
  const globalIssues = validateCaseInsensitiveCollisions(
    library.releases,
  );

  if (options.releaseId && selectedReleases.length === 0) {
    globalIssues.push(
      issue(
        "release-not-found",
        "blocked",
        "releases",
        `Release not found: ${options.releaseId}`,
      ),
    );
  }

  const capabilities =
    options.ffmpegCapabilities ??
    (await detectFfmpegCapabilities());
  const releases: ReleaseValidationResult[] = [];

  for (const release of selectedReleases) {
    releases.push(
      await validateRelease(
        canonicalMediaRoot,
        release,
        capabilities,
        options.verifyHashes ?? false,
      ),
    );
  }

  const summary = summarizeReport(releases, globalIssues);
  const reportStatus = statusForIssues([
    ...globalIssues,
    ...releases.flatMap((release) => release.issues),
  ]);

  return {
    schema: {
      name: "metadata-editor-library-validation",
      version: 1,
    },
    scope: options.releaseId ? "release" : "library",
    ...(options.releaseId ? { releaseId: options.releaseId } : {}),
    mediaRoot: canonicalMediaRoot,
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    readOnly: true,
    verifyHashes: options.verifyHashes ?? false,
    status: reportStatus,
    summary,
    issues: globalIssues,
    releases,
  };
}

export function formatLibraryValidationReport(
  report: LibraryValidationReport,
): string {
  const lines: string[] = [];
  const scopeLabel = report.scope === "release"
    ? `Release ${report.releaseId ?? ""}`.trim()
    : "Library";

  lines.push(`${scopeLabel} validation: ${report.status.toUpperCase()}`);
  lines.push(`Media root: ${report.mediaRoot}`);
  lines.push(
    `Releases: ${report.summary.releaseCount} · Tracks: ${report.summary.trackCount} · Warnings: ${report.summary.warningCount} · Blocked: ${report.summary.blockedCount}`,
  );
  lines.push(`Read-only: yes${report.verifyHashes ? " · Receipt hashes verified" : ""}`);

  const printIssues = (
    issues: readonly LibraryValidationIssue[],
    indent: string,
  ): void => {
    for (const item of issues) {
      lines.push(
        `${indent}${item.severity === "blocked" ? "BLOCKED" : "WARNING"} ${item.code} ${item.relativePath}`,
      );
      lines.push(`${indent}  ${item.message}`);

      if (item.suggestion) {
        lines.push(`${indent}  Suggested: ${item.suggestion}`);
      }
    }
  };

  printIssues(report.issues, "");

  for (const release of report.releases) {
    lines.push("");
    lines.push(`${release.status.toUpperCase()} ${release.releaseId}`);
    printIssues(release.issues, "  ");

    if (release.issues.length === 0) {
      lines.push("  No validation issues detected.");
    }
  }

  return `${lines.join("\n")}\n`;
}
