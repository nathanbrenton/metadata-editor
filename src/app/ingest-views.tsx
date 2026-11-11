import {
  lazy,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  PersistentLibraryPlaybackController,
  PersistentPlaybackTrack,
} from "../PersistentLibraryPlayer.js";
import { buildIngestAudioPreviewUrl } from "../ingest-audio-preview.js";
import type {
  IngestCandidateInspection,
  IngestCandidateSummary,
  IngestEvidence,
  IngestFileInspection,
  IngestScanResult,
} from "../../shared/ingest-types.js";
import type { IngestDraftIdentitySeed } from "../../shared/ingest-drafts.js";
import {
  canonicalMediaMasterFilename,
  classifyMediaMasterExtension,
  classifyMetadataFileExtension,
  mediaMasterPreferredFormatGuidance,
} from "../../shared/media-file-spec.js";
import {
  buildIngestIdentitySourcePlan,
  mergeIngestIdentityEvidence,
  selectIngestIdentityOverride,
} from "../ingest-identity-source.js";
import {
  buildExistingReleaseIdentitySeed,
  findAutomaticIngestTargetRelease,
  type IngestTargetReleaseMode,
} from "../ingest-target-release.js";
import type {
  IngestStagingIdentitySeed,
  ReleaseScanResult,
} from "./types.js";
import {
  formatByteSize,
  formatDuration,
} from "./foundation.js";

