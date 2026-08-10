import {
  createHash,
} from "node:crypto";
import {
  lstat,
  readFile,
} from "node:fs/promises";
import {
  createReadStream,
} from "node:fs";
import path from "node:path";

import {
  assertPathWithinRoot,
} from "../media-root.js";
import type {
  DiscoveredAsset,
  ReleaseScanResult,
} from "../types.js";
import {
  selectPreferredArtworkCandidate,
} from "../../shared/artwork-preference.js";

const directBrowserArtworkExtensions = new Set([
  ".avif",
  ".gif",
  ".jpeg",
  ".jpg",
  ".png",
  ".webp",
]);

const convertibleArtworkExtensions = new Set([
  ".tif",
  ".tiff",
]);

export type BrowserArtworkProfile = {
  schema: {
    name: "metadata-editor-browser-artwork-profile";
    version: 1;
  };
  format: "png";
  filename: "artwork.png";
  frameCount: 1;
  stripMetadata: true;
};

export type BrowserArtworkInfo = {
  schema: {
    name: "metadata-editor-browser-artwork";
    version: 1;
  };
  generatedAt: string;
  source: {
    relativePath: string;
    sizeBytes: number;
    sha256: string;
  };
  profile: BrowserArtworkProfile & {
    sha256: string;
  };
  output: {
    relativePath: string;
    format: "png";
  };
};

export type BrowserArtworkPlan = {
  releaseId: string;
  status:
    | "not-needed"
    | "current"
    | "missing"
    | "stale"
    | "blocked";
  action: "none" | "create" | "replace" | "blocked";
  reason: string;
  master?: DiscoveredAsset;
  outputRelativePath: string;
  infoRelativePath: string;
  outputExists: boolean;
  infoExists: boolean;
  sourceSizeBytes?: number;
  sourceSha256?: string;
  profile: BrowserArtworkProfile;
  profileSha256: string;
};

function rootPath(
  root: string,
  relativePath: string,
): string {
  return assertPathWithinRoot(
    root,
    path.resolve(
      root,
      ...relativePath
        .replaceAll("\\", "/")
        .split("/")
        .filter(Boolean),
    ),
  );
}

async function inspectRegularFile(
  root: string,
  relativePath: string,
): Promise<{
  exists: boolean;
  sizeBytes?: number;
  sha256?: string;
}> {
  const absolutePath = rootPath(root, relativePath);

  try {
    const stats = await lstat(absolutePath);
    if (
      stats.isSymbolicLink() ||
      !stats.isFile() ||
      stats.size <= 0
    ) {
      return { exists: false };
    }

    const hash = createHash("sha256");
    await new Promise<void>((resolve, reject) => {
      const stream = createReadStream(absolutePath);
      stream.on("data", (chunk) => hash.update(chunk));
      stream.on("error", reject);
      stream.on("end", resolve);
    });

    return {
      exists: true,
      sizeBytes: stats.size,
      sha256: hash.digest("hex"),
    };
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return { exists: false };
    }

    throw error;
  }
}

export function buildBrowserArtworkProfile(): BrowserArtworkProfile {
  return {
    schema: {
      name: "metadata-editor-browser-artwork-profile",
      version: 1,
    },
    format: "png",
    filename: "artwork.png",
    frameCount: 1,
    stripMetadata: true,
  };
}

export function hashBrowserArtworkProfile(
  profile: BrowserArtworkProfile,
): string {
  return createHash("sha256")
    .update(JSON.stringify(profile))
    .digest("hex");
}

export function buildBrowserArtworkFfmpegArgs(
  inputPath: string,
  outputPath: string,
): string[] {
  return [
    "-v",
    "error",
    "-nostdin",
    "-y",
    "-i",
    inputPath,
    "-frames:v",
    "1",
    "-an",
    "-map_metadata",
    "-1",
    outputPath,
  ];
}

export function buildBrowserArtworkVerificationArgs(
  outputPath: string,
): string[] {
  return [
    "-v",
    "error",
    "-nostdin",
    "-i",
    outputPath,
    "-frames:v",
    "1",
    "-f",
    "null",
    "-",
  ];
}

function generatedArtworkPaths(
  release: ReleaseScanResult,
): {
  outputRelativePath: string;
  infoRelativePath: string;
} {
  return {
    outputRelativePath: path.posix.join(
      release.relativePath,
      "artwork/front/artwork.png",
    ),
    infoRelativePath: path.posix.join(
      release.relativePath,
      "artwork/front/artwork-info.json",
    ),
  };
}

async function readArtworkInfo(
  mediaRoot: string,
  relativePath: string,
): Promise<BrowserArtworkInfo | null> {
  const absolutePath = rootPath(mediaRoot, relativePath);

  try {
    const stats = await lstat(absolutePath);
    if (stats.isSymbolicLink() || !stats.isFile()) {
      return null;
    }

    const parsed = JSON.parse(
      await readFile(absolutePath, "utf8"),
    ) as BrowserArtworkInfo;

    if (
      parsed?.schema?.name !== "metadata-editor-browser-artwork" ||
      parsed.schema.version !== 1 ||
      typeof parsed.source?.relativePath !== "string" ||
      typeof parsed.source?.sizeBytes !== "number" ||
      typeof parsed.source?.sha256 !== "string" ||
      typeof parsed.profile?.sha256 !== "string" ||
      typeof parsed.output?.relativePath !== "string"
    ) {
      return null;
    }

    return parsed;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return null;
    }

    if (error instanceof SyntaxError) {
      return null;
    }

    throw error;
  }
}

