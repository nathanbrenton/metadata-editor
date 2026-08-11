import {
  readdir,
} from "node:fs/promises";
import path from "node:path";

import {
  canonicalMediaMasterFilename,
  classifyMediaMasterExtension,
  normalizeMediaFileExtension,
  type CanonicalMediaMasterRole,
  type MediaMasterFormatClass,
} from "../shared/media-file-spec.js";
import {
  describeMediaFileSpecRoleCounts,
  presentMediaFileSpecSummary,
  type MediaFileSpecSummaryCounts,
} from "../shared/media-file-spec-summary.js";

export type MediaFileSpecAuditItem = {
  relativePath: string;
  role: CanonicalMediaMasterRole;
  extension: string;
  formatClass: MediaMasterFormatClass;
  canonicalFilename: string;
  canonicalName: boolean;
};

export type MediaFileSpecExtensionCount = {
  extension: string;
  total: number;
  preferred: number;
  compatible: number;
  unsupported: number;
  nonCanonicalNames: number;
};

export type MediaFileSpecAuditResult = {
  root: string;
  releaseId?: string;
  items: MediaFileSpecAuditItem[];
  summary: {
    total: number;
    preferred: number;
    compatible: number;
    unsupported: number;
    nonCanonicalNames: number;
    roles: Record<
      CanonicalMediaMasterRole,
      MediaFileSpecSummaryCounts
    >;
    extensions: Record<
      CanonicalMediaMasterRole,
      MediaFileSpecExtensionCount[]
    >;
  };
};

function roleForFilename(
  filename: string,
): CanonicalMediaMasterRole | null {
  const lower = filename.toLowerCase();

  if (
    lower === "audio-master" ||
    lower.startsWith("audio-master.")
  ) {
    return "audio-master";
  }

  if (
    lower === "artwork-master" ||
    lower.startsWith("artwork-master.")
  ) {
    return "artwork-master";
  }

  if (
    lower === "video-master" ||
    lower.startsWith("video-master.")
  ) {
    return "video-master";
  }

  return null;
}

function extensionFor(filename: string): string {
  const dot = filename.lastIndexOf(".");

  if (dot <= 0) {
    return "";
  }

  return filename.slice(dot);
}

async function walk(
  root: string,
  directory: string,
  items: MediaFileSpecAuditItem[],
): Promise<void> {
  const entries = await readdir(directory, {
    withFileTypes: true,
  });

  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      continue;
    }

    const absolute = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      await walk(root, absolute, items);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const role = roleForFilename(entry.name);

    if (!role) {
      continue;
    }

    const rawExtension = extensionFor(entry.name);
    const extension =
      normalizeMediaFileExtension(rawExtension);
    const canonicalFilename =
      canonicalMediaMasterFilename(
        role,
        rawExtension,
      );

    items.push({
      relativePath: path.relative(root, absolute),
      role,
      extension,
      formatClass: classifyMediaMasterExtension(
        role,
        rawExtension,
      ),
      canonicalFilename,
      canonicalName: entry.name === canonicalFilename,
    });
  }
}

