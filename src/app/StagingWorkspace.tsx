import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { PersistentLibraryPlaybackController } from "../PersistentLibraryPlayer.js";
import { defaultTrackOverviewFieldPaths } from "../default-track-overview-fields.js";
import {
  selectPreferredReleaseArtwork,
  selectReleaseFrontArtwork,
} from "../artwork-gallery.js";
import {
  buildMetadataReadiness,
  readinessBadgeLabel,
  readinessTone,
  summarizeReleaseScanReadiness,
  type RequiredFieldIssue,
} from "../metadata-readiness.js";
import type { IngestCandidateInspection } from "../../shared/ingest-types.js";
import type { IngestDraftIdentitySeed } from "../../shared/ingest-drafts.js";
import type {
  ArtistScanResult,
  MetadataEditorFocusTarget,
  MetadataFieldDefinition,
  ReleaseMetadataDetail,
  ReleaseScanResult,
  ToastMessage,
} from "./types.js";
import {
  LazyIngestReleaseBuilder,
  StagingLibraryBuildWorkspace,
} from "./foundation.js";
import {
  type LibraryReleaseSortMode,
  sortLibraryReleases,
} from "./library-views.js";
import {
  MediaFileSpecBadge,
  type StagingCompletionReminder,
} from "./technical-audit.js";
import {
  artworkPreviewUrl,
} from "./library-panels.js";
import {
  formatReleaseTitle,
} from "./release-display.js";

const STAGING_COMPLETION_VISIBLE_LIMIT = 5;

function sortStagingCompletionReminders(
  reminders: StagingCompletionReminder[],
): StagingCompletionReminder[] {
  return [...reminders].sort((left, right) => {
    return left.priority - right.priority ||
      left.label.localeCompare(
        right.label,
        undefined,
        { sensitivity: "base" },
      );
  });
}

const stagingReleaseCompletionFieldPaths = [
  "release.description",
  "release.genres",
] as const;

