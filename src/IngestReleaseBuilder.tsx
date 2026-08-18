import {
  useEffect,
  useRef,
  useState,
  type DragEvent,
} from "react";

import {
  INGEST_BUILD_CONFIRMATION_PHRASE,
  INGEST_UPDATE_CONFIRMATION_PHRASE,
  buildReleaseDirectoryId,
  createArtworkAssignmentId,
  defaultReleaseArtworkAssignment,
  ingestArtworkRoleOptions,
  ingestVideoTypeOptions,
  shouldSynchronizeReleaseDirectoryId,
  type IngestArtworkAssignmentDraft,
  type IngestBuildAssetDraft,
  type IngestBuildDraft,
  type IngestBuildOperation,
  type IngestBuildPreview,
  type IngestBuildResult,
  type IngestBuildTrackDraft,
  type IngestBuildVideoDraft,
  type IngestStagingTargetStatus,
} from "../shared/ingest-builder.js";
import {
  buildBlockingSourceStatuses,
  type IngestDraftIdentitySeed,
  type IngestDraftSourceStatus,
} from "../shared/ingest-drafts.js";
import type {
  IngestCandidateInspection,
  IngestFileInspection,
  IngestMetadataSidecarSuggestion,
} from "../shared/ingest-types.js";
import {
  stagingDestinationPathForDisplay,
} from "./ingest-build-display.js";
import {
  artworkAssetsAssignedToTarget,
  buildFrontArtworkAssignmentUpdates,
  removeFrontArtworkTarget,
  type ArtworkAssignmentTarget,
} from "./ingest-artwork-assignment.js";
import {
  formatIngestSourceDisplayPath,
  sourceDateIsAfterReleaseDate,
  sourcePathsForBulkDate,
  synchronizeBulkSourceDate,
} from "./ingest-track-table.js";
import {
  buildTrackTitlePlan,
  filenameTitleFields,
  humanizeFilenameTitleField,
  type IngestFilenameTitleField,
  type IngestFilenameTitleSeparator,
  type IngestTrackTitleUpdate,
} from "./ingest-track-title-source.js";
import {
  buildIngestAudioPreviewUrl,
} from "./ingest-audio-preview.js";
import type {
  PersistentLibraryPlaybackController,
  PersistentPlaybackTrack,
} from "./PersistentLibraryPlayer.js";
import {
  useIngestDraft,
} from "./useIngestDraft.js";

type BuilderMode =
  | "guided"
  | "quick";

type GuidedStep =
  | 1
  | 2
  | 3
  | 4
  | 5;

type IngestAudioPreviewControls = {
  sourceRelativePath: string | null;
  playing: boolean;
  loading: boolean;
  toggle: (sourceRelativePath: string) => void;
};

/*
 * Keep this ingestion vocabulary aligned with recognized release
 * classifications. Session context such as a jam belongs in the
 * generated production notes rather than Release Type.
 */
const releaseTypeOptions = [
  "album",
  "single",
  "EP",
  "broadcast",
  "audio drama",
  "audiobook",
  "compilation",
  "demo",
  "DJ mix",
  "field recording",
  "interview",
  "live",
  "mixtape",
  "remix",
  "soundtrack",
  "spoken word",
  "other",
] as const;


function artworkRoleLabel(role: string): string {
  switch (role) {
    case "front_cover":
      return "Front cover";
    case "alternate_front_cover":
      return "Alternate front cover";
    case "track_artwork":
      return "Track artwork";
    case "back_cover":
      return "Back cover";
    case "liner_notes":
      return "Liner notes / booklet";
    case "disc":
      return "Disc / media artwork";
    case "thumbnail":
      return "Thumbnail";
    case "other":
      return "Other";
    default:
      return role
        .replaceAll("_", " ")
        .replaceAll("-", " ")
        .replace(/\b\w/g, (character) =>
          character.toUpperCase()
        );
  }
}

function formatByteSize(
  sizeBytes: number,
): string {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let value = sizeBytes / 1024;
  let unitIndex = 0;

  while (
    value >= 1024 &&
    unitIndex < units.length - 1
  ) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(
    value >= 10 ? 1 : 2,
  )} ${units[unitIndex]}`;
}

function messageFromResponse(
  result: unknown,
  fallback: string,
): string {
  if (
    typeof result === "object" &&
    result !== null &&
    !Array.isArray(result) &&
    "error" in result &&
    typeof result.error === "string"
  ) {
    return result.error;
  }

  return fallback;
}


const stagingPreviewArtworkExtensions =
  new Set([
    ".avif",
    ".gif",
    ".jpeg",
    ".jpg",
    ".png",
    ".tif",
    ".tiff",
    ".webp",
  ]);

const stagingTranscodedArtworkExtensions =
  new Set([
    ".tif",
    ".tiff",
  ]);

function artworkPreviewUrl(
  sourceRelativePath: string,
  modifiedAt?: string,
  embeddedArtwork?: IngestBuildAssetDraft["embeddedArtwork"],
): string {
  const parameters = new URLSearchParams({
    path: sourceRelativePath,
  });

  if (modifiedAt) {
    parameters.set("version", modifiedAt);
  }

  if (embeddedArtwork) {
    parameters.set("stream", String(embeddedArtwork.streamIndex));
    if (embeddedArtwork.codecName) {
      parameters.set("codec", embeddedArtwork.codecName);
    }
  }

  return `/api/ingest/artwork?${parameters.toString()}`;
}

function libraryArtworkPreviewUrl(
  relativePath: string,
): string {
  return `/api/library/artwork-preview?${new URLSearchParams({
    path: relativePath,
  }).toString()}`;
}

function ArtworkPreview({
  sourceRelativePath,
  modifiedAt,
  label,
  embeddedArtwork,
  thumbnailOnly = false,
}: {
  sourceRelativePath: string;
  modifiedAt?: string;
  label?: string;
  embeddedArtwork?: IngestBuildAssetDraft["embeddedArtwork"];
  thumbnailOnly?: boolean;
}) {
  const [previewFailed, setPreviewFailed] =
    useState(false);
  const extension = embeddedArtwork?.extension ??
    sourceRelativePath
      .slice(
        sourceRelativePath.lastIndexOf("."),
      )
      .toLowerCase();
  const previewTranscoded =
    stagingTranscodedArtworkExtensions.has(
      extension,
    );
  const accessibleLabel =
    label ?? sourceRelativePath;

  if (
    !stagingPreviewArtworkExtensions.has(
      extension,
    ) ||
    previewFailed
  ) {
    return (
      <span
        className={[
          "ingest-artwork-preview-unavailable",
          thumbnailOnly
            ? "ingest-artwork-preview-unavailable--thumbnail-only"
            : "",
        ].filter(Boolean).join(" ")}
        role={thumbnailOnly ? "img" : undefined}
        aria-label={
          thumbnailOnly
            ? `Artwork preview unavailable for ${accessibleLabel}`
            : undefined
        }
      >
        {thumbnailOnly
          ? null
          : previewFailed
            ? "Preview failed"
            : "Preview unavailable"}
      </span>
    );
  }

  const source = artworkPreviewUrl(
    embeddedArtwork?.audioSourceRelativePath ?? sourceRelativePath,
    modifiedAt,
    embeddedArtwork,
  );

  if (thumbnailOnly) {
    return (
      <span className="ingest-artwork-preview-stack ingest-artwork-preview-stack--thumbnail-only">
        <img
          className="ingest-artwork-thumbnail"
          src={source}
          alt={`Artwork preview for ${accessibleLabel}`}
          loading="lazy"
          onError={() =>
            setPreviewFailed(true)
          }
        />
      </span>
    );
  }

  return (
    <span className="ingest-artwork-preview-stack">
      <a
        className="ingest-artwork-preview-link"
        href={source}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open full artwork preview for ${accessibleLabel}`}
        title={
          previewTranscoded
            ? "Open read-only PNG preview generated from TIFF"
            : "Open full local artwork preview"
        }
      >
        <img
          className="ingest-artwork-thumbnail"
          src={source}
          alt={`Artwork preview for ${accessibleLabel}`}
          loading="lazy"
          onError={() =>
            setPreviewFailed(true)
          }
        />
      </a>
      {(previewTranscoded || embeddedArtwork) && (
        <small className="ingest-artwork-preview-mode">
          {embeddedArtwork
            ? "Embedded artwork"
            : "TIFF → PNG preview"}
        </small>
      )}
    </span>
  );
}

function IngestAudioPreviewButton({
  sourceRelativePath,
  controls,
  disabled = false,
}: {
  sourceRelativePath: string;
  controls: IngestAudioPreviewControls;
  disabled?: boolean;
}) {
  const selected =
    controls.sourceRelativePath ===
    sourceRelativePath;
  const playing = selected && controls.playing;
  const loading = selected && controls.loading;
  const label = playing
    ? `Pause ${sourceRelativePath}`
    : `Play ${sourceRelativePath}`;

  return (
    <button
      type="button"
      className="ingest-audio-preview-button"
      aria-label={label}
      title={
        disabled
          ? "This ingest source is unavailable."
          : playing
            ? "Pause source preview"
            : "Play source preview"
      }
      disabled={disabled}
      onClick={() =>
        controls.toggle(sourceRelativePath)
      }
    >
      <span aria-hidden="true">
        {loading
          ? "…"
          : playing
            ? "❚❚"
            : "▶"}
      </span>
    </button>
  );
}

function PlanKindIcon({
  kind,
  mediaKind,
}: {
  kind: IngestBuildPreview["items"][number]["kind"];
  mediaKind?: IngestBuildPreview["items"][number]["mediaKind"];
}) {
  const iconKind =
    kind === "directory"
      ? "directory"
      : kind === "waveform"
        ? "waveform"
        : kind === "toml"
          ? "toml"
          : kind === "receipt"
            ? "receipt"
            : mediaKind === "audio"
            ? "audio"
            : mediaKind === "video"
              ? "video"
              : mediaKind === "image"
                ? "image"
                : "file";
  const label =
    iconKind === "directory"
      ? "Directory"
      : iconKind === "waveform"
        ? "Waveform peaks"
        : iconKind === "toml"
          ? "TOML document"
          : iconKind === "audio"
          ? "Audio file"
          : iconKind === "video"
            ? "Video file"
            : iconKind === "image"
              ? "Image file"
            : iconKind === "receipt"
              ? "Receipt document"
              : "File";

  return (
    <span
      className={`ingest-plan-kind-icon ${iconKind}`}
      role="img"
      aria-label={label}
      title={label}
    >
      {iconKind === "directory" ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 5.5h6l2 2H21v11H3z" />
        </svg>
      ) : iconKind === "waveform" ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 12h2l1.5-5 2.5 10 2-8 2.5 6 2-9 2.5 11 1.5-5H21v2h-3l-1 3.5L14.5 8l-2 9-2.5-6-2 8L5.5 9 5 14H3z" />
        </svg>
      ) : iconKind === "audio" ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M10 5v10.2a3.5 3.5 0 1 1-2-3.16V7l11-2v8.2a3.5 3.5 0 1 1-2-3.16V3.5z" />
        </svg>
      ) : iconKind === "video" ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 5h16v14H4zm5 3v8l7-4z" />
        </svg>
      ) : iconKind === "image" ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 4h16v16H4zm2 2v10l3.5-3.5 2.5 2.5 2.5-3 3.5 4V6zm2.5 1.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
        </svg>
      ) : iconKind === "receipt" ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 3h14v18l-2-1.2-2 1.2-2-1.2-2 1.2-2-1.2L5 21zm3 4v2h8V7zm0 4v2h8v-2zm0 4v2h5v-2z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6 3h8l4 4v14H6zm8 2.5V8h2.5zM8 11v2h8v-2zm0 4v2h8v-2z" />
        </svg>
      )}
    </span>
  );
}


function trackLabel(
  track: IngestBuildTrackDraft,
): string {
  const number = String(track.trackNumber).padStart(2, "0");
  const version = track.version.trim()
    ? ` (${track.version.trim()})`
    : "";

  return `Track ${number} · ${track.title || "Untitled"}${version}`;
}

function assignmentLabel(
  assignment: IngestArtworkAssignmentDraft,
  tracks: IngestBuildTrackDraft[],
): string {
  if (assignment.scope === "release") {
    return `Release · ${artworkRoleLabel(assignment.role)}`;
  }

  const selectedTracks = tracks.filter((track) =>
    assignment.trackSourceRelativePaths.includes(
      track.sourceRelativePath,
    ),
  );

  if (selectedTracks.length === 0) {
    return `Track level · ${artworkRoleLabel(assignment.role)} · no tracks selected`;
  }

  return `${selectedTracks
    .map((track) => `Track ${track.trackNumber}`)
    .join(", ")} · ${artworkRoleLabel(assignment.role)}`;
}

function artworkTomlTargets(
  assignment: IngestArtworkAssignmentDraft,
  tracks: IngestBuildTrackDraft[],
): string[] {
  if (assignment.scope === "release") {
    return ["release.toml"];
  }

  return tracks
    .filter((track) =>
      assignment.trackSourceRelativePaths.includes(
        track.sourceRelativePath,
      ),
    )
    .map(
      (track) =>
        `Track ${track.trackNumber} track.toml`,
    );
}

function artworkPhysicalCopyCount(
  asset: IngestBuildAssetDraft,
): number {
  return asset.artworkAssignments.reduce(
    (total, assignment) =>
      total +
      (assignment.scope === "release"
        ? 1
        : assignment.trackSourceRelativePaths.length),
    0,
  );
}

