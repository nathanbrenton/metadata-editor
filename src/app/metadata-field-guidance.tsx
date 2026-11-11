import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { FlattenedMetadataRow } from "../metadata-flattener.js";
import type { MetadataActivityEntry } from "../activity-log.js";
import { prioritizeReleaseArtistDisplay } from "../performer-display-order.js";
import {
  applyTrackRangeSelection,
  getInclusiveTrackRange,
  type PerformerCopyTrackRangeMode,
} from "../performer-copy-track-selection.js";
import { resolveProductionContextGroup } from "../../shared/production-context.js";
import { unmappedMetadataGroup } from "../metadata-presentation.js";
import {
  getPatternMetadataHelpCommonValues,
  productionTypeCommonValues,
} from "../metadata-help-common-values.js";
import {
  summarizeMissingMetadataDocuments,
  type MetadataReadinessScope,
  type MissingMetadataDocument,
  type RequiredFieldIssue,
} from "../metadata-readiness.js";
import {
  MetadataCompatibilityNotes,
} from "./metadata-value-cells.js";
import type {
  MetadataFieldDefinition,
  ReadinessNavigationTarget,
} from "./types.js";
import {
  type PerformerCopyExecutionTarget,
  type PerformerCopyResponse,
  type PerformerCopySource,
  type PerformerCopyTrackOption,
  type PerformerRecordDraft,
  buildMetadataAliasGroups,
  contributorRoleGroups,
} from "./metadata-records.js";

function MetadataFieldLabel({
  label,
  path,
}: {
  label: string | undefined;
  path: string;
}) {
  /*
   * Friendly registry labels remain unchanged. Canonical path labels
   * use a dim namespace and a brighter final field name.
   */
  if (label && label !== path) {
    return <>{label}</>;
  }

  const lastDotIndex = path.lastIndexOf(
    ".",
  );

  if (lastDotIndex < 0) {
    return (
      <span className="metadata-path-leaf">
        {path}
      </span>
    );
  }

  return (
    <span className="metadata-path-label">
      <span className="metadata-path-namespace">
        {path.slice(0, lastDotIndex + 1)}
      </span>
      <span className="metadata-path-leaf">
        {path.slice(lastDotIndex + 1)}
      </span>
    </span>
  );
}

function isTrackDiscNumberingPath(
  path: string,
): boolean {
  /*
   * Canonical paths live below release.numbering or track.numbering.
   * The leaf-name fallback also keeps common imported/legacy spellings
   * together instead of scattering them into identity or advanced groups.
   */
  return (
    path ===
      "track.identifiers.discogs_track_position" ||
    /^(release|track)\.numbering\.(track_number|track_total|disc_number|disc_total|disk_number|disk_total)$/.test(
      path,
    ) ||
    /^(release|track)\.(track_number|track_total|total_tracks|disc_number|disc_total|total_discs|disk_number|disk_total|total_disks)$/.test(
      path,
    ) ||
    /(^|\.)(track_number|track_total|total_tracks|disc_number|disc_total|total_discs|disk_number|disk_total|total_disks)$/.test(
      path,
    )
  );
}

function isRelatedMetadataTagPath(
  path: string,
): boolean {
  const normalizedPath =
    path.replace(/\[\d+\]/g, "[]");

  if (
    normalizedPath ===
      "release.primary_artist.sort_name" ||
    normalizedPath === "track.sort_title"
  ) {
    return false;
  }

  return (
    normalizedPath ===
      "track.identifiers.discogs_track_position" ||
    /^track\.album_artists\[\]\.(name|sort_name)$/.test(
      normalizedPath,
    ) ||
    /^(track\.classification\.(instrumental|cover|live|remix|remaster))$/.test(
      normalizedPath,
    ) ||
    /^track\.(?:audio\.)?(?:tempo|initial_key|musical_key)$/.test(
      normalizedPath,
    ) ||
    normalizedPath ===
      "release.identifiers.barcode" ||
    /(^|\.)(discogs|musicbrainz|acoustid|spotify|apple_music|itunes|amazon|bandcamp|beatport|tidal|youtube|deezer)(_|\.|$)/i.test(
      normalizedPath,
    ) ||
    /(^|\.)(legacy|imported|provider|external|vendor|compatibility|alias|aliases|original_tag|source_tag)(_|\.|$)/i.test(
      normalizedPath,
    ) ||
    /(^|\.)(sort_name|sort_title|sort_album|sort_artist)$/.test(
      normalizedPath,
    ) ||
    /(^|\.)(probe|ffprobe|mediainfo|derived|detected)(_|\.|$)/i.test(
      normalizedPath,
    ) ||
    /(^|\.)(codec_tag|container_tag|id3|vorbis|riff|mp4)(_|\.|$)/i.test(
      normalizedPath,
    )
  );
}

