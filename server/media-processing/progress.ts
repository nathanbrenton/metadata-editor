export type MediaPreparationProgressPhase =
  | "starting"
  | "web-stream-hls"
  | "playback-mp3"
  | "waveform-peaks"
  | "validating"
  | "promoting"
  | "completed"
  | "failed";

export type MediaPreparationProgress = {
  operationId: string;
  releaseId: string;
  status: "running" | "completed" | "failed";
  phase: MediaPreparationProgressPhase;
  message: string;
  completedUnits: number;
  totalUnits: number;
  trackCount: number;
  trackId?: string;
  trackLabel?: string;
  trackIndex?: number;
  updatedAt: string;
};

const progressByOperationId =
  new Map<string, MediaPreparationProgress>();

export function recordMediaPreparationProgress(
  progress: MediaPreparationProgress,
): void {
  progressByOperationId.set(
    progress.operationId,
    { ...progress },
  );

  if (progress.status !== "running") {
    scheduleMediaPreparationProgressCleanup(
      progress.operationId,
    );
  }
}

export function readMediaPreparationProgress(
  operationId: string,
): MediaPreparationProgress | undefined {
  const progress =
    progressByOperationId.get(operationId);

  return progress ? { ...progress } : undefined;
}

export function forgetMediaPreparationProgress(
  operationId: string,
): void {
  progressByOperationId.delete(operationId);
}

export function scheduleMediaPreparationProgressCleanup(
  operationId: string,
  delayMs = 60_000,
): void {
  const timer = setTimeout(() => {
    forgetMediaPreparationProgress(operationId);
  }, delayMs);

  timer.unref?.();
}
