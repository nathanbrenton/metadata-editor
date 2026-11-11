import {
  presentMediaFileSpecSummary,
  summarizeReleaseMediaFileSpec,
} from "../../shared/media-file-spec-summary.js";
import type {
  MediaTechnicalAuditState,
  MediaTechnicalContract,
  MediaTechnicalHealth,
  MediaTechnicalInventoryEntry,
  MediaTechnicalReleaseSummary,
  MetadataEditorFocusTarget,
  ReleaseScanResult,
} from "./types.js";

function MediaFileSpecBadge({
  release,
  prefix = false,
}: {
  release: ReleaseScanResult;
  prefix?: boolean;
}) {
  const summary = summarizeReleaseMediaFileSpec(release);
  const presentation = presentMediaFileSpecSummary(summary);

  return (
    <span
      className={`badge ${presentation.tone} media-file-spec-badge`}
      title={`Media file spec: ${presentation.title}`}
      aria-label={`Media file spec: ${presentation.label}`}
    >
      {prefix ? "File spec · " : ""}
      {presentation.label}
    </span>
  );
}

function technicalHealthLabel(
  health: MediaTechnicalHealth,
): string {
  switch (health) {
    case "ready":
      return "Ready";
    case "review":
      return "Review";
    case "blocked":
      return "Blocked";
  }
}

function technicalHealthTone(
  health: MediaTechnicalHealth,
): "success" | "warning" | "error" {
  switch (health) {
    case "ready":
      return "success";
    case "review":
      return "warning";
    case "blocked":
      return "error";
  }
}

function technicalContractTitle(
  contract: MediaTechnicalContract,
): string {
  return [
    "Technical Media Contract v1 is advisory and does not change Web Package readiness.",
    `Audio: ${contract.audio.preferredLossless} preferred lossless · ${contract.audio.compatibleLossless} compatible lossless · ${contract.audio.sourcePreservedLossy} source-preserved lossy · ${contract.audio.review} review.`,
    `Artwork: ${contract.artwork.preferred} preferred · ${contract.artwork.compatible} compatible · ${contract.artwork.review} review.`,
    `Video: ${contract.video.total} inventory-only masters; no codec/profile quality threshold.`,
  ].join(" ");
}