export async function buildBrowserArtworkPlan(
  mediaRoot: string,
  release: ReleaseScanResult,
): Promise<BrowserArtworkPlan> {
  const profile = buildBrowserArtworkProfile();
  const profileSha256 = hashBrowserArtworkProfile(profile);
  const {
    outputRelativePath,
    infoRelativePath,
  } = generatedArtworkPaths(release);
  const outputInspection = await inspectRegularFile(
    mediaRoot,
    outputRelativePath,
  );
  const infoInspection = await inspectRegularFile(
    mediaRoot,
    infoRelativePath,
  );
  const master = selectPreferredArtworkCandidate(
    release.artworkMasters,
  );

  if (!master) {
    return {
      releaseId: release.id,
      status: "blocked",
      action: "blocked",
      reason:
        "No canonical release artwork master is available for browser-artwork preparation.",
      outputRelativePath,
      infoRelativePath,
      outputExists: outputInspection.exists,
      infoExists: infoInspection.exists,
      profile,
      profileSha256,
    };
  }

  const extension = master.extension.toLowerCase();
  if (directBrowserArtworkExtensions.has(extension)) {
    return {
      releaseId: release.id,
      status: "not-needed",
      action: "none",
      reason:
        "The canonical release artwork master is already browser-compatible.",
      master,
      outputRelativePath,
      infoRelativePath,
      outputExists: outputInspection.exists,
      infoExists: infoInspection.exists,
      profile,
      profileSha256,
    };
  }

  if (!convertibleArtworkExtensions.has(extension)) {
    return {
      releaseId: release.id,
      status: "blocked",
      action: "blocked",
      reason:
        `Canonical release artwork ${master.filename} is not a supported browser-artwork preparation source.`,
      master,
      outputRelativePath,
      infoRelativePath,
      outputExists: outputInspection.exists,
      infoExists: infoInspection.exists,
      profile,
      profileSha256,
    };
  }

  const sourceInspection = await inspectRegularFile(
    mediaRoot,
    master.relativePath,
  );
  if (
    !sourceInspection.exists ||
    sourceInspection.sizeBytes === undefined ||
    !sourceInspection.sha256
  ) {
    return {
      releaseId: release.id,
      status: "blocked",
      action: "blocked",
      reason:
        "The canonical TIFF artwork master is missing or is not a safe regular file.",
      master,
      outputRelativePath,
      infoRelativePath,
      outputExists: outputInspection.exists,
      infoExists: infoInspection.exists,
      profile,
      profileSha256,
    };
  }

  if (!outputInspection.exists) {
    return {
      releaseId: release.id,
      status: "missing",
      action: "create",
      reason:
        "The browser-compatible artwork derivative has not been generated yet.",
      master,
      outputRelativePath,
      infoRelativePath,
      outputExists: false,
      infoExists: infoInspection.exists,
      sourceSizeBytes: sourceInspection.sizeBytes,
      sourceSha256: sourceInspection.sha256,
      profile,
      profileSha256,
    };
  }

  const info = await readArtworkInfo(
    mediaRoot,
    infoRelativePath,
  );
  const current = Boolean(
    info &&
    info.source.relativePath === master.relativePath &&
    info.source.sizeBytes === sourceInspection.sizeBytes &&
    info.source.sha256 === sourceInspection.sha256 &&
    info.profile.sha256 === profileSha256 &&
    info.output.relativePath === outputRelativePath,
  );

  return {
    releaseId: release.id,
    status: current ? "current" : "stale",
    action: current ? "none" : "replace",
    reason: current
      ? "The browser-compatible artwork derivative matches the canonical TIFF master and current preparation profile."
      : "The browser-compatible artwork derivative is stale or its generation sidecar is missing/invalid.",
    master,
    outputRelativePath,
    infoRelativePath,
    outputExists: true,
    infoExists: infoInspection.exists,
    sourceSizeBytes: sourceInspection.sizeBytes,
    sourceSha256: sourceInspection.sha256,
    profile,
    profileSha256,
  };
}

export function buildBrowserArtworkInfo(
  plan: BrowserArtworkPlan,
  generatedAt: string,
): BrowserArtworkInfo {
  if (
    !plan.master ||
    plan.sourceSizeBytes === undefined ||
    !plan.sourceSha256
  ) {
    throw new Error(
      "Browser artwork info requires one resolved canonical source fingerprint.",
    );
  }

  return {
    schema: {
      name: "metadata-editor-browser-artwork",
      version: 1,
    },
    generatedAt,
    source: {
      relativePath: plan.master.relativePath,
      sizeBytes: plan.sourceSizeBytes,
      sha256: plan.sourceSha256,
    },
    profile: {
      ...plan.profile,
      sha256: plan.profileSha256,
    },
    output: {
      relativePath: plan.outputRelativePath,
      format: "png",
    },
  };
}

export function browserArtworkAssetFromPlan(
  plan: BrowserArtworkPlan,
): DiscoveredAsset | null {
  if (plan.status !== "current") {
    return null;
  }

  return {
    filename: path.posix.basename(
      plan.outputRelativePath,
    ),
    relativePath: plan.outputRelativePath,
    extension: ".png",
  };
}
