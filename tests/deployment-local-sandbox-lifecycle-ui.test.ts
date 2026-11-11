import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  readEditorAppSource,
  readEditorServerSource,
} from "./support/editor-source.js";

const appSource = await readEditorAppSource();
const serverSource = await readEditorServerSource();

test(
  "Publish can execute a reviewed local-sandbox deployment without exposing production writes",
  () => {
    assert.match(appSource, /Deploy to sandbox/);
    assert.match(appSource, /Local lifecycle/);
    assert.match(
      appSource,
      /\/api\/publish\/deployment-sandbox-execute/,
    );
    assert.match(
      appSource,
      /planFingerprint: deploymentSyncPlan\.planFingerprint/,
    );
    assert.match(
      serverSource,
      /status\.target\.kind !== "local"/,
    );
    assert.doesNotMatch(
      appSource,
      /deployment-production-execute/,
    );
  },
);

test(
  "local sandbox rollback is offered only when a verified previous snapshot exists",
  () => {
    assert.match(appSource, /Rollback sandbox/);
    assert.match(
      appSource,
      /latestOperation\?\.state === "completed"/,
    );
    assert.match(
      appSource,
      /latestOperation\.previousContentFingerprint/,
    );
    assert.match(
      appSource,
      /\/api\/publish\/deployment-sandbox-rollback/,
    );
  },
);
