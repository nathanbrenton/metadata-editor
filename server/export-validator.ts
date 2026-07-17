import {
  access,
  lstat,
  realpath,
} from "node:fs/promises";
import {
  constants as fsConstants,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { assertPathWithinRoot } from "./media-root.js";
import type {
  ExportDryRunCheck,
  ExportDryRunItem,
  ExportDryRunValidation,
  FfmpegCapabilities,
  MetadataExportPlan,
} from "./types.js";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

export function resolveExportOutputRoot(
  configuredRoot =
    process.env.EXPORT_OUTPUT_ROOT ??
    "../deployment-output",
): string {
  return path.resolve(
    projectRoot,
    configuredRoot,
  );
}

function check(
  code: string,
  status: ExportDryRunCheck["status"],
  message: string,
): ExportDryRunCheck {
  return { code, status, message };
}

function destinationWithinOutputRoot(
  outputRoot: string,
  destinationRelativePath: string,
): string {
  const normalized =
    destinationRelativePath
      .split("/")
      .filter(Boolean);

  /*
   * Plans currently display paths beginning with
   * "deployment-output". Remove that display-only root
   * segment before resolving against the configured root.
   */
  if (
    normalized[0] ===
    path.basename(outputRoot)
  ) {
    normalized.shift();
  }

  return assertPathWithinRoot(
    outputRoot,
    path.resolve(
      outputRoot,
      ...normalized,
    ),
  );
}

async function inspectOutputDirectory(
  outputRoot: string,
  destinationPath: string,
): Promise<ExportDryRunCheck> {
  const destinationDirectory =
    path.dirname(destinationPath);

  let candidate = destinationDirectory;

  while (true) {
    try {
      const stats = await lstat(candidate);

      if (!stats.isDirectory()) {
        return check(
          "output-directory",
          "blocked",
          `${candidate} exists but is not a directory.`,
        );
      }

      const canonicalCandidate =
        await realpath(candidate);
      const canonicalRoot =
        await realpath(outputRoot).catch(
          () => outputRoot,
        );

      assertPathWithinRoot(
        canonicalRoot,
        canonicalCandidate,
      );

      await access(
        candidate,
        fsConstants.W_OK |
          fsConstants.X_OK,
      );

      return check(
        "output-directory",
        "pass",
        candidate ===
          destinationDirectory
          ? "Destination directory exists and is writable."
          : `Destination directory can be created beneath writable ancestor ${candidate}.`,
      );
    } catch (error) {
      const code =
        error &&
        typeof error === "object" &&
        "code" in error
          ? String(error.code)
          : "";

      if (
        code !== "ENOENT" &&
        code !== "ENOTDIR"
      ) {
        return check(
          "output-directory",
          "blocked",
          error instanceof Error
            ? error.message
            : "Output directory is not writable.",
        );
      }

      const parent = path.dirname(candidate);

      if (parent === candidate) {
        return check(
          "output-directory",
          "blocked",
          "No writable output-directory ancestor was found.",
        );
      }

      candidate = parent;
    }
  }
}

export async function validateMetadataExportPlan(
  plan: MetadataExportPlan,
  mediaRoot: string,
  capabilities: FfmpegCapabilities,
  outputRoot =
    resolveExportOutputRoot(),
): Promise<ExportDryRunValidation> {
  const capability =
    capabilities.containers.find(
      (item) =>
        item.container === plan.container,
    );

  const duplicateCounts = new Map<
    string,
    number
  >();

  for (const item of plan.items) {
    if (item.destinationRelativePath) {
      duplicateCounts.set(
        item.destinationRelativePath,
        (
          duplicateCounts.get(
            item.destinationRelativePath,
          ) ?? 0
        ) + 1,
      );
    }
  }

  const items: ExportDryRunItem[] = [];

  for (const item of plan.items) {
    const checks: ExportDryRunCheck[] = [];

    if (item.action === "blocked") {
      checks.push(
        check(
          "plan-item",
          "blocked",
          item.warnings.join(" ") ||
            "The export plan blocked this item.",
        ),
      );
    } else {
      checks.push(
        check(
          "plan-item",
          "pass",
          "The export plan marked this item ready.",
        ),
      );
    }

    if (!item.sourceAudioRelativePath) {
      checks.push(
        check(
          "source-readable",
          "blocked",
          "No source audio path is available.",
        ),
      );
    } else {
      try {
        const sourcePath =
          assertPathWithinRoot(
            mediaRoot,
            path.resolve(
              mediaRoot,
              item.sourceAudioRelativePath,
            ),
          );
        const stats = await lstat(sourcePath);

        if (
          !stats.isFile() ||
          stats.isSymbolicLink()
        ) {
          throw new Error(
            "Source audio is not a regular file.",
          );
        }

        await access(
          sourcePath,
          fsConstants.R_OK,
        );

        checks.push(
          check(
            "source-readable",
            "pass",
            "Source audio exists and is readable.",
          ),
        );
      } catch (error) {
        checks.push(
          check(
            "source-readable",
            "blocked",
            error instanceof Error
              ? error.message
              : "Source audio is unavailable.",
          ),
        );
      }
    }

    if (!capabilities.available) {
      checks.push(
        check(
          "encoder",
          "blocked",
          capabilities.error ??
            "FFmpeg is unavailable.",
        ),
      );
    } else if (
      !capability ||
      capability.status === "unsupported"
    ) {
      checks.push(
        check(
          "encoder",
          "blocked",
          capability?.note ??
            "No encoder capability is registered.",
        ),
      );
    } else {
      checks.push(
        check(
          "encoder",
          capability.status ===
            "fallback-required"
            ? "warning"
            : "pass",
          capability.note,
        ),
      );
    }

    if (!item.destinationRelativePath) {
      checks.push(
        check(
          "destination",
          "blocked",
          "No destination path is available.",
        ),
      );
    } else {
      try {
        const destinationPath =
          destinationWithinOutputRoot(
            outputRoot,
            item.destinationRelativePath,
          );

        checks.push(
          check(
            "destination-confinement",
            "pass",
            "Destination remains inside the configured export-output root.",
          ),
        );

        checks.push(
          await inspectOutputDirectory(
            outputRoot,
            destinationPath,
          ),
        );

        try {
          await lstat(destinationPath);
          checks.push(
            check(
              "destination-collision",
              "blocked",
              "The destination file already exists.",
            ),
          );
        } catch (error) {
          const code =
            error &&
            typeof error === "object" &&
            "code" in error
              ? String(error.code)
              : "";

          checks.push(
            code === "ENOENT"
              ? check(
                  "destination-collision",
                  "pass",
                  "No existing destination file was found.",
                )
              : check(
                  "destination-collision",
                  "blocked",
                  error instanceof Error
                    ? error.message
                    : "Destination collision check failed.",
                ),
          );
        }

        if (
          (
            duplicateCounts.get(
              item.destinationRelativePath,
            ) ?? 0
          ) > 1
        ) {
          checks.push(
            check(
              "duplicate-destination",
              "blocked",
              "More than one plan item resolves to this destination.",
            ),
          );
        } else {
          checks.push(
            check(
              "duplicate-destination",
              "pass",
              "The destination is unique within this plan.",
            ),
          );
        }
      } catch (error) {
        checks.push(
          check(
            "destination-confinement",
            "blocked",
            error instanceof Error
              ? error.message
              : "Destination path validation failed.",
          ),
        );
      }
    }

    const blocked = checks.some(
      (itemCheck) =>
        itemCheck.status === "blocked",
    );

    items.push({
      trackId: item.trackId,
      status: blocked
        ? "blocked"
        : checks.some(
              (itemCheck) =>
                itemCheck.status ===
                "warning",
            )
          ? "warning"
          : "ready",
      checks,
    });
  }

  return {
    releaseId: plan.releaseId,
    container: plan.container,
    outputRoot,
    checkedAt: new Date().toISOString(),
    items,
    summary: {
      readyCount: items.filter(
        (item) => item.status === "ready",
      ).length,
      warningCount: items.filter(
        (item) => item.status === "warning",
      ).length,
      blockedCount: items.filter(
        (item) => item.status === "blocked",
      ).length,
    },
    canExport:
      items.length > 0 &&
      items.every(
        (item) =>
          item.status !== "blocked",
      ),
  };
}
