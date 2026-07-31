import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  INGEST_BUILD_CONFIRMATION_PHRASE,
  INGEST_UPDATE_CONFIRMATION_PHRASE,
  buildReleaseDirectoryId,
  createArtworkAssignmentId,
  defaultReleaseArtworkAssignment,
  ingestArtworkRoleOptions,
  shouldSynchronizeReleaseDirectoryId,
  type IngestArtworkAssignmentDraft,
  type IngestBuildAssetDraft,
  type IngestBuildDraft,
  type IngestBuildOperation,
  type IngestBuildPreview,
  type IngestBuildResult,
  type IngestBuildTrackDraft,
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
} from "../shared/ingest-types.js";
import {
  stagingDestinationPathForDisplay,
} from "./ingest-build-display.js";
import {
  formatIngestSourceDisplayPath,
  sourceDateIsAfterReleaseDate,
  sourcePathsForBulkDate,
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
  | 4;

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

function ArtworkPreview({
  sourceRelativePath,
  modifiedAt,
  label,
  embeddedArtwork,
}: {
  sourceRelativePath: string;
  modifiedAt?: string;
  label?: string;
  embeddedArtwork?: IngestBuildAssetDraft["embeddedArtwork"];
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

  if (
    !stagingPreviewArtworkExtensions.has(
      extension,
    ) ||
    previewFailed
  ) {
    return (
      <span className="ingest-artwork-preview-unavailable">
        {previewFailed
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
  const accessibleLabel =
    label ?? sourceRelativePath;

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
      : kind === "toml"
        ? "toml"
        : kind === "receipt"
          ? "receipt"
          : mediaKind === "audio"
            ? "audio"
            : mediaKind === "image"
              ? "image"
              : "file";
  const label =
    iconKind === "directory"
      ? "Directory"
      : iconKind === "toml"
        ? "TOML document"
        : iconKind === "audio"
          ? "Audio file"
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
      ) : iconKind === "audio" ? (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M10 5v10.2a3.5 3.5 0 1 1-2-3.16V7l11-2v8.2a3.5 3.5 0 1 1-2-3.16V3.5z" />
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
    return `Release · ${assignment.role}`;
  }

  const selectedTracks = tracks.filter((track) =>
    assignment.trackSourceRelativePaths.includes(
      track.sourceRelativePath,
    ),
  );

  if (selectedTracks.length === 0) {
    return `Track level · ${assignment.role} · no tracks selected`;
  }

  return `${selectedTracks
    .map((track) => `Track ${track.trackNumber}`)
    .join(", ")} · ${assignment.role}`;
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

function ArtworkAssignmentsEditor({
  asset,
  tracks,
  disabled,
  onChange,
}: {
  asset: IngestBuildAssetDraft;
  tracks: IngestBuildTrackDraft[];
  disabled: boolean;
  onChange: (
    patch: Partial<IngestBuildAssetDraft>,
  ) => void;
}) {
  if (asset.mediaKind !== "image") {
    return (
      <span className="ingest-artwork-assignment-empty">
        Not artwork
      </span>
    );
  }

  const assignments = asset.artworkAssignments;
  const roleListId =
    `ingest-artwork-role-${asset.sourceRelativePath.replace(/[^a-z0-9]+/gi, "-")}`;

  const updateAssignment = (
    assignmentId: string,
    patch: Partial<IngestArtworkAssignmentDraft>,
  ) => {
    onChange({
      include: true,
      artworkAssignments: assignments.map(
        (assignment) =>
          assignment.id === assignmentId
            ? {
                ...assignment,
                ...patch,
              }
            : assignment,
      ),
    });
  };

  const removeAssignment = (
    assignmentId: string,
  ) => {
    const next = assignments.filter(
      (assignment) =>
        assignment.id !== assignmentId,
    );

    onChange({
      artworkAssignments: next,
      include: next.length > 0,
    });
  };

  const addAssignment = () => {
    onChange({
      include: true,
      artworkAssignments: [
        ...assignments,
        {
          id: createArtworkAssignmentId(assignments),
          scope: "release",
          role: assignments.length === 0
            ? "front_cover"
            : "alternate",
          trackSourceRelativePaths: [],
        },
      ],
    });
  };

  return (
    <div className="ingest-artwork-assignment-editor">
      {assignments.length === 0 ? (
        <p className="metadata-empty-value">
          No release-level or track-level use assigned.
        </p>
      ) : (
        assignments.map((assignment) => (
          <fieldset
            key={assignment.id}
            className="ingest-artwork-assignment-row"
            disabled={disabled}
          >
            <legend>
              {assignmentLabel(assignment, tracks)}
            </legend>

            <label>
              <span>Scope</span>
              <select
                value={assignment.scope}
                onChange={(event) => {
                  const scope = event.target.value as
                    | "release"
                    | "track";

                  updateAssignment(
                    assignment.id,
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

            <label>
              <span>Artwork role</span>
              <input
                type="text"
                list={roleListId}
                value={assignment.role}
                onChange={(event) =>
                  updateAssignment(
                    assignment.id,
                    { role: event.target.value },
                  )
                }
              />
            </label>

            {assignment.scope === "track" && (
              <div className="ingest-artwork-track-picker">
                <strong>Apply to tracks</strong>
                {tracks
                  .filter((track) => track.include)
                  .map((track) => {
                    const selected =
                      assignment.trackSourceRelativePaths.includes(
                        track.sourceRelativePath,
                      );

                    return (
                      <label key={track.sourceRelativePath}>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(event) => {
                            const next = event.target.checked
                              ? [
                                  ...assignment.trackSourceRelativePaths,
                                  track.sourceRelativePath,
                                ]
                              : assignment.trackSourceRelativePaths.filter(
                                  (path) =>
                                    path !== track.sourceRelativePath,
                                );

                            updateAssignment(
                              assignment.id,
                              {
                                trackSourceRelativePaths: [
                                  ...new Set(next),
                                ],
                              },
                            );
                          }}
                        />
                        {trackLabel(track)}
                      </label>
                    );
                  })}
              </div>
            )}

            <button
              type="button"
              className="link-button danger-text"
              onClick={() =>
                removeAssignment(assignment.id)
              }
            >
              Remove assignment
            </button>
          </fieldset>
        ))
      )}

      <button
        type="button"
        disabled={disabled}
        onClick={addAssignment}
      >
        Add assignment
      </button>

      <datalist id={roleListId}>
        {ingestArtworkRoleOptions.map((role) => (
          <option key={role} value={role} />
        ))}
      </datalist>
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
            One physical artwork copy may be referenced by the
            release and by one or more tracks.
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
                <th scope="col">Physical staged copy</th>
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
                    <code>{asset.destinationRelativePath}</code>
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

export function IngestReleaseBuilder({
  inspection,
  identitySeed,
  onCancel,
  onReleaseCreated,
}: {
  inspection: IngestCandidateInspection;
  identitySeed?: IngestDraftIdentitySeed | null;
  onCancel: () => void;
  onReleaseCreated: (
    releaseId: string,
  ) => void | Promise<void>;
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
  const audioPreviewRef =
    useRef<HTMLAudioElement | null>(null);
  const [audioPreviewSourcePath, setAudioPreviewSourcePath] =
    useState<string | null>(null);
  const [audioPreviewPlaying, setAudioPreviewPlaying] =
    useState(false);
  const [audioPreviewLoading, setAudioPreviewLoading] =
    useState(false);
  const [audioPreviewError, setAudioPreviewError] =
    useState<string | null>(null);
  const blockingSources =
    buildBlockingSourceStatuses(
      draft,
      sourceStatuses,
    );
  const stagingOperation: IngestBuildOperation =
    preview?.operation ??
    targetStatus?.operation ??
    "create";

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "metadata";

    const handlePlay = () => {
      setAudioPreviewPlaying(true);
      setAudioPreviewLoading(false);
    };
    const handlePause = () => {
      setAudioPreviewPlaying(false);
      setAudioPreviewLoading(false);
    };
    const handleWaiting = () => {
      setAudioPreviewLoading(true);
    };
    const handleCanPlay = () => {
      setAudioPreviewLoading(false);
    };
    const handleError = () => {
      setAudioPreviewPlaying(false);
      setAudioPreviewLoading(false);
      setAudioPreviewError(
        "The selected ingest source could not be decoded or transcoded for preview. Confirm FFmpeg and an MP3 encoder are available for non-MP3 sources.",
      );
    };

    audio.addEventListener("play", handlePlay);
    audio.addEventListener("pause", handlePause);
    audio.addEventListener("ended", handlePause);
    audio.addEventListener("waiting", handleWaiting);
    audio.addEventListener("canplay", handleCanPlay);
    audio.addEventListener("error", handleError);
    audioPreviewRef.current = audio;

    return () => {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      audio.removeEventListener("play", handlePlay);
      audio.removeEventListener("pause", handlePause);
      audio.removeEventListener("ended", handlePause);
      audio.removeEventListener("waiting", handleWaiting);
      audio.removeEventListener("canplay", handleCanPlay);
      audio.removeEventListener("error", handleError);
      audioPreviewRef.current = null;
    };
  }, []);

  const toggleIngestAudioPreview = (
    sourceRelativePath: string,
  ) => {
    const audio = audioPreviewRef.current;
    const source = currentInspection.files.find(
      (file) =>
        file.relativePath === sourceRelativePath &&
        file.mediaKind === "audio",
    );

    if (!audio || !source) {
      setAudioPreviewError(
        "This source is not available as an inspected audio file.",
      );
      return;
    }

    setAudioPreviewError(null);

    if (
      audioPreviewSourcePath === sourceRelativePath &&
      !audio.paused
    ) {
      audio.pause();
      return;
    }

    if (audioPreviewSourcePath !== sourceRelativePath) {
      audio.pause();
      audio.src = buildIngestAudioPreviewUrl(
        sourceRelativePath,
        source.modifiedAt,
      );
      audio.load();
      setAudioPreviewSourcePath(sourceRelativePath);
      setAudioPreviewLoading(true);
    }

    void audio.play().catch((previewError: unknown) => {
      setAudioPreviewPlaying(false);
      setAudioPreviewLoading(false);
      setAudioPreviewError(
        previewError instanceof Error
          ? previewError.message
          : "Audio preview could not start.",
      );
    });
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

          setTargetStatus(
            body as IngestStagingTargetStatus,
          );
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

      return {
        ...current,
        [key]: value,
        releaseId:
          key === "releaseId"
            ? value
            : synchronizeReleaseId
              ? buildReleaseDirectoryId(
                  nextReleaseDate,
                  nextReleaseTitle,
                )
              : current.releaseId,
        tracks:
          key === "releaseArtist"
            ? current.tracks.map((track) => ({
                ...track,
                artist:
                  !track.artist ||
                  track.artist ===
                    current.releaseArtist
                    ? value
                    : track.artist,
              }))
            : current.tracks,
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

    setMode("guided");
    setGuidedStep(isTrack ? 2 : 3);
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
              ? `${result.createdFiles.length} files added, ${result.updatedFiles.length} files updated, and ${result.preservedFiles.length} existing files preserved.`
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
      <header className="ingest-builder-header">
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
          <div>
            <p className="eyebrow">
              Staging release {stagingOperation === "update" ? "updater" : "builder"}
            </p>
            <h2>
              {inspection.candidate.displayTitle}
            </h2>
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
              : `Updates will be previewed as a delta against ${targetStatus?.releaseRelativePath}.`}
          </span>
        </div>
      )}

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
          onStepChange={setGuidedStep}
          onReleaseChange={updateRelease}
          onTrackChange={updateTrack}
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
          onReleaseChange={updateRelease}
          onTrackChange={updateTrack}
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
  onStepChange,
  onReleaseChange,
  onTrackChange,
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
      label: "Other files",
    },
    {
      number: 4 as const,
      label: "Review",
    },
  ];

  return (
    <>
      <ol className="ingest-guided-steps">
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
              <span>{item.number}</span>
              {item.label}
            </button>
          </li>
        ))}
      </ol>

      {step === 1 && (
        <section className="ingest-questionnaire-panel">
          <header>
            <p className="eyebrow">
              Step 1 of 4
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
              Step 2 of 4
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
              Step 3 of 4
            </p>
            <h3>Confirm images and text</h3>
            <p>
              Optional sidecars are copied into
              release-relative artwork or notes
              directories without interpreting
              their contents.
            </p>
          </header>
          <AssetDraftTable
            assets={draft.assets}
            tracks={draft.tracks}
            sourceStatuses={sourceStatuses}
            attachmentFiles={attachmentFiles}
            onChange={onAssetChange}
            onSourceReviewed={onSourceReviewed}
            onAttachFile={onAttachFile}
            onDetachFile={onDetachFile}
            onRemoveAsset={onRemoveAsset}
            focusedSourcePath={focusedSourcePath}
          />
        </section>
      )}

      {step === 4 && (
        <section className="ingest-questionnaire-panel">
          <header>
            <p className="eyebrow">
              Step 4 of 4
            </p>
            <h3>
              Review destination and {operation === "update" ? "update" : "create"}
            </h3>
            <p>
              Generate a fresh server-validated
              plan before any files are written.
            </p>
          </header>
          <BuildReview
            draft={draft}
            operation={operation}
            preview={preview}
            sourceStatuses={sourceStatuses}
            blockingSources={blockingSources}
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
        {step < 4 && (
          <button
            type="button"
            className="primary-button"
            onClick={() =>
              onStepChange(
                Math.min(
                  4,
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
  onReleaseChange,
  onTrackChange,
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
  onAcceptBlockingSource,
  onSkipBlockingSource,
  onReviewBlockingSource,
  onPreview,
  onConfirmedChange,
  onCreate,
}: {
  draft: IngestBuildDraft;
  operation: IngestBuildOperation;
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
          <h3>Other files</h3>
        </header>
        <AssetDraftTable
          assets={draft.assets}
          tracks={draft.tracks}
          sourceStatuses={sourceStatuses}
          attachmentFiles={attachmentFiles}
          onChange={onAssetChange}
          onSourceReviewed={onSourceReviewed}
          onAttachFile={onAttachFile}
          onDetachFile={onDetachFile}
          onRemoveAsset={onRemoveAsset}
          focusedSourcePath={focusedSourcePath}
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
    return <span>—</span>;
  }

  if (status.state === "unchanged") {
    return (
      <span className="badge complete">
        Unchanged
      </span>
    );
  }

  if (status.state === "missing") {
    return (
      <span className="badge missing">
        Source missing
      </span>
    );
  }

  return (
    <label className="ingest-source-review-control">
      <span
        className={`badge ${
          status.state === "changed"
            ? "missing"
            : ""
        }`}
      >
        {status.state === "changed"
          ? "Changed"
          : "New"}
      </span>
      <span>
        <input
          type="checkbox"
          checked={status.reviewed}
          onChange={(event) =>
            onReviewed(event.target.checked)
          }
        />
        Reviewed
      </span>
    </label>
  );
}

function TrackDraftTable({
  tracks,
  trackSourceFiles,
  releaseDate,
  sourceStatuses,
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
  const [bulkSourceDate, setBulkSourceDate] =
    useState("");

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

  return (
    <div className="ingest-track-table-workflow">
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
                Source state
              </th>
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
                  title={track.sourceRelativePath}
                >
                  <code>
                    {formatIngestSourceDisplayPath(
                      track.sourceRelativePath,
                    )}
                  </code>
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

function AssetDraftTable({
  assets,
  tracks,
  sourceStatuses,
  attachmentFiles,
  onChange,
  onSourceReviewed,
  onAttachFile,
  onDetachFile,
  onRemoveAsset,
  focusedSourcePath,
}: {
  assets: IngestBuildAssetDraft[];
  tracks: IngestBuildTrackDraft[];
  sourceStatuses: IngestDraftSourceStatus[];
  attachmentFiles: IngestFileInspection[];
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
}) {
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

  return (
    <div className="ingest-asset-workflow">
      {assets.length === 0 ? (
        <p className="metadata-empty-value">
          This candidate has no attached image
          or text sidecars yet. Add a file to the
          candidate folder and rescan, or attach a
          loose file from the drop point below.
        </p>
      ) : (
        <div className="ingest-table-scroll">
          <table className="ingest-table ingest-builder-asset-table">
            <thead>
              <tr>
                <th scope="col">Source</th>
                <th scope="col">Preview</th>
                <th scope="col">Use / copy</th>
                <th scope="col">Source state</th>
                <th scope="col">Artwork assignments</th>
                <th scope="col">
                  Physical release-relative copy
                </th>
                <th scope="col">Action</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((asset) => {
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
                  <tr
                    key={asset.sourceRelativePath}
                    data-ingest-source-path={
                      asset.sourceRelativePath
                    }
                    tabIndex={-1}
                    className={[
                      sourceMissing
                        ? "ingest-source-missing-row"
                        : "",
                      focusedSourcePath ===
                      asset.sourceRelativePath
                        ? "ingest-source-focused-row"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ") || undefined}
                  >
                    <th
                      scope="row"
                      className="ingest-sticky-column"
                    >
                      <code>
                        {asset.embeddedArtwork
                          ? `Embedded cover · ${asset.embeddedArtwork.audioSourceRelativePath}`
                          : asset.sourceRelativePath}
                      </code>
                    </th>
                    <td className="ingest-artwork-preview-cell">
                      {asset.mediaKind === "image" ? (
                        <ArtworkPreview
                          key={`${asset.sourceRelativePath}:${status?.modifiedAt ?? ""}`}
                          sourceRelativePath={asset.sourceRelativePath}
                          modifiedAt={status?.modifiedAt}
                          embeddedArtwork={asset.embeddedArtwork}
                        />
                      ) : (
                        <span className="ingest-artwork-preview-unavailable">
                          Text
                        </span>
                      )}
                    </td>
                    <td>
                      <label className="ingest-inline-checkbox">
                        <input
                          type="checkbox"
                          aria-label={`Include ${asset.sourceRelativePath}`}
                          checked={asset.include}
                          disabled={sourceMissing}
                          onChange={(event) => {
                            const include =
                              event.target.checked;
                            const artworkAssignments =
                              asset.mediaKind === "image"
                                ? include
                                  ? asset.artworkAssignments.length > 0
                                    ? asset.artworkAssignments
                                    : [defaultReleaseArtworkAssignment()]
                                  : []
                                : asset.artworkAssignments;

                            onChange(
                              asset.sourceRelativePath,
                              {
                                include,
                                artworkAssignments,
                              },
                            );
                          }}
                        />
                        {asset.mediaKind === "image"
                          ? asset.include
                            ? "Used as artwork"
                            : "Not used"
                          : asset.include
                            ? "Copy text"
                            : "Skip text"}
                      </label>
                    </td>
                    <td>
                      <SourceReviewCell
                        status={status}
                        onReviewed={(reviewed) =>
                          onSourceReviewed(
                            sourceStatusPath,
                            reviewed,
                          )
                        }
                      />
                    </td>
                    <td>
                      <ArtworkAssignmentsEditor
                        asset={asset}
                        tracks={tracks}
                        disabled={sourceMissing}
                        onChange={(patch) =>
                          onChange(
                            asset.sourceRelativePath,
                            patch,
                          )
                        }
                      />
                    </td>
                    <td>
                      <input
                        type="text"
                        value={
                          asset.destinationRelativePath
                        }
                        disabled={
                          !asset.include ||
                          sourceMissing
                        }
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
                            onRemoveAsset(
                              asset.sourceRelativePath,
                            )
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
                              ? "Remove artwork assignments or uncheck Use before detaching this loose file."
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
      )}

      <section className="ingest-loose-attachments">
        <header>
          <div>
            <h4>Loose files available to attach</h4>
            <p>
              Root-level images and text files remain
              separate ingest candidates until you attach
              them to this draft. Attaching does not move
              or modify the source.
            </p>
          </div>
          <span className="badge">
            {availableAttachments.length} available
          </span>
        </header>

        {availableAttachments.length === 0 ? (
          <p className="metadata-empty-value">
            No unattached loose image or text files are
            currently available. Add one to ingest-drop
            and choose Rescan candidate.
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
                    <th
                      scope="row"
                      className="ingest-sticky-column"
                    >
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
                    <td>
                      {formatByteSize(file.sizeBytes)}
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() =>
                          onAttachFile(file)
                        }
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

function BuildReview({
  draft,
  operation,
  preview,
  sourceStatuses,
  blockingSources,
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
  const missingAssets = sourceStatuses.filter(
    (status) =>
      status.state === "missing" &&
      assetPaths.has(status.sourceRelativePath),
  );
  const assignmentIssues =
    artworkAssignmentIssues(draft);

  return (
    <div className="ingest-build-review">
      <ArtworkAssignmentSummary draft={draft} />

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
                  const isAsset = assetPaths.has(
                    status.sourceRelativePath,
                  );
                  const mayAccept =
                    status.state !== "missing";
                  const acceptLabel = isTrack
                    ? "Accept track source"
                    : status.mediaKind === "image"
                      ? "Include as artwork"
                      : "Include file";
                  const reviewLabel = isTrack
                    ? "Review in Tracks"
                    : "Review in Other Files";

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
                          {(isTrack || isAsset) && (
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

      <button
        type="button"
        className="primary-button"
        disabled={
          previewLoading ||
          buildLoading ||
          blockingSources.length > 0 ||
          assignmentIssues.length > 0
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
              ? "Preview update plan"
              : "Preview build plan"}
      </button>

      {preview && (
        <>
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
              <dt>Tracks reordered</dt>
              <dd>{preview.summary.reorderedTrackCount}</dd>
            </div>
            <div>
              <dt>Files added</dt>
              <dd>{preview.summary.copiedFileCount}</dd>
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
                {preview.items.map(
                  (item, index) => (
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
                        {item.logicalRoles?.join(
                          ", ",
                        ) ?? "—"}
                      </td>
                      <td className="numeric">
                        {item.sizeBytes !== undefined
                          ? formatByteSize(
                              item.sizeBytes,
                            )
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
                  ),
                )}
              </tbody>
            </table>
          </div>

          <ul className="ingest-warning-list">
            {preview.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>

          <label className="ingest-build-confirmation">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={
                preview.summary.blockedCount > 0 ||
                blockingSources.length > 0 ||
                assignmentIssues.length > 0 ||
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
                ? "I reviewed the update plan. Apply this staging update, preserve existing authored files, and leave all ingest sources unchanged."
                : "I reviewed the destination plan. Create a new staging release and leave all ingest sources unchanged."}
            </span>
          </label>

          <button
            type="button"
            className="primary-button danger-button"
            disabled={
              !confirmed ||
              buildLoading ||
              preview.summary.blockedCount > 0 ||
              blockingSources.length > 0 ||
              assignmentIssues.length > 0
            }
            onClick={onCreate}
          >
            {buildLoading
              ? preview.operation === "update"
                ? "Updating and verifying…"
                : "Copying and verifying…"
              : preview.operation === "update"
                ? "Apply staging update"
                : "Create staging release"}
          </button>
        </>
      )}
    </div>
  );
}
