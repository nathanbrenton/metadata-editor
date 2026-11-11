import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type {
  CompatibilityStatusFilter,
  ExportContainer,
  ExportDryRunValidation,
  ExportExecutionResult,
  ExportGuidance,
  FfmpegCapabilities,
  MetadataExportPlan,
  MetadataFieldDefinition,
  ReleaseScanResult,
} from "./types.js";
import {
  EXPORT_CONFIRMATION_PHRASE,
  coreExportPaths,
  exportContainerLabels,
  formatMetadataValue,
} from "./foundation.js";

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
  releases,
}: {
  fields: MetadataFieldDefinition[];
  releases: ReleaseScanResult[];
}) {
  const [searchText, setSearchText] =
    useState("");
  const [
    referenceMenuOpen,
    setReferenceMenuOpen,
  ] = useState(false);
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


  const [
    selectedExportReleaseId,
    setSelectedExportReleaseId,
  ] = useState("");
  const [
    selectedExportTrackId,
    setSelectedExportTrackId,
  ] = useState("all");
  const [
    exportOutputDirectory,
    setExportOutputDirectory,
  ] = useState(
    "deployment-output/metadata-export",
  );
  const [exportPlan, setExportPlan] =
    useState<MetadataExportPlan | null>(
      null,
    );
  const [
    exportPlanLoading,
    setExportPlanLoading,
  ] = useState(false);
  const [
    exportPlanError,
    setExportPlanError,
  ] = useState<string | null>(null);
  const [
    exportValidation,
    setExportValidation,
  ] = useState<ExportDryRunValidation | null>(
    null,
  );
  const [
    exportValidationLoading,
    setExportValidationLoading,
  ] = useState(false);
  const [
    exportValidationError,
    setExportValidationError,
  ] = useState<string | null>(null);


  const [
    exportConfirmation,
    setExportConfirmation,
  ] = useState("");
  const [
    exportExecution,
    setExportExecution,
  ] = useState<ExportExecutionResult | null>(
    null,
  );
  const [
    exportExecutionLoading,
    setExportExecutionLoading,
  ] = useState(false);
  const [
    exportExecutionError,
    setExportExecutionError,
  ] = useState<string | null>(null);


  const [
    ffmpegCapabilities,
    setFfmpegCapabilities,
  ] = useState<FfmpegCapabilities | null>(
    null,
  );
  const [
    ffmpegCapabilitiesLoading,
    setFfmpegCapabilitiesLoading,
  ] = useState(false);
  const [
    ffmpegCapabilitiesError,
    setFfmpegCapabilitiesError,
  ] = useState<string | null>(null);

  useEffect(() => {
    if (!referenceMenuOpen) {
      return;
    }

    const previousOverflow =
      document.body.style.overflow;

    const closeOnEscape = (
      event: KeyboardEvent,
    ) => {
      if (event.key === "Escape") {
        setReferenceMenuOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener(
      "keydown",
      closeOnEscape,
    );

    return () => {
      document.body.style.overflow =
        previousOverflow;
      window.removeEventListener(
        "keydown",
        closeOnEscape,
      );
    };
  }, [referenceMenuOpen]);

  const refreshFfmpegCapabilities =
    useCallback(async () => {
      setFfmpegCapabilitiesLoading(true);
      setFfmpegCapabilitiesError(null);

      try {
        const response = await fetch(
          "/api/ffmpeg/capabilities",
        );

        const result =
          (await response.json()) as
            | FfmpegCapabilities
            | { error?: string };

        if (!response.ok) {
          throw new Error(
            "error" in result
              ? result.error ??
                  `FFmpeg capability request failed: HTTP ${response.status}`
              : `FFmpeg capability request failed: HTTP ${response.status}`,
          );
        }

        setFfmpegCapabilities(
          result as FfmpegCapabilities,
        );
      } catch (error) {
        setFfmpegCapabilities(null);
        setFfmpegCapabilitiesError(
          error instanceof Error
            ? error.message
            : "Unknown FFmpeg capability error",
        );
      } finally {
        setFfmpegCapabilitiesLoading(false);
      }
    }, []);

  useEffect(() => {
    void refreshFfmpegCapabilities();
  }, [refreshFfmpegCapabilities]);

  const selectedContainerCapability =
    useMemo(
      () =>
        ffmpegCapabilities?.containers.find(
          (capability) =>
            capability.container ===
            exportContainer,
        ) ?? null,
      [
        ffmpegCapabilities,
        exportContainer,
      ],
    );

  useEffect(() => {
    if (
      selectedExportReleaseId &&
      releases.some(
        (release) =>
          release.id ===
          selectedExportReleaseId,
      )
    ) {
      return;
    }

    setSelectedExportReleaseId(
      releases[0]?.id ?? "",
    );
    setSelectedExportTrackId("all");
    setExportPlan(null);
  }, [
    releases,
    selectedExportReleaseId,
  ]);

  const selectedExportRelease =
    releases.find(
      (release) =>
        release.id ===
        selectedExportReleaseId,
    );

  const requestExportPlan = async () => {
    if (!selectedExportReleaseId) {
      setExportPlanError(
        "Select a release before previewing an export plan.",
      );
      return;
    }

    setExportPlanLoading(true);
    setExportPlanError(null);
    setExportValidation(null);
    setExportValidationError(null);
    setExportExecution(null);
    setExportExecutionError(null);
    setExportConfirmation("");

    try {
      const query = new URLSearchParams({
        release: selectedExportReleaseId,
        container: exportContainer,
        output: exportOutputDirectory,
      });

      if (
        selectedExportTrackId !== "all"
      ) {
        query.set(
          "track",
          selectedExportTrackId,
        );
      }

      const response = await fetch(
        `/api/export/plan?${query.toString()}`,
      );

      const result =
        (await response.json()) as
          | MetadataExportPlan
          | { error?: string };

      if (!response.ok) {
        throw new Error(
          "error" in result
            ? result.error ??
                `Export-plan request failed: HTTP ${response.status}`
            : `Export-plan request failed: HTTP ${response.status}`,
        );
      }

      setExportPlan(
        result as MetadataExportPlan,
      );
    } catch (error) {
      setExportPlan(null);
      setExportPlanError(
        error instanceof Error
          ? error.message
          : "Unknown export-plan error",
      );
    } finally {
      setExportPlanLoading(false);
    }
  };

  const requestExportValidation =
    async () => {
      if (!selectedExportReleaseId) {
        setExportValidationError(
          "Select a release before validating the export plan.",
        );
        return;
      }

      setExportValidationLoading(true);
      setExportValidationError(null);

      try {
        const query = new URLSearchParams({
          release: selectedExportReleaseId,
          container: exportContainer,
          output: exportOutputDirectory,
        });

        if (
          selectedExportTrackId !== "all"
        ) {
          query.set(
            "track",
            selectedExportTrackId,
          );
        }

        const response = await fetch(
          `/api/export/validate?${query.toString()}`,
        );

        const result =
          (await response.json()) as
            | ExportDryRunValidation
            | { error?: string };

        if (!response.ok) {
          throw new Error(
            "error" in result
              ? result.error ??
                  `Export validation failed: HTTP ${response.status}`
              : `Export validation failed: HTTP ${response.status}`,
          );
        }

        setExportValidation(
          result as ExportDryRunValidation,
        );
      } catch (error) {
        setExportValidation(null);
        setExportValidationError(
          error instanceof Error
            ? error.message
            : "Unknown export validation error",
        );
      } finally {
        setExportValidationLoading(false);
      }
    };

  const requestExportExecution =
    async () => {
      if (
        !exportValidation?.canExport
      ) {
        setExportExecutionError(
          "Run a successful dry-run validation before exporting.",
        );
        return;
      }

      if (
        exportConfirmation !==
        EXPORT_CONFIRMATION_PHRASE
      ) {
        setExportExecutionError(
          `Type ${EXPORT_CONFIRMATION_PHRASE} exactly to confirm.`,
        );
        return;
      }

      setExportExecutionLoading(true);
      setExportExecutionError(null);
      setExportExecution(null);

      try {
        const response = await fetch(
          "/api/export/execute",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              releaseId:
                selectedExportReleaseId,
              container:
                exportContainer,
              outputDirectory:
                exportOutputDirectory,
              ...(selectedExportTrackId !==
              "all"
                ? {
                    trackId:
                      selectedExportTrackId,
                  }
                : {}),
              confirmation:
                exportConfirmation,
            }),
          },
        );

        const result =
          (await response.json()) as
            | ExportExecutionResult
            | { error?: string };

        if (!response.ok) {
          throw new Error(
            "error" in result
              ? result.error ??
                  `Export execution failed: HTTP ${response.status}`
              : `Export execution failed: HTTP ${response.status}`,
          );
        }

        setExportExecution(
          result as ExportExecutionResult,
        );
        setExportConfirmation("");
        setExportValidation(null);
      } catch (error) {
        setExportExecutionError(
          error instanceof Error
            ? error.message
            : "Unknown export execution error",
        );
      } finally {
        setExportExecutionLoading(false);
      }
    };

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

        <div className="compatibility-header-actions">
          <strong>
            {visibleFields.length} of{" "}
            {fields.length} fields
          </strong>

          <button
            type="button"
            className="reference-menu-button"
            aria-label="Open compatibility reference menu"
            aria-expanded={referenceMenuOpen}
            onClick={() =>
              setReferenceMenuOpen(true)
            }
          >
            <span aria-hidden="true">☰</span>
            <span>Reference</span>
          </button>
        </div>
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

      <section className="export-plan-preview">
        <header>
          <div>
            <p className="eyebrow">
              Read-only preview
            </p>
            <h3>Export plan</h3>
            <p>
              Preview source files,
              destination names, and
              canonical-field-to-tag mappings.
              This endpoint performs no
              filesystem writes.
            </p>
          </div>
        </header>

        <section className="ffmpeg-capability-panel">
          <div>
            <p className="eyebrow">
              Local FFmpeg
            </p>

            {ffmpegCapabilitiesLoading ? (
              <strong>
                Checking encoder availability…
              </strong>
            ) : ffmpegCapabilities ? (
              <>
                <strong>
                  {ffmpegCapabilities.available
                    ? `FFmpeg ${ffmpegCapabilities.version ?? "unknown"}`
                    : "FFmpeg unavailable"}
                </strong>
                <span>
                  {ffmpegCapabilities.available
                    ? `${ffmpegCapabilities.encoders.length} encoders detected`
                    : ffmpegCapabilities.error ??
                      "The ffmpeg executable could not be run."}
                </span>
              </>
            ) : (
              <strong>
                Capability check unavailable
              </strong>
            )}
          </div>

          <div className="ffmpeg-capability-selection">
            {selectedContainerCapability ? (
              <>
                <span
                  className={`ffmpeg-capability-status status-${selectedContainerCapability.status}`}
                >
                  {
                    selectedContainerCapability.status
                  }
                </span>
                <code>
                  {selectedContainerCapability.selectedEncoder ??
                    selectedContainerCapability.preferredEncoder}
                </code>
                <small>
                  {
                    selectedContainerCapability.note
                  }
                </small>
              </>
            ) : (
              <small>
                No capability result is available
                for the selected container.
              </small>
            )}
          </div>

          <button
            type="button"
            disabled={
              ffmpegCapabilitiesLoading
            }
            onClick={() =>
              void refreshFfmpegCapabilities()
            }
          >
            Recheck FFmpeg
          </button>
        </section>

        {ffmpegCapabilitiesError && (
          <p className="message error">
            {ffmpegCapabilitiesError}
          </p>
        )}

        <div className="export-plan-controls">
          <label>
            <span>Release</span>
            <select
              value={
                selectedExportReleaseId
              }
              onChange={(event) => {
                setSelectedExportReleaseId(
                  event.currentTarget.value,
                );
                setSelectedExportTrackId(
                  "all",
                );
                setExportPlan(null);
              }}
            >
              {releases.length === 0 && (
                <option value="">
                  No releases available
                </option>
              )}

              {releases.map((release) => (
                <option
                  key={release.id}
                  value={release.id}
                >
                  {release.id}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>Track scope</span>
            <select
              value={selectedExportTrackId}
              disabled={
                !selectedExportRelease
              }
              onChange={(event) => {
                setSelectedExportTrackId(
                  event.currentTarget.value,
                );
                setExportPlan(null);
              }}
            >
              <option value="all">
                All tracks
              </option>

              {selectedExportRelease
                ?.tracks.map((track) => (
                  <option
                    key={track.id}
                    value={track.id}
                  >
                    {track.id}
                  </option>
                ))}
            </select>
          </label>

          <label>
            <span>
              Relative output directory
            </span>
            <input
              type="text"
              value={
                exportOutputDirectory
              }
              onChange={(event) => {
                setExportOutputDirectory(
                  event.currentTarget.value,
                );
                setExportPlan(null);
              }}
            />
          </label>

          <button
            type="button"
            disabled={
              exportPlanLoading ||
              !selectedExportReleaseId
            }
            onClick={() =>
              void requestExportPlan()
            }
          >
            {exportPlanLoading
              ? "Building preview…"
              : "Preview export plan"}
          </button>
        </div>

        {exportPlanError && (
          <p className="message error">
            {exportPlanError}
          </p>
        )}

        {exportPlan && (
          <div className="export-plan-results">
            <div className="export-plan-summary">
              <span>
                {exportPlan.summary.readyCount}
                {" ready"}
              </span>
              <span>
                {
                  exportPlan.summary
                    .blockedCount
                }
                {" blocked"}
              </span>
              <span>
                {
                  exportPlan.summary
                    .writeCount
                }
                {" direct writes"}
              </span>
              <span>
                {
                  exportPlan.summary
                    .normalizedCount
                }
                {" normalized"}
              </span>
              <span>
                {
                  exportPlan.summary
                    .omittedCount
                }
                {" omitted"}
              </span>
            </div>

            {exportPlan.items.map(
              (item) => (
                <article
                  key={item.trackId}
                  className={`export-plan-item action-${item.action}`}
                >
                  <header>
                    <div>
                      <strong>
                        {item.trackId}
                      </strong>
                      <code>
                        {item.sourceAudioRelativePath ??
                          "No source audio"}
                      </code>
                    </div>

                    <span>
                      {item.action}
                    </span>
                  </header>

                  {item.destinationRelativePath && (
                    <p>
                      <strong>
                        Destination:
                      </strong>{" "}
                      <code>
                        {
                          item.destinationRelativePath
                        }
                      </code>
                    </p>
                  )}

                  {item.warnings.map(
                    (warning) => (
                      <p
                        key={warning}
                        className="message warning"
                      >
                        {warning}
                      </p>
                    ),
                  )}

                  <details className="export-plan-field-disclosure">
                    <summary>
                      <span
                        className="export-plan-field-disclosure-triangle"
                        aria-hidden="true"
                      />
                      <strong>
                        Field mappings
                      </strong>
                      <span>
                        {item.fields.length}
                      </span>
                    </summary>

                    <div className="export-plan-field-table-wrap">
                      <table className="export-plan-field-table">
                        <thead>
                          <tr>
                            <th>
                              Canonical field
                            </th>
                            <th>Target tag</th>
                            <th>Value</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {item.fields.map(
                            (field) => (
                              <tr
                                key={[
                                  field.canonicalPath,
                                  field.sourceDocument,
                                ].join(":")}
                              >
                                <th scope="row">
                                  <strong>
                                    {field.label}
                                  </strong>
                                  <code>
                                    {
                                      field.canonicalPath
                                    }
                                  </code>
                                </th>
                                <td>
                                  <code>
                                    {field.targetTags
                                      .length > 0
                                      ? field.targetTags.join(
                                          ", ",
                                        )
                                      : "—"}
                                  </code>
                                </td>
                                <td>
                                  {formatMetadataValue(
                                    field.value,
                                  )}
                                </td>
                                <td>
                                  <span
                                    className={`export-plan-field-status status-${field.status}`}
                                    title={
                                      field.note
                                    }
                                  >
                                    {
                                      field.status
                                    }
                                  </span>
                                </td>
                              </tr>
                            ),
                          )}
                        </tbody>
                      </table>
                    </div>
                  </details>
                </article>
              ),
            )}
          </div>
        )}

        {exportPlan && (
          <div className="export-validation-controls">
            <button
              type="button"
              disabled={exportValidationLoading}
              onClick={() =>
                void requestExportValidation()
              }
            >
              {exportValidationLoading
                ? "Validating dry run…"
                : "Validate dry run"}
            </button>

            <span>
              Checks filesystem paths and encoder
              readiness without running FFmpeg.
            </span>
          </div>
        )}

        {exportValidationError && (
          <p className="message error">
            {exportValidationError}
          </p>
        )}

        {exportValidation && (
          <section className="export-validation-results">
            <header>
              <div>
                <p className="card-type">
                  Read-only dry run
                </p>
                <h3>Export validation</h3>
                <code>
                  {exportValidation.outputRoot}
                </code>
              </div>

              <span
                className={`export-validation-overall ${
                  exportValidation.canExport
                    ? "status-ready"
                    : "status-blocked"
                }`}
              >
                {exportValidation.canExport
                  ? "Validation passed"
                  : "Export blocked"}
              </span>
            </header>

            <div className="export-plan-summary">
              <span>
                {exportValidation.summary.readyCount}
                {" ready"}
              </span>
              <span>
                {
                  exportValidation.summary
                    .warningCount
                }
                {" warnings"}
              </span>
              <span>
                {
                  exportValidation.summary
                    .blockedCount
                }
                {" blocked"}
              </span>
            </div>

            {exportValidation.items.map(
              (item) => {
                const plannedItem =
                  exportPlan?.items.find(
                    (planItem) =>
                      planItem.trackId ===
                      item.trackId,
                  );

                return (
                  <details
                    key={item.trackId}
                    className={`export-validation-item status-${item.status}`}
                  >
                    <summary>
                      <span className="export-validation-summary-main">
                        <span
                          className="export-validation-disclosure"
                          aria-hidden="true"
                        />
                        <strong>{item.trackId}</strong>
                      </span>

                      <span className="export-validation-item-status">
                        {item.status}
                      </span>
                    </summary>

                    <div className="export-validation-item-details">
                      <div className="export-validation-paths">
                        <div>
                          <strong>Source audio</strong>
                          <code>
                            {plannedItem?.sourceAudioRelativePath ??
                              "No source audio selected"}
                          </code>
                        </div>

                        <div>
                          <strong>Destination file</strong>
                          <code>
                            {plannedItem?.destinationRelativePath ??
                              "No destination selected"}
                          </code>
                        </div>
                      </div>

                      <ul>
                        {item.checks.map(
                          (itemCheck) => (
                            <li
                              key={`${item.trackId}:${itemCheck.code}`}
                              className={`status-${itemCheck.status}`}
                            >
                              <strong>
                                {itemCheck.code.replaceAll(
                                  "-",
                                  " ",
                                )}
                              </strong>
                              <span>
                                {itemCheck.message}
                              </span>
                            </li>
                          ),
                        )}
                      </ul>
                    </div>
                  </details>
                );
              },
            )}
          </section>
        )}


        {exportValidation?.canExport && (
          <section className="export-execution-gate">
            <header>
              <div>
                <p className="eyebrow">
                  Create-only execution
                </p>
                <h3>Execute validated export</h3>
              </div>

              <span className="status-warning">
                Writes media files
              </span>
            </header>

            <p>
              The server rebuilds and validates the
              plan immediately before execution.
              Existing destination files are never
              replaced.
            </p>

            <label>
              <span>
                Type{" "}
                <code>
                  {EXPORT_CONFIRMATION_PHRASE}
                </code>{" "}
                to confirm
              </span>
              <input
                type="text"
                autoComplete="off"
                aria-describedby="export-confirmation-help"
                value={exportConfirmation}
                onChange={(event) =>
                  setExportConfirmation(
                    event.currentTarget.value,
                  )
                }
              />
            </label>

            <p
              id="export-confirmation-help"
              className={`export-confirmation-help ${
                exportConfirmation ===
                EXPORT_CONFIRMATION_PHRASE
                  ? "status-ready"
                  : ""
              }`}
              aria-live="polite"
            >
              {exportConfirmation ===
              EXPORT_CONFIRMATION_PHRASE
                ? "Confirmation phrase matches. Export execution is enabled."
                : `Enter ${EXPORT_CONFIRMATION_PHRASE} exactly to enable execution.`}
            </p>

            <button
              type="button"
              className={
                exportExecutionLoading
                  ? "is-loading"
                  : undefined
              }
              disabled={
                exportExecutionLoading ||
                exportConfirmation !==
                  EXPORT_CONFIRMATION_PHRASE
              }
              onClick={() =>
                void requestExportExecution()
              }
            >
              {exportExecutionLoading
                ? "Creating exports…"
                : "Create validated exports"}
            </button>
          </section>
        )}

        {exportExecutionError && (
          <p className="message error">
            {exportExecutionError}
          </p>
        )}

        {exportExecution && (
          <section className="export-execution-results">
            <header>
              <div>
                <p className="eyebrow">
                  Export receipts
                </p>
                <h3>Execution results</h3>
              </div>

              <div className="export-plan-summary">
                <span>
                  {
                    exportExecution.summary
                      .createdCount
                  }
                  {" created"}
                </span>
                <span>
                  {
                    exportExecution.summary
                      .failedCount
                  }
                  {" failed"}
                </span>
              </div>
            </header>

            {exportExecution.items.map(
              (item) => (
                <details
                  key={item.trackId}
                  className={`export-execution-item status-${item.status}`}
                >
                  <summary>
                    <strong>{item.trackId}</strong>
                    <span>{item.status}</span>
                  </summary>

                  <div>
                    {item.destinationRelativePath && (
                      <p>
                        <strong>
                          Destination
                        </strong>
                        <code>
                          {
                            item.destinationRelativePath
                          }
                        </code>
                      </p>
                    )}

                    {item.encoder && (
                      <p>
                        <strong>Encoder</strong>
                        <code>{item.encoder}</code>
                      </p>
                    )}

                    {item.sha256 && (
                      <p>
                        <strong>SHA-256</strong>
                        <code>{item.sha256}</code>
                      </p>
                    )}

                    {typeof item.sizeBytes ===
                      "number" && (
                      <p>
                        <strong>Size</strong>
                        <span>
                          {item.sizeBytes} bytes
                        </span>
                      </p>
                    )}

                    {item.error && (
                      <p className="message error">
                        {item.error}
                      </p>
                    )}
                  </div>
                </details>
              ),
            )}
          </section>
        )}
      </section>

      {referenceMenuOpen && (
        <div
          className="reference-menu-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setReferenceMenuOpen(false);
            }
          }}
        >
          <aside
            className="reference-menu-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reference-menu-title"
          >
            <header className="reference-menu-header">
              <div>
                <p className="eyebrow">
                  Compatibility reference
                </p>
                <h2 id="reference-menu-title">
                  Legend and media players
                </h2>
                <p>
                  Detailed tag mappings are kept
                  here so the export workflow stays
                  focused.
                </p>
              </div>

              <button
                type="button"
                className="reference-menu-close"
                aria-label="Close compatibility reference menu"
                onClick={() =>
                  setReferenceMenuOpen(false)
                }
              >
                ×
              </button>
            </header>

            <section
              className="reference-status-legend"
              aria-label="Compatibility status legend"
            >
              <span className="compatibility-status status-verified">
                Verified
              </span>
              <span className="compatibility-status status-partial">
                Partial
              </span>
              <span className="compatibility-status status-not-visible">
                Not visible
              </span>
              <span className="compatibility-status status-unverified">
                Unverified
              </span>
            </section>

            <p className="reference-menu-count">
              Showing {visibleFields.length} of{" "}
              {fields.length} fields using the
              current filters.
            </p>

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
            
          </aside>
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

export {
  getCompatibilityStatus,
  formatAliasValues,
  getContainerTags,
  getExportGuidance,
  MetadataCompatibilityView,
  ExportGuidanceCell,
  CompatibilityPlayerCell,
};
