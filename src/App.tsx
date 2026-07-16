import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  flattenMetadata,
  type FlattenedMetadataRow,
} from "./metadata-flattener.js";

type MetadataFileStatus = {
  filename: string;
  relativePath: string;
  exists: boolean;
};

type DiscoveredAsset = {
  filename: string;
  relativePath: string;
  extension: string;
};

type TrackScanResult = {
  id: string;
  relativePath: string;
  metadataFiles: MetadataFileStatus[];
  audioMasters: DiscoveredAsset[];
  artworkMasters: DiscoveredAsset[];
};

type ReleaseScanResult = {
  id: string;
  relativePath: string;
  metadataFiles: MetadataFileStatus[];
  artworkMasters: DiscoveredAsset[];
  tracks: TrackScanResult[];
};

type LibraryScanResult = {
  scannedAt: string;
  releases: ReleaseScanResult[];
  warnings: string[];
};

type InferredValue<T> = {
  value: T;
  source: string;
};

type ReleaseMetadataPreview = {
  releaseId: InferredValue<string>;
  releaseDate?: InferredValue<string>;
  releaseTitle?: InferredValue<string>;
  artworkMasterPath?: InferredValue<string>;
};

type TrackMetadataPreview = {
  trackId: InferredValue<string>;
  artistName?: InferredValue<string>;
  trackNumber?: InferredValue<number>;
  trackTitle?: InferredValue<string>;
  audioMasterPath?: InferredValue<string>;
  artworkMasterPath?: InferredValue<string>;
};

type LibraryMetadataPreview = {
  release: ReleaseMetadataPreview;
  tracks: TrackMetadataPreview[];
  warnings: string[];
};

type GeneratedMetadataDocument = {
  storageRole: string;
  filename: string;
  relativePath: string;
  content: string;
  validated: boolean;
};

type GeneratedMetadataPreview = {
  releaseId: string;
  documents: GeneratedMetadataDocument[];
  warnings: string[];
};

type GenerationPlanAction =
  | "create"
  | "blocked";

type GenerationPlanItem = {
  storageRole: string;
  filename: string;
  relativePath: string;
  action: GenerationPlanAction;
  reason: string;
  content: string;
  validated: boolean;
};

type MetadataGenerationScope =
  | "all"
  | "release"
  | "track";

type MetadataGenerationPlan = {
  releaseId: string;
  scope: MetadataGenerationScope;
  trackId?: string;
  items: GenerationPlanItem[];
  summary: {
    createCount: number;
    blockedCount: number;
  };
  warnings: string[];
};


type ParsedMetadataDocument = {
  filename: string;
  relativePath: string;
  scope: "release" | "track";
  trackId?: string;
  content: string;
  sha256: string;
  parsed: Record<string, unknown>;
};

type ReleaseMetadataDetail = {
  releaseId: string;
  releaseRelativePath: string;
  documents: ParsedMetadataDocument[];
  missingFiles: MetadataFileStatus[];
  warnings: string[];
};




type MetadataFieldDefinition = {
  id: string;
  canonicalName: string;
  label: string;
  description: string;
  scope: string;
  storageFileRole: string;
  tomlPath: string;
  valueType: string;
  required: boolean;
  repeatable: boolean;
  inherited: boolean;
  aliases?: {
    ffmpeg?: string[];
    id3?: string[];
    vorbis?: string[];
    mp4?: string[];
    riff?: string[];
    players?: {
      vlc?: string[];
      appleMusic?: string[];
      windowsMediaPlayer?: string[];
      windowsMediaPlayerLegacy?: string[];
    };
  };
  playerCompatibility?: Array<{
    player:
      | "vlc"
      | "appleMusic"
      | "windowsMediaPlayer"
      | "windowsMediaPlayerLegacy";
    containers: string[];
    status:
      | "verified"
      | "partial"
      | "not-visible";
    displayLabel?: string;
    note: string;
  }>;
  displayPolicy: string;
};

type MetadataRegistryResponse = {
  fields: MetadataFieldDefinition[];
};


type ApplicationView =
  | "library"
  | "compatibility";

type CompatibilityStatusFilter =
  | "all"
  | "verified"
  | "partial"
  | "not-visible"
  | "unverified";


type ExportContainer =
  | "mp3"
  | "flac"
  | "m4a"
  | "ogg-vorbis"
  | "opus"
  | "wav";

type ExportGuidanceStatus =
  | "supported"
  | "normalized"
  | "omitted"
  | "unverified";

type ExportGuidance = {
  status: ExportGuidanceStatus;
  tags: string[];
  note: string;
};

const exportContainerLabels:
  Record<ExportContainer, string> = {
    mp3: "MP3 / ID3",
    flac: "FLAC / Vorbis",
    m4a: "M4A / MP4",
    "ogg-vorbis": "OGG Vorbis",
    opus: "Opus",
    wav: "WAV / RIFF",
  };

const coreExportPaths = new Set([
  "release.title",
  "release.primary_artist.name",
  "release.dates.release",
  "release.genres",
  "track.title",
  "track.primary_artist.name",
  "track.numbering.track_number",
]);

function formatMetadataValue(
  value: unknown,
): string {
  if (Array.isArray(value)) {
    return value.length === 0
      ? "[]"
      : JSON.stringify(value);
  }

  if (
    typeof value === "object" &&
    value !== null
  ) {
    return JSON.stringify(value);
  }

  if (value === "") {
    return "(blank)";
  }

  if (value === null) {
    return "null";
  }

  return String(value);
}

