import { spawn } from "node:child_process";

const maximumEmbeddedArtworkBytes = 64 * 1024 * 1024;
const extractionTimeoutMs = 30_000;

export type ExtractedEmbeddedArtwork = {
  bytes: Buffer;
  extension: string;
  contentType: string;
};

export function embeddedArtworkOutput(codecName?: string): {
  extension: string;
  contentType: string;
  copyCodec: boolean;
} {
  const codec = codecName?.toLowerCase() ?? "";

  if (codec === "mjpeg" || codec === "jpeg" || codec === "jpg") {
    return { extension: ".jpg", contentType: "image/jpeg", copyCodec: true };
  }

  if (codec === "png") {
    return { extension: ".png", contentType: "image/png", copyCodec: true };
  }

  if (codec === "webp") {
    return { extension: ".webp", contentType: "image/webp", copyCodec: true };
  }

  return { extension: ".png", contentType: "image/png", copyCodec: false };
}

export async function extractEmbeddedArtwork(
  sourcePath: string,
  streamIndex: number,
  codecName?: string,
): Promise<ExtractedEmbeddedArtwork> {
  if (!Number.isInteger(streamIndex) || streamIndex < 0) {
    throw new Error("Embedded artwork stream index must be a non-negative integer.");
  }

  const output = embeddedArtworkOutput(codecName);
  const args = [
    "-v", "error",
    "-i", sourcePath,
    "-map", `0:${streamIndex}`,
    "-frames:v", "1",
    ...(output.copyCodec ? ["-c:v", "copy"] : ["-c:v", "png"]),
    "-f", "image2pipe",
    "pipe:1",
  ];

  return await new Promise((resolve, reject) => {
    const child = spawn("ffmpeg", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let settled = false;

    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
    };

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new Error("Embedded artwork extraction timed out."));
    }, extractionTimeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > maximumEmbeddedArtworkBytes) {
        child.kill("SIGKILL");
        finish(new Error("Embedded artwork exceeds the extraction size limit."));
        return;
      }
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", (error: Error) => finish(error));
    child.on("close", (code: number | null) => {
      if (settled) return;
      if (code !== 0) {
        finish(new Error(
          Buffer.concat(stderr).toString("utf8").trim() ||
          "FFmpeg could not extract embedded artwork.",
        ));
        return;
      }
      const bytes = Buffer.concat(stdout);
      if (bytes.length === 0) {
        finish(new Error("Embedded artwork extraction returned no bytes."));
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({ bytes, extension: output.extension, contentType: output.contentType });
    });
  });
}
