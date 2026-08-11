import process from "node:process";

import {
  rollbackPublishedMediaDeployment,
} from "../server/deployment-sync.js";
import {
  resolvePublishRoot,
} from "../server/workflow-locations.js";

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const confirmation = argumentValue("--confirm");
const profileName = argumentValue("--profile");
const publishRoot = await resolvePublishRoot();
const receipt = await rollbackPublishedMediaDeployment(
  publishRoot,
  {
    confirmation: confirmation ?? "",
    profileName,
  },
);

console.log("Published-media deployment rollback completed.");
console.log(`Operation: ${receipt.operationId}`);
console.log(`Profile: ${receipt.profileName ?? profileName ?? "custom"}`);
console.log(`Target: ${receipt.target.display}`);
console.log(
  `Restored snapshot: ${receipt.previousContentFingerprint}`,
);
