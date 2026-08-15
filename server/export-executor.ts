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

type MetadataEntry = {
  tag: string;
  value: string;
};

type MetadataProbeRunner = (
  filename: string,
) => Promise<string[]>;

const combinedRightsPaths = new Set([
  "release.rights.copyright",
  "release.rights.phonographic_copyright",
  "track.rights.copyright",
  "track.rights.phonographic_copyright",
]);

function firstNonBlank(
  ...values: Array<string | undefined>
): string | undefined {
  return values.find(
    (value) => value?.trim(),
  )?.trim();
}

function combinedRightsEntry(
  item: MetadataExportPlan["items"][number],
): MetadataEntry | undefined {
  const copyright = firstNonBlank(
    fieldValueByPath(
      item,
      "track.rights.copyright",
    ),
    fieldValueByPath(
      item,
      "release.rights.copyright",
    ),
  );
  const phonographicCopyright = firstNonBlank(
    fieldValueByPath(
      item,
      "track.rights.phonographic_copyright",
    ),
    fieldValueByPath(
      item,
      "release.rights.phonographic_copyright",
    ),
  );
  const value = [
    copyright,
    phonographicCopyright,
  ]
    .filter(
      (entry): entry is string =>
        Boolean(entry),
    )
    .join(" ");

  return value
    ? {
        // FFmpeg accepts its canonical metadata key and maps it to
        // the appropriate ID3/MP4/Vorbis/RIFF representation.
        tag: "copyright",
        value,
      }
    : undefined;
}

function metadataEntries(
  item: MetadataExportPlan["items"][number],
  container: MetadataExportPlan["container"],
): MetadataEntry[] {
  const entries: MetadataEntry[] = [];
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

  const rightsEntry = combinedRightsEntry(
    item,
  );
  if (rightsEntry) {
    emittedTags.add(rightsEntry.tag);
    entries.push(rightsEntry);
  }

  for (const field of item.fields) {
    if (combinedRightsPaths.has(field.canonicalPath)) {
      continue;
    }
    if (
      field.status === "omitted" ||
      field.status === "unverified"
    ) {
      continue;
    }

    const tag =
      field.ffmpegTags?.[0] ??
      field.targetTags[0];

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
    entries.push({ tag, value });
  }

  return entries;
}

function metadataArguments(
  entries: readonly MetadataEntry[],
): string[] {
  return entries.flatMap(({ tag, value }) => [
    "-metadata",
    `${tag}=${value}`,
  ]);
}

function containsNonAscii(
  value: string,
): boolean {
  return /[^\x00-\x7f]/u.test(value);
}

function ffprobeTagValues(
  value: unknown,
): string[] {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return [];
  }

  const payload = value as Record<string, unknown>;
  const values: string[] = [];

  const appendTags = (tags: unknown) => {
    if (
      typeof tags !== "object" ||
      tags === null ||
      Array.isArray(tags)
    ) {
      return;
    }

    for (const entry of Object.values(tags)) {
      if (typeof entry === "string") {
        values.push(entry);
      }
    }
  };

  const format = payload.format;
  if (
    typeof format === "object" &&
    format !== null &&
    !Array.isArray(format)
  ) {
    appendTags(
      (format as Record<string, unknown>).tags,
    );
  }

  if (Array.isArray(payload.streams)) {
    for (const stream of payload.streams) {
      if (
        typeof stream === "object" &&
        stream !== null &&
        !Array.isArray(stream)
      ) {
        appendTags(
          (stream as Record<string, unknown>).tags,
        );
      }
    }
  }

  return values;
}

const defaultMetadataProbeRunner:
  MetadataProbeRunner =
  async (filename) => {
    const { stdout } = await execFile(
      process.env.FFPROBE_PATH ?? "ffprobe",
      [
        "-v",
        "error",
        "-show_entries",
        "format_tags:stream_tags",
        "-of",
        "json",
        filename,
      ],
      {
        windowsHide: true,
        maxBuffer: 4 * 1024 * 1024,
      },
    );

    return ffprobeTagValues(
      JSON.parse(String(stdout)),
    );
  };

async function verifyUnicodeMetadataReadback(
  entries: readonly MetadataEntry[],
  filename: string,
  probeMetadata: MetadataProbeRunner,
): Promise<number> {
  const unicodeEntries = entries.filter(
    ({ value }) => containsNonAscii(value),
  );

  if (unicodeEntries.length === 0) {
    return 0;
  }

  const observedValues =
    await probeMetadata(filename);

  for (const entry of unicodeEntries) {
    if (!observedValues.includes(entry.value)) {
      throw new Error(
        `Unicode metadata readback mismatch for ${entry.tag}; FFprobe did not return the exact written value.`,
      );
    }
  }

  return unicodeEntries.length;
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
  probeMetadata: MetadataProbeRunner =
    defaultMetadataProbeRunner,
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

      const metadata = metadataEntries(
        item,
        plan.container,
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
        ...metadataArguments(metadata),
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

      const unicodeMetadataVerifiedCount =
        await verifyUnicodeMetadataReadback(
          metadata,
          temporaryPath,
          probeMetadata,
        );

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
        ...(unicodeMetadataVerifiedCount > 0
          ? {
              unicodeMetadataVerified: true,
              unicodeMetadataVerifiedCount,
            }
          : {}),
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
