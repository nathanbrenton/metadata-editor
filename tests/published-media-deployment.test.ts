import assert from "node:assert/strict";
import {
  createHash,
} from "node:crypto";
import {
  chmod,
  access,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  auditPublishedMediaDeployment,
  writePublishedMediaDeploymentManifest,
} from "../server/published-media-deployment.js";

function sha256(content: Buffer | string): string {
  return createHash("sha256")
    .update(content)
    .digest("hex");
}

async function writeJson(
  filePath: string,
  value: unknown,
): Promise<Buffer> {
  const content = Buffer.from(
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
  await mkdir(path.dirname(filePath), {
    recursive: true,
  });
  await writeFile(filePath, content);
  return content;
}

async function createPublishedFixture(): Promise<{
  root: string;
  releaseJsonPath: string;
}> {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "metadata-editor-deployment-"),
  );
  // mkdtemp creates 0700 by design. This fixture represents the
  // sanitized public package root, whose deployment contract is 0755.
  await chmod(root, 0o755);
  const releaseId = "2026-08-10_example-release";
  const releaseRoot = path.join(
    root,
    "releases",
    releaseId,
  );
  const releaseJsonPath = path.join(
    releaseRoot,
    "release.json",
  );
  const releaseContent = await writeJson(
    releaseJsonPath,
    {
      schema: {
        name: "audio-player-release",
        version: 2,
      },
      id: releaseId,
      metadata: {
        title: "Example Release",
      },
      tracks: [],
    },
  );

  await writeJson(
    path.join(
      releaseRoot,
      "publication-manifest.json",
    ),
    {
      schema: {
        name: "metadata-editor-publication-manifest",
        version: 2,
      },
      contract: {
        name: "audio-player-public-package",
        version: 6,
      },
      releaseId,
      publishedAt: "2026-08-10T12:00:00.000Z",
      sourcePlanFingerprint: "plan-fingerprint",
      sourceContentFingerprint: "content-fingerprint",
      resources: [
        {
          kind: "release-metadata",
          path: "release.json",
          sha256: sha256(releaseContent),
          bytes: releaseContent.length,
        },
      ],
    },
  );

  await writeJson(
    path.join(root, "catalog.json"),
    {
      schema: {
        name: "audio-player-catalog",
        version: 1,
      },
      generatedAt: "2026-08-10T12:00:00.000Z",
      releases: [
        {
          id: releaseId,
          href: `releases/${releaseId}/release.json`,
          title: "Example Release",
        },
      ],
    },
  );

  return {
    root,
    releaseJsonPath,
  };
}

test(
  "audits a complete published-media tree and reports a missing deployment manifest as refreshable",
  async (t) => {
    const fixture = await createPublishedFixture();
    t.after(async () => {
      await rm(fixture.root, {
        recursive: true,
        force: true,
      });
    });

    const audit = await auditPublishedMediaDeployment(
      fixture.root,
      "2026-08-10T12:30:00.000Z",
    );

    assert.equal(audit.status, "warning");
    assert.equal(audit.deployable, false);
    assert.equal(audit.summary.blockedCount, 0);
    assert.equal(audit.summary.readyReleaseCount, 1);
    assert.equal(audit.summary.releaseDirectoryCount, 1);
    assert.equal(audit.catalog.releaseCount, 1);
    assert.ok(audit.candidateManifest);
    assert.equal(
      audit.candidateManifest?.publicPackageContract.versions[0],
      6,
    );
    assert.ok(
      audit.issues.some(
        (issue) =>
          issue.code === "deployment-manifest-missing",
      ),
    );
  },
);

test(
  "writes and verifies the deployment manifest without including the manifest in its own content fingerprint",
  async (t) => {
    const fixture = await createPublishedFixture();
    t.after(async () => {
      await rm(fixture.root, {
        recursive: true,
        force: true,
      });
    });

    const audit =
      await writePublishedMediaDeploymentManifest(
        fixture.root,
      );

    assert.equal(audit.status, "ready");
    assert.equal(audit.deployable, true);
    assert.equal(
      audit.deploymentManifest.current,
      true,
    );
    assert.equal(audit.summary.blockedCount, 0);

    const manifest = JSON.parse(
      await readFile(
        path.join(
          fixture.root,
          "deployment-manifest.json",
        ),
        "utf8",
      ),
    ) as {
      files: Array<{ path: string }>;
      snapshot: {
        contentFingerprint: string;
      };
    };

    assert.ok(
      manifest.files.some(
        (file) => file.path === "catalog.json",
      ),
    );
    assert.ok(
      manifest.files.some(
        (file) =>
          file.path.endsWith(
            "/publication-manifest.json",
          ),
      ),
    );
    assert.equal(
      manifest.files.some(
        (file) =>
          file.path === "deployment-manifest.json",
      ),
      false,
    );
    assert.equal(
      manifest.snapshot.contentFingerprint,
      audit.deploymentManifest.contentFingerprint,
    );
  },
);

