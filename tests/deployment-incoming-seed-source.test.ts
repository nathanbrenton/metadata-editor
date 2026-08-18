import assert from "node:assert/strict";
import {
  readFile,
} from "node:fs/promises";
import test from "node:test";

const sourceUrl = new URL(
  "../server/deployment-sync.ts",
  import.meta.url,
);

test(
  "deployment seeds incoming from the current target before hotspot rsync",
  async () => {
    const source = await readFile(
      sourceUrl,
      "utf8",
    );

    assert.ok(
      source.includes(
        "async function seedIncomingFromCurrentTarget(",
      ),
      "incoming seeding helper should exist",
    );
    assert.ok(
      source.includes(
        "await cp(\n      target.destinationPath,\n      incomingPath,",
      ),
      "local targets should seed incoming without re-copying through rsync",
    );
    assert.ok(
      source.includes(
        "cp -a -- ${destination} ${incoming}",
      ),
      "SSH targets should copy the current deployment server-side",
    );

    const syncStart = source.indexOf(
      "async function syncToIncoming(",
    );
    const normalizeStart = source.indexOf(
      "await normalizePublishedMediaTargetPermissions(",
      syncStart,
    );

    assert.notEqual(
      syncStart,
      -1,
      "syncToIncoming should exist",
    );
    assert.notEqual(
      normalizeStart,
      -1,
      "permission hardening should remain after rsync",
    );

    const syncSection = source.slice(
      syncStart,
      normalizeStart,
    );
    const seedIndex = syncSection.indexOf(
      "await seedIncomingFromCurrentTarget(",
    );
    const rsyncIndex = syncSection.indexOf(
      "await runCommand(",
    );

    assert.ok(
      seedIndex >= 0,
      "syncToIncoming should seed the incoming tree",
    );
    assert.ok(
      rsyncIndex > seedIndex,
      "server-side seed must happen before the network rsync",
    );
    assert.ok(
      syncSection.includes(
        "...rsyncBaseArgs(target),",
      ),
      "existing checksum/delete/chmod rsync contract should remain",
    );
  },
);
