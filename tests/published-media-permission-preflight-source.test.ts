import assert from "node:assert/strict";
import {
  readFile,
} from "node:fs/promises";
import test from "node:test";

test(
  "published-media permission audit is wired into deployment audit before candidate planning",
  async () => {
    const source = await readFile(
      new URL(
        "../server/published-media-deployment.ts",
        import.meta.url,
      ),
      "utf8",
    );

    const auditStart = source.indexOf(
      "export async function auditPublishedMediaDeployment(",
    );
    const permissionCall = source.indexOf(
      "await auditPublishedMediaPermissions(",
      auditStart,
    );
    const candidateBuild = source.indexOf(
      "await buildCandidateManifest(",
      auditStart,
    );

    assert.ok(
      auditStart >= 0,
      "deployment audit should exist",
    );
    assert.ok(
      permissionCall > auditStart,
      "deployment audit should call the permission preflight",
    );
    assert.ok(
      candidateBuild === -1 || permissionCall < candidateBuild,
      "permission preflight should execute before candidate manifest planning",
    );

    assert.ok(
      source.includes(
        'code: "public-file-mode-invalid"',
      ),
      "file mode blocker should exist",
    );
    assert.ok(
      source.includes(
        'code: "public-directory-mode-invalid"',
      ),
      "directory mode blocker should exist",
    );
    assert.ok(
      source.includes(
        'severity: "blocked"',
      ),
      "permission violations should be blocking issues",
    );
  },
);