function resolveMetadataRowGroup(
  rows: FlattenedMetadataRow[],
  row: FlattenedMetadataRow,
  field:
    | MetadataFieldDefinition
    | undefined,
): string {
  const releaseContributorMatch =
    row.path.match(
      /^(release\.credits\.contributors\[\d+\])\./,
    );

  if (releaseContributorMatch) {
    const roleRow = rows.find(
      (candidate) =>
        candidate.path ===
        `${releaseContributorMatch[1]}.role`,
    );

    if (
      roleRow &&
      typeof roleRow.value === "string"
    ) {
      const matchedCreativeGroup =
        contributorRoleGroups.find(
          ({ pattern, group }) =>
            [
              "Arrangement & Orchestration",
              "Conducting & Musical Direction",
            ].includes(group) &&
            pattern.test(roleRow.value as string),
        );

      if (matchedCreativeGroup) {
        return matchedCreativeGroup.group;
      }
    }

    return "Artists";
  }

  const contributorMatch = row.path.match(
    /^(track\.contributors\[\d+\])\./,
  );

  if (contributorMatch) {
    const roleRow = rows.find(
      (candidate) =>
        candidate.path ===
        `${contributorMatch[1]}.role`,
    );

    if (
      roleRow &&
      typeof roleRow.value === "string"
    ) {
      const roleValue = roleRow.value;

      const matchedGroup =
        contributorRoleGroups.find(
          ({ pattern }) =>
            pattern.test(roleValue),
        );

      if (matchedGroup) {
        return matchedGroup.group;
      }
    }

    return "Production";
  }

  const path = row.path;

  /*
   * Artwork entries are arrays-of-tables, so their paths commonly
   * contain indexes such as release.artwork[0].role.
   *
   * Keep local file/path fields under Files and Sources, while the
   * descriptive and structural artwork metadata belongs to Artwork.
   */
  const isArtworkPath =
    /^(release|track)\.artwork(?:\[\d+\])?(?:\.|$)/.test(
      path,
    ) ||
    /^production\.artwork(?:\[\d+\])?(?:\.|$)/.test(
      path,
    );

  if (isArtworkPath) {
    const artworkLeaf =
      path.split(".").at(-1) ?? "";

    const isArtworkFileReference =
      /^(file|filename|path|relative_path|absolute_path|directory|source|source_file|master_path|web_path|embedded_path|local_path|uri|url)$/.test(
        artworkLeaf,
      ) ||
      /(?:^|_)(file|filename|path|directory|source_path)$/.test(
        artworkLeaf,
      );

    return isArtworkFileReference
      ? "Files and Sources"
      : "Artwork";
  }

  /*
   * Also recognize artwork-related records nested below assets.
   * Path-like leaves remain under Files and Sources.
   */
  if (
    /^(release|track)\.assets\.(artwork|cover|front_cover|back_cover|booklet|disc_artwork|thumbnail)(?:\[\d+\])?(?:\.|$)/.test(
      path,
    )
  ) {
    const artworkLeaf =
      path.split(".").at(-1) ?? "";

    return /^(file|filename|path|relative_path|directory|source|source_file|local_path|uri|url)$/.test(
      artworkLeaf,
    )
      ? "Files and Sources"
      : "Artwork";
  }

  /*
   * Keep sort fields beside the names or titles they support.
   * These checks intentionally run before registry fallbacks.
   */
  if (
    /^(release|track)\.(primary_artist|album_artists|featured_artists|remixers)(\[|\.|$)/.test(
      path,
    ) ||
    /^release\.(album_artists|credits\.featured_artists|credits\.remixers)(\[|\.|$)/.test(
      path,
    )
  ) {
    return "Artists";
  }

  if (
    /^(track\.performers|release\.credits\.performers)(\[|\.|$)/.test(
      path,
    )
  ) {
    return "Performers";
  }

  if (
    /^(track\.(arrangers|orchestrators)|release\.credits\.arrangers)(\[|\.|$)/.test(
      path,
    )
  ) {
    return "Arrangement & Orchestration";
  }

  if (
    /^(track\.conductors|release\.credits\.conductors)(\[|\.|$)/.test(
      path,
    )
  ) {
    return "Conducting & Musical Direction";
  }

  if (
    /^(track\.(composers|lyricists|songwriters)|release\.credits\.(composers|lyricists|songwriters))(\[|\.|$)/.test(
      path,
    )
  ) {
    return "Songwriting & Composition";
  }

  if (/^track\.samples(\[|\.|$)/.test(path)) {
    return "Samples & Interpolations";
  }

  if (/^track\.sample_clearances(\[|\.|$)/.test(path)) {
    return "Sample Clearance";
  }

  if (
    /^track\.(language|script)(\.|$)/.test(
      path,
    ) ||
    /^release\.(language|script)(\.|$)/.test(
      path,
    ) ||
    /^track\.text\.(lyrics_language|lyrics_script)(\.|$)/.test(
      path,
    )
  ) {
    return "Language & Writing System";
  }

  if (
    /^track\.text\.(lyrics|synchronized_lyrics|unsynchronized_lyrics|translation)(\.|$)/.test(
      path,
    )
  ) {
    return "Lyrics";
  }

  if (
    /^track\.text\.(lyrics_copyright|lyrics_source)(\.|$)/.test(
      path,
    )
  ) {
    return "Lyrics Rights & Source";
  }

  if (
    /^release\.identifiers\.(upc|ean|barcode)$/.test(
      path,
    ) ||
    /^track\.identifiers\.(isrc|iswc)$/.test(
      path,
    )
  ) {
    return "Music Business & Rights";
  }

  if (
    /^(release|track)\.(title|subtitle|display_title|version|type|status|explicit)(\.|$)/.test(
      path,
    ) ||
    /^release\.(genres|identifiers\.(release_genres|release_moods|release_styles|release_tags))(\.|$)/.test(
      path,
    ) ||
    /^track\.(classification|sort_title)(\.|$)/.test(
      path,
    )
  ) {
    return "Release & Track Identity";
  }

  if (
    /^(release|track)\.id(\.|$)/.test(
      path,
    ) ||
    /^(schema|release_reference|track_reference|settings)(\.|$)/.test(
      path,
    ) ||
    /\.(missing_file_policy)$/.test(
      path,
    )
  ) {
    return "Developer / Advanced";
  }

  if (
    /^release\.(label|distributor|rights)(\.|$)/.test(
      path,
    ) ||
    /^track\.(publishers|publishing|rights)(\[|\.|$)/.test(
      path,
    )
  ) {
    return "Music Business & Rights";
  }

  if (
    /^(release|track)\.dates(\.|$)/.test(
      path,
    )
  ) {
    return "Dates";
  }

  if (
    /^(release|track)\.numbering(\.|$)/.test(
      path,
    ) ||
    isTrackDiscNumberingPath(path)
  ) {
    return "Track & Disc Numbering";
  }

  if (
    /^track\.movement(\.|$)/.test(
      path,
    )
  ) {
    return "Movement & Work";
  }

  /*
   * Artwork classification must run before generic identity,
   * identifier, and file/source rules. Artwork fields may occur
   * beneath artwork, assets, identifiers, or production paths.
   */
  if (
    /(^|\.)(artwork|artwork_master|cover|cover_art|cover_artwork|front_cover|back_cover|embedded_artwork|image|thumbnail)(\.|$)/.test(
      path,
    ) ||
    /^(release|track)\.assets\.(front|back|cover|artwork|image|thumbnail)(\.|$)/.test(
      path,
    ) ||
    /^production\.artwork(\.|$)/.test(
      path,
    )
  ) {
    return "Artwork";
  }

  if (
    /^(release|track)\.identifiers(\.|$)/.test(
      path,
    ) ||
    /\.(isrc|iswc|isni|ipi_name_number|ipi_base_number|musicbrainz_[a-z_]+|discogs_[a-z_]+|acoustid|spotify_[a-z_]+|barcode|ean|upc|catalog_number)$/.test(
      path,
    )
  ) {
    return "Identifiers";
  }

  if (
    /^track\.text(\.|$)/.test(path) ||
    /^release\.text(\.|$)/.test(path) ||
    /\.(comment|description|notes|liner_notes|website)$/.test(
      path,
    )
  ) {
    return "Text and Notes";
  }

  if (
    /^track\.(?:audio\.)?(?:bpm|tempo|key|initial_key|musical_key|camelot_key|time_signature|tuning_hz)(?:\.|$)/.test(
      path,
    )
  ) {
    return "Musical Analysis";
  }

  if (
    /^track\.audio(\.|$)/.test(path) ||
    /\.(sample_rate|bit_depth|channels|channel_layout|codec|duration)(\.|$)/.test(
      path,
    )
  ) {
    return "Technical Audio";
  }

  if (
    /^(release|track)\.(assets|track_sources|settings_source|credit_sources|production_note_sources)(\.|$)/.test(
      path,
    ) ||
    /^production\.(archive|project)(\.|$)/.test(
      path,
    ) ||
    /\.(file|session_file|directory|master_path|web_path|embedded_path)$/.test(
      path,
    )
  ) {
    return "Files and Sources";
  }

  if (
    /^production\.(mix|mixing)(\.|$)/.test(
      path,
    ) ||
    /^track\.production\.(mix|mixing)(\.|$)/.test(
      path,
    )
  ) {
    return "Mixing";
  }

  if (
    /^production\.mastering(\.|$)/.test(
      path,
    ) ||
    /^track\.production\.mastering(\.|$)/.test(
      path,
    )
  ) {
    return "Mastering";
  }

  const productionContextGroup =
    resolveProductionContextGroup(path);

  if (productionContextGroup) {
    return productionContextGroup;
  }

  if (
    /^track\.production\.recording(\.|$)/.test(path)
  ) {
    return "Recording";
  }

  if (
    /^track\.production\.editing(\.|$)/.test(path)
  ) {
    return "Editing";
  }

  if (
    /^track\.production\.sound_design(\.|$)/.test(path) ||
    /^(track\.production|release\.credits\.contributors)(\.|$)/.test(
      path,
    )
  ) {
    return "Production";
  }

  const registeredGroup =
    field?.presentation?.group;

  if (registeredGroup) {
    return registeredGroup;
  }

  /*
   * Unknown authored fields remain visible without being mistaken for core
   * identity metadata. The neutral disclosure makes their registration
   * status and source document explicit.
   */
  return unmappedMetadataGroup;
}

function MetadataFieldModal({
  title,
  onClose,
  children,
  variant = "default",
  closeDisabled = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  variant?: "default" | "wide";
  closeDisabled?: boolean;
}) {
  const closeButtonRef =
    useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  const closeDisabledRef =
    useRef(closeDisabled);
  const previousFocusRef =
    useRef<HTMLElement | null>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    closeDisabledRef.current =
      closeDisabled;
  }, [closeDisabled]);

  useEffect(() => {
    const previousOverflow =
      document.body.style.overflow;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;

    document.body.style.overflow =
      "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (
      event: KeyboardEvent,
    ) => {
      if (
        event.key === "Escape" &&
        !closeDisabledRef.current
      ) {
        onCloseRef.current();
      }
    };

    window.addEventListener(
      "keydown",
      handleKeyDown,
    );

    return () => {
      document.body.style.overflow =
        previousOverflow;
      window.removeEventListener(
        "keydown",
        handleKeyDown,
      );
      previousFocusRef.current?.focus();
    };
  }, []);

  return (
    <div
      className="metadata-field-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (
          !closeDisabled &&
          event.target ===
          event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <section
        className={`metadata-field-modal ${
          variant === "wide"
            ? "metadata-field-modal--wide"
            : ""
        }`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="metadata-field-modal-title"
      >
        <header>
          <h3 id="metadata-field-modal-title">
            {title}
          </h3>

          <button
            ref={closeButtonRef}
            type="button"
            className="metadata-field-modal-close"
            aria-label="Close dialog"
            disabled={closeDisabled}
            title={
              closeDisabled
                ? "Wait for the current operation to finish before closing."
                : "Close dialog"
            }
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="metadata-field-modal-body">
          {children}
        </div>
      </section>
    </div>
  );
}

function MetadataActivityLogModal({
  entries,
  onClose,
  onClear,
}: {
  entries: MetadataActivityEntry[];
  onClose: () => void;
  onClear: () => void;
}) {
  return (
    <MetadataFieldModal
      title="Metadata Activity Log"
      onClose={onClose}
    >
      <section className="metadata-activity-log-intro">
        <div>
          <h4>Current browser session</h4>
          <p>
            Verified save receipts and failed metadata-write attempts are
            retained only in this tab&apos;s session storage. No additional
            filesystem log is created.
          </p>
        </div>

        <button
          type="button"
          disabled={entries.length === 0}
          onClick={onClear}
        >
          Clear activity
        </button>
      </section>

      {entries.length === 0 ? (
        <p className="metadata-activity-empty">
          No metadata save activity has been recorded in this browser
          session.
        </p>
      ) : (
        <ol className="metadata-activity-list">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className={`metadata-activity-entry ${entry.status}`}
            >
              <header>
                <div>
                  <span
                    className={`badge ${
                      entry.status === "verified"
                        ? "complete"
                        : "missing"
                    }`}
                  >
                    {entry.status === "verified"
                      ? "Saved and verified"
                      : "Write failed"}
                  </span>
                  <strong>
                    {entry.documentFilename}
                  </strong>
                </div>

                <time dateTime={entry.occurredAt}>
                  {new Date(
                    entry.occurredAt,
                  ).toLocaleString()}
                </time>
              </header>

              <p className="metadata-activity-context">
                <span>{entry.releaseId}</span>
                {entry.trackId && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{entry.trackId}</span>
                  </>
                )}
                <span aria-hidden="true">·</span>
                <span>
                  {entry.action === "add-fields"
                    ? "Added fields"
                    : entry.action ===
                        "remove-fields"
                      ? "Removed fields"
                      : entry.action ===
                          "copy-performers"
                        ? "Copied performer credits"
                        : entry.action ===
                            "create-document"
                          ? "Created metadata document"
                          : "Saved metadata"}
                </span>
              </p>

              <code className="metadata-activity-path">
                {entry.documentRelativePath}
              </code>
              <p>{entry.message}</p>

              {entry.receipt && (
                <details className="metadata-activity-receipt">
                  <summary>
                    View verification receipt
                  </summary>
                  <dl>
                    <div>
                      <dt>Backup</dt>
                      <dd>
                        <code>
                          {entry.receipt.backupRelativePath}
                        </code>
                      </dd>
                    </div>
                    <div>
                      <dt>SHA-256</dt>
                      <dd>
                        <code>
                          {entry.receipt.savedSha256}
                        </code>
                      </dd>
                    </div>
                    <div>
                      <dt>Bytes</dt>
                      <dd>{entry.receipt.bytes}</dd>
                    </div>
                    {(entry.receipt.synchronizedTrackFiles ?? 0) > 0 && (
                      <div>
                        <dt>Track files synchronized</dt>
                        <dd>
                          {entry.receipt.synchronizedTrackFiles}
                        </dd>
                      </div>
                    )}
                  </dl>
                </details>
              )}
            </li>
          ))}
        </ol>
      )}
    </MetadataFieldModal>
  );
}

function PerformerCreditCopyModal({
  releaseId,
  source,
  sourceLabel,
  releasePrimaryArtistName,
  trackOptions,
  onClose,
  onComplete,
}: {
  releaseId: string;
  source: PerformerCopySource;
  sourceLabel: string;
  releasePrimaryArtistName: string;
  trackOptions: PerformerCopyTrackOption[];
  onClose: () => void;
  onComplete: (
    result: PerformerCopyResponse,
  ) => void | Promise<void>;
}) {
  const selectableRecords =
    source.records.filter(
      (record): record is
        PerformerRecordDraft & {
          sourceIndex: number;
        } =>
        record.sourceIndex !== null &&
        Boolean(record.name.trim()) &&
        Boolean(record.role.trim()),
    );
  const [selectedSourceIndexes, setSelectedSourceIndexes] =
    useState<number[]>(() =>
      selectableRecords.map(
        (record) => record.sourceIndex,
      ),
    );
  const [selectedDestinationTrackIds, setSelectedDestinationTrackIds] =
    useState<string[]>([]);
  const [rangeStartTrackId, setRangeStartTrackId] =
    useState<string>(() => trackOptions[0]?.trackId ?? "");
  const [rangeEndTrackId, setRangeEndTrackId] =
    useState<string>(() =>
      trackOptions[trackOptions.length - 1]?.trackId ?? "",
    );
  const [rangeMode, setRangeMode] =
    useState<PerformerCopyTrackRangeMode>("replace");
  const [plan, setPlan] =
    useState<PerformerCopyResponse | null>(
      null,
    );
  const [loadingMode, setLoadingMode] =
    useState<"review" | "execute" | null>(
      null,
    );
  const [error, setError] =
    useState<string | null>(null);

  const groupedRecords = useMemo(() => {
    const groups = new Map<
      string,
      {
        name: string;
        records: Array<
          PerformerRecordDraft & {
            sourceIndex: number;
          }
        >;
      }
    >();

    selectableRecords.forEach((record) => {
      const normalizedName = record.name
        .trim()
        .replace(/\\s+/g, " ")
        .toLocaleLowerCase();
      const existing =
        groups.get(normalizedName);

      if (existing) {
        existing.records.push(record);
      } else {
        groups.set(normalizedName, {
          name: record.name.trim(),
          records: [record],
        });
      }
    });

    return prioritizeReleaseArtistDisplay(
      Array.from(groups.values()),
      releasePrimaryArtistName,
    );
  }, [
    releasePrimaryArtistName,
    selectableRecords,
  ]);

  const resetPlan = () => {
    setPlan(null);
    setError(null);
  };

  const updateSourceSelection = (
    sourceIndexes: number[],
  ) => {
    setSelectedSourceIndexes(
      Array.from(new Set(sourceIndexes)),
    );
    resetPlan();
  };

  const updateDestinationSelection = (
    trackIds: string[],
  ) => {
    setSelectedDestinationTrackIds(
      Array.from(new Set(trackIds)),
    );
    resetPlan();
  };

  const rangeTrackIds = useMemo(
    () =>
      getInclusiveTrackRange(
        trackOptions,
        rangeStartTrackId,
        rangeEndTrackId,
      ),
    [
      rangeEndTrackId,
      rangeStartTrackId,
      trackOptions,
    ],
  );

  const applyDestinationRange = () => {
    updateDestinationSelection(
      applyTrackRangeSelection(
        trackOptions,
        selectedDestinationTrackIds,
        rangeTrackIds,
        rangeMode,
      ),
    );
  };

  const requestCopy = async (
    execute: boolean,
  ) => {
    setLoadingMode(
      execute ? "execute" : "review",
    );
    setError(null);

    try {
      const response = await fetch(
        "/api/library/copy-performer-credits",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            releaseId,
            sourceScope:
              source.document.scope,
            sourceTrackId:
              source.document.trackId,
            sourceOriginalSha256:
              source.document.sha256,
            selectedSourceIndexes,
            destinationTrackIds:
              selectedDestinationTrackIds,
            execute,
          }),
        },
      );
      const result =
        (await response.json()) as
          | PerformerCopyResponse
          | { error?: string };

      if (!response.ok) {
        throw new Error(
          "error" in result
            ? result.error ??
                `Performer copy failed: HTTP ${response.status}`
            : `Performer copy failed: HTTP ${response.status}`,
        );
      }

      const copyResult =
        result as PerformerCopyResponse;
      setPlan(copyResult);

      if (execute) {
        await onComplete(copyResult);
      }
    } catch (copyError) {
      setError(
        copyError instanceof Error
          ? copyError.message
          : "Unknown performer-copy error",
      );
    } finally {
      setLoadingMode(null);
    }
  };

  const targetLabel = (trackId: string) =>
    trackOptions.find(
      (option) =>
        option.trackId === trackId,
    )?.label ?? trackId;
  const executionComplete =
    Boolean(plan?.execution);

  return (
    <MetadataFieldModal
      title="Copy performer credits"
      onClose={onClose}
    >
      <section className="performer-copy-intro">
        <h4>
          {source.document.scope === "release"
            ? "Source release"
            : "Source track"}
        </h4>
        <strong>{sourceLabel}</strong>
        <p>
          Select saved name/role pairs, choose destination tracks, then review the duplicate-aware copy plan before writing. Existing target credits are never removed.
        </p>
      </section>

      <section className="performer-copy-section">
        <header>
          <div>
            <h4>1. Performer credits</h4>
            <p>
              Select one role, several roles for the same person, or credits from multiple people.
            </p>
          </div>
          <div className="performer-copy-selection-actions">
            <button
              type="button"
              onClick={() =>
                updateSourceSelection(
                  selectableRecords.map(
                    (record) =>
                      record.sourceIndex,
                  ),
                )
              }
            >
              Select all
            </button>
            <button
              type="button"
              onClick={() =>
                updateSourceSelection([])
              }
            >
              Clear
            </button>
          </div>
        </header>

        <div className="performer-copy-credit-groups">
          {groupedRecords.map((group) => {
            const groupIndexes =
              group.records.map(
                (record) =>
                  record.sourceIndex,
              );
            const groupSelected =
              groupIndexes.every(
                (sourceIndex) =>
                  selectedSourceIndexes.includes(
                    sourceIndex,
                  ),
              );

            return (
              <fieldset key={group.name}>
                <legend>
                  <label>
                    <input
                      type="checkbox"
                      checked={groupSelected}
                      onChange={(event) => {
                        if (event.target.checked) {
                          updateSourceSelection([
                            ...selectedSourceIndexes,
                            ...groupIndexes,
                          ]);
                        } else {
                          updateSourceSelection(
                            selectedSourceIndexes.filter(
                              (sourceIndex) =>
                                !groupIndexes.includes(
                                  sourceIndex,
                                ),
                            ),
                          );
                        }
                      }}
                    />
                    <strong>{group.name}</strong>
                    <small>
                      Select all {group.records.length} {group.records.length === 1 ? "role" : "roles"}
                    </small>
                  </label>
                </legend>

                {group.records.map((record) => (
                  <label
                    key={record.sourceIndex}
                    className="performer-copy-credit-option"
                  >
                    <input
                      type="checkbox"
                      checked={
                        selectedSourceIndexes.includes(
                          record.sourceIndex,
                        )
                      }
                      onChange={(event) =>
                        updateSourceSelection(
                          event.target.checked
                            ? [
                                ...selectedSourceIndexes,
                                record.sourceIndex,
                              ]
                            : selectedSourceIndexes.filter(
                                (sourceIndex) =>
                                  sourceIndex !==
                                  record.sourceIndex,
                              ),
                        )
                      }
                    />
                    <span>{record.name}</span>
                    <strong>{record.role}</strong>
                    {record.sortName && (
                      <small>
                        Sort name: {record.sortName}
                      </small>
                    )}
                  </label>
                ))}
              </fieldset>
            );
          })}
        </div>
      </section>

      <section className="performer-copy-section">
        <header>
          <div>
            <h4>2. Destination tracks</h4>
            <p>
              {source.document.scope === "track"
                ? "The source track is excluded. "
                : "Release performers may be copied into explicit track overrides. "}
              Missing track-credits documents will be created only for targets that receive a new credit.
            </p>
          </div>
          <div className="performer-copy-selection-actions">
            <button
              type="button"
              onClick={() =>
                updateDestinationSelection(
                  trackOptions.map(
                    (option) => option.trackId,
                  ),
                )
              }
            >
              Select all tracks
            </button>
            <button
              type="button"
              onClick={() =>
                updateDestinationSelection([])
              }
            >
              Clear
            </button>
          </div>
        </header>

        <div className="performer-copy-range-tools">
          <div className="performer-copy-range-copy">
            <strong>Inclusive track range</strong>
            <small>
              Uses the disc and track order shown below. Start and end may be chosen in either direction.
            </small>
          </div>

          <label>
            <span>Start track</span>
            <select
              value={rangeStartTrackId}
              disabled={trackOptions.length === 0}
              onChange={(event) =>
                setRangeStartTrackId(event.target.value)
              }
            >
              {trackOptions.map((option) => (
                <option
                  key={option.trackId}
                  value={option.trackId}
                >
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>End track</span>
            <select
              value={rangeEndTrackId}
              disabled={trackOptions.length === 0}
              onChange={(event) =>
                setRangeEndTrackId(event.target.value)
              }
            >
              {trackOptions.map((option) => (
                <option
                  key={option.trackId}
                  value={option.trackId}
                >
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Range action</span>
            <select
              value={rangeMode}
              onChange={(event) =>
                setRangeMode(
                  event.target.value as PerformerCopyTrackRangeMode,
                )
              }
            >
              <option value="replace">Replace selection</option>
              <option value="add">Add to selection</option>
              <option value="remove">Remove from selection</option>
            </select>
          </label>

          <button
            type="button"
            disabled={rangeTrackIds.length === 0}
            onClick={applyDestinationRange}
          >
            Apply {rangeTrackIds.length}-track range
          </button>
        </div>

        <p
          className="performer-copy-destination-summary"
          role="status"
          aria-live="polite"
        >
          <strong>{selectedDestinationTrackIds.length}</strong> of {trackOptions.length} available destination tracks selected.
        </p>

        <div className="performer-copy-destination-table-wrap">
          <table className="performer-copy-destination-table">
            <thead>
              <tr>
                <th
                  scope="col"
                  className="performer-copy-destination-select-column"
                  aria-label="Select destination"
                >
                  Use
                </th>
                <th scope="col">Disc</th>
                <th scope="col">Track</th>
                <th scope="col">Title</th>
              </tr>
            </thead>
            <tbody>
              {trackOptions.map((option) => {
                const selected =
                  selectedDestinationTrackIds.includes(
                    option.trackId,
                  );
                const inputId =
                  `performer-copy-destination-${option.trackId}`;

                return (
                  <tr
                    key={option.trackId}
                    className={selected ? "selected" : undefined}
                  >
                    <td>
                      <input
                        id={inputId}
                        type="checkbox"
                        checked={selected}
                        aria-label={`Select ${option.label}`}
                        onChange={(event) =>
                          updateDestinationSelection(
                            event.target.checked
                              ? [
                                  ...selectedDestinationTrackIds,
                                  option.trackId,
                                ]
                              : selectedDestinationTrackIds.filter(
                                  (trackId) =>
                                    trackId !== option.trackId,
                                ),
                          )
                        }
                      />
                    </td>
                    <td>{option.discNumber}</td>
                    <td>{option.trackNumber}</td>
                    <td>
                      <label htmlFor={inputId}>
                        {option.title}
                      </label>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="performer-copy-section performer-copy-review">
        <header>
          <div>
            <h4>3. Review copy plan</h4>
            <p>
              Exact name/role duplicates are skipped using case-insensitive, whitespace-normalized matching.
            </p>
          </div>
          {!executionComplete && (
            <button
              type="button"
              disabled={
                selectedSourceIndexes.length === 0 ||
                selectedDestinationTrackIds.length === 0 ||
                loadingMode !== null
              }
              onClick={() =>
                void requestCopy(false)
              }
            >
              {loadingMode === "review"
                ? "Reviewing…"
                : "Review copy plan"}
            </button>
          )}
        </header>

        {plan && (
          <>
            <div className="performer-copy-summary">
              <span>
                <strong>{plan.summary.selectedCreditCount}</strong> selected credits
              </span>
              <span>
                <strong>{plan.summary.addCount}</strong> records to add
              </span>
              <span>
                <strong>{plan.summary.duplicateCount}</strong> duplicates to skip
              </span>
              <span>
                <strong>{plan.summary.blockedCount}</strong> blocked targets
              </span>
            </div>

            <ol className="performer-copy-target-plan">
              {(plan.execution?.targets ??
                plan.destinations).map(
                (target) => {
                  const executionTarget:
                    | PerformerCopyExecutionTarget
                    | null = plan.execution
                      ? (
                          target as
                            PerformerCopyExecutionTarget
                        )
                      : null;
                  return (
                    <li
                      key={target.trackId}
                      className={
                        target.status === "blocked" ||
                        executionTarget?.error
                          ? "blocked"
                          : "ready"
                      }
                    >
                      <div>
                        <strong>
                          {targetLabel(
                            target.trackId,
                          )}
                        </strong>
                        <small>
                          {target.relativePath ||
                            "No target path"}
                        </small>
                      </div>
                      <span>
                        {executionTarget?.receipt
                          ? `${target.addCount} added and verified`
                          : executionTarget?.error
                            ? executionTarget.error
                            : target.status === "blocked"
                              ? target.reason
                              : target.addCount === 0
                                ? `${target.duplicateCount} duplicate ${target.duplicateCount === 1 ? "credit" : "credits"}; no write needed`
                                : `${target.addCount} to add · ${target.duplicateCount} ${target.duplicateCount === 1 ? "duplicate" : "duplicates"} skipped`}
                      </span>
                    </li>
                  );
                },
              )}
            </ol>
          </>
        )}

        {error && (
          <p className="error-message">
            {error}
          </p>
        )}
      </section>

      <footer className="performer-copy-footer">
        <button
          type="button"
          onClick={onClose}
        >
          {executionComplete ? "Close" : "Cancel"}
        </button>

        {!executionComplete && (
          <button
            type="button"
            className="primary-button"
            disabled={
              !plan ||
              plan.summary.addCount === 0 ||
              plan.summary.readyCount === 0 ||
              loadingMode !== null
            }
            onClick={() =>
              void requestCopy(true)
            }
          >
            {loadingMode === "execute"
              ? "Copying credits…"
              : plan
                ? `Copy ${plan.summary.addCount} missing ${plan.summary.addCount === 1 ? "credit" : "credits"}`
                : "Review before copying"}
          </button>
        )}
      </footer>
    </MetadataFieldModal>
  );
}

function describeMetadataValueGuidance(
  valueType: FlattenedMetadataRow["valueType"],
): string {
  switch (valueType) {
    case "string":
      return "Enter a single text value. Unless a recommended vocabulary is listed above, this field accepts project-defined free text.";
    case "integer":
      return "Enter a whole number without decimals or leading zeroes.";
    case "number":
      return "Enter a numeric value. Decimals are allowed when meaningful for the field.";
    case "boolean":
      return "Use true or false.";
    case "date":
      return "Use an ISO-style date such as YYYY-MM-DD when the full date is known.";
    case "string-array":
      return "Enter one or more text values. TOML stores these as a quoted, comma-separated array.";
    case "object":
      return "This value is a structured TOML object; edit its individual child fields.";
    case "object-array":
      return "This value is a repeatable list of structured TOML objects; edit the indexed child fields.";
    default:
      return "Use a value consistent with the field's existing TOML data type.";
  }
}

type SupplementalFieldGuidance = {
  help?: string;
  commonValues?: string[];
  examples?: string[];
};

function normalizeMetadataGuidancePath(
  path: string,
): string {
  return path.replace(/\[\d+\]/g, "[]");
}

function getSupplementalFieldGuidance(
  path: string,
  valueType: FlattenedMetadataRow["valueType"],
): SupplementalFieldGuidance {
  const normalizedPath =
    normalizeMetadataGuidancePath(path);

  const exactGuidance:
    Record<string, SupplementalFieldGuidance> = {
      "production.production_type": {
        help:
          "Describe the production or recording context with one concise, reusable term. Use Release Type for the publication format; use this field for session context such as a rehearsal, jam session, home recording, or field recording.",
        commonValues: [
          ...productionTypeCommonValues,
        ],
        examples: [
          "home recording",
          "jam session",
          "field recording",
        ],
      },
      "production.session_type": {
        help:
          "Describe the kind of working session represented by these files or notes.",
        commonValues: [
          "tracking session",
          "overdub session",
          "rehearsal",
          "jam session",
          "writing session",
          "live session",
          "editing session",
          "mix session",
          "mastering session",
        ],
      },
      "production.location_type": {
        help:
          "Classify the recording environment separately from the specific venue or geographic location.",
        commonValues: [
          "commercial studio",
          "home studio",
          "rehearsal space",
          "live venue",
          "remote setup",
          "mobile setup",
          "field location",
          "outdoor location",
        ],
      },
      "production.capture_method": {
        help:
          "Describe the broad capture workflow without replacing detailed equipment or engineering notes.",
        commonValues: [
          "multitrack recording",
          "live to stereo",
          "direct to two-track",
          "overdubbed recording",
          "remote collaboration",
          "archive transfer",
        ],
      },
      "track.album_artists[].name": {
        help:
          "Compatibility album-artist value stored on this track. It normally mirrors release.primary_artist.name and does not replace the authoritative Track Artist field.",
        examples: [
          "Album Artist",
          "Various Artists",
        ],
      },
      "track.album_artists[].sort_name": {
        help:
          "Optional alphabetical sort form for the compatibility Album Artist value. It normally mirrors release.primary_artist.sort_name.",
        examples: [
          "First Last → Last, First",
          "The Example Band → Example Band, The",
        ],
      },
      "track.subtitle": {
        help:
          "Optional secondary track title. A blank track subtitle inherits release.subtitle when one is present; enter a track-specific value only when this track differs.",
        examples: [
          "Part I",
          "Live Session",
        ],
      },
      "track.dates.release": {
        help:
          "Release date for this track. A blank value inherits release.dates.release; override it only when this track has a different release date.",
        examples: [
          "2009-05-01",
          "2026-07-18",
        ],
      },
      "track.dates.original_release": {
        help:
          "Earliest known release date for this recording or track version. A blank value inherits release.dates.original_release; override it only when this specific recording or track was first released on a different date, such as an earlier single later included on the release.",
        examples: [
          "2009-05-01",
          "1998",
        ],
      },
      "track.rights.copyright": {
        help:
          "Track-level copyright notice using the fixed form Copyright © [name or names]. All rights reserved. Leave it blank when the release-level notice applies; use an override only when this track has distinct ownership or wording.",
        examples: [
          "Copyright © Example Publishing. All rights reserved.",
        ],
      },
      "track.rights.phonographic_copyright": {
        help:
          "Track-level sound-recording notice using the fixed form Sound Recording Copyright ℗ [name or names]. All rights reserved. This is distinct from composition, publishing, lyrics, and artwork copyright.",
        examples: [
          "Sound Recording Copyright ℗ Example Records. All rights reserved.",
        ],
      },
      "track.rights.publisher": {
        help:
          "Publisher associated with the underlying musical work. Leave blank when the release-level publisher applies.",
        examples: [
          "Example Music Publishing",
        ],
      },
      "track.rights.license": {
        help:
          "Defaults to All rights reserved. when no release-level license applies. Use a track override only when this recording has different licensing terms.",
        examples: [
          "All rights reserved.",
        ],
      },
      "track.version": {
        help:
          "Use a concise version label only when it distinguishes this recording from another version of the same track.",
        commonValues: [
          "Original Mix",
          "Radio Edit",
          "Extended Mix",
          "Instrumental",
          "Acoustic",
          "Live",
          "Demo",
          "Remix",
          "Remaster",
          "Clean",
          "Explicit",
          "Mono",
          "Stereo",
        ],
        examples: [
          "Original Mix",
          "Radio Edit",
          "Demo",
        ],
      },
      "track.text.lyrics_copyright": {
        help:
          "Copyright notice specifically covering the lyrical text. Put this field under Label, Publishing & Copyright; it does not replace songwriter or lyricist credits, publishing ownership, the release copyright notice, or the sound-recording ℗ notice.",
        examples: [
          "© 2026 Example Music Publishing",
          "Lyrics © 2026 Jane Doe",
        ],
      },
      "release.primary_artist.sort_name": {
        help:
          "Optional alphabetical sort form for the release artist. It does not change the artist name displayed to listeners. For a conventional personal name written as First Last, use Last, First. Leave this blank when the display name already sorts correctly. Do not automatically reverse stage names, group names, or names whose cultural ordering is uncertain.",
        examples: [
          "First Last → Last, First",
          "The Example Band → Example Band, The",
          "SingleName → SingleName",
        ],
      },
      "release.identifiers.upc": {
        help:
          "Use this as the authoritative commercial identifier when the release is assigned a UPC. Enter digits only and preserve any leading zeroes.",
        examples: [
          "012345678905",
        ],
      },
      "release.identifiers.ean": {
        help:
          "Use this as the authoritative commercial identifier when the release is assigned an EAN. Enter digits only and preserve any leading zeroes.",
        examples: [
          "4012345678901",
        ],
      },
      "release.identifiers.barcode": {
        help:
          "Generic barcode compatibility field. Prefer the specific UPC or EAN field as authoritative, and use this field only when importing, mirroring, or preserving a source system's generic barcode value.",
        examples: [
          "012345678905",
          "4012345678901",
        ],
      },
      "release.status": {
        help:
          "Describes the release's publication or lifecycle state. This is the authoritative field for whether the release is still being prepared, scheduled, officially published, withdrawn, or archived. It does not describe the musical or editorial edition.",
        commonValues: [
          "draft",
          "scheduled",
          "official",
          "released",
          "withdrawn",
          "archived",
        ],
        examples: [
          "draft",
          "official",
          "archived",
        ],
      },
      "release.version": {
        help:
          "Describes the edition or variant of this release. Use it only when this record must be distinguished from another edition of the same release. This field is optional and is not authoritative for publication status or release type.",
        commonValues: [
          "Original Release",
          "Deluxe Edition",
          "Expanded Edition",
          "Remastered",
          "Anniversary Edition",
          "Demo Edition",
          "Promo Edition",
        ],
        examples: [
          "2026 Remaster",
          "Deluxe Edition",
          "Expanded Edition",
        ],
      },
      "track.explicit": {
        commonValues: [
          "clean",
          "explicit",
          "not_applicable",
        ],
      },
      "release.language": {
        help:
          "Prefer a short BCP 47 or ISO 639 language code and use the same convention throughout the library.",
        commonValues: [
          "en",
          "es",
          "fr",
          "de",
          "it",
          "pt",
          "ja",
          "ko",
          "zh",
          "zxx",
        ],
      },
      "track.language": {
        help:
          "Prefer a short BCP 47 or ISO 639 language code and use the same convention throughout the library.",
        commonValues: [
          "en",
          "es",
          "fr",
          "de",
          "it",
          "pt",
          "ja",
          "ko",
          "zh",
          "zxx",
        ],
      },
      "track.text.lyrics_language": {
        help:
          "Use the language code for the lyrical text. Leave the local field blank when it should follow the effective Track Language.",
        commonValues: [
          "en",
          "es",
          "fr",
          "de",
          "it",
          "pt",
          "ja",
          "ko",
          "zh",
          "zxx",
        ],
      },
      "release.script": {
        help:
          "Prefer a consistent ISO 15924 script code when the release writing system is known.",
        commonValues: [
          "Latn",
          "Cyrl",
          "Arab",
          "Hebr",
          "Grek",
          "Hans",
          "Hant",
          "Jpan",
          "Kore",
          "Deva",
        ],
      },
      "track.script": {
        help:
          "Prefer a consistent ISO 15924 script code when the track writing system is known.",
        commonValues: [
          "Latn",
          "Cyrl",
          "Arab",
          "Hebr",
          "Grek",
          "Hans",
          "Hant",
          "Jpan",
          "Kore",
          "Deva",
        ],
      },
      "track.text.lyrics_script": {
        help:
          "Use an ISO 15924 script code for the lyrical text when it differs from or clarifies the track writing system.",
        commonValues: [
          "Latn",
          "Cyrl",
          "Arab",
          "Hebr",
          "Grek",
          "Hans",
          "Hant",
          "Jpan",
          "Kore",
          "Deva",
        ],
      },
      "release.artwork[].role": {
        commonValues: [
          "front_cover",
          "back_cover",
          "booklet",
          "disc",
          "artist",
          "logo",
          "other",
        ],
      },
      "track.artwork[].role": {
        commonValues: [
          "front_cover",
          "track_artwork",
          "artist",
          "logo",
          "other",
        ],
      },
      "track.performers[].role": {
        commonValues: [
          "vocals",
          "lead vocals",
          "backing vocals",
          "guitar",
          "bass",
          "drums",
          "percussion",
          "piano",
          "keyboards",
          "synthesizer",
          "strings",
          "brass",
          "woodwinds",
          "conductor",
          "ensemble",
        ],
      },
      "track.contributors[].role": {
        commonValues: [
          "producer",
          "executive producer",
          "composer",
          "lyricist",
          "songwriter",
          "arranger",
          "recording engineer",
          "mixing engineer",
          "mastering engineer",
          "editor",
          "remixer",
        ],
      },
      "track.identifiers[].type": {
        commonValues: [
          "isrc",
          "musicbrainz_recording_id",
          "acoustid",
          "catalog_number",
          "custom",
        ],
      },
      "release.identifiers[].type": {
        commonValues: [
          "upc",
          "ean",
          "musicbrainz_release_id",
          "catalog_number",
          "custom",
        ],
      },
      "track.audio.channel_layout": {
        commonValues: [
          "mono",
          "stereo",
          "2.1",
          "5.1",
          "7.1",
        ],
      },
      "track.audio.sample_format": {
        commonValues: [
          "pcm_s16le",
          "pcm_s24le",
          "pcm_s32le",
          "pcm_f32le",
        ],
      },
      "track.audio.bit_depth": {
        commonValues: [
          "16",
          "24",
          "32",
        ],
      },
      "track.audio.sample_rate": {
        commonValues: [
          "44100",
          "48000",
          "88200",
          "96000",
          "176400",
          "192000",
        ],
      },
      "track.source.type": {
        commonValues: [
          "studio_master",
          "mixdown",
          "stem",
          "transfer",
          "vinyl",
          "cassette",
          "cd",
          "digital_file",
          "other",
        ],
      },
      "release.type": {
        commonValues: [
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
        ],
      },
    };

  const patternCommonValues =
    getPatternMetadataHelpCommonValues(
      normalizedPath,
    );
  const exact =
    exactGuidance[normalizedPath];

  if (exact) {
  const artworkMetadataMatch = path.match(
    /^(release|track)\.artwork\[\d+\]\.(id|role|primary|description|credits|copyright)$/,
  );

  if (artworkMetadataMatch) {
    const artworkField = artworkMetadataMatch[2];

    const artworkGuidance: Record<
      string,
      {
        examples?: string[];
        commonValues?: string[];
        help: string;
      }
    > = {
      id: {
        examples: [
          "release-front-cover",
          "alternate-cover-01",
        ],
        help:
          "Stable internal identifier for this artwork record. Use a short machine-friendly ID that identifies the asset, not the creator's name. Put creator names and contribution roles in Artwork Credits instead.",
      },
      role: {
        commonValues: [
          "front_cover",
          "back_cover",
          "booklet",
          "disc",
          "media_label",
          "liner",
          "leaflet",
          "alternate",
          "artist",
          "band",
          "composer",
          "recording_location",
          "publisher_logo",
          "studio_logo",
          "other",
        ],
        examples: [
          "front_cover",
          "alternate",
        ],
        help:
          "Describes what the image is used for, not who made it. Put creator names in Artwork Credits.",
      },
      primary: {
        examples: [
          "true",
          "false",
        ],
        help:
          "Marks the preferred/default artwork for this scope. The primary front cover is normally true; alternate, back, booklet, and other artwork is normally false. This field does not identify an artist or designer.",
      },
      description: {
        examples: [
          "Front cover",
          "Alternate monochrome cover",
          "Band photograph used on the back cover",
        ],
        help:
          "Human-readable description of what this artwork is or depicts. Do not use Description as the creator-credit field; put names and contribution wording in Artwork Credits.",
      },
      credits: {
        examples: [
          "Artwork by Jane Doe",
          "Illustration by Jane Doe",
          "Photography by Alex Smith",
          "Design by Example Studio",
          "Art direction by Jane Doe",
          "Cover concept by Jane Doe",
          "Artwork prompt by Jane Doe",
        ],
        help:
          "Artwork credits identify who created or contributed to this visual asset. Enter one credit statement per line and include both the contribution role and the credited person or organization. For example: Artwork by Jane Doe; Photography by Alex Smith; Design by Example Studio. A person's name belongs here when you are crediting their artwork contribution. Use separate lines when several people performed different roles.",
      },
      copyright: {
        examples: [
          "© 2026 Jane Doe",
          "© 2026 Example Studio",
        ],
        help:
          "Artwork-specific copyright notice for this image. This is ownership/rightsholder information, not the general creator-credit field. Put creator or contributor names in Artwork Credits; leave this blank when the release-level rights statement already governs the artwork and no artwork-specific notice is needed.",
      },
    };

    return artworkGuidance[artworkField];
  }

    return {
      ...exact,
      commonValues: mergeMetadataGuidanceValues(
        exact.commonValues ?? [],
        patternCommonValues,
      ),
    };
  }

  if (patternCommonValues.length > 0) {
    if (normalizedPath.endsWith(".language")) {
      return {
        help:
          "Prefer a short BCP 47 or ISO 639 language code and use the same convention throughout the library.",
        commonValues: patternCommonValues,
      };
    }

    if (normalizedPath.endsWith(".script")) {
      return {
        help:
          "Prefer a consistent ISO 15924 script code when the writing system is known.",
        commonValues: patternCommonValues,
      };
    }

    if (normalizedPath.endsWith(".country")) {
      return {
        help:
          "Prefer a consistent two-letter ISO 3166-1 alpha-2 country code when the field represents a country.",
        commonValues: patternCommonValues,
      };
    }

    return {
      commonValues: patternCommonValues,
    };
  }

  if (
    normalizedPath.endsWith(".role")
  ) {
    return {
      commonValues: [
        "performer",
        "producer",
        "recording engineer",
        "mix engineer",
        "mastering engineer",
        "composer",
        "lyricist",
        "arranger",
        "art director",
        "photography",
      ],
    };
  }

  if (
    normalizedPath.includes(".date") ||
    normalizedPath.includes(".dates.")
  ) {
    return {
      help:
        "Use an ISO-style date. Prefer YYYY-MM-DD when the full date is known, YYYY-MM when only the month is known, or YYYY when only the year is known.",
      examples: [
        "2026-07-13",
        "2026-07",
        "2026",
      ],
    };
  }

  if (
    normalizedPath.endsWith(".country")
  ) {
    return {
      help:
        "Prefer a consistent two-letter ISO 3166-1 alpha-2 country code when the field represents a country.",
      commonValues: [
        "US",
        "GB",
        "CA",
        "AU",
        "DE",
        "FR",
        "JP",
      ],
    };
  }

  if (
    normalizedPath.endsWith(".language")
  ) {
    return {
      help:
        "Prefer a short BCP 47 or ISO 639 language code and use the same convention throughout the library.",
      commonValues: [
        "en",
        "es",
        "fr",
        "de",
        "it",
        "pt",
        "ja",
        "ko",
        "zh",
        "zxx",
      ],
    };
  }

  if (
    normalizedPath.endsWith(".email")
  ) {
    return {
      examples: [
        "artist@example.com",
        "rights@example.com",
      ],
    };
  }

  if (
    normalizedPath.endsWith(".url") ||
    normalizedPath.endsWith(".website")
  ) {
    return {
      examples: [
        "https://example.com",
      ],
    };
  }

  if (
    normalizedPath.endsWith(".bpm")
  ) {
    return {
      help:
        "Enter the musical tempo in beats per minute.",
      examples: [
        "90",
        "120",
        "128",
      ],
    };
  }

  if (
    normalizedPath.includes("track_number") ||
    normalizedPath.includes("track_total") ||
    normalizedPath.includes("disc_number") ||
    normalizedPath.includes("disc_total")
  ) {
    return {
      help:
        "Enter a positive whole number without leading zeroes.",
      examples: [
        "1",
        "2",
        "12",
      ],
    };
  }

  if (
    normalizedPath.endsWith(".name")
  ) {
    return {
      examples: [
        "Artist Name",
        "Contributor Name",
      ],
    };
  }

  if (
    normalizedPath.endsWith(".title")
  ) {
    return {
      examples: [
        "Track Title",
        "Release Title",
      ],
    };
  }

  if (
    normalizedPath.endsWith(".description") ||
    normalizedPath.endsWith(".comment") ||
    normalizedPath.endsWith(".notes")
  ) {
    return {
      examples: [
        "Concise internal or public-facing note.",
      ],
    };
  }

  if (valueType === "date") {
    return {
      examples: [
        "2026-07-26",
      ],
      help:
        "Use the calendar control for a complete date. TOML stores the value as YYYY-MM-DD.",
    };
  }

  if (valueType === "boolean") {
    return {
      commonValues: [
        "true",
        "false",
      ],
    };
  }

  if (valueType === "string-array") {
    return {
      examples: [
        '["value one", "value two"]',
        '["single value"]',
        "[]",
      ],
    };
  }

  if (
    valueType === "integer" ||
    valueType === "number"
  ) {
    return {
      examples: [
        "1",
        "2",
        "10",
      ],
    };
  }

  return {
    help:
      "Use a concise value consistent with the rest of the library.",
  };
}

type MetadataFieldHelpSpec = {
  label: string;
  field:
    | MetadataFieldDefinition
    | undefined;
  path: string;
  valueType:
    FlattenedMetadataRow["valueType"];
};

function mergeMetadataGuidanceValues(
  ...valueGroups: readonly (readonly string[])[]
): string[] {
  const values: string[] = [];
  const seen = new Set<string>();

  for (const group of valueGroups) {
    for (const rawValue of group) {
      const value = rawValue.trim();
      const normalizedValue =
        value.toLocaleLowerCase();

      if (
        value.length === 0 ||
        seen.has(normalizedValue)
      ) {
        continue;
      }

      seen.add(normalizedValue);
      values.push(value);
    }
  }

  return values;
}

type EffectiveMetadataFieldGuidance = {
  help: string;
  commonValues: string[];
  examples: string[];
};

function resolveEffectiveMetadataFieldGuidance(
  spec: MetadataFieldHelpSpec,
): EffectiveMetadataFieldGuidance {
  const supplementalGuidance =
    getSupplementalFieldGuidance(
      spec.path,
      spec.valueType,
    );
  const presentation =
    spec.field?.presentation;

  return {
    help:
      presentation?.help ??
      supplementalGuidance.help ??
      describeMetadataValueGuidance(
        spec.valueType,
      ),
    commonValues:
      mergeMetadataGuidanceValues(
        spec.field?.editor?.options ?? [],
        presentation?.commonValues ?? [],
        supplementalGuidance.commonValues ?? [],
      ),
    examples:
      mergeMetadataGuidanceValues(
        presentation?.examples ?? [],
        supplementalGuidance.examples ?? [],
      ),
  };
}

function MetadataFieldFacts({
  spec,
}: {
  spec: MetadataFieldHelpSpec;
}) {
  return (
    <dl className="metadata-field-facts">
      <div>
        <dt>Canonical path</dt>
        <dd>
          <code>{spec.path}</code>
        </dd>
      </div>

      <div>
        <dt>Data type</dt>
        <dd>
          <code>{spec.valueType}</code>
        </dd>
      </div>

      {spec.field && (
        <>
          <div>
            <dt>Required</dt>
            <dd>
              {spec.field.required
                ? "Yes"
                : "No"}
            </dd>
          </div>

          <div>
            <dt>Repeatable</dt>
            <dd>
              {spec.field.repeatable
                ? "Yes"
                : "No"}
            </dd>
          </div>

          <div>
            <dt>Inherited</dt>
            <dd>
              {spec.field.inherited
                ? "Yes"
                : "No"}
            </dd>
          </div>
        </>
      )}
    </dl>
  );
}

function MetadataFieldControls({
  field,
  path,
  valueType,
}: {
  field:
    | MetadataFieldDefinition
    | undefined;
  path: string;
  valueType:
    FlattenedMetadataRow["valueType"];
}) {
  const [modalOpen, setModalOpen] =
    useState(false);
  const label = field?.label ?? path;
  const spec: MetadataFieldHelpSpec = {
    label,
    field,
    path,
    valueType,
  };
  const guidance =
    resolveEffectiveMetadataFieldGuidance(
      spec,
    );
  const groups = field
    ? buildMetadataAliasGroups(field)
    : [];

  return (
    <>
      <span className="metadata-field-controls">
        <button
          type="button"
          className="metadata-field-control"
          tabIndex={-1}
          aria-label={`Help and field information for ${label}`}
          title="Help and field information"
          onClick={() => setModalOpen(true)}
        >
          ?
        </button>
      </span>

      {modalOpen && (
        <MetadataFieldModal
          title={`${label} — Help`}
          onClose={() => setModalOpen(false)}
        >
          {guidance.commonValues.length > 0 && (
            <section className="metadata-field-guidance metadata-field-common-values">
              <h4>Common values</h4>
              <ul className="metadata-field-modal-values">
                {guidance.commonValues.map(
                  (value) => (
                    <li key={value}>
                      <code>{value}</code>
                    </li>
                  ),
                )}
              </ul>
              <p className="metadata-field-guidance-note">
                {field?.editor?.control ===
                "select-or-custom"
                  ? "Choose a standard value in Edit mode, or select Other… to preserve a custom value from liner notes or another source."
                  : "Suggested vocabulary; values are not restricted unless the field guidance explicitly says otherwise."}
              </p>
            </section>
          )}

          <section className="metadata-field-guidance metadata-field-value-guidance">
            <h4>Value guidance</h4>
            <p>{guidance.help}</p>

            {guidance.examples.length > 0 && (
              <div className="metadata-field-guidance-examples">
                <h5>Examples</h5>
                <ul className="metadata-field-modal-values">
                  {guidance.examples.map(
                    (value) => (
                      <li key={value}>
                        <code>{value}</code>
                      </li>
                    ),
                  )}
                </ul>
              </div>
            )}
          </section>

          <section className="metadata-field-guidance metadata-field-about">
            <h4>About this field</h4>
            <p>
              {field?.description ??
                "Metadata value stored at this canonical TOML path."}
            </p>
          </section>

          {!field && (
            <p className="metadata-field-guidance-note metadata-field-full-width">
              This path uses supplemental guidance until
              a dedicated canonical registry entry is
              added.
            </p>
          )}

          <details className="metadata-field-guidance metadata-help-technical-disclosure metadata-tag-disclosure">
            <summary>
              <span>Technical details</span>
              <small>
                Canonical path, data type, and field behavior
              </small>
            </summary>

            <div className="metadata-help-technical-content metadata-tag-disclosure-content">
              <MetadataFieldFacts spec={spec} />

              {field && groups.length > 0 && (
                <details className="metadata-tag-details metadata-tag-details-inline metadata-tag-disclosure">
                  <summary>
                    <span>
                      Player compatibility and tag mappings
                    </span>
                    <small>
                      {groups.length} mapping
                      {groups.length === 1 ? " group" : " groups"}
                    </small>
                  </summary>

                  <div className="metadata-tag-disclosure-content">
                    <dl className="metadata-aliases">
                      {groups.map((group) => (
                        <div key={group.label}>
                          <dt>{group.label}</dt>
                          <dd
                            className={
                              group.verified === false
                                ? "alias-unverified"
                                : undefined
                            }
                          >
                            {group.values.join(", ")}
                          </dd>
                        </div>
                      ))}
                    </dl>

                    <MetadataCompatibilityNotes
                      field={field}
                    />
                  </div>
                </details>
              )}
            </div>
          </details>
        </MetadataFieldModal>
      )}
    </>
  );
}

type MetadataFieldPairHelpProps = {
  title: string;
  description: string;
  nameField:
    | MetadataFieldDefinition
    | undefined;
  namePath: string;
  roleField:
    | MetadataFieldDefinition
    | undefined;
  rolePath: string;
  nameGuidance: string;
  roleGuidance: string;
  nameExample: string;
  roleExample: string;
  commonRoleValues: string[];
  fieldOrder?: "name-role" | "role-name";
};

function MetadataFieldPairHelpModal({
  title,
  description,
  nameField,
  namePath,
  roleField,
  rolePath,
  nameGuidance,
  roleGuidance,
  nameExample,
  roleExample,
  commonRoleValues,
  fieldOrder = "name-role",
  onClose,
}: MetadataFieldPairHelpProps & {
  onClose: () => void;
}) {
  const nameSpec: MetadataFieldHelpSpec = {
    label: nameField?.label ?? "Name",
    field: nameField,
    path: namePath,
    valueType: "string",
  };
  const roleSpec: MetadataFieldHelpSpec = {
    label: roleField?.label ?? "Role",
    field: roleField,
    path: rolePath,
    valueType: "string",
  };
  const pairFields = {
    name: {
      key: "name",
      label: "Name",
      example: nameExample,
      guidance: nameGuidance,
      spec: nameSpec,
    },
    role: {
      key: "role",
      label: "Role",
      example: roleExample,
      guidance: roleGuidance,
      spec: roleSpec,
    },
  } as const;
  const orderedPairFields =
    fieldOrder === "role-name"
      ? [pairFields.role, pairFields.name]
      : [pairFields.name, pairFields.role];

  return (
    <MetadataFieldModal
      title={`${title} — Help`}
      onClose={onClose}
    >
      {commonRoleValues.length > 0 && (
        <section className="metadata-field-guidance metadata-field-common-values">
          <h4>Common role values</h4>
          <ul className="metadata-field-modal-values">
            {commonRoleValues.map(
              (value) => (
                <li key={value}>
                  <code>{value}</code>
                </li>
              ),
            )}
          </ul>
          <p className="metadata-field-guidance-note">
            Choose a standard role when it matches the credit.
            Select Other… to preserve custom liner-note wording.
          </p>
        </section>
      )}

      <section className="metadata-field-guidance metadata-field-pair-guidance">
        <h4>Field guidance</h4>
        <div className="metadata-field-pair-guidance-grid">
          {orderedPairFields.map(
            (field) => (
              <article key={field.key}>
                <h5>{field.label}</h5>
                <p>{field.guidance}</p>
                <p className="metadata-field-pair-example">
                  <strong>Example:</strong>{" "}
                  <code>{field.example}</code>
                </p>
              </article>
            ),
          )}
        </div>
      </section>

      <section className="metadata-field-guidance metadata-field-pair-about">
        <h4>About this pair</h4>
        <p>{description}</p>
      </section>

      <details className="metadata-field-guidance metadata-help-technical-disclosure metadata-tag-disclosure">
        <summary>
          <span>Technical details</span>
          <small>
            Canonical paths, data types, and field behavior
          </small>
        </summary>

        <div className="metadata-help-technical-content metadata-tag-disclosure-content">
          <div className="metadata-field-pair-facts-grid">
            {orderedPairFields.map(
              (field) => (
                <article key={field.key}>
                  <h5>{field.label} field</h5>
                  <MetadataFieldFacts
                    spec={field.spec}
                  />
                </article>
              ),
            )}
          </div>
        </div>
      </details>
    </MetadataFieldModal>
  );
}

function MetadataFieldPairControls(
  props: MetadataFieldPairHelpProps,
) {
  const [modalOpen, setModalOpen] =
    useState(false);

  return (
    <>
      <button
        type="button"
        className="metadata-field-control"
        tabIndex={-1}
        aria-label={`Help and field information for ${props.title}`}
        title={`Help for ${props.title}`}
        onClick={() => setModalOpen(true)}
      >
        ?
      </button>

      {modalOpen && (
        <MetadataFieldPairHelpModal
          {...props}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}

function activeReadinessDocuments(
  scope: MetadataReadinessScope,
  skippedPaths: ReadonlySet<string>,
): MissingMetadataDocument[] {
  return scope.missingDocuments.filter(
    (file) =>
      file.importance !== "supplemental" ||
      !skippedPaths.has(file.relativePath),
  );
}

function ReadinessNavBadge({
  scope,
  skippedPaths,
  showComplete = false,
}: {
  scope?: MetadataReadinessScope;
  skippedPaths: ReadonlySet<string>;
  showComplete?: boolean;
}) {
  if (!scope) {
    return null;
  }

  const documents = activeReadinessDocuments(
    scope,
    skippedPaths,
  );
  const documentSummary =
    summarizeMissingMetadataDocuments(documents);
  const count =
    documentSummary.total +
    scope.missingRequiredFields.length;

  if (count === 0) {
    if (!showComplete) {
      return null;
    }

    return (
      <small
        className="readiness-count complete"
        title="Metadata readiness: complete"
        aria-label="Metadata readiness: complete"
      >
        Metadata ✓
      </small>
    );
  }

  const tone =
    scope.missingRequiredFields.length > 0 ||
    documentSummary.core > 0
      ? "missing"
      : documentSummary.credits > 0
        ? "warning"
        : "supplemental";
  const details = [
    ...documents.map((file) => file.filename),
    ...scope.missingRequiredFields.map(
      (field) => field.label,
    ),
  ].join(", ");

  return (
    <small
      className={`readiness-count ${tone}`}
      title={`Metadata readiness · Needs attention: ${details}`}
      aria-label={`Metadata readiness: ${count} item${count === 1 ? "" : "s"} need attention`}
    >
      {count}
    </small>
  );
}

function MetadataReadinessWorkItem({
  target,
  creating,
  onCreate,
  onSkip,
  onEditField,
  onClose,
}: {
  target: ReadinessNavigationTarget;
  creating: boolean;
  onCreate: (file: MissingMetadataDocument) => void;
  onSkip: (file: MissingMetadataDocument) => void;
  onEditField: (field: RequiredFieldIssue) => void;
  onClose: () => void;
}) {
  return (
    <section
      id="metadata-readiness-work-item"
      className="metadata-readiness-work-item"
      tabIndex={-1}
    >
      <header>
        <div>
          <span className="eyebrow">Readiness task</span>
          <h2>
            {target.kind === "document"
              ? target.file.filename
              : target.field.label}
          </h2>
        </div>
        <button
          type="button"
          className="metadata-readiness-work-close"
          aria-label="Close readiness task"
          onClick={onClose}
        >
          ×
        </button>
      </header>

      {target.kind === "document" ? (
        <>
          <p>{target.file.description}</p>
          <code>{target.file.relativePath}</code>
          <p className="metadata-readiness-work-guidance">
            Create this document to expose its fields in the current tab. Creation uses the existing validated, no-overwrite metadata workflow; the editor opens immediately afterward.
          </p>
          <div className="metadata-readiness-work-actions">
            {target.file.importance === "supplemental" && (
              <button
                type="button"
                className="secondary"
                disabled={creating}
                onClick={() => onSkip(target.file)}
              >
                Skip optional file
              </button>
            )}
            <button
              type="button"
              disabled={creating}
              onClick={() => onCreate(target.file)}
            >
              {creating
                ? "Creating…"
                : "Create and edit"}
            </button>
          </div>
        </>
      ) : (
        <>
          <p>
            This required field is blank or absent. Open edit mode and the interface will move to its metadata row.
          </p>
          <code>{target.field.tomlPath}</code>
          <div className="metadata-readiness-work-actions">
            <button
              type="button"
              onClick={() => onEditField(target.field)}
            >
              Edit this field
            </button>
          </div>
        </>
      )}
    </section>
  );
}

export {
  MetadataFieldLabel,
  isTrackDiscNumberingPath,
  isRelatedMetadataTagPath,
  resolveMetadataRowGroup,
  MetadataFieldModal,
  MetadataActivityLogModal,
  PerformerCreditCopyModal,
  describeMetadataValueGuidance,
  type SupplementalFieldGuidance,
  normalizeMetadataGuidancePath,
  getSupplementalFieldGuidance,
  type MetadataFieldHelpSpec,
  mergeMetadataGuidanceValues,
  type EffectiveMetadataFieldGuidance,
  resolveEffectiveMetadataFieldGuidance,
  MetadataFieldFacts,
  MetadataFieldControls,
  type MetadataFieldPairHelpProps,
  MetadataFieldPairHelpModal,
  MetadataFieldPairControls,
  activeReadinessDocuments,
  ReadinessNavBadge,
  MetadataReadinessWorkItem,
};
