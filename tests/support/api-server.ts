import { spawn, type ChildProcess } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

/*
 * Behaviour-test harness: boots the real metadata-editor API as a child
 * process against a throwaway Library, so tests exercise actual HTTP
 * requests and actual files instead of asserting on source text.
 */
const projectRoot = fileURLToPath(new URL("../../", import.meta.url));

export const fixtureReleaseId = "2026-08-01_api-behaviour";
export const fixtureTrackIds = [
  "artist_01_first-track",
  "artist_02_second-track",
] as const;

export type ApiFixture = {
  baseUrl: string;
  workspace: string;
  mediaRoot: string;
  publishRoot: string;
  releasePath: string;
  stop: () => Promise<void>;
};

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port =
        typeof address === "object" && address ? address.port : 0;
      probe.close(() => resolve(port));
    });
  });
}

async function writeLibraryFixture(mediaRoot: string): Promise<string> {
  const releasePath = path.join(
    mediaRoot,
    "releases",
    fixtureReleaseId,
  );

  await mkdir(path.join(releasePath, "artwork", "front"), {
    recursive: true,
  });
  await writeFile(
    path.join(releasePath, "release.toml"),
    [
      "[schema]",
      'name = "audio-release-metadata"',
      "version = 1",
      "",
      "[release]",
      `id = "${fixtureReleaseId}"`,
      'title = "API Behaviour"',
      'type = "EP"',
      "",
      "[release.primary_artist]",
      'name = "Artist"',
      "",
      "[release.dates]",
      'release = "2026-08-01"',
      'original_release = ""',
      "",
      "[release.numbering]",
      "track_total = 2",
      "disc_total = 1",
      "",
    ].join("\n"),
  );
  await writeFile(
    path.join(releasePath, "release-settings.toml"),
    `[release_reference]\nrelease_id = "${fixtureReleaseId}"\n`,
  );
  await writeFile(
    path.join(releasePath, "release-production-notes.toml"),
    `[release_reference]\nrelease_id = "${fixtureReleaseId}"\n`,
  );
  await writeFile(
    path.join(releasePath, "artwork", "front", "artwork-master.png"),
    Buffer.from("png"),
  );

  for (const [index, trackId] of fixtureTrackIds.entries()) {
    const trackPath = path.join(releasePath, "tracks", trackId);

    await mkdir(trackPath, { recursive: true });
    await writeFile(
      path.join(trackPath, "audio-master.wav"),
      Buffer.from("audio"),
    );
    await writeFile(
      path.join(trackPath, "track.toml"),
      [
        "[release_reference]",
        `release_id = "${fixtureReleaseId}"`,
        "",
        "[track]",
        `id = "${trackId}"`,
        `title = "Track ${index + 1}"`,
        "explicit = false",
        "",
        "[track.numbering]",
        `track_number = ${index + 1}`,
        "track_total = 2",
        "disc_number = 1",
        "disc_total = 1",
        "",
      ].join("\n"),
    );
    await writeFile(
      path.join(trackPath, "track-credits.toml"),
      `[track_reference]\ntrack_id = "${trackId}"\n`,
    );
    await writeFile(
      path.join(trackPath, "track-production-notes.toml"),
      `[track_reference]\ntrack_id = "${trackId}"\n`,
    );
  }

  return releasePath;
}

async function waitUntilHealthy(
  baseUrl: string,
  child: ChildProcess,
  output: () => string,
): Promise<void> {
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `API exited before becoming healthy:\n${output()}`,
      );
    }

    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Not listening yet.
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`API did not become healthy:\n${output()}`);
}

export async function startApiFixture(): Promise<ApiFixture> {
  const workspace = await realpath(
    await mkdtemp(path.join(os.tmpdir(), "metadata-editor-api-")),
  );
  const mediaRoot = path.join(workspace, "media-library");
  const publishRoot = path.join(workspace, "published-media");
  const ingestRoot = path.join(workspace, "ingest-drop");

  await mkdir(ingestRoot, { recursive: true });
  await mkdir(publishRoot, { recursive: true });
  const releasePath = await writeLibraryFixture(mediaRoot);
  const port = await findFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  let log = "";
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "server/index.ts"],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        METADATA_EDITOR_PORT: String(port),
        MEDIA_LIBRARY_ROOT: mediaRoot,
        INGEST_OUTPUT_ROOT: mediaRoot,
        INGEST_ROOT: ingestRoot,
        PUBLISHED_MEDIA_ROOT: publishRoot,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  child.stdout?.on("data", (chunk) => (log += String(chunk)));
  child.stderr?.on("data", (chunk) => (log += String(chunk)));

  const stop = async () => {
    if (child.exitCode === null) {
      const exited = new Promise((resolve) =>
        child.once("exit", resolve),
      );
      child.kill();
      await exited;
    }

    await rm(workspace, { recursive: true, force: true });
  };

  try {
    await waitUntilHealthy(baseUrl, child, () => log);
  } catch (error) {
    await stop();
    throw error;
  }

  return {
    baseUrl,
    workspace,
    mediaRoot,
    publishRoot,
    releasePath,
    stop,
  };
}

export async function requestJson(
  fixture: ApiFixture,
  pathname: string,
  init?: { method?: string; body?: unknown },
): Promise<{ status: number; body: any }> {
  const response = await fetch(`${fixture.baseUrl}${pathname}`, {
    method: init?.method ?? "GET",
    ...(init?.body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(init.body),
        }),
  });

  return {
    status: response.status,
    body: await response.json(),
  };
}
