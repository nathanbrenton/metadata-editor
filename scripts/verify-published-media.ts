import process from "node:process";

import {
  auditPublishedMediaDeployment,
} from "../server/published-media-deployment.js";
import {
  resolvePublishRoot,
} from "../server/workflow-locations.js";

const jsonMode = process.argv.includes("--json");
const allowStaleManifest = process.argv.includes(
  "--allow-stale-manifest",
);

const publishRoot = await resolvePublishRoot();
const audit = await auditPublishedMediaDeployment(
  publishRoot,
);

if (jsonMode) {
  process.stdout.write(
    `${JSON.stringify(audit, null, 2)}\n`,
  );
} else {
  console.log("Published-media deployment verification");
  console.log(`Root: ${audit.publishRoot}`);
  console.log(`Status: ${audit.status}`);
  console.log(
    `Releases: ${audit.summary.readyReleaseCount}/${audit.summary.releaseDirectoryCount} integrity-ready`,
  );
  console.log(
    `Snapshot: ${audit.summary.fileCount} files · ${audit.summary.totalBytes} bytes`,
  );
  console.log(
    `Deployment manifest: ${audit.deploymentManifest.current ? "current" : audit.deploymentManifest.exists ? "stale" : "missing"}`,
  );

  for (const issue of audit.issues) {
    console.log(
      `${issue.severity === "blocked" ? "BLOCKED" : "WARNING"} ${issue.code} ${issue.relativePath}: ${issue.message}`,
    );
  }
}

const hasBlockers = audit.summary.blockedCount > 0;
const manifestReady =
  audit.deploymentManifest.current ||
  allowStaleManifest;

if (
  audit.status === "empty" ||
  hasBlockers ||
  !manifestReady
) {
  process.exitCode = 1;
}
