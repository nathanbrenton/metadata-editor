import assert from "node:assert/strict";
import {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  normalizePublishedMediaTargetPermissions,
  type PublishedMediaDeploymentTarget,
} from "../server/deployment-sync.js";

function permissionBits(mode: number): number {
  return mode & 0o777;
}

test(
  "normalizes a local published-media deployment tree to directories 0755 and files 0644",
  async (t) => {
    const root = await mkdtemp(
      path.join(
        os.tmpdir(),
        "metadata-editor-public-permissions-",
      ),
    );
    t.after(async () => {
      await rm(root, {
        recursive: true,
        force: true,
      });
    });

    const nested = path.join(
      root,
      "releases",
      "example",
      "artwork",
      "front",
    );
    await mkdir(nested, { recursive: true });

    const artwork = path.join(
      nested,
      "artwork.jpg",
    );
    await writeFile(artwork, "public artwork\n");
    await chmod(root, 0o700);
    await chmod(path.join(root, "releases"), 0o700);
    await chmod(
      path.join(root, "releases", "example"),
      0o700,
    );
    await chmod(artwork, 0o700);

    const target: PublishedMediaDeploymentTarget = {
      kind: "local",
      configuredValue: `local:${root}`,
      display: `local:${root}`,
      destinationPath: root,
    };

    await normalizePublishedMediaTargetPermissions(
      target,
      root,
    );

    assert.equal(
      permissionBits((await stat(root)).mode),
      0o755,
    );
    assert.equal(
      permissionBits(
        (
          await stat(
            path.join(root, "releases"),
          )
        ).mode,
      ),
      0o755,
    );
    assert.equal(
      permissionBits((await stat(nested)).mode),
      0o755,
    );
    assert.equal(
      permissionBits((await stat(artwork)).mode),
      0o644,
    );
  },
);

test(
  "incoming deployment is explicitly normalized in addition to rsync chmod",
  async () => {
    const source = await readFile(
      new URL(
        "../server/deployment-sync.ts",
        import.meta.url,
      ),
      "utf8",
    );

    assert.match(
      source,
      /"--chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r"/,
    );
    assert.match(
      source,
      /async function syncToIncoming\([\s\S]*?await normalizePublishedMediaTargetPermissions\([\s\S]*?target,[\s\S]*?incomingPath,[\s\S]*?\);[\s\S]*?const verifyChanges = await runRsyncPlan\(/,
    );
    assert.match(
      source,
      /find \$\{quotedRoot\} -type d -exec chmod 0755 \{\} \+/,
    );
    assert.match(
      source,
      /find \$\{quotedRoot\} -type f -exec chmod 0644 \{\} \+/,
    );
  },
);
