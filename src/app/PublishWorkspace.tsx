import {
  lazy,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  selectPreferredReleaseArtwork,
  selectReleaseFrontArtwork,
} from "../artwork-gallery.js";
import {
  readinessBadgeLabel,
  readinessTone,
  summarizeReleaseScanReadiness,
} from "../metadata-readiness.js";
import type { WorkflowLocationDisplay } from "../WorkflowNavigation.js";
import type {
  ArtistPublicationReceipt,
  BatchPreparationResponse,
  MediaPreparationProgress,
  MediaPreparationReceipt,
  MediaTechnicalAuditState,
  MediaTechnicalReleaseSummary,
  PublicReleaseUnpublishPlan,
  PublicReleaseUnpublishReceipt,
  PublishFleetRelease,
  PublishFleetSummary,
  PublishOperationHistory,
  PublishOperationSummary,
  PublishPackageReceipt,
  PublishPlan,
  PublishPlanIssue,
  PublishPlanItem,
  PublishedMediaDeploymentAudit,
  PublishedMediaDeploymentOperationReceipt,
  PublishedMediaDeploymentProfile,
  PublishedMediaDeploymentSyncPlan,
  PublishedMediaDeploymentTargetStatus,
  ReleaseScanResult,
  ToastMessage,
  VideoPreparationReceipt,
} from "./types.js";
import {
  type LibraryReleaseSortMode,
  libraryReleaseSortDate,
  sortLibraryReleases,
} from "./library-views.js";
import {
  MetadataFieldModal,
} from "./metadata-field-guidance.js";
import {
  TechnicalAuditSummaryBadge,
  TechnicalReleaseInspector,
} from "./technical-audit.js";
import {
  artworkPreviewUrl,
} from "./library-panels.js";
import {
  formatByteSize,
} from "./foundation.js";
import {
  formatReleaseTitle,
  publicTrackSelectionLabel,
} from "./release-display.js";

function assessPublishReadiness(
  release: ReleaseScanResult,
): {
  metadataLabel: string;
  metadataTone: string;
  masterLabel: string;
  streamLabel: string;
  artworkLabel: string;
  preflightLabel: string;
  preflightTone: string;
  note: string;
} {
  const metadata = summarizeReleaseScanReadiness(release);
  const trackCount = release.tracks.length;
  const readyMasters = release.tracks.filter(
    (track) => track.audioMasters.length === 1,
  ).length;
  const artworkCount =
    release.artworkMasters.length +
    release.tracks.reduce(
      (count, track) =>
        count + track.artworkMasters.length,
      0,
    );
  const metadataBlockers = metadata.core + metadata.credits;
  const masterBlockers =
    trackCount === 0 || readyMasters !== trackCount;

  const base = {
    metadataLabel: readinessBadgeLabel(metadata),
    metadataTone: readinessTone(metadata),
    masterLabel: `${readyMasters}/${trackCount}`,
    streamLabel: "Checked in Ready Check",
    artworkLabel: `${artworkCount}`,
  };

  if (metadataBlockers > 0 || masterBlockers) {
    const blockers: string[] = [];

    if (metadataBlockers > 0) {
      blockers.push(
        `${metadataBlockers} required metadata ${
          metadataBlockers === 1 ? "item" : "items"
        }`,
      );
    }

    if (trackCount === 0) {
      blockers.push("no tracks");
    } else if (readyMasters !== trackCount) {
      const missingMasters = trackCount - readyMasters;
      blockers.push(
        `${missingMasters} master ${
          missingMasters === 1 ? "source" : "sources"
        } unresolved`,
      );
    }

    return {
      ...base,
      preflightLabel: "Needs source work",
      preflightTone: "missing",
      note: blockers.join(" · "),
    };
  }

  if (
    artworkCount === 0 ||
    metadata.supplemental > 0
  ) {
    const preparation: string[] = [];

    if (artworkCount === 0) {
      preparation.push("artwork source missing");
    }

    if (metadata.supplemental > 0) {
      preparation.push(
        `${metadata.supplemental} optional metadata ${
          metadata.supplemental === 1 ? "item" : "items"
        } to review`,
      );
    }

    return {
      ...base,
      preflightLabel: "Needs preparation",
      preflightTone: "warning",
      note: preparation.join(" · "),
    };
  }

  return {
    ...base,
    preflightLabel: "Ready Check",
    preflightTone: "preview",
    note:
      "Canonical sources are present. HLS web streams, waveforms, and exact destinations are checked by Ready Check.",
  };
}

const mediaPreparationAllowedPublishBlockers = new Set([
  "playback-not-current",
  "web-stream-not-current",
  "waveform-not-current",
  "video-web-stream-not-current",
  "browser-artwork-preparation-required",
]);

type LibraryHealthBucket =
  | "blocked"
  | "warning"
  | "preparation";

type LibraryHealthSummary = {
  blocked: number;
  warning: number;
  preparation: number;
};

function libraryHealthBucket(
  issue: PublishPlanIssue,
): LibraryHealthBucket {
  if (
    mediaPreparationAllowedPublishBlockers.has(issue.code) ||
    issue.code.startsWith("derivative-") ||
    /(?:playback|waveform|web[- ]?stream|browser artwork|derivative)/i.test(
      `${issue.code} ${issue.message}`,
    )
  ) {
    return "preparation";
  }

  return issue.severity === "blocked"
    ? "blocked"
    : "warning";
}

function summarizeLibraryHealthIssues(
  issues: readonly PublishPlanIssue[],
): LibraryHealthSummary {
  return issues.reduce<LibraryHealthSummary>(
    (summary, issue) => {
      summary[libraryHealthBucket(issue)] += 1;
      return summary;
    },
    {
      blocked: 0,
      warning: 0,
      preparation: 0,
    },
  );
}

function libraryHealthTone(
  summary: LibraryHealthSummary,
): string {
  if (summary.blocked > 0) {
    return "missing";
  }

  if (summary.warning > 0) {
    return "warning";
  }

  if (summary.preparation > 0) {
    return "preview";
  }

  return "success";
}

function libraryHealthCompactLabel(
  summary: LibraryHealthSummary,
): string {
  if (summary.blocked > 0) {
    return `Block ${summary.blocked}`;
  }

  if (summary.warning > 0) {
    return `Warn ${summary.warning}`;
  }

  if (summary.preparation > 0) {
    return `Web prep ${summary.preparation}`;
  }

  return "Ready";
}

function libraryHealthTitle(
  summary: LibraryHealthSummary,
): string {
  const parts = [
    summary.blocked > 0
      ? `${summary.blocked} blocker${summary.blocked === 1 ? "" : "s"}`
      : "",
    summary.warning > 0
      ? `${summary.warning} warning${summary.warning === 1 ? "" : "s"}`
      : "",
    summary.preparation > 0
      ? `${summary.preparation} Web Package preparation item${summary.preparation === 1 ? "" : "s"}`
      : "",
  ].filter(Boolean);

  return parts.length > 0
    ? parts.join(" · ")
    : "Library ready";
}

function browserArtworkNeedsPreparation(
  plan: PublishPlan,
): boolean {
  return plan.issues.some(
    (issue) =>
      issue.code === "browser-artwork-preparation-required",
  );
}

function browserArtworkIsBlocked(
  plan: PublishPlan,
): boolean {
  return plan.issues.some(
    (issue) => issue.code === "browser-artwork-required",
  );
}

function hasNonDerivativePublishBlockers(
  plan: PublishPlan,
): boolean {
  return plan.issues.some(
    (issue) =>
      issue.severity === "blocked" &&
      issue.code !== "playback-not-current" &&
      issue.code !== "web-stream-not-current" &&
      issue.code !== "waveform-not-current" &&
      issue.code !== "video-web-stream-not-current" &&
      issue.code !== "browser-artwork-preparation-required",
  );
}

function hasMediaPreparationPublishBlockers(
  plan: PublishPlan,
): boolean {
  return plan.issues.some(
    (issue) =>
      issue.severity === "blocked" &&
      !mediaPreparationAllowedPublishBlockers.has(
        issue.code,
      ),
  );
}

function publishPreflightStatus(
  plan: PublishPlan,
): { label: string; tone: string } {
  if (
    canPreparePublishPlan(plan) ||
    canPrepareVideoPublishPlan(plan)
  ) {
    return { label: "Needs preparation", tone: "warning" };
  }

  if (
    plan.validation.blockedCount > 0 ||
    plan.derivatives.blockedCount > 0 ||
    hasNonDerivativePublishBlockers(plan)
  ) {
    return { label: "Blocked", tone: "missing" };
  }

  if (
    plan.derivatives.createCount > 0 ||
    plan.derivatives.replaceCount > 0
  ) {
    return { label: "Needs preparation", tone: "warning" };
  }

  if (plan.status === "warning") {
    return { label: "Review warnings", tone: "warning" };
  }

  if (publicPackageIsUpToDate(plan)) {
    return { label: "Up to date", tone: "success" };
  }

  return { label: "Ready", tone: "preview" };
}

function canPreparePublishPlan(
  plan: PublishPlan,
): boolean {
  const audioPreparationBlocked =
    plan.webStreams.blockedCount > 0 ||
    plan.waveforms.blockedCount > 0;
  const audioNeedsPreparation =
    plan.webStreams.createCount > 0 ||
    plan.webStreams.replaceCount > 0 ||
    plan.waveforms.createCount > 0 ||
    plan.waveforms.replaceCount > 0 ||
    browserArtworkNeedsPreparation(plan);

  return (
    plan.validation.blockedCount === 0 &&
    !audioPreparationBlocked &&
    !hasMediaPreparationPublishBlockers(plan) &&
    audioNeedsPreparation
  );
}

function canPrepareVideoPublishPlan(
  plan: PublishPlan,
): boolean {
  return (
    plan.validation.blockedCount === 0 &&
    plan.videoStreams.blockedCount === 0 &&
    !hasMediaPreparationPublishBlockers(plan) &&
    (plan.videoStreams.createCount > 0 ||
      plan.videoStreams.replaceCount > 0)
  );
}

function canPrepareLibraryPlayback(
  plan: PublishPlan,
): boolean {
  return (
    plan.libraryPlayback.blockedCount === 0 &&
    (plan.libraryPlayback.createCount > 0 ||
      plan.libraryPlayback.replaceCount > 0)
  );
}

function canBuildPublishPlan(
  plan: PublishPlan,
): boolean {
  return (
    plan.validation.blockedCount === 0 &&
    plan.derivatives.blockedCount === 0 &&
    !hasNonDerivativePublishBlockers(plan) &&
    plan.derivatives.createCount === 0 &&
    plan.derivatives.replaceCount === 0 &&
    plan.summary.blockedCount === 0 &&
    plan.publication.state !== "up-to-date"
  );
}

function publicReleaseAlreadyExists(
  plan: PublishPlan,
): boolean {
  return plan.destinationReleaseExists;
}

function publicPackageIsUpToDate(
  plan: PublishPlan,
): boolean {
  return (
    plan.publication.state === "up-to-date" &&
    plan.validation.blockedCount === 0 &&
    plan.derivatives.blockedCount === 0 &&
    !hasNonDerivativePublishBlockers(plan) &&
    plan.derivatives.createCount === 0 &&
    plan.derivatives.replaceCount === 0 &&
    plan.summary.blockedCount === 0
  );
}

function publishPlanActionTone(
  action: PublishPlanItem["action"],
): string {
  if (action === "blocked") {
    return "missing";
  }

  if (action === "replace") {
    return "warning";
  }

  return "preview";
}

