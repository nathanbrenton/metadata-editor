import {
  randomUUID,
} from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import {
  spawn,
} from "node:child_process";
import path from "node:path";

import {
  detectFfmpegCapabilities,
} from "../ffmpeg-capabilities.js";
import {
  inspectWaveformDocument,
} from "./plan.js";
import {
  buildMediaProcessingProfile,
} from "./profile.js";
import {
  generateWaveformPeaksFromWav,
  parseWavBuffer,
} from "./waveform-generator.js";

export type StagingWaveformWriter = (
  masterPath: string,
  waveformPath: string,
) => Promise<void>;

function buildWaveformDecodeArgs(
  inputPath: string,
  outputPath: string,
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
    "-c:a",
    "pcm_s16le",
    "-f",
    "wav",
    "-y",
    outputPath,
  ];
}

async function runFfmpeg(
  executable: string,
  args: readonly string[],
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, [...args], {
      stdio: ["ignore", "ignore", "pipe"],
    });
    const errorChunks: Buffer[] = [];
    let errorBytes = 0;
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(
        new Error(
          "FFmpeg waveform decoding timed out.",
        ),
      );
    }, 60 * 60 * 1000);

    child.stderr.on("data", (chunk: Buffer) => {
      if (errorBytes >= 64 * 1024) return;
      errorChunks.push(chunk);
      errorBytes += chunk.length;
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(
        new Error(
          error.message.includes("ENOENT")
            ? "FFmpeg is unavailable for waveform decoding."
            : `Unable to start FFmpeg for waveform decoding: ${error.message}`,
        ),
      );
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);

      if (code === 0) {
        resolve();
        return;
      }

      const details = Buffer.concat(errorChunks)
        .toString("utf8")
        .trim();

      reject(
        new Error(
          details
            ? `FFmpeg waveform decoding failed: ${details}`
            : `FFmpeg waveform decoding failed with exit code ${String(code)}.`,
        ),
      );
    });
  });
}

async function decodedWaveformInput(
  masterPath: string,
  decodePath: string,
): Promise<Buffer> {
  const extension =
    path.extname(masterPath).toLowerCase();

  if (extension === ".wav") {
    const source = await readFile(masterPath);

    try {
      parseWavBuffer(source);
      return source;
    } catch {
      // Some valid WAV encodings are outside the native parser.
      // Fall through to the same FFmpeg decode used for other formats.
    }
  }

  const capabilities =
    await detectFfmpegCapabilities();

  if (!capabilities.available) {
    throw new Error(
      extension === ".wav"
        ? "The WAV master is outside the native waveform analyzer and FFmpeg is unavailable for fallback decoding."
        : `FFmpeg is required to decode ${extension || "this audio format"} for waveform generation.`,
    );
  }

  await runFfmpeg(
    capabilities.executable,
    buildWaveformDecodeArgs(
      masterPath,
      decodePath,
    ),
  );

  return readFile(decodePath);
}

export const writeStagingWaveform:
  StagingWaveformWriter =
async (
  masterPath,
  waveformPath,
) => {
  const operationId = randomUUID();
  const waveformDirectory =
    path.dirname(waveformPath);
  const decodeDirectory = path.join(
    waveformDirectory,
    `.waveform-decode-${operationId}`,
  );
  const decodePath = path.join(
    decodeDirectory,
    "analysis.wav",
  );
  const temporaryWaveformPath =
    `${waveformPath}.${operationId}.tmp`;
  let temporaryWaveformCreated = false;

  await mkdir(waveformDirectory, {
    recursive: true,
  });

  try {
    await mkdir(decodeDirectory, {
      recursive: false,
      mode: 0o700,
    });

    const wavBytes =
      await decodedWaveformInput(
        masterPath,
        decodePath,
      );
    const profile =
      buildMediaProcessingProfile();
    const waveform =
      generateWaveformPeaksFromWav(
        wavBytes,
        profile.waveform.peaksPerSecond,
      );
    const inspection =
      inspectWaveformDocument(
        waveform,
        profile.waveform,
      );

    if (!inspection.valid) {
      throw new Error(
        `Generated waveform failed active-profile validation: ${inspection.checks
          .map((check) => check.message)
          .join(" ")}`,
      );
    }

    await writeFile(
      temporaryWaveformPath,
      `${JSON.stringify(waveform, null, 2)}\n`,
      {
        flag: "wx",
        mode: 0o600,
      },
    );
    temporaryWaveformCreated = true;

    await rename(
      temporaryWaveformPath,
      waveformPath,
    );
    temporaryWaveformCreated = false;

    const finalStats =
      await lstat(waveformPath);

    if (
      finalStats.isSymbolicLink() ||
      !finalStats.isFile()
    ) {
      throw new Error(
        "Generated waveform destination is not a regular file.",
      );
    }
  } finally {
    if (temporaryWaveformCreated) {
      await rm(
        temporaryWaveformPath,
        { force: true },
      ).catch(() => undefined);
    }

    await rm(
      decodeDirectory,
      {
        recursive: true,
        force: true,
      },
    ).catch(() => undefined);
  }
};
