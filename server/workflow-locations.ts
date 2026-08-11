import {
  access,
  lstat,
  readdir,
  realpath,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  defaultIngestOutputRoot,
  resolveIngestOutputRoot,
} from "./ingest-builder.js";
import {
  defaultIngestRoot,
  resolveIngestRoot,
} from "./ingest-root.js";
import {
  defaultMediaLibraryRoot,
  resolveMediaRoot,
} from "./media-root.js";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

export const defaultPublishRoot = "../published-media";

export type WorkflowLocation = {
  id: "ingest" | "staging" | "library" | "publish";
  label: string;
  purpose: string;
  configuredPath: string;
  absolutePath: string;
  displayPath: string;
  exists: boolean;
  writeEnabled: boolean;
  sizeBytes?: number;
};

export type WorkflowLocations = {
  locations: WorkflowLocation[];
  publishState: "available";
};

function displayPathFor(absolutePath: string): string {
  const home = os.homedir();

  if (absolutePath === home) {
    return "~";
  }

  if (absolutePath.startsWith(`${home}${path.sep}`)) {
    return `~${absolutePath.slice(home.length)}`;
  }

  return absolutePath;
}

async function pathExists(candidatePath: string): Promise<boolean> {
  try {
    await access(candidatePath);
    return true;
  } catch {
    return false;
  }
}

export async function directorySizeBytes(
  root: string,
): Promise<number> {
  let total = 0;

  const walk = async (candidatePath: string): Promise<void> => {
    let metadata: Awaited<ReturnType<typeof lstat>>;

    try {
      metadata = await lstat(candidatePath);
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return;
      }
      throw error;
    }

    if (metadata.isSymbolicLink()) {
      return;
    }

    if (metadata.isFile()) {
      total += metadata.size;
      return;
    }

    if (!metadata.isDirectory()) {
      return;
    }

    const entries = await readdir(candidatePath);
    for (const entry of entries) {
      await walk(path.join(candidatePath, entry));
    }
  };

  await walk(root);
  return total;
}

export async function resolveOptionalRoot(
  configuredRoot: string,
): Promise<{ absolutePath: string; exists: boolean }> {
  const candidate = path.resolve(projectRoot, configuredRoot);
  const exists = await pathExists(candidate);

  return {
    absolutePath: exists
      ? await realpath(candidate)
      : candidate,
    exists,
  };
}


export async function resolvePublishRoot(
  configuredRoot =
    process.env.PUBLISHED_MEDIA_ROOT ?? defaultPublishRoot,
): Promise<string> {
  const resolved = await resolveOptionalRoot(configuredRoot);
  return resolved.absolutePath;
}

export async function readWorkflowLocations(): Promise<WorkflowLocations> {
  const ingestConfigured =
    process.env.INGEST_ROOT ?? defaultIngestRoot;
  const stagingConfigured =
    process.env.INGEST_OUTPUT_ROOT ?? defaultIngestOutputRoot;
  const libraryConfigured =
    process.env.MEDIA_LIBRARY_ROOT ?? defaultMediaLibraryRoot;
  const publishConfigured =
    process.env.PUBLISHED_MEDIA_ROOT ?? defaultPublishRoot;

  const [
    ingestAbsolute,
    stagingAbsolute,
    libraryAbsolute,
    publish,
  ] = await Promise.all([
    resolveIngestRoot(ingestConfigured),
    resolveIngestOutputRoot(stagingConfigured),
    resolveMediaRoot(libraryConfigured),
    resolveOptionalRoot(publishConfigured),
  ]);

  const [librarySizeBytes, publishSizeBytes] =
    await Promise.all([
      directorySizeBytes(libraryAbsolute),
      publish.exists
        ? directorySizeBytes(publish.absolutePath)
        : Promise.resolve(0),
    ]);

  return {
    publishState: "available",
    locations: [
      {
        id: "ingest",
        label: "Source drop",
        purpose: "Read-only incoming source inspection",
        configuredPath: ingestConfigured,
        absolutePath: ingestAbsolute,
        displayPath: displayPathFor(ingestAbsolute),
        exists: true,
        writeEnabled: false,
      },
      {
        id: "staging",
        label: "Canonical library target",
        purpose: "Reviewed creates and updates into the private Library",
        configuredPath: stagingConfigured,
        absolutePath: stagingAbsolute,
        displayPath: displayPathFor(stagingAbsolute),
        exists: true,
        writeEnabled: true,
      },
      {
        id: "library",
        label: "Canonical library",
        purpose: "Long-term private release source of truth",
        configuredPath: libraryConfigured,
        absolutePath: libraryAbsolute,
        displayPath: displayPathFor(libraryAbsolute),
        exists: true,
        writeEnabled: true,
        sizeBytes: librarySizeBytes,
      },
      {
        id: "publish",
        label: "Public output",
        purpose: "Generated sanitized player-facing snapshots",
        configuredPath: publishConfigured,
        absolutePath: publish.absolutePath,
        displayPath: displayPathFor(publish.absolutePath),
        exists: publish.exists,
        writeEnabled: true,
        sizeBytes: publishSizeBytes,
      },
    ],
  };
}
