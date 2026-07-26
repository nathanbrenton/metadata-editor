import { spawn } from "node:child_process";

const directPreviewExtensions = new Set([
  ".avif",
  ".gif",
  ".jpeg",
  ".jpg",
  ".png",
  ".webp",
]);

const tiffPreviewExtensions = new Set([
  ".tif",
  ".tiff",
]);

export type LibraryArtworkPreviewMode =
  | "direct"
  | "tiff-transcode"
  | "unsupported";

export function getLibraryArtworkPreviewMode(
  extension: string,
): LibraryArtworkPreviewMode {
  const normalized = extension.startsWith(".")
    ? extension.toLowerCase()
    : `.${extension.toLowerCase()}`;

  if (directPreviewExtensions.has(normalized)) {
    return "direct";
  }

  if (tiffPreviewExtensions.has(normalized)) {
    return "tiff-transcode";
  }

  return "unsupported";
}

export function buildTiffArtworkPreviewArgs(
  inputPath: string,
): string[] {
  return [
    "-v",
    "error",
    "-nostdin",
    "-i",
    inputPath,
    "-frames:v",
    "1",
    "-an",
    "-map_metadata",
    "-1",
    "-f",
    "image2pipe",
    "-vcodec",
    "png",
    "pipe:1",
  ];
}

export async function renderTiffArtworkPreview(
  inputPath: string,
  options: {
    timeoutMs?: number;
    maxBytes?: number;
  } = {},
): Promise<Buffer> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const maxBytes = options.maxBytes ?? 32 * 1024 * 1024;

  return new Promise<Buffer>((resolve, reject) => {
    const child = spawn(
      "ffmpeg",
      buildTiffArtworkPreviewArgs(inputPath),
      {
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const output: Buffer[] = [];
    const errorOutput: Buffer[] = [];
    let outputBytes = 0;
    let settled = false;

    const finishWithError = (error: Error) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      child.kill("SIGKILL");
      reject(error);
    };

    const timeout = setTimeout(() => {
      finishWithError(
        new Error("TIFF artwork preview conversion timed out."),
      );
    }, timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      outputBytes += chunk.length;

      if (outputBytes > maxBytes) {
        finishWithError(
          new Error("TIFF artwork preview exceeded the in-memory size limit."),
        );
        return;
      }

      output.push(chunk);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      if (
        errorOutput.reduce((total, part) => total + part.length, 0) <
        16 * 1024
      ) {
        errorOutput.push(chunk);
      }
    });

    child.on("error", (error) => {
      finishWithError(
        new Error(
          error.message.includes("ENOENT")
            ? "FFmpeg is unavailable for TIFF artwork preview conversion."
            : `Unable to start TIFF artwork preview conversion: ${error.message}`,
        ),
      );
    });

    child.on("close", (code) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);

      if (code !== 0) {
        const details = Buffer.concat(errorOutput)
          .toString("utf8")
          .trim();
        reject(
          new Error(
            details
              ? `TIFF artwork preview conversion failed: ${details}`
              : "TIFF artwork preview conversion failed.",
          ),
        );
        return;
      }

      const bytes = Buffer.concat(output);

      if (bytes.length === 0) {
        reject(
          new Error("TIFF artwork preview conversion produced no image data."),
        );
        return;
      }

      resolve(bytes);
    });
  });
}
