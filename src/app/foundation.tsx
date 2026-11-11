import { lazy } from "react";
import type {
  ExportContainer,
  InterfaceAccentMode,
} from "./types.js";

// Defer secondary workflows until they are opened so the initial editor
// bundle remains smaller and faster to parse.
const LazyIngestReleaseBuilder = lazy(async () => {
  const module = await import(
    "../IngestReleaseBuilder.js"
  );

  return {
    default: module.IngestReleaseBuilder,
  };
});

const LazyWorkflowHelpView = lazy(async () => {
  const module = await import(
    "../WorkflowHelpView.js"
  );

  return {
    default: module.WorkflowHelpView,
  };
});

const LazyScannerWarningPanel = lazy(async () => {
  const module = await import(
    "../ScannerWarningPanel.js"
  );

  return {
    default: module.ScannerWarningPanel,
  };
});

const LazySampleRelationshipRecordEditor = lazy(async () => {
  const module = await import(
    "../SampleRecordEditors.js"
  );

  return {
    default: module.SampleRelationshipRecordEditor,
  };
});

const LazySampleClearanceRecordEditor = lazy(async () => {
  const module = await import(
    "../SampleRecordEditors.js"
  );

  return {
    default: module.SampleClearanceRecordEditor,
  };
});

const LazyWaveformColorMenuCard = lazy(async () => {
  const module = await import(
    "../WaveformColorMenuCard.js"
  );

  return {
    default: module.WaveformColorMenuCard,
  };
});

const LibraryWaveformView = lazy(async () => {
  const module = await import(
    "../LibraryWaveformView.js"
  );

  return {
    default: module.LibraryWaveformView,
  };
});

const StagingLibraryBuildWorkspace = lazy(async () => {
  const module = await import(
    "../StagingLibraryBuildWorkspace.js"
  );

  return {
    default: module.StagingLibraryBuildWorkspace,
  };
});

const LazyReleaseAboutGenerator = lazy(async () => {
  const module = await import(
    "../ReleaseAboutGenerator.js"
  );

  return {
    default: module.ReleaseAboutGenerator,
  };
});

const INTERFACE_ACCENT_STORAGE_KEY =
  "metadata-editor.interface-accent-v1";

const INTERFACE_ACCENT_OPTIONS: Array<{
  value: InterfaceAccentMode;
  label: string;
}> = [
  { value: "gray", label: "Gray" },
  { value: "purple", label: "Purple" },
  { value: "blue", label: "Blue" },
];

const EXPORT_CONFIRMATION_PHRASE =
  "CREATE_VALIDATED_EXPORTS";

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

function formatByteSize(sizeBytes: number): string {
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }

  const units = ["KB", "MB", "GB", "TB"];
  let value = sizeBytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

function formatDuration(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(wholeSeconds / 60);
  const remainder = wholeSeconds % 60;

  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export {
  LazyIngestReleaseBuilder,
  LazyWorkflowHelpView,
  LazyScannerWarningPanel,
  LazySampleRelationshipRecordEditor,
  LazySampleClearanceRecordEditor,
  LazyWaveformColorMenuCard,
  LibraryWaveformView,
  StagingLibraryBuildWorkspace,
  LazyReleaseAboutGenerator,
  INTERFACE_ACCENT_STORAGE_KEY,
  INTERFACE_ACCENT_OPTIONS,
  EXPORT_CONFIRMATION_PHRASE,
  exportContainerLabels,
  coreExportPaths,
  formatMetadataValue,
  formatByteSize,
  formatDuration,
};
