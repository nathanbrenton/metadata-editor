import {
  access,
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
};

export type WorkflowLocations = {
  locations: WorkflowLocation[];
  publishState: "planned";
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
    process.env.MEDIA_LIBRARY_ROOT ?? "../demo-media";
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

  return {
    publishState: "planned",
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
        label: "Release workspace",
        purpose: "Reviewed copies and staging updates",
        configuredPath: stagingConfigured,
        absolutePath: stagingAbsolute,
        displayPath: displayPathFor(stagingAbsolute),
        exists: true,
        writeEnabled: true,
      },
      {
        id: "library",
        label: "Canonical library",
        purpose: "Private metadata and media authoring",
        configuredPath: libraryConfigured,
        absolutePath: libraryAbsolute,
        displayPath: displayPathFor(libraryAbsolute),
        exists: true,
        writeEnabled: true,
      },
      {
        id: "publish",
        label: "Public output",
        purpose: "Planned sanitized player-facing snapshot",
        configuredPath: publishConfigured,
        absolutePath: publish.absolutePath,
        displayPath: displayPathFor(publish.absolutePath),
        exists: publish.exists,
        writeEnabled: false,
      },
    ],
  };
}