export function App() {
  const [scan, setScan] =
    useState<LibraryScanResult | null>(null);
  const [error, setError] =
    useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [
    selectedReleaseDetail,
    setSelectedReleaseDetail,
  ] = useState<ReleaseMetadataDetail | null>(
    null,
  );
  const [
    detailLoading,
    setDetailLoading,
  ] = useState(false);
  const [detailError, setDetailError] =
    useState<string | null>(null);
  const [metadataRegistry, setMetadataRegistry] =
    useState<MetadataFieldDefinition[]>([]);
  const [applicationView, setApplicationView] =
    useState<ApplicationView>("library");

  const openReleaseDetail = useCallback(
    async (releaseId: string) => {
      setDetailLoading(true);
      setDetailError(null);

      try {
        const query = new URLSearchParams({
          release: releaseId,
        });

        const response = await fetch(
          `/api/library/release-detail?${query.toString()}`,
        );

        const result =
          (await response.json()) as
            | ReleaseMetadataDetail
            | {
                error?: string;
              };

        if (!response.ok) {
          throw new Error(
            "error" in result
              ? result.error ??
                  `Detail request failed: HTTP ${response.status}`
              : `Detail request failed: HTTP ${response.status}`,
          );
        }

        setSelectedReleaseDetail(
          result as ReleaseMetadataDetail,
        );
      } catch (error) {
        setDetailError(
          error instanceof Error
            ? error.message
            : "Unknown metadata-detail error",
        );
      } finally {
        setDetailLoading(false);
      }
    },
    [],
  );

  const refreshLibrary = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        "/api/library/scan",
      );

      if (!response.ok) {
        throw new Error(
          `Library scan failed: HTTP ${response.status}`,
        );
      }

      setScan(
        (await response.json()) as LibraryScanResult,
      );
    } catch (scanError) {
      setError(
        scanError instanceof Error
          ? scanError.message
          : "Unknown scan error",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshLibrary();
  }, [refreshLibrary]);


  useEffect(() => {
    const loadRegistry = async () => {
      try {
        const response = await fetch(
          "/api/metadata/registry",
        );

        if (!response.ok) {
          return;
        }

        const result =
          (await response.json()) as
            MetadataRegistryResponse;

        setMetadataRegistry(result.fields);
      } catch {
        // The metadata table remains usable without registry annotations.
      }
    };

    void loadRegistry();
  }, []);

  const summary = useMemo(() => {
    if (!scan) {
      return null;
    }

    let trackCount = 0;
    let missingMetadataCount = 0;
    let audioMasterCount = 0;
    let artworkMasterCount = 0;

    for (const release of scan.releases) {
      trackCount += release.tracks.length;
      artworkMasterCount +=
        release.artworkMasters.length;

      missingMetadataCount +=
        release.metadataFiles.filter(
          (file) => !file.exists,
        ).length;

      for (const track of release.tracks) {
        missingMetadataCount +=
          track.metadataFiles.filter(
            (file) => !file.exists,
          ).length;

        audioMasterCount +=
          track.audioMasters.length;
        artworkMasterCount +=
          track.artworkMasters.length;
      }
    }

    return {
      releaseCount: scan.releases.length,
      trackCount,
      missingMetadataCount,
      audioMasterCount,
      artworkMasterCount,
    };
  }, [scan]);

  return (
    <main>
      {selectedReleaseDetail ? (
        <ReleaseMetadataDetailView
          detail={selectedReleaseDetail}
          metadataRegistry={metadataRegistry}
          onBack={() =>
            setSelectedReleaseDetail(null)
          }
          onRefresh={() =>
            void openReleaseDetail(
              selectedReleaseDetail.releaseId,
            )
          }
        />
      ) : (
        <>
          <header className="page-header">
            <div>
              <p className="eyebrow">
                Local administration
              </p>
              <h1>Metadata Editor</h1>
              <p className="subtitle">
                {applicationView === "library"
                  ? "Library discovery and metadata editing"
                  : "Verified player and container mappings"}
              </p>
            </div>

            {applicationView === "library" && (
              <button
                type="button"
                disabled={loading}
                onClick={() =>
                  void refreshLibrary()
                }
              >
                {loading
                  ? "Scanning…"
                  : "Refresh library"}
              </button>
            )}
          </header>

          <nav
            className="application-tabs"
            aria-label="Metadata editor sections"
          >
            <button
              type="button"
              className={
                applicationView === "library"
                  ? "active"
                  : undefined
              }
              aria-pressed={
                applicationView === "library"
              }
              onClick={() =>
                setApplicationView("library")
              }
            >
              Library
            </button>

            <button
              type="button"
              className={
                applicationView ===
                "compatibility"
                  ? "active"
                  : undefined
              }
              aria-pressed={
                applicationView ===
                "compatibility"
              }
              onClick={() =>
                setApplicationView(
                  "compatibility",
                )
              }
            >
              Compatibility
            </button>
          </nav>

          {applicationView ===
          "compatibility" ? (
            <MetadataCompatibilityView
              fields={metadataRegistry}
            />
          ) : (
            <>
              {error && (
                <p className="message error">
                  {error}
                </p>
              )}

              {scan && summary && (
                <>
                  <section className="summary-grid">
                    <SummaryCard
                      label="Releases"
                      value={summary.releaseCount}
                    />
                    <SummaryCard
                      label="Tracks"
                      value={summary.trackCount}
                    />
                    <SummaryCard
                      label="Missing TOMLs"
                      value={
                        summary.missingMetadataCount
                      }
                      warning={
                        summary.missingMetadataCount >
                        0
                      }
                    />
                    <SummaryCard
                      label="Audio masters"
                      value={
                        summary.audioMasterCount
                      }
                    />
                    <SummaryCard
                      label="Artwork masters"
                      value={
                        summary.artworkMasterCount
                      }
                    />
                  </section>

                  <p className="scan-time">
                    Last scan:{" "}
                    {new Date(
                      scan.scannedAt,
                    ).toLocaleString()}
                  </p>

                  {scan.warnings.length > 0 && (
                    <section className="warning-panel">
                      <h2>Scanner warnings</h2>

                      <ul>
                        {scan.warnings.map(
                          (warning) => (
                            <li key={warning}>
                              {warning}
                            </li>
                          ),
                        )}
                      </ul>
                    </section>
                  )}

                  <section className="release-list">
                    {scan.releases.map(
                      (release) => (
                        <ReleaseCard
                          key={
                            release.relativePath
                          }
                          release={release}
                          onLibraryChanged={
                            refreshLibrary
                          }
                          onOpenMetadata={() =>
                            void openReleaseDetail(
                              release.id,
                            )
                          }
                        />
                      ),
                    )}
                  </section>
                </>
              )}

              {detailError && (
                <p className="message error">
                  {detailError}
                </p>
              )}

              {detailLoading && (
                <p className="message">
                  Loading metadata detail…
                </p>
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}

function getCompatibilityStatus(
  field: MetadataFieldDefinition,
): CompatibilityStatusFilter {
  const results =
    field.playerCompatibility ?? [];

  if (
    results.some(
      (result) =>
        result.status === "verified",
    )
  ) {
    return "verified";
  }

  if (
    results.some(
      (result) =>
        result.status === "partial",
    )
  ) {
    return "partial";
  }

  if (
    results.some(
      (result) =>
        result.status === "not-visible",
    )
  ) {
    return "not-visible";
  }

  return "unverified";
}

function formatAliasValues(
  values: string[] | undefined,
): string {
  return values && values.length > 0
    ? values.join(", ")
    : "—";
}

function getContainerTags(
  field: MetadataFieldDefinition,
  container: ExportContainer,
): string[] {
  switch (container) {
    case "mp3":
      return field.aliases?.id3 ?? [];
    case "flac":
    case "ogg-vorbis":
    case "opus":
      return field.aliases?.vorbis ?? [];
    case "m4a":
      return field.aliases?.mp4 ?? [];
    case "wav":
      return field.aliases?.riff ?? [];
  }
}

function getExportGuidance(
  field: MetadataFieldDefinition,
  container: ExportContainer,
): ExportGuidance {
  const tags = getContainerTags(
    field,
    container,
  );

  const omittedByWav = new Set([
    "release.primary_artist.name",
    "track.numbering.disc_number",
    "track.numbering.disc_total",
    "track.composers[].name",
  ]);

  if (
    container === "wav" &&
    omittedByWav.has(field.tomlPath)
  ) {
    return {
      status: "omitted",
      tags,
      note:
        "The controlled FFmpeg WAV fixture did not preserve this value.",
    };
  }

  if (tags.length === 0) {
    return {
      status: "unverified",
      tags: [],
      note:
        "No verified container tag is registered for this field.",
    };
  }

  if (
    field.tomlPath ===
      "release.dates.release" &&
    ["mp3", "m4a", "wav"].includes(
      container,
    )
  ) {
    return {
      status: "normalized",
      tags,
      note:
        "FFprobe preserved the date, but tested players displayed only the four-digit year for this container.",
    };
  }

  if (
    field.tomlPath ===
      "track.numbering.track_number"
  ) {
    return {
      status: "normalized",
      tags,
      note:
        "Current and total numbering may share one container tag. VLC displayed only the current number; Apple Music displayed both values.",
    };
  }

  if (
    field.tomlPath ===
      "track.numbering.track_total" ||
    field.tomlPath ===
      "track.numbering.disc_total"
  ) {
    return {
      status: "normalized",
      tags,
      note:
        "The total is commonly stored with the current track or disc number rather than as an independent visible field.",
    };
  }

  if (
    field.tomlPath ===
      "track.text.comment" &&
    ["flac", "ogg-vorbis", "opus"].includes(
      container,
    )
  ) {
    return {
      status: "normalized",
      tags,
      note:
        "VLC merged comment and description text into its Description field for Vorbis-style containers.",
    };
  }

  return {
    status: "supported",
    tags,
    note:
      "A container tag is registered and the controlled fixture did not identify a preservation failure.",
  };
}

function MetadataCompatibilityView({
  fields,
}: {
  fields: MetadataFieldDefinition[];
}) {
  const [searchText, setSearchText] =
    useState("");
  const [scopeFilter, setScopeFilter] =
    useState("all");
  const [playerFilter, setPlayerFilter] =
    useState("all");
  const [statusFilter, setStatusFilter] =
    useState<CompatibilityStatusFilter>(
      "all",
    );
  const [
    exportContainer,
    setExportContainer,
  ] = useState<ExportContainer>("mp3");

  const scopes = useMemo(
    () =>
      Array.from(
        new Set(
          fields.map((field) => field.scope),
        ),
      ).sort(),
    [fields],
  );

  const visibleFields = useMemo(() => {
    const normalizedSearch =
      searchText.trim().toLowerCase();

    return fields.filter((field) => {
      if (
        scopeFilter !== "all" &&
        field.scope !== scopeFilter
      ) {
        return false;
      }

      const status =
        getCompatibilityStatus(field);

      if (
        statusFilter !== "all" &&
        status !== statusFilter
      ) {
        return false;
      }

      if (playerFilter !== "all") {
        const playerAliases =
          field.aliases?.players?.[
            playerFilter as
              | "vlc"
              | "appleMusic"
              | "windowsMediaPlayer"
              | "windowsMediaPlayerLegacy"
          ] ?? [];

        const playerResults =
          field.playerCompatibility?.filter(
            (result) =>
              result.player === playerFilter,
          ) ?? [];

        if (
          playerAliases.length === 0 &&
          playerResults.length === 0
        ) {
          return false;
        }
      }

      if (!normalizedSearch) {
        return true;
      }

      const searchable = [
        field.label,
        field.tomlPath,
        field.description,
        field.scope,
        field.storageFileRole,
        ...(field.aliases?.ffmpeg ?? []),
        ...(field.aliases?.id3 ?? []),
        ...(field.aliases?.vorbis ?? []),
        ...(field.aliases?.mp4 ?? []),
        ...(field.aliases?.riff ?? []),
        ...(field.aliases?.players?.vlc ??
          []),
        ...(field.aliases?.players
          ?.appleMusic ?? []),
      ]
        .join(" ")
        .toLowerCase();

      return searchable.includes(
        normalizedSearch,
      );
    });
  }, [
    fields,
    playerFilter,
    scopeFilter,
    searchText,
    statusFilter,
  ]);

  const exportSummary = useMemo(() => {
    const guidance = fields.map((field) => ({
      field,
      guidance: getExportGuidance(
        field,
        exportContainer,
      ),
    }));

    const counts = {
      supported: 0,
      normalized: 0,
      omitted: 0,
      unverified: 0,
    };

    for (const item of guidance) {
      counts[item.guidance.status] += 1;
    }

    const recommended = guidance
      .filter(
        (item) =>
          coreExportPaths.has(
            item.field.tomlPath,
          ) &&
          (
            item.guidance.status ===
              "supported" ||
            item.guidance.status ===
              "normalized"
          ),
      )
      .map((item) => item.field.label);

    return {
      counts,
      recommended,
    };
  }, [exportContainer, fields]);

  return (
    <section className="compatibility-view">
      <header className="compatibility-header">
        <div>
          <p className="eyebrow">
            Registry evidence
          </p>
          <h2>Metadata compatibility</h2>
          <p>
            Canonical TOML fields, container
            tags, and player-visible mappings.
            Windows mappings remain unverified.
          </p>
        </div>

        <strong>
          {visibleFields.length} of{" "}
          {fields.length} fields
        </strong>
      </header>

      <section
        className="compatibility-filters"
        aria-label="Compatibility filters"
      >
        <label>
          <span>Search</span>
          <input
            type="search"
            value={searchText}
            placeholder="Field, path, tag, player label…"
            onChange={(event) =>
              setSearchText(
                event.currentTarget.value,
              )
            }
          />
        </label>

        <label>
          <span>Scope</span>
          <select
            value={scopeFilter}
            onChange={(event) =>
              setScopeFilter(
                event.currentTarget.value,
              )
            }
          >
            <option value="all">
              All scopes
            </option>
            {scopes.map((scope) => (
              <option
                key={scope}
                value={scope}
              >
                {scope}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Player</span>
          <select
            value={playerFilter}
            onChange={(event) =>
              setPlayerFilter(
                event.currentTarget.value,
              )
            }
          >
            <option value="all">
              All players
            </option>
            <option value="vlc">VLC</option>
            <option value="appleMusic">
              Apple Music
            </option>
            <option value="windowsMediaPlayer">
              Windows Media Player
            </option>
            <option value="windowsMediaPlayerLegacy">
              Windows Media Player Legacy
            </option>
          </select>
        </label>

        <label>
          <span>Status</span>
          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(
                event.currentTarget
                  .value as
                  CompatibilityStatusFilter,
              )
            }
          >
            <option value="all">
              All statuses
            </option>
            <option value="verified">
              Verified
            </option>
            <option value="partial">
              Partial
            </option>
            <option value="not-visible">
              Not visible
            </option>
            <option value="unverified">
              Unverified
            </option>
          </select>
        </label>

        <label>
          <span>Export container</span>
          <select
            value={exportContainer}
            onChange={(event) =>
              setExportContainer(
                event.currentTarget
                  .value as ExportContainer,
              )
            }
          >
            {Object.entries(
              exportContainerLabels,
            ).map(([value, label]) => (
              <option
                key={value}
                value={value}
              >
                {label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className="export-guidance-summary">
        <header>
          <div>
            <p className="eyebrow">
              Selected export target
            </p>
            <h3>
              {
                exportContainerLabels[
                  exportContainer
                ]
              }
            </h3>
          </div>

          <div className="export-guidance-counts">
            <span className="guidance-supported">
              {exportSummary.counts.supported}
              {" supported"}
            </span>
            <span className="guidance-normalized">
              {exportSummary.counts.normalized}
              {" normalized"}
            </span>
            <span className="guidance-omitted">
              {exportSummary.counts.omitted}
              {" omitted"}
            </span>
            <span className="guidance-unverified">
              {exportSummary.counts.unverified}
              {" unverified"}
            </span>
          </div>
        </header>

        <p>
          <strong>
            Recommended core fields:
          </strong>{" "}
          {exportSummary.recommended.length >
          0
            ? exportSummary.recommended.join(
                ", ",
              )
            : "No verified core fields for this target."}
        </p>
      </section>

      {visibleFields.length === 0 ? (
        <p className="empty-state">
          No registry fields match these
          filters.
        </p>
      ) : (
        <div className="compatibility-table-wrap">
          <table className="compatibility-table">
            <thead>
              <tr>
                <th>Canonical field</th>
                <th>FFmpeg</th>
                <th>ID3</th>
                <th>Vorbis</th>
                <th>MP4</th>
                <th>RIFF</th>
                <th>
                  Export guidance
                </th>
                <th>VLC</th>
                <th>Apple Music</th>
                <th>
                  Windows Media Player
                </th>
                <th>
                  Windows Media Player Legacy
                </th>
              </tr>
            </thead>

            <tbody>
              {visibleFields.map((field) => {
                const status =
                  getCompatibilityStatus(
                    field,
                  );

                return (
                  <tr key={field.id}>
                    <th scope="row">
                      <div className="compatibility-field">
                        <strong>
                          {field.label}
                        </strong>
                        <code>
                          {field.tomlPath}
                        </code>
                        <span>
                          {field.scope}
                          {" · "}
                          {field.valueType}
                        </span>
                        <small>
                          {field.description}
                        </small>
                        <span
                          className={`compatibility-status status-${status}`}
                        >
                          {status.replace(
                            "-",
                            " ",
                          )}
                        </span>
                      </div>
                    </th>
                    <td>
                      {formatAliasValues(
                        field.aliases?.ffmpeg,
                      )}
                    </td>
                    <td>
                      {formatAliasValues(
                        field.aliases?.id3,
                      )}
                    </td>
                    <td>
                      {formatAliasValues(
                        field.aliases?.vorbis,
                      )}
                    </td>
                    <td>
                      {formatAliasValues(
                        field.aliases?.mp4,
                      )}
                    </td>
                    <td>
                      {formatAliasValues(
                        field.aliases?.riff,
                      )}
                    </td>
                    <td>
                      <ExportGuidanceCell
                        field={field}
                        container={
                          exportContainer
                        }
                      />
                    </td>
                    <td>
                      <CompatibilityPlayerCell
                        field={field}
                        player="vlc"
                      />
                    </td>
                    <td>
                      <CompatibilityPlayerCell
                        field={field}
                        player="appleMusic"
                      />
                    </td>
                    <td>
                      <CompatibilityPlayerCell
                        field={field}
                        player="windowsMediaPlayer"
                      />
                    </td>
                    <td>
                      <CompatibilityPlayerCell
                        field={field}
                        player="windowsMediaPlayerLegacy"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ExportGuidanceCell({
  field,
  container,
}: {
  field: MetadataFieldDefinition;
  container: ExportContainer;
}) {
  const guidance = getExportGuidance(
    field,
    container,
  );

  return (
    <div className="export-guidance-cell">
      <span
        className={`export-guidance-status guidance-${guidance.status}`}
      >
        {guidance.status}
      </span>

      <code>
        {guidance.tags.length > 0
          ? guidance.tags.join(", ")
          : "No registered tag"}
      </code>

      <small>{guidance.note}</small>
    </div>
  );
}

function CompatibilityPlayerCell({
  field,
  player,
}: {
  field: MetadataFieldDefinition;
  player:
    | "vlc"
    | "appleMusic"
    | "windowsMediaPlayer"
    | "windowsMediaPlayerLegacy";
}) {
  const aliases =
    field.aliases?.players?.[player] ?? [];

  const results =
    field.playerCompatibility?.filter(
      (result) =>
        result.player === player,
    ) ?? [];

  if (
    aliases.length === 0 &&
    results.length === 0
  ) {
    return (
      <span className="compatibility-unverified">
        Not verified
      </span>
    );
  }

  return (
    <div className="compatibility-player-cell">
      <strong>
        {aliases.length > 0
          ? aliases.join(", ")
          : "No visible label"}
      </strong>

      {results.map((result) => (
        <details
          key={[
            result.player,
            result.status,
            result.containers.join("-"),
          ].join(":")}
        >
          <summary>
            <span
              className={`compatibility-status status-${result.status}`}
            >
              {result.status.replace(
                "-",
                " ",
              )}
            </span>
            {result.containers.join(", ")}
          </summary>
          <p>{result.note}</p>
        </details>
      ))}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  warning = false,
}: {
  label: string;
  value: number;
  warning?: boolean;
}) {
  return (
    <section
      className={`summary-card${
        warning ? " warning" : ""
      }`}
    >
      <span>{label}</span>
      <strong>{value}</strong>
    </section>
  );
}

function ReleaseCard({
  release,
  onLibraryChanged,
  onOpenMetadata,
}: {
  release: ReleaseScanResult;
  onLibraryChanged: () => Promise<void>;
  onOpenMetadata: () => void;
}) {
  const [preview, setPreview] =
    useState<LibraryMetadataPreview | null>(null);
  const [previewError, setPreviewError] =
    useState<string | null>(null);
  const [previewLoading, setPreviewLoading] =
    useState(false);
  const [generatedPreview, setGeneratedPreview] =
    useState<GeneratedMetadataPreview | null>(null);
  const [
    generatedPreviewError,
    setGeneratedPreviewError,
  ] = useState<string | null>(null);
  const [
    generatedPreviewLoading,
    setGeneratedPreviewLoading,
  ] = useState(false);
  const [generationPlan, setGenerationPlan] =
    useState<MetadataGenerationPlan | null>(null);
  const [
    generationPlanError,
    setGenerationPlanError,
  ] = useState<string | null>(null);
  const [
    generationPlanLoading,
    setGenerationPlanLoading,
  ] = useState(false);
  const [generationScope, setGenerationScope] =
    useState<MetadataGenerationScope>("all");
  const [selectedTrackId, setSelectedTrackId] =
    useState(
      release.tracks[0]?.id ?? "",
    );
  const [confirmationText, setConfirmationText] =
    useState("");
  const [creationLoading, setCreationLoading] =
    useState(false);
  const [creationError, setCreationError] =
    useState<string | null>(null);
  const [creationMessage, setCreationMessage] =
    useState<string | null>(null);

  const loadPreview = async () => {
    setPreviewLoading(true);
    setPreviewError(null);

    try {
      const query = new URLSearchParams({
        release: release.id,
      });

      const response = await fetch(
        `/api/library/preview?${query.toString()}`,
      );

      if (!response.ok) {
        throw new Error(
          `Preview failed: HTTP ${response.status}`,
        );
      }

      setPreview(
        (await response.json()) as LibraryMetadataPreview,
      );
    } catch (error) {
      setPreviewError(
        error instanceof Error
          ? error.message
          : "Unknown preview error",
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  const loadGeneratedPreview = async () => {
    setGeneratedPreviewLoading(true);
    setGeneratedPreviewError(null);

    try {
      const query = new URLSearchParams({
        release: release.id,
      });

      const response = await fetch(
        `/api/library/generated-preview?${query.toString()}`,
      );

      if (!response.ok) {
        throw new Error(
          `Generated preview failed: HTTP ${response.status}`,
        );
      }

      setGeneratedPreview(
        (await response.json()) as GeneratedMetadataPreview,
      );
    } catch (error) {
      setGeneratedPreviewError(
        error instanceof Error
          ? error.message
          : "Unknown generated-preview error",
      );
    } finally {
      setGeneratedPreviewLoading(false);
    }
  };

  const loadGenerationPlan = async () => {
    setGenerationPlanLoading(true);
    setGenerationPlanError(null);

    try {
      const query = new URLSearchParams({
        release: release.id,
        scope: generationScope,
      });

      if (
        generationScope === "track" &&
        selectedTrackId
      ) {
        query.set("track", selectedTrackId);
      }

      const response = await fetch(
        `/api/library/generation-plan?${query.toString()}`,
      );

      if (!response.ok) {
        throw new Error(
          `Generation plan failed: HTTP ${response.status}`,
        );
      }

      setGenerationPlan(
        (await response.json()) as MetadataGenerationPlan,
      );
    } catch (error) {
      setGenerationPlanError(
        error instanceof Error
          ? error.message
          : "Unknown generation-plan error",
      );
    } finally {
      setGenerationPlanLoading(false);
    }
  };

  const createMissingMetadata = async () => {
    if (
      confirmationText !==
      "CREATE_MISSING_METADATA"
    ) {
      setCreationError(
        "Enter the exact confirmation phrase before creating files.",
      );
      return;
    }

    setCreationLoading(true);
    setCreationError(null);
    setCreationMessage(null);

    try {
      const response = await fetch(
        "/api/library/create-missing-metadata",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            releaseId: release.id,
            scope: generationScope,
            ...(generationScope === "track"
              ? {
                  trackId: selectedTrackId,
                }
              : {}),
            confirmation:
              "CREATE_MISSING_METADATA",
          }),
        },
      );

      const result = (await response.json()) as {
        created?: string[];
        blocked?: string[];
        receipts?: Array<{
          relativePath: string;
          bytes: number;
          sha256: string;
          verifiedAt: string;
        }>;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(
          result.error ??
            `Metadata creation failed: HTTP ${response.status}`,
        );
      }

      const createdCount =
        result.created?.length ?? 0;
      const blockedCount =
        result.blocked?.length ?? 0;

      const verifiedCount =
        result.receipts?.length ?? 0;

      setCreationMessage(
        `Created ${createdCount} metadata files; verified ${verifiedCount}; ${blockedCount} existing files remained blocked.`,
      );
      setConfirmationText("");

      // Refresh both the library scan and the local plan.
      await onLibraryChanged();
      await loadGenerationPlan();
    } catch (error) {
      setCreationError(
        error instanceof Error
          ? error.message
          : "Unknown metadata creation error",
      );
    } finally {
      setCreationLoading(false);
    }
  };

  const missingCount =
    release.metadataFiles.filter(
      (file) => !file.exists,
    ).length +
    release.tracks.reduce(
      (total, track) =>
        total +
        track.metadataFiles.filter(
          (file) => !file.exists,
        ).length,
      0,
    );

  return (
    <article className="release-card">
      <header className="card-header">
        <div>
          <p className="card-type">
            Release
          </p>
          <h2>{release.id}</h2>
          <code>{release.relativePath}</code>
        </div>

        <div className="card-actions">
          <button
            type="button"
            onClick={onOpenMetadata}
          >
            Open metadata detail
          </button>

          <span
            className={
              missingCount > 0
                ? "badge missing"
                : "badge complete"
            }
          >
            {missingCount > 0
              ? `${missingCount} missing`
              : "Metadata complete"}
          </span>

          <button
            type="button"
            disabled={previewLoading}
            onClick={() => void loadPreview()}
          >
            {previewLoading
              ? "Loading preview…"
              : preview
                ? "Refresh inference"
                : "Preview inferred metadata"}
          </button>

          <button
            type="button"
            disabled={generatedPreviewLoading}
            onClick={() =>
              void loadGeneratedPreview()
            }
          >
            {generatedPreviewLoading
              ? "Rendering TOML…"
              : generatedPreview
                ? "Refresh TOML preview"
                : "Preview generated TOML"}
          </button>

          <button
            type="button"
            disabled={generationPlanLoading}
            onClick={() =>
              void loadGenerationPlan()
            }
          >
            {generationPlanLoading
              ? "Building plan…"
              : generationPlan
                ? "Refresh generation plan"
                : "View generation plan"}
          </button>
        </div>
      </header>

      <section className="detail-grid">
        <MetadataPanel
          title="Release metadata"
          files={release.metadataFiles}
        />

        <AssetPanel
          title="Release artwork"
          assets={release.artworkMasters}
          emptyLabel="No release artwork master detected"
        />
      </section>

      {previewError && (
        <p className="message error">
          {previewError}
        </p>
      )}

      {preview && (
        <MetadataPreviewPanel preview={preview} />
      )}

      {generatedPreviewError && (
        <p className="message error">
          {generatedPreviewError}
        </p>
      )}

      {generatedPreview && (
        <GeneratedTomlPanel
          preview={generatedPreview}
        />
      )}

      {generationPlanError && (
        <p className="message error">
          {generationPlanError}
        </p>
      )}

      {generationPlan && (
        <GenerationPlanPanel
          plan={generationPlan}
          generationScope={generationScope}
          selectedTrackId={selectedTrackId}
          tracks={release.tracks}
          confirmationText={confirmationText}
          creationLoading={creationLoading}
          creationError={creationError}
          creationMessage={creationMessage}
          onGenerationScopeChange={(scope) => {
            setGenerationScope(scope);
            setGenerationPlan(null);
            setConfirmationText("");
          }}
          onSelectedTrackIdChange={(trackId) => {
            setSelectedTrackId(trackId);
            setGenerationPlan(null);
            setConfirmationText("");
          }}
          onConfirmationTextChange={
            setConfirmationText
          }
          onCreate={() =>
            void createMissingMetadata()
          }
        />
      )}

      <section className="tracks">
        <h3>
          Tracks ({release.tracks.length})
        </h3>

        {release.tracks.length === 0 ? (
          <p className="empty-state">
            No track directories discovered.
          </p>
        ) : (
          release.tracks.map((track) => (
            <TrackCard
              key={track.relativePath}
              track={track}
            />
          ))
        )}
      </section>
    </article>
  );
}

function TrackCard({
  track,
}: {
  track: TrackScanResult;
}) {
  return (
    <article className="track-card">
      <header className="track-header">
        <div>
          <p className="card-type">
            Track
          </p>
          <h4>{track.id}</h4>
          <code>{track.relativePath}</code>
        </div>
      </header>

      <section className="detail-grid">
        <MetadataPanel
          title="Track metadata"
          files={track.metadataFiles}
        />

        <div className="asset-stack">
          <AssetPanel
            title="Audio masters"
            assets={track.audioMasters}
            emptyLabel="No audio master detected"
          />

          <AssetPanel
            title="Track artwork"
            assets={track.artworkMasters}
            emptyLabel="No track artwork master detected"
          />
        </div>
      </section>
    </article>
  );
}

type EditableMetadataValue =
  | string
  | number
  | boolean
  | string[];

type MetadataDraft = Record<
  string,
  EditableMetadataValue
>;


type MetadataValueChange = {
  path: string;
  value: EditableMetadataValue;
};

type ScalarMetadataSaveReceipt = {
  relativePath: string;
  backupRelativePath: string;
  previousSha256: string;
  savedSha256: string;
  bytes: number;
  savedAt: string;
};

function isEditableMetadataValue(
  value: unknown,
): value is EditableMetadataValue {
  return (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    (
      Array.isArray(value) &&
      value.every(
        (entry) => typeof entry === "string",
      )
    )
  );
}

function metadataValuesEqual(
  left: EditableMetadataValue,
  right: EditableMetadataValue,
): boolean {
  if (
    Array.isArray(left) &&
    Array.isArray(right)
  ) {
    return (
      left.length === right.length &&
      left.every(
        (entry, index) =>
          entry === right[index],
      )
    );
  }

  return left === right;
}

function stringArrayToEditorText(
  values: string[],
): string {
  return values.join("\n");
}

function editorTextToStringArray(
  value: string,
): string[] {
  return value
    .split("\n")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function buildDocumentDraftKey(
  document: ParsedMetadataDocument,
  metadataPath: string,
): string {
  return `${document.relativePath}::${metadataPath}`;
}

function getDocumentDraftChanges(
  document: ParsedMetadataDocument,
  draft: MetadataDraft,
): MetadataValueChange[] {
  const prefix = `${document.relativePath}::`;

  return Object.entries(draft)
    .filter(([key]) =>
      key.startsWith(prefix),
    )
    .map(([key, value]) => ({
      path: key.slice(prefix.length),
      value,
    }));
}

function removeDocumentDraftChanges(
  document: ParsedMetadataDocument,
  draft: MetadataDraft,
): MetadataDraft {
  const prefix = `${document.relativePath}::`;

  return Object.fromEntries(
    Object.entries(draft).filter(
      ([key]) => !key.startsWith(prefix),
    ),
  );
}

function parseDraftNumber(
  value: string,
): number | null {
  if (value.trim() === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

function normalizeMetadataRegistryPath(
  metadataPath: string,
): string {
  return metadataPath.replace(
    /\[\d+\]/g,
    "[]",
  );
}

function findRegisteredMetadataField(
  metadataRegistry: MetadataFieldDefinition[],
  metadataPath: string,
): MetadataFieldDefinition | undefined {
  const normalizedPath =
    normalizeMetadataRegistryPath(
      metadataPath,
    );

  return metadataRegistry.find(
    (field) =>
      field.tomlPath === metadataPath ||
      field.tomlPath === normalizedPath,
  );
}

type MetadataAliasGroup = {
  label: string;
  values: string[];
  verified?: boolean;
};

function buildMetadataAliasGroups(
  field: MetadataFieldDefinition,
): MetadataAliasGroup[] {
  const groups: MetadataAliasGroup[] = [];

  const addGroup = (
    label: string,
    values: string[] | undefined,
    verified = true,
  ) => {
    if (values && values.length > 0) {
      groups.push({
        label,
        values,
        verified,
      });
    }
  };

  addGroup("FFmpeg", field.aliases?.ffmpeg);
  addGroup("ID3", field.aliases?.id3);
  addGroup("Vorbis", field.aliases?.vorbis);
  addGroup("MP4", field.aliases?.mp4);
  addGroup("RIFF", field.aliases?.riff);

  groups.push({
    label: "VLC",
    values:
      field.aliases?.players?.vlc?.length
        ? field.aliases.players.vlc
        : ["Not yet verified"],
    verified:
      Boolean(
        field.aliases?.players?.vlc?.length,
      ),
  });

  groups.push({
    label: "Apple Music",
    values:
      field.aliases?.players?.appleMusic
        ?.length
        ? field.aliases.players.appleMusic
        : ["Not yet verified"],
    verified:
      Boolean(
        field.aliases?.players?.appleMusic
          ?.length,
      ),
  });

  groups.push({
    label: "Windows Media Player",
    values:
      field.aliases?.players
        ?.windowsMediaPlayer?.length
        ? field.aliases.players
            .windowsMediaPlayer
        : ["Not yet verified"],
    verified:
      Boolean(
        field.aliases?.players
          ?.windowsMediaPlayer?.length,
      ),
  });

  groups.push({
    label: "Windows Media Player Legacy",
    values:
      field.aliases?.players
        ?.windowsMediaPlayerLegacy?.length
        ? field.aliases.players
            .windowsMediaPlayerLegacy
        : ["Not yet verified"],
    verified:
      Boolean(
        field.aliases?.players
          ?.windowsMediaPlayerLegacy?.length,
      ),
  });

  return groups;
}

function ReleaseMetadataDetailView({
  detail,
  metadataRegistry,
  onBack,
  onRefresh,
}: {
  detail: ReleaseMetadataDetail;
  metadataRegistry: MetadataFieldDefinition[];
  onBack: () => void;
  onRefresh: () => void;
}) {
  const [editMode, setEditMode] =
    useState(false);
  const [draft, setDraft] =
    useState<MetadataDraft>({});
  const [
    savingDocumentPath,
    setSavingDocumentPath,
  ] = useState<string | null>(null);
  const [saveError, setSaveError] =
    useState<string | null>(null);
  const [saveReceipt, setSaveReceipt] =
    useState<ScalarMetadataSaveReceipt | null>(
      null,
    );
  const [
    activeDocumentGroup,
    setActiveDocumentGroup,
  ] = useState("release");

  useEffect(() => {
    setActiveDocumentGroup("release");
  }, [detail.releaseId]);

  const dirtyCount = Object.keys(
    draft,
  ).length;


  useEffect(() => {
    if (dirtyCount === 0) {
      return;
    }

    const handleBeforeUnload = (
      event: BeforeUnloadEvent,
    ) => {
      event.preventDefault();

      /*
       * Browsers ignore custom text but require returnValue for
       * compatibility with the native unsaved-changes prompt.
       */
      event.returnValue = "";
    };

    window.addEventListener(
      "beforeunload",
      handleBeforeUnload,
    );

    return () => {
      window.removeEventListener(
        "beforeunload",
        handleBeforeUnload,
      );
    };
  }, [dirtyCount]);

  const updateDraftValue = (
    document: ParsedMetadataDocument,
    metadataPath: string,
    originalValue: EditableMetadataValue,
    nextValue: EditableMetadataValue,
  ) => {
    const key = buildDocumentDraftKey(
      document,
      metadataPath,
    );

    setDraft((currentDraft) => {
      const nextDraft = {
        ...currentDraft,
      };

      if (
        metadataValuesEqual(
          nextValue,
          originalValue,
        )
      ) {
        delete nextDraft[key];
      } else {
        nextDraft[key] = nextValue;
      }

      return nextDraft;
    });
  };

  const saveDocumentDraft = async (
    document: ParsedMetadataDocument,
  ) => {
    const changes = getDocumentDraftChanges(
      document,
      draft,
    );

    if (changes.length === 0) {
      setSaveError(
        "This document has no metadata changes to save.",
      );
      return;
    }

    setSavingDocumentPath(
      document.relativePath,
    );
    setSaveError(null);
    setSaveReceipt(null);

    try {
      const response = await fetch(
        "/api/library/save-scalar-metadata",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            releaseId: detail.releaseId,
            relativePath:
              document.relativePath,
            originalSha256:
              document.sha256,
            changes,
          }),
        },
      );

      const result = (await response.json()) as
        | ScalarMetadataSaveReceipt
        | {
            error?: string;
          };

      if (!response.ok) {
        throw new Error(
          "error" in result
            ? result.error ??
                `Save failed: HTTP ${response.status}`
            : `Save failed: HTTP ${response.status}`,
        );
      }

      setSaveReceipt(
        result as ScalarMetadataSaveReceipt,
      );

      setDraft((currentDraft) =>
        removeDocumentDraftChanges(
          document,
          currentDraft,
        ),
      );

      /*
       * Refresh immediately so the browser receives the new hash and
       * canonical TOML representation from disk.
       */
      await onRefresh();
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "Unknown metadata save error",
      );
    } finally {
      setSavingDocumentPath(null);
    }
  };

  const discardDraft = () => {
    setDraft({});
    setEditMode(false);
  };

  const releaseDocuments =
    detail.documents.filter(
      (document) =>
        document.scope === "release",
    );

  const trackIds = Array.from(
    new Set(
      detail.documents
        .map((document) => document.trackId)
        .filter(
          (trackId): trackId is string =>
            Boolean(trackId),
        ),
    ),
  );

  const countDraftChangesForDocuments = (
    documents: ParsedMetadataDocument[],
  ): number => {
    const documentPrefixes =
      documents.map(
        (document) =>
          `${document.relativePath}::`,
      );

    return Object.keys(draft).filter(
      (draftKey) =>
        documentPrefixes.some(
          (prefix) =>
            draftKey.startsWith(prefix),
        ),
    ).length;
  };

  const releaseDraftCount =
    countDraftChangesForDocuments(
      releaseDocuments,
    );

  return (
    <section className="metadata-detail">
      <header className="metadata-detail-header">
        <div>
          <p className="eyebrow">
            Release metadata
          </p>
          <h1>{detail.releaseId}</h1>
          <code>
            {detail.releaseRelativePath}
          </code>
        </div>

        <div className="detail-actions">
          <button
            type="button"
            onClick={() => {
              if (
                dirtyCount > 0 &&
                !window.confirm(
                  "Discard all unsaved metadata changes and return to the library?",
                )
              ) {
                return;
              }

              onBack();
            }}
          >
            Back to library
          </button>

          <button
            type="button"
            onClick={onRefresh}
          >
            Refresh metadata
          </button>

          <button
            type="button"
            onClick={() =>
              setEditMode((current) => !current)
            }
          >
            {editMode
              ? "Stop editing"
              : "Edit metadata values"}
          </button>

          <button
            type="button"
            disabled={dirtyCount === 0}
            onClick={discardDraft}
          >
            Discard edits
          </button>
        </div>
      </header>

      <section
        className={[
          "draft-status",
          dirtyCount > 0
            ? "has-unsaved-changes"
            : "",
        ]
          .filter(Boolean)
          .join(" ")}
        role="status"
        aria-live="polite"
      >
        <span>
          Mode:{" "}
          <strong>
            {editMode
              ? "Editing in browser"
              : "Read-only"}
          </strong>
        </span>

        <span>
          Unsaved changes:{" "}
          <strong>{dirtyCount}</strong>
        </span>

        <span
          className={[
            "badge",
            dirtyCount > 0
              ? "unsaved"
              : "preview",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {dirtyCount > 0
            ? "Unsaved browser changes"
            : "No filesystem writes"}
        </span>
      </section>

      {saveError && (
        <p className="message error">
          {saveError}
        </p>
      )}

      {saveReceipt && (
        <section className="save-receipt">
          <div>
            <strong>Metadata saved and verified</strong>
            <code>{saveReceipt.relativePath}</code>
          </div>

          <dl>
            <div>
              <dt>Backup</dt>
              <dd>
                <code>
                  {saveReceipt.backupRelativePath}
                </code>
              </dd>
            </div>

            <div>
              <dt>SHA-256</dt>
              <dd>
                <code>
                  {saveReceipt.savedSha256}
                </code>
              </dd>
            </div>

            <div>
              <dt>Bytes</dt>
              <dd>{saveReceipt.bytes}</dd>
            </div>

            <div>
              <dt>Saved</dt>
              <dd>
                {new Date(
                  saveReceipt.savedAt,
                ).toLocaleString()}
              </dd>
            </div>
          </dl>
        </section>
      )}

      <nav
        className="metadata-document-tabs"
        aria-label="Metadata document groups"
      >
        <button
          type="button"
          className={
            activeDocumentGroup === "release"
              ? "active"
              : undefined
          }
          aria-pressed={
            activeDocumentGroup === "release"
          }
          onClick={() =>
            setActiveDocumentGroup("release")
          }
        >
          <span>Release</span>

          <small
            className="document-count"
            title={`${releaseDocuments.length} metadata documents`}
          >
            {releaseDocuments.length}
          </small>

          {releaseDraftCount > 0 && (
            <small
              className="unsaved-count"
              title={`${releaseDraftCount} unsaved changes`}
            >
              {releaseDraftCount}
            </small>
          )}
        </button>

        {trackIds.map((trackId, index) => {
          const trackDocuments =
            detail.documents.filter(
              (document) =>
                document.trackId === trackId,
            );

          const trackDocumentCount =
            trackDocuments.length;

          const trackDraftCount =
            countDraftChangesForDocuments(
              trackDocuments,
            );

          return (
            <button
              key={trackId}
              type="button"
              className={
                activeDocumentGroup ===
                trackId
                  ? "active"
                  : undefined
              }
              aria-pressed={
                activeDocumentGroup ===
                trackId
              }
              title={trackId}
              onClick={() =>
                setActiveDocumentGroup(
                  trackId,
                )
              }
            >
              <span>
                Track {index + 1}
              </span>
              <small
                className="document-count"
                title={`${trackDocumentCount} metadata documents`}
              >
                {trackDocumentCount}
              </small>

              {trackDraftCount > 0 && (
                <small
                  className="unsaved-count"
                  title={`${trackDraftCount} unsaved changes`}
                >
                  {trackDraftCount}
                </small>
              )}
            </button>
          );
        })}
      </nav>

      {activeDocumentGroup ===
        "release" && (
        <MetadataDocumentSection
          title="Release documents"
          documents={releaseDocuments}
          editMode={editMode}
          draft={draft}
          onDraftValueChange={
            updateDraftValue
          }
          metadataRegistry={
            metadataRegistry
          }
          savingDocumentPath={
            savingDocumentPath
          }
          onSaveDocument={(document) =>
            void saveDocumentDraft(document)
          }
        />
      )}

      {trackIds.map((trackId) =>
        activeDocumentGroup === trackId ? (
          <MetadataDocumentSection
            key={trackId}
            title={`Track: ${trackId}`}
            documents={detail.documents.filter(
              (document) =>
                document.trackId === trackId,
            )}
            editMode={editMode}
            draft={draft}
            onDraftValueChange={
              updateDraftValue
            }
            metadataRegistry={
              metadataRegistry
            }
            savingDocumentPath={
              savingDocumentPath
            }
            onSaveDocument={(document) =>
              void saveDocumentDraft(document)
            }
          />
        ) : null,
      )}

      {detail.missingFiles.length > 0 && (
        <section className="metadata-detail-section">
          <header>
            <h2>Missing metadata files</h2>
            <span className="badge missing">
              {detail.missingFiles.length}
            </span>
          </header>

          <div className="metadata-file-rows">
            {detail.missingFiles.map((file) => (
              <div
                key={file.relativePath}
                className="metadata-file-row"
              >
                <strong>{file.filename}</strong>
                <code>{file.relativePath}</code>
                <span className="status-text missing">
                  Missing
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {detail.warnings.length > 0 && (
        <section className="warning-panel">
          <h2>Metadata warnings</h2>

          <ul>
            {detail.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}

function formatMetadataDocumentLabel(
  filename: string,
): string {
  const labels: Record<string, string> = {
    "release.toml": "Release",
    "release-settings.toml": "Settings",
    "release-production-notes.toml":
      "Production Notes",
    "track.toml": "Track",
    "track-credits.toml": "Credits",
    "track-production-notes.toml":
      "Production Notes",
  };

  return (
    labels[filename] ??
    filename.replace(/\.toml$/i, "")
  );
}

function MetadataDocumentSection({
  title,
  documents,
  editMode,
  draft,
  onDraftValueChange,
  metadataRegistry,
  savingDocumentPath,
  onSaveDocument,
}: {
  title: string;
  documents: ParsedMetadataDocument[];
  editMode: boolean;
  draft: MetadataDraft;
  onDraftValueChange: (
    document: ParsedMetadataDocument,
    metadataPath: string,
    originalValue: EditableMetadataValue,
    nextValue: EditableMetadataValue,
  ) => void;
  metadataRegistry: MetadataFieldDefinition[];
  savingDocumentPath: string | null;
  onSaveDocument: (
    document: ParsedMetadataDocument,
  ) => void;
}) {
  const [
    activeDocumentPath,
    setActiveDocumentPath,
  ] = useState(
    documents[0]?.relativePath ?? "",
  );

  useEffect(() => {
    const selectedStillExists =
      documents.some(
        (document) =>
          document.relativePath ===
          activeDocumentPath,
      );

    if (!selectedStillExists) {
      setActiveDocumentPath(
        documents[0]?.relativePath ?? "",
      );
    }
  }, [
    activeDocumentPath,
    documents,
  ]);

  const activeDocument =
    documents.find(
      (document) =>
        document.relativePath ===
        activeDocumentPath,
    ) ?? documents[0];

  return (
    <section className="metadata-detail-section">
      <header>
        <h2>{title}</h2>
        <span className="badge preview">
          {documents.length} files
        </span>
      </header>

      {documents.length === 0 ? (
        <p className="empty-state">
          No metadata documents available.
        </p>
      ) : (
        <>
          <nav
            className="metadata-file-tabs"
            aria-label={`${title} metadata files`}
          >
            {documents.map((document) => {
              const documentDraftPrefix =
                `${document.relativePath}::`;

              const modifiedCount =
                Object.keys(draft).filter(
                  (key) =>
                    key.startsWith(
                      documentDraftPrefix,
                    ),
                ).length;

              return (
                <button
                  key={document.relativePath}
                  type="button"
                  className={
                    activeDocument
                      ?.relativePath ===
                    document.relativePath
                      ? "active"
                      : undefined
                  }
                  aria-pressed={
                    activeDocument
                      ?.relativePath ===
                    document.relativePath
                  }
                  title={document.filename}
                  onClick={() =>
                    setActiveDocumentPath(
                      document.relativePath,
                    )
                  }
                >
                  <span>
                    {
                      formatMetadataDocumentLabel(
                        document.filename,
                      )
                    }
                  </span>

                  {modifiedCount > 0 && (
                    <small
                      title={`${modifiedCount} unsaved changes`}
                    >
                      {modifiedCount}
                    </small>
                  )}
                </button>
              );
            })}
          </nav>

          {activeDocument && (
            <MetadataDocumentTable
              key={
                activeDocument.relativePath
              }
              document={activeDocument}
              editMode={editMode}
              draft={draft}
              onDraftValueChange={
                onDraftValueChange
              }
              metadataRegistry={
                metadataRegistry
              }
              saving={
                savingDocumentPath ===
                activeDocument.relativePath
              }
              onSave={() =>
                onSaveDocument(
                  activeDocument,
                )
              }
            />
          )}
        </>
      )}
    </section>
  );
}

const playerCompatibilityLabels = {
  vlc: "VLC",
  appleMusic: "Apple Music",
  windowsMediaPlayer:
    "Windows Media Player",
  windowsMediaPlayerLegacy:
    "Windows Media Player Legacy",
} as const;

function MetadataCompatibilityNotes({
  field,
}: {
  field: MetadataFieldDefinition;
}) {
  if (
    !field.playerCompatibility ||
    field.playerCompatibility.length === 0
  ) {
    return null;
  }

  return (
    <ul className="metadata-compatibility-notes">
      {field.playerCompatibility.map(
        (result) => (
          <li
            key={[
              result.player,
              result.containers.join("-"),
              result.status,
            ].join(":")}
            className={`compatibility-${result.status}`}
          >
            <strong>
              {
                playerCompatibilityLabels[
                  result.player
                ]
              }
            </strong>

            <span>
              {result.status.replace("-", " ")}
              {" · "}
              {result.containers.join(", ")}
            </span>

            <p>{result.note}</p>
          </li>
        ),
      )}
    </ul>
  );
}

function MetadataAliasList({
  field,
}: {
  field: MetadataFieldDefinition;
}) {
  const groups =
    buildMetadataAliasGroups(field);

  return (
    <>
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
    </>
  );
}

function MetadataValueCell({
  document,
  row,
  editMode,
  draft,
  onDraftValueChange,
}: {
  document: ParsedMetadataDocument;
  row: FlattenedMetadataRow;
  editMode: boolean;
  draft: MetadataDraft;
  onDraftValueChange: (
    document: ParsedMetadataDocument,
    metadataPath: string,
    originalValue: EditableMetadataValue,
    nextValue: EditableMetadataValue,
  ) => void;
}) {
  if (!isEditableMetadataValue(row.value)) {
    return (
      <span className="metadata-value readonly-complex">
        {formatMetadataValue(row.value)}
      </span>
    );
  }

  const originalValue = row.value;

  const draftKey = buildDocumentDraftKey(
    document,
    row.path,
  );

  const currentValue =
    draft[draftKey] ?? originalValue;

  const changed =
    Object.prototype.hasOwnProperty.call(
      draft,
      draftKey,
    );

  if (!editMode) {
    return (
      <span
        className={[
          row.value === ""
            ? "metadata-value blank"
            : "metadata-value",
          changed ? "draft-changed" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {formatMetadataValue(currentValue)}
      </span>
    );
  }

  if (Array.isArray(originalValue)) {
    const currentArray = Array.isArray(
      currentValue,
    )
      ? currentValue
      : originalValue;

    return (
      <label className="metadata-editor-field array-field">
        <textarea
          rows={Math.max(
            3,
            currentArray.length + 1,
          )}
          value={stringArrayToEditorText(
            currentArray,
          )}
          placeholder="One value per line"
          onChange={(event) =>
            onDraftValueChange(
              document,
              row.path,
              originalValue,
              editorTextToStringArray(
                event.target.value,
              ),
            )
          }
        />

        <span className="array-field-help">
          One value per line
        </span>

        {changed && (
          <span className="changed-indicator">
            Modified
          </span>
        )}
      </label>
    );
  }

  if (typeof originalValue === "boolean") {
    return (
      <label className="metadata-editor-field boolean-field">
        <select
          value={String(currentValue)}
          onChange={(event) =>
            onDraftValueChange(
              document,
              row.path,
              originalValue,
              event.target.value === "true",
            )
          }
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </select>

        {changed && (
          <span className="changed-indicator">
            Modified
          </span>
        )}
      </label>
    );
  }

  if (typeof originalValue === "number") {
    return (
      <label className="metadata-editor-field">
        <input
          type="number"
          step="any"
          value={String(currentValue)}
          onChange={(event) => {
            const parsed =
              parseDraftNumber(
                event.target.value,
              );

            if (parsed !== null) {
              onDraftValueChange(
                document,
                row.path,
                originalValue,
                parsed,
              );
            }
          }}
        />

        {changed && (
          <span className="changed-indicator">
            Modified
          </span>
        )}
      </label>
    );
  }

  return (
    <label className="metadata-editor-field">
      <input
        type="text"
        value={String(currentValue)}
        onChange={(event) =>
          onDraftValueChange(
            document,
            row.path,
            originalValue,
            event.target.value,
          )
        }
      />

      {changed && (
        <span className="changed-indicator">
          Modified
        </span>
      )}
    </label>
  );
}

function MetadataDocumentTable({
  document,
  editMode,
  draft,
  onDraftValueChange,
  metadataRegistry,
  saving,
  onSave,
}: {
  document: ParsedMetadataDocument;
  editMode: boolean;
  draft: MetadataDraft;
  onDraftValueChange: (
    document: ParsedMetadataDocument,
    metadataPath: string,
    originalValue: EditableMetadataValue,
    nextValue: EditableMetadataValue,
  ) => void;
  metadataRegistry: MetadataFieldDefinition[];
  saving: boolean;
  onSave: () => void;
}) {
  const rows = flattenMetadata(
    document.parsed,
  );

  const documentChangeCount =
    getDocumentDraftChanges(
      document,
      draft,
    ).length;

  return (
    <article className="metadata-document-table">
      <header>
        <div>
          <h3>{document.filename}</h3>
          <code>{document.relativePath}</code>
        </div>

        <div className="document-save-controls">
          <span
            className={
              documentChangeCount > 0
                ? "badge preview"
                : "badge complete"
            }
          >
            {documentChangeCount > 0
              ? `${documentChangeCount} modified`
              : "Parsed"}
          </span>

          <button
            type="button"
            disabled={
              saving ||
              documentChangeCount === 0
            }
            onClick={onSave}
          >
            {saving
              ? "Saving…"
              : "Save this TOML"}
          </button>
        </div>
      </header>

      <div className="metadata-table-header">
        <span>Metadata key</span>
        <span>Value</span>
        <span>Type</span>
      </div>

      <div className="metadata-table-body">
        {rows.map((row) => {
          const fieldDefinition =
            findRegisteredMetadataField(
              metadataRegistry,
              row.path,
            );

          return (
            <div
              key={row.path}
              className={[
                "metadata-table-row",
                /\[\d+\]/.test(row.path)
                  ? "indexed-metadata-row"
                  : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <div className="metadata-key">
                <strong>
                  {fieldDefinition?.label ??
                    row.path}
                </strong>

                <code>{row.path}</code>

                {fieldDefinition && (
                  <>
                    <small>
                      {
                        fieldDefinition.description
                      }
                    </small>

                    <MetadataAliasList
                      field={fieldDefinition}
                    />
                  </>
                )}
              </div>

              <MetadataValueCell
              document={document}
              row={row}
              editMode={editMode}
              draft={draft}
              onDraftValueChange={
                onDraftValueChange
              }
            />

              <span className="metadata-type">
                {row.valueType}
              </span>
            </div>
          );
        })}
      </div>

      <details className="raw-toml">
        <summary>View raw TOML</summary>
        <pre>
          <code>{document.content}</code>
        </pre>
      </details>
    </article>
  );
}

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
