import type { MediaProcessingProfile } from "./profile.js";

export type MediaProcessingScope =
  | "all"
  | "track";

export type MediaProcessingMasterStatus =
  | "ready"
  | "missing"
  | "ambiguous"
  | "blocked";

export type MediaProcessingDerivativeStatus =
  | "current"
  | "missing"
  | "stale"
  | "blocked";

export type MediaProcessingAction =
  | "none"
  | "create"
  | "replace"
  | "blocked";

export type MediaProcessingCheckStatus =
  | "pass"
  | "warning"
  | "blocked";

export type MediaProcessingCheck = {
  code: string;
  status: MediaProcessingCheckStatus;
  message: string;
};

export type MediaProcessingMasterPlan = {
  status: MediaProcessingMasterStatus;
  filename?: string;
  relativePath?: string;
  extension?: string;
  sizeBytes?: number;
  modifiedAt?: string;
  checks: MediaProcessingCheck[];
};

export type MediaProcessingDerivativePlan = {
  kind:
    | "playback-mp3"
    | "waveform-peaks";
  filename: string;
  relativePath: string;
  status: MediaProcessingDerivativeStatus;
  action: MediaProcessingAction;
  reason: string;
  exists: boolean;
  sizeBytes?: number;
  modifiedAt?: string;
  checks: MediaProcessingCheck[];
};

export type MediaProcessingTrackPlan = {
  trackId: string;
  trackRelativePath: string;
  master: MediaProcessingMasterPlan;
  playback: MediaProcessingDerivativePlan;
  waveform: MediaProcessingDerivativePlan;
  canProcess: boolean;
  warnings: string[];
};

export type MediaProcessingPlan = {
  releaseId: string;
  scope: MediaProcessingScope;
  trackId?: string;
  generatedAt: string;
  writesEnabled: false;
  profile: MediaProcessingProfile & {
    sha256: string;
  };
  items: MediaProcessingTrackPlan[];
  summary: {
    trackCount: number;
    currentCount: number;
    createCount: number;
    replaceCount: number;
    blockedCount: number;
  };
  warnings: string[];
};
