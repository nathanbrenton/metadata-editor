import {
  listPublishOperations,
} from "../server/publish-operations.js";
import {
  writePublishedMediaDeploymentManifest,
} from "../server/published-media-deployment.js";
import {
  resolvePublishRoot,
} from "../server/workflow-locations.js";

const publishRoot = await resolvePublishRoot();
const history = await listPublishOperations(
  publishRoot,
  { limit: 200 },
);

if (
  history.interruptedCount > 0 ||
  history.operations.some(
    (operation) => operation.state === "running",
  )
) {
  throw new Error(
    "Deployment manifest cannot be refreshed while a publish operation is running or interrupted.",
  );
}

const audit = await writePublishedMediaDeploymentManifest(
  publishRoot,
);

console.log("Deployment manifest refreshed.");
console.log(`Root: ${audit.publishRoot}`);
console.log(
  `Fingerprint: ${audit.deploymentManifest.contentFingerprint}`,
);
console.log(
  `Snapshot: ${audit.summary.fileCount} files · ${audit.summary.totalBytes} bytes · ${audit.summary.readyReleaseCount} releases`,
);
