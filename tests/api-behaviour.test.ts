import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test, { after, before } from "node:test";

import { parse } from "smol-toml";

import {
  fixtureReleaseId,
  fixtureTrackIds,
  requestJson,
  startApiFixture,
  type ApiFixture,
} from "./support/api-server.js";

let api: ApiFixture;

before(async () => {
  api = await startApiFixture();
});

after(async () => {
  await api?.stop();
});

type DetailDocument = {
  filename: string;
  relativePath: string;
  scope: string;
  trackId?: string;
  sha256: string;
  parsed: Record<string, any>;
};

async function releaseDocument(
  filename: string,
  trackId?: string,
): Promise<DetailDocument> {
  const { status, body } = await requestJson(
    api,
    `/api/library/release-detail?release=${fixtureReleaseId}`,
  );
  assert.equal(status, 200);

  const document = (body.documents as DetailDocument[]).find(
    (candidate) =>
      candidate.filename === filename &&
      candidate.trackId === trackId,
  );
  assert.ok(document, `${filename} should be in release detail`);
  return document;
}

test("health, registry, and unknown routes answer from the dispatcher", async () => {
  assert.deepEqual(await requestJson(api, "/api/health"), {
    status: 200,
    body: { status: "ok" },
  });

  const registry = await requestJson(api, "/api/metadata/registry");
  assert.equal(registry.status, 200);
  assert.ok(
    JSON.stringify(registry.body).includes(
      "release.provenance.origin",
    ),
  );

  assert.deepEqual(await requestJson(api, "/api/does-not-exist"), {
    status: 404,
    body: { error: "Not found" },
  });
  // Routes match on method as well as path.
  assert.equal(
    (await requestJson(api, "/api/health", { method: "POST", body: {} }))
      .status,
    404,
  );
});

test("Library scan and release detail describe the files on disk", async () => {
  const scan = await requestJson(api, "/api/library/scan");
  assert.equal(scan.status, 200);
  assert.equal(scan.body.mediaRoot, api.mediaRoot);

  const release = scan.body.releases.find(
    (candidate: { id: string }) => candidate.id === fixtureReleaseId,
  );
  assert.equal(release.releaseTitle, "API Behaviour");
  assert.deepEqual(
    release.tracks.map((track: { id: string }) => track.id),
    [...fixtureTrackIds],
  );

  const document = await releaseDocument("release.toml");
  assert.equal(document.scope, "release");
  assert.equal(document.parsed.release.title, "API Behaviour");

  const missing = await requestJson(api, "/api/library/release-detail");
  assert.equal(missing.status, 400);
});

test("adding and saving a metadata field writes verified TOML with a backup", async () => {
  const releaseToml = path.join(api.releasePath, "release.toml");
  const before = await releaseDocument("release.toml");

  const created = await requestJson(
    api,
    "/api/library/create-metadata-fields",
    {
      method: "POST",
      body: {
        releaseId: fixtureReleaseId,
        relativePath: before.relativePath,
        originalSha256: before.sha256,
        changes: [{ path: "release.provenance.origin", value: "" }],
      },
    },
  );
  assert.equal(created.status, 200, JSON.stringify(created.body));
  assert.equal(created.body.previousSha256, before.sha256);

  const afterCreate = await releaseDocument("release.toml");
  assert.equal(afterCreate.sha256, created.body.savedSha256);
  assert.equal(afterCreate.parsed.release.provenance.origin, "");

  const saved = await requestJson(
    api,
    "/api/library/save-scalar-metadata",
    {
      method: "POST",
      body: {
        releaseId: fixtureReleaseId,
        relativePath: afterCreate.relativePath,
        originalSha256: afterCreate.sha256,
        changes: [
          { path: "release.provenance.origin", value: "human" },
        ],
      },
    },
  );
  assert.equal(saved.status, 200, JSON.stringify(saved.body));

  const onDisk = parse(await readFile(releaseToml, "utf8")) as any;
  assert.equal(onDisk.release.provenance.origin, "human");
  assert.equal(onDisk.release.title, "API Behaviour");

  const backups = await readdir(
    path.join(api.releasePath, ".metadata-backups"),
  );
  assert.ok(
    backups.some((name) => name.startsWith("release.toml.")),
    "saving keeps a backup of the previous file",
  );
});

test("a save based on a stale file version is refused and changes nothing", async () => {
  const trackId = fixtureTrackIds[0];
  const document = await releaseDocument("track.toml", trackId);
  const trackToml = path.join(
    api.releasePath,
    "tracks",
    trackId,
    "track.toml",
  );
  const contentBefore = await readFile(trackToml, "utf8");

  const refused = await requestJson(
    api,
    "/api/library/save-scalar-metadata",
    {
      method: "POST",
      body: {
        releaseId: fixtureReleaseId,
        relativePath: document.relativePath,
        originalSha256: "0".repeat(64),
        changes: [{ path: "track.title", value: "Overwritten" }],
      },
    },
  );

  assert.ok(
    refused.status >= 400 && refused.status < 500,
    `expected a client error, received ${refused.status}`,
  );
  assert.equal(typeof refused.body.error, "string");
  assert.equal(await readFile(trackToml, "utf8"), contentBefore);
});

test("a save cannot target a path that is not an existing field", async () => {
  const document = await releaseDocument(
    "track.toml",
    fixtureTrackIds[1],
  );

  const refused = await requestJson(
    api,
    "/api/library/save-scalar-metadata",
    {
      method: "POST",
      body: {
        releaseId: fixtureReleaseId,
        relativePath: document.relativePath,
        originalSha256: document.sha256,
        changes: [{ path: "track.does_not_exist", value: "x" }],
      },
    },
  );

  assert.ok(refused.status >= 400 && refused.status < 500);
  assert.equal(
    (await releaseDocument("track.toml", fixtureTrackIds[1])).sha256,
    document.sha256,
  );
});

test("requests cannot reach outside the Library root", async () => {
  const refused = await requestJson(
    api,
    "/api/library/save-scalar-metadata",
    {
      method: "POST",
      body: {
        releaseId: fixtureReleaseId,
        relativePath: "../../outside.toml",
        originalSha256: "0".repeat(64),
        changes: [{ path: "release.title", value: "x" }],
      },
    },
  );

  assert.ok(refused.status >= 400 && refused.status < 500);
  await assert.rejects(
    readFile(path.join(api.workspace, "outside.toml")),
  );
});

test("publish planning is read-only and writes nothing to the published root", async () => {
  const plan = await requestJson(
    api,
    `/api/publish/plan?release=${fixtureReleaseId}`,
  );

  assert.equal(plan.status, 200);
  assert.equal(plan.body.releaseId, fixtureReleaseId);
  assert.equal(plan.body.readOnly, true);
  assert.equal(plan.body.destinationRoot, api.publishRoot);
  assert.deepEqual(await readdir(api.publishRoot), []);
});
