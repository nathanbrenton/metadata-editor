import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);

test(
  "Live surfaces the package-index remedy while its manifest is stale",
  () => {
    assert.match(
      appSource,
      /const packageIndexNeedsRefresh =[\s\S]*?Boolean\(deploymentAudit\)[\s\S]*?!deploymentAudit\?\.deploymentManifest\.current/,
    );

    const actionsStart = appSource.indexOf(
      '<div className="publish-deployment-actions">',
    );
    assert.notEqual(actionsStart, -1);

    const actionsEnd = appSource.indexOf(
      "</header>",
      actionsStart,
    );
    assert.notEqual(actionsEnd, -1);

    const actions = appSource.slice(actionsStart, actionsEnd);

    assert.match(
      actions,
      /mode === "public-package"[\s\S]*?mode === "production" && packageIndexNeedsRefresh/,
    );
    assert.match(
      actions,
      /onClick=\{\(\) => void refreshDeploymentManifest\(\)\}/,
    );
    assert.match(actions, /Refresh package index/);
    assert.match(actions, /Create package index/);

    assert.ok(
      actions.indexOf("refreshDeploymentManifest") <
        actions.indexOf("loadDeploymentSyncPlan"),
      "the stale package-index remedy should appear before the disabled Live comparison action",
    );
  },
);

test(
  "a successful package-index refresh invalidates an older Live comparison",
  () => {
    const refreshStart = appSource.indexOf(
      "const refreshDeploymentManifest = useCallback",
    );
    assert.notEqual(refreshStart, -1);

    const refreshEnd = appSource.indexOf(
      "const loadDeploymentTargetStatus",
      refreshStart,
    );
    assert.notEqual(refreshEnd, -1);

    const refreshSource = appSource.slice(
      refreshStart,
      refreshEnd,
    );

    const manifestPost = refreshSource.indexOf(
      '"/api/publish/deployment-manifest"',
    );
    const clearPlan = refreshSource.indexOf(
      "setDeploymentSyncPlan(null)",
    );
    const reloadFleet = refreshSource.indexOf(
      "await loadPublishFleet()",
    );

    assert.ok(manifestPost >= 0);
    assert.ok(clearPlan > manifestPost);
    assert.ok(reloadFleet > clearPlan);
    assert.match(
      refreshSource,
      /setDeploymentSyncError\(null\)/,
    );
  },
);
