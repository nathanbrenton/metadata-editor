import assert from "node:assert/strict";
import {
  readFile,
} from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const serverSource = await readFile(
  new URL("../server/index.ts", import.meta.url),
  "utf8",
);
const profileSource = await readFile(
  new URL("../server/deployment-profiles.ts", import.meta.url),
  "utf8",
);
const helpSource = await readFile(
  new URL(
    "../src/workflow-help-content.ts",
    import.meta.url,
  ),
  "utf8",
);
const readmeSource = await readFile(
  new URL("../README.md", import.meta.url),
  "utf8",
);

test(
  "Live keeps deployment profiles behind connection details without requiring production",
  () => {
    assert.match(appSource, /Connection & deployment details/);
    assert.match(appSource, /Published media deployment profiles/);
    assert.match(profileSource, /label: "Local sandbox"/);
    assert.match(profileSource, /label: "Production"/);
    assert.match(
      appSource,
      /websites\/_deploy\/hiplingo\.com\/published-media/,
    );
    assert.match(
      appSource,
      /PUBLISHED_MEDIA_PRODUCTION_TARGET=ssh:hiplingo-prod:\/var\/www\/hiplingo\.com\/published-media/,
    );
  },
);

test(
  "profile inspection stays read-only while browser writes are restricted to the local sandbox",
  () => {
    assert.match(
      appSource,
      /deployment-target\$\{profileQuery\}/,
    );
    assert.match(
      appSource,
      /deployment-sync-plan\$\{profileQuery\}/,
    );
    assert.match(
      serverSource,
      /requestUrl\.searchParams\.get\("profile"\)/,
    );
    assert.match(
      serverSource,
      /api\/publish\/deployment-sandbox-execute/,
    );
    assert.match(
      serverSource,
      /api\/publish\/deployment-sandbox-rollback/,
    );
    assert.match(
      serverSource,
      /profileName: "local-sandbox"/,
    );
    assert.match(
      serverSource,
      /Browser deployment is restricted to the local-sandbox profile with a local filesystem target/,
    );
    assert.match(
      serverSource,
      /Production and SSH rollback remain CLI-only/,
    );
  },
);

test(
  "documentation preserves the independent Hiplingo frontend and persistent media boundaries",
  () => {
    for (const source of [helpSource, readmeSource]) {
      assert.match(
        source,
        /\/var\/www\/hiplingo\.com\/app\/current/,
      );
      assert.match(
        source,
        /\/var\/www\/hiplingo\.com\/published-media/,
      );
      assert.match(source, /local-sandbox/);
      assert.match(source, /PUBLISHED_MEDIA_PRODUCTION_TARGET/);
    }
  },
);
