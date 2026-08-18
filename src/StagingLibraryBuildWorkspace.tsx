import {
  useState,
} from "react";

export type StagingLibraryBuildRelease = {
  id: string;
  releaseTitle?: string;
  primaryArtistName?: string;
  relativePath: string;
};

type StagingLibraryBuildTrackAction =
  | "create"
  | "refresh"
  | "current"
  | "blocked";

type StagingLibraryBuildPlan = {
  releaseId: string;
  generatedAt: string;
  planFingerprint: string;
  confirmationPhrase: string;
  summary: {
    trackCount: number;
    createCount: number;
    refreshCount: number;
    currentCount: number;
    blockedCount: number;
  };
  tracks: Array<{
    trackId: string;
    masterRelativePath: string | null;
    waveformRelativePath: string;
    action: StagingLibraryBuildTrackAction;
    reason: string;
  }>;
};

type StagingLibraryBuildResult = {
  releaseId: string;
  generatedCount: number;
  refreshedCount: number;
  currentCount: number;
  completedAt: string;
};

function messageFromResponse(
  value: unknown,
  fallback: string,
): string {
  if (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    "error" in value &&
    typeof value.error === "string"
  ) {
    return value.error;
  }

  return fallback;
}

function actionLabel(
  action: StagingLibraryBuildTrackAction,
): string {
  switch (action) {
    case "create":
      return "Create";
    case "refresh":
      return "Refresh";
    case "current":
      return "Current";
    case "blocked":
      return "Blocked";
  }
}