function formatPublishPlanKind(
  kind: PublishPlanItem["kind"],
): string {
  return kind
    .split("-")
    .map((part) =>
      part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join(" ");
}

function publishPreflightHeadline(
  plan: PublishPlan,
): string {
  if (
    canPreparePublishPlan(plan) ||
    canPrepareVideoPublishPlan(plan)
  ) {
    return "Web media needs preparation";
  }

  if (
    plan.validation.blockedCount > 0 ||
    plan.derivatives.blockedCount > 0 ||
    hasNonDerivativePublishBlockers(plan)
  ) {
    return "Resolve blockers before continuing";
  }

  if (
    plan.derivatives.createCount > 0 ||
    plan.derivatives.replaceCount > 0
  ) {
    return "Web media needs preparation";
  }

  if (plan.status === "warning") {
    return "Review warnings before continuing";
  }

  if (publicPackageIsUpToDate(plan)) {
    return "Web Package is up to date";
  }

  return "Ready Check passed";
}

function publishPreflightGuidance(
  plan: PublishPlan,
): string {
  if (canPreparePublishPlan(plan)) {
    return hasNonDerivativePublishBlockers(plan)
      ? "Prepare the reproducible private media that can be generated now. Other Web Package blockers remain visible and must still be resolved before the release can be added."
      : browserArtworkNeedsPreparation(plan)
        ? "The release is ready for derivative preparation. Prepare release will generate current browser artwork from the canonical TIFF/TIF master along with any missing audio HLS or waveform resources."
        : "The canonical release can continue, but its segmented audio HLS stream or waveform derivatives must be prepared first.";
  }

  if (canPrepareVideoPublishPlan(plan)) {
    return "Canonical video masters are ready, but one or more private H.264/AAC segmented video derivatives and poster frames must be prepared before the Web Package can include video.";
  }

  if (
    plan.validation.blockedCount > 0 ||
    plan.derivatives.blockedCount > 0 ||
    hasNonDerivativePublishBlockers(plan)
  ) {
    return "Ready Check found blocking issues. Resolve them before the Web Package can be prepared.";
  }

  if (
    plan.derivatives.createCount > 0 ||
    plan.derivatives.replaceCount > 0
  ) {
    return "The canonical release can continue, but its segmented HLS web stream or waveform derivatives must be prepared first.";
  }

  if (plan.status === "warning") {
    return "No blocking issue was found, but the remaining warnings should be reviewed before adding or updating this release in the Web Package.";
  }

  if (publicPackageIsUpToDate(plan)) {
    return "The current canonical metadata and web-facing media inputs match the Web Package snapshot. No Web Package update is required.";
  }

  return "Ready Check passed. This release can be prepared for the Hiplingo web app.";
}

function publishNextStepLabel(
  plan: PublishPlan,
): string {
  if (canPreparePublishPlan(plan)) {
    return "Prepare release";
  }

  if (canPrepareVideoPublishPlan(plan)) {
    return "Prepare video media";
  }

  if (
    plan.validation.blockedCount > 0 ||
    plan.derivatives.blockedCount > 0 ||
    hasNonDerivativePublishBlockers(plan)
  ) {
    return "Resolve blockers";
  }

  if (
    plan.derivatives.createCount > 0 ||
    plan.derivatives.replaceCount > 0
  ) {
    return "Prepare release";
  }

  if (publicPackageIsUpToDate(plan)) {
    return "Web Package is up to date";
  }

  return publicReleaseAlreadyExists(plan)
    ? "Update Web Package"
    : "Make Public";
}

function latestPublishOperationForRelease(
  history: PublishOperationHistory | null,
  releaseId: string,
): PublishOperationSummary | null {
  return history?.operations.find(
    (operation) => operation.releaseId === releaseId,
  ) ?? null;
}

function publishOperationBadge(
  operation: PublishOperationSummary | null,
): { label: string; tone: string } | null {
  if (!operation) {
    return null;
  }

  if (operation.state === "interrupted") {
    return {
      label:
        operation.mode === "unpublish"
          ? "Interrupted removal"
          : "Interrupted",
      tone: "missing",
    };
  }

  if (operation.state === "failed") {
    return {
      label:
        operation.mode === "unpublish"
          ? "Removal failed"
          : "Package build failed",
      tone: "missing",
    };
  }

  if (operation.state === "running") {
    return {
      label:
        operation.mode === "unpublish"
          ? "Removing from Web Package"
          : "Building package",
      tone: "preview",
    };
  }

  if (operation.state === "recovered") {
    return { label: "Recovered", tone: "warning" };
  }

  return null;
}

function unresolvedPublishOperationForRelease(
  history: PublishOperationHistory | null,
  releaseId: string,
): PublishOperationSummary | null {
  const operation = latestPublishOperationForRelease(
    history,
    releaseId,
  );

  return operation &&
    (operation.state === "interrupted" ||
      operation.state === "running")
    ? operation
    : null;
}

type PublishPlanReviewIntent =
  | "package"
  | "make-public"
  | "make-private";

function PublishWorkspace({
  mode,
  releases,
  workflowLocations,
  loading,
  error,
  onRefresh,
  onNotify,
  technicalAudit,
  technicalByRelease,
}: {
  mode: "public-package" | "production";
  releases: ReleaseScanResult[];
  workflowLocations: WorkflowLocationDisplay[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onNotify: (
    message: string,
    tone?: ToastMessage["tone"],
  ) => void;
  technicalAudit: MediaTechnicalAuditState;
  technicalByRelease: Map<
    string,
    MediaTechnicalReleaseSummary
  >;
}) {
  const [selectedPlan, setSelectedPlan] =
    useState<PublishPlan | null>(null);
  const [selectedPlanIntent, setSelectedPlanIntent] =
    useState<PublishPlanReviewIntent>("package");
  const [planLoadingReleaseId, setPlanLoadingReleaseId] =
    useState<string | null>(null);
  const [planError, setPlanError] =
    useState<string | null>(null);
  const [prepareLoading, setPrepareLoading] =
    useState(false);
  const [prepareProgress, setPrepareProgress] =
    useState<MediaPreparationProgress | null>(null);
  const [publishLoading, setPublishLoading] =
    useState(false);
  const [publicationSelectionSaving, setPublicationSelectionSaving] =
    useState(false);
  const [unpublishLoadingReleaseId, setUnpublishLoadingReleaseId] =
    useState<string | null>(null);
  const [publishOperations, setPublishOperations] =
    useState<PublishOperationHistory | null>(null);
  const [publishOperationsLoading, setPublishOperationsLoading] =
    useState(false);
  const [publishOperationsError, setPublishOperationsError] =
    useState<string | null>(null);
  const [recoveringOperationId, setRecoveringOperationId] =
    useState<string | null>(null);
  const [selectedBatchReleaseIds, setSelectedBatchReleaseIds] =
    useState<Set<string>>(() => new Set());
  const [batchPrepareLoading, setBatchPrepareLoading] =
    useState(false);
  const [publishFleet, setPublishFleet] =
    useState<PublishFleetSummary | null>(null);
  const [publishFleetLoading, setPublishFleetLoading] =
    useState(false);
  const [publishFleetError, setPublishFleetError] =
    useState<string | null>(null);
  const [artistPublicationLoading, setArtistPublicationLoading] =
    useState(false);
  const [deploymentManifestLoading, setDeploymentManifestLoading] =
    useState(false);
  const [deploymentTargetStatus, setDeploymentTargetStatus] =
    useState<PublishedMediaDeploymentTargetStatus | null>(null);
  const [selectedDeploymentProfile, setSelectedDeploymentProfile] =
    useState<PublishedMediaDeploymentProfile["name"] | null>(null);
  const [deploymentTargetLoading, setDeploymentTargetLoading] =
    useState(false);
  const [deploymentSyncPlan, setDeploymentSyncPlan] =
    useState<PublishedMediaDeploymentSyncPlan | null>(null);
  const [deploymentSyncPlanLoading, setDeploymentSyncPlanLoading] =
    useState(false);
  const [deploymentSyncError, setDeploymentSyncError] =
    useState<string | null>(null);
  const [deploymentSandboxAction, setDeploymentSandboxAction] =
    useState<"deploy" | "rollback" | null>(null);
  const [allowPendingLibraryDeployment, setAllowPendingLibraryDeployment] =
    useState(false);
  const [sortMode, setSortMode] =
    useState<LibraryReleaseSortMode>("date-desc");
  const [webPackageFilter, setWebPackageFilter] =
    useState<"included" | "not-included" | "all">("all");
  const sortedReleases = useMemo(
    () => sortLibraryReleases(releases, sortMode),
    [releases, sortMode],
  );

  useEffect(() => {
    if ((publishFleet?.summary.updateAvailableCount ?? 0) === 0) {
      setAllowPendingLibraryDeployment(false);
    }
  }, [publishFleet?.summary.updateAvailableCount]);

  const loadPublishFleet = useCallback(async () => {
    setPublishFleetLoading(true);
    setPublishFleetError(null);

    try {
      const response = await fetch(
        "/api/publish/fleet",
      );
      const payload = await response.json() as
        | PublishFleetSummary
        | { error?: string };

      if (!response.ok || !("deployment" in payload)) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Unable to load the publish fleet summary.",
        );
      }

      setPublishFleet(payload);
    } catch (fleetError) {
      setPublishFleetError(
        fleetError instanceof Error
          ? fleetError.message
          : "Unable to load the publish fleet summary.",
      );
    } finally {
      setPublishFleetLoading(false);
    }
  }, []);

  const publishArtistSnapshot = useCallback(async () => {
    const plan = publishFleet?.artists;
    if (
      !plan ||
      plan.status === "blocked" ||
      plan.state === "up-to-date"
    ) {
      return;
    }

    const reviewed = window.confirm(
      "Prepare the Artist snapshot for the current public release set?\n\n" +
        `${plan.summary.artistCount} required Artists · ${plan.summary.photoCount} photos · ${plan.summary.includedReleaseCount} Included releases\n\n` +
        "Artist inclusion is derived automatically from Included releases through release.primary_artist.id. This rebuilds only the sanitized Artist snapshot; canonical Library sources are never modified.",
    );
    if (!reviewed) {
      return;
    }

    setArtistPublicationLoading(true);
    setPublishFleetError(null);

    try {
      const response = await fetch(
        "/api/publish/artists-build",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            planFingerprint:
              plan.planFingerprint,
            planGeneratedAt:
              plan.generatedAt,
          }),
        },
      );
      const payload = await response.json() as
        | ArtistPublicationReceipt
        | { error?: string };

      if (
        !response.ok ||
        !("resourceCount" in payload)
      ) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Unable to update the Artist Web Package.",
        );
      }

      await loadPublishFleet();
      onNotify(
        `Artist snapshot ${payload.mode === "build" ? "prepared" : "updated"} · ${payload.artistCount} Artists · ${payload.photoCount} photos`,
        "success",
      );
    } catch (artistPublishError) {
      setPublishFleetError(
        artistPublishError instanceof Error
          ? artistPublishError.message
          : "Unable to update the Artist Web Package.",
      );
    } finally {
      setArtistPublicationLoading(false);
    }
  }, [loadPublishFleet, onNotify, publishFleet?.artists]);

  const refreshDeploymentManifest = useCallback(async () => {
    setDeploymentManifestLoading(true);
    setPublishFleetError(null);

    try {
      const response = await fetch(
        "/api/publish/deployment-manifest",
        { method: "POST" },
      );
      const payload = await response.json() as
        | PublishedMediaDeploymentAudit
        | { error?: string };

      if (!response.ok || !("deployable" in payload)) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Unable to refresh the package index.",
        );
      }

      setDeploymentSyncPlan(null);
      setDeploymentSyncError(null);
      await loadPublishFleet();
      onNotify(
        "Package index refreshed and the Web Package snapshot verified.",
        "success",
      );
    } catch (manifestError) {
      setPublishFleetError(
        manifestError instanceof Error
          ? manifestError.message
          : "Unable to refresh the package index.",
      );
    } finally {
      setDeploymentManifestLoading(false);
    }
  }, [loadPublishFleet, onNotify]);

  const loadDeploymentTargetStatus = useCallback(async (
    profileName?: PublishedMediaDeploymentProfile["name"],
  ) => {
    setDeploymentTargetLoading(true);
    setDeploymentSyncError(null);

    try {
      const profileQuery = profileName
        ? `?profile=${encodeURIComponent(profileName)}`
        : "";
      const response = await fetch(
        `/api/publish/deployment-target${profileQuery}`,
      );
      const payload = await response.json() as
        | PublishedMediaDeploymentTargetStatus
        | { error?: string };

      if (!response.ok || !("configured" in payload)) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Unable to load the deployment target.",
        );
      }

      setDeploymentTargetStatus(payload);
      setSelectedDeploymentProfile(payload.profile.name);
    } catch (targetError) {
      setDeploymentSyncError(
        targetError instanceof Error
          ? targetError.message
          : "Unable to load the deployment target.",
      );
    } finally {
      setDeploymentTargetLoading(false);
    }
  }, []);

  const loadDeploymentSyncPlan = useCallback(async () => {
    setDeploymentSyncPlanLoading(true);
    setDeploymentSyncError(null);

    try {
      const activeProfile =
        selectedDeploymentProfile ??
        deploymentTargetStatus?.profile.name;
      const profileQuery = activeProfile
        ? `?profile=${encodeURIComponent(activeProfile)}`
        : "";
      const response = await fetch(
        `/api/publish/deployment-sync-plan${profileQuery}`,
        { method: "POST" },
      );
      const payload = await response.json() as
        | PublishedMediaDeploymentSyncPlan
        | { error?: string };

      if (!response.ok || !("planFingerprint" in payload)) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Unable to compare the deployment target.",
        );
      }

      setDeploymentSyncPlan(payload);
      await loadDeploymentTargetStatus(
        payload.profile.name,
      );
    } catch (syncError) {
      setDeploymentSyncPlan(null);
      setDeploymentSyncError(
        syncError instanceof Error
          ? syncError.message
          : "Unable to compare the deployment target.",
      );
    } finally {
      setDeploymentSyncPlanLoading(false);
    }
  }, [
    deploymentTargetStatus?.profile.name,
    loadDeploymentTargetStatus,
    selectedDeploymentProfile,
  ]);

  const selectDeploymentProfile = useCallback(async (
    profileName: PublishedMediaDeploymentProfile["name"],
  ) => {
    setSelectedDeploymentProfile(profileName);
    setDeploymentSyncPlan(null);
    await loadDeploymentTargetStatus(profileName);
  }, [loadDeploymentTargetStatus]);

  const deployLocalSandbox = useCallback(async () => {
    if (
      deploymentTargetStatus?.profile.name !== "local-sandbox" ||
      deploymentTargetStatus.target?.kind !== "local" ||
      deploymentSyncPlan?.status !== "changes"
    ) {
      return;
    }

    const pendingLibraryChanges =
      publishFleet?.summary.updateAvailableCount ?? 0;
    if (
      pendingLibraryChanges > 0 &&
      !allowPendingLibraryDeployment
    ) {
      setDeploymentSyncError(
        `${pendingLibraryChanges} Included ${pendingLibraryChanges === 1 ? "release has" : "releases have"} pending Library changes. Update the Web Package first, or explicitly allow deployment of the older Web Package snapshot.`,
      );
      return;
    }

    const pendingNotice = pendingLibraryChanges > 0
      ? `\n\nWARNING: ${pendingLibraryChanges} Included ${pendingLibraryChanges === 1 ? "release has" : "releases have"} newer Library changes that are not included in this Web Package snapshot.`
      : "";
    const reviewed = window.confirm(
      `Deploy the reviewed local sandbox plan?\n\n${deploymentSyncPlan.summary.changeCount} changes · +${deploymentSyncPlan.summary.addCount} add · ${deploymentSyncPlan.summary.updateCount} update · −${deploymentSyncPlan.summary.removeCount} remove\n\nTarget: ${deploymentTargetStatus.target.destinationPath}${pendingNotice}\n\nThis writes only to the local deployment sandbox.`,
    );
    if (!reviewed) {
      return;
    }

    setDeploymentSandboxAction("deploy");
    setDeploymentSyncError(null);

    try {
      const response = await fetch(
        "/api/publish/deployment-sandbox-execute",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            planFingerprint: deploymentSyncPlan.planFingerprint,
            allowPendingLibraryChanges: allowPendingLibraryDeployment,
          }),
        },
      );
      const payload = await response.json() as
        | PublishedMediaDeploymentOperationReceipt
        | { error?: string };

      if (!response.ok || !("operationId" in payload)) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Unable to deploy the local sandbox.",
        );
      }

      setDeploymentSyncPlan(null);
      await loadDeploymentTargetStatus("local-sandbox");
      await loadDeploymentSyncPlan();
      onNotify(
        `Local sandbox deployed · ${payload.summary.changeCount} changes verified.`,
        "success",
      );
    } catch (deploymentError) {
      setDeploymentSyncError(
        deploymentError instanceof Error
          ? deploymentError.message
          : "Unable to deploy the local sandbox.",
      );
    } finally {
      setDeploymentSandboxAction(null);
    }
  }, [
    allowPendingLibraryDeployment,
    deploymentSyncPlan,
    deploymentTargetStatus,
    loadDeploymentSyncPlan,
    loadDeploymentTargetStatus,
    onNotify,
    publishFleet?.summary.updateAvailableCount,
  ]);

  const rollbackLocalSandbox = useCallback(async () => {
    const latest = deploymentTargetStatus?.latestOperation;
    if (
      deploymentTargetStatus?.profile.name !== "local-sandbox" ||
      deploymentTargetStatus.target?.kind !== "local" ||
      latest?.state !== "completed" ||
      !latest.previousContentFingerprint
    ) {
      return;
    }

    const reviewed = window.confirm(
      `Roll back the local sandbox to the previous verified snapshot?\n\nCurrent deployment: ${latest.sourceContentFingerprint.slice(0, 12)}…\nPrevious snapshot: ${latest.previousContentFingerprint.slice(0, 12)}…\n\nTarget: ${deploymentTargetStatus.target.destinationPath}\n\nThis affects only the local deployment sandbox.`,
    );
    if (!reviewed) {
      return;
    }

    setDeploymentSandboxAction("rollback");
    setDeploymentSyncError(null);

    try {
      const response = await fetch(
        "/api/publish/deployment-sandbox-rollback",
        { method: "POST" },
      );
      const payload = await response.json() as
        | PublishedMediaDeploymentOperationReceipt
        | { error?: string };

      if (!response.ok || !("operationId" in payload)) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Unable to roll back the local sandbox.",
        );
      }

      setDeploymentSyncPlan(null);
      await loadDeploymentTargetStatus("local-sandbox");
      await loadDeploymentSyncPlan();
      onNotify(
        "Local sandbox rolled back to the previous verified snapshot.",
        "success",
      );
    } catch (rollbackError) {
      setDeploymentSyncError(
        rollbackError instanceof Error
          ? rollbackError.message
          : "Unable to roll back the local sandbox.",
      );
    } finally {
      setDeploymentSandboxAction(null);
    }
  }, [
    deploymentTargetStatus,
    loadDeploymentSyncPlan,
    loadDeploymentTargetStatus,
    onNotify,
  ]);

  const loadPublishOperations = useCallback(async () => {
    setPublishOperationsLoading(true);
    setPublishOperationsError(null);

    try {
      const response = await fetch(
        "/api/publish/operations?limit=40",
      );
      const payload = await response.json() as
        | PublishOperationHistory
        | { error?: string };

      if (!response.ok || !("operations" in payload)) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Unable to load publish-operation history.",
        );
      }

      setPublishOperations(payload);
    } catch (operationError) {
      setPublishOperationsError(
        operationError instanceof Error
          ? operationError.message
          : "Unable to load publish-operation history.",
      );
    } finally {
      setPublishOperationsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPublishOperations();
  }, [loadPublishOperations, releases]);

  useEffect(() => {
    void loadPublishFleet();
  }, [loadPublishFleet, releases]);

  useEffect(() => {
    if (mode === "production") {
      /*
       * Live opens on the local rehearsal target by default. Production is
       * still one explicit profile choice away, and browser writes remain
       * restricted to local-sandbox.
       */
      void loadDeploymentTargetStatus("local-sandbox");
    }
  }, [loadDeploymentTargetStatus, mode]);

  useEffect(() => {
    if (mode === "production") {
      setSelectedPlan(null);
      setSelectedPlanIntent("package");
      setPlanError(null);
    }
  }, [mode]);

  const loadPublishPlan = useCallback(async (
    releaseId: string,
  ) => {
    setPlanLoadingReleaseId(releaseId);
    setPlanError(null);

    try {
      const response = await fetch(
        `/api/publish/plan?release=${encodeURIComponent(releaseId)}`,
      );
      const payload = await response.json() as
        | PublishPlan
        | { error?: string };

      if (!response.ok || !("releaseId" in payload)) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Unable to run the Web Package ready check.",
        );
      }

      setSelectedPlan(payload);
    } catch (planRequestError) {
      setPlanError(
        planRequestError instanceof Error
          ? planRequestError.message
          : "Unable to run the Web Package ready check.",
      );
    } finally {
      setPlanLoadingReleaseId(null);
    }
  }, []);

  const openPublishPlan = useCallback((
    releaseId: string,
    intent: PublishPlanReviewIntent,
  ) => {
    setSelectedPlanIntent(intent);
    setSelectedPlan(null);
    void loadPublishPlan(releaseId);
  }, [loadPublishPlan]);

  const savePublicationSelection = useCallback(async (
    plan: PublishPlan,
    includeVideo: boolean,
    includedTrackIds: string[],
  ) => {
    setPublicationSelectionSaving(true);
    setPlanError(null);

    try {
      const response = await fetch(
        "/api/publish/release-settings",
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            releaseId: plan.releaseId,
            includeVideo,
            includedTrackIds,
            ...(plan.publicSelection.settingsSha256
              ? {
                  expectedSha256:
                    plan.publicSelection.settingsSha256,
                }
              : {}),
          }),
        },
      );
      const payload = await response.json() as
        | { settings: unknown }
        | { error?: string };

      if (!response.ok || !("settings" in payload)) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Unable to save public-media selection.",
        );
      }

      await Promise.all([
        loadPublishPlan(plan.releaseId),
        loadPublishFleet(),
      ]);
      onNotify(
        "Public-media selection saved. Ready Check refreshed.",
        "success",
      );
    } catch (selectionError) {
      setPlanError(
        selectionError instanceof Error
          ? selectionError.message
          : "Unable to save public-media selection.",
      );
    } finally {
      setPublicationSelectionSaving(false);
    }
  }, [loadPublishFleet, loadPublishPlan, onNotify]);

  const recoverOperation = useCallback(async (
    operation: PublishOperationSummary,
  ) => {
    setRecoveringOperationId(operation.operationId);
    setPublishOperationsError(null);
    setPlanError(null);

    try {
      const response = await fetch(
        "/api/publish/recover",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            operationId: operation.operationId,
          }),
        },
      );
      const payload = await response.json() as
        | PublishOperationSummary
        | { error?: string };

      if (!response.ok || !("operationId" in payload)) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Unable to recover publish operation.",
        );
      }

      await loadPublishOperations();
      await Promise.resolve(onRefresh());
      if (selectedPlan?.releaseId === operation.releaseId) {
        await loadPublishPlan(operation.releaseId);
      }
      onNotify(
        payload.state === "completed"
          ? "Interrupted publish finalized after integrity verification."
          : "Interrupted publish recovered safely.",
        "success",
      );
    } catch (recoveryError) {
      setPublishOperationsError(
        recoveryError instanceof Error
          ? recoveryError.message
          : "Unable to recover publish operation.",
      );
    } finally {
      setRecoveringOperationId(null);
    }
  }, [
    loadPublishOperations,
    loadPublishPlan,
    onNotify,
    onRefresh,
    selectedPlan?.releaseId,
  ]);

  const prepareSelectedReleases = useCallback(async () => {
    const releaseIds = Array.from(selectedBatchReleaseIds);

    if (releaseIds.length === 0) {
      return;
    }

    setBatchPrepareLoading(true);
    setPlanError(null);

    try {
      const response = await fetch(
        "/api/publish/prepare-batch",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            releaseIds,
            scope: "all",
          }),
        },
      );
      const payload = await response.json() as
        | BatchPreparationResponse
        | { error?: string };

      if (!response.ok || !("results" in payload)) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Unable to prepare selected releases.",
        );
      }

      setSelectedBatchReleaseIds(new Set());
      await Promise.resolve(onRefresh());
      await loadPublishOperations();
      if (selectedPlan) {
        await loadPublishPlan(selectedPlan.releaseId);
      }

      onNotify(
        `Batch preparation: ${payload.preparedCount} prepared · ${payload.skippedCount} already current · ${payload.failedCount} failed.`,
        payload.failedCount > 0 ? "error" : "success",
      );

      const failed = payload.results.filter(
        (result) => result.status === "failed",
      );
      if (failed.length > 0) {
        setPlanError(
          failed
            .map((result) =>
              `${result.releaseId}: ${result.error ?? "Preparation failed."}`,
            )
            .join(" "),
        );
      }
    } catch (batchError) {
      setPlanError(
        batchError instanceof Error
          ? batchError.message
          : "Unable to prepare selected releases.",
      );
    } finally {
      setBatchPrepareLoading(false);
    }
  }, [
    loadPublishOperations,
    loadPublishPlan,
    onNotify,
    onRefresh,
    selectedBatchReleaseIds,
    selectedPlan,
  ]);

  const prepareRelease = useCallback(async (
    plan: PublishPlan,
    scope: "all" | "playback" = "all",
  ) => {
    const operationId =
      `media-preparation-${crypto.randomUUID()}`;
    let progressTimer: number | undefined;

    setPrepareLoading(true);
    setPlanError(null);
    setPrepareProgress({
      operationId,
      releaseId: plan.releaseId,
      status: "running",
      phase: "starting",
      message:
        scope === "playback"
          ? "Starting Library MP3 preparation…"
          : "Starting media preparation…",
      completedUnits: 0,
      totalUnits: 0,
      trackCount: plan.derivatives.trackCount,
      updatedAt: new Date().toISOString(),
    });

    const pollProgress = async () => {
      try {
        const progressResponse = await fetch(
          `/api/publish/prepare-progress?operationId=${encodeURIComponent(operationId)}`,
        );
        if (!progressResponse.ok) {
          return;
        }

        const progress = await progressResponse.json() as
          MediaPreparationProgress;
        if (progress.operationId === operationId) {
          setPrepareProgress(progress);
        }
      } catch {
        // Preparation itself remains authoritative. A transient
        // progress-poll failure should not fail the media job.
      }
    };

    progressTimer = window.setInterval(
      () => void pollProgress(),
      350,
    );
    void pollProgress();

    try {
      const response = await fetch(
        "/api/publish/prepare",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            releaseId: plan.releaseId,
            planFingerprint: plan.planFingerprint,
            planGeneratedAt: plan.generatedAt,
            operationId,
            scope,
          }),
        },
      );
      const payload = await response.json() as
        | MediaPreparationReceipt
        | { error?: string };

      await pollProgress();

      if (!response.ok || !("operationId" in payload)) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Unable to prepare release media.",
        );
      }

      await loadPublishPlan(plan.releaseId);
      await Promise.resolve(onRefresh());
      const preparedParts = [
        payload.playbackCount > 0
          ? `${payload.playbackCount} Library playback ${payload.playbackCount === 1 ? "MP3" : "MP3s"}`
          : null,
        payload.streamCount > 0
          ? `${payload.streamCount} HLS web ${payload.streamCount === 1 ? "stream" : "streams"}`
          : null,
        payload.waveformCount > 0
          ? `${payload.waveformCount} ${payload.waveformCount === 1 ? "waveform" : "waveforms"}`
          : null,
        payload.artworkCount > 0
          ? `${payload.artworkCount} browser artwork ${payload.artworkCount === 1 ? "derivative" : "derivatives"}`
          : null,
      ].filter((part): part is string => Boolean(part));

      onNotify(
        preparedParts.length > 0
          ? `Prepared ${preparedParts.join(", ")}.`
          : scope === "playback"
            ? "Library playback MP3s are already current."
            : "Release media is already current.",
        "success",
      );
    } catch (prepareError) {
      setPlanError(
        prepareError instanceof Error
          ? prepareError.message
          : "Unable to prepare release media.",
      );
    } finally {
      if (progressTimer !== undefined) {
        window.clearInterval(progressTimer);
      }
      setPrepareLoading(false);
      setPrepareProgress(null);
    }
  }, [loadPublishPlan, onNotify, onRefresh]);

  const prepareVideoRelease = useCallback(async (
    plan: PublishPlan,
  ) => {
    const operationId =
      `video-preparation-${crypto.randomUUID()}`;
    let progressTimer: number | undefined;

    setPrepareLoading(true);
    setPlanError(null);
    setPrepareProgress({
      operationId,
      releaseId: plan.releaseId,
      status: "running",
      phase: "starting",
      message: "Starting video stream + poster preparation…",
      completedUnits: 0,
      totalUnits: 0,
      trackCount: 0,
      videoCount: plan.videoStreams.videoCount,
      updatedAt: new Date().toISOString(),
    });

    const pollProgress = async () => {
      try {
        const progressResponse = await fetch(
          `/api/publish/prepare-progress?operationId=${encodeURIComponent(operationId)}`,
        );
        if (!progressResponse.ok) {
          return;
        }

        const progress = await progressResponse.json() as
          MediaPreparationProgress;
        if (progress.operationId === operationId) {
          setPrepareProgress(progress);
        }
      } catch {
        // The preparation request remains authoritative.
      }
    };

    progressTimer = window.setInterval(
      () => void pollProgress(),
      350,
    );
    void pollProgress();

    try {
      const response = await fetch(
        "/api/publish/prepare-video",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            releaseId: plan.releaseId,
            planFingerprint:
              plan.videoStreams.planFingerprint,
            planGeneratedAt:
              plan.videoStreams.generatedAt,
            operationId,
            includedVideoIds:
              plan.publicSelection.includedVideoIds,
          }),
        },
      );
      const payload = await response.json() as
        | VideoPreparationReceipt
        | { error?: string };

      await pollProgress();

      if (!response.ok || !("operationId" in payload)) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Unable to prepare release video media.",
        );
      }

      await loadPublishPlan(plan.releaseId);
      await Promise.resolve(onRefresh());
      onNotify(
        `Prepared ${payload.streamCount} video HLS ${payload.streamCount === 1 ? "stream" : "streams"} with poster ${payload.streamCount === 1 ? "frame" : "frames"}.`,
        "success",
      );
    } catch (prepareError) {
      setPlanError(
        prepareError instanceof Error
          ? prepareError.message
          : "Unable to prepare release video media.",
      );
    } finally {
      if (progressTimer !== undefined) {
        window.clearInterval(progressTimer);
      }
      setPrepareLoading(false);
      setPrepareProgress(null);
    }
  }, [loadPublishPlan, onNotify, onRefresh]);

  const publishRelease = useCallback(async (
    plan: PublishPlan,
  ) => {
    setPublishLoading(true);
    setPlanError(null);

    try {
      const response = await fetch(
        "/api/publish/build",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            releaseId: plan.releaseId,
            planFingerprint: plan.planFingerprint,
            planGeneratedAt: plan.generatedAt,
          }),
        },
      );
      const payload = await response.json() as
        | PublishPackageReceipt
        | { error?: string };

      if (!response.ok || !("operationId" in payload)) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Unable to update the Web Package.",
        );
      }

      await loadPublishPlan(plan.releaseId);
      await loadPublishOperations();
      await Promise.resolve(onRefresh());
      if (selectedPlanIntent === "make-public") {
        setSelectedPlanIntent("package");
      }
      onNotify(
        payload.mode === "update"
          ? "Web Package updated successfully."
          : "Release is now Public in the Web Package.",
        "success",
      );
    } catch (publishError) {
      setPlanError(
        publishError instanceof Error
          ? publishError.message
          : "Unable to update the Web Package.",
      );
    } finally {
      setPublishLoading(false);
    }
  }, [
    loadPublishOperations,
    loadPublishPlan,
    onNotify,
    onRefresh,
    selectedPlanIntent,
  ]);

  const unpublishRelease = useCallback(async (
    releaseId: string,
    displayTitle?: string,
    requireBrowserConfirmation = true,
  ) => {
    setUnpublishLoadingReleaseId(releaseId);
    setPlanError(null);

    try {
      const planResponse = await fetch(
        `/api/publish/unpublish-plan?release=${encodeURIComponent(releaseId)}`,
      );
      const planPayload = await planResponse.json() as
        | PublicReleaseUnpublishPlan
        | { error?: string };

      if (
        !planResponse.ok ||
        !("planFingerprint" in planPayload)
      ) {
        throw new Error(
          "error" in planPayload && planPayload.error
            ? planPayload.error
            : "Unable to build the Web Package removal plan.",
        );
      }

      if (planPayload.status !== "ready") {
        throw new Error(
          planPayload.issues.length > 0
            ? planPayload.issues
                .map((issue) => issue.message)
                .join(" ")
            : "This release is not safe to remove from the Web Package.",
        );
      }

      const label =
        displayTitle ??
        planPayload.catalogEntry?.title ??
        releaseId;
      const reviewed =
        !requireBrowserConfirmation ||
        window.confirm(
          `Make “${label}” Private / Local?\n\n` +
          `${planPayload.publicFiles.fileCount} public files · ${formatByteSize(planPayload.publicFiles.totalBytes)}\n` +
          `Public path: ${planPayload.destinationReleaseRelativePath}\n\n` +
          "Only the sanitized Web Package copy and public catalog membership are removed. " +
          "The canonical Library release and masters are not deleted.\n\n" +
          "A later Live deployment will carry this removal to the website.",
        );

      if (!reviewed) {
        return;
      }

      const response = await fetch(
        "/api/publish/unpublish",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            releaseId,
            planFingerprint:
              planPayload.planFingerprint,
            planGeneratedAt:
              planPayload.generatedAt,
            confirmation:
              planPayload.confirmation,
          }),
        },
      );
      const payload = await response.json() as
        | PublicReleaseUnpublishReceipt
        | { error?: string };

      if (
        !response.ok ||
        !("operationId" in payload)
      ) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Unable to remove the release from the Web Package.",
        );
      }

      if (selectedPlan?.releaseId === releaseId) {
        setSelectedPlan(null);
      }
      setDeploymentSyncPlan(null);
      setAllowPendingLibraryDeployment(false);
      await Promise.resolve(onRefresh());
      await Promise.all([
        loadPublishFleet(),
        loadPublishOperations(),
        loadDeploymentTargetStatus(
          selectedDeploymentProfile ?? undefined,
        ),
      ]);

      onNotify(
        `Removed ${label} from the Web Package · ${payload.removedFileCount} web files removed. Refresh the package index before reviewing Live changes.`,
        "success",
      );
    } catch (unpublishError) {
      setPlanError(
        unpublishError instanceof Error
          ? unpublishError.message
          : "Unable to remove the release from the Web Package.",
      );
    } finally {
      setUnpublishLoadingReleaseId(null);
    }
  }, [
    loadDeploymentTargetStatus,
    loadPublishFleet,
    loadPublishOperations,
    onNotify,
    onRefresh,
    selectedDeploymentProfile,
    selectedPlan?.releaseId,
  ]);

  const deploymentAudit = publishFleet?.deployment ?? null;
  const packageIndexNeedsRefresh =
    Boolean(deploymentAudit) &&
    !deploymentAudit?.deploymentManifest.current;
  const pendingLibraryChangesCount =
    publishFleet?.summary.updateAvailableCount ?? 0;
  const hasPendingLibraryChanges =
    pendingLibraryChangesCount > 0;
  const deploymentBadge = deploymentAudit?.deployable
    ? hasPendingLibraryChanges
      ? {
          label: `${pendingLibraryChangesCount} Library ${pendingLibraryChangesCount === 1 ? "update" : "updates"} ready`,
          tone: "warning",
        }
      : { label: "Web Package ready", tone: "success" }
    : deploymentAudit?.status === "blocked"
      ? { label: "Needs attention", tone: "missing" }
      : deploymentAudit?.status === "empty"
        ? { label: "No web releases", tone: "preview" }
        : deploymentAudit
          ? { label: "Package index needs refresh", tone: "warning" }
          : { label: "Status not refreshed", tone: "preview" };

  const activeDeploymentProfileName =
    selectedDeploymentProfile ??
    deploymentTargetStatus?.profile.name ??
    "local-sandbox";
  const activeDeploymentProfileLabel =
    deploymentTargetStatus?.profile.name === activeDeploymentProfileName
      ? deploymentTargetStatus.profile.label
      : activeDeploymentProfileName === "production"
        ? "Production"
        : activeDeploymentProfileName === "custom"
          ? "Custom override"
          : "Local sandbox";

  const publishFleetByReleaseId = new Map<string, PublishFleetRelease>(
    publishFleet?.releases.map((release) => [release.releaseId, release]) ?? [],
  );

  const includedWebPackageRelease = (release: ReleaseScanResult): boolean => {
    const fleetRelease = publishFleetByReleaseId.get(release.id);
    return Boolean(
      fleetRelease && fleetRelease.publicationState !== "not-published",
    );
  };

  const workspaceReleases = mode === "production"
    ? sortedReleases.filter(includedWebPackageRelease)
    : sortedReleases.filter((release) => {
        if (webPackageFilter === "all") {
          return true;
        }

        const included = includedWebPackageRelease(release);
        return webPackageFilter === "included" ? included : !included;
      });

  const webPackageListHeading = webPackageFilter === "included"
    ? "Included in Web Package"
    : webPackageFilter === "not-included"
      ? "Not included in Web Package"
      : "All Library releases";

  const batchPreparationEligibleReleaseIds = new Set(
    workspaceReleases.flatMap((release) =>
      publishFleetByReleaseId.get(release.id)?.needsPreparation
        ? [release.id]
        : []
    ),
  );
  const showBatchPreparationControls =
    mode === "public-package" && batchPreparationEligibleReleaseIds.size > 0;

  const liveReleaseStatus = (releaseId: string): { label: string; tone: string } => {
    if (!deploymentTargetStatus?.configured) {
      return { label: "Live not connected", tone: "preview" };
    }

    if (!deploymentSyncPlan) {
      return { label: "Live not checked", tone: "preview" };
    }

    if (deploymentSyncPlan.status === "current") {
      return { label: "Up to date", tone: "success" };
    }

    const releasePrefix = `releases/${releaseId}/`;
    const releaseChanges = deploymentSyncPlan.changes.filter((change) =>
      change.path === `releases/${releaseId}` || change.path.startsWith(releasePrefix)
    );

    if (releaseChanges.some((change) => change.action === "update")) {
      return { label: "Update ready", tone: "warning" };
    }

    if (releaseChanges.some((change) => change.action === "add")) {
      return { label: "Not live yet", tone: "preview" };
    }

    if (releaseChanges.some((change) => change.action === "remove")) {
      return { label: "Removal ready", tone: "warning" };
    }

    return { label: "Up to date", tone: "success" };
  };

  const liveReleaseChangeCount = mode === "production" && deploymentSyncPlan
    ? workspaceReleases.filter((release) =>
        liveReleaseStatus(release.id).label !== "Up to date"
      ).length
    : null;

  const liveFullPackageUploadBytes =
    mode === "production" &&
    deploymentSyncPlan?.status === "changes" &&
    deploymentAudit &&
    deploymentSyncPlan.summary.updateCount === 0 &&
    deploymentSyncPlan.summary.removeCount === 0 &&
    deploymentSyncPlan.summary.addCount >= deploymentAudit.summary.fileCount &&
    deploymentSyncPlan.summary.addCount <= deploymentAudit.summary.fileCount + 1
      ? deploymentAudit.summary.totalBytes
      : deploymentSyncPlan?.status === "current"
        ? 0
        : null;

  const liveLeavingReleaseIds = mode === "production" &&
    deploymentSyncPlan?.status === "changes"
    ? Array.from(new Set(
        deploymentSyncPlan.changes.flatMap((change) => {
          if (change.action !== "remove") {
            return [];
          }

          const match = change.path.match(/^releases\/([^/]+)(?:\/|$)/);
          return match ? [match[1]] : [];
        }),
      )).filter((releaseId) =>
        !workspaceReleases.some((release) => release.id === releaseId)
      )
    : [];

  const liveLeavingReleases = liveLeavingReleaseIds.map((releaseId) => ({
    releaseId,
    release: releases.find((release) => release.id === releaseId),
  }));

  const webPackageMembershipStatus = (releaseId: string): { label: string; tone: string } => {
    const fleetRelease = publishFleetByReleaseId.get(releaseId);

    if (!fleetRelease || fleetRelease.publicationState === "not-published") {
      return { label: "Not included", tone: "preview" };
    }

    return { label: "Included", tone: "success" };
  };

  const webPackageReleaseStatus = (releaseId: string): { label: string; tone: string } => {
    const fleetRelease = publishFleetByReleaseId.get(releaseId);

    if (!fleetRelease) {
      return { label: "Not checked", tone: "preview" };
    }

    if (fleetRelease.planStatus === "blocked") {
      return { label: "Needs attention", tone: "missing" };
    }

    if (fleetRelease.needsPreparation) {
      return { label: "Needs preparation", tone: "warning" };
    }

    if (fleetRelease.publicationState === "up-to-date") {
      return { label: "Current", tone: "success" };
    }

    if (fleetRelease.publicationState === "update-available") {
      return { label: "Update ready", tone: "warning" };
    }

    return { label: "Ready to add", tone: "preview" };
  };

  return (
    <section className={`workflow-workspace publish-workspace ${
      mode === "production"
        ? "production-workspace"
        : "public-package-workspace"
    }`}>
      <header className="workflow-workspace-header publish-workspace-header">
        <div className="publish-workspace-header-copy">
          <p className="eyebrow">
            {mode === "production"
              ? "Step 5 · Live"
              : "Step 4 · Web Package"}
          </p>
          <h2>
            {mode === "production"
              ? "Web Package → Live"
              : "Choose releases for the Web Package"}
          </h2>
          <p>
            {mode === "production"
              ? "Compare the current Web Package with Hiplingo before deployment. Check Live is read-only and shows additions, updates, and removals without changing the server."
              : "Only releases marked Included are part of the exact Web Package that a future Live deployment will publish. Not included releases remain private in Library."}
          </p>
        </div>
        <div className="workflow-workspace-actions publish-workspace-actions">
          <div className="publish-workspace-action-row">
            {mode === "public-package" ? (
              <TechnicalAuditSummaryBadge
                audit={technicalAudit}
                presentation="web-package-header"
              />
            ) : (
              <span className="badge preview publish-read-only-status" role="status">
                Target comparison · read-only
              </span>
            )}
          </div>
        </div>
      </header>

      {error && (
        <p className="message error">{error}</p>
      )}
      {planError && (
        <p className="message error">{planError}</p>
      )}
      {publishOperationsError && (
        <p className="message error">
          {publishOperationsError}
        </p>
      )}

      {publishFleetError && (
        <p className="message error">
          {publishFleetError}
        </p>
      )}

      {deploymentSyncError && (
        <p className="message error">
          {deploymentSyncError}
        </p>
      )}

      {publishOperations &&
        publishOperations.interruptedCount > 0 && (
          <aside
            className="publish-interrupted-alert"
            role="alert"
          >
            <div>
              <strong>
                {publishOperations.interruptedCount} interrupted publish {publishOperations.interruptedCount === 1 ? "operation" : "operations"}
              </strong>
              <span>
                Previous server work stopped before a terminal operation record was written. Review recovery evidence below before publishing that release again.
              </span>
            </div>
          </aside>
        )}

      <section
        className="publish-deployment-overview"
        aria-label="Web Package deployment snapshot"
      >
        {mode === "production" && deploymentTargetStatus && (
          <section
            className="publish-live-target-strip"
            aria-labelledby="live-deployment-destination-heading"
          >
            <h3
              id="live-deployment-destination-heading"
              className="publish-live-target-strip__heading"
            >
              Deployment destination
            </h3>

            <div
              className="publish-deployment-profile-selector"
              aria-label="Published media deployment profiles"
            >
              {deploymentTargetStatus.profiles
                .filter((profile) => profile.name !== "custom" || profile.configured)
                .map((profile) => {
                  const isSelected =
                    selectedDeploymentProfile === profile.name;

                  return (
                    <button
                      key={profile.name}
                      type="button"
                      className={isSelected ? "active" : ""}
                      aria-pressed={isSelected}
                      disabled={deploymentTargetLoading || deploymentSyncPlanLoading}
                      onClick={() => void selectDeploymentProfile(profile.name)}
                      title={profile.description}
                    >
                      <span className="publish-deployment-profile-selector__copy">
                        <strong>{profile.label}</strong>
                        <span>
                          {profile.name === "local-sandbox"
                            ? "Browser deploy"
                            : profile.environment === "production"
                              ? "CLI deploy"
                              : profile.configured
                                ? "Configured"
                                : "Not configured"}
                        </span>
                      </span>

                      <span
                        className="publish-deployment-profile-selector__state"
                        aria-hidden="true"
                      >
                        {isSelected ? "Selected" : "Select"}
                      </span>
                    </button>
                  );
                })}
            </div>
          </section>
        )}

        <header className="publish-deployment-overview-header">
          <div>
            <span className="publish-deployment-kicker">
              {mode === "production" ? "Live" : "Web Package"}
            </span>
            <h3>{mode === "production" ? "Live status" : "Web Package status"}</h3>
            <p>
              {mode === "production"
                ? "Choose Local sandbox or Production, compare the current Web Package with that destination, then deploy only through the action allowed for that target."
                : "See which releases are prepared for the web and which still need attention."}
            </p>
          </div>
          <div className="publish-deployment-actions">
            <span
              className={`badge ${deploymentBadge.tone}`}
              role="status"
            >
              {deploymentBadge.label}
            </span>

            {(mode === "public-package" ||
              (mode === "production" && packageIndexNeedsRefresh)) && (
              <button
                type="button"
                className={
                  deploymentAudit?.deploymentManifest.current
                    ? undefined
                    : "primary-button"
                }
                disabled={
                  deploymentManifestLoading ||
                  publishFleetLoading ||
                  publishLoading ||
                  prepareLoading ||
                  batchPrepareLoading ||
                  !deploymentAudit ||
                  deploymentAudit.summary.blockedCount > 0 ||
                  deploymentAudit.deploymentManifest.current
                }
                onClick={() => void refreshDeploymentManifest()}
                title={
                  deploymentAudit?.deploymentManifest.current
                    ? "The local Web Package index matches the current sanitized package."
                    : "Create or refresh the local package index used for safe Live comparison. This changes only published-media and never deploys."
                }
              >
                {deploymentManifestLoading
                  ? "Refreshing package index…"
                  : deploymentAudit?.deploymentManifest.current
                    ? "Package index current"
                    : deploymentAudit?.deploymentManifest.exists
                      ? "Refresh package index"
                      : "Create package index"}
              </button>
            )}

            {mode === "production" && (
              <button
                type="button"
                className="primary"
                disabled={
                  deploymentTargetLoading ||
                  deploymentSyncPlanLoading ||
                  !deploymentTargetStatus?.configured ||
                  !deploymentAudit?.deploymentManifest.current
                }
                onClick={() => void loadDeploymentSyncPlan()}
                title={`Compare the current Web Package with ${activeDeploymentProfileLabel}. This is checksum-based and read-only.`}
              >
                {deploymentSyncPlanLoading
                  ? `Checking ${activeDeploymentProfileLabel}…`
                  : `Check ${activeDeploymentProfileLabel}`}
              </button>
            )}

            <button
              type="button"
              disabled={publishFleetLoading}
              onClick={() => void loadPublishFleet()}
            >
              {publishFleetLoading
                ? "Rechecking…"
                : mode === "production"
                  ? "Recheck Web Package"
                  : "Recheck status"}
            </button>
          </div>
        </header>

        {publishFleet ? (
          <>
            <div className="publish-fleet-summary-grid publish-fleet-summary-grid-compact">
              {mode === "production" ? (
                <>
                  <div>
                    <span>Web Package</span>
                    <strong>
                      {publishFleet.summary.publicCatalogCount} releases
                      {deploymentAudit
                        ? ` · ${formatByteSize(deploymentAudit.summary.totalBytes)}`
                        : ""}
                    </strong>
                  </div>
                  <div>
                    <span>Selected target</span>
                    <strong>
                      {!deploymentTargetStatus?.configured
                        ? `${activeDeploymentProfileLabel} · not connected`
                        : deploymentSyncPlan?.status === "current"
                          ? `${activeDeploymentProfileLabel} · up to date`
                          : deploymentSyncPlan?.status === "changes"
                            ? `${activeDeploymentProfileLabel} · changes to deploy`
                            : `${activeDeploymentProfileLabel} · check required`}
                    </strong>
                  </div>
                  <div>
                    <span>Changes</span>
                    <strong>
                      {liveReleaseChangeCount === null
                        ? "—"
                        : liveFullPackageUploadBytes !== null &&
                            liveFullPackageUploadBytes > 0
                          ? `${liveReleaseChangeCount} · ~${formatByteSize(liveFullPackageUploadBytes)} upload`
                          : liveReleaseChangeCount}
                    </strong>
                  </div>
                  <div>
                    <span>Leaving Live</span>
                    <strong>
                      {deploymentSyncPlan
                        ? liveLeavingReleases.length
                        : "—"}
                    </strong>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <span>Public releases</span>
                    <strong>{publishFleet.summary.publicCatalogCount}</strong>
                  </div>
                  <div>
                    <span>Private releases</span>
                    <strong>{publishFleet.summary.notPublishedCount}</strong>
                  </div>
                  <div>
                    <span>Updates ready</span>
                    <strong>{publishFleet.summary.updateAvailableCount}</strong>
                  </div>
                  <div>
                    <span>Needs preparation</span>
                    <strong>{publishFleet.summary.needsPreparationCount}</strong>
                  </div>
                </>
              )}
            </div>

            <section
              className={`publish-artist-web-package ${publishFleet.artists.status === "blocked" ? "blocked" : publishFleet.artists.state === "update-available" ? "warning" : "current"}`}
              aria-label="Artist Web Package"
            >
              <div className="publish-artist-web-package-copy">
                <span className="publish-deployment-kicker">
                  Artists · selection follows releases
                </span>
                <strong>
                  {publishFleet.artists.summary.artistCount} required Artists · {publishFleet.artists.summary.photoCount} photos
                </strong>
                <small>
                  {publishFleet.artists.summary.includedReleaseCount} Public release{publishFleet.artists.summary.includedReleaseCount === 1 ? "" : "s"} determine Artist inclusion automatically through release.primary_artist.id.{" "}
                  {publishFleet.artists.state === "up-to-date"
                    ? "The sanitized Artist snapshot is current."
                    : publishFleet.artists.state === "not-published"
                      ? "The required Artist snapshot has not been prepared yet."
                      : publishFleet.artists.state === "blocked"
                        ? publishFleet.artists.issues.find((issue) => issue.severity === "blocked")?.message ?? "Artist preparation is blocked."
                        : "Required Artist identities or photos have updates ready."}
                </small>
              </div>
              <div className="publish-artist-web-package-actions">
                <span
                  className={`badge ${
                    publishFleet.artists.state === "up-to-date"
                      ? "success"
                      : publishFleet.artists.state === "blocked"
                        ? "error"
                        : "warning"
                  }`}
                >
                  {publishFleet.artists.state === "up-to-date"
                    ? "Current"
                    : publishFleet.artists.state === "not-published"
                      ? "Preparation needed"
                      : publishFleet.artists.state === "blocked"
                        ? "Blocked"
                        : "Update ready"}
                </span>
                {mode === "public-package" && (
                  <button
                    type="button"
                    disabled={
                      artistPublicationLoading ||
                      publishFleet.artists.status === "blocked" ||
                      publishFleet.artists.state === "up-to-date" ||
                      publishLoading ||
                      prepareLoading ||
                      batchPrepareLoading
                    }
                    onClick={() => void publishArtistSnapshot()}
                    title="Prepare the complete sanitized Artist snapshot required by the current Included release set. Artist public membership is not selected independently here."
                  >
                    {artistPublicationLoading
                      ? "Preparing Artists…"
                      : publishFleet.artists.state === "not-published"
                        ? "Prepare Artist Snapshot"
                        : publishFleet.artists.state === "up-to-date"
                          ? "Artist snapshot current"
                          : "Prepare Artist Updates"}
                  </button>
                )}
              </div>
            </section>

            {mode === "public-package" && (
              <p className="publish-public-set-note">
                <strong>Visibility:</strong> releases are <strong>Private / Local by default</strong>. The slider is OFF until you consciously review and make a release Public. Public means included in the local Web Package and eligible for a future Live deployment; it does not mean the release has already been deployed. <strong>Media prep</strong> only creates private derivatives and never changes visibility. Artist inclusion follows the Public release set automatically.
              </p>
            )}

            {mode === "production" && (
              <p className="publish-live-set-note">
                <strong>Source:</strong> Live is compared against the same {publishFleet.summary.publicCatalogCount}-release Included set from <strong>Web Package</strong>. Releases outside that set are never sent Live; previously Live releases removed from it appear under <strong>Leaving Live</strong>.
              </p>
            )}

            {mode === "production" && liveLeavingReleases.length > 0 && (
              <aside
                className="publish-live-leaving-alert"
                aria-label="Releases leaving Live"
              >
                <div className="publish-live-leaving-heading">
                  <div>
                    <span className="publish-deployment-kicker">Leaving Live</span>
                    <strong>
                      {liveLeavingReleases.length} {liveLeavingReleases.length === 1 ? "release is" : "releases are"} no longer in the Included Web Package set
                    </strong>
                  </div>
                  <span className="badge warning">Review before deploy</span>
                </div>
                <p>
                  These releases still exist on the checked Live target but are absent from the current Web Package. A future deployment would remove them from Live. No removal has been performed by Check Live.
                </p>
                <div className="publish-live-leaving-list">
                  {liveLeavingReleases.map(({ releaseId, release }) => (
                    <div key={releaseId}>
                      <span>
                        <strong>
                          {release?.releaseTitle ?? formatReleaseTitle(releaseId)}
                        </strong>
                        {release?.primaryArtistName && (
                          <small>{release.primaryArtistName}</small>
                        )}
                        {release && libraryReleaseSortDate(release) && (
                          <small>{libraryReleaseSortDate(release)}</small>
                        )}
                        <code>{releaseId}</code>
                      </span>
                      <span className="badge warning">Leaving Live</span>
                    </div>
                  ))}
                </div>
              </aside>
            )}

            {mode === "public-package" && (
              <details className="publish-package-details">
                <summary>Package details</summary>
                <div className="publish-package-location-detail">
                  <span>Web Package root</span>
                  <code
                    title={
                      workflowLocations.find(
                        (location) => location.id === "public-package",
                      )?.displayPath ?? "Configured published-media root"
                    }
                  >
                    {workflowLocations.find(
                      (location) => location.id === "public-package",
                    )?.displayPath ?? "published-media"}
                  </code>
                </div>
                <div className="publish-deployment-integrity-line">
                  <strong>
                    {deploymentAudit?.summary.readyReleaseCount ?? 0}/
                    {deploymentAudit?.summary.releaseDirectoryCount ?? 0} web release packages verified
                  </strong>
                  <span>
                    {deploymentAudit
                      ? `${deploymentAudit.summary.fileCount} files · ${formatByteSize(deploymentAudit.summary.totalBytes)}`
                      : "Package details have not been refreshed"}
                  </span>
                  <span>
                    Package index: {deploymentAudit?.deploymentManifest.current
                      ? "current"
                      : deploymentAudit?.deploymentManifest.exists
                        ? "needs refresh"
                        : "not created"}
                  </span>
                </div>

                <div
                  className={`publish-library-freshness-gate ${hasPendingLibraryChanges ? "warning" : "current"}`}
                  role={hasPendingLibraryChanges ? "alert" : "status"}
                >
                  <div>
                    <span>Web Package</span>
                    <strong>{deploymentAudit?.deployable ? "Ready" : "Needs review"}</strong>
                  </div>
                  <div>
                    <span>Library updates</span>
                    <strong>{pendingLibraryChangesCount}</strong>
                  </div>
                  <p>
                    {hasPendingLibraryChanges
                      ? `${pendingLibraryChangesCount} prepared ${pendingLibraryChangesCount === 1 ? "release has" : "releases have"} newer Library changes. Update the Web Package before publishing those changes Live.`
                      : "Prepared releases match their current Library inputs."}
                  </p>
                </div>
              </details>
            )}

            {mode === "public-package" &&
              publishFleet.summary.publishedOnlyCount > 0 && (
              <aside
                className="publish-public-only-membership"
                aria-label="Included releases missing from the Library"
              >
                <div className="publish-public-only-membership-heading">
                  <div>
                    <span className="publish-deployment-kicker">Web Package inclusion</span>
                    <strong>
                      {publishFleet.summary.publishedOnlyCount} included {publishFleet.summary.publishedOnlyCount === 1 ? "release is" : "releases are"} missing from Library
                    </strong>
                  </div>
                  <span className="badge warning">Review membership</span>
                </div>
                <p>
                  These releases are still included in the Web Package but are not present in the current Library scan. Metadata Editor will never remove them automatically. Review each one and explicitly remove it from the Web Package if it should no longer be eligible for Live.
                </p>
                <div className="publish-public-only-membership-list">
                  {publishFleet.releases
                    .filter((release) => !release.libraryPresent)
                    .map((release) => (
                      <div key={release.releaseId}>
                        <span>
                          <strong>{release.releaseTitle ?? release.releaseId}</strong>
                          {release.primaryArtistName && (
                            <small>{release.primaryArtistName}</small>
                          )}
                          <code>{release.releaseId}</code>
                        </span>
                        <button
                          type="button"
                          className="danger-button"
                          disabled={
                            unpublishLoadingReleaseId !== null ||
                            publishLoading ||
                            prepareLoading ||
                            batchPrepareLoading
                          }
                          onClick={() =>
                            void unpublishRelease(
                              release.releaseId,
                              release.releaseTitle,
                            )
                          }
                        >
                          {unpublishLoadingReleaseId === release.releaseId
                            ? "Making private…"
                            : "Make Private"}
                        </button>
                      </div>
                    ))}
                </div>
              </aside>
            )}

            {mode === "production" && (
            <div className="publish-host-boundary">
              <div className="publish-host-boundary-heading">
                <div>
                  <span className="publish-deployment-kicker">Selected destination</span>
                  <strong>{deploymentTargetStatus?.profile.label ?? "Deployment target"}</strong>
                </div>
                <div className="publish-host-boundary-actions">
                  <span
                    className={`badge ${
                      !deploymentTargetStatus?.configured
                        ? "preview"
                        : deploymentSyncPlan?.status === "current"
                          ? "success"
                          : deploymentSyncPlan?.status === "changes"
                            ? "preview"
                            : "preview"
                    }`}
                  >
                    {!deploymentTargetStatus?.configured
                      ? "Not configured"
                      : deploymentSyncPlan?.status === "current"
                        ? `${activeDeploymentProfileLabel} is up to date`
                        : deploymentSyncPlan?.status === "changes"
                          ? "Changes to deploy"
                          : "Ready to check"}
                  </span>
                </div>
              </div>

              <details className="publish-live-connection-details">
                <summary>Connection & deployment details</summary>

              {deploymentTargetStatus?.profile && (
                <div className="publish-deployment-profile-context">
                  <span>{deploymentTargetStatus.profile.description}</span>
                  {deploymentTargetStatus.profile.name === "local-sandbox" && (
                    <code>~/Desktop/websites/_deploy/hiplingo.com/published-media</code>
                  )}
                  {deploymentTargetStatus.profile.name === "production" && (
                    <code>hiplingo-prod:/var/www/hiplingo.com/published-media</code>
                  )}
                </div>
              )}

              {deploymentTargetStatus?.configured && deploymentTargetStatus.target ? (
                <>
                  <div className="publish-host-boundary-target">
                    <span>{deploymentTargetStatus.target.kind === "ssh" ? "SSH target" : "Local target"}</span>
                    <code title={deploymentTargetStatus.target.display}>
                      {deploymentTargetStatus.target.display}
                    </code>
                  </div>

                  {deploymentSyncPlan && (
                    <div className="publish-host-sync-summary">
                      <strong>
                        {deploymentSyncPlan.status === "current"
                          ? `${activeDeploymentProfileLabel} matches the current Web Package · ${formatByteSize(deploymentAudit?.summary.totalBytes ?? 0)} package`
                          : liveFullPackageUploadBytes !== null &&
                              liveFullPackageUploadBytes > 0
                            ? `${deploymentSyncPlan.summary.changeCount} changes to deploy · ~${formatByteSize(liveFullPackageUploadBytes)} upload`
                            : `${deploymentSyncPlan.summary.changeCount} changes to deploy`}
                      </strong>
                      {deploymentSyncPlan.status === "changes" && (
                        <span>
                          +{deploymentSyncPlan.summary.addCount} add · {deploymentSyncPlan.summary.updateCount} update · −{deploymentSyncPlan.summary.removeCount} remove
                        </span>
                      )}
                      {deploymentSyncPlan.status === "changes" &&
                        liveFullPackageUploadBytes === null &&
                        deploymentAudit && (
                          <span>
                            Web Package size {formatByteSize(deploymentAudit.summary.totalBytes)} · incremental upload size depends on changed files
                          </span>
                        )}
                      <span>
                        Snapshot {deploymentSyncPlan.sourceContentFingerprint.slice(0, 12)}…
                      </span>
                    </div>
                  )}

                  {deploymentTargetStatus.profile.name === "local-sandbox" &&
                    deploymentTargetStatus.target.kind === "local" && (
                      <div className="publish-host-local-actions">
                        <div>
                          <strong>Local lifecycle</strong>
                          <span>Plan, deploy, compare, and roll back entirely on this workstation.</span>
                        </div>
                        <div className="publish-host-local-action-controls">
                          {deploymentSyncPlan?.status === "changes" &&
                            hasPendingLibraryChanges && (
                              <label className="publish-pending-library-deploy-override">
                                <input
                                  type="checkbox"
                                  checked={allowPendingLibraryDeployment}
                                  disabled={deploymentSandboxAction !== null}
                                  onChange={(event) =>
                                    setAllowPendingLibraryDeployment(event.target.checked)
                                  }
                                />
                                <span>
                                  Deploy the current Web Package snapshot anyway; {pendingLibraryChangesCount} Included {pendingLibraryChangesCount === 1 ? "release has" : "releases have"} newer Library changes.
                                </span>
                              </label>
                            )}
                          <div>
                          {deploymentSyncPlan?.status === "changes" && (
                            <button
                              type="button"
                              className="primary"
                              disabled={
                                deploymentSandboxAction !== null ||
                                (hasPendingLibraryChanges && !allowPendingLibraryDeployment)
                              }
                              onClick={() => void deployLocalSandbox()}
                              title="Deploy the reviewed plan only to the local Hiplingo deployment sandbox. Production and SSH writes are not exposed here."
                            >
                              {deploymentSandboxAction === "deploy"
                                ? "Deploying sandbox…"
                                : "Deploy to sandbox"}
                            </button>
                          )}
                          {deploymentTargetStatus.latestOperation?.state === "completed" &&
                            deploymentTargetStatus.latestOperation.previousContentFingerprint && (
                              <button
                                type="button"
                                disabled={deploymentSandboxAction !== null}
                                onClick={() => void rollbackLocalSandbox()}
                                title="Restore the previous verified local-sandbox deployment recorded by metadata-editor."
                              >
                                {deploymentSandboxAction === "rollback"
                                  ? "Rolling back…"
                                  : "Rollback sandbox"}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                  {deploymentTargetStatus.profile.name === "production" && (
                    <div className="publish-host-production-guard">
                      <strong>Production deployment is CLI-only</strong>
                      <span>
                        Check Production is read-only in this workspace. Review the checksum plan here, then use the guarded command below only when you intentionally want to update the public server.
                      </span>
                    </div>
                  )}

                  {deploymentSyncPlan?.status === "changes" && (
                    <details className="publish-host-sync-plan">
                      <summary>
                        Review changes · {deploymentSyncPlan.summary.changeCount}
                      </summary>
                      <div className="publish-host-sync-command">
                        <span>Guarded deploy command</span>
                        <code>
                          {deploymentTargetStatus?.deployCommand.replace(
                            "<reviewed-fingerprint>",
                            deploymentSyncPlan.planFingerprint,
                          )}
                        </code>
                        {hasPendingLibraryChanges && (
                          <small>
                            CLI deployment is also blocked by default while Included releases have pending Library changes. Add <code>--allow-pending-library-changes</code> only when intentionally deploying this older Web Package snapshot.
                          </small>
                        )}
                      </div>
                      <ol>
                        {deploymentSyncPlan.changes.slice(0, 40).map((change, index) => (
                          <li key={`${change.action}-${change.path}-${index}`}>
                            <span className={`badge ${change.action === "remove" ? "warning" : "preview"}`}>
                              {change.action}
                            </span>
                            <code>{change.path}</code>
                          </li>
                        ))}
                      </ol>
                      {deploymentSyncPlan.changes.length > 40 && (
                        <p>
                          {deploymentSyncPlan.changes.length - 40} additional changes are available from npm run plan:published-media-deploy.
                        </p>
                      )}
                    </details>
                  )}

                  {deploymentTargetStatus.latestOperation && (
                    <div className="publish-host-last-operation">
                      <span>Last deployment</span>
                      <strong>{deploymentTargetStatus.latestOperation.state}</strong>
                      <code>{deploymentTargetStatus.latestOperation.operationId}</code>
                      {deploymentTargetStatus.latestOperation.previousContentFingerprint &&
                        deploymentTargetStatus.latestOperation.state === "completed" && (
                          <span>Rollback backup recorded</span>
                        )}
                    </div>
                  )}
                </>
              ) : (
                <div className="publish-host-boundary-unconfigured">
                  {deploymentTargetStatus?.profile.name === "production" ? (
                    <>
                      <span>The built-in Production boundary uses only the local hiplingo-prod SSH alias. If this appears unconfigured, restart metadata-editor after updating to the current production profile.</span>
                      <code>hiplingo-prod:/var/www/hiplingo.com/published-media</code>
                    </>
                  ) : (
                    <>
                      <span>Configure an explicit deployment boundary before comparison or deployment.</span>
                      <code>PUBLISHED_MEDIA_DEPLOY_TARGET=local:/absolute/public/media/path</code>
                    </>
                  )}
                </div>
              )}

              {deploymentTargetStatus?.architecture && (
                <details className="publish-host-architecture">
                  <summary>Hiplingo host boundary</summary>
                  <div>
                    <span>Frontend</span>
                    <code>{deploymentTargetStatus.architecture.frontendServerRoot}</code>
                  </div>
                  <div>
                    <span>Persistent public media</span>
                    <code>{deploymentTargetStatus.architecture.publicMediaServerRoot}</code>
                  </div>
                  <div>
                    <span>Public URL</span>
                    <code>{deploymentTargetStatus.architecture.publicMediaUrlPrefix}</code>
                  </div>
                  <p>Frontend releases and published media are independent deployment lifecycles. Frontend rollback must not roll back or erase published media.</p>
                </details>
              )}
              </details>
            </div>
            )}

            {deploymentAudit && deploymentAudit.issues.length > 0 && (
              <details className="publish-deployment-issues">
                <summary>
                  Package checks · {deploymentAudit.summary.blockedCount} blockers · {deploymentAudit.summary.warningCount} warnings
                </summary>
                <ol>
                  {deploymentAudit.issues.map((issue, index) => (
                    <li key={`${issue.code}-${issue.relativePath}-${index}`}>
                      <span className={`badge ${issue.severity === "blocked" ? "missing" : "warning"}`}>
                        {issue.severity === "blocked" ? "Blocked" : "Warning"}
                      </span>
                      <code>{issue.relativePath}</code>
                      <span>{issue.message}</span>
                    </li>
                  ))}
                </ol>
              </details>
            )}
          </>
        ) : (
          <p className="publish-deployment-loading">
            {publishFleetLoading
              ? "Refreshing Web Package status…"
              : "Web Package status has not been refreshed yet."}
          </p>
        )}
      </section>

      <section className="workflow-table-panel">
        <header className="publish-release-list-header">
          <h3>{mode === "public-package" ? webPackageListHeading : "Included Web Package → Live"}</h3>
          <div className="workflow-release-table-controls">
            {mode === "public-package" && (
              <div
                className="publish-public-set-filter"
                role="group"
                aria-label="Web Package release membership"
              >
                <button
                  type="button"
                  className={webPackageFilter === "included" ? "active" : ""}
                  aria-pressed={webPackageFilter === "included"}
                  onClick={() => setWebPackageFilter("included")}
                >
                  Public ({publishFleet?.summary.publicCatalogCount ?? 0})
                </button>
                <button
                  type="button"
                  className={webPackageFilter === "not-included" ? "active" : ""}
                  aria-pressed={webPackageFilter === "not-included"}
                  onClick={() => setWebPackageFilter("not-included")}
                >
                  Private ({publishFleet?.summary.notPublishedCount ?? 0})
                </button>
                <button
                  type="button"
                  className={webPackageFilter === "all" ? "active" : ""}
                  aria-pressed={webPackageFilter === "all"}
                  onClick={() => setWebPackageFilter("all")}
                >
                  All Library ({releases.length})
                </button>
              </div>
            )}
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
            {showBatchPreparationControls && selectedBatchReleaseIds.size > 0 && (
              <button
                type="button"
                className="publish-batch-prepare-button"
                disabled={
                  batchPrepareLoading ||
                  prepareLoading ||
                  publishLoading
                }
                onClick={() => void prepareSelectedReleases()}
                title="Prepare missing or stale private MP3, HLS, waveform, and browser-artwork derivatives for the selected releases in a sequential queue. Web Package preparation remains per release."
              >
                {batchPrepareLoading
                  ? "Preparing selected…"
                  : `Prepare selected (${selectedBatchReleaseIds.size})`}
              </button>
            )}
            <strong>{mode === "production" ? `${workspaceReleases.length} included releases` : `${workspaceReleases.length} releases`}</strong>
          </div>
        </header>

        <div className="workflow-table-scroll">
          <table className="workflow-workspace-table publish-readiness-table">
            <thead>
              {mode === "production" ? (
                <tr>
                  <th scope="col">Release</th>
                  <th scope="col">Included Web Package</th>
                  <th scope="col">Live</th>
                </tr>
              ) : (
                <tr>
                  {showBatchPreparationControls && (
                    <th
                      scope="col"
                      className="publish-batch-select-column"
                      title="Select releases that need private derivative preparation"
                    >
                      Media prep
                    </th>
                  )}
                  <th scope="col" className="publish-release-column">Release</th>
                  <th scope="col" className="publish-membership-column">Public set</th>
                  <th scope="col" className="publish-package-status-column">Package status</th>
                </tr>
              )}
            </thead>
            <tbody>
              {workspaceReleases.length === 0 ? (
                <tr>
                  <td
                    colSpan={
                      mode === "production"
                        ? 3
                        : showBatchPreparationControls
                          ? 4
                          : 3
                    }
                    className="workflow-empty-cell"
                  >
                    {mode === "production"
                      ? "No Web Package releases are available to compare with Live."
                      : webPackageFilter === "included"
                        ? "No releases are currently included in the Web Package."
                        : webPackageFilter === "not-included"
                          ? "Every Library release is currently included in the Web Package."
                          : "No Library releases are available to prepare for the web."}
                  </td>
                </tr>
              ) : (
                workspaceReleases.map((release) => {
                  const assessment = assessPublishReadiness(release);
                  const loadingPlan = planLoadingReleaseId === release.id;
                  const selected = selectedPlan?.releaseId === release.id;
                  const releaseArtwork =
                    selectReleaseFrontArtwork(release.artworkMasters) ??
                    selectPreferredReleaseArtwork(release.artworkMasters);
                  const latestOperation = latestPublishOperationForRelease(
                    publishOperations,
                    release.id,
                  );
                  const operationBadge = publishOperationBadge(latestOperation);
                  const batchSelected = selectedBatchReleaseIds.has(release.id);
                  const batchPreparationEligible =
                    batchPreparationEligibleReleaseIds.has(release.id);
                  const webPackageMembership = webPackageMembershipStatus(release.id);
                  const webPackageStatus = webPackageReleaseStatus(release.id);
                  const liveStatus = liveReleaseStatus(release.id);

                  return (
                    <tr
                      key={release.id}
                      className={[
                        "publish-release-row",
                        selected && mode === "public-package" ? "selected" : "",
                        loadingPlan && mode === "public-package" ? "is-loading" : "",
                        mode === "production"
                          ? "is-public-included"
                          : webPackageMembership.label === "Included"
                            ? "is-public-included"
                            : "is-public-excluded",
                      ].filter(Boolean).join(" ")}
                      aria-busy={mode === "public-package" && loadingPlan || undefined}
                      aria-label={
                        mode === "public-package"
                          ? `${release.releaseTitle ?? formatReleaseTitle(release.id)} · ${
                              webPackageMembership.label === "Included"
                                ? "Public"
                                : "Private / Local"
                            }`
                          : `${release.releaseTitle ?? formatReleaseTitle(release.id)} · Included in Web Package · ${liveStatus.label}`
                      }
                    >
                      {showBatchPreparationControls && (
                        <td className="publish-batch-select-cell">
                          {batchPreparationEligible ? (
                            <input
                              type="checkbox"
                              checked={batchSelected}
                              aria-label={`Select ${release.releaseTitle ?? formatReleaseTitle(release.id)} for media preparation only`}
                              title="Media preparation only — this does not change whether the release is Public or Private."
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) => {
                                const checked = event.target.checked;
                                setSelectedBatchReleaseIds((current) => {
                                  const next = new Set(current);
                                  if (checked) {
                                    next.add(release.id);
                                  } else {
                                    next.delete(release.id);
                                  }
                                  return next;
                                });
                              }}
                            />
                          ) : (
                            <span
                              className="publish-batch-not-needed"
                              aria-label="No preparation needed"
                            >
                              —
                            </span>
                          )}
                        </td>
                      )}
                      <th scope="row">
                        <div className="publish-release-cell">
                          <span
                            className="publish-release-thumbnail"
                            aria-hidden="true"
                          >
                            {releaseArtwork ? (
                              <img
                                src={artworkPreviewUrl(releaseArtwork.relativePath)}
                                alt=""
                                loading="lazy"
                              />
                            ) : (
                              <span className="publish-release-thumbnail-placeholder">
                                No art
                              </span>
                            )}
                          </span>
                          <span className="publish-release-identity">
                            <strong>
                              {release.releaseTitle ?? formatReleaseTitle(release.id)}
                            </strong>
                            {release.primaryArtistName && (
                              <span>{release.primaryArtistName}</span>
                            )}
                            {libraryReleaseSortDate(release) && (
                              <small className="publish-release-date">
                                {libraryReleaseSortDate(release)}
                              </small>
                            )}
                          </span>
                        </div>
                      </th>

                      {mode === "public-package" ? (
                        <>
                          <td className="publish-status-cell publish-membership-cell">
                            <button
                              type="button"
                              role="switch"
                              aria-checked={webPackageMembership.label === "Included"}
                              className={`publish-visibility-switch ${
                                webPackageMembership.label === "Included"
                                  ? "is-public"
                                  : "is-private"
                              }`}
                              disabled={loadingPlan}
                              aria-label={`${
                                webPackageMembership.label === "Included"
                                  ? "Public"
                                  : "Private / Local"
                              } visibility for ${
                                release.releaseTitle ?? formatReleaseTitle(release.id)
                              }. Activate to review the visibility change.`}
                              title={
                                webPackageMembership.label === "Included"
                                  ? "Public now. Review before making this release Private / Local."
                                  : "Private / Local now. Review before making this release Public."
                              }
                              onClick={(event) => {
                                event.stopPropagation();
                                if (!loadingPlan) {
                                  openPublishPlan(
                                    release.id,
                                    webPackageMembership.label === "Included"
                                      ? "make-private"
                                      : "make-public",
                                  );
                                }
                              }}
                            >
                              <span
                                className="publish-visibility-switch-track"
                                aria-hidden="true"
                              >
                                <span className="publish-visibility-switch-thumb" />
                              </span>
                              <strong>
                                {webPackageMembership.label === "Included"
                                  ? "Public"
                                  : "Private / Local"}
                              </strong>
                            </button>
                            <small>
                              {webPackageMembership.label === "Included"
                                ? "Selected for a future Live deployment"
                                : "Library only · not in the public Web Package"}
                            </small>
                          </td>
                          <td className="publish-status-cell publish-ready-check-cell">
                            {operationBadge ? (
                              <span className={`badge ${operationBadge.tone}`}>
                                {operationBadge.label}
                              </span>
                            ) : (
                              <span
                                className={`badge ${webPackageStatus.tone}`}
                                title={assessment.note}
                              >
                                {webPackageStatus.label}
                              </span>
                            )}
                            {loadingPlan ? (
                              <small className="publish-row-loading" role="status">
                                Checking…
                              </small>
                            ) : (
                              <button
                                type="button"
                                className="publish-ready-check-link"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openPublishPlan(release.id, "package");
                                }}
                              >
                                Review package
                              </button>
                            )}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="publish-status-cell publish-live-package-cell">
                            <span className="badge success">Included</span>
                            <small>{webPackageStatus.label}</small>
                          </td>
                          <td className="publish-status-cell live-status-cell">
                            <span className={`badge ${liveStatus.tone}`}>
                              {liveStatus.label}
                            </span>
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <details
        className="publish-operation-history"
      >
        <summary>
          <span>Web Package history</span>
          <span>
            {publishOperationsLoading
              ? "Loading…"
              : `${publishOperations?.operations.length ?? 0} recent`}
          </span>
        </summary>
        <div className="publish-operation-history-content">
          {publishOperations?.operations.length ? (
            <table>
              <thead>
                <tr>
                  <th scope="col">Release</th>
                  <th scope="col">Action</th>
                  <th scope="col">State</th>
                  <th scope="col">Phase</th>
                  <th scope="col">Started</th>
                  <th scope="col">Recovery</th>
                </tr>
              </thead>
              <tbody>
                {publishOperations.operations.map((operation) => (
                  <tr key={operation.operationId}>
                    <th scope="row">
                      <strong>
                        {releases.find((release) =>
                          release.id === operation.releaseId
                        )?.releaseTitle ?? operation.releaseId}
                      </strong>
                      <code title={operation.operationId}>
                        {operation.operationId}
                      </code>
                    </th>
                    <td>
                      {operation.mode === "unpublish"
                        ? "Remove from Web Package"
                        : operation.mode === "update"
                          ? "Rebuild"
                          : "Build"}
                    </td>
                    <td>
                      <span className={`badge ${
                        operation.state === "completed"
                          ? "success"
                          : operation.state === "running"
                            ? "preview"
                            : operation.state === "recovered"
                              ? "warning"
                              : "missing"
                      }`}>
                        {operation.state}
                      </span>
                    </td>
                    <td>{operation.phase.replaceAll("-", " ")}</td>
                    <td>
                      {operation.startedAt
                        ? new Date(operation.startedAt).toLocaleString()
                        : "Unknown"}
                    </td>
                    <td>
                      {operation.state === "interrupted" ? (
                        <div className="publish-operation-recovery-cell">
                          <small>
                            {operation.recoveryReason ?? "Recovery evidence is being evaluated."}
                          </small>
                          {(operation.recoveryAction === "finalize-current" ||
                            operation.recoveryAction === "rollback-safe") && (
                            <button
                              type="button"
                              disabled={
                                recoveringOperationId === operation.operationId ||
                                publishLoading ||
                                prepareLoading ||
                                batchPrepareLoading
                              }
                              onClick={() => void recoverOperation(operation)}
                            >
                              {recoveringOperationId === operation.operationId
                                ? "Recovering…"
                                : operation.recoveryAction === "finalize-current"
                                  ? "Verify & finalize"
                                  : "Guarded rollback"}
                            </button>
                          )}
                        </div>
                      ) : operation.recoveryReason ? (
                        <small>{operation.recoveryReason}</small>
                      ) : operation.error ? (
                        <small>{operation.error}</small>
                      ) : (
                        <span>—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p>
              {publishOperationsLoading
                ? "Loading publish operations…"
                : "No Web Package operations have been recorded yet."}
            </p>
          )}
        </div>
      </details>

      {selectedPlan && mode === "public-package" && (
        <MetadataFieldModal
          title={`${
            selectedPlanIntent === "make-public"
              ? "Review before making public"
              : selectedPlanIntent === "make-private"
                ? "Review before making private"
                : "Web Package Ready Check"
          } · ${
            releases.find(
              (release) =>
                release.id === selectedPlan.releaseId,
            )?.releaseTitle ?? selectedPlan.releaseId
          }`}
          variant="wide"
          closeDisabled={
            prepareLoading ||
            publishLoading ||
            publicationSelectionSaving ||
            unpublishLoadingReleaseId !== null
          }
          onClose={() => {
            setSelectedPlan(null);
            setSelectedPlanIntent("package");
            setPlanError(null);
          }}
        >
          <section
            className="publish-plan-panel publish-plan-modal"
            aria-label="Web Package Ready Check result"
          >
          <header>
            <div>
              <p className="eyebrow">Ready Check result</p>
              <h3>
                {releases.find((release) =>
                  release.id === selectedPlan.releaseId
                )?.releaseTitle ?? selectedPlan.releaseId}
              </h3>
              <p>
                {publishPreflightGuidance(selectedPlan)}
              </p>
            </div>
            {(() => {
              const operationBadge = publishOperationBadge(
                latestPublishOperationForRelease(
                  publishOperations,
                  selectedPlan.releaseId,
                ),
              );
              const status = operationBadge ??
                publishPreflightStatus(selectedPlan);

              return (
                <span className={`badge ${status.tone}`}>
                  {status.label}
                </span>
              );
            })()}
          </header>

          {selectedPlanIntent !== "make-private" && (() => {
            const release = releases.find(
              (candidate) => candidate.id === selectedPlan.releaseId,
            );
            const included = new Set(
              selectedPlan.publicSelection.includedTrackIds,
            );
            const tracks = release?.tracks ?? [];
            const videos = release?.videos ?? [];
            const multiDisc = tracks.some(
              (track) => (track.discNumber ?? 1) > 1,
            );

            return (
              <section
                className="publish-public-media-selection"
                aria-label="Public media selection"
              >
                <header>
                  <div>
                    <span className="eyebrow">Public media selection</span>
                    <strong>Choose what enters the Web Package</strong>
                    <small>
                      Private Library tracks and video assets stay untouched.
                      Removing a public item makes the next Web Package rebuild
                      remove its previously published derivatives.
                    </small>
                  </div>
                  {publicationSelectionSaving && (
                    <span className="badge warning">Saving…</span>
                  )}
                </header>

                <div className="publish-public-media-controls">
                  <fieldset disabled={publicationSelectionSaving}>
                    <legend>Tracks</legend>
                    <small>
                      {selectedPlan.publicSelection.includedTrackIds.length}
                      {" of "}{tracks.length} public
                    </small>
                    <div className="publish-public-track-list">
                      {tracks.map((track) => {
                        const checked = included.has(track.id);
                        const wouldRemoveLast =
                          checked && included.size === 1;

                        return (
                          <label key={track.id}>
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={wouldRemoveLast}
                              onChange={(event) => {
                                const next = new Set(included);
                                if (event.target.checked) {
                                  next.add(track.id);
                                } else {
                                  next.delete(track.id);
                                }
                                void savePublicationSelection(
                                  selectedPlan,
                                  selectedPlan.publicSelection.includeVideo,
                                  tracks
                                    .filter((candidate) => next.has(candidate.id))
                                    .map((candidate) => candidate.id),
                                );
                              }}
                            />
                            <span title={track.id}>
                              {publicTrackSelectionLabel(track, multiDisc)}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>

                  <fieldset disabled={publicationSelectionSaving}>
                    <legend>Video</legend>
                    <label className="publish-public-video-toggle">
                      <input
                        type="checkbox"
                        checked={selectedPlan.publicSelection.includeVideo}
                        onChange={(event) =>
                          void savePublicationSelection(
                            selectedPlan,
                            event.target.checked,
                            selectedPlan.publicSelection.includedTrackIds,
                          )
                        }
                      />
                      <span>Include video assets in Web Package</span>
                    </label>
                    <small>
                      Default OFF for v1.0.0. {videos.length} canonical video
                      {videos.length === 1 ? " asset" : " assets"} remain private
                      unless enabled here.
                    </small>
                  </fieldset>
                </div>
              </section>
            );
          })()}

          {selectedPlanIntent === "make-private" ? (
            <section
              className="publish-preflight-primary publish-visibility-review"
              aria-label="Review before making private"
            >
              <div className="publish-preflight-result-copy">
                <span className="eyebrow">Visibility change</span>
                <strong>Public → Private / Local</strong>
                <small>
                  The canonical Library release, masters, metadata, and private
                  derivatives stay untouched. Only the sanitized Web Package
                  copy and public catalog membership are removed.
                </small>
              </div>
              <div className="publish-preflight-next-step">
                <span className="eyebrow">Next step</span>
                <button
                  type="button"
                  className="danger-button"
                  disabled={
                    prepareLoading ||
                    publishLoading ||
                    unpublishLoadingReleaseId !== null ||
                    Boolean(
                      unresolvedPublishOperationForRelease(
                        publishOperations,
                        selectedPlan.releaseId,
                      ),
                    )
                  }
                  onClick={() =>
                    void unpublishRelease(
                      selectedPlan.releaseId,
                      releases.find(
                        (release) =>
                          release.id === selectedPlan.releaseId,
                      )?.releaseTitle,
                      false,
                    )
                  }
                >
                  {unpublishLoadingReleaseId === selectedPlan.releaseId
                    ? "Making private…"
                    : "Make Private"}
                </button>
                <small>
                  This does not deploy anything. A later Live deployment will
                  carry the resulting public removal to the website.
                </small>
              </div>
            </section>
          ) : (
            <section className="publish-preflight-primary" aria-label="Web Package next step">
            <div className="publish-preflight-result-copy">
              <span className="eyebrow">Result</span>
              <strong>{publishPreflightHeadline(selectedPlan)}</strong>
              <span>
                {selectedPlan.issues.filter((issue) =>
                  issue.severity === "blocked"
                ).length} blocked · {selectedPlan.issues.filter((issue) =>
                  issue.severity === "warning"
                ).length} warnings
                {" · "}
                {selectedPlan.derivatives.createCount} missing derivatives · {selectedPlan.derivatives.replaceCount} stale
                {browserArtworkNeedsPreparation(selectedPlan)
                  ? " · browser artwork needs preparation"
                  : ""}
              </span>
            </div>

            <div className="publish-preflight-next-step">
              <span className="eyebrow">Next step</span>
              {prepareLoading && (
                <div
                  className="publish-preparation-progress"
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  <strong>
                    {prepareProgress?.message ??
                      "Starting media preparation…"}
                  </strong>
                  <progress
                    max={Math.max(
                      prepareProgress?.totalUnits ?? 1,
                      1,
                    )}
                    value={Math.min(
                      prepareProgress?.completedUnits ?? 0,
                      Math.max(
                        prepareProgress?.totalUnits ?? 1,
                        1,
                      ),
                    )}
                  />
                  <small>
                    {prepareProgress?.videoIndex &&
                    (prepareProgress.videoCount ?? 0) > 0
                      ? `Video ${prepareProgress.videoIndex} of ${prepareProgress.videoCount}`
                      : prepareProgress?.trackIndex &&
                          prepareProgress.trackCount > 0
                        ? `Track ${prepareProgress.trackIndex} of ${prepareProgress.trackCount}`
                        : prepareProgress?.totalUnits
                          ? `${prepareProgress.completedUnits} of ${prepareProgress.totalUnits} preparation steps complete`
                          : "Building the reviewed preparation plan…"}
                  </small>
                </div>
              )}
              {publicPackageIsUpToDate(selectedPlan) ? (
                <div className="publish-package-current" role="status">
                  <span className="badge success">✓ Web Package · current</span>
                  <strong>Web Package matches the current Library inputs</strong>
                  <small>
                    {selectedPlan.publication.publishedAt
                      ? `Web Package ${new Date(selectedPlan.publication.publishedAt).toLocaleString()}. `
                      : ""}
                    Current canonical metadata and web-facing media inputs match the Web Package snapshot.
                  </small>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    className={(prepareLoading || publishLoading)
                      ? "primary-button is-loading"
                      : "primary-button"}
                    disabled={
                      prepareLoading ||
                      publishLoading ||
                      publicationSelectionSaving ||
                      (!canPreparePublishPlan(selectedPlan) &&
                        !canPrepareVideoPublishPlan(selectedPlan) &&
                        (
                          !canBuildPublishPlan(selectedPlan) ||
                          Boolean(
                            unresolvedPublishOperationForRelease(
                              publishOperations,
                              selectedPlan.releaseId,
                            ),
                          )
                        ))
                    }
                    onClick={() =>
                      canPreparePublishPlan(selectedPlan)
                        ? void prepareRelease(selectedPlan)
                        : canPrepareVideoPublishPlan(selectedPlan)
                          ? void prepareVideoRelease(selectedPlan)
                          : unresolvedPublishOperationForRelease(
                              publishOperations,
                              selectedPlan.releaseId,
                            )
                          ? undefined
                          : void publishRelease(selectedPlan)
                    }
                    title={
                      canPreparePublishPlan(selectedPlan)
                        ? "Generate reviewed private playback MP3s, segmented AAC-LC audio HLS streams, waveform derivatives, and browser-compatible release artwork in the private Library."
                        : canPrepareVideoPublishPlan(selectedPlan)
                          ? "Generate reviewed private H.264/AAC segmented video HLS streams from canonical video masters. Canonical video files are never modified."
                          : unresolvedPublishOperationForRelease(
                              publishOperations,
                              selectedPlan.releaseId,
                            )
                          ? "Recover or review the interrupted package operation in Operation history before building again."
                          : canBuildPublishPlan(selectedPlan)
                            ? "Build a complete sanitized Web Package release snapshot, validate it, and atomically promote it into published-media."
                            : "Resolve the blocking Ready Check issues first."
                    }
                  >
                    {prepareLoading
                      ? "Preparing…"
                      : publishLoading
                        ? "Building…"
                        : unresolvedPublishOperationForRelease(
                              publishOperations,
                              selectedPlan.releaseId,
                            ) &&
                            !canPreparePublishPlan(selectedPlan) &&
                            !canPrepareVideoPublishPlan(selectedPlan)
                          ? "Recover interrupted package build"
                          : publishNextStepLabel(selectedPlan)}
                  </button>
                  <small>
                    {canPreparePublishPlan(selectedPlan)
                      ? "Creates reproducible private playback MP3, audio HLS stream, waveform, and browser-artwork derivatives. Canonical masters are never modified, and private MP3s are never copied into published-media."
                      : canPrepareVideoPublishPlan(selectedPlan)
                        ? "Creates reproducible private H.264/AAC video HLS streams from canonical video masters. Only the segmented browser-ready stream and sanitized video metadata enter published-media."
                        : unresolvedPublishOperationForRelease(
                            publishOperations,
                            selectedPlan.releaseId,
                          )
                        ? "Web Package updates are paused until the interrupted operation is verified and finalized or safely rolled back from Web Package history."
                        : canBuildPublishPlan(selectedPlan)
                          ? "Builds the complete Web Package snapshot from current Library metadata, browser artwork, waveform peaks, and HLS assets. Existing Included releases are replaced as a unit so obsolete files cannot survive an update."
                          : "Resolve the blocking issues shown in Ready Check before preparing derivatives or publishing."}
                  </small>
                </>
              )}
            </div>
            </section>
          )}

          {selectedPlan.destinationReleaseExists &&
            selectedPlanIntent !== "make-private" && (
            <section
              className="publish-public-membership-action"
              aria-label="Web Package inclusion action"
            >
              <div>
                <span className="eyebrow">Web Package inclusion</span>
                <strong>Included in Web Package</strong>
                <small>
                  This release is part of the exact set eligible for a future Live deployment. Making it Private / Local affects only the sanitized Web Package; the canonical Library release, masters, metadata, and private derivatives remain unchanged.
                </small>
              </div>
              <button
                type="button"
                className="danger-button"
                disabled={
                  prepareLoading ||
                  publishLoading ||
                  unpublishLoadingReleaseId !== null ||
                  Boolean(
                    unresolvedPublishOperationForRelease(
                      publishOperations,
                      selectedPlan.releaseId,
                    ),
                  )
                }
                onClick={() =>
                  void unpublishRelease(
                    selectedPlan.releaseId,
                    releases.find(
                      (release) =>
                        release.id === selectedPlan.releaseId,
                    )?.releaseTitle,
                  )
                }
                title="Review the current public package, then make this release Private / Local. Library content is never deleted."
              >
                {unpublishLoadingReleaseId === selectedPlan.releaseId
                  ? "Making private…"
                  : "Make Private"}
              </button>
            </section>
          )}

          <dl className="publish-plan-summary">
            <div>
              <dt>Validation</dt>
              <dd>
                {selectedPlan.validation.blockedCount === 0
                  ? "No blockers"
                  : `${selectedPlan.validation.blockedCount} blocked`}
              </dd>
            </div>
            <div>
              <dt>Library MP3</dt>
              <dd>
                {selectedPlan.libraryPlayback.currentCount} current · {selectedPlan.libraryPlayback.createCount} missing · {selectedPlan.libraryPlayback.replaceCount} stale
              </dd>
              {!canPreparePublishPlan(selectedPlan) &&
                canPrepareLibraryPlayback(selectedPlan) && (
                  <button
                    type="button"
                    disabled={prepareLoading || publishLoading}
                    onClick={() =>
                      void prepareRelease(selectedPlan, "playback")
                    }
                    title="Generate or refresh private 320 kbps playback MP3s in media-library. These files are never copied into published-media."
                  >
                    Prepare Library MP3s
                  </button>
                )}
            </div>
            <div>
              <dt>Web stream</dt>
              <dd>
                {selectedPlan.webStreams.currentCount} current · {selectedPlan.webStreams.createCount} missing · {selectedPlan.webStreams.replaceCount} stale
              </dd>
            </div>
            <div>
              <dt>Waveform</dt>
              <dd>
                {selectedPlan.waveforms.currentCount} current · {selectedPlan.waveforms.createCount} missing · {selectedPlan.waveforms.replaceCount} stale
              </dd>
            </div>
            <div>
              <dt>Video stream</dt>
              <dd>
                {selectedPlan.videoStreams.currentCount} current · {selectedPlan.videoStreams.createCount} missing · {selectedPlan.videoStreams.replaceCount} stale
              </dd>
            </div>
            <div>
              <dt>Browser artwork</dt>
              <dd>
                {browserArtworkNeedsPreparation(selectedPlan)
                  ? "Needs preparation"
                  : browserArtworkIsBlocked(selectedPlan)
                    ? "Blocked"
                    : "Current"}
              </dd>
            </div>
            <div>
              <dt>Latest operation</dt>
              <dd>
                {(() => {
                  const operation = latestPublishOperationForRelease(
                    publishOperations,
                    selectedPlan.releaseId,
                  );
                  return operation
                    ? `${operation.state} · ${operation.phase.replaceAll("-", " ")}`
                    : "No recorded Web Package operation";
                })()}
              </dd>
            </div>
            <div>
              <dt>Web Package</dt>
              <dd>
                {selectedPlan.publication.state === "up-to-date"
                  ? "Up to date"
                  : selectedPlan.publication.state === "update-available"
                    ? "Included · update available"
                    : "Not included"}
              </dd>
            </div>
            <div>
              <dt>Destination</dt>
              <dd><code>{selectedPlan.destinationReleaseRelativePath}</code></dd>
            </div>
          </dl>

          <TechnicalReleaseInspector
            summary={technicalByRelease.get(selectedPlan.releaseId)}
            audit={technicalAudit}
            compact
          />

          {selectedPlan.issues.length > 0 && (
            <details className="publish-plan-disclosure publish-plan-issues">
              <summary>
                <span>Problems and warnings</span>
                <span className="badge warning">
                  {selectedPlan.issues.length}
                </span>
              </summary>
              <div className="publish-plan-disclosure-content">
                <table>
                  <thead>
                    <tr>
                      <th scope="col" className="publish-issue-number-column">#</th>
                      <th scope="col">Status</th>
                      <th scope="col">Path</th>
                      <th scope="col">Issue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedPlan.issues.map((item, index) => (
                      <tr key={`${item.code}-${item.relativePath}-${index}`}>
                        <td className="publish-issue-number-cell">
                          {index + 1}
                        </td>
                        <td>
                          <span className={`badge ${item.severity === "blocked" ? "missing" : "warning"}`}>
                            {item.severity}
                          </span>
                        </td>
                        <td><code>{item.relativePath}</code></td>
                        <td>
                          <strong>{item.message}</strong>
                          {item.suggestion && <span>{item.suggestion}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}

          <details className="publish-plan-disclosure publish-plan-items">
            <summary>
              <span>Technical package plan</span>
              <span>{selectedPlan.items.length} items</span>
            </summary>
            <div className="publish-plan-disclosure-content workflow-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Action</th>
                    <th scope="col">Kind</th>
                    <th scope="col">Source</th>
                    <th scope="col">Public destination</th>
                    <th scope="col">Size</th>
                    <th scope="col">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedPlan.items.map((item, index) => (
                    <tr key={`${item.kind}-${item.destinationRelativePath}-${index}`}>
                      <td>
                        <span className={`badge ${publishPlanActionTone(item.action)}`}>
                          {item.action}
                        </span>
                      </td>
                      <td>{formatPublishPlanKind(item.kind)}</td>
                      <td><code>{item.sourceRelativePath ?? "Generated"}</code></td>
                      <td><code>{item.destinationRelativePath}</code></td>
                      <td>{item.sizeBytes === undefined ? "—" : formatByteSize(item.sizeBytes)}</td>
                      <td>{item.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          <details className="publish-plan-disclosure publish-plan-contract">
            <summary>
              <span>Technical contract</span>
              <span>{selectedPlan.contract.name} v{selectedPlan.contract.version}</span>
            </summary>
            <div className="publish-plan-contract-content">
              <p>
                Catalog schema v{selectedPlan.contract.catalogSchemaVersion}
                {" · "}media base {selectedPlan.contract.mediaBaseUrl}
              </p>
              <p>
                Stream: {selectedPlan.contract.trackResources.stream.protocol.toUpperCase()}
                {" · "}{selectedPlan.contract.trackResources.stream.codec.toUpperCase()}
                {" · "}{selectedPlan.contract.trackResources.stream.bitrateKbps} kbps
                {" · "}{selectedPlan.contract.trackResources.stream.segmentDurationSeconds}s target segments
                {" · "}{selectedPlan.contract.trackResources.stream.segmentType}
              </p>
              <p>
                Player resources: {selectedPlan.contract.trackResources.stream.hrefField}
                {" → "}{selectedPlan.contract.trackResources.stream.manifestRelativePath}
                {" · "}{selectedPlan.contract.trackResources.waveform.hrefField}
                {" → "}{selectedPlan.contract.trackResources.waveform.filename}
              </p>
              <p>
                Video poster: {selectedPlan.contract.videoResources.poster.relativePath}
                {" · "}{selectedPlan.contract.videoResources.poster.format.toUpperCase()}
              </p>
              <p>
                Video: {selectedPlan.contract.videoResources.stream.protocol.toUpperCase()}
                {" · "}{selectedPlan.contract.videoResources.stream.videoCodec.toUpperCase()} {selectedPlan.contract.videoResources.stream.videoProfile} {selectedPlan.contract.videoResources.stream.videoLevel}
                {" · "}≤ {selectedPlan.contract.videoResources.stream.maxWidth}×{selectedPlan.contract.videoResources.stream.maxHeight}
                {" · "}≤ {selectedPlan.contract.videoResources.stream.maxFrameRate} fps
                {" · "}{selectedPlan.contract.videoResources.stream.audioCodec.toUpperCase()} {selectedPlan.contract.videoResources.stream.audioBitrateKbps} kbps
              </p>
              <p>
                Private content excluded: {selectedPlan.contract.privateContentExcluded.join(", ")}.
              </p>
              <code title="Plan fingerprint">
                {selectedPlan.planFingerprint}
              </code>
            </div>
          </details>
          </section>
        </MetadataFieldModal>
      )}
    </section>
  );
}

export {
  assessPublishReadiness,
  mediaPreparationAllowedPublishBlockers,
  type LibraryHealthBucket,
  type LibraryHealthSummary,
  libraryHealthBucket,
  summarizeLibraryHealthIssues,
  libraryHealthTone,
  libraryHealthCompactLabel,
  libraryHealthTitle,
  browserArtworkNeedsPreparation,
  browserArtworkIsBlocked,
  hasNonDerivativePublishBlockers,
  hasMediaPreparationPublishBlockers,
  publishPreflightStatus,
  canPreparePublishPlan,
  canPrepareVideoPublishPlan,
  canPrepareLibraryPlayback,
  canBuildPublishPlan,
  publicReleaseAlreadyExists,
  publicPackageIsUpToDate,
  publishPlanActionTone,
  formatPublishPlanKind,
  publishPreflightHeadline,
  publishPreflightGuidance,
  publishNextStepLabel,
  latestPublishOperationForRelease,
  publishOperationBadge,
  unresolvedPublishOperationForRelease,
  type PublishPlanReviewIntent,
  PublishWorkspace,
};