test(
  "blocks deployment when a manifest-controlled public resource is modified",
  async (t) => {
    const fixture = await createPublishedFixture();
    t.after(async () => {
      await rm(fixture.root, {
        recursive: true,
        force: true,
      });
    });

    await writePublishedMediaDeploymentManifest(
      fixture.root,
    );
    await writeFile(
      fixture.releaseJsonPath,
      '{"tampered":true}\n',
      "utf8",
    );

    const audit = await auditPublishedMediaDeployment(
      fixture.root,
    );

    assert.equal(audit.status, "blocked");
    assert.equal(audit.deployable, false);
    assert.ok(audit.summary.blockedCount > 0);
    assert.ok(
      audit.issues.some(
        (issue) =>
          issue.code === "release-integrity-failed" &&
          issue.message.includes("hash verification"),
      ),
    );
  },
);

test(
  "ignores a root Finder .DS_Store and excludes it from the deployment snapshot",
  async (t) => {
    const fixture = await createPublishedFixture();
    t.after(async () => {
      await rm(fixture.root, {
        recursive: true,
        force: true,
      });
    });

    await writeFile(
      path.join(fixture.root, ".DS_Store"),
      "finder metadata",
      "utf8",
    );

    const audit = await auditPublishedMediaDeployment(
      fixture.root,
    );

    assert.equal(audit.summary.blockedCount, 0);
    assert.equal(
      audit.issues.some(
        (issue) =>
          issue.code === "unexpected-root-entry" &&
          issue.relativePath === ".DS_Store",
      ),
      false,
    );
    assert.ok(audit.candidateManifest);
    assert.equal(
      audit.candidateManifest?.files.some(
        (file) => file.path === ".DS_Store",
      ),
      false,
    );
  },
);

test(
  "ignores nested operating-system and editor junk throughout the deployment snapshot",
  async (t) => {
    const fixture = await createPublishedFixture();
    t.after(async () => {
      await rm(fixture.root, {
        recursive: true,
        force: true,
      });
    });

    const releaseRoot = path.dirname(fixture.releaseJsonPath);
    await writeFile(
      path.join(releaseRoot, ".DS_Store"),
      "finder metadata",
      "utf8",
    );
    await writeFile(
      path.join(releaseRoot, "Thumbs.db"),
      "windows metadata",
      "utf8",
    );
    await writeFile(
      path.join(releaseRoot, "._release.json"),
      "appledouble",
      "utf8",
    );
    await writeFile(
      path.join(releaseRoot, ".release.json.swp"),
      "editor swap",
      "utf8",
    );
    await mkdir(
      path.join(releaseRoot, "nested", "__MACOSX"),
      { recursive: true },
    );
    await writeFile(
      path.join(
        releaseRoot,
        "nested",
        "__MACOSX",
        "metadata.bin",
      ),
      "finder archive metadata",
      "utf8",
    );

    const audit = await auditPublishedMediaDeployment(
      fixture.root,
    );

    assert.equal(audit.summary.blockedCount, 0);
    assert.ok(audit.candidateManifest);
    for (const junkName of [
      ".DS_Store",
      "Thumbs.db",
      "._release.json",
      ".release.json.swp",
      "metadata.bin",
    ]) {
      assert.equal(
        audit.candidateManifest?.files.some((file) =>
          file.path.endsWith(`/${junkName}`),
        ),
        false,
      );
    }
  },
);

