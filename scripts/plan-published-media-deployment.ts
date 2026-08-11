import process from "node:process";

import {
  buildPublishedMediaDeploymentSyncPlan,
  buildPublishedMediaDeploymentTargetStatus,
} from "../server/deployment-sync.js";
import {
  resolvePublishRoot,
} from "../server/workflow-locations.js";


function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const profileName = argumentValue("--profile");

const publishRoot = await resolvePublishRoot();
const jsonMode = process.argv.includes("--json");
const status = await buildPublishedMediaDeploymentTargetStatus(
  publishRoot,
  process.env,
  profileName,
);

if (!status.configured) {
  throw new Error(
    "No deployment target is configured. Set PUBLISHED_MEDIA_DEPLOY_TARGET to local:/absolute/path or ssh:user@host:/absolute/path.",
  );
}

const plan = await buildPublishedMediaDeploymentSyncPlan(
  publishRoot,
  process.env,
  profileName,
);

if (jsonMode) {
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
} else {
  console.log("Published-media host sync plan");
  console.log(`Source: ${plan.sourceRoot}`);
  console.log(`Profile: ${plan.profile.label} (${plan.profile.name})`);
  console.log(`Target: ${plan.target.display}`);
  console.log(`Status: ${plan.status}`);
  console.log(`Snapshot: ${plan.sourceContentFingerprint}`);
  console.log(
    `Changes: ${plan.summary.changeCount} · add ${plan.summary.addCount} · update ${plan.summary.updateCount} · remove ${plan.summary.removeCount} · metadata ${plan.summary.metadataCount} · unknown ${plan.summary.unknownCount}`,
  );
  for (const change of plan.changes) {
    console.log(`${change.action.toUpperCase()} ${change.path}`);
  }
  console.log(`Plan fingerprint: ${plan.planFingerprint}`);
  if (plan.status === "changes") {
    console.log();
    console.log(
      "Deploy only after reviewing the plan fingerprint:",
    );
    console.log(
      `npm run deploy:published-media -- --profile ${plan.profile.name} --plan-fingerprint ${plan.planFingerprint} --confirm ${plan.confirmation}`,
    );
  }
}