function TechnicalHealthBadge({
  summary,
  loading,
  error,
  prefix = true,
}: {
  summary?: MediaTechnicalReleaseSummary;
  loading: boolean;
  error: string | null;
  prefix?: boolean;
}) {
  if (loading && !summary) {
    return (
      <span
        className="badge technical-health-badge"
        title="Running the read-only ffprobe technical-health audit."
      >
        {prefix ? "Technical · " : ""}
        Checking…
      </span>
    );
  }

  if (!summary) {
    return (
      <span
        className={`badge ${error ? "warning" : ""} technical-health-badge`}
        title={
          error ??
          "Technical health has not been loaded yet."
        }
      >
        {prefix ? "Technical · " : ""}
        Unavailable
      </span>
    );
  }

  const issueTitle = summary.issues
    .map((issue) => issue.message)
    .join(" ");

  return (
    <span
      className={`badge ${technicalHealthTone(summary.health)} technical-health-badge`}
      title={[
        "Advisory technical health only; this does not change Web Package readiness.",
        issueTitle,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {prefix ? "Technical · " : ""}
      {technicalHealthLabel(summary.health)}
    </span>
  );
}

function TechnicalAuditSummaryBadge({
  audit,
  presentation = "standard",
}: {
  audit: MediaTechnicalAuditState;
  presentation?: "standard" | "web-package-header";
}) {
  const isWebPackageHeader =
    presentation === "web-package-header";

  if (audit.loading && !audit.result) {
    if (isWebPackageHeader) {
      return null;
    }

    return (
      <span
        className="badge technical-contract-badge"
        title="Running a read-only technical audit of canonical masters."
      >
        Technical · Checking…
      </span>
    );
  }

  if (!audit.result) {
    if (isWebPackageHeader) {
      return null;
    }

    return (
      <span
        className={`badge ${audit.error ? "warning" : ""} technical-contract-badge`}
        title={audit.error ?? "Technical audit unavailable."}
      >
        Technical · Unavailable
      </span>
    );
  }

  const { healthSummary, contract } = audit.result;
  const total =
    healthSummary.ready +
    healthSummary.review +
    healthSummary.blocked;

  if (isWebPackageHeader) {
    if (healthSummary.blocked > 0) {
      const blockedLabel =
        healthSummary.blocked === 1
          ? "1 technical block"
          : `${healthSummary.blocked} technical blocks`;

      return (
        <span
          className="badge error technical-contract-badge"
          title={technicalContractTitle(contract)}
        >
          {blockedLabel}
        </span>
      );
    }

    if (healthSummary.review > 0) {
      const noteLabel =
        healthSummary.review === 1
          ? "1 technical note"
          : `${healthSummary.review} technical notes`;

      return (
        <span
          className="badge preview technical-contract-badge"
          title={[
            "Non-blocking technical advisory; Web Package readiness is unchanged.",
            technicalContractTitle(contract),
          ].join(" ")}
        >
          {noteLabel}
        </span>
      );
    }

    return null;
  }

  const tone =
    healthSummary.blocked > 0
      ? "error"
      : healthSummary.review > 0
        ? "warning"
        : "success";
  const label =
    healthSummary.blocked > 0
      ? `${healthSummary.blocked} blocked`
      : healthSummary.review > 0
        ? `${healthSummary.review} review`
        : `${healthSummary.ready}/${total} ready`;

  return (
    <span
      className={`badge ${tone} technical-contract-badge`}
      title={technicalContractTitle(contract)}
    >
      Technical · {label}
    </span>
  );
}

function technicalInventoryEntryLabel(
  entries: MediaTechnicalInventoryEntry[],
): string {
  if (entries.length === 0) {
    return "—";
  }

  return entries
    .map((entry) => `${entry.value} × ${entry.count}`)
    .join(" · ");
}

function TechnicalInventoryFact({
  label,
  entries,
}: {
  label: string;
  entries: MediaTechnicalInventoryEntry[];
}) {
  return (
    <div className="technical-inspector-fact">
      <dt>{label}</dt>
      <dd>{technicalInventoryEntryLabel(entries)}</dd>
    </div>
  );
}

function TechnicalReleaseInspector({
  summary,
  audit,
  compact = false,
}: {
  summary?: MediaTechnicalReleaseSummary;
  audit: MediaTechnicalAuditState;
  compact?: boolean;
}) {
  const contract = audit.result?.contract;

  return (
    <section
      className={`technical-release-inspector${compact ? " compact" : ""}`}
      aria-label="Technical media inspector"
    >
      <header>
        <div>
          <span className="eyebrow">Technical media</span>
          <strong>Canonical master inspection</strong>
        </div>
        <TechnicalHealthBadge
          summary={summary}
          loading={audit.loading}
          error={audit.error}
        />
      </header>

      {contract && (
        <p
          className="technical-release-policy"
          title={technicalContractTitle(contract)}
        >
          Contract v{contract.version} · advisory · preserve source masters · no Web Package gating
        </p>
      )}

      {audit.loading && !summary ? (
        <p className="technical-release-message">
          Running the read-only ffprobe audit…
        </p>
      ) : audit.error && !summary ? (
        <p className="technical-release-message warning">
          {audit.error}
        </p>
      ) : summary ? (
        <>
          <div className="technical-release-counts">
            <span>{summary.summary.total} masters</span>
            <span>{summary.summary.probed} probed</span>
            <span>{summary.summary.failed} failed</span>
            <span>{summary.summary.audio} audio</span>
            <span>{summary.summary.artwork} artwork</span>
            <span>{summary.summary.video} video</span>
          </div>

          {summary.issues.length > 0 && (
            <div className="technical-release-issues">
              {summary.issues.map((issue, index) => (
                <div key={`${issue.severity}:${index}`}>
                  <span
                    className={`badge ${
                      issue.severity === "blocked"
                        ? "missing"
                        : "warning"
                    }`}
                  >
                    {issue.severity}
                  </span>
                  <span>{issue.message}</span>
                </div>
              ))}
            </div>
          )}

          <div className="technical-release-domains">
            {summary.summary.audio > 0 && (
              <details open={!compact}>
                <summary>
                  <span>Audio</span>
                  <small>{summary.summary.audio} masters</small>
                </summary>
                <dl>
                  <TechnicalInventoryFact
                    label="Codec"
                    entries={summary.inventory.audio.codecs}
                  />
                  <TechnicalInventoryFact
                    label="Sample rate"
                    entries={summary.inventory.audio.sampleRates}
                  />
                  <TechnicalInventoryFact
                    label="Bit depth"
                    entries={summary.inventory.audio.bitDepths}
                  />
                  <TechnicalInventoryFact
                    label="Channels"
                    entries={summary.inventory.audio.channels}
                  />
                  <TechnicalInventoryFact
                    label="Sample format"
                    entries={summary.inventory.audio.sampleFormats}
                  />
                </dl>
              </details>
            )}

            {summary.summary.artwork > 0 && (
              <details open={!compact}>
                <summary>
                  <span>Artwork</span>
                  <small>{summary.summary.artwork} masters</small>
                </summary>
                <dl>
                  <TechnicalInventoryFact
                    label="Codec"
                    entries={summary.inventory.artwork.codecs}
                  />
                  <TechnicalInventoryFact
                    label="Dimensions"
                    entries={summary.inventory.artwork.dimensions}
                  />
                  <TechnicalInventoryFact
                    label="Pixel format"
                    entries={summary.inventory.artwork.pixelFormats}
                  />
                </dl>
              </details>
            )}

            {summary.summary.video > 0 && (
              <details open={!compact}>
                <summary>
                  <span>Video</span>
                  <small>{summary.summary.video} masters</small>
                </summary>
                <dl>
                  <TechnicalInventoryFact
                    label="Codec"
                    entries={summary.inventory.video.codecs}
                  />
                  <TechnicalInventoryFact
                    label="Profile"
                    entries={summary.inventory.video.profiles}
                  />
                  <TechnicalInventoryFact
                    label="Dimensions"
                    entries={summary.inventory.video.dimensions}
                  />
                  <TechnicalInventoryFact
                    label="Frame rate"
                    entries={summary.inventory.video.frameRates}
                  />
                  <TechnicalInventoryFact
                    label="Pixel format"
                    entries={summary.inventory.video.pixelFormats}
                  />
                </dl>
              </details>
            )}
          </div>
        </>
      ) : (
        <p className="technical-release-message">
          Technical media health has not been loaded yet.
        </p>
      )}
    </section>
  );
}

type StagingCompletionReminder = {
  key: string;
  label: string;
  title: string;
  priority: number;
  tone: "asset" | "metadata";
  target:
    | {
        kind: "metadata";
        focus: MetadataEditorFocusTarget;
      }
    | {
        kind: "artist";
        artistId: string;
      };
};

export {
  MediaFileSpecBadge,
  technicalHealthLabel,
  technicalHealthTone,
  technicalContractTitle,
  TechnicalHealthBadge,
  TechnicalAuditSummaryBadge,
  technicalInventoryEntryLabel,
  TechnicalInventoryFact,
  TechnicalReleaseInspector,
  type StagingCompletionReminder,
};
