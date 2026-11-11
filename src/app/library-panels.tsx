import {
  lazy,
  useState,
} from "react";
import {
  buildArtworkGallery,
  type ArtworkGalleryItem,
} from "../artwork-gallery.js";
import type {
  DiscoveredAsset,
  GeneratedMetadataPreview,
  InferredValue,
  LibraryMetadataPreview,
  MetadataFileStatus,
  MetadataGenerationPlan,
  MetadataGenerationScope,
  ReleaseScanResult,
  TrackScanResult,
} from "./types.js";
import {
  formatReleaseTitle,
} from "./release-display.js";

function GenerationPlanPanel({
  plan,
  generationScope,
  selectedTrackId,
  tracks,
  confirmationText,
  creationLoading,
  creationError,
  creationMessage,
  onGenerationScopeChange,
  onSelectedTrackIdChange,
  onConfirmationTextChange,
  onCreate,
}: {
  plan: MetadataGenerationPlan;
  generationScope: MetadataGenerationScope;
  selectedTrackId: string;
  tracks: TrackScanResult[];
  confirmationText: string;
  creationLoading: boolean;
  creationError: string | null;
  creationMessage: string | null;
  onGenerationScopeChange: (
    scope: MetadataGenerationScope,
  ) => void;
  onSelectedTrackIdChange: (
    trackId: string,
  ) => void;
  onConfirmationTextChange: (
    value: string,
  ) => void;
  onCreate: () => void;
}) {
  return (
    <section className="generation-plan-panel">
      <div className="preview-heading">
        <div>
          <p className="card-type">
            Read-only safety check
          </p>
          <h3>Metadata generation plan</h3>
        </div>

        <span className="badge preview">
          No files will be written
        </span>
      </div>

      <section className="scope-controls">
        <label>
          Generation scope
          <select
            value={generationScope}
            onChange={(event) =>
              onGenerationScopeChange(
                event.target
                  .value as MetadataGenerationScope,
              )
            }
          >
            <option value="all">
              Release and all tracks
            </option>
            <option value="release">
              Release metadata only
            </option>
            <option value="track">
              Selected track only
            </option>
          </select>
        </label>

        {generationScope === "track" && (
          <label>
            Track
            <select
              value={selectedTrackId}
              onChange={(event) =>
                onSelectedTrackIdChange(
                  event.target.value,
                )
              }
            >
              {tracks.map((track) => (
                <option
                  key={track.id}
                  value={track.id}
                >
                  {track.id}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>

      <div className="plan-summary">
        <section>
          <span>May create</span>
          <strong>{plan.summary.createCount}</strong>
        </section>

        <section>
          <span>Blocked</span>
          <strong>{plan.summary.blockedCount}</strong>
        </section>
      </div>

      <div className="plan-items">
        {plan.items.map((item) => (
          <article
            key={item.relativePath}
            className={`plan-item ${item.action}`}
          >
            <div>
              <strong>{item.filename}</strong>
              <code>{item.relativePath}</code>
              <p>{item.reason}</p>
            </div>

            <div className="plan-item-status">
              <span
                className={
                  item.action === "create"
                    ? "badge complete"
                    : "badge missing"
                }
              >
                {item.action === "create"
                  ? "Create"
                  : "Blocked"}
              </span>

              <span
                className={
                  item.validated
                    ? "validation-status valid"
                    : "validation-status invalid"
                }
              >
                {item.validated
                  ? "TOML validated"
                  : "Invalid TOML"}
              </span>
            </div>
          </article>
        ))}
      </div>

      {plan.warnings.length > 0 && (
        <div className="preview-warnings">
          <h4>Plan warnings</h4>

          <ul>
            {plan.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <section className="creation-controls">
        <div>
          <p className="card-type">
            Explicit write confirmation
          </p>
          <h4>Create missing metadata files</h4>
          <p>
            Existing files will not be replaced. Enter
            the exact phrase below to enable creation:
          </p>
          <code>CREATE_MISSING_METADATA</code>
        </div>

        <label>
          Confirmation phrase
          <input
            type="text"
            value={confirmationText}
            disabled={
              creationLoading ||
              plan.summary.createCount === 0
            }
            autoComplete="off"
            spellCheck={false}
            onChange={(event) =>
              onConfirmationTextChange(
                event.target.value,
              )
            }
          />
        </label>

        <button
          type="button"
          className="create-button"
          disabled={
            creationLoading ||
            plan.summary.createCount === 0 ||
            confirmationText !==
              "CREATE_MISSING_METADATA"
          }
          onClick={onCreate}
        >
          {creationLoading
            ? "Creating metadata…"
            : plan.summary.createCount === 0
              ? "No missing files to create"
              : generationScope === "release"
                ? `Create ${plan.summary.createCount} release files`
                : generationScope === "track"
                  ? `Create ${plan.summary.createCount} track files`
                  : `Create ${plan.summary.createCount} missing files`}
        </button>

        {creationError && (
          <p className="message error">
            {creationError}
          </p>
        )}

        {creationMessage && (
          <p className="message success">
            {creationMessage}
          </p>
        )}
      </section>
    </section>
  );
}

function GeneratedTomlPanel({
  preview,
}: {
  preview: GeneratedMetadataPreview;
}) {
  return (
    <section className="generated-panel">
      <div className="preview-heading">
        <div>
          <p className="card-type">
            In-memory rendering
          </p>
          <h3>Generated TOML preview</h3>
        </div>

        <span className="badge preview">
          No files will be written
        </span>
      </div>

      <p className="generated-summary">
        {preview.documents.length} documents rendered
        and validated.
      </p>

      <div className="generated-document-list">
        {preview.documents.map((document) => (
          <details
            key={document.relativePath}
            className="generated-document"
          >
            <summary>
              <span>
                <strong>{document.filename}</strong>
                <code>{document.relativePath}</code>
              </span>

              <span
                className={
                  document.validated
                    ? "badge complete"
                    : "badge missing"
                }
              >
                {document.validated
                  ? "Validated"
                  : "Invalid"}
              </span>
            </summary>

            <pre>
              <code>{document.content}</code>
            </pre>
          </details>
        ))}
      </div>

      {preview.warnings.length > 0 && (
        <div className="preview-warnings">
          <h4>Generation warnings</h4>

          <ul>
            {preview.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function MetadataPreviewPanel({
  preview,
}: {
  preview: LibraryMetadataPreview;
}) {
  return (
    <section className="preview-panel">
      <div className="preview-heading">
        <div>
          <p className="card-type">
            Read-only preview
          </p>
          <h3>Inferred metadata</h3>
        </div>

        <span className="badge preview">
          No files will be written
        </span>
      </div>

      <section className="detail-grid">
        <PreviewGroup
          title="Release"
          values={[
            ["Release ID", preview.release.releaseId],
            ["Release date", preview.release.releaseDate],
            ["Release title", preview.release.releaseTitle],
            [
              "Artwork master",
              preview.release.artworkMasterPath,
            ],
          ]}
        />

        <section className="preview-track-list">
          <h4>Tracks</h4>

          {preview.tracks.map((track) => (
            <PreviewGroup
              key={track.trackId.value}
              title={track.trackId.value}
              values={[
                ["Artist", track.artistName],
                ["Track number", track.trackNumber],
                ["Track title", track.trackTitle],
                ["Track version", track.trackVersion],
                [
                  "Display title",
                  track.trackDisplayTitle,
                ],
                ["Audio master", track.audioMasterPath],
                ["Artwork master", track.artworkMasterPath],
              ]}
            />
          ))}
        </section>
      </section>

      {preview.warnings.length > 0 && (
        <div className="preview-warnings">
          <h4>Preview warnings</h4>

          <ul>
            {preview.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function PreviewGroup({
  title,
  values,
}: {
  title: string;
  values: Array<
    [
      string,
      InferredValue<string | number> | undefined,
    ]
  >;
}) {
  return (
    <section className="panel">
      <h4>{title}</h4>

      <dl className="preview-values">
        {values.map(([label, inferredValue]) => (
          <div key={label}>
            <dt>{label}</dt>

            <dd>
              {inferredValue ? (
                <>
                  <strong>
                    {inferredValue.value}
                  </strong>
                  <small>
                    Source: {inferredValue.source}
                  </small>
                </>
              ) : (
                <span className="not-inferred">
                  Not inferred
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function MetadataPanel({
  title,
  files,
}: {
  title: string;
  files: MetadataFileStatus[];
}) {
  return (
    <section className="panel">
      <h4>{title}</h4>

      <ul className="status-list">
        {files.map((file) => (
          <li key={file.relativePath}>
            <span
              className={
                file.exists
                  ? "status-dot present"
                  : "status-dot missing"
              }
              aria-hidden="true"
            />

            <div>
              <strong>{file.filename}</strong>
              <code>{file.relativePath}</code>
            </div>

            <span
              className={
                file.exists
                  ? "status-text present"
                  : "status-text missing"
              }
            >
              {file.exists
                ? "Present"
                : "Missing"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function artworkAssetUrl(
  relativePath: string,
): string {
  return `/api/library/artwork?${new URLSearchParams({
    path: relativePath,
  }).toString()}`;
}

function artworkPreviewUrl(
  relativePath: string,
): string {
  return `/api/library/artwork-preview?${new URLSearchParams({
    path: relativePath,
  }).toString()}`;
}

function ArtworkGallery({
  release,
  activeDocumentGroup,
}: {
  release: ReleaseScanResult | null;
  activeDocumentGroup: string;
}) {
  const isTrackScope =
    activeDocumentGroup !== "release";
  const activeTrack = isTrackScope
    ? release?.tracks.find(
        (track) =>
          track.id === activeDocumentGroup,
      ) ?? null
    : null;
  const scope = isTrackScope
    ? "track"
    : "release";
  const items = buildArtworkGallery({
    scope,
    releaseArtwork:
      release?.artworkMasters ?? [],
    trackArtwork:
      activeTrack?.artworkMasters ?? [],
  });
  const inherited = items.some(
    (item) => item.inherited,
  );

  return (
    <section className="metadata-artwork-gallery-panel">
      <header className="metadata-artwork-gallery-header">
        <div>
          <span className="metadata-artwork-gallery-eyebrow">
            {scope === "release"
              ? "Release artwork"
              : "Track artwork"}
          </span>
          <h2>
            {scope === "release"
              ? "Available release artwork"
              : `Artwork for ${formatReleaseTitle(
                  activeTrack?.id ??
                    activeDocumentGroup,
                )}`}
          </h2>
          <p>
            {scope === "release"
              ? "Release-scoped artwork only. Track-specific images are intentionally excluded from this view."
              : inherited
                ? "No track-specific artwork was found. The release front artwork is shown as an inherited fallback."
                : "All artwork discovered inside this track is shown below."}
          </p>
        </div>

        <span className="metadata-artwork-gallery-count">
          {items.length} {items.length === 1
            ? "artwork file"
            : "artwork files"}
        </span>
      </header>

      {items.length === 0 ? (
        <div className="metadata-artwork-gallery-empty">
          <strong>No artwork detected</strong>
          <p>
            {scope === "release"
              ? "Add release artwork under an artwork role directory such as front, back, disc, booklet, or alternate."
              : "This track has no local artwork and no release front artwork is available to inherit."}
          </p>
        </div>
      ) : (
        <div className="metadata-artwork-gallery-grid">
          {items.map((item) => (
            <ArtworkGalleryCard
              key={`${item.source}:${item.asset.relativePath}`}
              item={item}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function ArtworkGalleryCard({
  item,
}: {
  item: ArtworkGalleryItem;
}) {
  const [dimensions, setDimensions] =
    useState<string | null>(null);
  const [previewFailed, setPreviewFailed] =
    useState(false);
  const assetUrl = artworkAssetUrl(
    item.asset.relativePath,
  );
  const previewUrl = artworkPreviewUrl(
    item.asset.relativePath,
  );
  const extension = item.asset.extension
    .replace(/^\./, "")
    .toUpperCase() || "FILE";
  const sourceLabel =
    item.source === "track"
      ? "Track-specific artwork"
      : item.source === "release"
        ? "Release artwork"
        : "Release front fallback";

  return (
    <article
      className={[
        "metadata-artwork-card",
        item.inherited
          ? "is-inherited"
          : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <a
        className="metadata-artwork-preview"
        href={assetUrl}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open ${item.roleLabel} artwork: ${item.asset.filename}`}
      >
        {item.previewable && !previewFailed ? (
          <img
            src={previewUrl}
            alt={`${item.roleLabel} artwork`}
            loading="lazy"
            onLoad={(event) => {
              const image = event.currentTarget;
              setDimensions(
                `${image.naturalWidth} × ${image.naturalHeight}`,
              );
            }}
            onError={() => setPreviewFailed(true)}
          />
        ) : (
          <span className="metadata-artwork-preview-placeholder">
            <strong>{extension}</strong>
            <small>
              {previewFailed
                ? "Preview unavailable; open original"
                : "Open original to inspect"}
            </small>
          </span>
        )}
      </a>

      <div className="metadata-artwork-card-body">
        <header>
          <div>
            <span className="metadata-artwork-role">
              {item.roleLabel}
            </span>
            {item.inherited && (
              <small className="metadata-provenance-note metadata-inherited-note">
                Inherited from release
              </small>
            )}
          </div>
          <span className="metadata-artwork-format">
            {extension}
          </span>
        </header>

        <strong className="metadata-artwork-filename">
          {item.asset.filename}
        </strong>

        <dl className="metadata-artwork-facts">
          <div>
            <dt>Source</dt>
            <dd>{sourceLabel}</dd>
          </div>
          {item.previewTranscoded && (
            <div>
              <dt>Preview</dt>
              <dd>Read-only PNG from TIFF</dd>
            </div>
          )}
          {dimensions && (
            <div>
              <dt>Dimensions</dt>
              <dd>{dimensions}</dd>
            </div>
          )}
        </dl>

        <code className="metadata-artwork-path">
          {item.asset.relativePath}
        </code>

        <a
          className="metadata-artwork-open-link"
          href={assetUrl}
          target="_blank"
          rel="noreferrer"
        >
          Open original
        </a>
      </div>
    </article>
  );
}

function AssetPanel({
  title,
  assets,
  emptyLabel,
}: {
  title: string;
  assets: DiscoveredAsset[];
  emptyLabel: string;
}) {
  return (
    <section className="panel">
      <h4>{title}</h4>

      {assets.length === 0 ? (
        <p className="empty-state">
          {emptyLabel}
        </p>
      ) : (
        <ul className="asset-list">
          {assets.map((asset) => (
            <li key={asset.relativePath}>
              <strong>{asset.filename}</strong>
              <code>{asset.relativePath}</code>
              <span>{asset.extension}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export {
  GenerationPlanPanel,
  GeneratedTomlPanel,
  MetadataPreviewPanel,
  PreviewGroup,
  MetadataPanel,
  artworkAssetUrl,
  artworkPreviewUrl,
  ArtworkGallery,
  ArtworkGalleryCard,
  AssetPanel,
};