export function StagingLibraryBuildWorkspace({
  release,
  onBack,
  onEditMetadata,
  onOpenLibrary,
  onLibraryChanged,
  onNotify,
}: {
  release: StagingLibraryBuildRelease;
  onBack: () => void;
  onEditMetadata: () => void;
  onOpenLibrary: () => void;
  onLibraryChanged: () => void | Promise<void>;
  onNotify: (
    message: string,
    tone?: "success" | "info" | "error",
  ) => void;
}) {
  const [plan, setPlan] =
    useState<StagingLibraryBuildPlan | null>(null);
  const [planLoading, setPlanLoading] =
    useState(false);
  const [buildLoading, setBuildLoading] =
    useState(false);
  const [confirmed, setConfirmed] =
    useState(false);
  const [error, setError] =
    useState<string | null>(null);

  const previewPlan = async () => {
    setPlanLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/staging/library-build-plan?${new URLSearchParams({
          release: release.id,
        }).toString()}`,
      );
      const body = await response
        .json()
        .catch(() => null) as unknown;

      if (!response.ok) {
        throw new Error(
          messageFromResponse(
            body,
            `Library Build planning failed: HTTP ${response.status}`,
          ),
        );
      }

      setPlan(body as StagingLibraryBuildPlan);
      setConfirmed(false);
    } catch (planError) {
      setPlan(null);
      setConfirmed(false);
      setError(
        planError instanceof Error
          ? planError.message
          : "Library Build planning failed.",
      );
    } finally {
      setPlanLoading(false);
    }
  };

  const executeBuild = async () => {
    if (!plan || !confirmed) {
      return;
    }

    setBuildLoading(true);
    setError(null);

    try {
      const response = await fetch(
        "/api/staging/library-build",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            releaseId: release.id,
            planFingerprint:
              plan.planFingerprint,
            confirmation:
              plan.confirmationPhrase,
          }),
        },
      );
      const body = await response
        .json()
        .catch(() => null) as unknown;

      if (!response.ok) {
        throw new Error(
          messageFromResponse(
            body,
            `Library Build failed: HTTP ${response.status}`,
          ),
        );
      }

      const result =
        body as StagingLibraryBuildResult;

      onNotify(
        result.generatedCount > 0 ||
        result.refreshedCount > 0
          ? `Library waveforms updated: ${result.generatedCount} created · ${result.refreshedCount} refreshed.`
          : "Library waveforms are already current.",
        "success",
      );
      await onLibraryChanged();
      setConfirmed(false);
      await previewPlan();
    } catch (buildError) {
      const message =
        buildError instanceof Error
          ? buildError.message
          : "Library Build failed.";
      setError(message);
      onNotify(message, "error");
    } finally {
      setBuildLoading(false);
    }
  };

  const hasWriteWork =
    Boolean(
      plan &&
      (plan.summary.createCount > 0 ||
        plan.summary.refreshCount > 0),
    );
  const planBlocked =
    Boolean(plan?.summary.blockedCount);

  return (
    <section className="workflow-workspace staging-library-build-workspace">
      <header className="workflow-workspace-header staging-library-build-header">
        <div>
          <p className="eyebrow">
            Step 2 · Staging · Build
          </p>
          <h2>
            {release.releaseTitle?.trim() ||
              release.id}
          </h2>
          <p>
            {release.primaryArtistName?.trim()
              ? `${release.primaryArtistName} · `
              : ""}
            Existing Library release
          </p>
        </div>
        <div className="staging-library-build-header-actions">
          {plan && !planBlocked && hasWriteWork && (
            <>
              <label
                className="staging-library-build-header-confirmation"
                title="I confirm this build may create or replace waveform binary only."
              >
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={buildLoading}
                  onChange={(event) =>
                    setConfirmed(event.target.checked)
                  }
                />
                <span>Confirm waveform-only build</span>
              </label>
              <button
                type="button"
                className="primary-button"
                disabled={buildLoading || !confirmed}
                onClick={() => void executeBuild()}
              >
                {buildLoading
                  ? "Building Library waveforms…"
                  : "Build Library waveforms"}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onBack}
          >
            Back to Staging
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={onEditMetadata}
          >
            Edit metadata
          </button>
          <button
            type="button"
            onClick={onOpenLibrary}
          >
            Open in Library
          </button>
        </div>
      </header>

      <section className="ingest-build-plan-launcher staging-library-build-launcher">
        <div className="ingest-build-plan-launcher-copy">
          <span className="ingest-review-eyebrow">
            Canonical Library derivative plan
          </span>
          <h3>Preview Library waveform build</h3>
          <p>
            Inspect the existing canonical audio masters and create or refresh
            only <code>waveform-peaks.wfp</code>. This repair build does not
            replace masters, rewrite metadata, change artwork or numbering,
            create playback MP3s, or create HLS.
          </p>
        </div>
        <div className="ingest-build-plan-launcher-actions">
          <button
            type="button"
            className="primary-button"
            disabled={planLoading || buildLoading}
            onClick={() => void previewPlan()}
          >
            {planLoading
              ? "Inspecting Library…"
              : plan
                ? "Refresh build plan"
                : "Preview build plan"}
          </button>
          {plan && (
            <div className="ingest-build-plan-launcher-status">
              <span
                className={`badge ${
                  plan.summary.blockedCount === 0
                    ? "complete"
                    : "missing"
                }`}
              >
                {plan.summary.blockedCount === 0
                  ? "Plan ready"
                  : `${plan.summary.blockedCount} blocked`}
              </span>
              <span>
                Waveforms: {plan.summary.createCount} create
                {" · "}
                {plan.summary.refreshCount} refresh
                {" · "}
                {plan.summary.currentCount} current
              </span>
            </div>
          )}
        </div>
      </section>

      {error && (
        <p className="message error">
          {error}
        </p>
      )}

      {plan && (
        <>
          <section className="workflow-table-panel staging-library-build-plan-table">
            <header>
              <div>
                <h3>Library waveform status</h3>
                <p>
                  {plan.summary.trackCount} canonical track
                  {plan.summary.trackCount === 1 ? "" : "s"}
                </p>
              </div>
            </header>
            <div className="workflow-table-scroll">
              <table className="workflow-workspace-table">
                <thead>
                  <tr>
                    <th scope="col">Track</th>
                    <th scope="col">Canonical master</th>
                    <th scope="col">Waveform</th>
                    <th scope="col">Build state</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.tracks.map((track) => (
                    <tr key={track.trackId}>
                      <th scope="row">
                        {track.trackId}
                      </th>
                      <td>
                        {track.masterRelativePath
                          ? track.masterRelativePath
                              .split("/")
                              .at(-1)
                          : "Unavailable"}
                      </td>
                      <td>
                        <code>
                          waveform-peaks.wfp
                        </code>
                      </td>
                      <td>
                        <span
                          className={`badge staging-library-build-state ${track.action}`}
                          title={track.reason}
                        >
                          {actionLabel(track.action)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {planBlocked ? (
            <p className="message error staging-library-build-result-message">
              Resolve blocked canonical-master state before building waveforms.
            </p>
          ) : !hasWriteWork ? (
            <p className="message success staging-library-build-result-message">
              All Library waveforms are current. No write is required.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