function ArtworkAssignmentsEditor({
  asset,
  tracks,
  existingTracks,
  disabled,
  onChange,
}: {
  asset: IngestBuildAssetDraft;
  tracks: IngestBuildTrackDraft[];
  existingTracks: IngestStagingTargetStatus["existingTracks"];
  disabled: boolean;
  onChange: (
    patch: Partial<IngestBuildAssetDraft>,
  ) => void;
}) {
  const [draftAssignment, setDraftAssignment] =
    useState<IngestArtworkAssignmentDraft | null>(null);

  const existingTrackSourcePaths = new Set(
    existingTracks.map((track) =>
      track.sourceRelativePath
    ),
  );

  const updateExistingAssignment = (
    assignmentIndex: number,
    patch: Partial<IngestArtworkAssignmentDraft>,
  ) => {
    const artworkAssignments =
      asset.artworkAssignments.map(
        (assignment, index) =>
          index === assignmentIndex
            ? {
                ...assignment,
                ...patch,
              }
            : assignment,
      );

    onChange({
      include: artworkAssignments.length > 0,
      artworkAssignments,
    });
  };

  const removeExistingAssignment = (
    assignmentIndex: number,
  ) => {
    const artworkAssignments =
      asset.artworkAssignments.filter(
        (_, index) => index !== assignmentIndex,
      );

    onChange({
      include: artworkAssignments.length > 0,
      artworkAssignments,
    });
  };

  const updateDraftAssignment = (
    patch: Partial<IngestArtworkAssignmentDraft>,
  ) => {
    setDraftAssignment((current) =>
      current
        ? {
            ...current,
            ...patch,
          }
        : current,
    );
  };

  const renderRoleOptions = (
    assignment: IngestArtworkAssignmentDraft,
  ) => (
    <>
      {!ingestArtworkRoleOptions.some(
        (role) => role === assignment.role,
      ) &&
        assignment.role.trim() && (
          <option value={assignment.role}>
            {artworkRoleLabel(assignment.role)}
          </option>
        )}
      {ingestArtworkRoleOptions.map((role) => (
        <option key={role} value={role}>
          {artworkRoleLabel(role)}
        </option>
      ))}
    </>
  );

  const renderTrackTargets = (
    assignment: IngestArtworkAssignmentDraft,
    draft: boolean,
    assignmentIndex?: number,
  ) => {
    if (assignment.scope !== "track") {
      return null;
    }

    return (
      <fieldset className="ingest-artwork-assignment-track-targets">
        <legend>Tracks</legend>
        <div>
          {tracks.map((track) => {
            const selected =
              assignment.trackSourceRelativePaths.includes(
                track.sourceRelativePath,
              );
            const existingLibraryTrack =
              existingTrackSourcePaths.has(
                track.sourceRelativePath,
              );
            const trackDisabled =
              disabled ||
              (
                !track.include &&
                !existingLibraryTrack
              );

            return (
              <label
                key={track.sourceRelativePath}
                title={
                  existingLibraryTrack
                    ? "Existing Library track preserved in this update; it remains available for artwork assignment."
                    : track.include
                      ? undefined
                      : "This candidate track is not included in the staging draft."
                }
              >
                <input
                  type="checkbox"
                  checked={selected}
                  disabled={trackDisabled}
                  onChange={(event) => {
                    const trackSourceRelativePaths =
                      event.target.checked
                        ? [
                            ...new Set([
                              ...assignment.trackSourceRelativePaths,
                              track.sourceRelativePath,
                            ]),
                          ]
                        : assignment.trackSourceRelativePaths.filter(
                            (path) =>
                              path !==
                              track.sourceRelativePath,
                          );

                    if (draft) {
                      updateDraftAssignment({
                        trackSourceRelativePaths,
                      });
                    } else if (
                      assignmentIndex !== undefined
                    ) {
                      updateExistingAssignment(
                        assignmentIndex,
                        {
                          trackSourceRelativePaths,
                        },
                      );
                    }
                  }}
                />
                <span>
                  {trackLabel(track)}
                  {existingLibraryTrack
                    ? " · Existing Library"
                    : ""}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
    );
  };

  const beginDraftAssignment = () => {
    setDraftAssignment({
      id: createArtworkAssignmentId(
        asset.artworkAssignments,
      ),
      scope: "release",
      role:
        asset.artworkAssignments.length > 0
          ? "alternate_front_cover"
          : "front_cover",
      trackSourceRelativePaths: [],
    });
  };

  const draftNeedsTrack =
    draftAssignment?.scope === "track" &&
    draftAssignment.trackSourceRelativePaths.length === 0;

  return (
    <div className="ingest-artwork-assignments-editor">
      {asset.artworkAssignments.length === 0 &&
        !draftAssignment && (
          <p className="metadata-empty-value">
            No release-level or track-level use assigned.
          </p>
        )}

      {asset.artworkAssignments.map(
        (assignment, assignmentIndex) => (
          <section
            key={assignment.id}
            className="ingest-artwork-assignment-row"
          >
            <header>
              <strong>
                {assignmentLabel(
                  assignment,
                  tracks,
                )}
              </strong>
            </header>

            <div className="ingest-artwork-assignment-fields">
              <label className="ingest-artwork-assignment-field">
                <span>Scope</span>
                <select
                  value={assignment.scope}
                  disabled={disabled}
                  onChange={(event) => {
                    const scope =
                      event.target.value === "track"
                        ? "track"
                        : "release";

                    updateExistingAssignment(
                      assignmentIndex,
                      {
                        scope,
                        trackSourceRelativePaths:
                          scope === "release"
                            ? []
                            : assignment.trackSourceRelativePaths,
                      },
                    );
                  }}
                >
                  <option value="release">
                    Release level
                  </option>
                  <option value="track">
                    Track level
                  </option>
                </select>
              </label>

              <label className="ingest-artwork-assignment-field">
                <span>Artwork role</span>
                <select
                  value={assignment.role}
                  disabled={disabled}
                  onChange={(event) =>
                    updateExistingAssignment(
                      assignmentIndex,
                      {
                        role: event.target.value,
                      },
                    )
                  }
                >
                  {renderRoleOptions(assignment)}
                </select>
              </label>

              {renderTrackTargets(
                assignment,
                false,
                assignmentIndex,
              )}
            </div>

            <div className="ingest-artwork-assignment-actions">
              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  removeExistingAssignment(
                    assignmentIndex,
                  )
                }
              >
                Remove assignment
              </button>
            </div>
          </section>
        ),
      )}

      {draftAssignment && (
        <section
          className="ingest-artwork-assignment-draft"
          aria-label="New artwork assignment"
        >
          <header>
            <div>
              <strong>New artwork assignment</strong>
              <small>
                Choose the scope and role, then apply
                this assignment.
              </small>
            </div>
            <span className="badge">
              Not applied
            </span>
          </header>

          <div className="ingest-artwork-assignment-fields">
            <label className="ingest-artwork-assignment-field">
              <span>Scope</span>
              <select
                value={draftAssignment.scope}
                disabled={disabled}
                onChange={(event) => {
                  const scope =
                    event.target.value === "track"
                      ? "track"
                      : "release";

                  updateDraftAssignment({
                    scope,
                    trackSourceRelativePaths: [],
                  });
                }}
              >
                <option value="release">
                  Release level
                </option>
                <option value="track">
                  Track level
                </option>
              </select>
            </label>

            <label className="ingest-artwork-assignment-field">
              <span>Artwork role</span>
              <select
                value={draftAssignment.role}
                disabled={disabled}
                onChange={(event) =>
                  updateDraftAssignment({
                    role: event.target.value,
                  })
                }
              >
                {renderRoleOptions(draftAssignment)}
              </select>
            </label>

            {renderTrackTargets(
              draftAssignment,
              true,
            )}
          </div>

          {draftNeedsTrack && (
            <p className="ingest-artwork-assignment-draft-note">
              Select at least one available track before
              applying a track-level assignment.
            </p>
          )}

          <div className="ingest-artwork-assignment-draft-actions">
            <button
              type="button"
              className="primary-button"
              disabled={
                disabled ||
                draftNeedsTrack
              }
              onClick={() => {
                onChange({
                  include: true,
                  artworkAssignments: [
                    ...asset.artworkAssignments,
                    draftAssignment,
                  ],
                });
                setDraftAssignment(null);
              }}
            >
              Apply assignment
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() =>
                setDraftAssignment(null)
              }
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      {!draftAssignment && (
        <button
          type="button"
          className="ingest-artwork-add-assignment"
          disabled={disabled}
          onClick={beginDraftAssignment}
        >
          {asset.artworkAssignments.length > 0
            ? "Add another assignment"
            : "Add artwork assignment"}
        </button>
      )}
    </div>
  );
}
function artworkAssignmentIssues(
  draft: IngestBuildDraft,
): string[] {
  const includedTrackPaths = new Set(
    draft.tracks
      .filter((track) => track.include)
      .map((track) => track.sourceRelativePath),
  );
  const issues: string[] = [];

  for (const asset of draft.assets) {
    if (asset.mediaKind !== "image" || !asset.include) {
      continue;
    }

    if (asset.artworkAssignments.length === 0) {
      issues.push(
        `${asset.sourceRelativePath}: add at least one release-level or track-level artwork assignment.`,
      );
      continue;
    }

    for (const assignment of asset.artworkAssignments) {
      if (!assignment.role.trim()) {
        issues.push(
          `${asset.sourceRelativePath}: every artwork assignment requires a role.`,
        );
      }

      if (assignment.scope === "release") {
        continue;
      }

      const selectedIncludedTracks =
        assignment.trackSourceRelativePaths.filter((trackPath) =>
          includedTrackPaths.has(trackPath),
        );

      if (selectedIncludedTracks.length === 0) {
        issues.push(
          `${asset.sourceRelativePath}: ${assignment.role || "track-level artwork"} must select at least one included track.`,
        );
      }

      if (
        selectedIncludedTracks.length !==
        assignment.trackSourceRelativePaths.length
      ) {
        issues.push(
          `${asset.sourceRelativePath}: remove excluded tracks from the ${assignment.role || "track-level artwork"} assignment.`,
        );
      }
    }
  }

  return [...new Set(issues)];
}

function ArtworkAssignmentSummary({
  draft,
}: {
  draft: IngestBuildDraft;
}) {
  const artwork = draft.assets.filter(
    (asset) =>
      asset.mediaKind === "image" &&
      asset.include,
  );
  const assignmentCount = artwork.reduce(
    (total, asset) =>
      total + asset.artworkAssignments.length,
    0,
  );

  return (
    <section className="ingest-artwork-summary-panel">
      <header>
        <div>
          <h4>Artwork use</h4>
          <p>
            Artwork assignments determine physical placement. Release
            artwork stays under the release artwork tree; track artwork
            is copied into each selected track's own artwork directory.
          </p>
        </div>
        <span className="badge">
          {artwork.length} source{artwork.length === 1 ? "" : "s"}
          {" · "}
          {assignmentCount} assignment{assignmentCount === 1 ? "" : "s"}
        </span>
      </header>

      {artwork.length === 0 ? (
        <p className="metadata-empty-value">
          No artwork is currently included.
        </p>
      ) : (
        <div className="ingest-table-scroll">
          <table className="ingest-table ingest-artwork-summary-table">
            <thead>
              <tr>
                <th scope="col">Artwork source</th>
                <th scope="col">Physical staged copies</th>
                <th scope="col">Metadata assignments</th>
                <th scope="col">TOMLs updated</th>
              </tr>
            </thead>
            <tbody>
              {artwork.map((asset) => (
                <tr key={asset.sourceRelativePath}>
                  <th scope="row" className="ingest-sticky-column">
                    <code>{asset.sourceRelativePath}</code>
                  </th>
                  <td>
                    {artworkPhysicalCopyCount(asset)} assignment-scoped
                    {" "}
                    {artworkPhysicalCopyCount(asset) === 1
                      ? "copy"
                      : "copies"}
                    <br />
                    <span className="metadata-empty-value">
                      Exact destinations appear in Filesystem plan.
                    </span>
                  </td>
                  <td>
                    <div className="ingest-artwork-assignment-badges">
                      {asset.artworkAssignments.map((assignment) => (
                        <span
                          key={assignment.id}
                          className="badge ingest-artwork-scope-badge"
                        >
                          {assignmentLabel(assignment, draft.tracks)}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    {asset.artworkAssignments
                      .flatMap((assignment) =>
                        artworkTomlTargets(
                          assignment,
                          draft.tracks,
                        ),
                      )
                      .filter(
                        (value, index, values) =>
                          values.indexOf(value) === index,
                      )
                      .join(", ") || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function basenameForSidecarMatch(value: string): string {
  const normalized = value.replaceAll("\\", "/");
  return normalized.slice(normalized.lastIndexOf("/") + 1);
}

function sidecarSuggestion(
  file: IngestFileInspection,
  canonicalPath: string,
): IngestMetadataSidecarSuggestion | undefined {
  const matches = file.metadataSidecar?.suggestions.filter(
    (item) => item.canonicalPath === canonicalPath,
  ) ?? [];

  return matches.length === 1 ? matches[0] : undefined;
}

function sidecarTrackTarget(
  file: IngestFileInspection,
  draft: IngestBuildDraft,
  targetStatus: IngestStagingTargetStatus | null,
) {
  const sidecar = file.metadataSidecar;
  if (!sidecar) {
    return undefined;
  }

  if (sidecar.pairedAudioRelativePath) {
    const track = draft.tracks.find(
      (candidate) =>
        candidate.sourceRelativePath ===
        sidecar.pairedAudioRelativePath,
    );
    if (track) {
      return {
        kind: "draft" as const,
        track,
        label: `Track ${track.trackNumber} · ${track.title}`,
      };
    }
  }

  if (sidecar.audioFilenameHint) {
    const hint = sidecar.audioFilenameHint.toLocaleLowerCase();
    const draftTrack = draft.tracks.find(
      (track) =>
        basenameForSidecarMatch(track.sourceRelativePath)
          .toLocaleLowerCase() === hint,
    );
    if (draftTrack) {
      return {
        kind: "draft" as const,
        track: draftTrack,
        label: `Track ${draftTrack.trackNumber} · ${draftTrack.title}`,
      };
    }

    const existingTrack = targetStatus?.existingTracks.find(
      (track) =>
        basenameForSidecarMatch(track.sourceRelativePath)
          .toLocaleLowerCase() === hint,
    );
    if (existingTrack) {
      return {
        kind: "existing" as const,
        track: existingTrack,
        label: `Track ${existingTrack.number} · ${existingTrack.title}`,
      };
    }
  }

  const number = sidecarSuggestion(
    file,
    "track.numbering.track_number",
  )?.value;
  if (typeof number === "number") {
    const draftTrack = draft.tracks.find(
      (track) => track.trackNumber === number,
    );
    if (draftTrack) {
      return {
        kind: "draft" as const,
        track: draftTrack,
        label: `Track ${draftTrack.trackNumber} · ${draftTrack.title}`,
      };
    }

    const existingTrack = targetStatus?.existingTracks.find(
      (track) => track.number === number,
    );
    if (existingTrack) {
      return {
        kind: "existing" as const,
        track: existingTrack,
        label: `Track ${existingTrack.number} · ${existingTrack.title}`,
      };
    }
  }

  const title = sidecarSuggestion(file, "track.title")?.value;
  if (typeof title === "string") {
    const normalized = title.trim().toLocaleLowerCase();
    const existingTrack = targetStatus?.existingTracks.find(
      (track) => track.title.trim().toLocaleLowerCase() === normalized,
    );
    if (existingTrack) {
      return {
        kind: "existing" as const,
        track: existingTrack,
        label: `Track ${existingTrack.number} · ${existingTrack.title}`,
      };
    }
  }

  return undefined;
}

type SidecarCurrentValue =
  | string
  | number
  | boolean
  | string[]
  | undefined;

function sidecarCurrentValue(
  suggestion: IngestMetadataSidecarSuggestion,
  draft: IngestBuildDraft,
  targetStatus: IngestStagingTargetStatus | null,
  trackTarget: ReturnType<typeof sidecarTrackTarget>,
): SidecarCurrentValue {
  const existingRelease = targetStatus?.exists
    ? targetStatus.existingRelease
    : undefined;
  const existingReleaseValue =
    existingRelease?.metadataValues?.[suggestion.canonicalPath];
  if (existingReleaseValue !== undefined) {
    return existingReleaseValue;
  }

  if (trackTarget?.kind === "existing") {
    const existingTrackValue =
      trackTarget.track.metadataValues?.[suggestion.canonicalPath];
    if (existingTrackValue !== undefined) {
      return existingTrackValue;
    }
  }

  switch (suggestion.canonicalPath) {
    case "release.title":
      return existingRelease?.title ?? draft.releaseTitle;
    case "release.primary_artist.name":
      return existingRelease?.artist ?? draft.releaseArtist;
    case "release.dates.release":
      return existingRelease?.date ?? draft.releaseDate;
    case "track.title":
      return trackTarget?.track.title;
    case "track.primary_artist.name":
      return trackTarget?.track.artist;
    case "track.numbering.track_number":
      return trackTarget?.kind === "draft"
        ? trackTarget.track.trackNumber
        : trackTarget?.track.number;
    default:
      return undefined;
  }
}

function sidecarCurrentValueLabel(
  current: SidecarCurrentValue,
): string {
  if (current === undefined) {
    return "Not present in current metadata";
  }

  return Array.isArray(current)
    ? current.join(" · ")
    : String(current);
}

function sidecarComparisonLabel(
  suggestion: IngestMetadataSidecarSuggestion,
  current: SidecarCurrentValue,
): string {
  if (
    current === undefined ||
    (!Array.isArray(current) && String(current).trim() === "") ||
    (Array.isArray(current) && current.length === 0)
  ) {
    return suggestion.reviewRequired
      ? "Review before applying"
      : "New suggestion";
  }

  if (Array.isArray(current)) {
    if (
      current.length === 1 &&
      current[0].trim().localeCompare(
        String(suggestion.value).trim(),
        undefined,
        { sensitivity: "base" },
      ) === 0
    ) {
      return "Matches current";
    }

    return "Review current list";
  }

  return String(current).trim().localeCompare(
    String(suggestion.value).trim(),
    undefined,
    { sensitivity: "base" },
  ) === 0
    ? "Matches current"
    : "Differs from current";
}

function MetadataSidecarComparisonPanel({
  files,
  draft,
  targetStatus,
}: {
  files: IngestFileInspection[];
  draft: IngestBuildDraft;
  targetStatus: IngestStagingTargetStatus | null;
}) {
  const sidecars = files.filter(
    (file) => file.metadataSidecar,
  );

  if (sidecars.length === 0) {
    return null;
  }

  const suggestionCount = sidecars.reduce(
    (total, file) =>
      total + (file.metadataSidecar?.suggestions.length ?? 0),
    0,
  );

  return (
    <details className="ingest-table-panel ingest-sidecar-comparison-panel">
      <summary>
        <span>
          <strong>Metadata sidecar evidence</strong>
          <small>
            Compare imported FFmetadata against the current Staging draft
            {targetStatus?.exists ? " and existing Library release" : ""}.
          </small>
        </span>
        <span className="badge">
          {sidecars.length} sidecar{sidecars.length === 1 ? "" : "s"} · {suggestionCount} suggestion{suggestionCount === 1 ? "" : "s"}
        </span>
      </summary>
      <div className="ingest-review-details-body">
        <p className="metadata-empty-value">
          Sidecars are evidence, not authority. Initial create drafts can use
          unambiguous paired values automatically; existing Library releases
          are compared here without silently overwriting authored metadata.
        </p>
        {sidecars.map((file) => {
          const sidecar = file.metadataSidecar!;
          const trackTarget = sidecarTrackTarget(
            file,
            draft,
            targetStatus,
          );
          const grouped = new Map<
            string,
            IngestMetadataSidecarSuggestion[]
          >();

          for (const item of sidecar.suggestions) {
            const current = grouped.get(item.canonicalPath) ?? [];
            current.push(item);
            grouped.set(item.canonicalPath, current);
          }

          return (
            <section
              key={file.relativePath}
              className="ingest-sidecar-comparison-item"
            >
              <header>
                <div>
                  <strong>{file.filename}</strong>
                  <code>{file.relativePath}</code>
                </div>
                <span className="badge">
                  {trackTarget?.label ?? "Release / unpaired evidence"}
                </span>
              </header>
              <div className="ingest-table-scroll">
                <table className="ingest-table">
                  <thead>
                    <tr>
                      <th scope="col">Suggested field</th>
                      <th scope="col">Sidecar value</th>
                      <th scope="col">Current value</th>
                      <th scope="col">Comparison</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...grouped.entries()].map(
                      ([canonicalPath, items]) => {
                        const distinctValues = [
                          ...new Set(
                            items.map((item) => String(item.value)),
                          ),
                        ];
                        const first = items[0];
                        const current = sidecarCurrentValue(
                          first,
                          draft,
                          targetStatus,
                          trackTarget,
                        );
                        const conflict = distinctValues.length > 1;

                        return (
                          <tr key={canonicalPath}>
                            <th scope="row">
                              <strong>{first.label}</strong>
                              <code>{canonicalPath}</code>
                            </th>
                            <td>{distinctValues.join(" ↔ ")}</td>
                            <td>
                              {sidecarCurrentValueLabel(current)}
                            </td>
                            <td>
                              <span
                                className={[
                                  "badge",
                                  conflict
                                    ? "missing"
                                    : sidecarComparisonLabel(
                                          first,
                                          current,
                                        ) === "Matches current"
                                      ? "complete"
                                      : "",
                                ]
                                  .filter(Boolean)
                                  .join(" ")}
                              >
                                {conflict
                                  ? "Sidecar values conflict"
                                  : sidecarComparisonLabel(first, current)}
                              </span>
                            </td>
                          </tr>
                        );
                      },
                    )}
                  </tbody>
                </table>
              </div>
              {sidecar.unmappedKeys.length > 0 && (
                <p className="metadata-empty-value">
                  Preserved for future mapping: {sidecar.unmappedKeys.join(", ")}
                </p>
              )}
              {sidecar.warnings.length > 0 && (
                <ul className="ingest-warning-list">
                  {sidecar.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </details>
  );
}

export function IngestReleaseBuilder({
  inspection,
  identitySeed,
  onCancel,
  onReleaseCreated,
  onNotify,
  playback,
}: {
  inspection: IngestCandidateInspection;
  identitySeed?: IngestDraftIdentitySeed | null;
  onCancel: () => void;
  onReleaseCreated: (
    releaseId: string,
  ) => void | Promise<void>;
  onNotify: (
    message: string,
    tone?: "success" | "info" | "error",
  ) => void;
  playback: PersistentLibraryPlaybackController;
}) {
  const {
    draft,
    setDraft,
    sourceStatuses,
    inspection: currentInspection,
    attachmentOptions,
    saveState,
    lastSavedAt,
    workflowError,
    rescanLoading,
    rescanMessage,
    rescan,
    attachFile,
    detachFile,
    markReviewed,
    clearStoredDraft,
  } = useIngestDraft(
    inspection,
    identitySeed ?? null,
  );
  const trackSourceFiles =
    currentInspection.files.filter(
      (file) => file.mediaKind === "audio",
    );
  const [mode, setMode] =
    useState<BuilderMode>("guided");
  const [guidedStep, setGuidedStep] =
    useState<GuidedStep>(1);
  const [preview, setPreview] =
    useState<IngestBuildPreview | null>(
      null,
    );
  const [result, setResult] =
    useState<IngestBuildResult | null>(
      null,
    );
  const [error, setError] =
    useState<string | null>(null);
  const [previewLoading, setPreviewLoading] =
    useState(false);
  const [buildLoading, setBuildLoading] =
    useState(false);
  const [confirmed, setConfirmed] =
    useState(false);
  const [focusedSourcePath, setFocusedSourcePath] =
    useState<string | null>(null);
  const [targetStatus, setTargetStatus] =
    useState<IngestStagingTargetStatus | null>(null);
  const [targetStatusLoading, setTargetStatusLoading] =
    useState(false);
  const [legacyReceiptMigrationLoading, setLegacyReceiptMigrationLoading] =
    useState(false);
  const [legacyArtworkReceiptRepairLoading, setLegacyArtworkReceiptRepairLoading] =
    useState(false);
  const canonicalTargetAppliedRef =
    useRef<string | null>(null);
  const blockingSources =
    buildBlockingSourceStatuses(
      draft,
      sourceStatuses,
    );
  const stagingOperation: IngestBuildOperation =
    preview?.operation ??
    targetStatus?.operation ??
    "create";

  const stagingPlaybackQueue: PersistentPlaybackTrack[] =
    trackSourceFiles.map((file) => ({
      key: `ingest:${currentInspection.candidate.id}:${file.relativePath}`,
      source: buildIngestAudioPreviewUrl(
        file.relativePath,
        file.modifiedAt,
      ),
      title: file.filename,
      releaseTitle: currentInspection.candidate.displayTitle,
      detail: [
        "Ingest source",
        file.technical.codec ?? file.technical.container,
      ].filter(Boolean).join(" · "),
    }));
  const stagingPlaybackPrefix =
    `ingest:${currentInspection.candidate.id}:`;
  const audioPreviewSourcePath =
    playback.currentTrack?.key.startsWith(
      stagingPlaybackPrefix,
    )
      ? playback.currentTrack.key.slice(
          stagingPlaybackPrefix.length,
        )
      : null;
  const audioPreviewPlaying =
    audioPreviewSourcePath !== null && playback.isPlaying;
  const audioPreviewLoading =
    audioPreviewSourcePath !== null && playback.isLoading;
  const audioPreviewError =
    audioPreviewSourcePath !== null ? playback.error : null;

  const toggleIngestAudioPreview = (
    sourceRelativePath: string,
  ) => {
    const source = trackSourceFiles.find(
      (file) => file.relativePath === sourceRelativePath,
    );

    if (!source) {
      return;
    }

    playback.toggleTrack(
      `ingest:${currentInspection.candidate.id}:${sourceRelativePath}`,
      stagingPlaybackQueue,
    );
  };

  const audioPreviewControls: IngestAudioPreviewControls = {
    sourceRelativePath: audioPreviewSourcePath,
    playing: audioPreviewPlaying,
    loading: audioPreviewLoading,
    toggle: toggleIngestAudioPreview,
  };

  useEffect(() => {
    const releaseId = draft.releaseId.trim();

    if (!/^[a-z0-9][a-z0-9_-]*$/.test(releaseId)) {
      setTargetStatus(null);
      setTargetStatusLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      setTargetStatusLoading(true);

      void fetch(
        `/api/ingest/staging-target?release=${encodeURIComponent(releaseId)}`,
        { signal: controller.signal },
      )
        .then(async (response) => {
          const body = (await response.json()) as unknown;

          if (!response.ok) {
            throw new Error(
              messageFromResponse(
                body,
                `Staging target lookup failed: HTTP ${response.status}`,
              ),
            );
          }

          const status =
            body as IngestStagingTargetStatus;

          setTargetStatus(status);

          if (
            identitySeed?.targetReleaseId ===
              status.releaseId &&
            status.exists &&
            status.existingRelease &&
            canonicalTargetAppliedRef.current !==
              status.releaseId
          ) {
            canonicalTargetAppliedRef.current =
              status.releaseId;

            setDraft((current) => {
              const existing =
                status.existingRelease!;
              const previousReleaseArtist =
                current.releaseArtist;

              const releaseArtist =
                existing.artist.trim() ||
                current.releaseArtist;

              return {
                ...current,
                releaseId: status.releaseId,
                releaseTitle:
                  existing.title.trim() ||
                  current.releaseTitle,
                releaseArtist,
                releaseDate:
                  existing.date.trim() ||
                  current.releaseDate,
                releaseType:
                  existing.type.trim() ||
                  current.releaseType,
                tracks: current.tracks.map(
                  (track) => ({
                    ...track,
                    artist:
                      !track.artist.trim() ||
                      track.artist ===
                        previousReleaseArtist
                        ? releaseArtist
                        : track.artist,
                  }),
                ),
              };
            });
          }
        })
        .catch((lookupError: unknown) => {
          if (
            lookupError instanceof DOMException &&
            lookupError.name === "AbortError"
          ) {
            return;
          }

          setTargetStatus(null);
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setTargetStatusLoading(false);
          }
        });
    }, 200);

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [draft.releaseId]);

  const invalidateBuildPlan = () => {
    setPreview(null);
    setResult(null);
    setConfirmed(false);
    setError(null);
  };

  const rescanCandidate = async () => {
    invalidateBuildPlan();
    await rescan();
  };

  const attachLooseFile = (
    file: IngestFileInspection,
  ) => {
    invalidateBuildPlan();
    attachFile(file);
  };

  const removeAssetFromDraft = (
    sourceRelativePath: string,
  ) => {
    invalidateBuildPlan();
    detachFile(sourceRelativePath);
  };

  const reviewSource = (
    sourceRelativePath: string,
    reviewed: boolean,
  ) => {
    invalidateBuildPlan();
    markReviewed(
      sourceRelativePath,
      reviewed,
    );
  };

  const updateDraft = (
    updater: (
      current: IngestBuildDraft,
    ) => IngestBuildDraft,
  ) => {
    setDraft(updater);
    setPreview(null);
    setResult(null);
    setConfirmed(false);
    setError(null);
  };

  const updateRelease = (
    key: keyof Pick<
      IngestBuildDraft,
      | "releaseId"
      | "releaseTitle"
      | "releaseArtist"
      | "releaseDate"
      | "releaseType"
    >,
    value: string,
  ) => {
    updateDraft((current) => {
      const nextReleaseTitle =
        key === "releaseTitle"
          ? value
          : current.releaseTitle;
      const nextReleaseDate =
        key === "releaseDate"
          ? value
          : current.releaseDate;
      const synchronizeReleaseId =
        (key === "releaseTitle" ||
          key === "releaseDate") &&
        shouldSynchronizeReleaseDirectoryId(
          current,
        );

      const nextReleaseId =
        key === "releaseId"
          ? value
          : synchronizeReleaseId
            ? buildReleaseDirectoryId(
                nextReleaseDate,
                nextReleaseTitle,
              )
            : current.releaseId;
      let nextTracks = current.tracks;

      if (key === "releaseArtist") {
        nextTracks = nextTracks.map((track) => ({
          ...track,
          artist:
            !track.artist ||
            track.artist ===
              current.releaseArtist
              ? value
              : track.artist,
        }));
      }

      if (nextReleaseId !== current.releaseId) {
        nextTracks = nextTracks.map((track) => ({
          ...track,
          replacementTrackId: undefined,
        }));
      }

      return {
        ...current,
        [key]: value,
        releaseId: nextReleaseId,
        tracks: nextTracks,
      };
    });
  };

  /*
   * Migrate the deterministic date-plus-artist value produced by older
   * drafts. Arbitrary custom IDs remain untouched and can always be restored
   * to the current generated suggestion from the Release step.
   */
  useEffect(() => {
    const generatedId = buildReleaseDirectoryId(
      draft.releaseDate,
      draft.releaseTitle,
    );
    const legacyArtistId =
      buildReleaseDirectoryId(
        draft.releaseDate,
        draft.releaseArtist,
      );

    if (
      generatedId === legacyArtistId ||
      draft.releaseId.trim() !==
        legacyArtistId
    ) {
      return;
    }

    updateDraft((current) => {
      if (
        current.releaseId.trim() !==
        legacyArtistId
      ) {
        return current;
      }

      return {
        ...current,
        releaseId: generatedId,
      };
    });
  }, [
    draft.releaseArtist,
    draft.releaseDate,
    draft.releaseId,
    draft.releaseTitle,
  ]);

  const updateTrack = (
    sourceRelativePath: string,
    patch: Partial<IngestBuildTrackDraft>,
  ) => {
    updateDraft((current) => ({
      ...current,
      tracks: current.tracks.map(
        (track) =>
          track.sourceRelativePath ===
          sourceRelativePath
            ? {
                ...track,
                ...patch,
              }
            : track,
      ),
    }));
  };

  const updateVideo = (
    sourceRelativePath: string,
    patch: Partial<IngestBuildVideoDraft>,
  ) => {
    updateDraft((current) => ({
      ...current,
      videos: (current.videos ?? []).map((video) =>
        video.sourceRelativePath === sourceRelativePath
          ? { ...video, ...patch }
          : video,
      ),
    }));
  };

  const applyTrackSourceDate = (
    sourceRelativePaths: string[],
    sourceDate: string,
  ) => {
    if (
      sourceRelativePaths.length === 0 ||
      !/^\d{4}-\d{2}-\d{2}$/.test(
        sourceDate,
      )
    ) {
      return;
    }

    const selectedPaths = new Set(
      sourceRelativePaths,
    );

    updateDraft((current) => ({
      ...current,
      tracks: current.tracks.map(
        (track) =>
          selectedPaths.has(
            track.sourceRelativePath,
          )
            ? {
                ...track,
                date: sourceDate,
              }
            : track,
      ),
    }));
  };

  const applyTrackTitles = (
    updates: IngestTrackTitleUpdate[],
  ) => {
    if (updates.length === 0) {
      return;
    }

    const titlesByPath = new Map(
      updates.map((update) => [
        update.sourceRelativePath,
        update.title,
      ]),
    );

    updateDraft((current) => ({
      ...current,
      tracks: current.tracks.map(
        (track) => {
          const title = titlesByPath.get(
            track.sourceRelativePath,
          );

          return title === undefined
            ? track
            : {
                ...track,
                title,
              };
        },
      ),
    }));
  };

  const updateAsset = (
    sourceRelativePath: string,
    patch: Partial<IngestBuildAssetDraft>,
  ) => {
    updateDraft((current) => ({
      ...current,
      assets: current.assets.map(
        (asset) =>
          asset.sourceRelativePath ===
          sourceRelativePath
            ? {
                ...asset,
                ...patch,
              }
            : asset,
      ),
    }));
  };

  const migrateLegacyReceipt = async () => {
    const migration = targetStatus?.legacyReceiptMigration;
    if (!migration) {
      return;
    }

    setLegacyReceiptMigrationLoading(true);
    setError(null);

    try {
      const response = await fetch(
        "/api/ingest/migrate-legacy-receipt",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            releaseId: draft.releaseId,
            expectedFingerprint: migration.fingerprint,
            confirmation: migration.confirmationPhrase,
          }),
        },
      );
      const responseBody = (await response.json()) as unknown;

      if (!response.ok) {
        throw new Error(
          messageFromResponse(
            responseBody,
            `Legacy receipt migration failed: HTTP ${response.status}`,
          ),
        );
      }

      if (
        typeof responseBody !== "object" ||
        responseBody === null ||
        Array.isArray(responseBody) ||
        !("status" in responseBody)
      ) {
        throw new Error(
          "Legacy receipt migration returned an invalid staging-target status.",
        );
      }

      setTargetStatus(
        (responseBody as { status: IngestStagingTargetStatus }).status,
      );
      setPreview(null);
      setConfirmed(false);
      setGuidedStep(4);
    } catch (migrationError) {
      setError(
        migrationError instanceof Error
          ? migrationError.message
          : "Unknown legacy receipt migration error",
      );
    } finally {
      setLegacyReceiptMigrationLoading(false);
    }
  };

  const repairLegacyArtworkReceipt = async () => {
    const repair = targetStatus?.legacyArtworkReceiptRepair;
    if (!repair) {
      return;
    }

    setLegacyArtworkReceiptRepairLoading(true);
    setError(null);

    try {
      const response = await fetch(
        "/api/ingest/repair-legacy-artwork-receipt",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            releaseId: draft.releaseId,
            expectedFingerprint: repair.fingerprint,
            confirmation: repair.confirmationPhrase,
          }),
        },
      );
      const responseBody = (await response.json()) as unknown;

      if (!response.ok) {
        throw new Error(
          messageFromResponse(
            responseBody,
            `Legacy artwork receipt repair failed: HTTP ${response.status}`,
          ),
        );
      }

      if (
        typeof responseBody !== "object" ||
        responseBody === null ||
        Array.isArray(responseBody) ||
        !("status" in responseBody)
      ) {
        throw new Error(
          "Legacy artwork receipt repair returned an invalid staging-target status.",
        );
      }

      setTargetStatus(
        (responseBody as { status: IngestStagingTargetStatus }).status,
      );
      setPreview(null);
      setConfirmed(false);
      setGuidedStep(4);
      onNotify(
        `Current canonical artwork baselined in the legacy ingest receipt. Confirm the intended artwork replacement to continue.`,
        "success",
      );
    } catch (repairError) {
      setError(
        repairError instanceof Error
          ? repairError.message
          : "Unknown legacy artwork receipt repair error",
      );
    } finally {
      setLegacyArtworkReceiptRepairLoading(false);
    }
  };

  const previewBuild = async () => {
    setPreviewLoading(true);
    setError(null);

    try {
      const response = await fetch(
        "/api/ingest/build-preview",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            draft,
            sourceStatuses,
          }),
        },
      );
      const responseBody =
        (await response.json()) as unknown;

      if (!response.ok) {
        throw new Error(
          messageFromResponse(
            responseBody,
            `Build preview failed: HTTP ${response.status}`,
          ),
        );
      }

      setPreview(
        responseBody as IngestBuildPreview,
      );
      setConfirmed(false);
    } catch (previewError) {
      setError(
        previewError instanceof Error
          ? previewError.message
          : "Unknown build-preview error",
      );
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const resolveBlockingSource = (
    status: IngestDraftSourceStatus,
    include: boolean,
  ) => {
    const track = draft.tracks.find(
      (item) =>
        item.sourceRelativePath ===
        status.sourceRelativePath,
    );
    const video = (draft.videos ?? []).find(
      (item) =>
        item.sourceRelativePath ===
        status.sourceRelativePath,
    );
    const asset = draft.assets.find(
      (item) =>
        item.sourceRelativePath ===
        status.sourceRelativePath,
    );

    if (track) {
      updateTrack(status.sourceRelativePath, {
        include,
      });
    }

    if (video) {
      updateVideo(status.sourceRelativePath, {
        include,
      });
    }

    if (asset) {
      const artworkAssignments =
        asset.mediaKind === "image" &&
        include &&
        asset.artworkAssignments.length === 0
          ? [defaultReleaseArtworkAssignment()]
          : include
            ? asset.artworkAssignments
            : [];

      updateAsset(status.sourceRelativePath, {
        include,
        artworkAssignments,
      });
    }

    reviewSource(
      status.sourceRelativePath,
      true,
    );
  };

  const reviewBlockingSource = (
    status: IngestDraftSourceStatus,
  ) => {
    const isTrack = draft.tracks.some(
      (track) =>
        track.sourceRelativePath ===
        status.sourceRelativePath,
    );
    const isVideo = (draft.videos ?? []).some(
      (video) =>
        video.sourceRelativePath ===
        status.sourceRelativePath,
    );

    setMode("guided");
    setGuidedStep(isTrack ? 2 : isVideo ? 3 : 4);
    setFocusedSourcePath(
      status.sourceRelativePath,
    );

    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const target = Array.from(
          document.querySelectorAll<HTMLElement>(
            "[data-ingest-source-path]",
          ),
        ).find(
          (element) =>
            element.dataset.ingestSourcePath ===
            status.sourceRelativePath,
        );

        target?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
        target?.focus({
          preventScroll: true,
        });
      });
    });
  };

  const createRelease = async () => {
    if (!confirmed || !preview) {
      return;
    }

    setBuildLoading(true);
    setError(null);

    try {
      const response = await fetch(
        "/api/ingest/build",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            draft,
            sourceStatuses,
            confirmation:
              preview.operation === "update"
                ? INGEST_UPDATE_CONFIRMATION_PHRASE
                : INGEST_BUILD_CONFIRMATION_PHRASE,
  INGEST_UPDATE_CONFIRMATION_PHRASE,
          }),
        },
      );
      const responseBody =
        (await response.json()) as unknown;

      if (!response.ok) {
        throw new Error(
          messageFromResponse(
            responseBody,
            `Staging release ${preview.operation === "update" ? "update" : "creation"} failed: HTTP ${response.status}`,
          ),
        );
      }

      setResult(
        responseBody as IngestBuildResult,
      );
      await clearStoredDraft();
      setPreview(null);
      setConfirmed(false);
    } catch (buildError) {
      setError(
        buildError instanceof Error
          ? buildError.message
          : "Unknown staging-release error",
      );
    } finally {
      setBuildLoading(false);
    }
  };

  if (result) {
    return (
      <section className="ingest-builder">
        <header className="ingest-builder-header">
          <div>
            <p className="eyebrow">
              Staging release {result.operation === "update" ? "updated" : "created"}
            </p>
            <h2>{draft.releaseTitle}</h2>
            <code>
              {result.releaseRelativePath}
            </code>
          </div>
          <span className="badge success">
            Verified
          </span>
        </header>

        <div className="message success">
          <strong>
            {result.operation === "update"
              ? `${result.createdFiles.length} files added, ${result.updatedFiles.length} files updated, ${result.removedFiles.length} superseded/generated files removed, and ${result.preservedFiles.length} existing files preserved.`
              : `${result.createdFiles.length} files created and verified.`}
          </strong>
          <p>
            Source files remain in the ingest drop.
            Copied media hashes were checked before
            the staging release was promoted.
          </p>
        </div>

        <section className="ingest-table-panel">
          <header className="ingest-table-panel-header">
            <h3>Copy receipts</h3>
          </header>
          <div className="ingest-table-scroll">
            <table className="ingest-table">
              <thead>
                <tr>
                  <th scope="col">Source</th>
                  <th scope="col">Relative destination</th>
                  <th scope="col">Roles</th>
                  <th
                    scope="col"
                    className="numeric"
                  >
                    Size
                  </th>
                  <th scope="col">SHA-256</th>
                </tr>
              </thead>
              <tbody>
                {result.receipts.map(
                  (receipt) => (
                    <tr
                      key={
                        receipt.destinationRelativePath
                      }
                    >
                      <th
                        scope="row"
                        className="ingest-sticky-column"
                      >
                        <code>
                          {
                            receipt.sourceRelativePath
                          }
                        </code>
                      </th>
                      <td>
                        <code
                          title={receipt.destinationRelativePath}
                        >
                          {stagingDestinationPathForDisplay(
                            receipt.destinationRelativePath,
                            result.releaseRelativePath,
                          )}
                        </code>
                      </td>
                      <td>
                        {receipt.logicalRoles.join(
                          ", ",
                        )}
                      </td>
                      <td className="numeric">
                        {formatByteSize(
                          receipt.bytes,
                        )}
                      </td>
                      <td>
                        <code className="ingest-hash">
                          {
                            receipt.destinationSha256
                          }
                        </code>
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="ingest-builder-actions">
          <button
            type="button"
            onClick={onCancel}
          >
            Back to inspection
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() =>
              void onReleaseCreated(
                result.releaseId,
              )
            }
          >
            Open {result.operation === "update" ? "updated" : "created"} release
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="ingest-builder">
      <header className="ingest-builder-header ingest-builder-header-context">
        <div className="ingest-inspection-identity">
          <button
            type="button"
            className="metadata-detail-back-button"
            aria-label="Back to candidate inspection"
            title="Back to candidate inspection"
            onClick={onCancel}
          >
            <span aria-hidden="true">←</span>
          </button>
          <div className="ingest-staging-candidate-context">
            <div className="ingest-staging-candidate-line">
              <span className="eyebrow ingest-staging-candidate-label">
                Selected candidate
              </span>
              <span
                className="ingest-staging-candidate-name"
                title="Selected Ingest candidate"
              >
                {inspection.candidate.displayTitle}
              </span>
              <span className="ingest-staging-candidate-cue">
                Continue below <span aria-hidden="true">↓</span>
              </span>
            </div>
            <code>
              {
                inspection.candidate
                  .relativePath
              }
            </code>
          </div>
        </div>
        <div className="ingest-builder-header-actions">
          <div className="ingest-draft-status">
            <span
              className={`badge ${
                saveState === "error"
                  ? "missing"
                  : saveState === "saved"
                    ? "complete"
                    : ""
              }`}
            >
              {saveState === "loading"
                ? "Loading draft…"
                : saveState === "saving"
                  ? "Saving draft…"
                  : saveState === "error"
                    ? "Draft save failed"
                    : "Draft saved locally"}
            </span>
            {lastSavedAt && (
              <small>
                {new Date(
                  lastSavedAt,
                ).toLocaleString()}
              </small>
            )}
          </div>
          <button
            type="button"
            disabled={rescanLoading}
            onClick={() =>
              void rescanCandidate()
            }
          >
            {rescanLoading
              ? "Rescanning…"
              : "Rescan candidate"}
          </button>
        </div>
      </header>

      {(targetStatusLoading || targetStatus?.exists) && (
        <div className="ingest-staging-target-banner">
          <strong>
            {targetStatusLoading
              ? "Checking staging target…"
              : "Existing staging release detected"}
          </strong>
          <span>
            {targetStatusLoading
              ? `Looking for releases/${draft.releaseId}`
              : targetStatus?.legacyReceiptMigration
                ? "This canonical release predates ingest receipts and needs one guarded baseline migration before incremental updates."
                : targetStatus?.legacyArtworkReceiptRepair
                  ? "This migrated legacy receipt is missing canonical artwork baseline entries; repair those entries before replacing artwork."
                : `Updates will be previewed as a delta against ${targetStatus?.releaseRelativePath}.`}
          </span>
        </div>
      )}

      {targetStatus?.legacyReceiptMigration && (
        <div className="message warning">
          <strong>Legacy release migration required.</strong>{" "}
          The migration records hashes for the current canonical Library
          masters/artwork without changing those files. After it completes,
          return to Artwork &amp; files and explicitly confirm any occupied
          artwork target before previewing the update.
          <button
            type="button"
            className="primary-button"
            disabled={legacyReceiptMigrationLoading}
            onClick={() => void migrateLegacyReceipt()}
          >
            {legacyReceiptMigrationLoading
              ? "Migrating legacy receipt…"
              : "Migrate legacy receipt"}
          </button>
        </div>
      )}

      {targetStatus?.legacyArtworkReceiptRepair && (
        <div className="message warning">
          <strong>Legacy artwork receipt baseline incomplete.</strong>{" "}
          This release has {targetStatus.legacyArtworkReceiptRepair.artworkCount}{" "}
          canonical artwork file{targetStatus.legacyArtworkReceiptRepair.artworkCount === 1 ? "" : "s"}{" "}
          that predate the ingest receipt and are not yet represented by it.
          Baseline only those existing artwork bytes before replacing them;
          audio/video receipt entries are verified and left unchanged.
          <button
            type="button"
            className="primary-button"
            disabled={legacyArtworkReceiptRepairLoading}
            onClick={() => void repairLegacyArtworkReceipt()}
          >
            {legacyArtworkReceiptRepairLoading
              ? "Baselining current artwork…"
              : "Baseline current Library artwork"}
          </button>
        </div>
      )}

      <MetadataSidecarComparisonPanel
        files={currentInspection.files}
        draft={draft}
        targetStatus={targetStatus}
      />

      <nav
        className="ingest-builder-mode-tabs"
        aria-label="Ingest builder mode"
      >
        <button
          type="button"
          className={
            mode === "guided"
              ? "active"
              : undefined
          }
          aria-pressed={mode === "guided"}
          onClick={() =>
            setMode("guided")
          }
        >
          Guided setup
        </button>
        <button
          type="button"
          className={
            mode === "quick"
              ? "active"
              : undefined
          }
          aria-pressed={mode === "quick"}
          onClick={() => setMode("quick")}
        >
          Quick review
        </button>
      </nav>

      {error && (
        <p className="message error">
          {error}
        </p>
      )}

      {audioPreviewError && (
        <p className="message error">
          Audio preview: {audioPreviewError}
        </p>
      )}

      {workflowError && (
        <p className="message error">
          {workflowError}
        </p>
      )}

      {rescanMessage && (
        <p className="message success">
          Rescan complete: {rescanMessage}.
          Existing tag edits were preserved.
        </p>
      )}

      {mode === "guided" ? (
        <GuidedIngestBuilder
          draft={draft}
          step={guidedStep}
          preview={preview}
          previewLoading={previewLoading}
          buildLoading={buildLoading}
          confirmed={confirmed}
          operation={stagingOperation}
          targetStatus={targetStatus}
          onStepChange={setGuidedStep}
          onReleaseChange={updateRelease}
          onTrackChange={updateTrack}
          onVideoChange={updateVideo}
          trackSourceFiles={trackSourceFiles}
          onApplyTrackTitles={applyTrackTitles}
          onApplySourceDate={applyTrackSourceDate}
          audioPreviewControls={audioPreviewControls}
          onAssetChange={updateAsset}
          sourceStatuses={sourceStatuses}
          attachmentFiles={attachmentOptions.files}
          blockingSources={blockingSources}
          onSourceReviewed={reviewSource}
          onAttachFile={attachLooseFile}
          onDetachFile={removeAssetFromDraft}
          onRemoveAsset={removeAssetFromDraft}
          focusedSourcePath={focusedSourcePath}
          onNotify={onNotify}
          onAcceptBlockingSource={(status) =>
            resolveBlockingSource(status, true)
          }
          onSkipBlockingSource={(status) =>
            resolveBlockingSource(status, false)
          }
          onReviewBlockingSource={reviewBlockingSource}
          onPreview={() =>
            void previewBuild()
          }
          onConfirmedChange={
            setConfirmed
          }
          onCreate={() =>
            void createRelease()
          }
        />
      ) : (
        <QuickIngestBuilder
          draft={draft}
          preview={preview}
          previewLoading={previewLoading}
          buildLoading={buildLoading}
          confirmed={confirmed}
          operation={stagingOperation}
          targetStatus={targetStatus}
          onReleaseChange={updateRelease}
          onTrackChange={updateTrack}
          onVideoChange={updateVideo}
          trackSourceFiles={trackSourceFiles}
          onApplyTrackTitles={applyTrackTitles}
          onApplySourceDate={applyTrackSourceDate}
          audioPreviewControls={audioPreviewControls}
          onAssetChange={updateAsset}
          sourceStatuses={sourceStatuses}
          attachmentFiles={attachmentOptions.files}
          blockingSources={blockingSources}
          onSourceReviewed={reviewSource}
          onAttachFile={attachLooseFile}
          onDetachFile={removeAssetFromDraft}
          onRemoveAsset={removeAssetFromDraft}
          focusedSourcePath={focusedSourcePath}
          onNotify={onNotify}
          onAcceptBlockingSource={(status) =>
            resolveBlockingSource(status, true)
          }
          onSkipBlockingSource={(status) =>
            resolveBlockingSource(status, false)
          }
          onReviewBlockingSource={reviewBlockingSource}
          onPreview={() =>
            void previewBuild()
          }
          onConfirmedChange={
            setConfirmed
          }
          onCreate={() =>
            void createRelease()
          }
        />
      )}
    </section>
  );
}

function GuidedIngestBuilder({
  draft,
  step,
  preview,
  previewLoading,
  buildLoading,
  confirmed,
  operation,
  targetStatus,
  onStepChange,
  onReleaseChange,
  onTrackChange,
  onVideoChange,
  trackSourceFiles,
  onApplyTrackTitles,
  onApplySourceDate,
  audioPreviewControls,
  onAssetChange,
  sourceStatuses,
  attachmentFiles,
  blockingSources,
  onSourceReviewed,
  onAttachFile,
  onDetachFile,
  onRemoveAsset,
  focusedSourcePath,
  onNotify,
  onAcceptBlockingSource,
  onSkipBlockingSource,
  onReviewBlockingSource,
  onPreview,
  onConfirmedChange,
  onCreate,
}: {
  draft: IngestBuildDraft;
  step: GuidedStep;
  preview: IngestBuildPreview | null;
  previewLoading: boolean;
  buildLoading: boolean;
  confirmed: boolean;
  operation: IngestBuildOperation;
  targetStatus: IngestStagingTargetStatus | null;
  onStepChange: (step: GuidedStep) => void;
  onReleaseChange: (
    key: keyof Pick<
      IngestBuildDraft,
      | "releaseId"
      | "releaseTitle"
      | "releaseArtist"
      | "releaseDate"
      | "releaseType"
    >,
    value: string,
  ) => void;
  onTrackChange: (
    sourceRelativePath: string,
    patch: Partial<IngestBuildTrackDraft>,
  ) => void;
  onVideoChange: (
    sourceRelativePath: string,
    patch: Partial<IngestBuildVideoDraft>,
  ) => void;
  trackSourceFiles: IngestFileInspection[];
  onApplyTrackTitles: (
    updates: IngestTrackTitleUpdate[],
  ) => void;
  onApplySourceDate: (
    sourceRelativePaths: string[],
    sourceDate: string,
  ) => void;
  audioPreviewControls: IngestAudioPreviewControls;
  onAssetChange: (
    sourceRelativePath: string,
    patch: Partial<IngestBuildAssetDraft>,
  ) => void;
  sourceStatuses: IngestDraftSourceStatus[];
  attachmentFiles: IngestFileInspection[];
  blockingSources: IngestDraftSourceStatus[];
  onSourceReviewed: (
    sourceRelativePath: string,
    reviewed: boolean,
  ) => void;
  onAttachFile: (file: IngestFileInspection) => void;
  onDetachFile: (sourceRelativePath: string) => void;
  onRemoveAsset: (sourceRelativePath: string) => void;
  focusedSourcePath: string | null;
  onNotify: (
    message: string,
    tone?: "success" | "info" | "error",
  ) => void;
  onAcceptBlockingSource: (
    status: IngestDraftSourceStatus,
  ) => void;
  onSkipBlockingSource: (
    status: IngestDraftSourceStatus,
  ) => void;
  onReviewBlockingSource: (
    status: IngestDraftSourceStatus,
  ) => void;
  onPreview: () => void;
  onConfirmedChange: (
    value: boolean,
  ) => void;
  onCreate: () => void;
}) {
  const steps = [
    {
      number: 1 as const,
      label: "Release",
    },
    {
      number: 2 as const,
      label: "Tracks",
    },
    {
      number: 3 as const,
      label: "Videos",
    },
    {
      number: 4 as const,
      label: "Artwork & files",
    },
    {
      number: 5 as const,
      label: "Build",
    },
  ];

  return (
    <>
      <ol className="ingest-guided-steps ingest-guided-step-tabs">
        {steps.map((item) => (
          <li
            key={item.number}
            className={[
              item.number === step
                ? "active"
                : "",
              item.number < step
                ? "complete"
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <button
              type="button"
              onClick={() =>
                onStepChange(item.number)
              }
            >
              {item.label}
            </button>
          </li>
        ))}
      </ol>

      {step === 1 && (
        <section className="ingest-questionnaire-panel">
          <header>
            <p className="eyebrow">
              Step 1 of 5
            </p>
            <h3>Confirm release identity</h3>
            <p>
              Review inferred values before they
              become folder names or TOML
              metadata.
            </p>
          </header>
          <ReleaseFields
            draft={draft}
            onChange={onReleaseChange}
          />
        </section>
      )}

      {step === 2 && (
        <section className="ingest-questionnaire-panel">
          <header>
            <p className="eyebrow">
              Step 2 of 5
            </p>
            <h3>Confirm tracks</h3>
            <p>
              Each selected audio source becomes
              one track and one copied canonical
              master.
            </p>
          </header>
          <TrackDraftTable
            tracks={draft.tracks}
            trackSourceFiles={trackSourceFiles}
            releaseDate={draft.releaseDate}
            sourceStatuses={sourceStatuses}
            existingTracks={targetStatus?.existingTracks ?? []}
            onChange={onTrackChange}
            onApplyTrackTitles={onApplyTrackTitles}
            onApplySourceDate={onApplySourceDate}
            audioPreviewControls={audioPreviewControls}
            onSourceReviewed={onSourceReviewed}
            focusedSourcePath={focusedSourcePath}
          />
        </section>
      )}

      {step === 3 && (
        <section className="ingest-questionnaire-panel">
          <header>
            <p className="eyebrow">
              Step 3 of 5
            </p>
            <h3>Confirm videos</h3>
            <p>
              Review every probe-verified video before it becomes a canonical
              release asset. Confirm its title, descriptive type, and optional
              related track; stable identity and destination paths are managed
              automatically and source bytes remain unchanged.
            </p>
          </header>
          <VideoDraftTable
            videos={draft.videos ?? []}
            tracks={draft.tracks}
            sourceStatuses={sourceStatuses}
            existingTracks={targetStatus?.existingTracks ?? []}
            existingVideos={targetStatus?.existingVideos ?? []}
            onChange={onVideoChange}
            onSourceReviewed={onSourceReviewed}
            focusedSourcePath={focusedSourcePath}
          />
        </section>
      )}

      {step === 4 && (
        <section className="ingest-questionnaire-panel">
          <header>
            <p className="eyebrow">
              Step 4 of 5
            </p>
            <h3>Assign artwork & other files</h3>
            <p>
              Review folder-derived artwork assignments, then drag or
              select images for the release and individual tracks. Recognized
              metadata sidecars contribute evidence independently; keeping an
              archival copy under notes/imported remains optional.
            </p>
          </header>
          <AssetDraftTable
            assets={draft.assets}
            tracks={draft.tracks}
            releaseTitle={draft.releaseTitle}
            releaseArtist={draft.releaseArtist}
            sourceStatuses={sourceStatuses}
            attachmentFiles={attachmentFiles}
            existingTracks={targetStatus?.existingTracks ?? []}
            existingArtwork={targetStatus?.existingArtwork ?? []}
            releaseRelativePath={targetStatus?.releaseRelativePath ?? ""}
            onChange={onAssetChange}
            onSourceReviewed={onSourceReviewed}
            onAttachFile={onAttachFile}
            onDetachFile={onDetachFile}
            onRemoveAsset={onRemoveAsset}
            focusedSourcePath={focusedSourcePath}
            onNotify={onNotify}
          />
        </section>
      )}

      {step === 5 && (
        <section className="ingest-questionnaire-panel">
          <header>
            <p className="eyebrow">
              Step 5 of 5
            </p>
            <h3>
              {operation === "update"
                ? "Build release update"
                : "Build release"}
            </h3>
            <p>
              Preview the server-validated build plan, confirm the final
              release, then write canonical Library files and current
              waveform peaks together.
            </p>
          </header>
          <BuildReview
            draft={draft}
            operation={operation}
            preview={preview}
            sourceStatuses={sourceStatuses}
            blockingSources={blockingSources}
            existingTracks={targetStatus?.existingTracks ?? []}
            legacyReceiptMigrationRequired={
              targetStatus?.legacyReceiptMigration?.required === true
            }
            onReviewArtwork={() => onStepChange(4)}
            onTrackChange={onTrackChange}
            onAcceptBlockingSource={onAcceptBlockingSource}
            onSkipBlockingSource={onSkipBlockingSource}
            onReviewBlockingSource={onReviewBlockingSource}
            onRemoveAsset={onRemoveAsset}
            previewLoading={previewLoading}
            buildLoading={buildLoading}
            confirmed={confirmed}
            onPreview={onPreview}
            onConfirmedChange={
              onConfirmedChange
            }
            onCreate={onCreate}
            audioPreviewControls={audioPreviewControls}
          />
        </section>
      )}

      <div className="ingest-guided-actions">
        <button
          type="button"
          disabled={step === 1}
          onClick={() =>
            onStepChange(
              Math.max(
                1,
                step - 1,
              ) as GuidedStep,
            )
          }
        >
          Previous
        </button>
        {step < 5 && (
          <button
            type="button"
            className="primary-button"
            onClick={() =>
              onStepChange(
                Math.min(
                  5,
                  step + 1,
                ) as GuidedStep,
              )
            }
          >
            Continue
          </button>
        )}
      </div>
    </>
  );
}

function QuickIngestBuilder({
  draft,
  preview,
  previewLoading,
  buildLoading,
  confirmed,
  operation,
  targetStatus,
  onReleaseChange,
  onTrackChange,
  onVideoChange,
  trackSourceFiles,
  onApplyTrackTitles,
  onApplySourceDate,
  audioPreviewControls,
  onAssetChange,
  sourceStatuses,
  attachmentFiles,
  blockingSources,
  onSourceReviewed,
  onAttachFile,
  onDetachFile,
  onRemoveAsset,
  focusedSourcePath,
  onNotify,
  onAcceptBlockingSource,
  onSkipBlockingSource,
  onReviewBlockingSource,
  onPreview,
  onConfirmedChange,
  onCreate,
}: {
  draft: IngestBuildDraft;
  operation: IngestBuildOperation;
  targetStatus: IngestStagingTargetStatus | null;
  preview: IngestBuildPreview | null;
  previewLoading: boolean;
  buildLoading: boolean;
  confirmed: boolean;
  onReleaseChange: (
    key: keyof Pick<
      IngestBuildDraft,
      | "releaseId"
      | "releaseTitle"
      | "releaseArtist"
      | "releaseDate"
      | "releaseType"
    >,
    value: string,
  ) => void;
  onTrackChange: (
    sourceRelativePath: string,
    patch: Partial<IngestBuildTrackDraft>,
  ) => void;
  onVideoChange: (
    sourceRelativePath: string,
    patch: Partial<IngestBuildVideoDraft>,
  ) => void;
  trackSourceFiles: IngestFileInspection[];
  onApplyTrackTitles: (
    updates: IngestTrackTitleUpdate[],
  ) => void;
  onApplySourceDate: (
    sourceRelativePaths: string[],
    sourceDate: string,
  ) => void;
  audioPreviewControls: IngestAudioPreviewControls;
  onAssetChange: (
    sourceRelativePath: string,
    patch: Partial<IngestBuildAssetDraft>,
  ) => void;
  sourceStatuses: IngestDraftSourceStatus[];
  attachmentFiles: IngestFileInspection[];
  blockingSources: IngestDraftSourceStatus[];
  onSourceReviewed: (
    sourceRelativePath: string,
    reviewed: boolean,
  ) => void;
  onAttachFile: (file: IngestFileInspection) => void;
  onDetachFile: (sourceRelativePath: string) => void;
  onRemoveAsset: (sourceRelativePath: string) => void;
  focusedSourcePath: string | null;
  onNotify: (
    message: string,
    tone?: "success" | "info" | "error",
  ) => void;
  onAcceptBlockingSource: (
    status: IngestDraftSourceStatus,
  ) => void;
  onSkipBlockingSource: (
    status: IngestDraftSourceStatus,
  ) => void;
  onReviewBlockingSource: (
    status: IngestDraftSourceStatus,
  ) => void;
  onPreview: () => void;
  onConfirmedChange: (
    value: boolean,
  ) => void;
  onCreate: () => void;
}) {
  return (
    <div className="ingest-quick-review">
      <section className="ingest-table-panel">
        <header className="ingest-table-panel-header">
          <div>
            <h3>Release tags</h3>
            <p>
              Confirm the minimum release values
              in one compact form.
            </p>
          </div>
        </header>
        <ReleaseFields
          draft={draft}
          onChange={onReleaseChange}
          compact
        />
      </section>

      <section className="ingest-table-panel">
        <header className="ingest-table-panel-header">
          <h3>Track tags and file mapping</h3>
        </header>
        <TrackDraftTable
          tracks={draft.tracks}
          trackSourceFiles={trackSourceFiles}
          releaseDate={draft.releaseDate}
          sourceStatuses={sourceStatuses}
          existingTracks={targetStatus?.existingTracks ?? []}
          onChange={onTrackChange}
          onApplyTrackTitles={onApplyTrackTitles}
          onApplySourceDate={onApplySourceDate}
          audioPreviewControls={audioPreviewControls}
          onSourceReviewed={onSourceReviewed}
          focusedSourcePath={focusedSourcePath}
        />
      </section>

      <section className="ingest-table-panel">
        <header className="ingest-table-panel-header">
          <div>
            <h3>Videos</h3>
            <p>
              Confirm canonical release-level video titles, types, and optional
              track relationships before writing the Library copy. Stable IDs and
              destination paths are managed automatically.
            </p>
          </div>
        </header>
        <VideoDraftTable
          videos={draft.videos ?? []}
          tracks={draft.tracks}
          sourceStatuses={sourceStatuses}
          existingTracks={targetStatus?.existingTracks ?? []}
          existingVideos={targetStatus?.existingVideos ?? []}
          onChange={onVideoChange}
          onSourceReviewed={onSourceReviewed}
          focusedSourcePath={focusedSourcePath}
        />
      </section>

      <section
        id="ingest-quick-review-artwork"
        className="ingest-table-panel"
      >
        <header className="ingest-table-panel-header">
          <h3>Artwork & files</h3>
        </header>
        <AssetDraftTable
          assets={draft.assets}
          tracks={draft.tracks}
          releaseTitle={draft.releaseTitle}
          releaseArtist={draft.releaseArtist}
          sourceStatuses={sourceStatuses}
          attachmentFiles={attachmentFiles}
          existingTracks={targetStatus?.existingTracks ?? []}
          existingArtwork={targetStatus?.existingArtwork ?? []}
          releaseRelativePath={targetStatus?.releaseRelativePath ?? ""}
          onChange={onAssetChange}
          onSourceReviewed={onSourceReviewed}
          onAttachFile={onAttachFile}
          onDetachFile={onDetachFile}
          onRemoveAsset={onRemoveAsset}
          focusedSourcePath={focusedSourcePath}
          onNotify={onNotify}
        />
      </section>

      <section className="ingest-table-panel">
        <header className="ingest-table-panel-header">
          <h3>Build plan</h3>
        </header>
        <BuildReview
          draft={draft}
          operation={operation}
          preview={preview}
          sourceStatuses={sourceStatuses}
          blockingSources={blockingSources}
          existingTracks={targetStatus?.existingTracks ?? []}
          legacyReceiptMigrationRequired={
            targetStatus?.legacyReceiptMigration?.required === true
          }
          onReviewArtwork={() =>
            document
              .getElementById("ingest-quick-review-artwork")
              ?.scrollIntoView({
                behavior: "smooth",
                block: "start",
              })
          }
          onTrackChange={onTrackChange}
          onAcceptBlockingSource={onAcceptBlockingSource}
          onSkipBlockingSource={onSkipBlockingSource}
          onReviewBlockingSource={onReviewBlockingSource}
          onRemoveAsset={onRemoveAsset}
          previewLoading={previewLoading}
          buildLoading={buildLoading}
          confirmed={confirmed}
          onPreview={onPreview}
          onConfirmedChange={
            onConfirmedChange
          }
          onCreate={onCreate}
          audioPreviewControls={audioPreviewControls}
        />
      </section>
    </div>
  );
}

function ReleaseFields({
  draft,
  onChange,
  compact = false,
}: {
  draft: IngestBuildDraft;
  onChange: (
    key: keyof Pick<
      IngestBuildDraft,
      | "releaseId"
      | "releaseTitle"
      | "releaseArtist"
      | "releaseDate"
      | "releaseType"
    >,
    value: string,
  ) => void;
  compact?: boolean;
}) {
  const generatedReleaseId =
    buildReleaseDirectoryId(
      draft.releaseDate,
      draft.releaseTitle,
    );
  const usesGeneratedReleaseId =
    draft.releaseId === generatedReleaseId;

  return (
    <div
      className={[
        "ingest-release-fields",
        compact ? "compact" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <label>
        <span>Release title</span>
        <input
          type="text"
          value={draft.releaseTitle}
          onChange={(event) =>
            onChange(
              "releaseTitle",
              event.target.value,
            )
          }
        />
      </label>

      <label>
        <span>Release artist</span>
        <input
          type="text"
          value={draft.releaseArtist}
          placeholder="Required"
          onChange={(event) =>
            onChange(
              "releaseArtist",
              event.target.value,
            )
          }
        />
      </label>

      <label>
        <span>Release date</span>
        <input
          type="date"
          value={draft.releaseDate}
          onChange={(event) =>
            onChange(
              "releaseDate",
              event.target.value,
            )
          }
        />
      </label>

      <label>
        <span>Release type</span>
        <select
          value={draft.releaseType}
          onChange={(event) =>
            onChange(
              "releaseType",
              event.target.value,
            )
          }
        >
          {releaseTypeOptions.map(
            (option) => (
              <option
                key={option}
                value={option}
              >
                {option}
              </option>
            ),
          )}
        </select>
        <small>
          Use a recognized release classification.
          Describe working-session context such as a
          jam, rehearsal, or writing session in
          Production Notes instead of Release Type.
        </small>
      </label>

      <div className="ingest-release-id-field">
        <label>
          <span>Release directory ID</span>
          <input
            type="text"
            value={draft.releaseId}
            spellCheck={false}
            onChange={(event) =>
              onChange(
                "releaseId",
                event.target.value,
              )
            }
          />
        </label>

        <div className="ingest-release-id-guidance">
          <small>
            Generated from Release Date and
            Release Title as {" "}
            <code>{generatedReleaseId}</code>.
            {usesGeneratedReleaseId
              ? " Date or title changes update this ID automatically."
              : " Custom override active; date and title changes will preserve it."}
          </small>

          {!usesGeneratedReleaseId && (
            <button
              type="button"
              onClick={() =>
                onChange(
                  "releaseId",
                  generatedReleaseId,
                )
              }
            >
              Use generated ID
            </button>
          )}
        </div>

        <small>
          Lowercase letters, numbers, hyphens,
          and underscores. Destination: {" "}
          <code>
            releases/{draft.releaseId || "…"}
          </code>
        </small>
      </div>
    </div>
  );
}

function sourceStatusForPath(
  statuses: IngestDraftSourceStatus[],
  sourceRelativePath: string,
): IngestDraftSourceStatus | undefined {
  return statuses.find(
    (status) =>
      status.sourceRelativePath ===
      sourceRelativePath,
  );
}

function SourceReviewCell({
  status,
  onReviewed,
}: {
  status: IngestDraftSourceStatus | undefined;
  onReviewed: (reviewed: boolean) => void;
}) {
  if (!status) {
    return (
      <span
        className="ingest-source-state-indicator unknown"
        role="img"
        aria-label="Source state unavailable"
        title="Source state unavailable"
      >
        ?
      </span>
    );
  }

  const statePresentation =
    status.state === "unchanged"
      ? {
          label: "Unchanged",
          symbol: "✓",
        }
      : status.state === "missing"
        ? {
            label: "Source missing",
            symbol: "×",
          }
        : status.state === "changed"
          ? {
              label: "Changed source",
              symbol: "!",
            }
          : {
              label: "New source",
              symbol: "+",
            };

  return (
    <span className="ingest-source-state-control">
      <span
        className={`ingest-source-state-indicator ${status.state}`}
        role="img"
        aria-label={statePresentation.label}
        title={statePresentation.label}
      >
        {statePresentation.symbol}
      </span>

      {(status.state === "new" ||
        status.state === "changed") && (
        <input
          className="ingest-source-state-reviewed"
          type="checkbox"
          checked={status.reviewed}
          aria-label={`Mark ${statePresentation.label.toLowerCase()} reviewed`}
          title={
            status.reviewed
              ? `${statePresentation.label} reviewed`
              : `Mark ${statePresentation.label.toLowerCase()} reviewed`
          }
          onChange={(event) =>
            onReviewed(event.target.checked)
          }
        />
      )}
    </span>
  );
}

function TrackDraftTable({
  tracks,
  trackSourceFiles,
  releaseDate,
  sourceStatuses,
  existingTracks,
  onChange,
  onApplyTrackTitles,
  onApplySourceDate,
  audioPreviewControls,
  onSourceReviewed,
  focusedSourcePath,
}: {
  tracks: IngestBuildTrackDraft[];
  trackSourceFiles: IngestFileInspection[];
  releaseDate: string;
  sourceStatuses: IngestDraftSourceStatus[];
  existingTracks: IngestStagingTargetStatus["existingTracks"];
  onChange: (
    sourceRelativePath: string,
    patch: Partial<IngestBuildTrackDraft>,
  ) => void;
  onApplyTrackTitles: (
    updates: IngestTrackTitleUpdate[],
  ) => void;
  onApplySourceDate: (
    sourceRelativePaths: string[],
    sourceDate: string,
  ) => void;
  audioPreviewControls: IngestAudioPreviewControls;
  onSourceReviewed: (
    sourceRelativePath: string,
    reviewed: boolean,
  ) => void;
  focusedSourcePath: string | null;
}) {
  const [trackTitleSource, setTrackTitleSource] =
    useState<"filename-field" | "embedded-title">(
      "filename-field",
    );
  const [filenameTitleSeparator, setFilenameTitleSeparator] =
    useState<IngestFilenameTitleSeparator>(
      "underscore",
    );
  const [filenameTitleFieldValue, setFilenameTitleFieldValue] =
    useState("last");
  const previousReleaseDateRef = useRef(releaseDate);
  const [bulkSourceDate, setBulkSourceDate] =
    useState(releaseDate);

  useEffect(() => {
    const previousReleaseDate =
      previousReleaseDateRef.current;

    setBulkSourceDate((currentBulkSourceDate) =>
      synchronizeBulkSourceDate(
        currentBulkSourceDate,
        previousReleaseDate,
        releaseDate,
      ),
    );
    previousReleaseDateRef.current = releaseDate;
  }, [releaseDate]);

  if (tracks.length === 0) {
    return (
      <p className="metadata-empty-value">
        No inspected audio streams are
        available for track creation.
      </p>
    );
  }

  const displayTracks = tracks
    .slice()
    .sort((left, right) => {
      if (left.include !== right.include) {
        return left.include ? -1 : 1;
      }

      return (
        left.trackNumber - right.trackNumber ||
        left.sourceRelativePath.localeCompare(
          right.sourceRelativePath,
        )
      );
    });

  const tracksAfterReleaseDate = displayTracks.filter(
    (track) =>
      track.include &&
      sourceDateIsAfterReleaseDate(
        track.date,
        releaseDate,
      ),
  );
  const missingSourcePaths = new Set(
    sourceStatuses
      .filter((status) => status.state === "missing")
      .map((status) => status.sourceRelativePath),
  );
  const selectedTitlePaths = new Set(
    tracks
      .filter(
        (track) =>
          track.include &&
          !missingSourcePaths.has(
            track.sourceRelativePath,
          ),
      )
      .map((track) => track.sourceRelativePath),
  );
  const selectedTitleFiles = trackSourceFiles.filter(
    (file) => selectedTitlePaths.has(file.relativePath),
  );
  const maxFilenameFieldCount = selectedTitleFiles.reduce(
    (maximum, file) =>
      Math.max(
        maximum,
        filenameTitleFields(
          file.filename,
          filenameTitleSeparator,
        ).length,
      ),
    0,
  );
  const requestedFilenameTitleField =
    Number(filenameTitleFieldValue);
  const filenameTitleField: IngestFilenameTitleField =
    filenameTitleFieldValue === "last" ||
    !Number.isInteger(requestedFilenameTitleField) ||
    requestedFilenameTitleField < 1 ||
    requestedFilenameTitleField > maxFilenameFieldCount
      ? "last"
      : requestedFilenameTitleField;
  const effectiveFilenameTitleFieldValue =
    filenameTitleField === "last"
      ? "last"
      : String(filenameTitleField);
  const trackTitlePlan = buildTrackTitlePlan(
    tracks,
    trackSourceFiles,
    missingSourcePaths,
    trackTitleSource === "embedded-title"
      ? {
          kind: "embedded-title",
        }
      : {
          kind: "filename-field",
          separator: filenameTitleSeparator,
          field: filenameTitleField,
        },
  );
  const filenameFieldSample = (
    field: IngestFilenameTitleField,
  ): string => {
    const sample = selectedTitleFiles
      .map((file) => {
        const fields = filenameTitleFields(
          file.filename,
          filenameTitleSeparator,
        );

        return field === "last"
          ? fields.at(-1)
          : fields[field - 1];
      })
      .find(Boolean);

    return sample
      ? ` — ${humanizeFilenameTitleField(sample)}`
      : "";
  };
  const bulkDateSourcePaths = sourcePathsForBulkDate(
    tracks,
    missingSourcePaths,
  );
  const bulkDateSourceCount =
    bulkDateSourcePaths.length;
  const applySourceDateToSelected = (
    sourceDate: string,
  ) => {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(
        sourceDate,
      ) ||
      bulkDateSourceCount === 0
    ) {
      return;
    }

    setBulkSourceDate(sourceDate);
    onApplySourceDate(
      bulkDateSourcePaths,
      sourceDate,
    );
  };
  const replacementTargetById = new Map(
    existingTracks.map((track) => [track.id, track]),
  );
  const replacementTargetBySource = new Map(
    existingTracks.map((track) => [
      track.sourceRelativePath,
      track,
    ]),
  );
  const replacementTargetOwners = new Map(
    tracks
      .filter((track) => Boolean(track.replacementTrackId))
      .map((track) => [
        track.replacementTrackId!,
        track.sourceRelativePath,
      ]),
  );

  return (
    <div className="ingest-track-table-workflow">
      {existingTracks.length > 0 && (
        <section
          className="ingest-track-revision-guidance"
          aria-label="Existing Library track revision guidance"
        >
          <div>
            <strong>Updating an existing Library release</strong>
            <span>
              Tracks not present in this ingest candidate are preserved automatically.
              Use Revision action only when this source should completely replace an
              existing track&apos;s canonical audio while keeping its stable track ID and
              authored metadata.
            </span>
          </div>
          <details>
            <summary>
              {existingTracks.length} existing Library track
              {existingTracks.length === 1 ? "" : "s"}
            </summary>
            <ol>
              {existingTracks
                .slice()
                .sort((left, right) => left.number - right.number)
                .map((track) => (
                  <li key={track.id}>
                    <strong>{track.number}. {track.title || "Untitled"}</strong>
                    <code>{track.id}</code>
                  </li>
                ))}
            </ol>
          </details>
        </section>
      )}

      <section
        className="ingest-track-title-tools"
        aria-label="Bulk track title tools"
      >
        <div className="ingest-track-title-tools-summary">
          <strong>Track title tools</strong>
          <span>
            {trackTitlePlan.updates.length} of {trackTitlePlan.selectedCount}
            {trackTitlePlan.selectedCount === 1
              ? " selected source has"
              : " selected sources have"}
            {" "}
            the chosen title value. Missing or unavailable values remain
            unchanged.
          </span>
        </div>
        <label>
          <span>Title source</span>
          <select
            value={trackTitleSource}
            onChange={(event) =>
              setTrackTitleSource(
                event.target.value as
                  | "filename-field"
                  | "embedded-title",
              )
            }
          >
            <option value="filename-field">
              Filename field
            </option>
            <option value="embedded-title">
              Embedded TITLE tag
            </option>
          </select>
        </label>
        {trackTitleSource === "filename-field" && (
          <>
            <label>
              <span>Separator</span>
              <select
                value={filenameTitleSeparator}
                onChange={(event) => {
                  setFilenameTitleSeparator(
                    event.target.value as
                      IngestFilenameTitleSeparator,
                  );
                  setFilenameTitleFieldValue(
                    "last",
                  );
                }}
              >
                <option value="underscore">
                  Underscore (_)
                </option>
                <option value="hyphen">
                  Hyphen (-)
                </option>
                <option value="space">
                  Space
                </option>
              </select>
            </label>
            <label>
              <span>Field</span>
              <select
                value={effectiveFilenameTitleFieldValue}
                onChange={(event) =>
                  setFilenameTitleFieldValue(
                    event.target.value,
                  )
                }
              >
                <option value="last">
                  Last field{filenameFieldSample("last")}
                </option>
                {Array.from(
                  { length: maxFilenameFieldCount },
                  (_, index) => index + 1,
                ).map((field) => (
                  <option
                    key={field}
                    value={String(field)}
                  >
                    Field {field}{filenameFieldSample(field)}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        <button
          type="button"
          className="secondary ingest-track-title-apply-button"
          disabled={trackTitlePlan.updates.length === 0}
          onClick={() =>
            onApplyTrackTitles(
              trackTitlePlan.updates,
            )
          }
        >
          Apply to {trackTitlePlan.updates.length} available
        </button>
      </section>

      <section
        className="ingest-source-date-tools"
        aria-label="Bulk source date tools"
      >
        <div className="ingest-source-date-tools-summary">
          <strong>Source date tools</strong>
          <span>
            Applies to {bulkDateSourceCount} selected
            {bulkDateSourceCount === 1 ? " source" : " sources"}
            {" "}
            with Use checked. Missing sources are skipped.
          </span>
        </div>
        <label>
          <span>Source date</span>
          <input
            type="date"
            value={bulkSourceDate}
            onChange={(event) =>
              setBulkSourceDate(
                event.target.value,
              )
            }
          />
          {releaseDate && (
            <small className="ingest-source-date-origin">
              {bulkSourceDate === releaseDate
                ? "Prefilled from Release Date"
                : `Release Date available: ${releaseDate}`}
            </small>
          )}
        </label>
        <button
          type="button"
          className="secondary ingest-source-date-apply-button"
          disabled={
            !bulkSourceDate ||
            bulkDateSourceCount === 0
          }
          onClick={() =>
            applySourceDateToSelected(
              bulkSourceDate,
            )
          }
        >
          Apply to {bulkDateSourceCount} selected
        </button>
      </section>

      {tracksAfterReleaseDate.length > 0 && (
        <section className="warning-panel ingest-source-date-advisory">
          <header>
            <div>
              <h4>Source dates after the release date</h4>
              <p>
                Review these dates for accuracy. This advisory does not block
                previewing or applying the staging plan.
              </p>
            </div>
            <span className="badge warning">
              {tracksAfterReleaseDate.length} date
              {tracksAfterReleaseDate.length === 1 ? "" : "s"}
            </span>
          </header>
          <ul className="ingest-warning-list">
            {tracksAfterReleaseDate.map((track) => (
              <li key={track.sourceRelativePath}>
                Track {track.trackNumber}: {track.title || "Untitled"}
                {" — "}
                {track.date}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="ingest-table-scroll">
        <table className="ingest-table ingest-builder-track-table">
          <thead>
            <tr>
              <th
                scope="col"
                className="ingest-track-use-column"
              >
                Use
              </th>
              <th
                scope="col"
                className="ingest-track-source-column"
              >
                Source
              </th>
              <th
                scope="col"
                className="ingest-track-preview-column"
              >
                Preview
              </th>
              <th
                scope="col"
                className="ingest-track-state-column"
              >
                State
              </th>
              {existingTracks.length > 0 && (
                <th
                  scope="col"
                  className="ingest-track-revision-column"
                >
                  Revision action
                </th>
              )}
              <th
                scope="col"
                className="ingest-track-number-column"
              >
                #
              </th>
              <th
                scope="col"
                className="ingest-track-title-column"
              >
                Track title
              </th>
              <th
                scope="col"
                className="ingest-track-version-column"
              >
                Version / take
              </th>
              <th
                scope="col"
                className="ingest-track-artist-column"
              >
                Artist
              </th>
              <th
                scope="col"
                className="ingest-track-date-column"
              >
                Source date
              </th>
            </tr>
          </thead>
          <tbody>
            {displayTracks.map((track, displayIndex) => {
            const status = sourceStatusForPath(
              sourceStatuses,
              track.sourceRelativePath,
            );
            const sourceMissing =
              status?.state === "missing";
            const sourceDateAfterRelease =
              track.include &&
              sourceDateIsAfterReleaseDate(
                track.date,
                releaseDate,
              );
            const sourceDateWarningId =
              `source-date-warning-${displayIndex}`;
            const matchedExistingTrack =
              replacementTargetBySource.get(
                track.sourceRelativePath,
              );

            return (
              <tr
                key={track.sourceRelativePath}
                data-ingest-source-path={
                  track.sourceRelativePath
                }
                tabIndex={-1}
                className={[
                  sourceMissing
                    ? "ingest-source-missing-row"
                    : "",
                  sourceDateAfterRelease
                    ? "ingest-source-date-warning-row"
                    : "",
                  focusedSourcePath ===
                  track.sourceRelativePath
                    ? "ingest-source-focused-row"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ") || undefined}
              >
                <td className="ingest-track-use-cell">
                  <input
                    type="checkbox"
                    aria-label={`Include ${track.sourceRelativePath}`}
                    checked={track.include}
                    onChange={(event) =>
                      onChange(
                        track.sourceRelativePath,
                        {
                          include:
                            event.target.checked,
                        },
                      )
                    }
                  />
                </td>
                <th
                  scope="row"
                  className="ingest-sticky-column ingest-track-source-cell"
                >
                  <span
                    className="ingest-track-source-audio-icon"
                    title={track.sourceRelativePath}
                    aria-label={`Audio source: ${track.sourceRelativePath}`}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path d="M10 5v10.2a3.5 3.5 0 1 1-2-3.16V7l11-2v8.2a3.5 3.5 0 1 1-2-3.16V3.5z" />
                    </svg>
                  </span>
                </th>
                <td className="ingest-track-preview-cell">
                  <IngestAudioPreviewButton
                    sourceRelativePath={track.sourceRelativePath}
                    controls={audioPreviewControls}
                    disabled={sourceMissing}
                  />
                </td>
                <td className="ingest-track-state-cell">
                  <SourceReviewCell
                    status={status}
                    onReviewed={(reviewed) =>
                      onSourceReviewed(
                        track.sourceRelativePath,
                        reviewed,
                      )
                    }
                  />
                </td>
                {existingTracks.length > 0 && (
                  <td className="ingest-track-revision-cell">
                    <select
                      value={track.replacementTrackId ?? ""}
                      disabled={!track.include || sourceMissing}
                      aria-label={`Revision action for ${track.sourceRelativePath}`}
                      onChange={(event) => {
                        const replacementTrackId =
                          event.target.value;

                        if (!replacementTrackId) {
                          onChange(
                            track.sourceRelativePath,
                            { replacementTrackId: undefined },
                          );
                          return;
                        }

                        const target =
                          replacementTargetById.get(
                            replacementTrackId,
                          );
                        if (!target) {
                          return;
                        }

                        onChange(
                          track.sourceRelativePath,
                          {
                            replacementTrackId,
                            trackNumber: target.number,
                            title: target.title,
                            version: target.version,
                            artist: target.artist,
                            date: target.sourceDate,
                          },
                        );
                      }}
                    >
                      <option value="">
                        {matchedExistingTrack
                          ? "Keep existing track"
                          : "Add as new track"}
                      </option>
                      {existingTracks
                        .slice()
                        .sort((left, right) => left.number - right.number)
                        .map((target) => {
                          const owner = replacementTargetOwners.get(
                            target.id,
                          );
                          const claimedElsewhere =
                            Boolean(owner) &&
                            owner !== track.sourceRelativePath;

                          return (
                            <option
                              key={target.id}
                              value={target.id}
                              disabled={claimedElsewhere}
                            >
                              Replace Track {target.number} · {target.title || "Untitled"}
                            </option>
                          );
                        })}
                    </select>
                    {track.replacementTrackId && (
                      <small>
                        Stable ID and authored metadata will be preserved.
                      </small>
                    )}
                  </td>
                )}
                <td className="ingest-track-number-cell">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{1,3}"
                    maxLength={3}
                    value={track.trackNumber || ""}
                    disabled={
                      !track.include ||
                      sourceMissing
                    }
                    aria-label={`Track number for ${track.sourceRelativePath}`}
                    onChange={(event) => {
                      const digits = event.target.value
                        .replace(/\D/g, "")
                        .slice(0, 3);

                      onChange(
                        track.sourceRelativePath,
                        {
                          trackNumber: digits
                            ? Number(digits)
                            : 0,
                        },
                      );
                    }}
                  />
                </td>
                <td className="ingest-track-title-cell">
                  <input
                    type="text"
                    value={track.title}
                    disabled={
                      !track.include ||
                      sourceMissing
                    }
                    aria-label={`Track title for ${track.sourceRelativePath}`}
                    onChange={(event) =>
                      onChange(
                        track.sourceRelativePath,
                        {
                          title:
                            event.target.value,
                        },
                      )
                    }
                  />
                </td>
                <td className="ingest-track-version-cell">
                  <input
                    type="text"
                    value={track.version}
                    disabled={
                      !track.include ||
                      sourceMissing
                    }
                    aria-label={`Track version for ${track.sourceRelativePath}`}
                    onChange={(event) =>
                      onChange(
                        track.sourceRelativePath,
                        {
                          version:
                            event.target.value,
                        },
                      )
                    }
                  />
                </td>
                <td className="ingest-track-artist-cell">
                  <input
                    type="text"
                    value={track.artist}
                    disabled={
                      !track.include ||
                      sourceMissing
                    }
                    aria-label={`Track artist for ${track.sourceRelativePath}`}
                    onChange={(event) =>
                      onChange(
                        track.sourceRelativePath,
                        {
                          artist:
                            event.target.value,
                        },
                      )
                    }
                  />
                </td>
                <td className="ingest-source-date-cell">
                  <input
                    type="date"
                    value={track.date}
                    disabled={
                      !track.include ||
                      sourceMissing
                    }
                    aria-label={`Source date for ${track.sourceRelativePath}`}
                    aria-describedby={
                      sourceDateAfterRelease
                        ? sourceDateWarningId
                        : undefined
                    }
                    onChange={(event) =>
                      onChange(
                        track.sourceRelativePath,
                        {
                          date:
                            event.target.value,
                        },
                      )
                    }
                  />
                  {sourceDateAfterRelease && (
                    <small
                      id={sourceDateWarningId}
                      className="ingest-inline-warning"
                    >
                      After release date
                    </small>
                  )}
                </td>
              </tr>
            );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function VideoDraftTable({
  videos,
  tracks,
  sourceStatuses,
  existingTracks,
  existingVideos,
  onChange,
  onSourceReviewed,
  focusedSourcePath,
}: {
  videos: IngestBuildVideoDraft[];
  tracks: IngestBuildTrackDraft[];
  sourceStatuses: IngestDraftSourceStatus[];
  existingTracks: IngestStagingTargetStatus["existingTracks"];
  existingVideos: IngestStagingTargetStatus["existingVideos"];
  onChange: (
    sourceRelativePath: string,
    patch: Partial<IngestBuildVideoDraft>,
  ) => void;
  onSourceReviewed: (
    sourceRelativePath: string,
    reviewed: boolean,
  ) => void;
  focusedSourcePath: string | null;
}) {
  const statusByPath = new Map(
    sourceStatuses.map((status) => [
      status.sourceRelativePath,
      status,
    ]),
  );
  const existingBySource = new Map(
    existingVideos.map((video) => [
      video.sourceRelativePath,
      video,
    ]),
  );
  const includedTracks = tracks
    .filter((track) => track.include)
    .slice()
    .sort(
      (left, right) =>
        left.trackNumber - right.trackNumber ||
        left.title.localeCompare(right.title),
    );
  const existingTrackBySource = new Map(
    existingTracks.map((track) => [
      track.sourceRelativePath,
      track,
    ]),
  );
  const candidateTrackOptions = includedTracks.filter(
    (track) =>
      !existingTrackBySource.has(
        track.sourceRelativePath,
      ),
  );
  const existingTrackOptions = existingTracks
    .slice()
    .sort(
      (left, right) =>
        left.number - right.number ||
        left.title.localeCompare(right.title),
    );

  return (
    <div className="ingest-video-table-workflow">
      <div className="ingest-video-guidance">
        <strong>Canonical release video</strong>
        <span>
          Each selected source is stored under videos/&lt;stable-id&gt;/ as
          video-master.&lt;original-extension&gt; plus video.toml. Stable IDs are
          generated automatically and remain independent from the editable title.
          The video remains release-scoped; optionally relate it to one canonical
          track without moving it into the track directory. Staging does not transcode video.
        </span>
      </div>

      {existingVideos.length > 0 && (
        <div className="ingest-video-existing-summary">
          <strong>
            {existingVideos.length} existing Library video
            {existingVideos.length === 1 ? "" : "s"}
          </strong>
          <span>
            Existing verified videos absent from this candidate are preserved
            automatically. Canonical video replacement is intentionally not enabled
            in Video V1.
          </span>
        </div>
      )}

      <datalist id="ingest-video-type-options">
        {ingestVideoTypeOptions.map((value) => (
          <option key={value} value={value} />
        ))}
      </datalist>

      <div className="ingest-table-scroll">
        <table className="ingest-draft-table ingest-video-draft-table">
          <thead>
            <tr>
              <th scope="col">Use</th>
              <th scope="col">Source</th>
              <th scope="col">Title</th>
              <th scope="col">Type</th>
              <th scope="col">Related track</th>
              <th scope="col">Destination</th>
            </tr>
          </thead>
          <tbody>
            {videos.length === 0 ? (
              <tr>
                <td colSpan={6} className="metadata-empty-value">
                  No probe-verified video sources are available in this candidate.
                </td>
              </tr>
            ) : (
              videos.map((video) => {
                const status = statusByPath.get(video.sourceRelativePath);
                const sourceMissing = status?.state === "missing";
                const existing = existingBySource.get(video.sourceRelativePath);
                const relatedExistingTrack =
                  existingTrackBySource.get(
                    video.relatedTrackSourceRelativePath,
                  );
                const controlsDisabled = !video.include || sourceMissing;

                return (
                  <tr
                    key={video.sourceRelativePath}
                    data-ingest-source-path={video.sourceRelativePath}
                    tabIndex={
                      focusedSourcePath === video.sourceRelativePath
                        ? -1
                        : undefined
                    }
                    className={[
                      focusedSourcePath === video.sourceRelativePath
                        ? "is-focused-source"
                        : "",
                      sourceMissing ? "is-missing-source" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <td>
                      <input
                        type="checkbox"
                        checked={video.include}
                        disabled={sourceMissing}
                        aria-label={`Include video ${video.sourceRelativePath}`}
                        onChange={(event) => {
                          onChange(video.sourceRelativePath, {
                            include: event.target.checked,
                          });
                          onSourceReviewed(video.sourceRelativePath, true);
                        }}
                      />
                    </td>
                    <th scope="row">
                      <code
                        className="ingest-video-source-filename"
                        title={video.sourceRelativePath}
                      >
                        {reviewSourceFilename(video.sourceRelativePath)}
                      </code>
                      {existing && (
                        <small className="ingest-inline-success">
                          Existing · {existing.id}
                        </small>
                      )}
                      {status && status.state !== "unchanged" && (
                        <small className="ingest-inline-warning">
                          {status.state}
                        </small>
                      )}
                    </th>
                    <td>
                      <input
                        type="text"
                        value={video.title}
                        disabled={controlsDisabled || Boolean(existing)}
                        aria-label={`Video title for ${video.sourceRelativePath}`}
                        onChange={(event) =>
                          onChange(video.sourceRelativePath, {
                            title: event.target.value,
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        list="ingest-video-type-options"
                        value={video.videoType}
                        disabled={controlsDisabled || Boolean(existing)}
                        aria-label={`Video type for ${video.sourceRelativePath}`}
                        onChange={(event) =>
                          onChange(video.sourceRelativePath, {
                            videoType: event.target.value,
                          })
                        }
                      />
                    </td>
                    <td>
                      <select
                        value={
                          video.relatedTrackId
                            ? `id:${video.relatedTrackId}`
                            : relatedExistingTrack
                              ? `id:${relatedExistingTrack.id}`
                              : video.relatedTrackSourceRelativePath
                                ? `source:${video.relatedTrackSourceRelativePath}`
                                : ""
                        }
                        disabled={controlsDisabled || Boolean(existing)}
                        aria-label={`Related track for ${video.sourceRelativePath}`}
                        onChange={(event) => {
                          const value = event.target.value;
                          if (value.startsWith("id:")) {
                            onChange(video.sourceRelativePath, {
                              relatedTrackId: value.slice(3),
                              relatedTrackSourceRelativePath: "",
                            });
                            return;
                          }

                          onChange(video.sourceRelativePath, {
                            relatedTrackId: "",
                            relatedTrackSourceRelativePath:
                              value.startsWith("source:")
                                ? value.slice(7)
                                : "",
                          });
                        }}
                      >
                        <option value="">Release-level only</option>
                        {candidateTrackOptions.map((track) => (
                          <option
                            key={`source:${track.sourceRelativePath}`}
                            value={`source:${track.sourceRelativePath}`}
                          >
                            {track.title || "Untitled"}
                          </option>
                        ))}
                        {existingTrackOptions.map((track) => (
                          <option
                            key={`id:${track.id}`}
                            value={`id:${track.id}`}
                          >
                            {track.title || `Track ${track.number}`}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <details className="ingest-video-path-disclosure">
                        <summary
                          title={`videos/${video.videoId}/${video.destinationFilename}`}
                        >
                          Path
                        </summary>
                        <code>{`videos/${video.videoId}/${video.destinationFilename}`}</code>
                      </details>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AssetDraftTable({
  assets,
  tracks,
  releaseTitle,
  releaseArtist,
  sourceStatuses,
  attachmentFiles,
  existingTracks,
  existingArtwork,
  releaseRelativePath,
  onChange,
  onSourceReviewed,
  onAttachFile,
  onDetachFile,
  onRemoveAsset,
  focusedSourcePath,
  onNotify,
}: {
  assets: IngestBuildAssetDraft[];
  tracks: IngestBuildTrackDraft[];
  releaseTitle: string;
  releaseArtist: string;
  sourceStatuses: IngestDraftSourceStatus[];
  attachmentFiles: IngestFileInspection[];
  existingTracks: IngestStagingTargetStatus["existingTracks"];
  existingArtwork: IngestStagingTargetStatus["existingArtwork"];
  releaseRelativePath: string;
  onChange: (
    sourceRelativePath: string,
    patch: Partial<IngestBuildAssetDraft>,
  ) => void;
  onSourceReviewed: (
    sourceRelativePath: string,
    reviewed: boolean,
  ) => void;
  onAttachFile: (file: IngestFileInspection) => void;
  onDetachFile: (sourceRelativePath: string) => void;
  onRemoveAsset: (sourceRelativePath: string) => void;
  focusedSourcePath: string | null;
  onNotify: (
    message: string,
    tone?: "success" | "info" | "error",
  ) => void;
}) {
  const [selectedArtworkPath, setSelectedArtworkPath] =
    useState<string | null>(null);
  const imageAssets = assets.filter(
    (asset) => asset.mediaKind === "image",
  );
  const textAssets = assets.filter(
    (asset) => asset.mediaKind === "text",
  );
  const includedTracks = tracks.filter(
    (track) => track.include,
  );
  const existingTrackBySource = new Map(
    existingTracks.map((track) => [
      track.sourceRelativePath,
      track,
    ]),
  );
  const existingTrackById = new Map(
    existingTracks.map((track) => [track.id, track]),
  );
  const representedExistingTrackIds = new Set(
    includedTracks.flatMap((track) => {
      if (track.replacementTrackId) {
        return [track.replacementTrackId];
      }

      const existing = existingTrackBySource.get(
        track.sourceRelativePath,
      );
      return existing ? [existing.id] : [];
    }),
  );
  const preservedArtworkTrackTargets =
    existingTracks.filter(
      (track) => !representedExistingTrackIds.has(track.id),
    );
  const attachedPaths = new Set(
    assets.map((asset) =>
      asset.sourceRelativePath,
    ),
  );
  const availableAttachments =
    attachmentFiles.filter(
      (file) =>
        !attachedPaths.has(file.relativePath),
    );

  const sourceFilename = (sourceRelativePath: string) => {
    const segments = sourceRelativePath
      .split("/")
      .filter(Boolean);

    return segments[segments.length - 1] ?? sourceRelativePath;
  };

  const existingTrackForTarget = (
    target: ArtworkAssignmentTarget,
  ) => {
    if (target.scope === "release") {
      return undefined;
    }

    const candidateTrack = tracks.find(
      (item) =>
        item.sourceRelativePath ===
        target.trackSourceRelativePath,
    );
    if (candidateTrack?.replacementTrackId) {
      return existingTrackById.get(
        candidateTrack.replacementTrackId,
      );
    }

    return existingTrackBySource.get(
      target.trackSourceRelativePath,
    );
  };

  const targetLabel = (target: ArtworkAssignmentTarget) => {
    if (target.scope === "release") {
      return `Release · ${releaseTitle || "Untitled release"}`;
    }

    const track = tracks.find(
      (item) =>
        item.sourceRelativePath ===
        target.trackSourceRelativePath,
    );
    if (track) {
      return trackLabel(track);
    }

    const existingTrack = existingTrackForTarget(target);
    return existingTrack
      ? `Track ${existingTrack.number} · ${existingTrack.title || "Untitled"}`
      : "Track artwork";
  };

  const existingArtworkForTarget = (
    target: ArtworkAssignmentTarget,
  ) => {
    if (target.scope === "release") {
      return existingArtwork.find(
        (artwork) =>
          artwork.scope === "release" &&
          artwork.role === "front_cover",
      );
    }

    const existingTrack = existingTrackForTarget(target);
    if (!existingTrack) {
      return undefined;
    }

    return existingArtwork.find(
      (artwork) =>
        artwork.scope === "track" &&
        artwork.trackId === existingTrack.id &&
        (artwork.role === "front_cover" ||
          artwork.role === "track_artwork"),
    );
  };

  const frontAssignmentForTarget = (
    asset: IngestBuildAssetDraft,
    target: ArtworkAssignmentTarget,
  ) => asset.artworkAssignments.find((assignment) => {
    if (assignment.role !== "front_cover") {
      return false;
    }

    if (target.scope === "release") {
      return assignment.scope === "release";
    }

    return (
      assignment.scope === "track" &&
      assignment.trackSourceRelativePaths.includes(
        target.trackSourceRelativePath,
      )
    );
  });

  const assignedAssetsForTarget = (
    target: ArtworkAssignmentTarget,
  ) => artworkAssetsAssignedToTarget(
    imageAssets,
    target,
  );

  const assignArtworkToTarget = (
    sourceRelativePath: string,
    target: ArtworkAssignmentTarget,
  ) => {
    const sourceAsset = imageAssets.find(
      (asset) =>
        asset.sourceRelativePath === sourceRelativePath,
    );
    const sourceStatus = sourceStatusForPath(
      sourceStatuses,
      sourceAsset?.embeddedArtwork?.audioSourceRelativePath ??
        sourceRelativePath,
    );

    if (!sourceAsset || sourceStatus?.state === "missing") {
      return;
    }

    const existingAssets = assignedAssetsForTarget(target);
    const existingLibraryArtwork =
      existingArtworkForTarget(target);
    const replacingOtherArtwork = existingAssets.some(
      (asset) =>
        asset.sourceRelativePath !== sourceRelativePath,
    );
    const replacingCanonicalArtwork =
      Boolean(existingLibraryArtwork);

    if (
      (replacingOtherArtwork || replacingCanonicalArtwork) &&
      !window.confirm(
        replacingCanonicalArtwork
          ? `Replace the current canonical Library front artwork for ${targetLabel(target)}?`
          : `Replace the current front artwork for ${targetLabel(target)}?`,
      )
    ) {
      return;
    }

    const updates = buildFrontArtworkAssignmentUpdates(
      imageAssets,
      sourceRelativePath,
      target,
    );

    for (const update of updates) {
      onChange(update.sourceRelativePath, {
        include: update.include,
        artworkAssignments: update.artworkAssignments.map(
          (assignment) => {
            const matchesTarget =
              assignment.role === "front_cover" &&
              (target.scope === "release"
                ? assignment.scope === "release"
                : assignment.scope === "track" &&
                  assignment.trackSourceRelativePaths.includes(
                    target.trackSourceRelativePath,
                  ));

            if (!matchesTarget) {
              return assignment;
            }

            return {
              ...assignment,
              ...(replacingCanonicalArtwork
                ? { replaceExisting: true }
                : { replaceExisting: undefined }),
            };
          },
        ),
      });
    }

    // Drag/drop or Assign selected is already an explicit decision to use a
    // standalone artwork source. Do not make the user accept the same image a
    // second time in Review. Embedded artwork shares its source status with
    // the audio file, so that audio-source review remains independent.
    if (!sourceAsset.embeddedArtwork) {
      onSourceReviewed(
        sourceAsset.sourceRelativePath,
        true,
      );
    }

    onNotify(
      `${sourceFilename(sourceRelativePath)} assigned to ${targetLabel(target)}.`,
      "success",
    );
  };

  const confirmExistingArtworkReplacement = (
    target: ArtworkAssignmentTarget,
  ) => {
    const existingLibraryArtwork =
      existingArtworkForTarget(target);
    if (!existingLibraryArtwork) {
      return;
    }

    const assignedAssets = assignedAssetsForTarget(target);
    if (assignedAssets.length === 0) {
      return;
    }

    if (
      !window.confirm(
        `Replace the current canonical Library front artwork for ${targetLabel(target)} with the assigned candidate artwork?`,
      )
    ) {
      return;
    }

    for (const asset of assignedAssets) {
      onChange(asset.sourceRelativePath, {
        artworkAssignments: asset.artworkAssignments.map(
          (assignment) => {
            const matchesTarget =
              assignment.role === "front_cover" &&
              (target.scope === "release"
                ? assignment.scope === "release"
                : assignment.scope === "track" &&
                  assignment.trackSourceRelativePaths.includes(
                    target.trackSourceRelativePath,
                  ));

            return matchesTarget
              ? {
                  ...assignment,
                  replaceExisting: true,
                }
              : assignment;
          },
        ),
      });

      if (!asset.embeddedArtwork) {
        onSourceReviewed(
          asset.sourceRelativePath,
          true,
        );
      }
    }

    onNotify(
      `Artwork replacement confirmed for ${targetLabel(target)}.`,
      "success",
    );
  };

  const removeArtworkFromTarget = (
    sourceRelativePath: string,
    target: ArtworkAssignmentTarget,
  ) => {
    const asset = imageAssets.find(
      (item) =>
        item.sourceRelativePath === sourceRelativePath,
    );

    if (!asset) {
      return;
    }

    const update = removeFrontArtworkTarget(
      asset,
      target,
    );

    onChange(update.sourceRelativePath, {
      include: update.include,
      artworkAssignments: update.artworkAssignments,
    });

    onNotify(
      `${sourceFilename(sourceRelativePath)} removed from ${targetLabel(target)}.`,
      "info",
    );
  };

  const handleArtworkDrop = (
    event: DragEvent<HTMLElement>,
    target: ArtworkAssignmentTarget,
  ) => {
    event.preventDefault();
    const sourceRelativePath =
      event.dataTransfer.getData("text/plain");

    if (sourceRelativePath) {
      assignArtworkToTarget(
        sourceRelativePath,
        target,
      );
    }
  };

  const renderAssignedArtwork = (
    target: ArtworkAssignmentTarget,
  ) => {
    const assignedAssets = assignedAssetsForTarget(target);
    const existingLibraryArtwork =
      existingArtworkForTarget(target);
    const replacementConfirmed = assignedAssets.some(
      (asset) =>
        frontAssignmentForTarget(asset, target)?.replaceExisting === true,
    );

    if (assignedAssets.length === 0 && existingLibraryArtwork) {
      return (
        <div className="ingest-artwork-target-assets">
          <div className="ingest-artwork-target-asset existing-library-artwork">
            <span className="ingest-artwork-preview-stack">
              <img
                className="ingest-artwork-thumbnail"
                src={libraryArtworkPreviewUrl(
                  existingLibraryArtwork.destinationRelativePath,
                )}
                alt={`Current Library artwork for ${targetLabel(target)}`}
                loading="lazy"
              />
            </span>
            <span>
              <strong>Current Library artwork</strong>
              <small>Preserved unless you assign a replacement</small>
            </span>
          </div>
        </div>
      );
    }

    if (assignedAssets.length === 0) {
      return (
        <span className="ingest-artwork-drop-empty">
          Drop artwork here
          <small>
            {selectedArtworkPath
              ? "Use Assign selected to place the selected artwork here."
              : "Or select an artwork tile, then use Assign selected."}
          </small>
        </span>
      );
    }

    return (
      <div className="ingest-artwork-target-assets">
        {assignedAssets.map((asset) => {
          const sourceStatusPath =
            asset.embeddedArtwork?.audioSourceRelativePath ??
            asset.sourceRelativePath;
          const status = sourceStatusForPath(
            sourceStatuses,
            sourceStatusPath,
          );

          return (
            <div
              key={asset.sourceRelativePath}
              className="ingest-artwork-target-asset"
            >
              <ArtworkPreview
                key={`${asset.sourceRelativePath}:${status?.modifiedAt ?? ""}`}
                sourceRelativePath={asset.sourceRelativePath}
                modifiedAt={status?.modifiedAt}
                embeddedArtwork={asset.embeddedArtwork}
                label={sourceFilename(asset.sourceRelativePath)}
              />
              <span>
                <strong>
                  {sourceFilename(asset.sourceRelativePath)}
                </strong>
                <small>
                  {existingLibraryArtwork
                    ? replacementConfirmed
                      ? "Will replace current Library artwork"
                      : "Replacement confirmation required"
                    : "✓ Assigned · front cover"}
                </small>
              </span>
              <button
                type="button"
                className="link-button danger-text"
                aria-label={`Remove ${sourceFilename(asset.sourceRelativePath)} from ${targetLabel(target)}`}
                onClick={(event) => {
                  event.stopPropagation();
                  removeArtworkFromTarget(
                    asset.sourceRelativePath,
                    target,
                  );
                }}
              >
                Remove
              </button>
            </div>
          );
        })}
        {existingLibraryArtwork && !replacementConfirmed && (
          <button
            type="button"
            className="ingest-artwork-confirm-replacement-button"
            onClick={() =>
              confirmExistingArtworkReplacement(target)
            }
          >
            Confirm artwork replacement
          </button>
        )}
      </div>
    );
  };

  const renderArtworkTarget = (
    target: ArtworkAssignmentTarget,
    heading: string,
    subheading: string,
  ) => {
    const assignedAssets = assignedAssetsForTarget(target);
    const existingLibraryArtwork =
      existingArtworkForTarget(target);

    return (
      <div
        className={[
          "ingest-artwork-target-row",
          target.scope === "release"
            ? "release"
            : "track",
        ].join(" ")}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDrop={(event) =>
          handleArtworkDrop(event, target)
        }
      >
        <div className="ingest-artwork-target-label">
          <strong>{heading}</strong>
          <span>{subheading}</span>
        </div>
        <div
          className="ingest-artwork-target-dropzone"
          aria-label={`Artwork destination for ${targetLabel(target)}`}
        >
          {renderAssignedArtwork(target)}
          {selectedArtworkPath && (
            <button
              type="button"
              className="ingest-artwork-target-assign-button"
              onClick={() =>
                assignArtworkToTarget(
                  selectedArtworkPath,
                  target,
                )
              }
            >
              {assignedAssets.length > 0 || existingLibraryArtwork
                ? "Replace with selected"
                : "Assign selected"}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      className="ingest-asset-workflow"
      data-library-release-path={releaseRelativePath || undefined}
    >
      <section className="ingest-artwork-assignment-workspace">
        <header className="ingest-artwork-workspace-header">
          <div>
            <h4>Available artwork</h4>
            <p>
              Drag an image onto the release or a track below. You can
              also select a tile and then click a destination row.
              Folder-derived assignments are already shown on their
              inferred destinations and remain editable.
            </p>
          </div>
          <span className="badge">
            {imageAssets.length} image{imageAssets.length === 1 ? "" : "s"}
          </span>
        </header>

        {imageAssets.length === 0 ? (
          <p className="metadata-empty-value">
            This candidate has no attached artwork sources yet.
          </p>
        ) : (
          <div className="ingest-artwork-tile-grid">
            {imageAssets.map((asset) => {
              const sourceStatusPath =
                asset.embeddedArtwork?.audioSourceRelativePath ??
                asset.sourceRelativePath;
              const status = sourceStatusForPath(
                sourceStatuses,
                sourceStatusPath,
              );
              const sourceMissing =
                status?.state === "missing";
              const selected =
                selectedArtworkPath === asset.sourceRelativePath;

              return (
                <article
                  key={asset.sourceRelativePath}
                  className={[
                    "ingest-artwork-tile",
                    selected ? "selected" : "",
                    sourceMissing ? "missing" : "",
                    focusedSourcePath === asset.sourceRelativePath
                      ? "focused"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  data-ingest-source-path={asset.sourceRelativePath}
                  role="button"
                  tabIndex={sourceMissing ? -1 : 0}
                  aria-disabled={sourceMissing}
                  aria-pressed={selected}
                  aria-label={`Select artwork ${sourceFilename(asset.sourceRelativePath)} for assignment`}
                  draggable={!sourceMissing}
                  onClick={() => {
                    if (!sourceMissing) {
                      setSelectedArtworkPath(
                        selected
                          ? null
                          : asset.sourceRelativePath,
                      );
                    }
                  }}
                  onKeyDown={(event) => {
                    if (
                      sourceMissing ||
                      (event.key !== "Enter" &&
                        event.key !== " ")
                    ) {
                      return;
                    }

                    event.preventDefault();
                    setSelectedArtworkPath(
                      selected
                        ? null
                        : asset.sourceRelativePath,
                    );
                  }}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "copy";
                    event.dataTransfer.setData(
                      "text/plain",
                      asset.sourceRelativePath,
                    );
                    setSelectedArtworkPath(
                      asset.sourceRelativePath,
                    );
                  }}
                >
                  <div className="ingest-artwork-tile-preview">
                    <ArtworkPreview
                      key={`${asset.sourceRelativePath}:${status?.modifiedAt ?? ""}`}
                      sourceRelativePath={asset.sourceRelativePath}
                      modifiedAt={status?.modifiedAt}
                      embeddedArtwork={asset.embeddedArtwork}
                      label={sourceFilename(asset.sourceRelativePath)}
                      thumbnailOnly
                    />
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <div className="ingest-artwork-target-list">
          <header>
            <div>
              <h4>Release and track artwork</h4>
              <p>
                The release row assigns album artwork. Track rows assign
                track-specific artwork using the track numbers and titles
                confirmed in the previous step. During an update, existing
                Library tracks remain available here even when their original
                audio is not present in this ingest candidate.
              </p>
            </div>
            {selectedArtworkPath && (
              <span className="badge complete">
                Selected: {sourceFilename(selectedArtworkPath)}
              </span>
            )}
          </header>

          {renderArtworkTarget(
            { scope: "release" },
            releaseTitle || "Untitled release",
            ["Release", releaseArtist]
              .filter(Boolean)
              .join(" · "),
          )}

          {includedTracks.map((track) =>
            renderArtworkTarget(
              {
                scope: "track",
                trackSourceRelativePath:
                  track.sourceRelativePath,
              },
              `${String(track.trackNumber).padStart(2, "0")} · ${track.title || "Untitled"}`,
              track.version.trim()
                ? `Track · ${track.version.trim()}`
                : "Track",
            ),
          )}

          {preservedArtworkTrackTargets.map((track) =>
            renderArtworkTarget(
              {
                scope: "track",
                trackSourceRelativePath:
                  track.sourceRelativePath,
              },
              `${String(track.number).padStart(2, "0")} · ${track.title || "Untitled"}`,
              track.version.trim()
                ? `Existing Library track · ${track.version.trim()}`
                : "Existing Library track",
            ),
          )}
        </div>

        {imageAssets.length > 0 && (
          <details className="ingest-artwork-advanced-assignments">
            <summary>
              Advanced artwork roles & multi-target assignments
            </summary>
            <p>
              Use these controls for back covers, alternates, booklets,
              promotional images, or one source intentionally assigned to
              several tracks. Front-cover assignments made here stay in
              sync with the visual release/track rows above.
            </p>
            <div className="ingest-artwork-advanced-grid">
              {imageAssets.map((asset) => {
                const sourceStatusPath =
                  asset.embeddedArtwork?.audioSourceRelativePath ??
                  asset.sourceRelativePath;
                const status = sourceStatusForPath(
                  sourceStatuses,
                  sourceStatusPath,
                );
                const sourceMissing =
                  status?.state === "missing";

                return (
                  <section
                    key={asset.sourceRelativePath}
                    className="ingest-artwork-advanced-item"
                  >
                    <header>
                      <div className="ingest-artwork-advanced-preview">
                        <ArtworkPreview
                          sourceRelativePath={asset.sourceRelativePath}
                          modifiedAt={status?.modifiedAt}
                          embeddedArtwork={asset.embeddedArtwork}
                          label={sourceFilename(asset.sourceRelativePath)}
                          thumbnailOnly
                        />
                      </div>
                      <strong>
                        {sourceFilename(asset.sourceRelativePath)}
                      </strong>
                      {asset.embeddedArtwork && (
                        <span className="badge ingest-artwork-embedded-badge">
                          Embedded cover
                        </span>
                      )}
                      <code>{asset.sourceRelativePath}</code>
                      <div className="ingest-artwork-advanced-source-controls">
                        {status?.state !== "unchanged" && (
                          <SourceReviewCell
                            status={status}
                            onReviewed={(reviewed) =>
                              onSourceReviewed(
                                sourceStatusPath,
                                reviewed,
                              )
                            }
                          />
                        )}
                        {status?.state === "unchanged" && (
                          <span
                            className="ingest-artwork-source-ready-label"
                            title="The source asset is available and unchanged. This does not indicate an artwork assignment."
                          >
                            Source ready
                          </span>
                        )}

                        {sourceMissing ? (
                          <button
                            type="button"
                            className="danger-button"
                            onClick={() =>
                              onRemoveAsset(
                                asset.sourceRelativePath,
                              )
                            }
                          >
                            Remove missing source
                          </button>
                        ) : status?.attached ? (
                          <button
                            type="button"
                            disabled={asset.include}
                            title={
                              asset.include
                                ? "Remove artwork assignments before detaching this loose file."
                                : undefined
                            }
                            onClick={() =>
                              onDetachFile(
                                asset.sourceRelativePath,
                              )
                            }
                          >
                            Detach
                          </button>
                        ) : null}
                      </div>
                    </header>
                    <ArtworkAssignmentsEditor
                      asset={asset}
                      tracks={tracks}
                      existingTracks={existingTracks}
                      disabled={status?.state === "missing"}
                      onChange={(patch) => {
                        const nextAssignments =
                          patch.artworkAssignments ??
                          asset.artworkAssignments;
                        const newlyAppliedAssignment =
                          nextAssignments.find(
                            (candidate) =>
                              !asset.artworkAssignments.some(
                                (previous) =>
                                  previous.id === candidate.id,
                              ),
                          );
                        const advancedAssignmentChanged =
                          nextAssignments.find(
                            (assignment) => {
                              const previous =
                                asset.artworkAssignments.find(
                                  (candidate) =>
                                    candidate.id ===
                                    assignment.id,
                                );

                              return (
                                previous !== undefined &&
                                (
                                  previous.scope !==
                                    assignment.scope ||
                                  previous.role !==
                                    assignment.role
                                )
                              );
                            },
                          );

                        onChange(
                          asset.sourceRelativePath,
                          patch,
                        );

                        if (newlyAppliedAssignment) {
                          onNotify(
                            `${sourceFilename(asset.sourceRelativePath)} assigned: ${assignmentLabel(newlyAppliedAssignment, tracks)}.`,
                            "success",
                          );
                        } else if (
                          advancedAssignmentChanged
                        ) {
                          onNotify(
                            `${sourceFilename(asset.sourceRelativePath)} assignment updated: ${assignmentLabel(advancedAssignmentChanged, tracks)}.`,
                            "success",
                          );
                        }
                      }}
                    />
                  </section>
                );
              })}
            </div>
          </details>
        )}
      </section>

      {textAssets.length > 0 && (
        <section className="ingest-other-files-section">
          <header>
            <div>
              <h4>Other files</h4>
              <p>
                Ordinary text sidecars remain optional reviewed copies. Recognized FFmetadata sidecars are also parsed as non-destructive metadata evidence and compared above; preserving the original text file is optional.
              </p>
            </div>
            <span className="badge">
              {textAssets.length} text file{textAssets.length === 1 ? "" : "s"}
            </span>
          </header>
          <div className="ingest-table-scroll">
            <table className="ingest-table">
              <thead>
                <tr>
                  <th scope="col">Source</th>
                  <th scope="col">Use / copy</th>
                  <th scope="col">Source state</th>
                  <th scope="col">Physical release-relative copy</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {textAssets.map((asset) => {
                  const status = sourceStatusForPath(
                    sourceStatuses,
                    asset.sourceRelativePath,
                  );
                  const sourceMissing =
                    status?.state === "missing";

                  return (
                    <tr
                      key={asset.sourceRelativePath}
                      data-ingest-source-path={asset.sourceRelativePath}
                      tabIndex={-1}
                      className={
                        focusedSourcePath === asset.sourceRelativePath
                          ? "ingest-source-focused-row"
                          : undefined
                      }
                    >
                      <th scope="row" className="ingest-sticky-column">
                        <code>{asset.sourceRelativePath}</code>
                      </th>
                      <td>
                        <label className="ingest-inline-checkbox">
                          <input
                            type="checkbox"
                            aria-label={`Include ${asset.sourceRelativePath}`}
                            checked={asset.include}
                            disabled={sourceMissing}
                            onChange={(event) =>
                              onChange(
                                asset.sourceRelativePath,
                                { include: event.target.checked },
                              )
                            }
                          />
                          {asset.include ? "Copy text" : "Skip text"}
                        </label>
                      </td>
                      <td>
                        <SourceReviewCell
                          status={status}
                          onReviewed={(reviewed) =>
                            onSourceReviewed(
                              asset.sourceRelativePath,
                              reviewed,
                            )
                          }
                        />
                      </td>
                      <td>
                        <input
                          type="text"
                          value={asset.destinationRelativePath}
                          disabled={!asset.include || sourceMissing}
                          spellCheck={false}
                          aria-label={`Destination for ${asset.sourceRelativePath}`}
                          onChange={(event) =>
                            onChange(
                              asset.sourceRelativePath,
                              {
                                destinationRelativePath:
                                  event.target.value,
                              },
                            )
                          }
                        />
                      </td>
                      <td>
                        {sourceMissing ? (
                          <button
                            type="button"
                            className="danger-button ingest-remove-draft-button"
                            title={
                              "Remove this missing asset from the draft. Nothing is deleted from ingest-drop."
                            }
                            aria-label="Remove missing asset from draft"
                            onClick={() =>
                              onRemoveAsset(asset.sourceRelativePath)
                            }
                          >
                            <span aria-hidden="true">×</span>
                          </button>
                        ) : status?.attached ? (
                          <button
                            type="button"
                            disabled={asset.include}
                            title={
                              asset.include
                                ? "Uncheck Copy text before detaching this loose file."
                                : undefined
                            }
                            onClick={() =>
                              onDetachFile(asset.sourceRelativePath)
                            }
                          >
                            Detach
                          </button>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="ingest-loose-attachments">
        <header>
          <div>
            <h4>Loose files available to attach</h4>
            <p>
              Root-level images and text files remain separate ingest candidates until you attach them to this draft. Recognized FFmetadata text can contribute metadata evidence after attachment; attaching never moves or modifies the source.
            </p>
          </div>
          <span className="badge">
            {availableAttachments.length} available
          </span>
        </header>

        {availableAttachments.length === 0 ? (
          <p className="metadata-empty-value">
            No unattached loose image or text files are currently
            available. Add one to ingest-drop and choose Rescan candidate.
          </p>
        ) : (
          <div className="ingest-table-scroll">
            <table className="ingest-table">
              <thead>
                <tr>
                  <th scope="col">Source</th>
                  <th scope="col">Preview</th>
                  <th scope="col">Type</th>
                  <th scope="col">Size</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {availableAttachments.map((file) => (
                  <tr key={file.relativePath}>
                    <th scope="row" className="ingest-sticky-column">
                      <code>{file.relativePath}</code>
                    </th>
                    <td className="ingest-artwork-preview-cell">
                      {file.mediaKind === "image" ? (
                        <ArtworkPreview
                          key={`${file.relativePath}:${file.modifiedAt}`}
                          sourceRelativePath={file.relativePath}
                          modifiedAt={file.modifiedAt}
                        />
                      ) : (
                        <span className="ingest-artwork-preview-unavailable">
                          Text
                        </span>
                      )}
                    </td>
                    <td>{file.mediaKind}</td>
                    <td>{formatByteSize(file.sizeBytes)}</td>
                    <td>
                      <button
                        type="button"
                        onClick={() => onAttachFile(file)}
                      >
                        Attach to draft
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function reviewSourceFilename(
  sourceRelativePath: string,
): string {
  const segments = sourceRelativePath
    .split("/")
    .filter(Boolean);

  return segments[segments.length - 1] ?? sourceRelativePath;
}

function reviewIncludedArtwork(
  draft: IngestBuildDraft,
): IngestBuildAssetDraft[] {
  return draft.assets.filter(
    (asset) =>
      asset.mediaKind === "image" &&
      asset.include,
  );
}

function reviewReleaseFrontArtwork(
  draft: IngestBuildDraft,
): IngestBuildAssetDraft | undefined {
  return reviewIncludedArtwork(draft).find(
    (asset) =>
      asset.artworkAssignments.some(
        (assignment) =>
          assignment.scope === "release" &&
          assignment.role === "front_cover",
      ),
  );
}

function reviewTrackFrontArtwork(
  draft: IngestBuildDraft,
  trackSourceRelativePath: string,
): {
  asset?: IngestBuildAssetDraft;
  inherited: boolean;
} {
  const trackArtwork = reviewIncludedArtwork(draft).find(
    (asset) =>
      asset.artworkAssignments.some(
        (assignment) =>
          assignment.scope === "track" &&
          assignment.role === "front_cover" &&
          assignment.trackSourceRelativePaths.includes(
            trackSourceRelativePath,
          ),
      ),
  );

  if (trackArtwork) {
    return {
      asset: trackArtwork,
      inherited: false,
    };
  }

  return {
    asset: reviewReleaseFrontArtwork(draft),
    inherited: true,
  };
}

function reviewArtworkSourceStatus(
  asset: IngestBuildAssetDraft | undefined,
  sourceStatuses: IngestDraftSourceStatus[],
): IngestDraftSourceStatus | undefined {
  if (!asset) {
    return undefined;
  }

  return sourceStatusForPath(
    sourceStatuses,
    asset.embeddedArtwork?.audioSourceRelativePath ??
      asset.sourceRelativePath,
  );
}

function ReviewArtworkThumbnail({
  asset,
  sourceStatuses,
  label,
}: {
  asset?: IngestBuildAssetDraft;
  sourceStatuses: IngestDraftSourceStatus[];
  label: string;
}) {
  if (!asset) {
    return (
      <span
        className="ingest-review-artwork-empty"
        role="img"
        aria-label={`No front artwork assigned for ${label}`}
      >
        <span aria-hidden="true">—</span>
      </span>
    );
  }

  const status = reviewArtworkSourceStatus(
    asset,
    sourceStatuses,
  );

  if (status?.state === "missing") {
    return (
      <span
        className="ingest-review-artwork-empty missing"
        role="img"
        aria-label={`Artwork source missing for ${label}`}
      >
        <span aria-hidden="true">×</span>
      </span>
    );
  }

  return (
    <ArtworkPreview
      key={`${asset.sourceRelativePath}:${status?.modifiedAt ?? ""}`}
      sourceRelativePath={asset.sourceRelativePath}
      modifiedAt={status?.modifiedAt}
      embeddedArtwork={asset.embeddedArtwork}
      label={label}
      thumbnailOnly
    />
  );
}

function BuildPlanItemsTable({
  items,
  preview,
  audioPreviewControls,
  emptyLabel,
}: {
  items: IngestBuildPreview["items"];
  preview: IngestBuildPreview;
  audioPreviewControls: IngestAudioPreviewControls;
  emptyLabel: string;
}) {
  if (items.length === 0) {
    return (
      <p className="metadata-empty-value">
        {emptyLabel}
      </p>
    );
  }

  return (
    <div className="ingest-table-scroll">
      <table className="ingest-table ingest-build-plan-table">
        <thead>
          <tr>
            <th scope="col">Action</th>
            <th scope="col">Source</th>
            <th scope="col">Relative destination</th>
            <th scope="col">Adjustment / reason</th>
            <th
              scope="col"
              className="ingest-plan-kind-column"
            >
              Kind
            </th>
            <th scope="col">Roles</th>
            <th
              scope="col"
              className="numeric"
            >
              Size
            </th>
            <th
              scope="col"
              className="ingest-plan-status-column"
            >
              Status
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr
              key={`${item.destinationRelativePath}:${index}`}
            >
              <td>
                <span
                  className={`badge ingest-plan-action ${item.action}`}
                >
                  {item.action}
                </span>
              </td>
              <td className="ingest-build-plan-source-cell">
                <div>
                  {item.sourceRelativePath &&
                    item.mediaKind === "audio" && (
                      <IngestAudioPreviewButton
                        sourceRelativePath={item.sourceRelativePath}
                        controls={audioPreviewControls}
                      />
                    )}
                  {item.sourceRelativePath ? (
                    <code>
                      {item.sourceRelativePath}
                    </code>
                  ) : (
                    "—"
                  )}
                </div>
              </td>
              <th
                scope="row"
                className="ingest-sticky-column"
              >
                <code
                  title={item.destinationRelativePath}
                >
                  {stagingDestinationPathForDisplay(
                    item.destinationRelativePath,
                    preview.releaseRelativePath,
                  )}
                </code>
              </th>
              <td title={item.reason}>
                {item.adjustment ?? item.reason}
              </td>
              <td className="ingest-plan-kind-cell">
                <PlanKindIcon
                  kind={item.kind}
                  mediaKind={item.mediaKind}
                />
              </td>
              <td>
                {item.logicalRoles?.join(", ") ?? "—"}
              </td>
              <td className="numeric">
                {item.sizeBytes !== undefined
                  ? formatByteSize(item.sizeBytes)
                  : "—"}
              </td>
              <td className="ingest-plan-status-cell">
                <span
                  className={`ingest-plan-status-icon ${item.action === "blocked" ? "blocked" : "ready"}`}
                  role="img"
                  aria-label={
                    item.action === "blocked"
                      ? "Blocked"
                      : "Ready"
                  }
                  title={item.reason}
                >
                  <span aria-hidden="true">
                    {item.action === "blocked" ? "×" : "✓"}
                  </span>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BuildReview({
  draft,
  operation,
  preview,
  sourceStatuses,
  blockingSources,
  existingTracks,
  legacyReceiptMigrationRequired,
  onReviewArtwork,
  onTrackChange,
  onAcceptBlockingSource,
  onSkipBlockingSource,
  onReviewBlockingSource,
  onRemoveAsset,
  previewLoading,
  buildLoading,
  confirmed,
  onPreview,
  onConfirmedChange,
  onCreate,
  audioPreviewControls,
}: {
  draft: IngestBuildDraft;
  operation: IngestBuildOperation;
  preview: IngestBuildPreview | null;
  sourceStatuses: IngestDraftSourceStatus[];
  blockingSources: IngestDraftSourceStatus[];
  existingTracks: IngestStagingTargetStatus["existingTracks"];
  legacyReceiptMigrationRequired: boolean;
  onReviewArtwork?: () => void;
  onTrackChange: (
    sourceRelativePath: string,
    patch: Partial<IngestBuildTrackDraft>,
  ) => void;
  onAcceptBlockingSource: (
    status: IngestDraftSourceStatus,
  ) => void;
  onSkipBlockingSource: (
    status: IngestDraftSourceStatus,
  ) => void;
  onReviewBlockingSource: (
    status: IngestDraftSourceStatus,
  ) => void;
  onRemoveAsset: (sourceRelativePath: string) => void;
  previewLoading: boolean;
  buildLoading: boolean;
  confirmed: boolean;
  onPreview: () => void;
  onConfirmedChange: (
    value: boolean,
  ) => void;
  onCreate: () => void;
  audioPreviewControls: IngestAudioPreviewControls;
}) {
  const trackPaths = new Set(
    draft.tracks.map((track) =>
      track.sourceRelativePath,
    ),
  );
  const assetPaths = new Set(
    draft.assets.map((asset) =>
      asset.sourceRelativePath,
    ),
  );
  const videoPaths = new Set(
    (draft.videos ?? []).map((video) =>
      video.sourceRelativePath,
    ),
  );
  const missingAssets = sourceStatuses.filter(
    (status) =>
      status.state === "missing" &&
      assetPaths.has(status.sourceRelativePath),
  );
  const assignmentIssues =
    artworkAssignmentIssues(draft);
  const includedTracks = [...draft.tracks]
    .filter((track) => track.include)
    .sort((left, right) =>
      left.trackNumber - right.trackNumber,
    );
  const existingTrackBySource = new Map(
    existingTracks.map((track) => [
      track.sourceRelativePath,
      track,
    ]),
  );
  const existingTrackById = new Map(
    existingTracks.map((track) => [
      track.id,
      track,
    ]),
  );
  const existingTrackForCandidate = (
    track: IngestBuildTrackDraft,
  ) => {
    if (track.replacementTrackId?.trim()) {
      return existingTrackById.get(
        track.replacementTrackId.trim(),
      );
    }

    return existingTrackBySource.get(
      track.sourceRelativePath,
    );
  };
  const representedExistingTrackIds = new Set(
    includedTracks
      .map((track) =>
        existingTrackForCandidate(track)?.id
      )
      .filter(
        (trackId): trackId is string =>
          Boolean(trackId),
      ),
  );
  const preservedExistingTracks =
    operation === "update"
      ? existingTracks
          .filter(
            (track) =>
              !representedExistingTrackIds.has(
                track.id,
              ),
          )
          .slice()
          .sort(
            (left, right) =>
              left.number - right.number ||
              left.title.localeCompare(right.title),
          )
      : [];
  const existingTrackByNumber = new Map(
    existingTracks.map((track) => [track.number, track]),
  );
  const confirmedTrackReplacements =
    operation === "update"
      ? includedTracks.flatMap((track) => {
          const replacementTrackId =
            track.replacementTrackId?.trim();
          if (!replacementTrackId) {
            return [];
          }

          const target = existingTrackById.get(
            replacementTrackId,
          );

          return target
            ? [{ candidate: track, target }]
            : [];
        })
      : [];
  const unresolvedTrackReplacementConflicts =
    operation === "update"
      ? includedTracks.flatMap((track) => {
          if (track.replacementTrackId?.trim()) {
            return [];
          }

          const sourceMatch = existingTrackBySource.get(
            track.sourceRelativePath,
          );
          const sourceStatus = sourceStatusForPath(
            sourceStatuses,
            track.sourceRelativePath,
          );
          const numberMatch = existingTrackByNumber.get(
            track.trackNumber,
          );

          /*
           * An unchanged receipt source can participate in a normal
           * metadata/order update. Changed bytes for that source, or a
           * different/new source claiming an existing number, require an
           * explicit canonical-audio replacement target.
           */
          const target =
            sourceMatch && sourceStatus?.state === "changed"
              ? sourceMatch
              : numberMatch && numberMatch.id !== sourceMatch?.id
                ? numberMatch
                : !sourceMatch && numberMatch
                  ? numberMatch
                  : undefined;

          return target
            ? [{ candidate: track, target }]
            : [];
        })
      : [];
  const newCandidateTrackCount =
    includedTracks.filter(
      (track) =>
        !existingTrackForCandidate(track),
    ).length;
  const modifiedCandidateTrackCount =
    includedTracks.length -
    newCandidateTrackCount;
  const resultingTrackCount =
    includedTracks.length +
    preservedExistingTracks.length;
  const reviewTrackOrder = [
    ...preservedExistingTracks.map((track) => ({
      kind: "preserved" as const,
      number: track.number,
      track,
    })),
    ...includedTracks.map((track) => ({
      kind: "candidate" as const,
      number: track.trackNumber,
      track,
    })),
  ].sort(
    (left, right) =>
      left.number - right.number,
  );
  const includedVideos = [...(draft.videos ?? [])]
    .filter((video) => video.include);
  const missingVideoSources = includedVideos.filter(
    (video) =>
      sourceStatusForPath(
        sourceStatuses,
        video.sourceRelativePath,
      )?.state === "missing",
  );
  const pendingVideoReviewPaths = new Set(
    blockingSources
      .filter((status) =>
        videoPaths.has(status.sourceRelativePath),
      )
      .map((status) => status.sourceRelativePath),
  );
  const includedArtwork = reviewIncludedArtwork(draft);
  const releaseFrontArtwork =
    reviewReleaseFrontArtwork(draft);
  const releaseArtworkStatus =
    reviewArtworkSourceStatus(
      releaseFrontArtwork,
      sourceStatuses,
    );
  const missingTrackSources = includedTracks.filter(
    (track) =>
      sourceStatusForPath(
        sourceStatuses,
        track.sourceRelativePath,
      )?.state === "missing",
  );
  const trackArtworkCoverage = includedTracks.filter(
    (track) => {
      const effectiveArtwork = reviewTrackFrontArtwork(
        draft,
        track.sourceRelativePath,
      ).asset;

      return Boolean(
        effectiveArtwork &&
        reviewArtworkSourceStatus(
          effectiveArtwork,
          sourceStatuses,
        )?.state !== "missing",
      );
    },
  ).length;
  const pendingTrackReviewPaths = new Set(
    blockingSources
      .filter((status) =>
        trackPaths.has(status.sourceRelativePath),
      )
      .map((status) => status.sourceRelativePath),
  );
  const releaseIdentityReady = Boolean(
    draft.releaseId.trim() &&
    draft.releaseTitle.trim() &&
    draft.releaseArtist.trim() &&
    draft.releaseDate.trim() &&
    draft.releaseType.trim(),
  );
  const destinationLabel = preview?.releaseRelativePath ??
    `releases/${draft.releaseId || "…"}`;
  const filesystemItems = preview?.items.filter(
    (item) => item.kind !== "toml",
  ) ?? [];
  const metadataItems = preview?.items.filter(
    (item) => item.kind === "toml",
  ) ?? [];
  const blockedPlanItems = preview?.items.filter(
    (item) => item.action === "blocked",
  ) ?? [];
  const blockedArtworkReplacement =
    blockedPlanItems.some((item) =>
      item.reason.toLowerCase().includes("artwork") ||
      item.logicalRoles?.some((role) =>
        role.includes("artwork"),
      ),
    );
  const waveformBuildJobCount = preview
    ? preview.summary.waveformCreateCount +
      preview.summary.waveformReplaceCount
    : 0;
  const [buildElapsedSeconds, setBuildElapsedSeconds] =
    useState(0);

  useEffect(() => {
    if (!buildLoading) {
      setBuildElapsedSeconds(0);
      return;
    }

    const startedAt = Date.now();
    const updateElapsed = () => {
      setBuildElapsedSeconds(
        Math.max(
          0,
          Math.floor((Date.now() - startedAt) / 1000),
        ),
      );
    };

    updateElapsed();
    const timer = window.setInterval(updateElapsed, 1000);

    return () => window.clearInterval(timer);
  }, [buildLoading]);

  return (
    <div className="ingest-build-review">
      {unresolvedTrackReplacementConflicts.length > 0 && (
        <section
          className="ingest-build-replacement-resolution"
          aria-label="Canonical audio replacement required"
        >
          <div>
            <span className="ingest-review-eyebrow">
              Track replacement required
            </span>
            <h3>Confirm the existing master to replace</h3>
            <p>
              A candidate source is claiming an existing Library track number
              or contains changed bytes for an existing source. Replacement is
              never inferred automatically: confirm the stable track below or
              return to Tracks and choose another number.
            </p>
          </div>
          <div className="ingest-build-replacement-resolution-list">
            {unresolvedTrackReplacementConflicts.map(
              ({ candidate, target }) => (
                <div
                  className="ingest-build-replacement-resolution-row"
                  key={candidate.sourceRelativePath}
                >
                  <div>
                    <strong>
                      Track {target.number} · {target.title || "Untitled"}
                    </strong>
                    <small>
                      Preserve {target.id}; replace canonical audio only.
                    </small>
                  </div>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      onTrackChange(
                        candidate.sourceRelativePath,
                        {
                          replacementTrackId: target.id,
                          trackNumber: target.number,
                          title: target.title,
                          version: target.version,
                          artist: target.artist,
                          date: target.sourceDate,
                        },
                      )
                    }
                  >
                    Replace Track {target.number} · {target.title || "Untitled"}
                  </button>
                </div>
              ),
            )}
          </div>
        </section>
      )}

      {confirmedTrackReplacements.length > 0 &&
        unresolvedTrackReplacementConflicts.length === 0 && (
          <section
            className="ingest-build-replacement-confirmed"
            aria-label="Audio master replacement confirmed"
          >
            <div>
              <span className="ingest-review-eyebrow">
                Audio master replacement confirmed
              </span>
              <h3>Replacement target locked</h3>
              <p>
                The stable Library track identity will be preserved. The next
                step is to preview the server-validated replacement update.
              </p>
            </div>
            <div className="ingest-build-replacement-confirmed-list">
              {confirmedTrackReplacements.map(({ candidate, target }) => (
                <div
                  className="ingest-build-replacement-confirmed-row"
                  key={candidate.sourceRelativePath}
                >
                  <div>
                    <strong>
                      Track {target.number} · {target.title || "Untitled"}
                    </strong>
                    <small>
                      New master: {candidate.sourceRelativePath}
                    </small>
                    <small>
                      Preserve stable ID {target.id}; replace canonical audio
                      and refresh source-derived waveform/playback assets.
                    </small>
                  </div>
                  <span className="badge">Confirmed</span>
                </div>
              ))}
            </div>
            <strong className="ingest-build-replacement-next-step">
              Next: Preview replacement update.
            </strong>
          </section>
        )}

      <section className="ingest-build-plan-launcher">
        <div className="ingest-build-plan-launcher-copy">
          <span className="ingest-review-eyebrow">
            Server-validated build plan
          </span>
          <h3>
            {operation === "update"
              ? confirmedTrackReplacements.length > 0
                ? "Preview this audio-master replacement"
                : "Preview this release update"
              : "Preview this release build"}
          </h3>
          <p>
            Nothing is written until this plan is current and explicitly
            confirmed. Library waveforms are generated or refreshed from
            canonical audio during the guarded build; playback MP3 and HLS
            preparation remain separate.
          </p>
        </div>
        <div className="ingest-build-plan-launcher-actions">
          <button
            type="button"
            className="primary-button"
            disabled={
              previewLoading ||
              buildLoading ||
              legacyReceiptMigrationRequired ||
              blockingSources.length > 0 ||
              assignmentIssues.length > 0 ||
              unresolvedTrackReplacementConflicts.length > 0
            }
            onClick={onPreview}
          >
            {previewLoading
              ? "Validating plan…"
              : preview
                ? operation === "update"
                  ? "Refresh update plan"
                  : "Refresh build plan"
                : operation === "update"
                  ? confirmedTrackReplacements.length > 0
                    ? "Preview replacement update"
                    : "Preview update plan"
                  : "Preview build plan"}
          </button>
          {preview && (
            <div className="ingest-build-plan-launcher-status">
              <span
                className={`badge ${
                  preview.summary.blockedCount === 0
                    ? "complete"
                    : "missing"
                }`}
              >
                {preview.summary.blockedCount === 0
                  ? "Plan ready"
                  : `${preview.summary.blockedCount} blocked`}
              </span>
              <span>
                Waveforms: {preview.summary.waveformCreateCount} create
                {" · "}
                {preview.summary.waveformReplaceCount} refresh
                {" · "}
                {preview.summary.waveformPreserveCount} current
              </span>
            </div>
          )}
        </div>
      </section>

      <section className="ingest-review-release-card">
        <div className="ingest-review-release-artwork">
          <ReviewArtworkThumbnail
            asset={releaseFrontArtwork}
            sourceStatuses={sourceStatuses}
            label={`${draft.releaseTitle || "Untitled release"} release artwork`}
          />
        </div>
        <div className="ingest-review-release-identity">
          <div className="ingest-review-release-heading">
            <div>
              <span className="ingest-review-eyebrow">
                Final release
              </span>
              <h3>{draft.releaseTitle || "Untitled release"}</h3>
              <p>{draft.releaseArtist || "Unknown artist"}</p>
            </div>
            <span className="badge">
              {operation === "update" ? "Update" : "Create"}
            </span>
          </div>
          <div className="ingest-review-release-facts">
            <span>{draft.releaseDate || "No release date"}</span>
            <span>{draft.releaseType || "No release type"}</span>
            <span>
              {operation === "update"
                ? `${resultingTrackCount} tracks total · ${newCandidateTrackCount} new · ${preservedExistingTracks.length} preserved${
                    modifiedCandidateTrackCount > 0
                      ? ` · ${modifiedCandidateTrackCount} modified`
                      : ""
                  }`
                : `${includedTracks.length} track${
                    includedTracks.length === 1 ? "" : "s"
                  }`}
            </span>
            <span>
              {includedVideos.length} video{includedVideos.length === 1 ? "" : "s"}
            </span>
            <span>
              {includedArtwork.length} artwork source{includedArtwork.length === 1 ? "" : "s"}
            </span>
          </div>
          <div className="ingest-review-destination">
            <span>Destination</span>
            <code>{destinationLabel}</code>
          </div>
        </div>
      </section>

      <section className="ingest-review-track-panel">
        <header className="ingest-review-section-header">
          <div>
            <h4>Tracks</h4>
            <p>
              {operation === "update"
                ? "Confirm the final resulting track set. Existing Library rows are preserved unless explicitly revised; candidate rows show what this update adds or modifies."
                : "Confirm titles, source audio, and the effective front artwork each track will use."}
            </p>
          </div>
          <span className="badge">
            {operation === "update"
              ? `${resultingTrackCount} final`
              : `${includedTracks.length} included`}
          </span>
        </header>

        {resultingTrackCount === 0 ? (
          <p className="metadata-empty-value ingest-review-empty-state">
            No tracks are included in the resulting release.
          </p>
        ) : (
          <div className="ingest-table-scroll">
            <table className="ingest-table ingest-review-track-table">
              <thead>
                <tr>
                  <th scope="col" className="ingest-review-track-art-column">Art</th>
                  <th scope="col" className="numeric">#</th>
                  <th scope="col">Track</th>
                  <th scope="col">Source</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {reviewTrackOrder.map((reviewTrack) => {
                  if (reviewTrack.kind === "preserved") {
                    const track = reviewTrack.track;

                    return (
                      <tr
                        key={`existing:${track.id}`}
                        className="ingest-review-track-row--preserved"
                      >
                        <td className="ingest-review-track-artwork-cell">
                          <div
                            className="ingest-review-track-existing-art"
                            role="img"
                            aria-label={`Existing Library artwork remains unchanged for Track ${track.number}`}
                          >
                            Library
                          </div>
                          <small>Existing art</small>
                        </td>
                        <td className="numeric ingest-review-track-number">
                          {track.number}
                        </td>
                        <th
                          scope="row"
                          className="ingest-review-track-title-cell"
                        >
                          <strong>{track.title || "Untitled"}</strong>
                          {track.version.trim() && (
                            <span>{track.version.trim()}</span>
                          )}
                          <small>
                            {track.artist || draft.releaseArtist || "Unknown artist"}
                            {track.sourceDate ? ` · ${track.sourceDate}` : ""}
                          </small>
                          <div className="ingest-review-track-provenance">
                            <span className="badge">
                              Existing Library
                            </span>
                          </div>
                        </th>
                        <td className="ingest-review-track-source-cell">
                          <span className="ingest-review-track-preserved-source">
                            Existing Library source
                          </span>
                        </td>
                        <td>
                          <span className="badge complete">
                            Preserved
                          </span>
                        </td>
                      </tr>
                    );
                  }

                  const track = reviewTrack.track;
                  const candidateExistingTrack =
                    existingTrackForCandidate(track);
                  const trackStatus = sourceStatusForPath(
                    sourceStatuses,
                    track.sourceRelativePath,
                  );
                  const effectiveArtwork = reviewTrackFrontArtwork(
                    draft,
                    track.sourceRelativePath,
                  );
                  const effectiveArtworkStatus = reviewArtworkSourceStatus(
                    effectiveArtwork.asset,
                    sourceStatuses,
                  );
                  const sourceMissing = trackStatus?.state === "missing";
                  const artworkMissing =
                    effectiveArtworkStatus?.state === "missing";
                  const reviewPending = pendingTrackReviewPaths.has(
                    track.sourceRelativePath,
                  );
                  const statusLabel = sourceMissing
                    ? "Missing source"
                    : reviewPending
                      ? "Review source"
                      : artworkMissing
                        ? "Artwork missing"
                        : "Ready";
                  const statusClass = sourceMissing || artworkMissing
                    ? "missing"
                    : reviewPending
                      ? "ingest-review-status-pending"
                      : "complete";

                  return (
                    <tr key={track.sourceRelativePath}>
                      <td className="ingest-review-track-artwork-cell">
                        <div className="ingest-review-track-artwork">
                          <ReviewArtworkThumbnail
                            asset={effectiveArtwork.asset}
                            sourceStatuses={sourceStatuses}
                            label={`Track ${track.trackNumber} artwork`}
                          />
                        </div>
                        <small>
                          {effectiveArtwork.asset
                            ? effectiveArtwork.inherited
                              ? "Release"
                              : "Track"
                            : "No front art"}
                        </small>
                      </td>
                      <td className="numeric ingest-review-track-number">
                        {track.trackNumber}
                      </td>
                      <th scope="row" className="ingest-review-track-title-cell">
                        <strong>{track.title || "Untitled"}</strong>
                        {track.version.trim() && (
                          <span>{track.version.trim()}</span>
                        )}
                        <small>
                          {track.artist || draft.releaseArtist || "Unknown artist"}
                          {track.date ? ` · ${track.date}` : ""}
                        </small>
                        {operation === "update" && (
                          <div className="ingest-review-track-provenance">
                            <span className="badge">
                              {candidateExistingTrack
                                ? "Existing Library"
                                : "New"}
                            </span>
                            {candidateExistingTrack && (
                              <span className="badge">
                                Modified
                              </span>
                            )}
                          </div>
                        )}
                      </th>
                      <td className="ingest-review-track-source-cell">
                        <div>
                          <IngestAudioPreviewButton
                            sourceRelativePath={track.sourceRelativePath}
                            controls={audioPreviewControls}
                            disabled={sourceMissing}
                          />
                          <code title={track.sourceRelativePath}>
                            {reviewSourceFilename(track.sourceRelativePath)}
                          </code>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${statusClass}`}>
                          {statusLabel}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="ingest-review-video-panel">
        <header className="ingest-review-section-header">
          <div>
            <h4>Videos</h4>
            <p>
              Confirm canonical video identity, type, source, and any optional
              relationship to a track. Video remains release-scoped.
            </p>
          </div>
          <span className="badge">
            {includedVideos.length} included
          </span>
        </header>

        {includedVideos.length === 0 ? (
          <p className="metadata-empty-value ingest-review-empty-state">
            No videos are included in this staging draft.
          </p>
        ) : (
          <div className="ingest-table-scroll">
            <table className="ingest-table ingest-review-video-table">
              <thead>
                <tr>
                  <th scope="col">Video</th>
                  <th scope="col">Type</th>
                  <th scope="col">Related track</th>
                  <th scope="col">Source</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {includedVideos.map((video) => {
                  const sourceStatus = sourceStatusForPath(
                    sourceStatuses,
                    video.sourceRelativePath,
                  );
                  const sourceMissing = sourceStatus?.state === "missing";
                  const reviewPending = pendingVideoReviewPaths.has(
                    video.sourceRelativePath,
                  );
                  const canonicalRelatedTrack = video.relatedTrackId
                    ? existingTracks.find(
                        (track) => track.id === video.relatedTrackId,
                      )
                    : existingTracks.find(
                        (track) =>
                          track.sourceRelativePath ===
                          video.relatedTrackSourceRelativePath,
                      );
                  const candidateRelatedTrack = draft.tracks.find(
                    (track) =>
                      track.sourceRelativePath ===
                      video.relatedTrackSourceRelativePath,
                  );
                  const relatedTrackTitle =
                    canonicalRelatedTrack?.title ||
                    candidateRelatedTrack?.title ||
                    "";

                  return (
                    <tr key={video.sourceRelativePath}>
                      <th scope="row">
                        <strong>{video.title || "Untitled video"}</strong>
                        <small><code>{video.videoId}</code></small>
                      </th>
                      <td>{video.videoType || "other"}</td>
                      <td>
                        {relatedTrackTitle || "Release-level only"}
                      </td>
                      <td><code>{reviewSourceFilename(video.sourceRelativePath)}</code></td>
                      <td>
                        <span
                          className={`badge ${
                            sourceMissing
                              ? "missing"
                              : reviewPending
                                ? "ingest-review-status-pending"
                                : "complete"
                          }`}
                        >
                          {sourceMissing
                            ? "Missing source"
                            : reviewPending
                              ? "Review source"
                              : "Ready"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="ingest-review-preflight">
        <header className="ingest-review-section-header">
          <div>
            <h4>Build readiness</h4>
            <p>
              Confirm identity, source decisions, artwork, waveform work,
              and the current destination plan before applying the build.
            </p>
          </div>
        </header>

        <div className="ingest-review-preflight-grid">
          <div>
            <span className={`ingest-review-preflight-icon ${releaseIdentityReady ? "ready" : "blocked"}`} aria-hidden="true">
              {releaseIdentityReady ? "✓" : "×"}
            </span>
            <strong>Release identity</strong>
            <small>
              {releaseIdentityReady ? "Title, artist, date, type, and directory ID present" : "Release identity is incomplete"}
            </small>
          </div>
          <div>
            <span className={`ingest-review-preflight-icon ${missingTrackSources.length === 0 ? "ready" : "blocked"}`} aria-hidden="true">
              {missingTrackSources.length === 0 ? "✓" : "×"}
            </span>
            <strong>Track sources</strong>
            <small>
              {missingTrackSources.length === 0
                ? `${includedTracks.length} included source${includedTracks.length === 1 ? "" : "s"} available`
                : `${missingTrackSources.length} included source${missingTrackSources.length === 1 ? " is" : "s are"} missing`}
            </small>
          </div>
          <div>
            <span className={`ingest-review-preflight-icon ${missingVideoSources.length === 0 ? "ready" : "blocked"}`} aria-hidden="true">
              {missingVideoSources.length === 0 ? "✓" : "×"}
            </span>
            <strong>Video sources</strong>
            <small>
              {missingVideoSources.length === 0
                ? `${includedVideos.length} included video source${includedVideos.length === 1 ? "" : "s"} available`
                : `${missingVideoSources.length} included video source${missingVideoSources.length === 1 ? " is" : "s are"} missing`}
            </small>
          </div>
          <div>
            <span
              className={`ingest-review-preflight-icon ${
                releaseFrontArtwork
                  ? releaseArtworkStatus?.state === "missing"
                    ? "blocked"
                    : "ready"
                  : "neutral"
              }`}
              aria-hidden="true"
            >
              {releaseFrontArtwork
                ? releaseArtworkStatus?.state === "missing"
                  ? "×"
                  : "✓"
                : "•"}
            </span>
            <strong>Artwork coverage</strong>
            <small>
              {releaseFrontArtwork
                ? releaseArtworkStatus?.state === "missing"
                  ? "Release front art source is missing"
                  : "Release front art assigned"
                : "No release front art"}
              {` · ${trackArtworkCoverage}/${includedTracks.length} tracks covered`}
            </small>
          </div>
          <div>
            <span className={`ingest-review-preflight-icon ${blockingSources.length === 0 && assignmentIssues.length === 0 ? "ready" : "blocked"}`} aria-hidden="true">
              {blockingSources.length === 0 && assignmentIssues.length === 0 ? "✓" : "×"}
            </span>
            <strong>Source review</strong>
            <small>
              {blockingSources.length === 0 && assignmentIssues.length === 0
                ? "No unresolved source or artwork decisions"
                : `${blockingSources.length} source decision${blockingSources.length === 1 ? "" : "s"} · ${assignmentIssues.length} artwork issue${assignmentIssues.length === 1 ? "" : "s"}`}
            </small>
          </div>
          <div>
            <span className={`ingest-review-preflight-icon ${preview ? preview.summary.blockedCount === 0 ? "ready" : "blocked" : "neutral"}`} aria-hidden="true">
              {preview ? preview.summary.blockedCount === 0 ? "✓" : "×" : "•"}
            </span>
            <strong>Destination plan</strong>
            <small>
              {!preview
                ? "Not yet server-validated"
                : preview.summary.blockedCount === 0
                  ? `No blocked destinations · ${formatByteSize(preview.summary.totalCopyBytes)} to copy · ${
                      preview.summary.waveformCreateCount +
                      preview.summary.waveformReplaceCount
                    } waveform job${
                      preview.summary.waveformCreateCount +
                        preview.summary.waveformReplaceCount ===
                      1
                        ? ""
                        : "s"
                    }`
                  : `${preview.summary.blockedCount} blocked destination${preview.summary.blockedCount === 1 ? "" : "s"}`}
            </small>
          </div>
        </div>
      </section>

      {missingAssets.length > 0 && (
        <section className="warning-panel ingest-missing-draft-assets">
          <header>
            <div>
              <h4>Missing optional files retained in this draft</h4>
              <p>
                These sources are no longer present in ingest-drop.
                Remove them from the draft to clear their stale rows;
                this never deletes source media.
              </p>
            </div>
            <span className="badge missing">
              {missingAssets.length} missing
            </span>
          </header>
          <div className="ingest-table-scroll">
            <table className="ingest-table">
              <thead>
                <tr>
                  <th scope="col">Missing source</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {missingAssets.map((status) => (
                  <tr key={status.sourceRelativePath}>
                    <th scope="row" className="ingest-sticky-column">
                      <code>{status.sourceRelativePath}</code>
                    </th>
                    <td>
                      <button
                        type="button"
                        className="danger-button ingest-remove-draft-button"
                        title={
                          "Remove this missing asset from the draft. Nothing is deleted from ingest-drop."
                        }
                        aria-label="Remove missing asset from draft"
                        onClick={() =>
                          onRemoveAsset(status.sourceRelativePath)
                        }
                      >
                        <span aria-hidden="true">×</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {assignmentIssues.length > 0 && (
        <section className="warning-panel ingest-artwork-assignment-issues">
          <header>
            <div>
              <h4>Artwork assignments need attention</h4>
              <p>
                Every included image needs a clear scope, role,
                and at least one selected track when used at track level.
              </p>
            </div>
            <span className="badge missing">
              {assignmentIssues.length} issue{assignmentIssues.length === 1 ? "" : "s"}
            </span>
          </header>
          <ul className="ingest-warning-list">
            {assignmentIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </section>
      )}

      {blockingSources.length > 0 && (
        <section className="warning-panel ingest-source-review-panel">
          <header>
            <div>
              <h4>Source review required</h4>
              <p>
                Decide whether to include or skip each
                new, changed, or missing source. The
                build-plan button becomes available as
                soon as every row has a decision.
              </p>
            </div>
            <span className="badge missing">
              {blockingSources.length} pending
            </span>
          </header>

          <div className="ingest-table-scroll">
            <table className="ingest-table ingest-source-review-table">
              <thead>
                <tr>
                  <th scope="col">Source</th>
                  <th scope="col">Preview</th>
                  <th scope="col">State</th>
                  <th scope="col">Decision</th>
                </tr>
              </thead>
              <tbody>
                {blockingSources.map((status) => {
                  const isTrack = trackPaths.has(
                    status.sourceRelativePath,
                  );
                  const isVideo = videoPaths.has(
                    status.sourceRelativePath,
                  );
                  const isAsset = assetPaths.has(
                    status.sourceRelativePath,
                  );
                  const mayAccept =
                    status.state !== "missing";
                  const acceptLabel = isTrack
                    ? "Accept track source"
                    : isVideo
                      ? "Accept video source"
                    : status.mediaKind === "image"
                      ? "Include as artwork"
                      : "Include file";
                  const reviewLabel = isTrack
                    ? "Review in Tracks"
                    : isVideo
                      ? "Review in Videos"
                      : "Review in Artwork & files";

                  return (
                    <tr key={status.sourceRelativePath}>
                      <th
                        scope="row"
                        className="ingest-sticky-column"
                      >
                        <code>
                          {status.sourceRelativePath}
                        </code>
                      </th>
                      <td className="ingest-artwork-preview-cell">
                        {status.mediaKind === "image" &&
                        status.state !== "missing" ? (
                          <ArtworkPreview
                            key={`${status.sourceRelativePath}:${status.modifiedAt ?? ""}`}
                            sourceRelativePath={status.sourceRelativePath}
                            modifiedAt={status.modifiedAt}
                          />
                        ) : status.mediaKind === "audio" ? (
                          <IngestAudioPreviewButton
                            sourceRelativePath={status.sourceRelativePath}
                            controls={audioPreviewControls}
                            disabled={status.state === "missing"}
                          />
                        ) : (
                          <span className="ingest-artwork-preview-unavailable">
                            {status.mediaKind}
                          </span>
                        )}
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            status.state === "missing" ||
                            status.state === "changed"
                              ? "missing"
                              : ""
                          }`}
                        >
                          {status.state}
                        </span>
                      </td>
                      <td>
                        <div className="ingest-source-decision-actions">
                          {mayAccept && (
                            <button
                              type="button"
                              className="primary-button"
                              onClick={() =>
                                onAcceptBlockingSource(
                                  status,
                                )
                              }
                            >
                              {acceptLabel}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              onSkipBlockingSource(
                                status,
                              )
                            }
                          >
                            {status.state === "missing"
                              ? "Exclude missing file"
                              : "Skip this file"}
                          </button>
                          {isAsset &&
                            status.state === "missing" && (
                              <button
                                type="button"
                                className="danger-button ingest-remove-draft-button"
                                title={
                                  "Remove this missing asset from the draft. Nothing is deleted from ingest-drop."
                                }
                                aria-label="Remove missing asset from draft"
                                onClick={() =>
                                  onRemoveAsset(
                                    status.sourceRelativePath,
                                  )
                                }
                              >
                                <span aria-hidden="true">×</span>
                              </button>
                            )}
                          {(isTrack || isVideo || isAsset) && (
                            <button
                              type="button"
                              onClick={() =>
                                onReviewBlockingSource(
                                  status,
                                )
                              }
                            >
                              {reviewLabel}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {blockedPlanItems.length > 0 && (
        <section
          className="warning-panel ingest-blocked-destination-panel"
          aria-label="Blocked build destinations"
        >
          <header>
            <div>
              <h4>Blocked destination needs attention</h4>
              <p>
                The server-validated plan cannot be applied until the
                destination below is resolved. The exact reason is shown here
                so you do not have to hunt through the filesystem table.
              </p>
            </div>
            <span className="badge missing">
              {blockedPlanItems.length} blocked
            </span>
          </header>
          <ul className="ingest-warning-list">
            {blockedPlanItems.map((item, index) => (
              <li
                key={`${item.destinationRelativePath}:${index}`}
              >
                <strong>{item.reason}</strong>{" "}
                <code>{item.destinationRelativePath}</code>
              </li>
            ))}
          </ul>
          {blockedArtworkReplacement && onReviewArtwork && (
            <button
              type="button"
              className="secondary"
              onClick={onReviewArtwork}
            >
              Review Artwork &amp; files
            </button>
          )}
        </section>
      )}

      {preview && preview.warnings.length > 0 && (
        <section className="warning-panel ingest-review-plan-warnings">
          <header>
            <div>
              <h4>Plan warnings</h4>
              <p>
                Review these advisories before confirming the staging operation.
              </p>
            </div>
            <span className="badge missing">
              {preview.warnings.length} warning{preview.warnings.length === 1 ? "" : "s"}
            </span>
          </header>
          <ul className="ingest-warning-list">
            {preview.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      )}

      <div className="ingest-review-details-stack">
        {preview && preview.notes.length > 0 && (
          <details className="ingest-review-details">
            <summary>
              <span>Staging behavior</span>
              <span className="badge">
                {preview.notes.length} note{preview.notes.length === 1 ? "" : "s"}
              </span>
            </summary>
            <div className="ingest-review-details-body">
              <p className="metadata-empty-value">
                Informational details about the normal staging operation. No action is required.
              </p>
              <ul className="ingest-warning-list">
                {preview.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          </details>
        )}

        <details className="ingest-review-details">
          <summary>
            <span>Artwork placement details</span>
            <span className="badge">
              {includedArtwork.length} source{includedArtwork.length === 1 ? "" : "s"}
            </span>
          </summary>
          <div className="ingest-review-details-body">
            <ArtworkAssignmentSummary draft={draft} />
          </div>
        </details>

        {preview && (
          <>
            <details
              className="ingest-review-details"
              open={preview.summary.blockedCount > 0}
            >
              <summary>
                <span>Filesystem plan</span>
                <span className="badge">
                  {filesystemItems.length} item{filesystemItems.length === 1 ? "" : "s"}
                </span>
              </summary>
              <div className="ingest-review-details-body">
                <dl className="ingest-build-summary">
                  <div>
                    <dt>Operation</dt>
                    <dd>{preview.operation === "update" ? "Update" : "Create"}</dd>
                  </div>
                  <div>
                    <dt>Tracks</dt>
                    <dd>{preview.summary.trackCount}</dd>
                  </div>
                  <div>
                    <dt>Tracks added</dt>
                    <dd>{preview.summary.addedTrackCount}</dd>
                  </div>
                  <div>
                    <dt>Videos</dt>
                    <dd>{preview.summary.videoCount}</dd>
                  </div>
                  <div>
                    <dt>Videos added</dt>
                    <dd>{preview.summary.addedVideoCount}</dd>
                  </div>
                  <div>
                    <dt>Tracks replaced</dt>
                    <dd>{preview.summary.replacedTrackCount}</dd>
                  </div>
                  <div>
                    <dt>Tracks reordered</dt>
                    <dd>{preview.summary.reorderedTrackCount}</dd>
                  </div>
                  <div>
                    <dt>Files added</dt>
                    <dd>{preview.summary.copiedFileCount}</dd>
                  </div>
                  <div>
                    <dt>Waveforms created</dt>
                    <dd>{preview.summary.waveformCreateCount}</dd>
                  </div>
                  <div>
                    <dt>Waveforms refreshed</dt>
                    <dd>{preview.summary.waveformReplaceCount}</dd>
                  </div>
                  <div>
                    <dt>Waveforms current</dt>
                    <dd>{preview.summary.waveformPreserveCount}</dd>
                  </div>
                  <div>
                    <dt>Files updated</dt>
                    <dd>{preview.summary.updatedFileCount}</dd>
                  </div>
                  <div>
                    <dt>Files preserved</dt>
                    <dd>{preview.summary.preservedFileCount}</dd>
                  </div>
                  <div>
                    <dt>Files removed</dt>
                    <dd>{preview.summary.removedFileCount}</dd>
                  </div>
                  <div>
                    <dt>Blocked</dt>
                    <dd>{preview.summary.blockedCount}</dd>
                  </div>
                  <div>
                    <dt>Copy size</dt>
                    <dd>{formatByteSize(preview.summary.totalCopyBytes)}</dd>
                  </div>
                  <div className="ingest-build-summary-destination">
                    <dt>Destination</dt>
                    <dd><code>{preview.releaseRelativePath}</code></dd>
                  </div>
                </dl>
                <BuildPlanItemsTable
                  items={filesystemItems}
                  preview={preview}
                  audioPreviewControls={audioPreviewControls}
                  emptyLabel="No filesystem changes are present in this plan."
                />
              </div>
            </details>

            <details className="ingest-review-details">
              <summary>
                <span>Metadata / TOML updates</span>
                <span className="badge">
                  {metadataItems.length} TOML{metadataItems.length === 1 ? "" : "s"}
                </span>
              </summary>
              <div className="ingest-review-details-body">
                <BuildPlanItemsTable
                  items={metadataItems}
                  preview={preview}
                  audioPreviewControls={audioPreviewControls}
                  emptyLabel="No TOML changes are present in this plan."
                />
              </div>
            </details>
          </>
        )}
      </div>

      {preview && (
        <>
          <label className="ingest-build-confirmation">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={
                preview.summary.blockedCount > 0 ||
                blockingSources.length > 0 ||
                assignmentIssues.length > 0 ||
                unresolvedTrackReplacementConflicts.length > 0 ||
                buildLoading
              }
              onChange={(event) =>
                onConfirmedChange(
                  event.target.checked,
                )
              }
            />
            <span>
              {preview.operation === "update"
                ? "I reviewed the update plan. Build this Library update, preserve existing authored files, generate current waveforms, and leave all ingest sources unchanged."
                : "I reviewed the destination plan. Build this Library release with current waveforms and leave all ingest sources unchanged."}
            </span>
          </label>

          <div className="ingest-build-execution-row">
            <button
              type="button"
              className="primary-button danger-button"
              disabled={
                !confirmed ||
                buildLoading ||
                preview.summary.blockedCount > 0 ||
                blockingSources.length > 0 ||
                assignmentIssues.length > 0 ||
                unresolvedTrackReplacementConflicts.length > 0
              }
              onClick={onCreate}
            >
              {buildLoading
                ? preview.operation === "update"
                  ? "Building update and waveforms…"
                  : "Building release and waveforms…"
                : preview.operation === "update"
                  ? "Build release update"
                  : "Build release"}
            </button>
            {buildLoading && (
              <span className="ingest-build-progress-status">
                {buildElapsedSeconds < 5
                  ? "Server request active"
                  : "Still processing"}
                {waveformBuildJobCount > 0
                  ? ` · ${waveformBuildJobCount} waveform job${
                      waveformBuildJobCount === 1 ? "" : "s"
                    } in this build`
                  : preview.operation === "update"
                    ? " · applying guarded Library update"
                    : " · creating guarded Library release"}
                {` · ${buildElapsedSeconds}s elapsed`}
                {buildElapsedSeconds >= 15 && waveformBuildJobCount > 0
                  ? " · waveform generation can take a little while"
                  : ""}
              </span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
