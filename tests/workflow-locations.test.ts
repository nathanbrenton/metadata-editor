import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  readWorkflowLocations,
} from "../server/workflow-locations.js";

test("reports configured private roots and an available public output", async () => {
  const temporaryRoot = await mkdtemp(
    path.join(os.tmpdir(), "metadata-workflow-locations-"),
  );
  const ingestRoot = path.join(temporaryRoot, "ingest-drop");
  const stagingRoot = path.join(temporaryRoot, "staging-media");
  const libraryRoot = path.join(temporaryRoot, "library-media");
  const publishRoot = path.join(temporaryRoot, "published-media");
  const previous = {
    ingest: process.env.INGEST_ROOT,
    staging: process.env.INGEST_OUTPUT_ROOT,
    library: process.env.MEDIA_LIBRARY_ROOT,
    publish: process.env.PUBLISHED_MEDIA_ROOT,
  };

  try {
    await Promise.all([
      mkdir(ingestRoot),
      mkdir(stagingRoot),
      mkdir(libraryRoot),
    ]);
    process.env.INGEST_ROOT = ingestRoot;
    process.env.INGEST_OUTPUT_ROOT = stagingRoot;
    process.env.MEDIA_LIBRARY_ROOT = libraryRoot;
    process.env.PUBLISHED_MEDIA_ROOT = publishRoot;

    const result = await readWorkflowLocations();
    const byId = new Map(
      result.locations.map((location) => [location.id, location]),
    );

    assert.equal(result.publishState, "available");
    assert.equal(
      byId.get("ingest")?.absolutePath,
      await realpath(ingestRoot),
    );
    assert.equal(byId.get("ingest")?.writeEnabled, false);
    assert.equal(
      byId.get("staging")?.absolutePath,
      await realpath(stagingRoot),
    );
    assert.equal(byId.get("staging")?.writeEnabled, true);
    assert.equal(
      byId.get("library")?.absolutePath,
      await realpath(libraryRoot),
    );
    assert.equal(byId.get("library")?.writeEnabled, true);
    assert.equal(byId.get("publish")?.absolutePath, publishRoot);
    assert.equal(byId.get("publish")?.exists, false);
    assert.equal(byId.get("publish")?.writeEnabled, true);
  } finally {
    if (previous.ingest === undefined) delete process.env.INGEST_ROOT;
    else process.env.INGEST_ROOT = previous.ingest;
    if (previous.staging === undefined) delete process.env.INGEST_OUTPUT_ROOT;
    else process.env.INGEST_OUTPUT_ROOT = previous.staging;
    if (previous.library === undefined) delete process.env.MEDIA_LIBRARY_ROOT;
    else process.env.MEDIA_LIBRARY_ROOT = previous.library;
    if (previous.publish === undefined) delete process.env.PUBLISHED_MEDIA_ROOT;
    else process.env.PUBLISHED_MEDIA_ROOT = previous.publish;

    await rm(temporaryRoot, {
      recursive: true,
      force: true,
    });
  }
});
