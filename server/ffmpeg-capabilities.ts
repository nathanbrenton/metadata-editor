import {
  execFile as execFileCallback,
} from "node:child_process";
import { promisify } from "node:util";

import type {
  ExportContainer,
  FfmpegCapabilities,
  FfmpegContainerCapability,
} from "./types.js";

const execFile = promisify(
  execFileCallback,
);

const codecRequirements: Record<
  ExportContainer,
  {
    preferred: string;
    fallbacks: string[];
  }
> = {
  mp3: {
    preferred: "libmp3lame",
    fallbacks: ["mp3"],
  },
  flac: {
    preferred: "flac",
    fallbacks: [],
  },
  m4a: {
    preferred: "aac",
    fallbacks: [],
  },
  "ogg-vorbis": {
    preferred: "libvorbis",
    fallbacks: ["vorbis"],
  },
  opus: {
    preferred: "libopus",
    fallbacks: ["opus"],
  },
  wav: {
    preferred: "pcm_s24le",
    fallbacks: ["pcm_s16le"],
  },
};

export function parseFfmpegVersion(
  output: string,
): string | null {
  const firstLine =
    output.split(/\r?\n/, 1)[0]?.trim() ??
    "";

  const match = firstLine.match(
    /^ffmpeg version\s+(\S+)/i,
  );

  return match?.[1] ?? null;
}

export function parseFfmpegEncoders(
  output: string,
): string[] {
  const encoders = new Set<string>();

  for (const line of output.split(/\r?\n/)) {
    /*
     * Encoder rows begin with six capability
     * flags followed by the encoder name.
     */
    const match = line.match(
      /^\s*[VASFSXD\.]{6}\s+(\S+)/,
    );

    if (
      match &&
      match[1] !== "="
    ) {
      encoders.add(match[1]);
    }
  }

  return [...encoders].sort();
}

export function classifyContainerCapabilities(
  encoders: readonly string[],
): FfmpegContainerCapability[] {
  const available = new Set(encoders);

  return (
    Object.entries(codecRequirements) as Array<
      [
        ExportContainer,
        (typeof codecRequirements)[ExportContainer],
      ]
    >
  ).map(
    ([
      container,
      requirement,
    ]): FfmpegContainerCapability => {
      if (
        available.has(
          requirement.preferred,
        )
      ) {
        return {
          container,
          status: "ready",
          preferredEncoder:
            requirement.preferred,
          selectedEncoder:
            requirement.preferred,
          fallbackEncoders:
            requirement.fallbacks,
          note:
            "The preferred encoder is available.",
        };
      }

      const fallback =
        requirement.fallbacks.find(
          (encoder) =>
            available.has(encoder),
        );

      if (fallback) {
        return {
          container,
          status:
            "fallback-required",
          preferredEncoder:
            requirement.preferred,
          selectedEncoder: fallback,
          fallbackEncoders:
            requirement.fallbacks,
          note:
            `Preferred encoder ${requirement.preferred} is unavailable; ${fallback} is available as a fallback.`,
        };
      }

      return {
        container,
        status: "unsupported",
        preferredEncoder:
          requirement.preferred,
        fallbackEncoders:
          requirement.fallbacks,
        note:
          "Neither the preferred encoder nor a registered fallback is available.",
      };
    },
  );
}

type CommandRunner = (
  file: string,
  args: string[],
) => Promise<{
  stdout: string;
  stderr: string;
}>;

const runCommand: CommandRunner =
  async (file, args) => {
    const result = await execFile(
      file,
      args,
      {
        encoding: "utf8",
        timeout: 5_000,
        maxBuffer:
          4 * 1024 * 1024,
      },
    );

    return {
      stdout: result.stdout,
      stderr: result.stderr,
    };
  };

export async function detectFfmpegCapabilities(
  runner: CommandRunner =
    runCommand,
): Promise<FfmpegCapabilities> {
  try {
    const versionResult =
      await runner("ffmpeg", [
        "-version",
      ]);
    const encoderResult =
      await runner("ffmpeg", [
        "-hide_banner",
        "-encoders",
      ]);

    const encoderOutput = [
      encoderResult.stdout,
      encoderResult.stderr,
    ].join("\n");
    const encoders =
      parseFfmpegEncoders(
        encoderOutput,
      );

    return {
      available: true,
      version:
        parseFfmpegVersion(
          versionResult.stdout,
        ) ?? "unknown",
      executable: "ffmpeg",
      encoders,
      containers:
        classifyContainerCapabilities(
          encoders,
        ),
      checkedAt:
        new Date().toISOString(),
    };
  } catch (error) {
    return {
      available: false,
      executable: "ffmpeg",
      encoders: [],
      containers:
        classifyContainerCapabilities(
          [],
        ),
      checkedAt:
        new Date().toISOString(),
      error:
        error instanceof Error
          ? error.message
          : "Unable to run ffmpeg.",
    };
  }
}
