import path from "node:path";

import {
  buildIngestReceiptTrackRepairPlan,
  executeIngestReceiptTrackRepair,
  ingestReceiptTrackRepairConfirmation,
} from "../server/track-directory-sync.js";
import {
  scanReleaseById,
} from "../server/scanner.js";

function usage(): never {
  console.error(
    [
      "Usage:",
      "  node --import tsx scripts/repair-ingest-receipt-track-paths.ts <media-root> <release-id>",
      `  node --import tsx scripts/repair-ingest-receipt-track-paths.ts <media-root> <release-id> --apply ${ingestReceiptTrackRepairConfirmation}`,
    ].join("\n"),
  );
  process.exit(2);
}

const [mediaRootArgument, releaseId, ...rest] =
  process.argv.slice(2);

if (!mediaRootArgument || !releaseId) {
  usage();
}

const mediaRoot = path.resolve(mediaRootArgument);
const release = await scanReleaseById(
  mediaRoot,
  releaseId,
);

if (!release) {
  throw new Error(
    `Release ${releaseId} was not found under ${mediaRoot}.`,
  );
}

const plan = await buildIngestReceiptTrackRepairPlan(
  mediaRoot,
  release,
);

console.log(JSON.stringify(plan, null, 2));

if (rest.length === 0) {
  if (plan.blockedReasons.length > 0) {
    process.exitCode = 1;
  } else if (plan.items.length > 0) {
    console.log(
      `\nDry run only. Review the mappings above, then rerun with --apply ${ingestReceiptTrackRepairConfirmation}.`,
    );
  } else {
    console.log("\nThe ingest receipt track references are already current.");
  }
} else {
  if (
    rest.length !== 2 ||
    rest[0] !== "--apply" ||
    rest[1] !== ingestReceiptTrackRepairConfirmation
  ) {
    usage();
  }

  const receipt = await executeIngestReceiptTrackRepair(
    mediaRoot,
    release,
    rest[1],
    plan.fingerprint,
  );
  console.log("\nApplied receipt repair:");
  console.log(JSON.stringify(receipt, null, 2));
}
