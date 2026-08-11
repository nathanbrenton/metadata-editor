import process from "node:process";

import {
  executePublishedMediaDeployment,
} from "../server/deployment-sync.js";
import {
  buildPublishFleetSummary,
} from "../server/publish-fleet.js";
import {
  resolveMediaRoot,
} from "../server/media-root.js";
import {
  resolvePublishRoot,
} from "../server/workflow-locations.js";

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const planFingerprint = argumentValue(
  "--plan-fingerprint",
);
const confirmation = argumentValue("--confirm");
const profileName = argumentValue("--profile");
const allowPendingLibraryChanges =
  process.argv.includes("--allow-pending-library-changes");

if (!planFingerprint) {
  throw new Error(
    "Usage: npm run deploy:published-media -- --profile <local-sandbox|production|custom> --plan-fingerprint <reviewed-fingerprint> --confirm DEPLOY_PUBLISHED_MEDIA [--allow-pending-library-changes]",
  );
}

const [mediaRoot, publishRoot] = await Promise.all([
  resolveMediaRoot(),
  resolvePublishRoot(),
]);
const fleet = await buildPublishFleetSummary(
  mediaRoot,
  publishRoot,
);
if (
  fleet.summary.updateAvailableCount > 0 &&
  !allowPendingLibraryChanges
) {
  throw new Error(
    `${fleet.summary.updateAvailableCount} published ${fleet.summary.updateAvailableCount === 1 ? "release has" : "releases have"} pending Library changes. Run Update public package before deployment, or rerun with --allow-pending-library-changes to intentionally deploy the older public snapshot.`,
  );
}
const receipt = await executePublishedMediaDeployment(
  publishRoot,
  {
    confirmation: confirmation ?? "",
    planFingerprint,
    profileName,
  },
);

console.log("Published-media deployment completed.");
console.log(`Operation: ${receipt.operationId}`);
console.log(`Profile: ${receipt.profileName ?? profileName ?? "custom"}`);
console.log(`Target: ${receipt.target.display}`);
console.log(`Snapshot: ${receipt.sourceContentFingerprint}`);
console.log(
  `Changes: ${receipt.summary.changeCount} · add ${receipt.summary.addCount} · update ${receipt.summary.updateCount} · remove ${receipt.summary.removeCount}`,
);
if (receipt.previousContentFingerprint) {
  console.log(
    `Rollback snapshot: ${receipt.previousContentFingerprint}`,
  );
  console.log(
    `Rollback: npm run rollback:published-media -- --profile ${receipt.profileName ?? profileName ?? "custom"} --confirm ROLLBACK_PUBLISHED_MEDIA`,
  );
}
