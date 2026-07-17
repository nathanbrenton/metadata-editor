import {
  access,
  link,
  lstat,
  mkdir,
  readFile,
  unlink,
} from "node:fs/promises";
import {
  constants as fsConstants,
} from "node:fs";
import {
  execFile as execFileCallback,
} from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { promisify } from "node:util";

import { assertPathWithinRoot } from "./media-root.js";
import type {
  ExportExecutionItem,
  ExportExecutionResult,
  FfmpegCapabilities,
  MetadataExportPlan,
} from "./types.js";

const execFile = promisify(execFileCallback);

export const EXPORT_CONFIRMATION_PHRASE =
  "CREATE_VALIDATED_EXPORTS";

type CommandRunner = (
  executable: string,
  args: string[],
) => Promise<void>;

const defaultCommandRunner: CommandRunner =
  async (executable, args) => {
    await execFile(executable, args, {
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
  };

function stripDisplayRoot(
  outputRoot: string,
  destinationRelativePath: string,
): string[] {
  const segments = destinationRelativePath
    .replaceAll("\\", "/")
    .split("/")
    .filter(Boolean);

  if (
    segments[0] === path.basename(outputRoot)
  ) {
    segments.shift();
  }

  return segments;
}

function resolveDestination(
  outputRoot: string,
  destinationRelativePath: string,
): string {
  return assertPathWithinRoot(
    outputRoot,
    path.resolve(
      outputRoot,
      ...stripDisplayRoot(
        outputRoot,
        destinationRelativePath,
      ),
    ),
  );
}

function scalarValue(
  value:
    | string
    | number
    | boolean
    | string[],
): string {
  return Array.isArray(value)
    ? value.join("; ")
    : String(value);
}

function fieldValueByPath(
  item: MetadataExportPlan["items"][number],
  canonicalPath: string,
): string | undefined {
  const field = item.fields.find(
    (candidate) =>
      candidate.canonicalPath ===
      canonicalPath &&
      candidate.status !== "omitted" &&
      candidate.status !== "unverified",
  );

  return field
    ? scalarValue(field.value)
    : undefined;
}

function metadataArguments(
  item: MetadataExportPlan["items"][number],
  container: MetadataExportPlan["container"],
): string[] {
  const args: string[] = [];
  const emittedTags = new Set<string>();

  const trackNumber = fieldValueByPath(
    item,
    "track.numbering.track_number",
  );
  const trackTotal = fieldValueByPath(
    item,
    "track.numbering.track_total",
  );
  const discNumber = fieldValueByPath(
    item,
    "track.numbering.disc_number",
  );
  const discTotal = fieldValueByPath(
    item,
    "track.numbering.disc_total",
  );

  for (const field of item.fields) {
    if (
      field.status === "omitted" ||
      field.status === "unverified"
    ) {
      continue;
    }

    const tag = field.targetTags[0];

    if (!tag || emittedTags.has(tag)) {
      continue;
    }

    let value = scalarValue(field.value);

    if (
      field.canonicalPath ===
        "release.dates.release" &&
      (
        container === "mp3" ||
        container === "m4a" ||
        container === "wav"
      )
    ) {
      const match = value.match(/^(\d{4})/);
      if (match) {
        value = match[1];
      }
    }

    if (
      field.canonicalPath ===
        "track.numbering.track_number"
    ) {
      value =
        trackTotal && trackNumber
          ? `${trackNumber}/${trackTotal}`
          : trackNumber ?? value;
    } else if (
      field.canonicalPath ===
        "track.numbering.track_total"
    ) {
      continue;
    } else if (
      field.canonicalPath ===
        "track.numbering.disc_number"
    ) {
      value =
        discTotal && discNumber
          ? `${discNumber}/${discTotal}`
          : discNumber ?? value;
    } else if (
      field.canonicalPath ===
        "track.numbering.disc_total"
    ) {
      continue;
    }

    emittedTags.add(tag);
    args.push("-metadata", `${tag}=${value}`);
  }

  return args;
}

function codecArguments(
  container: MetadataExportPlan["container"],
  encoder: string,
): string[] {
  const args = ["-c:a", encoder];

  if (container === "m4a") {
    args.push("-movflags", "+faststart");
  }

  return args;
}

async function sha256File(
  filename: string,
): Promise<string> {
  const contents = await readFile(filename);
  return createHash("sha256")
    .update(contents)
    .digest("hex");
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Unknown export execution error";
}

export async function executeValidatedExportPlan(
  plan: MetadataExportPlan,
  mediaRoot: string,
  outputRoot: string,
  capabilities: FfmpegCapabilities,
  confirmation: string,
  runCommand: CommandRunner =
    defaultCommandRunner,
): Promise<ExportExecutionResult> {
  if (
    confirmation !==
    EXPORT_CONFIRMATION_PHRASE
  ) {
    throw new Error(
      `Confirmation must exactly match ${EXPORT_CONFIRMATION_PHRASE}.`,
    );
  }

  const capability =
    capabilities.containers.find(
      (entry) =>
        entry.container === plan.container,
    );

  if (
    !capabilities.available ||
    !capability ||
    capability.status === "unsupported" ||
    !capability.selectedEncoder
  ) {
    throw new Error(
      capability?.note ??
        capabilities.error ??
        "No usable FFmpeg encoder is available.",
    );
  }

  const items: ExportExecutionItem[] = [];

  for (const item of plan.items) {
    if (
      item.action !== "ready" ||
      !item.sourceAudioRelativePath ||
      !item.destinationRelativePath
    ) {
      items.push({
        trackId: item.trackId,
        status: "failed",
        error:
          item.warnings.join(" ") ||
          "The export plan item is not ready.",
      });
      continue;
    }

    let temporaryPath: string | undefined;

    try {
      const sourcePath = assertPathWithinRoot(
        mediaRoot,
        path.resolve(
          mediaRoot,
          item.sourceAudioRelativePath,
        ),
      );
      const destinationPath =
        resolveDestination(
          outputRoot,
          item.destinationRelativePath,
        );

      const sourceStats =
        await lstat(sourcePath);

      if (
        !sourceStats.isFile() ||
        sourceStats.isSymbolicLink()
      ) {
        throw new Error(
          "Source audio is not a regular file.",
        );
      }

      await access(
        sourcePath,
        fsConstants.R_OK,
      );

      try {
        await lstat(destinationPath);
        throw new Error(
          "The destination file already exists.",
        );
      } catch (error) {
        const code =
          error &&
          typeof error === "object" &&
          "code" in error
            ? String(error.code)
            : "";

        if (code !== "ENOENT") {
          throw error;
        }
      }

      const destinationDirectory =
        path.dirname(destinationPath);
      await mkdir(destinationDirectory, {
        recursive: true,
      });

      const parsed =
        path.parse(destinationPath);
      temporaryPath = path.join(
        destinationDirectory,
        `.${parsed.name}.${randomUUID()}.tmp${parsed.ext}`,
      );

      const args = [
        "-nostdin",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        sourcePath,
        "-map_metadata",
        "-1",
        "-vn",
        ...codecArguments(
          plan.container,
          capability.selectedEncoder,
        ),
        ...metadataArguments(
          item,
          plan.container,
        ),
        temporaryPath,
      ];

      await runCommand(
        capabilities.executable,
        args,
      );

      const temporaryStats =
        await lstat(temporaryPath);

      if (
        !temporaryStats.isFile() ||
        temporaryStats.size === 0
      ) {
        throw new Error(
          "FFmpeg did not create a non-empty temporary output.",
        );
      }

      /*
       * link() is create-only: it fails with EEXIST rather than
       * replacing a destination that appeared after validation.
       */
      await link(
        temporaryPath,
        destinationPath,
      );
      await unlink(temporaryPath);
      temporaryPath = undefined;

      items.push({
        trackId: item.trackId,
        status: "created",
        sourceAudioRelativePath:
          item.sourceAudioRelativePath,
        destinationRelativePath:
          item.destinationRelativePath,
        encoder:
          capability.selectedEncoder,
        sizeBytes: temporaryStats.size,
        sha256:
          await sha256File(
            destinationPath,
          ),
        createdAt:
          new Date().toISOString(),
      });
    } catch (error) {
      if (temporaryPath) {
        await unlink(temporaryPath).catch(
          () => undefined,
        );
      }

      items.push({
        trackId: item.trackId,
        status: "failed",
        ...(item.sourceAudioRelativePath
          ? {
              sourceAudioRelativePath:
                item.sourceAudioRelativePath,
            }
          : {}),
        ...(item.destinationRelativePath
          ? {
              destinationRelativePath:
                item.destinationRelativePath,
            }
          : {}),
        error: errorMessage(error),
      });
    }
  }

  return {
    releaseId: plan.releaseId,
    container: plan.container,
    executedAt: new Date().toISOString(),
    confirmationPhrase:
      EXPORT_CONFIRMATION_PHRASE,
    items,
    summary: {
      createdCount: items.filter(
        (item) =>
          item.status === "created",
      ).length,
      failedCount: items.filter(
        (item) =>
          item.status === "failed",
      ).length,
    },
  };
}
