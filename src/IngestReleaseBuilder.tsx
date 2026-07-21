import {
  useState,
} from "react";

import {
  INGEST_BUILD_CONFIRMATION_PHRASE,
  createArtworkAssignmentId,
  defaultReleaseArtworkAssignment,
  ingestArtworkRoleOptions,
  type IngestArtworkAssignmentDraft,
  type IngestBuildAssetDraft,
  type IngestBuildDraft,
  type IngestBuildPreview,
  type IngestBuildResult,
  type IngestBuildTrackDraft,
} from "../shared/ingest-builder.js";
import {
  buildBlockingSourceStatuses,
  type IngestDraftSourceStatus,
} from "../shared/ingest-drafts.js";
import type {
  IngestCandidateInspection,
  IngestFileInspection,
} from "../shared/ingest-types.js";
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


const browserPreviewArtworkExtensions =
  new Set([
    ".avif",
    ".gif",
    ".jpeg",
    ".jpg",
    ".png",
    ".webp",
  ]);

function artworkPreviewUrl(
  sourceRelativePath: string,
  modifiedAt?: string,
): string {
  const parameters = new URLSearchParams({
    path: sourceRelativePath,
  });

  if (modifiedAt) {
    parameters.set("version", modifiedAt);
  }

  return `/api/ingest/artwork?${parameters.toString()}`;
}

