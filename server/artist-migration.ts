import {
  constants,
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  realpath,
  rename,
  unlink,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { parse, stringify } from "smol-toml";

import {
  assertPathWithinRoot,
  toLibraryRelativePath,
} from "./media-root.js";

export type InitialArtistDefinition = {
  id: string;
  slug: string;
  displayName: string;
  sortName: string;
};

export type InitialReleaseArtistAssignment = {
  releaseId: string;
  artistId: string;
  expectedArtistName: string;
};

export const INITIAL_ARTISTS: readonly InitialArtistDefinition[] = [
  { id: "artist_crazy_eights", slug: "crazy-eights", displayName: "Crazy Eights", sortName: "Crazy Eights" },
  { id: "artist_dead_to_myself", slug: "dead-to-myself", displayName: "Dead To Myself", sortName: "Dead To Myself" },
  { id: "artist_nathan_brenton", slug: "nathan-brenton", displayName: "Nathan Brenton", sortName: "Brenton, Nathan" },
  { id: "artist_nobodies", slug: "nobodies", displayName: "nobodies", sortName: "nobodies" },
] as const;

export const INITIAL_RELEASE_ARTIST_ASSIGNMENTS:
  readonly InitialReleaseArtistAssignment[] = [
    { releaseId: "2008-10-24_yours", artistId: "artist_nathan_brenton", expectedArtistName: "Nathan Brenton" },
    { releaseId: "2009-05-01_gateway", artistId: "artist_nathan_brenton", expectedArtistName: "Nathan Brenton" },
    { releaseId: "2014-07-05_summer-grafffiti", artistId: "artist_crazy_eights", expectedArtistName: "Crazy Eights" },
    { releaseId: "2016-07-27_cleaning-house", artistId: "artist_crazy_eights", expectedArtistName: "Crazy Eights" },
    { releaseId: "2016-10-23_indoor-lightning", artistId: "artist_crazy_eights", expectedArtistName: "Crazy Eights" },
    { releaseId: "2016-11-10_double-shuffle", artistId: "artist_crazy_eights", expectedArtistName: "Crazy Eights" },
    { releaseId: "2016-11-17_we-share-a-wall", artistId: "artist_crazy_eights", expectedArtistName: "Crazy Eights" },
    { releaseId: "2018-07-27_direct-injection", artistId: "artist_crazy_eights", expectedArtistName: "Crazy Eights" },
    { releaseId: "2018-09-02_method-to-the-badness", artistId: "artist_crazy_eights", expectedArtistName: "Crazy Eights" },
    { releaseId: "2021-01-30_feels", artistId: "artist_dead_to_myself", expectedArtistName: "Dead To Myself" },
    { releaseId: "2022-02-12_fushidara", artistId: "artist_nobodies", expectedArtistName: "nobodies" },
    { releaseId: "2025-01-02_cardillo", artistId: "artist_nathan_brenton", expectedArtistName: "Nathan Brenton" },
    { releaseId: "2025-08-31_killchain", artistId: "artist_nathan_brenton", expectedArtistName: "Nathan Brenton" },
  ] as const;

export type ArtistMigrationAction = "create" | "update" | "current" | "blocked";

export type ArtistMigrationPlanItem = {
  kind: "artist" | "release";
  id: string;
  relativePath: string;
  action: ArtistMigrationAction;
  reason: string;
};

export type ArtistMigrationPlan = {
  items: ArtistMigrationPlanItem[];
  summary: {
    createCount: number;
    updateCount: number;
    currentCount: number;
    blockedCount: number;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function exists(candidatePath: string): Promise<boolean> {
  try {
    await lstat(candidatePath);
    return true;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function readConfinedToml(
  mediaRoot: string,
  candidatePath: string,
): Promise<Record<string, unknown>> {
  /*
   * First confine the path using the caller's spelling of mediaRoot.
   * On macOS, /var may canonicalize to /private/var; comparing a
   * canonical root against a non-canonical candidate would falsely
   * report a valid path escape.
   *
   * After the lexical check, canonicalize both sides and perform the
   * containment check again so symlink escapes remain rejected.
   */
  const confined = assertPathWithinRoot(mediaRoot, candidatePath);
  const canonicalMediaRoot = await realpath(mediaRoot);
  const stats = await lstat(confined);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error("metadata path is not a regular file");
  }
  const canonicalPath = await realpath(confined);
  assertPathWithinRoot(canonicalMediaRoot, canonicalPath);
  const parsed = parse(await readFile(canonicalPath, "utf8"));
  if (!isRecord(parsed)) {
    throw new Error("TOML root is not a table");
  }
  return parsed;
}

function buildArtistDocument(artist: InitialArtistDefinition): string {
  const content = `${stringify({
    schema: { name: "artist-metadata", version: 1 },
    artist: {
      id: artist.id,
      slug: artist.slug,
      display_name: artist.displayName,
      sort_name: artist.sortName,
      primary_asset_id: "",
      assets: [],
    },
  }).trimEnd()}\n`;
  parse(content);
  return content;
}

function summarize(items: ArtistMigrationPlanItem[]): ArtistMigrationPlan["summary"] {
  return {
    createCount: items.filter(({ action }) => action === "create").length,
    updateCount: items.filter(({ action }) => action === "update").length,
    currentCount: items.filter(({ action }) => action === "current").length,
    blockedCount: items.filter(({ action }) => action === "blocked").length,
  };
}

export async function planArtistFoundationMigration(
  mediaRoot: string,
): Promise<ArtistMigrationPlan> {
  const items: ArtistMigrationPlanItem[] = [];
  const artistById = new Map(INITIAL_ARTISTS.map((artist) => [artist.id, artist]));

  for (const artist of INITIAL_ARTISTS) {
    const relativePath = `artists/${artist.slug}/artist.toml`;
    const target = assertPathWithinRoot(
      mediaRoot,
      path.join(mediaRoot, ...relativePath.split("/")),
    );

    if (!(await exists(target))) {
      items.push({
        kind: "artist",
        id: artist.id,
        relativePath,
        action: "create",
        reason: `Create canonical Artist identity for ${artist.displayName}`,
      });
      continue;
    }

    try {
      const parsed = await readConfinedToml(mediaRoot, target);
      const table = isRecord(parsed.artist) ? parsed.artist : null;
      const matches = Boolean(
        table &&
        table.id === artist.id &&
        table.slug === artist.slug &&
        table.display_name === artist.displayName,
      );
      items.push({
        kind: "artist",
        id: artist.id,
        relativePath,
        action: matches ? "current" : "blocked",
        reason: matches
          ? "Artist identity already matches"
          : "Existing artist.toml does not match the deterministic migration identity",
      });
    } catch (error) {
      items.push({
        kind: "artist",
        id: artist.id,
        relativePath,
        action: "blocked",
        reason: error instanceof Error ? error.message : "Artist metadata could not be read",
      });
    }
  }

  for (const assignment of INITIAL_RELEASE_ARTIST_ASSIGNMENTS) {
    const artist = artistById.get(assignment.artistId);
    const relativePath = `releases/${assignment.releaseId}/release.toml`;
    const target = assertPathWithinRoot(
      mediaRoot,
      path.join(mediaRoot, ...relativePath.split("/")),
    );

    if (!artist || !(await exists(target))) {
      items.push({
        kind: "release",
        id: assignment.releaseId,
        relativePath,
        action: "blocked",
        reason: !artist
          ? `Migration Artist ${assignment.artistId} is not defined`
          : "Expected canonical release.toml is missing",
      });
      continue;
    }

    try {
      const parsed = await readConfinedToml(mediaRoot, target);
      const release = isRecord(parsed.release) ? parsed.release : null;
      const primaryArtist = release && isRecord(release.primary_artist)
        ? release.primary_artist
        : null;
      const currentName = typeof primaryArtist?.name === "string"
        ? primaryArtist.name
        : "";
      const currentId = typeof primaryArtist?.id === "string"
        ? primaryArtist.id
        : "";

      if (currentName !== assignment.expectedArtistName) {
        items.push({
          kind: "release",
          id: assignment.releaseId,
          relativePath,
          action: "blocked",
          reason: `Expected release artist ${assignment.expectedArtistName}; found ${currentName || "(blank)"}`,
        });
      } else if (!currentId) {
        items.push({
          kind: "release",
          id: assignment.releaseId,
          relativePath,
          action: "update",
          reason: `Add stable Artist reference ${artist.id}`,
        });
      } else if (currentId === artist.id) {
        items.push({
          kind: "release",
          id: assignment.releaseId,
          relativePath,
          action: "current",
          reason: "Release already references the expected Artist",
        });
      } else {
        items.push({
          kind: "release",
          id: assignment.releaseId,
          relativePath,
          action: "blocked",
          reason: `Existing Artist reference ${currentId} conflicts with ${artist.id}`,
        });
      }
    } catch (error) {
      items.push({
        kind: "release",
        id: assignment.releaseId,
        relativePath,
        action: "blocked",
        reason: error instanceof Error ? error.message : "Release metadata could not be read",
      });
    }
  }

  return { items, summary: summarize(items) };
}

async function writeNewFileAtomically(
  mediaRoot: string,
  relativePath: string,
  content: string,
): Promise<void> {
  parse(content);
  const canonicalMediaRoot = await realpath(mediaRoot);
  const target = assertPathWithinRoot(
    canonicalMediaRoot,
    path.join(canonicalMediaRoot, ...relativePath.split("/")),
  );
  const parent = path.dirname(target);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  const canonicalParent = await realpath(parent);
  assertPathWithinRoot(canonicalMediaRoot, canonicalParent);
  const handle = await open(target, "wx", 0o600);
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function updateReleaseArtistId(
  mediaRoot: string,
  assignment: InitialReleaseArtistAssignment,
): Promise<string> {
  const canonicalMediaRoot = await realpath(mediaRoot);
  const relativePath = `releases/${assignment.releaseId}/release.toml`;
  const target = assertPathWithinRoot(
    canonicalMediaRoot,
    path.join(canonicalMediaRoot, ...relativePath.split("/")),
  );
  const parsed = parse(await readFile(target, "utf8"));
  if (!isRecord(parsed)) {
    throw new Error(`${relativePath}: TOML root is not a table`);
  }
  const release = isRecord(parsed.release) ? parsed.release : null;
  const primaryArtist = release && isRecord(release.primary_artist)
    ? release.primary_artist
    : null;
  if (!primaryArtist || primaryArtist.name !== assignment.expectedArtistName) {
    throw new Error(`${relativePath}: release artist changed after migration planning`);
  }
  const currentId = typeof primaryArtist.id === "string" ? primaryArtist.id : "";
  if (currentId && currentId !== assignment.artistId) {
    throw new Error(`${relativePath}: Artist ID changed after migration planning`);
  }
  if (currentId === assignment.artistId) {
    return "";
  }

  primaryArtist.id = assignment.artistId;
  const nextContent = `${stringify(parsed).trimEnd()}\n`;
  parse(nextContent);

  const backupDirectory = assertPathWithinRoot(
    canonicalMediaRoot,
    path.join(path.dirname(target), ".metadata-backups"),
  );
  await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
  const canonicalBackupDirectory = await realpath(backupDirectory);
  assertPathWithinRoot(canonicalMediaRoot, canonicalBackupDirectory);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = assertPathWithinRoot(
    canonicalMediaRoot,
    path.join(
      canonicalBackupDirectory,
      `release.toml.artist-migration-${stamp}-${randomUUID()}.bak`,
    ),
  );
  await copyFile(target, backupPath, constants.COPYFILE_EXCL);

  const temporaryPath = assertPathWithinRoot(
    canonicalMediaRoot,
    path.join(path.dirname(target), `.release.toml.artist-migration-${randomUUID()}.tmp`),
  );
  let temporaryCreated = false;
  try {
    const handle = await open(temporaryPath, "wx", 0o600);
    temporaryCreated = true;
    try {
      await handle.writeFile(nextContent, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporaryPath, target);
    temporaryCreated = false;
  } finally {
    if (temporaryCreated) {
      await unlink(temporaryPath).catch(() => undefined);
    }
  }

  parse(await readFile(target, "utf8"));
  return toLibraryRelativePath(canonicalMediaRoot, backupPath);
}

export async function applyArtistFoundationMigration(
  mediaRoot: string,
): Promise<{
  createdArtists: string[];
  updatedReleases: Array<{ releaseId: string; backupRelativePath: string }>;
}> {
  const plan = await planArtistFoundationMigration(mediaRoot);
  if (plan.summary.blockedCount > 0) {
    throw new Error(
      `Artist migration is blocked by ${plan.summary.blockedCount} plan item(s)`,
    );
  }

  const createdArtists: string[] = [];
  const updatedReleases: Array<{ releaseId: string; backupRelativePath: string }> = [];

  for (const artist of INITIAL_ARTISTS) {
    const item = plan.items.find(
      (candidate) => candidate.kind === "artist" && candidate.id === artist.id,
    );
    if (item?.action !== "create") {
      continue;
    }
    await writeNewFileAtomically(mediaRoot, item.relativePath, buildArtistDocument(artist));
    createdArtists.push(item.relativePath);
  }

  for (const assignment of INITIAL_RELEASE_ARTIST_ASSIGNMENTS) {
    const item = plan.items.find(
      (candidate) => candidate.kind === "release" && candidate.id === assignment.releaseId,
    );
    if (item?.action !== "update") {
      continue;
    }
    const backupRelativePath = await updateReleaseArtistId(mediaRoot, assignment);
    if (backupRelativePath) {
      updatedReleases.push({ releaseId: assignment.releaseId, backupRelativePath });
    }
  }

  return { createdArtists, updatedReleases };
}
