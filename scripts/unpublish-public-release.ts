import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  buildPublicReleaseUnpublishPlan,
  unpublishPublicRelease,
} from "../server/publication-membership.js";
import {
  resolvePublishRoot,
} from "../server/workflow-locations.js";

type Options = {
  releaseId: string;
  planFingerprint: string;
  confirmation: string;
  publishRoot?: string;
};

function parseOptions(
  argv: readonly string[],
): Options {
  let releaseId = "";
  let planFingerprint = "";
  let confirmation = "";
  let publishRoot: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];

    if (argument === "--release") {
      if (!value || value.startsWith("--")) {
        throw new Error("--release requires a release directory ID.");
      }
      releaseId = value;
      index += 1;
      continue;
    }

    if (argument === "--plan-fingerprint") {
      if (!value || value.startsWith("--")) {
        throw new Error("--plan-fingerprint requires a fingerprint.");
      }
      planFingerprint = value;
      index += 1;
      continue;
    }

    if (argument === "--confirm") {
      if (!value || value.startsWith("--")) {
        throw new Error("--confirm requires the exact confirmation token.");
      }
      confirmation = value;
      index += 1;
      continue;
    }

    if (argument === "--publish-root") {
      if (!value || value.startsWith("--")) {
        throw new Error("--publish-root requires a directory path.");
      }
      publishRoot = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown or unexpected option: ${argument}`);
  }

  if (!releaseId || !planFingerprint || !confirmation) {
    throw new Error(
      "Guarded unpublish requires --release, --plan-fingerprint, and --confirm.",
    );
  }

  return {
    releaseId,
    planFingerprint,
    confirmation,
    ...(publishRoot ? { publishRoot } : {}),
  };
}

export async function runUnpublishPublicReleaseCli(
  argv: readonly string[],
): Promise<number> {
  const options = parseOptions(argv);
  const publishRoot = await resolvePublishRoot(
    options.publishRoot,
  );
  const reviewedPlan =
    await buildPublicReleaseUnpublishPlan(
      publishRoot,
      options.releaseId,
    );

  if (
    reviewedPlan.planFingerprint !==
    options.planFingerprint
  ) {
    throw new Error(
      "Current unpublish plan fingerprint differs from the reviewed fingerprint. Re-run plan:unpublish-release.",
    );
  }

  const receipt = await unpublishPublicRelease(
    publishRoot,
    options.releaseId,
    {
      expectedPlanFingerprint:
        options.planFingerprint,
      planGeneratedAt:
        reviewedPlan.generatedAt,
      confirmation: options.confirmation,
    },
  );

  console.log("Public release unpublished");
  console.log(`Release: ${receipt.releaseId}`);
  console.log(`Operation: ${receipt.operationId}`);
  console.log(
    `Removed: ${receipt.removedFileCount} files · ${receipt.removedBytes} bytes`,
  );
  console.log(
    "Next: verify the published snapshot, refresh deployment-manifest.json, then review the sandbox/production deployment removal plan.",
  );

  return 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runUnpublishPublicReleaseCli(
    process.argv.slice(2),
  )
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      process.stderr.write(
        `Unpublish error: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 2;
    });
}
