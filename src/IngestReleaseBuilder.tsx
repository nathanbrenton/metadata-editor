import {
  useMemo,
  useState,
} from "react";

import {
  createDefaultIngestBuildDraft,
  INGEST_BUILD_CONFIRMATION_PHRASE,
  type IngestBuildAssetDraft,
  type IngestBuildDraft,
  type IngestBuildPreview,
  type IngestBuildResult,
  type IngestBuildTrackDraft,
} from "../shared/ingest-builder.js";
import type {
  IngestCandidateInspection,
} from "../shared/ingest-types.js";

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
  const initialDraft = useMemo(
    () =>
      createDefaultIngestBuildDraft(
        inspection,
      ),
    [inspection],
  );
  const [draft, setDraft] =
    useState<IngestBuildDraft>(
      initialDraft,
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
          body: JSON.stringify({ draft }),
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
        <span className="badge">
          Sources remain unchanged
        </span>
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
            onChange={onTrackChange}
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
            onChange={onAssetChange}
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
            preview={preview}
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
          onChange={onTrackChange}
        />
      </section>

      <section className="ingest-table-panel">
        <header className="ingest-table-panel-header">
          <h3>Other files</h3>
        </header>
        <AssetDraftTable
          assets={draft.assets}
          onChange={onAssetChange}
        />
      </section>

      <section className="ingest-table-panel">
        <header className="ingest-table-panel-header">
          <h3>Build plan</h3>
        </header>
        <BuildReview
          preview={preview}
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

function TrackDraftTable({
  tracks,
  onChange,
}: {
  tracks: IngestBuildTrackDraft[];
  onChange: (
    sourceRelativePath: string,
    patch: Partial<IngestBuildTrackDraft>,
  ) => void;
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
          {tracks.map((track) => (
            <tr
              key={track.sourceRelativePath}
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
                <input
                  type="number"
                  min={1}
                  value={track.trackNumber}
                  disabled={!track.include}
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
                  disabled={!track.include}
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
                  disabled={!track.include}
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
                  disabled={!track.include}
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
                  disabled={!track.include}
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
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AssetDraftTable({
  assets,
  onChange,
}: {
  assets: IngestBuildAssetDraft[];
  onChange: (
    sourceRelativePath: string,
    patch: Partial<IngestBuildAssetDraft>,
  ) => void;
}) {
  if (assets.length === 0) {
    return (
      <p className="metadata-empty-value">
        This candidate has no inspected image
        or text sidecars.
      </p>
    );
  }

  return (
    <div className="ingest-table-scroll">
      <table className="ingest-table ingest-builder-asset-table">
        <thead>
          <tr>
            <th scope="col">Use</th>
            <th scope="col">Source</th>
            <th scope="col">Type</th>
            <th scope="col">
              Release-relative destination
            </th>
          </tr>
        </thead>
        <tbody>
          {assets.map((asset) => (
            <tr
              key={asset.sourceRelativePath}
            >
              <td>
                <input
                  type="checkbox"
                  aria-label={`Include ${asset.sourceRelativePath}`}
                  checked={asset.include}
                  onChange={(event) =>
                    onChange(
                      asset.sourceRelativePath,
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
                  {asset.sourceRelativePath}
                </code>
              </th>
              <td>{asset.mediaKind}</td>
              <td>
                <input
                  type="text"
                  value={
                    asset.destinationRelativePath
                  }
                  disabled={!asset.include}
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BuildReview({
  preview,
  previewLoading,
  buildLoading,
  confirmed,
  onPreview,
  onConfirmedChange,
  onCreate,
}: {
  preview: IngestBuildPreview | null;
  previewLoading: boolean;
  buildLoading: boolean;
  confirmed: boolean;
  onPreview: () => void;
  onConfirmedChange: (
    value: boolean,
  ) => void;
  onCreate: () => void;
}) {
  return (
    <div className="ingest-build-review">
      <button
        type="button"
        className="primary-button"
        disabled={
          previewLoading ||
          buildLoading
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
                  {
                    preview.releaseRelativePath
                  }
                </code>
              </dd>
            </div>
            <div>
              <dt>Tracks</dt>
              <dd>
                {preview.summary.trackCount}
              </dd>
            </div>
            <div>
              <dt>Files copied</dt>
              <dd>
                {
                  preview.summary
                    .copiedFileCount
                }
              </dd>
            </div>
            <div>
              <dt>Copy size</dt>
              <dd>
                {formatByteSize(
                  preview.summary
                    .totalCopyBytes,
                )}
              </dd>
            </div>
            <div>
              <dt>TOMLs</dt>
              <dd>
                {preview.summary.tomlCount}
              </dd>
            </div>
            <div>
              <dt>Blocked</dt>
              <dd>
                {
                  preview.summary
                    .blockedCount
                }
              </dd>
            </div>
          </dl>

          <div className="ingest-table-scroll">
            <table className="ingest-table ingest-build-plan-table">
              <thead>
                <tr>
                  <th scope="col">Action</th>
                  <th scope="col">Source</th>
                  <th scope="col">
                    Destination
                  </th>
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
                            {
                              item.sourceRelativePath
                            }
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
                          {
                            item.destinationRelativePath
                          }
                        </code>
                      </th>
                      <td>
                        {item.logicalRoles?.join(
                          ", ",
                        ) ?? "—"}
                      </td>
                      <td className="numeric">
                        {item.sizeBytes !==
                        undefined
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
            {preview.warnings.map(
              (warning) => (
                <li key={warning}>
                  {warning}
                </li>
              ),
            )}
          </ul>

          <label className="ingest-build-confirmation">
            <input
              type="checkbox"
              checked={confirmed}
              disabled={
                preview.summary.blockedCount >
                  0 ||
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
              leave all ingest sources
              unchanged.
            </span>
          </label>

          <button
            type="button"
            className="primary-button danger-button"
            disabled={
              !confirmed ||
              buildLoading ||
              preview.summary.blockedCount >
                0
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