test(
  "deployment-manifest refresh physically prunes ignored publication junk",
  async (t) => {
    const fixture = await createPublishedFixture();
    t.after(async () => {
      await rm(fixture.root, {
        recursive: true,
        force: true,
      });
    });

    const releaseRoot = path.dirname(fixture.releaseJsonPath);
    const rootFinderJunk = path.join(fixture.root, ".DS_Store");
    const nestedArchiveJunk = path.join(
      releaseRoot,
      "nested",
      "__MACOSX",
      "metadata.bin",
    );
    const editorJunk = path.join(
      releaseRoot,
      ".release.json.swp",
    );

    await writeFile(rootFinderJunk, "finder metadata", "utf8");
    await mkdir(path.dirname(nestedArchiveJunk), {
      recursive: true,
    });
    await writeFile(
      nestedArchiveJunk,
      "finder archive metadata",
      "utf8",
    );
    await writeFile(editorJunk, "editor swap", "utf8");

    const audit =
      await writePublishedMediaDeploymentManifest(
        fixture.root,
      );

    assert.equal(audit.status, "ready");
    assert.equal(audit.deployable, true);
    await assert.rejects(access(rootFinderJunk), /ENOENT/);
    await assert.rejects(access(nestedArchiveJunk), /ENOENT/);
    await assert.rejects(access(editorJunk), /ENOENT/);
  },
);

test(
  "blocks unexpected root files so deployment staging cannot silently copy administrative debris",
  async (t) => {
    const fixture = await createPublishedFixture();
    t.after(async () => {
      await rm(fixture.root, {
        recursive: true,
        force: true,
      });
    });

    await writeFile(
      path.join(fixture.root, "notes.txt"),
      "private deployment note\n",
      "utf8",
    );

    const audit = await auditPublishedMediaDeployment(
      fixture.root,
    );

    assert.equal(audit.status, "blocked");
    assert.ok(
      audit.issues.some(
        (issue) =>
          issue.code === "unexpected-root-entry" &&
          issue.relativePath === "notes.txt",
      ),
    );
  },
);

test(
  "blocks canonical/private media even if a manually edited publication manifest attempts to legitimize it",
  async (t) => {
    const fixture = await createPublishedFixture();
    t.after(async () => {
      await rm(fixture.root, {
        recursive: true,
        force: true,
      });
    });

    const releaseId = "2026-08-10_example-release";
    const releaseRoot = path.join(
      fixture.root,
      "releases",
      releaseId,
    );
    const privatePath = path.join(
      releaseRoot,
      "video-master.mp4",
    );
    const privateContent = Buffer.from(
      "private canonical video master",
      "utf8",
    );
    await writeFile(privatePath, privateContent);

    const manifestPath = path.join(
      releaseRoot,
      "publication-manifest.json",
    );
    const manifest = JSON.parse(
      await readFile(manifestPath, "utf8"),
    ) as {
      resources: Array<Record<string, unknown>>;
    };
    manifest.resources.push({
      kind: "video-stream-segment",
      path: "video-master.mp4",
      sha256: sha256(privateContent),
      bytes: privateContent.length,
      videoId: "video-01",
    });
    await writeJson(manifestPath, manifest);

    const audit = await auditPublishedMediaDeployment(
      fixture.root,
    );

    assert.equal(audit.status, "blocked");
    assert.equal(audit.deployable, false);
    assert.ok(
      audit.issues.some(
        (issue) =>
          issue.code === "private-public-resource" &&
          issue.relativePath.endsWith(
            "/video-master.mp4",
          ),
      ),
    );
  },
);

test(
  "marks deployment-manifest.json stale after a legitimate public catalog change",
  async (t) => {
    const fixture = await createPublishedFixture();
    t.after(async () => {
      await rm(fixture.root, {
        recursive: true,
        force: true,
      });
    });

    const initial =
      await writePublishedMediaDeploymentManifest(
        fixture.root,
      );
    assert.equal(initial.deployable, true);

    const catalogPath = path.join(
      fixture.root,
      "catalog.json",
    );
    const catalog = JSON.parse(
      await readFile(catalogPath, "utf8"),
    ) as Record<string, unknown>;
    catalog.generatedAt =
      "2026-08-10T13:00:00.000Z";
    await writeJson(catalogPath, catalog);

    const audit = await auditPublishedMediaDeployment(
      fixture.root,
    );

    assert.equal(audit.status, "warning");
    assert.equal(audit.summary.blockedCount, 0);
    assert.equal(audit.deploymentManifest.exists, true);
    assert.equal(audit.deploymentManifest.current, false);
    assert.equal(audit.deployable, false);
    assert.ok(
      audit.issues.some(
        (issue) =>
          issue.code === "deployment-manifest-stale",
      ),
    );
  },
);