export async function auditMediaLibraryFileSpec(
  mediaLibraryRoot: string,
  releaseId?: string,
): Promise<MediaFileSpecAuditResult> {
  const releasesRoot = path.join(
    mediaLibraryRoot,
    "releases",
  );
  const scanRoot = releaseId
    ? path.join(releasesRoot, releaseId)
    : releasesRoot;

  const items: MediaFileSpecAuditItem[] = [];
  await walk(scanRoot, scanRoot, items);

  items.sort((left, right) =>
    left.relativePath.localeCompare(
      right.relativePath,
      undefined,
      { numeric: true, sensitivity: "base" },
    ),
  );

  const roleCounts = (
    role: CanonicalMediaMasterRole,
  ): MediaFileSpecSummaryCounts => {
    const roleItems = items.filter(
      (item) => item.role === role,
    );

    return {
      total: roleItems.length,
      preferred: roleItems.filter(
        (item) => item.formatClass === "preferred",
      ).length,
      compatible: roleItems.filter(
        (item) => item.formatClass === "compatible",
      ).length,
      unsupported: roleItems.filter(
        (item) => item.formatClass === "unsupported",
      ).length,
      nonCanonicalNames: roleItems.filter(
        (item) => !item.canonicalName,
      ).length,
    };
  };

  const extensionCounts = (
    role: CanonicalMediaMasterRole,
  ): MediaFileSpecExtensionCount[] => {
    const byExtension = new Map<
      string,
      MediaFileSpecAuditItem[]
    >();

    for (const item of items) {
      if (item.role !== role) {
        continue;
      }

      const extension = item.extension || "(none)";
      const group = byExtension.get(extension) ?? [];
      group.push(item);
      byExtension.set(extension, group);
    }

    return [...byExtension.entries()]
      .map(([extension, extensionItems]) => ({
        extension,
        total: extensionItems.length,
        preferred: extensionItems.filter(
          (item) => item.formatClass === "preferred",
        ).length,
        compatible: extensionItems.filter(
          (item) => item.formatClass === "compatible",
        ).length,
        unsupported: extensionItems.filter(
          (item) => item.formatClass === "unsupported",
        ).length,
        nonCanonicalNames: extensionItems.filter(
          (item) => !item.canonicalName,
        ).length,
      }))
      .sort(
        (left, right) =>
          right.total - left.total ||
          left.extension.localeCompare(right.extension),
      );
  };

  return {
    root: scanRoot,
    ...(releaseId ? { releaseId } : {}),
    items,
    summary: {
      total: items.length,
      preferred: items.filter(
        (item) => item.formatClass === "preferred",
      ).length,
      compatible: items.filter(
        (item) => item.formatClass === "compatible",
      ).length,
      unsupported: items.filter(
        (item) => item.formatClass === "unsupported",
      ).length,
      nonCanonicalNames: items.filter(
        (item) => !item.canonicalName,
      ).length,
      roles: {
        "artwork-master": roleCounts("artwork-master"),
        "audio-master": roleCounts("audio-master"),
        "video-master": roleCounts("video-master"),
      },
      extensions: {
        "artwork-master": extensionCounts("artwork-master"),
        "audio-master": extensionCounts("audio-master"),
        "video-master": extensionCounts("video-master"),
      },
    },
  };
}

export function formatMediaFileSpecAuditSummary(
  result: MediaFileSpecAuditResult,
): string[] {
  const presentation = presentMediaFileSpecSummary(
    result.summary,
  );

  return [
    `${presentation.label} · ${presentation.title}`,
    describeMediaFileSpecRoleCounts(
      "audio-master",
      result.summary.roles["audio-master"],
    ),
    describeMediaFileSpecRoleCounts(
      "artwork-master",
      result.summary.roles["artwork-master"],
    ),
    describeMediaFileSpecRoleCounts(
      "video-master",
      result.summary.roles["video-master"],
    ),
  ];
}

export function formatMediaFileSpecExtensionInventory(
  result: MediaFileSpecAuditResult,
): string[] {
  const labelForRole = (
    role: CanonicalMediaMasterRole,
  ): string =>
    role === "audio-master"
      ? "Audio formats"
      : role === "artwork-master"
        ? "Artwork formats"
        : "Video formats";

  return (
    [
      "audio-master",
      "artwork-master",
      "video-master",
    ] as const
  ).map((role) => {
    const inventory = result.summary.extensions[role];

    if (inventory.length === 0) {
      return `${labelForRole(role)}: none`;
    }

    const entries = inventory.map((entry) => {
      const classLabel =
        entry.unsupported > 0
          ? "outside spec"
          : entry.compatible > 0
            ? "compatible"
            : "preferred";
      const nameReview =
        entry.nonCanonicalNames > 0
          ? ` · ${entry.nonCanonicalNames} filename review`
          : "";

      return `${entry.extension} ${entry.total} ${classLabel}${nameReview}`;
    });

    return `${labelForRole(role)}: ${entries.join(" · ")}`;
  });
}

export function mediaFileSpecAuditIssueItems(
  result: MediaFileSpecAuditResult,
): MediaFileSpecAuditItem[] {
  return result.items.filter(
    (item) =>
      item.formatClass === "unsupported" ||
      !item.canonicalName,
  );
}
