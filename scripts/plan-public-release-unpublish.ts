import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  buildPublicReleaseUnpublishPlan,
} from "../server/publication-membership.js";
import {
  resolvePublishRoot,
} from "../server/workflow-locations.js";

type Options = {
  releaseId: string;
  json: boolean;
  publishRoot?: string;
};

function parseOptions(
  argv: readonly string[],
): Options {
  let releaseId = "";
  let json = false;
  let publishRoot: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--json") {
      json = true;
      continue;
    }

    if (argument === "--release") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--release requires a release directory ID.");
      }
      releaseId = value;
      index += 1;
      continue;
    }

    if (argument === "--publish-root") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error("--publish-root requires a directory path.");
      }
      publishRoot = value;
      index += 1;
      continue;
    }

    if (argument?.startsWith("--")) {
      throw new Error(`Unknown option: ${argument}`);
    }

    if (!releaseId) {
      releaseId = argument ?? "";
      continue;
    }

    throw new Error(`Unexpected argument: ${argument}`);
  }

  if (!releaseId) {
    throw new Error("Unpublish planning requires --release <release-id>.");
  }

  return {
    releaseId,
    json,
    ...(publishRoot ? { publishRoot } : {}),
  };
}

export async function runPlanPublicReleaseUnpublishCli(
  argv: readonly string[],
): Promise<number> {
  const options = parseOptions(argv);
  const publishRoot = await resolvePublishRoot(
    options.publishRoot,
  );
  const plan = await buildPublicReleaseUnpublishPlan(
    publishRoot,
    options.releaseId,
  );

  if (options.json) {
    process.stdout.write(
      `${JSON.stringify(plan, null, 2)}\n`,
    );
  } else {
    console.log("Public release unpublish plan");
    console.log(`Release: ${plan.releaseId}`);
    console.log(`Status: ${plan.status}`);
    console.log(
      `Public package: ${plan.publicFiles.fileCount} files · ${plan.publicFiles.totalBytes} bytes`,
    );
    console.log(
      `Destination: ${plan.destinationReleaseRelativePath}`,
    );
    console.log(
      `Plan fingerprint: ${plan.planFingerprint}`,
    );
    console.log(
      `Confirmation: ${plan.confirmation}`,
    );
    console.log(
      "Library content is not modified by this plan or by guarded unpublish.",
    );
    for (const issue of plan.issues) {
      console.log(
        `${issue.severity === "blocked" ? "BLOCKED" : "WARNING"} ${issue.code} ${issue.relativePath}: ${issue.message}`,
      );
    }
  }

  return plan.status === "blocked" ? 1 : 0;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  runPlanPublicReleaseUnpublishCli(
    process.argv.slice(2),
  )
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      process.stderr.write(
        `Unpublish planning error: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 2;
    });
}
