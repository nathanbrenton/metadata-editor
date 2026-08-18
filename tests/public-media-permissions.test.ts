import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const publishWriterSource = await readFile(
  new URL("../server/publish-writer.ts", import.meta.url),
  "utf8",
);
const deploymentSyncSource = await readFile(
  new URL("../server/deployment-sync.ts", import.meta.url),
  "utf8",
);

test("normalizes copied public-package assets to web-readable mode", () => {
  assert.match(
    publishWriterSource,
    /await copyFile\(source, destination\);[\s\S]*?await chmod\(destination, 0o644\);[\s\S]*?const stagedDigest = await sha256File\(destination\);/,
  );
});

test("normalizes published-media deployment modes at the rsync boundary", () => {
  assert.match(
    deploymentSyncSource,
    /"--chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r"/,
  );
});