function IngestView({
  scan,
  releases,
  identitySeed,
  error,
  inspection,
  inspectionError,
  inspectionLoading,
  refreshing,
  onRefresh,
  onInspect,
  onBackToCandidates,
  onOpenStaging,
  playback,
}: {
  scan: IngestScanResult | null;
  releases: ReleaseScanResult[];
  identitySeed: IngestDraftIdentitySeed | null;
  error: string | null;
  inspection: IngestCandidateInspection | null;
  inspectionError: string | null;
  inspectionLoading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onInspect: (candidateId: string) => void;
  onBackToCandidates: () => void;
  onOpenStaging: (
    identityOverride: IngestStagingIdentitySeed,
  ) => void;
  playback: PersistentLibraryPlaybackController;
}) {
  if (inspection) {
    return (
      <IngestCandidateInspectionView
        inspection={inspection}
        releases={releases}
        identitySeed={identitySeed}
        onBack={onBackToCandidates}
        onOpenStaging={onOpenStaging}
        playback={playback}
      />
    );
  }

  return (
    <section className="ingest-view">
      <header className="ingest-view-header">
        <div>
          <p className="eyebrow">
            Step 1 · Ingest
          </p>
          <h2>Ingest drop</h2>
          <p>
            Inspect top-level folders and loose media,
            then continue with the selected candidate in
            Staging.
          </p>
        </div>

        <div className="workflow-workspace-actions">
          <button
            type="button"
            disabled={refreshing}
            onClick={onRefresh}
            title="Rescan the disposable ingest-drop folder for new or changed source media."
          >
            {refreshing ? "Inspecting…" : "Refresh Ingest"}
          </button>
        </div>
      </header>

      {error && (
        <p className="message error">{error}</p>
      )}

      {inspectionError && (
        <p className="message error">
          {inspectionError}
        </p>
      )}

      {inspectionLoading && (
        <p className="message">
          Probing candidate media with ffprobe and
          MediaInfo…
        </p>
      )}

      {scan && (
        <>
          {scan.warnings.length > 0 && (
            <section className="warning-panel">
              <h3>Inspection capabilities</h3>
              <ul>
                {scan.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </section>
          )}

          {scan.candidates.length === 0 ? (
            <p className="message">
              No eligible top-level folders or loose
              files were found.
            </p>
          ) : (
            <IngestCandidateTable
              candidates={scan.candidates}
              disabled={inspectionLoading}
              onInspect={onInspect}
            />
          )}
        </>
      )}
    </section>
  );
}

function IngestCandidateTable({
  candidates,
  disabled,
  onInspect,
}: {
  candidates: IngestCandidateSummary[];
  disabled: boolean;
  onInspect: (candidateId: string) => void;
}) {
  return (
    <section
      className="ingest-table-panel"
      aria-labelledby="ingest-candidates-heading"
    >
      <header className="ingest-table-panel-header">
        <div>
          <h3 id="ingest-candidates-heading">
            Ingest candidates
          </h3>
          <p>
            Each top-level folder or loose media file is
            treated as one read-only candidate.
          </p>
        </div>
        <strong>
          {candidates.length}{" "}
          {candidates.length === 1
            ? "candidate"
            : "candidates"}
        </strong>
      </header>

      <div className="ingest-table-scroll">
        <table className="ingest-table ingest-candidate-table">
          <thead>
            <tr>
              <th scope="col">Candidate</th>
              <th scope="col">Type</th>
              <th scope="col" className="numeric">
                Files
              </th>
              <th scope="col" className="numeric">
                Audio
              </th>
              <th scope="col" className="numeric">
                Video
              </th>
              <th scope="col" className="numeric">
                Images
              </th>
              <th scope="col" className="numeric">
                Text
              </th>
              <th scope="col" className="numeric">
                Size
              </th>
              <th scope="col">Extensions</th>
              <th scope="col">Date</th>
              <th scope="col" className="action-column">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((candidate) => (
              <tr
                key={candidate.id}
                className={`ingest-candidate-row${
                  disabled ? " is-disabled" : ""
                }`}
                tabIndex={disabled ? -1 : 0}
                aria-disabled={disabled}
                aria-label={`Inspect ${candidate.displayTitle}`}
                onClick={() => {
                  if (!disabled) {
                    onInspect(candidate.id);
                  }
                }}
                onKeyDown={(event) => {
                  if (
                    disabled ||
                    event.target !== event.currentTarget
                  ) {
                    return;
                  }

                  if (
                    event.key === "Enter" ||
                    event.key === " "
                  ) {
                    event.preventDefault();
                    onInspect(candidate.id);
                  }
                }}
              >
                <th scope="row" className="ingest-sticky-column">
                  <strong>{candidate.displayTitle}</strong>
                  <code>{candidate.relativePath}</code>
                  {candidate.warnings.length > 0 && (
                    <span className="ingest-row-warning">
                      {candidate.warnings.length}{" "}
                      {candidate.warnings.length === 1
                        ? "warning"
                        : "warnings"}
                    </span>
                  )}
                </th>
                <td>
                  {candidate.kind === "folder"
                    ? "Folder"
                    : "Loose file"}
                </td>
                <td className="numeric">
                  {candidate.fileCount}
                </td>
                <td className="numeric">
                  {candidate.audioCount}
                </td>
                <td className="numeric">
                  {candidate.videoCount}
                </td>
                <td className="numeric">
                  {candidate.imageCount}
                </td>
                <td className="numeric">
                  {candidate.textCount}
                </td>
                <td className="numeric">
                  {formatByteSize(
                    candidate.totalSizeBytes,
                  )}
                </td>
                <td>
                  {candidate.extensions.length > 0
                    ? candidate.extensions.join(", ")
                    : "—"}
                </td>
                <td>
                  {candidate.dateCandidates.length > 0 ? (
                    <span
                      className="badge ingest-date-evidence"
                      title={`${candidate.dateCandidates.length} inferred date${
                        candidate.dateCandidates.length === 1 ? "" : "s"
                      }: ${candidate.dateCandidates.join(", ")}`}
                      aria-label={`${candidate.dateCandidates.length} inferred date${
                        candidate.dateCandidates.length === 1 ? "" : "s"
                      }: ${candidate.dateCandidates.join(", ")}`}
                    >
                      {`${candidate.dateCandidates.length} ${
                        candidate.dateCandidates.length === 1
                          ? "date"
                          : "dates"
                      }`}
                    </span>
                  ) : (
                    <span
                      className="ingest-date-evidence-empty"
                      title="No inferred date evidence"
                      aria-label="No inferred date evidence"
                    >
                      —
                    </span>
                  )}
                </td>
                <td className="action-column">
                  <button
                    type="button"
                    className="primary-button"
                    disabled={disabled}
                    onClick={(event) => {
                      event.stopPropagation();
                      onInspect(candidate.id);
                    }}
                  >
                    Inspect
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function buildIngestArtworkPreviewUrl(
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

function IngestSourcePreview({
  file,
  audioSourcePath,
  audioPlaying,
  audioLoading,
  onToggleAudio,
}: {
  file: IngestFileInspection;
  audioSourcePath: string | null;
  audioPlaying: boolean;
  audioLoading: boolean;
  onToggleAudio: (file: IngestFileInspection) => void;
}) {
  const [imagePreviewFailed, setImagePreviewFailed] =
    useState(false);

  if (file.mediaKind === "image") {
    if (imagePreviewFailed) {
      return (
        <span
          className="ingest-source-preview-unavailable"
          title="Image preview unavailable"
          aria-label="Image preview unavailable"
        >
          —
        </span>
      );
    }

    const source = buildIngestArtworkPreviewUrl(
      file.relativePath,
      file.modifiedAt,
    );

    return (
      <a
        className="ingest-source-image-preview"
        href={source}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open image preview for ${file.filename}`}
        title="Open full image preview"
      >
        <img
          src={source}
          alt=""
          loading="lazy"
          onError={() => setImagePreviewFailed(true)}
        />
      </a>
    );
  }

  if (file.mediaKind === "video") {
    return (
      <span
        className="ingest-source-video-indicator"
        title="Video source detected; source preview will be added with the video workflow."
        aria-label={`Video source: ${file.filename}`}
      >
        VID
      </span>
    );
  }

  if (file.mediaKind === "audio") {
    const selected = audioSourcePath === file.relativePath;
    const playing = selected && audioPlaying;
    const loading = selected && audioLoading;

    return (
      <button
        type="button"
        className="ingest-source-audio-preview"
        aria-label={
          playing
            ? `Pause ${file.filename}`
            : `Play ${file.filename}`
        }
        aria-pressed={playing}
        title={
          playing
            ? "Pause source preview"
            : "Play source preview"
        }
        onClick={() => onToggleAudio(file)}
      >
        <span aria-hidden="true">
          {loading ? "…" : playing ? "❚❚" : "▶"}
        </span>
      </button>
    );
  }

  return (
    <span
      className="ingest-source-preview-unavailable"
      aria-hidden="true"
    >
      —
    </span>
  );
}

type IngestFileFormatStatus = {
  label: string;
  tone: "preferred" | "compatible" | "informational" | "warning";
  title: string;
};

function ingestFileFormatStatus(
  file: IngestFileInspection,
): IngestFileFormatStatus | null {
  if (file.metadataSidecar) {
    return {
      label: "Sidecar",
      tone: "informational",
      title:
        "Recognized metadata sidecar. Its parsed values are evidence for review; canonical authored metadata remains TOML in the Library.",
    };
  }

  const mediaRole =
    file.mediaKind === "audio"
      ? "audio-master"
      : file.mediaKind === "image"
        ? "artwork-master"
        : file.mediaKind === "video"
          ? "video-master"
          : null;

  if (mediaRole) {
    const classification = classifyMediaMasterExtension(
      mediaRole,
      file.extension,
    );
    const canonicalFilename =
      canonicalMediaMasterFilename(
        mediaRole,
        file.extension,
      );
    const formatGuidance =
      mediaMasterPreferredFormatGuidance[mediaRole];

    if (classification === "preferred") {
      return {
        label: "Preferred",
        tone: "preferred",
        title:
          `Preferred happy-path master format. Staging preserves the source bytes and container extension. Canonical Library filename: ${canonicalFilename}. ${formatGuidance}`,
      };
    }

    if (classification === "compatible") {
      return {
        label: "Compatible",
        tone: "compatible",
        title:
          `Accepted compatibility format, but not in the preferred happy-path master set. It can still be staged without automatic archival transcoding. Canonical Library filename: ${canonicalFilename}. ${formatGuidance}`,
      };
    }

    return {
      label: "Outside spec",
      tone: "warning",
      title:
        "The scanner identified this as media, but its extension is outside the current accepted file-spec set. Review before staging.",
    };
  }

  const metadataClass = classifyMetadataFileExtension(
    file.extension,
  );

  if (metadataClass === "candidate-evidence") {
    return {
      label: "Candidate metadata",
      tone: "informational",
      title:
        "Candidate metadata/evidence format. This extension is documented for future ingest mapping but is not yet promoted to a recognized parsed sidecar.",
    };
  }

  if (metadataClass === "recognized-sidecar") {
    return {
      label: "Sidecar format",
      tone: "informational",
      title:
        "Recognized sidecar extension. Check Details for parsed entries or parser warnings.",
    };
  }

  if (metadataClass === "canonical") {
    return {
      label: "Canonical TOML",
      tone: "informational",
      title:
        "TOML is the canonical authored Library metadata format. Generic TOML files in ingest-drop are not automatically treated as trusted canonical metadata.",
    };
  }

  return null;
}

function IngestFileFormatBadge({
  file,
}: {
  file: IngestFileInspection;
}) {
  const status = ingestFileFormatStatus(file);

  if (!status) {
    return null;
  }

  return (
    <span
      className={`ingest-file-format-badge ${status.tone}`}
      title={status.title}
      aria-label={`File format status: ${status.label}`}
    >
      {status.label}
    </span>
  );
}

type IngestSourceSort =
  | "name"
  | "type"
  | "size-desc"
  | "size-asc"
  | "duration-desc";

const ingestMediaKindOrder = new Map<string, number>([
  ["audio", 0],
  ["video", 1],
  ["image", 2],
  ["text", 3],
]);

function ingestSourceDuration(
  file: IngestFileInspection,
): number {
  return file.technical.durationSeconds ?? -1;
}

function sortIngestSourceFiles(
  files: IngestFileInspection[],
  sort: IngestSourceSort,
): IngestFileInspection[] {
  const byName = (
    left: IngestFileInspection,
    right: IngestFileInspection,
  ) =>
    left.filename.localeCompare(
      right.filename,
      undefined,
      { numeric: true, sensitivity: "base" },
    ) ||
    left.relativePath.localeCompare(
      right.relativePath,
      undefined,
      { numeric: true, sensitivity: "base" },
    );

  return files.slice().sort((left, right) => {
    if (sort === "type") {
      const leftRank =
        ingestMediaKindOrder.get(left.mediaKind) ?? 99;
      const rightRank =
        ingestMediaKindOrder.get(right.mediaKind) ?? 99;

      return (
        leftRank - rightRank ||
        left.extension.localeCompare(
          right.extension,
          undefined,
          { sensitivity: "base" },
        ) ||
        byName(left, right)
      );
    }

    if (sort === "size-desc") {
      return right.sizeBytes - left.sizeBytes || byName(left, right);
    }

    if (sort === "size-asc") {
      return left.sizeBytes - right.sizeBytes || byName(left, right);
    }

    if (sort === "duration-desc") {
      return (
        ingestSourceDuration(right) -
          ingestSourceDuration(left) ||
        byName(left, right)
      );
    }

    return byName(left, right);
  });
}

function IngestCandidateInspectionView({
  inspection,
  releases,
  identitySeed,
  onBack,
  onOpenStaging,
  playback,
}: {
  inspection: IngestCandidateInspection;
  releases: ReleaseScanResult[];
  identitySeed: IngestDraftIdentitySeed | null;
  onBack: () => void;
  onOpenStaging: (
    identityOverride: IngestStagingIdentitySeed,
  ) => void;
  playback: PersistentLibraryPlaybackController;
}) {
  const { candidate } = inspection;
  const identityPlan = useMemo(
    () => buildIngestIdentitySourcePlan(inspection),
    [inspection],
  );
  const [artistSourceId, setArtistSourceId] =
    useState(identityPlan.defaultArtistSourceId);
  const [titleSourceId, setTitleSourceId] =
    useState(identityPlan.defaultTitleSourceId);
  const identityOverride = useMemo(
    () =>
      selectIngestIdentityOverride(
        identityPlan,
        artistSourceId,
        titleSourceId,
      ),
    [artistSourceId, identityPlan, titleSourceId],
  );
  const [targetReleaseMode, setTargetReleaseMode] =
    useState<IngestTargetReleaseMode>(
      identitySeed?.targetReleaseId
        ? "existing"
        : "auto",
    );
  const [
    selectedTargetReleaseId,
    setSelectedTargetReleaseId,
  ] = useState(
    identitySeed?.targetReleaseId ?? "",
  );
  const automaticTargetRelease = useMemo(
    () =>
      findAutomaticIngestTargetRelease(
        releases,
        {
          ...identityOverride,
          ...(candidate.dateCandidates.length === 1
            ? {
                releaseDate:
                  candidate.dateCandidates[0],
              }
            : {}),
        },
      ),
    [
      candidate.dateCandidates,
      identityOverride,
      releases,
    ],
  );
  const selectedTargetRelease = useMemo(
    () =>
      releases.find(
        (release) =>
          release.id === selectedTargetReleaseId,
      ) ?? null,
    [releases, selectedTargetReleaseId],
  );
  const resolvedTargetRelease =
    targetReleaseMode === "auto"
      ? automaticTargetRelease
      : targetReleaseMode === "existing"
        ? selectedTargetRelease
        : null;
  const stagingIdentitySeed = useMemo<
    IngestStagingIdentitySeed
  >(
    () =>
      resolvedTargetRelease
        ? {
            ...buildExistingReleaseIdentitySeed(
              resolvedTargetRelease,
            ),
            evidence: identityOverride.evidence,
          }
        : identityOverride,
    [identityOverride, resolvedTargetRelease],
  );
  const sortedTargetReleases = useMemo(
    () =>
      releases.slice().sort((left, right) => {
        const leftTitle =
          left.releaseTitle?.trim() || left.id;
        const rightTitle =
          right.releaseTitle?.trim() || right.id;

        return (
          leftTitle.localeCompare(rightTitle) ||
          left.id.localeCompare(right.id)
        );
      }),
    [releases],
  );
  const targetSelectionRequired =
    targetReleaseMode === "existing" &&
    !selectedTargetRelease;
  const hasMetadataSidecar = inspection.files.some(
    (file) => file.metadataSidecar,
  );
  const artworkOnlyRevisionCandidate =
    candidate.audioCount === 0 &&
    candidate.videoCount === 0 &&
    candidate.imageCount > 0 &&
    !hasMetadataSidecar;
  const artworkRevisionTargetRequired =
    artworkOnlyRevisionCandidate &&
    !resolvedTargetRelease;

  useEffect(() => {
    if (
      targetReleaseMode === "existing" &&
      !selectedTargetReleaseId &&
      automaticTargetRelease
    ) {
      setSelectedTargetReleaseId(
        automaticTargetRelease.id,
      );
    }
  }, [
    automaticTargetRelease,
    selectedTargetReleaseId,
    targetReleaseMode,
  ]);

  const previewEvidence = useMemo(
    () =>
      mergeIngestIdentityEvidence(
        candidate.evidence,
        identityOverride,
      ),
    [candidate.evidence, identityOverride],
  );
  const [sourceSort, setSourceSort] =
    useState<IngestSourceSort>("name");
  const sortedSourceFiles = useMemo(
    () => sortIngestSourceFiles(inspection.files, sourceSort),
    [inspection.files, sourceSort],
  );
  const candidateReadiness =
    targetSelectionRequired || artworkRevisionTargetRequired
      ? {
          tone: "warning",
          label: "Review",
          summary: "Target release selection required",
          detail:
            "Artwork-only revisions must target an existing Library release before continuing to Staging.",
        }
      : inspection.warnings.length > 0
      ? {
          tone: "warning",
          label: "Review",
          summary: `${inspection.warnings.length} inspection ${
            inspection.warnings.length === 1 ? "warning" : "warnings"
          }`,
          detail:
            "Review the inspection warnings below before continuing to Staging.",
        }
      : {
          tone: "success",
          label: "Ready",
          summary:
            candidate.videoCount > 0
              ? `Video source${candidate.videoCount === 1 ? "" : "s"} probe-verified`
              : "Candidate inspection complete",
          detail:
            candidate.videoCount > 0
              ? "Video sources are probe-verified. Continue to Staging to confirm canonical video destination, stable ID, descriptive type, and optional related track."
              : "The candidate is ready to continue to Staging for reviewed canonical placement.",
        };
  const [expandedFiles, setExpandedFiles] = useState<
    string[]
  >([]);
  const ingestPlaybackQueue = useMemo<PersistentPlaybackTrack[]>(
    () =>
      sortedSourceFiles.flatMap((file) =>
        file.mediaKind === "audio"
          ? [{
              key: `ingest:${candidate.id}:${file.relativePath}`,
              source: buildIngestAudioPreviewUrl(
                file.relativePath,
                file.modifiedAt,
              ),
              title: file.filename,
              releaseTitle: candidate.displayTitle,
              detail: [
                "Ingest source",
                file.technical.codec ?? file.technical.container,
              ].filter(Boolean).join(" · "),
            }]
          : [],
      ),
    [candidate.displayTitle, candidate.id, sortedSourceFiles],
  );
  const sourceAudioPreviewPath =
    playback.currentTrack?.key.startsWith(
      `ingest:${candidate.id}:`,
    )
      ? playback.currentTrack.key.slice(
          `ingest:${candidate.id}:`.length,
        )
      : null;
  const sourceAudioPreviewPlaying =
    sourceAudioPreviewPath !== null && playback.isPlaying;
  const sourceAudioPreviewLoading =
    sourceAudioPreviewPath !== null && playback.isLoading;
  const sourceAudioPreviewError =
    sourceAudioPreviewPath !== null ? playback.error : null;

  const toggleSourceAudioPreview = (
    file: IngestFileInspection,
  ) => {
    if (file.mediaKind !== "audio") {
      return;
    }

    playback.toggleTrack(
      `ingest:${candidate.id}:${file.relativePath}`,
      ingestPlaybackQueue,
    );
  };

  const toggleFile = (relativePath: string) => {
    setExpandedFiles((current) =>
      current.includes(relativePath)
        ? current.filter(
            (path) => path !== relativePath,
          )
        : [...current, relativePath],
    );
  };

  return (
    <section className="ingest-view ingest-inspection-view">
      <header
        className="ingest-view-header ingest-inspection-header"
      >
        <div className="ingest-inspection-identity">
          <button
            type="button"
            className="metadata-detail-back-button"
            aria-label="Back to ingest candidates"
            title="Back to ingest candidates"
            onClick={onBack}
          >
            <span aria-hidden="true">←</span>
          </button>

          <div>
            <p className="eyebrow">
              Candidate inspection
            </p>
            <h2>{candidate.displayTitle}</h2>
            <code>{candidate.relativePath}</code>
          </div>
        </div>
        <div
          className={`ingest-candidate-health ${candidateReadiness.tone}`}
          role="status"
          aria-label={`Ingest readiness: ${candidateReadiness.label}`}
          title={candidateReadiness.detail}
        >
          <span className="ingest-candidate-health-label">
            Readiness
          </span>
          <div>
            <span className="ingest-candidate-health-badge">
              {candidateReadiness.label}
            </span>
            <strong>{candidateReadiness.summary}</strong>
          </div>
        </div>
        <div className="ingest-inspection-actions">
          <span className="badge">
            {candidate.kind === "folder"
              ? "Folder candidate"
              : "Loose-file candidate"}
          </span>
          <button
            type="button"
            className="primary-button"
            disabled={
              targetSelectionRequired ||
              artworkRevisionTargetRequired ||
              (
                candidate.audioCount === 0 &&
                candidate.videoCount === 0 &&
                candidate.imageCount === 0 &&
                !hasMetadataSidecar
              )
            }
            title={
              candidate.videoCount > 0
                ? "Continue to Staging to confirm canonical video placement, stable identity, type, and any optional track relationship."
                : artworkOnlyRevisionCandidate && resolvedTargetRelease
                  ? "Continue to Staging to assign this artwork to the selected existing Library release and explicitly confirm any canonical artwork replacement."
                  : artworkOnlyRevisionCandidate
                    ? "Artwork-only revisions must target an existing Library release before continuing to Staging."
                    : candidate.audioCount === 0 && hasMetadataSidecar
                      ? "Continue with metadata-sidecar evidence and target an existing Library release in Staging."
                      : undefined
            }
            onClick={() =>
              onOpenStaging(stagingIdentitySeed)
            }
          >
            Continue to Staging
          </button>
        </div>
      </header>


      <section
        className="ingest-table-panel ingest-target-release-card"
        aria-labelledby="ingest-target-release-heading"
      >
        <header className="ingest-table-panel-header">
          <h3
            id="ingest-target-release-heading"
            className="hover-help-label"
            title="Choose whether this candidate creates a new release or updates an existing canonical Library release. Source-folder naming is evidence only and never determines the destination by itself."
          >
            Target release
          </h3>
        </header>
        <div className="ingest-target-release-panel">

          <fieldset className="ingest-target-release-modes">
            <legend>
              Target mode
            </legend>
            <label>
              <input
                type="radio"
                name="ingest-target-release-mode"
                value="auto"
                checked={targetReleaseMode === "auto"}
                onChange={() =>
                  setTargetReleaseMode("auto")
                }
              />
              <span>Auto</span>
            </label>
            <label>
              <input
                type="radio"
                name="ingest-target-release-mode"
                value="new"
                checked={targetReleaseMode === "new"}
                onChange={() =>
                  setTargetReleaseMode("new")
                }
              />
              <span>New release</span>
            </label>
            <label>
              <input
                type="radio"
                name="ingest-target-release-mode"
                value="existing"
                checked={targetReleaseMode === "existing"}
                onChange={() =>
                  setTargetReleaseMode("existing")
                }
              />
              <span>Existing Library release</span>
            </label>
          </fieldset>

          {targetReleaseMode === "existing" && (
            <label className="ingest-target-release-select">
              <span>Existing release</span>
              <select
                value={selectedTargetReleaseId}
                onChange={(event) =>
                  setSelectedTargetReleaseId(
                    event.target.value,
                  )
                }
              >
                <option value="">
                  Select a Library release…
                </option>
                {sortedTargetReleases.map((release) => (
                  <option
                    key={release.id}
                    value={release.id}
                  >
                    {release.releaseTitle?.trim() || release.id}
                    {release.primaryArtistName
                      ? ` — ${release.primaryArtistName}`
                      : ""}
                    {` — ${release.id}`}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div
            className={[
              "ingest-target-release-resolution",
              resolvedTargetRelease
                ? "existing"
                : targetReleaseMode === "auto"
                  ? "suggested"
                  : targetReleaseMode === "new"
                    ? "new"
                    : "blocked",
            ].join(" ")}
          >
            {resolvedTargetRelease ? (
              <>
                <span className="badge complete">Matched</span>
                <strong
                  title="An unambiguous existing canonical Library release is selected as the update destination."
                >
                  {resolvedTargetRelease.releaseTitle?.trim() ||
                    resolvedTargetRelease.id}
                </strong>
                <small>
                  {resolvedTargetRelease.primaryArtistName
                    ? `${resolvedTargetRelease.primaryArtistName} · `
                    : ""}
                  {resolvedTargetRelease.id}
                </small>
                {(
                  identityOverride.releaseTitle.trim() &&
                  resolvedTargetRelease.releaseTitle?.trim() &&
                  identityOverride.releaseTitle.trim().localeCompare(
                    resolvedTargetRelease.releaseTitle.trim(),
                    undefined,
                    { sensitivity: "base" },
                  ) !== 0
                ) && (
                  <small className="ingest-target-release-note">
                    Candidate title differs from the canonical destination.
                  </small>
                )}
              </>
            ) : targetReleaseMode === "auto" ? (
              <>
                <span
                  className="badge ingest-target-suggested-badge"
                  title="No unambiguous exact Library match was found, so Auto currently recommends creating a new release."
                >
                  Suggested
                </span>
                <strong
                  className="hover-help-label"
                  title="Auto suggests a new release only when it cannot resolve one unambiguous exact canonical Library match. You can override this by choosing Existing Library release."
                >
                  New release suggested
                </strong>
              </>
            ) : targetReleaseMode === "new" ? (
              <>
                <span className="badge ingest-target-suggested-badge">
                  New
                </span>
                <strong>{identityOverride.releaseTitle}</strong>
              </>
            ) : (
              <>
                <span className="badge missing">Blocked</span>
                <strong
                  title="Select an existing Library destination before Continue to Staging becomes available."
                >
                  Choose an existing Library release
                </strong>
              </>
            )}
          </div>
        </div>
      </section>


      <section
        className="ingest-table-panel"
        aria-labelledby="candidate-evidence-heading"
      >
        <header className="ingest-table-panel-header">
          <div>
            <h3
              id="candidate-evidence-heading"
              className="hover-help-label"
              title="Deterministic local rules report candidate suggestions and evidence; they do not become authoritative metadata until reviewed and staged."
            >
              Inferred metadata
            </h3>
          </div>
        </header>
        <div className="ingest-identity-tools">
          <div className="ingest-identity-tools-intro">
            <strong
              className="hover-help-label"
              title="Choose folder fields, embedded tags, or recognized metadata sidecars as the candidate identity source. These selections seed Staging and remain manually editable."
            >
              Release identity detection
            </strong>
          </div>

          <label>
            <span>Artist source</span>
            <select
              value={artistSourceId}
              onChange={(event) =>
                setArtistSourceId(event.target.value)
              }
            >
              {identityPlan.artistOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Release title source</span>
            <select
              value={titleSourceId}
              onChange={(event) =>
                setTitleSourceId(event.target.value)
              }
            >
              {identityPlan.titleOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <div className="ingest-identity-preview">
            <span>Candidate identity</span>
            <strong>
              {identityOverride.releaseArtist || "Artist not inferred"}
            </strong>
            <small>{identityOverride.releaseTitle}</small>
          </div>
        </div>


        <details className="ingest-evidence-disclosure">
          <summary>
            <span
              className="ingest-evidence-disclosure-triangle"
              aria-hidden="true"
            >
              ▸
            </span>
            <strong>Inference evidence</strong>
            <span>
              {previewEvidence.length}{" "}
              {previewEvidence.length === 1 ? "row" : "rows"}
            </span>
          </summary>
          <IngestEvidenceTable
            evidence={previewEvidence}
          />
        </details>
      </section>

      {inspection.warnings.length > 0 && (
        <section className="warning-panel">
          <h3>Inspection warnings</h3>
          <ul>
            {inspection.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      )}

      <section
        className="ingest-table-panel"
        aria-labelledby="source-files-heading"
      >
        <header className="ingest-table-panel-header ingest-source-panel-header">
          <div>
            <h3
              id="source-files-heading"
              className="hover-help-label"
              title="Technical properties, embedded tags, and recognized metadata sidecars are inspected read-only; source files are never modified by inspection."
            >
              Source files
            </h3>
          </div>
          <div className="ingest-source-header-tools">
            <label className="ingest-source-sort-control">
              <span>Sort</span>
              <select
                value={sourceSort}
                onChange={(event) =>
                  setSourceSort(
                    event.target.value as IngestSourceSort,
                  )
                }
              >
                <option value="name">Name</option>
                <option value="type">Type</option>
                <option value="size-desc">Size · largest</option>
                <option value="size-asc">Size · smallest</option>
                <option value="duration-desc">Duration · longest</option>
              </select>
            </label>
            <div
              className="ingest-source-summary"
              aria-label="Candidate source summary"
            >
            <span>
              {candidate.kind === "folder"
                ? "Folder"
                : "Loose file"}
            </span>
            <span>{candidate.fileCount} files</span>
            <span>{candidate.audioCount} audio</span>
            <span>{candidate.imageCount} images</span>
            <span>{candidate.textCount} text</span>
            <span>
              {formatByteSize(candidate.totalSizeBytes)}
            </span>
            </div>
          </div>
        </header>

        {sourceAudioPreviewError && (
          <p className="message error ingest-source-preview-error">
            Audio preview: {sourceAudioPreviewError}
          </p>
        )}

        <div className="ingest-table-scroll">
          <table className="ingest-table ingest-source-table">
            <thead>
              <tr>
                <th
                  scope="col"
                  className="ingest-source-preview-column"
                >
                  Preview
                </th>
                <th
                  scope="col"
                  className="ingest-source-filename-column"
                >
                  Filename
                </th>
                <th scope="col" className="numeric">
                  Duration
                </th>
                <th scope="col" className="numeric">
                  Size
                </th>
                <th scope="col" className="action-column">
                  Details
                </th>
              </tr>
            </thead>
            {sortedSourceFiles.map((file) => {
              const expanded = expandedFiles.includes(
                file.relativePath,
              );

              return (
                <tbody key={file.relativePath}>
                  <tr>
                    <td className="ingest-source-preview-column">
                      <IngestSourcePreview
                        file={file}
                        audioSourcePath={sourceAudioPreviewPath}
                        audioPlaying={sourceAudioPreviewPlaying}
                        audioLoading={sourceAudioPreviewLoading}
                        onToggleAudio={toggleSourceAudioPreview}
                      />
                    </td>
                    <th
                      scope="row"
                      className="ingest-sticky-column ingest-source-filename-column"
                    >
                      <span className="ingest-source-filename-heading">
                        <strong>{file.filename}</strong>
                        <IngestFileFormatBadge file={file} />
                      </span>
                      <code>{file.relativePath}</code>
                      {file.warnings.length > 0 && (
                        <span className="ingest-row-warning">
                          {file.warnings.length}{" "}
                          {file.warnings.length === 1
                            ? "warning"
                            : "warnings"}
                        </span>
                      )}
                    </th>
                    <td className="numeric">
                      {(file.mediaKind === "audio" ||
                        file.mediaKind === "video") &&
                      file.technical.durationSeconds !==
                        undefined
                        ? formatDuration(
                            file.technical
                              .durationSeconds,
                          )
                        : "—"}
                    </td>
                    <td className="numeric">
                      {formatByteSize(file.sizeBytes)}
                    </td>
                    <td className="action-column">
                      <button
                        type="button"
                        aria-expanded={expanded}
                        onClick={() =>
                          toggleFile(file.relativePath)
                        }
                      >
                        {expanded
                          ? "Hide"
                          : "Details"}
                      </button>
                    </td>
                  </tr>

                  {expanded && (
                    <tr className="ingest-detail-row">
                      <td colSpan={5}>
                        <IngestFileInspectionDetail
                          file={file}
                        />
                      </td>
                    </tr>
                  )}
                </tbody>
              );
            })}
          </table>
        </div>
      </section>
    </section>
  );
}

function IngestEvidenceTable({
  evidence,
}: {
  evidence: IngestEvidence[];
}) {
  if (evidence.length === 0) {
    return (
      <p className="metadata-empty-value ingest-table-empty">
        No title or date patterns were inferred.
      </p>
    );
  }

  return (
    <div className="ingest-table-scroll">
      <table className="ingest-table ingest-evidence-table">
        <thead>
          <tr>
            <th scope="col">Metadata field</th>
            <th scope="col">Inferred value</th>
            <th scope="col">Evidence</th>
            <th scope="col">Inference confidence</th>
            <th scope="col">Rule</th>
          </tr>
        </thead>
        <tbody>
          {evidence.map((item, index) => (
            <tr
              key={`${item.field}:${item.rule}:${index}`}
            >
              <th
                scope="row"
                className="ingest-sticky-column"
              >
                {item.field}
              </th>
              <td>{String(item.value)}</td>
              <td>
                <span className="ingest-evidence-source">
                  {item.source}
                </span>
                <code>{item.rawValue}</code>
              </td>
              <td>{formatInferenceConfidence(item.confidence)}</td>
              <td>
                <code>{item.rule}</code>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IngestFileInspectionDetail({
  file,
}: {
  file: IngestFileInspection;
}) {
  const technicalEntries = Object.entries(
    file.technical,
  ).filter(([, value]) => value !== undefined);
  const embeddedEntries = Object.entries(
    file.embeddedMetadata,
  );

  return (
    <div className="ingest-file-detail">
      <div className="ingest-file-detail-columns">
        <section>
          <h4>Technical properties</h4>
          <table className="ingest-property-table">
            <tbody>
              <tr>
                <th scope="row">Type</th>
                <td>{file.mediaKind}</td>
              </tr>
              <tr>
                <th scope="row">Size</th>
                <td>{formatByteSize(file.sizeBytes)}</td>
              </tr>
              <tr>
                <th scope="row">Probe</th>
                <td>{file.detectedBy}</td>
              </tr>
              {technicalEntries.map(
                  ([key, value]) => (
                    <tr key={key}>
                      <th scope="row">{key}</th>
                      <td>
                        {formatIngestTechnicalValue(
                          key,
                          value,
                        )}
                      </td>
                    </tr>
                  ),
              )}
            </tbody>
          </table>
        </section>

        {file.metadataSidecar && (
          <section>
            <h4>Metadata sidecar</h4>
            <table className="ingest-property-table">
              <tbody>
                <tr>
                  <th scope="row">Format</th>
                  <td>FFmetadata</td>
                </tr>
                <tr>
                  <th scope="row">Audio hint</th>
                  <td>
                    {file.metadataSidecar.audioFilenameHint ?? "—"}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Paired audio</th>
                  <td>
                    {file.metadataSidecar.pairedAudioRelativePath ??
                      "No audio paired in this candidate"}
                  </td>
                </tr>
                <tr>
                  <th scope="row">Parsed entries</th>
                  <td>{file.metadataSidecar.entries.length}</td>
                </tr>
                <tr>
                  <th scope="row">Canonical suggestions</th>
                  <td>{file.metadataSidecar.suggestions.length}</td>
                </tr>
              </tbody>
            </table>
            {file.metadataSidecar.suggestions.length > 0 && (
              <table className="ingest-property-table">
                <thead>
                  <tr>
                    <th>Source tag</th>
                    <th>Suggested metadata field</th>
                    <th>Value</th>
                    <th>Review</th>
                  </tr>
                </thead>
                <tbody>
                  {file.metadataSidecar.suggestions.map((item, index) => (
                    <tr key={`${item.sourceKey}:${item.canonicalPath}:${index}`}>
                      <th scope="row">{item.sourceKey}</th>
                      <td><code>{item.canonicalPath}</code></td>
                      <td>{String(item.value)}</td>
                      <td>{item.reviewRequired ? "Review" : "Direct suggestion"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {file.metadataSidecar.unmappedKeys.length > 0 && (
              <p className="metadata-empty-value">
                Preserved but not mapped yet: {file.metadataSidecar.unmappedKeys.join(", ")}
              </p>
            )}
          </section>
        )}

        <section>
          <h4>Embedded metadata</h4>
          {embeddedEntries.length === 0 ? (
            <p className="metadata-empty-value">
              No embedded tags were reported.
            </p>
          ) : (
            <table className="ingest-property-table">
              <tbody>
                {embeddedEntries.map(
                  ([key, value]) => (
                    <tr key={key}>
                      <th scope="row">{key}</th>
                      <td>{value}</td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <section className="ingest-file-evidence">
        <h4>Source-path, filename, sidecar and embedded evidence</h4>
        <IngestEvidenceTable
          evidence={file.evidence}
        />
      </section>

      {file.warnings.length > 0 && (
        <ul className="ingest-warning-list">
          {file.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatInferenceConfidence(
  confidence: IngestEvidence["confidence"],
): string {
  return (
    confidence.charAt(0).toUpperCase() +
    confidence.slice(1)
  );
}

function formatIngestTechnicalValue(
  key: string,
  value: string | number,
): string {
  if (
    key === "durationSeconds" &&
    typeof value === "number"
  ) {
    return formatDuration(value);
  }

  if (
    key === "sampleRateHz" &&
    typeof value === "number"
  ) {
    return `${value.toLocaleString()} Hz`;
  }

  if (
    key === "bitRate" &&
    typeof value === "number"
  ) {
    return `${Math.round(value / 1000)} kb/s`;
  }

  if (
    (key === "width" || key === "height") &&
    typeof value === "number"
  ) {
    return `${value} px`;
  }

  if (
    key === "frameRate" &&
    typeof value === "number"
  ) {
    return `${value.toLocaleString(undefined, {
      maximumFractionDigits: 3,
    })} fps`;
  }

  return String(value);
}

type LibraryEntityView = "releases" | "artists";

export {
  IngestView,
  IngestCandidateTable,
  buildIngestArtworkPreviewUrl,
  IngestSourcePreview,
  type IngestFileFormatStatus,
  ingestFileFormatStatus,
  IngestFileFormatBadge,
  type IngestSourceSort,
  ingestMediaKindOrder,
  ingestSourceDuration,
  sortIngestSourceFiles,
  IngestCandidateInspectionView,
  IngestEvidenceTable,
  IngestFileInspectionDetail,
  formatInferenceConfidence,
  formatIngestTechnicalValue,
  type LibraryEntityView,
};