function ArtworkPreview({
  sourceRelativePath,
  modifiedAt,
  label,
}: {
  sourceRelativePath: string;
  modifiedAt?: string;
  label?: string;
}) {
  const extension = sourceRelativePath
    .slice(
      sourceRelativePath.lastIndexOf("."),
    )
    .toLowerCase();

  if (
    !browserPreviewArtworkExtensions.has(
      extension,
    )
  ) {
    return (
      <span className="ingest-artwork-preview-unavailable">
        Preview unavailable
      </span>
    );
  }

  const source = artworkPreviewUrl(
    sourceRelativePath,
    modifiedAt,
  );
  const accessibleLabel =
    label ?? sourceRelativePath;

  return (
    <a
      className="ingest-artwork-preview-link"
      href={source}
      target="_blank"
      rel="noreferrer"
      aria-label={`Open full artwork preview for ${accessibleLabel}`}
      title="Open full local artwork preview"
    >
      <img
        className="ingest-artwork-thumbnail"
        src={source}
        alt={`Artwork preview for ${accessibleLabel}`}
        loading="lazy"
      />
    </a>
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
  onCancel,
  onReleaseCreated,
}: {
  inspection: IngestCandidateInspection;
  onCancel: () => void;
  onReleaseCreated: (
    releaseId: string,
  ) => void | Promise<void>;
}) {
  const {
    draft,
    setDraft,
    sourceStatuses,
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
  } = useIngestDraft(inspection);
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
  const blockingSources =
    buildBlockingSourceStatuses(
      draft,
      sourceStatuses,
    );

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
    updateDraft((current) => ({
      ...current,
      [key]: value,
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
    }));
  };

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
              INGEST_BUILD_CONFIRMATION_PHRASE,
          }),
        },
      );
      const responseBody =
        (await response.json()) as unknown;

      if (!response.ok) {
        throw new Error(
          messageFromResponse(
            responseBody,
            `Staging release creation failed: HTTP ${response.status}`,
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
              Staging release created
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
            {result.createdFiles.length} files
            created and verified.
          </strong>
          <p>
            Source files remain in the ingest
            drop. Copied media hashes were
            checked before the staging release
            was published.
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
                  <th scope="col">Destination</th>
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
                        <code>
                          {
                            receipt.destinationRelativePath
                          }
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
            Open created release
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
              Staging release builder
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

      <div className="ingest-safety-banner">
        <strong>
          Copy-only staging workflow
        </strong>
        <span>
          The builder writes only to the
          configured staging media root. It
          never moves, renames, tags, or deletes
          the ingest source.
        </span>
      </div>

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
          onStepChange={setGuidedStep}
          onReleaseChange={updateRelease}
          onTrackChange={updateTrack}
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
          onReleaseChange={updateRelease}
          onTrackChange={updateTrack}
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
  onStepChange,
  onReleaseChange,
  onTrackChange,
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
            sourceStatuses={sourceStatuses}
            onChange={onTrackChange}
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
              Review destination and create
            </h3>
            <p>
              Generate a fresh server-validated
              plan before any files are written.
            </p>
          </header>
          <BuildReview
            draft={draft}
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
  onReleaseChange,
  onTrackChange,
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
          sourceStatuses={sourceStatuses}
          onChange={onTrackChange}
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

      <label className="ingest-release-id-field">
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
        <small>
          Lowercase letters, numbers, hyphens,
          and underscores. Destination:
          {" "}
          <code>
            releases/{draft.releaseId || "…"}
          </code>
        </small>
      </label>
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
  sourceStatuses,
  onChange,
  onSourceReviewed,
  focusedSourcePath,
}: {
  tracks: IngestBuildTrackDraft[];
  sourceStatuses: IngestDraftSourceStatus[];
  onChange: (
    sourceRelativePath: string,
    patch: Partial<IngestBuildTrackDraft>,
  ) => void;
  onSourceReviewed: (
    sourceRelativePath: string,
    reviewed: boolean,
  ) => void;
  focusedSourcePath: string | null;
}) {
  if (tracks.length === 0) {
    return (
      <p className="metadata-empty-value">
        No inspected audio streams are
        available for track creation.
      </p>
    );
  }

  return (
    <div className="ingest-table-scroll">
      <table className="ingest-table ingest-builder-track-table">
        <thead>
          <tr>
            <th scope="col">Use</th>
            <th scope="col">Source</th>
            <th scope="col">Source state</th>
            <th scope="col">#</th>
            <th scope="col">Track title</th>
            <th scope="col">Version / take</th>
            <th scope="col">Artist</th>
            <th scope="col">Source date</th>
            <th scope="col">
              Destination filename
            </th>
          </tr>
        </thead>
        <tbody>
          {tracks.map((track) => {
            const status = sourceStatusForPath(
              sourceStatuses,
              track.sourceRelativePath,
            );
            const sourceMissing =
              status?.state === "missing";

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
                  focusedSourcePath ===
                  track.sourceRelativePath
                    ? "ingest-source-focused-row"
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ") || undefined}
              >
                <td>
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
                  className="ingest-sticky-column"
                >
                  <code>
                    {track.sourceRelativePath}
                  </code>
                </th>
                <td>
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
                <td>
                  <input
                    type="number"
                    min={1}
                    value={track.trackNumber}
                    disabled={
                      !track.include ||
                      sourceMissing
                    }
                    aria-label={`Track number for ${track.sourceRelativePath}`}
                    onChange={(event) =>
                      onChange(
                        track.sourceRelativePath,
                        {
                          trackNumber:
                            Number(
                              event.target.value,
                            ),
                        },
                      )
                    }
                  />
                </td>
                <td>
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
                <td>
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
                <td>
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
                <td>
                  <input
                    type="date"
                    value={track.date}
                    disabled={
                      !track.include ||
                      sourceMissing
                    }
                    aria-label={`Source date for ${track.sourceRelativePath}`}
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
                </td>
                <td>
                  <code>
                    {track.destinationFilename}
                  </code>
                  <small>
                    Standardized master name;
                    original extension retained.
                  </small>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
                const status = sourceStatusForPath(
                  sourceStatuses,
                  asset.sourceRelativePath,
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
                        {asset.sourceRelativePath}
                      </code>
                    </th>
                    <td className="ingest-artwork-preview-cell">
                      {asset.mediaKind === "image" ? (
                        <ArtworkPreview
                          key={`${asset.sourceRelativePath}:${status?.modifiedAt ?? ""}`}
                          sourceRelativePath={asset.sourceRelativePath}
                          modifiedAt={status?.modifiedAt}
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
                            asset.sourceRelativePath,
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
}: {
  draft: IngestBuildDraft;
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
            ? "Refresh build plan"
            : "Preview build plan"}
      </button>

      {preview && (
        <>
          <dl className="ingest-build-summary">
            <div>
              <dt>Destination</dt>
              <dd>
                <code>
                  {preview.releaseRelativePath}
                </code>
              </dd>
            </div>
            <div>
              <dt>Tracks</dt>
              <dd>{preview.summary.trackCount}</dd>
            </div>
            <div>
              <dt>Files copied</dt>
              <dd>
                {preview.summary.copiedFileCount}
              </dd>
            </div>
            <div>
              <dt>Artwork sources</dt>
              <dd>{preview.summary.artworkSourceCount}</dd>
            </div>
            <div>
              <dt>Artwork assignments</dt>
              <dd>{preview.summary.artworkAssignmentCount}</dd>
            </div>
            <div>
              <dt>Copy size</dt>
              <dd>
                {formatByteSize(
                  preview.summary.totalCopyBytes,
                )}
              </dd>
            </div>
            <div>
              <dt>TOMLs</dt>
              <dd>{preview.summary.tomlCount}</dd>
            </div>
            <div>
              <dt>Blocked</dt>
              <dd>{preview.summary.blockedCount}</dd>
            </div>
          </dl>

          <div className="ingest-table-scroll">
            <table className="ingest-table ingest-build-plan-table">
              <thead>
                <tr>
                  <th scope="col">Action</th>
                  <th scope="col">Source</th>
                  <th scope="col">Destination</th>
                  <th scope="col">Roles</th>
                  <th
                    scope="col"
                    className="numeric"
                  >
                    Size
                  </th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {preview.items.map(
                  (item, index) => (
                    <tr
                      key={`${item.destinationRelativePath}:${index}`}
                    >
                      <td>{item.kind}</td>
                      <td>
                        {item.sourceRelativePath ? (
                          <code>
                            {item.sourceRelativePath}
                          </code>
                        ) : (
                          "—"
                        )}
                      </td>
                      <th
                        scope="row"
                        className="ingest-sticky-column"
                      >
                        <code>
                          {item.destinationRelativePath}
                        </code>
                      </th>
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
                      <td>
                        <span
                          className={`badge ${item.action === "blocked" ? "error" : ""}`}
                          title={item.reason}
                        >
                          {item.action}
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
              I reviewed the destination plan.
              Create a new staging release and
              leave all ingest sources unchanged.
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
              ? "Copying and verifying…"
              : "Create staging release"}
          </button>
        </>
      )}
    </div>
  );
}