function readStagingReminderPathValue(
  parsed: Record<string, unknown>,
  path: string,
): unknown {
  let current: unknown = parsed;

  for (const segment of path.split(".")) {
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

function hasStagingReminderValue(
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

function stagingReminderFieldLabel(
  fields: readonly MetadataFieldDefinition[],
  tomlPath: string,
  fallback: string,
): string {
  return (
    fields.find(
      (field) => field.tomlPath === tomlPath,
    )?.label ?? fallback
  );
}

function buildStagingCompletionReminders({
  release,
  artist,
  detail,
  metadataRegistry,
}: {
  release: ReleaseScanResult;
  artist: ArtistScanResult | null;
  detail: ReleaseMetadataDetail | null;
  metadataRegistry: readonly MetadataFieldDefinition[];
}): StagingCompletionReminder[] {
  const reminders: StagingCompletionReminder[] = [];

  if (release.artworkMasters.length === 0) {
    reminders.push({
      key: "asset:release-artwork",
      label: "Album art",
      title: "Album art is missing. Open the release Artwork editor.",
      priority: 10,
      tone: "asset",
      target: {
        kind: "metadata",
        focus: {
          scopeId: "release",
          tab: "artwork",
        },
      },
    });
  }

  if (artist) {
    if (!artist.bio?.trim()) {
      reminders.push({
        key: "asset:artist-bio",
        label: "Artist bio",
        title: `Artist bio is missing for ${artist.displayName}. Open the Artist workspace.`,
        priority: 11,
        tone: "asset",
        target: {
          kind: "artist",
          artistId: artist.id,
        },
      });
    }

    const existingArtistPhotos =
      artist.assets.filter(
        (asset) => asset.exists,
      );

    if (!artist.primaryAssetId) {
      reminders.push({
        key: "asset:artist-photo",
        label:
          existingArtistPhotos.length > 0
            ? "Primary artist photo"
            : "Artist photo",
        title:
          existingArtistPhotos.length > 0
            ? `Choose a Primary Artist photo for ${artist.displayName}.`
            : `Artist photo is missing for ${artist.displayName}.`,
        priority: 12,
        tone: "asset",
        target: {
          kind: "artist",
          artistId: artist.id,
        },
      });
    }
  }

  if (!detail) {
    return sortStagingCompletionReminders(
      reminders,
    );
  }

  const releaseDocument =
    detail.documents.find(
      (document) =>
        document.scope === "release" &&
        document.filename === "release.toml",
    ) ?? null;

  if (releaseDocument) {
    for (const path of stagingReleaseCompletionFieldPaths) {
      if (
        hasStagingReminderValue(
          readStagingReminderPathValue(
            releaseDocument.parsed,
            path,
          ),
        )
      ) {
        continue;
      }

      const fallback =
        path === "release.description"
          ? "Release description"
          : "Genres";
      const label = stagingReminderFieldLabel(
        metadataRegistry,
        path,
        fallback,
      );

      reminders.push({
        key: `metadata:${path}`,
        label,
        title: `Add ${label} in release metadata.`,
        priority: 20,
        tone: "metadata",
        target: {
          kind: "metadata",
          focus: {
            scopeId: "release",
            tab: "overview",
            tomlPath: path,
          },
        },
      });
    }
  }

  for (const path of defaultTrackOverviewFieldPaths) {
    const missingTrackIds = release.tracks
      .filter((track) => {
        const document =
          detail.documents.find(
            (candidate) =>
              candidate.scope === "track" &&
              candidate.trackId === track.id &&
              candidate.filename === "track.toml",
          );

        return Boolean(
          document &&
            !hasStagingReminderValue(
              readStagingReminderPathValue(
                document.parsed,
                path,
              ),
            ),
        );
      })
      .map((track) => track.id);

    if (missingTrackIds.length === 0) {
      continue;
    }

    const fallbackLabels: Record<string, string> = {
      "track.audio.bpm": "BPM",
      "track.audio.key": "Key",
      "track.audio.camelot_key": "Camelot Key",
      "track.audio.time_signature": "Time Signature",
      "track.audio.tuning_hz": "Tuning Reference",
    };
    const compactLabels: Record<string, string> = {
      "track.audio.time_signature": "Time Sig",
      "track.audio.tuning_hz": "Tuning",
    };
    const fullLabel = stagingReminderFieldLabel(
      metadataRegistry,
      path,
      fallbackLabels[path] ?? path,
    );
    const compactLabel =
      compactLabels[path] ?? fullLabel;

    reminders.push({
      key: `metadata:${path}`,
      label:
        missingTrackIds.length > 1
          ? `${compactLabel} ×${missingTrackIds.length}`
          : compactLabel,
      title:
        missingTrackIds.length > 1
          ? `${fullLabel} is missing on ${missingTrackIds.length} tracks. Open the first missing track field.`
          : `${fullLabel} is missing. Open the track field.`,
      priority: 30,
      tone: "metadata",
      target: {
        kind: "metadata",
        focus: {
          scopeId: missingTrackIds[0],
          tab: "overview",
          tomlPath: path,
        },
      },
    });
  }

  if (metadataRegistry.length > 0) {
    const readiness = buildMetadataReadiness({
      release,
      documents: detail.documents,
      fields: metadataRegistry,
    });

    const alreadyRepresentedPaths = new Set(
      reminders.flatMap((reminder) => {
        if (
          reminder.target.kind !== "metadata" ||
          !reminder.target.focus.tomlPath
        ) {
          return [];
        }

        return [reminder.target.focus.tomlPath];
      }),
    );

    const groupedRequired = new Map<
      string,
      {
        field: RequiredFieldIssue;
        scopeId: string;
        count: number;
      }
    >();

    for (const scope of readiness.scopes) {
      for (const field of scope.missingRequiredFields) {
        if (alreadyRepresentedPaths.has(field.tomlPath)) {
          continue;
        }

        const current = groupedRequired.get(
          field.tomlPath,
        );

        if (current) {
          current.count += 1;
          continue;
        }

        groupedRequired.set(field.tomlPath, {
          field,
          scopeId: scope.id,
          count: 1,
        });
      }
    }

    for (const {
      field,
      scopeId,
      count,
    } of groupedRequired.values()) {
      reminders.push({
        key: `required:${field.tomlPath}`,
        label:
          count > 1
            ? `${field.label} ×${count}`
            : field.label,
        title:
          count > 1
            ? `${field.label} is required and missing in ${count} scopes. Open the first missing field.`
            : `${field.label} is required and missing.`,
        priority: 25,
        tone: "metadata",
        target: {
          kind: "metadata",
          focus: {
            scopeId,
            tab: field.tab,
            tomlPath: field.tomlPath,
          },
        },
      });
    }
  }

  return sortStagingCompletionReminders(
    reminders,
  );
}

function StagingWorkspace({
  inspection,
  identitySeed,
  releases,
  artists,
  metadataRegistry,
  inspectionError,
  inputsRefreshing,
  onRefreshInputs,
  onChooseCandidate,
  onBackToInspection,
  onEditReleaseMetadata,
  onEditMetadataTarget,
  onOpenArtist,
  onOpenRelease,
  onLibraryChanged,
  onReleaseCreated,
  onNotify,
  playback,
}: {
  inspection: IngestCandidateInspection | null;
  identitySeed: IngestDraftIdentitySeed | null;
  releases: ReleaseScanResult[];
  artists: ArtistScanResult[];
  metadataRegistry: MetadataFieldDefinition[];
  inspectionError: string | null;
  inputsRefreshing: boolean;
  onRefreshInputs: () => void;
  onChooseCandidate: () => void;
  onBackToInspection: () => void;
  onEditReleaseMetadata: (releaseId: string) => void;
  onEditMetadataTarget: (
    releaseId: string,
    target: MetadataEditorFocusTarget,
  ) => void;
  onOpenArtist: (artistId: string) => void;
  onOpenRelease: (releaseId: string) => void;
  onLibraryChanged: () => void | Promise<void>;
  onReleaseCreated: (
    releaseId: string,
  ) => void | Promise<void>;
  onNotify: (
    message: string,
    tone?: ToastMessage["tone"],
  ) => void;
  playback: PersistentLibraryPlaybackController;
}) {
  const [sortMode, setSortMode] =
    useState<LibraryReleaseSortMode>("date-desc");
  const sortedReleases = useMemo(
    () => sortLibraryReleases(releases, sortMode),
    [releases, sortMode],
  );
  const [
    reminderDetailsByReleaseId,
    setReminderDetailsByReleaseId,
  ] = useState<Record<string, ReleaseMetadataDetail>>({});
  const [
    reminderDetailsLoading,
    setReminderDetailsLoading,
  ] = useState(false);

  useEffect(() => {
    if (releases.length === 0) {
      setReminderDetailsByReleaseId({});
      setReminderDetailsLoading(false);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    setReminderDetailsLoading(true);

    void Promise.all(
      releases.map(async (release) => {
        try {
          const query = new URLSearchParams({
            release: release.id,
          });
          const response = await fetch(
            `/api/library/release-detail?${query.toString()}`,
            {
              signal: controller.signal,
            },
          );

          if (!response.ok) {
            return null;
          }

          const detail =
            (await response.json()) as ReleaseMetadataDetail;

          return [release.id, detail] as const;
        } catch {
          return null;
        }
      }),
    ).then((entries) => {
      if (cancelled) {
        return;
      }

      setReminderDetailsByReleaseId(
        Object.fromEntries(
          entries.filter(
            (
              entry,
            ): entry is readonly [
              string,
              ReleaseMetadataDetail,
            ] => entry !== null,
          ),
        ),
      );
      setReminderDetailsLoading(false);
    });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [releases]);

  const [selectedBuildReleaseId, setSelectedBuildReleaseId] =
    useState<string | null>(null);
  const selectedBuildRelease =
    selectedBuildReleaseId
      ? releases.find(
          (release) =>
            release.id === selectedBuildReleaseId,
        ) ?? null
      : null;

  if (inspection) {
    return (
      <Suspense
        fallback={
          <section
            className="workflow-workspace"
            aria-live="polite"
          >
            <p>Loading staging workspace…</p>
          </section>
        }
      >
        <LazyIngestReleaseBuilder
          inspection={inspection}
          identitySeed={identitySeed}
          onCancel={onBackToInspection}
          onReleaseCreated={onReleaseCreated}
          onNotify={onNotify}
          playback={playback}
        />
      </Suspense>
    );
  }

  if (selectedBuildRelease) {
    return (
      <Suspense
        fallback={<p className="message">Loading Staging build workspace…</p>}
      >
        <StagingLibraryBuildWorkspace
          release={selectedBuildRelease}
          onBack={() => setSelectedBuildReleaseId(null)}
          onEditMetadata={() =>
            onEditReleaseMetadata(selectedBuildRelease.id)
          }
          onOpenLibrary={() =>
            onOpenRelease(selectedBuildRelease.id)
          }
          onLibraryChanged={onLibraryChanged}
          onNotify={onNotify}
        />
      </Suspense>
    );
  }

  function openStagingCompletionReminder(
    releaseId: string,
    reminder: StagingCompletionReminder,
  ) {
    if (reminder.target.kind === "metadata") {
      onEditMetadataTarget(
        releaseId,
        reminder.target.focus,
      );
      return;
    }

    onOpenArtist(
      reminder.target.artistId,
    );
  }

  return (
    <section className="workflow-workspace staging-workspace">
      <header className="workflow-workspace-header">
        <div>
          <p className="eyebrow">Step 2 · Staging</p>
          <h2>Build or update a release workspace</h2>
          <p>
            Staging turns one inspected ingest candidate
            into a reviewed release plan. Select a source
            candidate in Ingest before configuring track
            order, destinations, and create/update actions.
          </p>
        </div>

        <div className="workflow-workspace-actions">
          <button
            type="button"
            disabled={inputsRefreshing}
            onClick={onRefreshInputs}
            title="Rescan both the ingest drop and canonical Library inputs used by Staging."
          >
            {inputsRefreshing ? "Refreshing…" : "Refresh inputs"}
          </button>
        </div>
      </header>

      <div className="workflow-workspace-notice staging-ingest-candidate-notice">
        <div className="staging-ingest-candidate-copy">
          <strong>No Ingest candidate selected</strong>
          <span>
            Choose an Ingest candidate for release-content changes.
            Existing Library releases can be opened directly below
            for derivative-only Build and waveform repair.
          </span>
        </div>
        <button
          type="button"
          className="primary-button"
          onClick={onChooseCandidate}
        >
          Choose ingest candidate
        </button>
      </div>

      {inspectionError && (
        <p className="message error">
          {inspectionError}
        </p>
      )}

      <section className="workflow-table-panel">
        <header>
          <div>
            <h3>Existing release workspaces</h3>
            <p>
              Open Build to inspect or repair Library waveforms from
              existing canonical masters without a new Ingest candidate.
              Use Ingest when the release content itself is changing.
            </p>
          </div>
          <div className="workflow-release-table-controls">
            <label className="workspace-release-sort-control">
              <span>Sort by</span>
              <select
                value={sortMode}
                onChange={(event) =>
                  setSortMode(
                    event.target.value as LibraryReleaseSortMode,
                  )
                }
              >
                <option value="date-desc">Release date · newest</option>
                <option value="date-asc">Release date · oldest</option>
                <option value="title">Title · A–Z</option>
                <option value="artist">Artist · A–Z</option>
                <option value="library">Library order</option>
              </select>
            </label>
            <strong>{releases.length} releases</strong>
          </div>
        </header>

        <div className="workflow-table-scroll staging-release-table-scroll">
          <table className="workflow-workspace-table staging-release-table">
            <thead>
              <tr>
                <th scope="col" className="staging-artwork-column">Artwork</th>
                <th scope="col">Release</th>
                <th scope="col" className="staging-bubbles-column">Bubbles</th>
                <th scope="col" className="numeric">Tracks</th>
                <th scope="col" className="numeric">Audio masters</th>
                <th scope="col" className="numeric">Videos</th>
                <th scope="col">Metadata</th>
                <th scope="col">Update mode</th>
              </tr>
            </thead>
            <tbody>
              {releases.length === 0 ? (
                <tr>
                  <td colSpan={8} className="workflow-empty-cell">
                    No staged release workspaces were found in the configured library root.
                  </td>
                </tr>
              ) : (
                sortedReleases.map((release) => {
                  const readiness =
                    summarizeReleaseScanReadiness(release);
                  const metadataReadinessTone =
                    readinessTone(readiness);
                  const metadataReadinessLabel =
                    readinessBadgeLabel(readiness);
                  const metadataReadinessIcon =
                    metadataReadinessTone === "complete"
                      ? "✓"
                      : metadataReadinessTone === "missing"
                        ? "×"
                        : "!";
                  const masterCount = release.tracks.reduce(
                    (count, track) =>
                      count + track.audioMasters.length,
                    0,
                  );
                  const releaseArtwork =
                    selectReleaseFrontArtwork(
                      release.artworkMasters,
                    ) ??
                    selectPreferredReleaseArtwork(
                      release.artworkMasters,
                    );
                  const releaseArtist =
                    artists.find(
                      (artist) =>
                        artist.id ===
                          release.primaryArtistId ||
                        (
                          release.primaryArtistName &&
                          artist.displayName ===
                            release.primaryArtistName
                        ),
                    ) ?? null;
                  const reminderDetail =
                    reminderDetailsByReleaseId[
                      release.id
                    ] ?? null;
                  const completionReminders =
                    buildStagingCompletionReminders({
                      release,
                      artist: releaseArtist,
                      detail: reminderDetail,
                      metadataRegistry,
                    });
                  const visibleCompletionReminders =
                    completionReminders.slice(
                      0,
                      STAGING_COMPLETION_VISIBLE_LIMIT,
                    );
                  const hiddenCompletionReminders =
                    completionReminders.slice(
                      STAGING_COMPLETION_VISIBLE_LIMIT,
                    );

                  return (
                    <tr
                      key={release.id}
                      className="staging-release-row staging-release-row--clickable"
                      tabIndex={0}
                      aria-label={`Open Build for ${
                        release.releaseTitle ??
                        formatReleaseTitle(release.id)
                      }`}
                      title="Open Build"
                      onClick={() =>
                        setSelectedBuildReleaseId(release.id)
                      }
                      onKeyDown={(event) => {
                        if (
                          event.key === "Enter" ||
                          event.key === " "
                        ) {
                          event.preventDefault();
                          setSelectedBuildReleaseId(release.id);
                        }
                      }}
                    >
                      <td className="staging-release-artwork-cell">
                        <span
                          className="staging-release-artwork"
                          aria-hidden="true"
                        >
                          {releaseArtwork ? (
                            <img
                              src={artworkPreviewUrl(
                                releaseArtwork.relativePath,
                              )}
                              alt=""
                              loading="lazy"
                            />
                          ) : (
                            <span className="staging-release-artwork-placeholder">
                              No art
                            </span>
                          )}
                        </span>
                      </td>
                      <th scope="row">
                        <span
                          className="staging-release-identity"
                          title={`Library path: ${release.relativePath}`}
                        >
                          <strong>
                            {release.releaseTitle ??
                              formatReleaseTitle(release.id)}
                          </strong>
                          {release.primaryArtistName && (
                            <small>{release.primaryArtistName}</small>
                          )}
                          <MediaFileSpecBadge release={release} />
                        </span>
                      </th>
                      <td className="staging-release-reminders-cell">
                        <div
                          className="staging-completion-bubbles"
                          aria-label={`Completion reminders for ${
                            release.releaseTitle ??
                            formatReleaseTitle(release.id)
                          }`}
                        >
                          {visibleCompletionReminders.map(
                            (reminder) => (
                              <button
                                key={reminder.key}
                                type="button"
                                className={`staging-completion-bubble is-${reminder.tone}`}
                                data-reminder-key={reminder.key}
                                title={reminder.title}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openStagingCompletionReminder(
                                    release.id,
                                    reminder,
                                  );
                                }}
                                onKeyDown={(event) => {
                                  event.stopPropagation();
                                }}
                              >
                                {reminder.label}
                              </button>
                            ),
                          )}

                          {hiddenCompletionReminders.length > 0 ? (
                            <details
                              className="staging-completion-overflow"
                              onClick={(event) => {
                                event.stopPropagation();
                              }}
                              onDoubleClick={(event) => {
                                event.stopPropagation();
                              }}
                            >
                              <summary
                                aria-label={`${hiddenCompletionReminders.length} more completion reminders`}
                                title={`${hiddenCompletionReminders.length} more completion reminders`}
                              >
                                +{hiddenCompletionReminders.length}
                              </summary>

                              <div
                                className="staging-completion-overflow-popover"
                                role="group"
                                aria-label="More completion reminders"
                              >
                                {hiddenCompletionReminders.map(
                                  (reminder) => (
                                    <button
                                      key={reminder.key}
                                      type="button"
                                      className={`staging-completion-overflow-item is-${reminder.tone}`}
                                      data-reminder-key={reminder.key}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        openStagingCompletionReminder(
                                          release.id,
                                          reminder,
                                        );
                                      }}
                                    >
                                      <strong>
                                        {reminder.label}
                                      </strong>
                                      <small>
                                        {reminder.title}
                                      </small>
                                    </button>
                                  ),
                                )}
                              </div>
                            </details>
                          ) : null}

                          {!reminderDetail &&
                          reminderDetailsLoading ? (
                            <span
                              className="staging-completion-bubble-status"
                              title="Loading metadata completion reminders"
                              aria-label="Loading metadata completion reminders"
                            >
                              …
                            </span>
                          ) : completionReminders.length === 0 ? (
                            <span
                              className="staging-completion-bubble-status is-complete"
                              title="No current completion reminders"
                              aria-label="No current completion reminders"
                            >
                              ✓
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="numeric">{release.tracks.length}</td>
                      <td className="numeric">{masterCount}</td>
                      <td className="numeric">{release.videos.length}</td>
                      <td>
                        <span
                          className={`badge staging-metadata-readiness-icon ${metadataReadinessTone}`}
                          title={metadataReadinessLabel}
                          aria-label={`Metadata readiness: ${metadataReadinessLabel}`}
                        >
                          {metadataReadinessIcon}
                        </span>
                      </td>
                      <td>
                        <span
                          className="badge preview staging-update-mode"
                          title="Guarded update: preserve authored files and omitted existing tracks/videos; apply only reviewed additions, replacements, and validated numbering changes."
                        >
                          Guarded
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  );
}

export {
  STAGING_COMPLETION_VISIBLE_LIMIT,
  sortStagingCompletionReminders,
  stagingReleaseCompletionFieldPaths,
  readStagingReminderPathValue,
  hasStagingReminderValue,
  stagingReminderFieldLabel,
  buildStagingCompletionReminders,
  StagingWorkspace,
};
