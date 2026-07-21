import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  createStoredIngestDraft,
  INGEST_DRAFT_SCHEMA_VERSION,
  mergeIngestDraftAfterRescan,
  setIngestSourceReviewed,
  type IngestDraftSourceStatus,
  type StoredIngestDraft,
} from "../shared/ingest-drafts.js";
import type {
  IngestBuildDraft,
} from "../shared/ingest-builder.js";
import type {
  IngestAttachmentOptions,
  IngestCandidateInspection,
  IngestFileInspection,
} from "../shared/ingest-types.js";

type DraftSaveState =
  | "loading"
  | "saved"
  | "saving"
  | "error";

function responseError(
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

async function fetchInspection(
  candidateId: string,
): Promise<IngestCandidateInspection> {
  const query = new URLSearchParams({
    candidate: candidateId,
  });
  const response = await fetch(
    `/api/ingest/candidate?${query.toString()}`,
  );
  const body = (await response.json()) as unknown;

  if (!response.ok) {
    throw new Error(
      responseError(
        body,
        `Candidate rescan failed: HTTP ${response.status}`,
      ),
    );
  }

  return body as IngestCandidateInspection;
}

async function fetchAttachments(
  candidateId: string,
): Promise<IngestAttachmentOptions> {
  const query = new URLSearchParams({
    candidate: candidateId,
  });
  const response = await fetch(
    `/api/ingest/attachments?${query.toString()}`,
  );
  const body = (await response.json()) as unknown;

  if (!response.ok) {
    throw new Error(
      responseError(
        body,
        `Attachment scan failed: HTTP ${response.status}`,
      ),
    );
  }

  return body as IngestAttachmentOptions;
}

function attachedFilesForStatuses(
  options: IngestAttachmentOptions,
  statuses: IngestDraftSourceStatus[],
): IngestFileInspection[] {
  const attachedPaths = new Set(
    statuses
      .filter((status) => status.attached)
      .map((status) =>
        status.sourceRelativePath,
      ),
  );

  return options.files.filter((file) =>
    attachedPaths.has(file.relativePath),
  );
}

export function useIngestDraft(
  initialInspection: IngestCandidateInspection,
) {
  const initialStored = useMemo(
    () =>
      createStoredIngestDraft(
        initialInspection,
      ),
    [initialInspection],
  );
  const [draft, setDraft] =
    useState<IngestBuildDraft>(
      initialStored.draft,
    );
  const [sourceStatuses, setSourceStatuses] =
    useState<IngestDraftSourceStatus[]>(
      initialStored.sourceStatuses,
    );
  const [inspection, setInspection] =
    useState(initialInspection);
  const [attachmentOptions, setAttachmentOptions] =
    useState<IngestAttachmentOptions>({
      candidateId:
        initialInspection.candidate.id,
      files: [],
    });
  const [hydrated, setHydrated] =
    useState(false);
  const [saveState, setSaveState] =
    useState<DraftSaveState>("loading");
  const [lastSavedAt, setLastSavedAt] =
    useState<string | null>(null);
  const [workflowError, setWorkflowError] =
    useState<string | null>(null);
  const [rescanLoading, setRescanLoading] =
    useState(false);
  const [rescanMessage, setRescanMessage] =
    useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      try {
        const candidateId =
          initialInspection.candidate.id;
        const [
          draftResponse,
          options,
          freshInspection,
        ] = await Promise.all([
          fetch(
            `/api/ingest/draft?${new URLSearchParams({
              candidate: candidateId,
            }).toString()}`,
          ),
          fetchAttachments(candidateId),
          fetchInspection(candidateId),
        ]);
        const draftBody =
          (await draftResponse.json()) as {
            draft?: StoredIngestDraft | null;
            error?: string;
          };

        if (!draftResponse.ok) {
          throw new Error(
            draftBody.error ??
              `Draft load failed: HTTP ${draftResponse.status}`,
          );
        }

        if (cancelled) {
          return;
        }

        setAttachmentOptions(options);
        setInspection(freshInspection);

        if (draftBody.draft) {
          const attachedFiles =
            attachedFilesForStatuses(
              options,
              draftBody.draft.sourceStatuses,
            );
          const merged =
            mergeIngestDraftAfterRescan(
              draftBody.draft,
              freshInspection,
              attachedFiles,
            );

          setDraft(merged.draft);
          setSourceStatuses(
            merged.sourceStatuses,
          );
          setLastSavedAt(
            draftBody.draft.updatedAt,
          );
        } else {
          const fresh = createStoredIngestDraft(
            freshInspection,
          );
          setDraft(fresh.draft);
          setSourceStatuses(
            fresh.sourceStatuses,
          );
        }

        setSaveState("saved");
      } catch (error) {
        if (!cancelled) {
          setWorkflowError(
            error instanceof Error
              ? error.message
              : "Unknown ingest draft load error",
          );
          setSaveState("error");
        }
      } finally {
        if (!cancelled) {
          setHydrated(true);
        }
      }
    };

    void hydrate();

    return () => {
      cancelled = true;
    };
  }, [initialInspection]);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    setSaveState("saving");
    const timer = window.setTimeout(() => {
      const stored: StoredIngestDraft = {
        schemaVersion:
          INGEST_DRAFT_SCHEMA_VERSION,
        candidateId: draft.candidateId,
        updatedAt: new Date().toISOString(),
        draft,
        sourceStatuses,
      };

      void fetch("/api/ingest/draft", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(stored),
      })
        .then(async (response) => {
          const body =
            (await response.json()) as unknown;

          if (!response.ok) {
            throw new Error(
              responseError(
                body,
                `Draft save failed: HTTP ${response.status}`,
              ),
            );
          }

          const saved = body as StoredIngestDraft;
          setLastSavedAt(saved.updatedAt);
          setSaveState("saved");
        })
        .catch((error: unknown) => {
          setWorkflowError(
            error instanceof Error
              ? error.message
              : "Unknown ingest draft save error",
          );
          setSaveState("error");
        });
    }, 500);

    return () => {
      window.clearTimeout(timer);
    };
  }, [draft, hydrated, sourceStatuses]);

  const rescan = async () => {
    setRescanLoading(true);
    setWorkflowError(null);
    setRescanMessage(null);

    try {
      const [nextInspection, options] =
        await Promise.all([
          fetchInspection(draft.candidateId),
          fetchAttachments(draft.candidateId),
        ]);
      const stored: StoredIngestDraft = {
        schemaVersion:
          INGEST_DRAFT_SCHEMA_VERSION,
        candidateId: draft.candidateId,
        updatedAt:
          lastSavedAt ??
          new Date().toISOString(),
        draft,
        sourceStatuses,
      };
      const merged =
        mergeIngestDraftAfterRescan(
          stored,
          nextInspection,
          attachedFilesForStatuses(
            options,
            sourceStatuses,
          ),
        );

      setInspection(nextInspection);
      setAttachmentOptions(options);
      setDraft(merged.draft);
      setSourceStatuses(
        merged.sourceStatuses,
      );
      setRescanMessage(
        [
          `${merged.counts.new} new`,
          `${merged.counts.changed} changed`,
          `${merged.counts.missing} missing`,
        ].join(" · "),
      );

      return merged;
    } catch (error) {
      setWorkflowError(
        error instanceof Error
          ? error.message
          : "Unknown candidate rescan error",
      );
      return null;
    } finally {
      setRescanLoading(false);
    }
  };

  const attachFile = (
    file: IngestFileInspection,
  ) => {
    const currentAttached =
      attachedFilesForStatuses(
        attachmentOptions,
        sourceStatuses,
      );
    const stored: StoredIngestDraft = {
      schemaVersion:
        INGEST_DRAFT_SCHEMA_VERSION,
      candidateId: draft.candidateId,
      updatedAt:
        lastSavedAt ??
        new Date().toISOString(),
      draft,
      sourceStatuses,
    };
    const merged =
      mergeIngestDraftAfterRescan(
        stored,
        inspection,
        [
          ...currentAttached,
          file,
        ],
      );

    setDraft(merged.draft);
    setSourceStatuses(
      merged.sourceStatuses.map((status) =>
        status.sourceRelativePath ===
        file.relativePath
          ? {
              ...status,
              attached: true,
            }
          : status,
      ),
    );
  };

  const detachFile = (
    sourceRelativePath: string,
  ) => {
    setDraft((current) => ({
      ...current,
      assets: current.assets.filter(
        (asset) =>
          asset.sourceRelativePath !==
          sourceRelativePath,
      ),
    }));
    setSourceStatuses((current) =>
      current.filter(
        (status) =>
          status.sourceRelativePath !==
          sourceRelativePath,
      ),
    );
  };

  const markReviewed = (
    sourceRelativePath: string,
    reviewed: boolean,
  ) => {
    setSourceStatuses((current) =>
      setIngestSourceReviewed(
        current,
        sourceRelativePath,
        reviewed,
      ),
    );
  };

  const clearStoredDraft = async () => {
    const query = new URLSearchParams({
      candidate: draft.candidateId,
    });
    await fetch(
      `/api/ingest/draft?${query.toString()}`,
      { method: "DELETE" },
    );
  };

  return {
    draft,
    setDraft,
    sourceStatuses,
    inspection,
    attachmentOptions,
    saveState,
    lastSavedAt,
    workflowError,
    rescanLoading,
    rescanMessage,
    rescan,
    attachFile,
    detachFile,
    markReviewed,
    clearStoredDraft,
  };
}
