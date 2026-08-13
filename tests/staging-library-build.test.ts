import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildStagingLibraryBuildPlan,
  executeStagingLibraryBuild,
  STAGING_LIBRARY_BUILD_CONFIRMATION_PHRASE,
} from "../server/staging-library-build.js";

function createPcm16Wav(): Buffer {
  const sampleRate = 48_000;
  const channels = 1;
  const frameCount = 2_400;
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const dataSize = frameCount * blockAlign;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * blockAlign, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);

  for (let frame = 0; frame < frameCount; frame += 1) {
    buffer.writeInt16LE(
      Math.round(
        Math.sin((2 * Math.PI * 440 * frame) / sampleRate) * 20_000,
      ),
      44 + frame * blockAlign,
    );
  }

  return buffer;
}

async function createLibraryRelease(
  root: string,
): Promise<{
  releaseId: string;
  masterPath: string;
  waveformPath: string;
}> {
  const releaseId = "2026-08-13_waveform-repair";
  const trackPath = path.join(
    root,
    "releases",
    releaseId,
    "tracks",
    "01_track",
  );

  await mkdir(trackPath, { recursive: true });
  await mkdir(
    path.join(root, "releases", releaseId, "videos"),
    { recursive: true },
  );
  await mkdir(
    path.join(root, "releases", releaseId, "artwork"),
    { recursive: true },
  );

  const masterPath = path.join(trackPath, "audio-master.wav");
  const waveformPath = path.join(trackPath, "waveform-peaks.json");

  await writeFile(masterPath, createPcm16Wav());

  return {
    releaseId,
    masterPath,
    waveformPath,
  };
}

test("candidate-free Staging Build creates and refreshes only Library waveform peaks", async (t) => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "metadata-staging-library-build-"),
  );

  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const {
    releaseId,
    masterPath,
    waveformPath,
  } = await createLibraryRelease(root);

  const createPlan = await buildStagingLibraryBuildPlan(
    root,
    releaseId,
  );

  assert.equal(createPlan.summary.trackCount, 1);
  assert.equal(createPlan.summary.createCount, 1);
  assert.equal(createPlan.summary.blockedCount, 0);
  assert.equal(createPlan.tracks[0]?.action, "create");

  const originalMaster = await readFile(masterPath);
  const created = await executeStagingLibraryBuild(
    root,
    releaseId,
    createPlan.planFingerprint,
    STAGING_LIBRARY_BUILD_CONFIRMATION_PHRASE,
  );

  assert.equal(created.generatedCount, 1);
  assert.equal(created.refreshedCount, 0);
  assert.deepEqual(await readFile(masterPath), originalMaster);

  const currentPlan = await buildStagingLibraryBuildPlan(
    root,
    releaseId,
  );
  assert.equal(currentPlan.tracks[0]?.action, "current");

  await utimes(
    waveformPath,
    new Date("2000-01-01T00:00:00Z"),
    new Date("2000-01-01T00:00:00Z"),
  );

  const refreshPlan = await buildStagingLibraryBuildPlan(
    root,
    releaseId,
  );
  assert.equal(refreshPlan.summary.refreshCount, 1);
  assert.equal(refreshPlan.tracks[0]?.action, "refresh");

  const refreshed = await executeStagingLibraryBuild(
    root,
    releaseId,
    refreshPlan.planFingerprint,
    STAGING_LIBRARY_BUILD_CONFIRMATION_PHRASE,
  );
  assert.equal(refreshed.generatedCount, 0);
  assert.equal(refreshed.refreshedCount, 1);
  assert.deepEqual(await readFile(masterPath), originalMaster);
});

test("candidate-free Staging Build requires the reviewed fingerprint and confirmation", async (t) => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "metadata-staging-library-build-gate-"),
  );

  t.after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  const { releaseId } = await createLibraryRelease(root);
  const plan = await buildStagingLibraryBuildPlan(root, releaseId);

  await assert.rejects(
    () => executeStagingLibraryBuild(
      root,
      releaseId,
      plan.planFingerprint,
      "",
    ),
    /requires confirmation/,
  );

  await assert.rejects(
    () => executeStagingLibraryBuild(
      root,
      releaseId,
      "stale-fingerprint",
      STAGING_LIBRARY_BUILD_CONFIRMATION_PHRASE,
    ),
    /differs from the reviewed plan/,
  );
});
