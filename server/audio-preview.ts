import type {
  DiscoveredAsset,
  FfmpegCapabilities,
  TrackScanResult,
} from "./types.js";

export type AudioPreviewSourceKind =
  | "playback"
  | "master";

export type AudioPreviewSelection = {
  asset: DiscoveredAsset;
  sourceKind: AudioPreviewSourceKind;
};

export type AudioPreviewDeliveryMode =
  | "direct"
  | "transcoded";

export type ByteRange = {
  start: number;
  end: number;
};

const directPreviewExtensions = new Set([
  ".mp3",
]);

const audioPreviewContentTypes = new Map([
  [".aac", "audio/aac"],
  [".aif", "audio/aiff"],
  [".aiff", "audio/aiff"],
  [".alac", "audio/mp4"],
  [".flac", "audio/flac"],
  [".m4a", "audio/mp4"],
  [".mp3", "audio/mpeg"],
  [".ogg", "audio/ogg"],
  [".opus", "audio/ogg"],
  [".wav", "audio/wav"],
]);

export function getAudioPreviewContentType(
  extension: string,
): string | undefined {
  return audioPreviewContentTypes.get(
    extension.toLowerCase(),
  );
}

export function selectTrackAudioPreview(
  track: TrackScanResult,
): AudioPreviewSelection {
  const playbackAudio =
    track.playbackAudio ?? [];

  if (playbackAudio.length > 1) {
    throw new Error(
      "Multiple playback audio files were detected for this track.",
    );
  }

  if (playbackAudio.length === 1) {
    return {
      asset: playbackAudio[0],
      sourceKind: "playback",
    };
  }

  if (track.audioMasters.length > 1) {
    throw new Error(
      "Multiple audio masters were detected for this track.",
    );
  }

  if (track.audioMasters.length === 0) {
    throw new Error(
      "No audio preview source was detected for this track.",
    );
  }

  return {
    asset: track.audioMasters[0],
    sourceKind: "master",
  };
}

export function parseSingleByteRange(
  headerValue: string | undefined,
  sizeBytes: number,
): ByteRange | null {
  if (!headerValue) {
    return null;
  }

  if (
    !Number.isSafeInteger(sizeBytes) ||
    sizeBytes <= 0
  ) {
    throw new Error(
      "Cannot parse a byte range for an empty file.",
    );
  }

  const match = /^bytes=(\d*)-(\d*)$/.exec(
    headerValue.trim(),
  );

  if (!match) {
    throw new Error(
      "Only one bytes range is supported.",
    );
  }

  const [, startText, endText] = match;

  if (!startText && !endText) {
    throw new Error("The byte range is empty.");
  }

  if (!startText) {
    const suffixLength = Number.parseInt(
      endText,
      10,
    );

    if (
      !Number.isSafeInteger(suffixLength) ||
      suffixLength <= 0
    ) {
      throw new Error(
        "The byte-range suffix is invalid.",
      );
    }

    return {
      start: Math.max(0, sizeBytes - suffixLength),
      end: sizeBytes - 1,
    };
  }

  const start = Number.parseInt(startText, 10);
  const requestedEnd = endText
    ? Number.parseInt(endText, 10)
    : sizeBytes - 1;

  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    start < 0 ||
    requestedEnd < start ||
    start >= sizeBytes
  ) {
    throw new Error(
      "The requested byte range is outside the file.",
    );
  }

  return {
    start,
    end: Math.min(requestedEnd, sizeBytes - 1),
  };
}

export function getAudioPreviewDeliveryMode(
  extension: string,
): AudioPreviewDeliveryMode {
  return directPreviewExtensions.has(
    extension.toLowerCase(),
  )
    ? "direct"
    : "transcoded";
}

export function selectAudioPreviewMp3Encoder(
  capabilities: FfmpegCapabilities,
): string {
  if (!capabilities.available) {
    throw new Error(
      capabilities.error ??
        "FFmpeg is unavailable for live audio preview transcoding.",
    );
  }

  const mp3Capability =
    capabilities.containers.find(
      (container) =>
        container.container === "mp3",
    );

  if (
    !mp3Capability ||
    mp3Capability.status === "unsupported" ||
    !mp3Capability.selectedEncoder
  ) {
    throw new Error(
      "FFmpeg does not expose a supported MP3 encoder for live audio preview transcoding.",
    );
  }

  return mp3Capability.selectedEncoder;
}

export function buildAudioPreviewTranscodeArgs(
  inputPath: string,
  encoder: string,
): string[] {
  return [
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    "-i",
    inputPath,
    "-map",
    "0:a:0",
    "-vn",
    "-map_metadata",
    "-1",
    "-ac",
    "2",
    "-c:a",
    encoder,
    "-b:a",
    "192k",
    "-f",
    "mp3",
    "pipe:1",
  ];
}
