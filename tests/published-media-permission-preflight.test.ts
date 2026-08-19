import assert from "node:assert/strict";
import {
  chmod,
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  auditPublishedMediaDeployment,
} from "../server/published-media-deployment.js";

async function withTemporaryPublishedRoot(
  run: (root: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "published-media-mode-preflight-"),
  );

  try {
    await chmod(root, 0o755);
    await run(root);
  } finally {
    await rm(root, {
      recursive: true,
      force: true,
    });
  }
}

test(
  "published-media audit blocks a 0700 public file before deployment planning",
  async () => {
    await withTemporaryPublishedRoot(async (root) => {
      const badFile = path.join(root, "catalog.json");
      await writeFile(badFile, "{}\n");
      await chmod(badFile, 0o700);

      const audit = await auditPublishedMediaDeployment(
        root,
        "2026-08-18T00:00:00.000Z",
      );

      const issue = audit.issues.find(
        (candidate) =>
          candidate.code === "public-file-mode-invalid" &&
          candidate.relativePath === "catalog.json",
      );

      assert.ok(
        issue,
        "0700 public file should produce a blocking permission issue",
      );
      assert.equal(issue.severity, "blocked");
      assert.match(issue.message, /0644/);
      assert.match(issue.message, /0700/);
      assert.equal(audit.deployable, false);
      assert.equal(audit.status, "blocked");
    });
  },
);

test(
  "published-media audit blocks a 0700 public directory before deployment planning",
  async () => {
    await withTemporaryPublishedRoot(async (root) => {
      const releases = path.join(root, "releases");
      await mkdir(releases);
      await chmod(releases, 0o700);

      const audit = await auditPublishedMediaDeployment(
        root,
        "2026-08-18T00:00:00.000Z",
      );

      const issue = audit.issues.find(
        (candidate) =>
          candidate.code === "public-directory-mode-invalid" &&
          candidate.relativePath === "releases",
      );

      assert.ok(
        issue,
        "0700 public directory should produce a blocking permission issue",
      );
      assert.equal(issue.severity, "blocked");
      assert.match(issue.message, /0755/);
      assert.match(issue.message, /0700/);
      assert.equal(audit.deployable, false);
      assert.equal(audit.status, "blocked");
    });
  },
);
