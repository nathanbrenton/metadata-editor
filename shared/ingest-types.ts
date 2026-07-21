export type IngestCandidateKind =
  | "folder"
  | "loose-file";

export type IngestMediaKind =
  | "audio"
  | "image"
  | "text"
  | "unknown";

export type InferenceConfidence =
  | "high"
  | "medium"
  | "low";

export type IngestEvidence = {
  field: string;
  value: string | number;
  source: "foldername" | "filename" | "embedded-tag";
  rawValue: string;
  confidence: InferenceConfidence;
  rule: string;
};

export type IngestProbeCapabilities = {
  ffprobe: {
    available: boolean;
    version?: string;
  };
  mediainfo: {
    available: boolean;
    version?: string;
  };
};

export type IngestTechnicalMetadata = {
  container?: string;
  containerLongName?: string;
  codec?: string;
  codecLongName?: string;
  durationSeconds?: number;
  sampleRateHz?: number;
  channels?: number;
  channelLayout?: string;
  bitDepth?: number;
  bitRate?: number;
  width?: number;
  height?: number;
};

export type IngestEmbeddedMetadata = Record<
  string,
  string
>;

export type IngestCandidateSummary = {
  id: string;
  name: string;
  relativePath: string;
  kind: IngestCandidateKind;
  displayTitle: string;
  fileCount: number;
  audioCount: number;
  imageCount: number;
  textCount: number;
  unknownCount: number;
  totalSizeBytes: number;
  extensions: string[];
  dateCandidates: string[];
  evidence: IngestEvidence[];
  warnings: string[];
};

export type IngestScanResult = {
  scannedAt: string;
  rootLabel: string;
  configuredRoot: string;
  candidateCount: number;
  fileCount: number;
  candidates: IngestCandidateSummary[];
  capabilities: IngestProbeCapabilities;
  warnings: string[];
};

export type IngestFileInspection = {
  relativePath: string;
  filename: string;
  extension: string;
  sizeBytes: number;
  modifiedAt: string;
  mediaKind: IngestMediaKind;
  detectedBy: string;
  technical: IngestTechnicalMetadata;
  embeddedMetadata: IngestEmbeddedMetadata;
  evidence: IngestEvidence[];
  warnings: string[];
};

export type IngestCandidateInspection = {
  inspectedAt: string;
  candidate: IngestCandidateSummary;
  files: IngestFileInspection[];
  capabilities: IngestProbeCapabilities;
  warnings: string[];
  readOnly: true;
};
export type IngestAttachmentOptions = {
  candidateId: string;
  files: IngestFileInspection[];
};
