import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  buildPublishPlan,
  formatPublishPlan,
} from "../server/publish-plan.js";
import {
  resolveMediaRoot,
} from "../server/media-root.js";
import {
  resolvePublishRoot,
} from "../server/workflow-locations.js";

type PublishCliOptions = {
  releaseId: string;
  json: boolean;
  strict: boolean;
  mediaRoot?: string;
  publishRoot?: string;
};

export function parsePublishCliOptions(
  argv: readonly string[],
): PublishCliOptions {
  let releaseId = "";
  let json = false;
  let strict = false;
  let mediaRoot: string | undefined;
  let publishRoot: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--json") {
      json = true;
      continue;
    }

    if (argument === "--strict") {
      strict = true;
      continue;
    }

    if (argument === "--media-root") {
      const value = argv[index + 1];

      if (!value || value.startsWith("--")) {
        throw new Error("--media-root requires a directory path.");
      }

      mediaRoot = value;
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
    throw new Error("Publish planning requires a release directory ID.");
  }

  return {
    releaseId,
    json,
    strict,
    ...(mediaRoot ? { mediaRoot } : {}),
    ...(publishRoot ? { publishRoot } : {}),
  };
}

export async function runPublishPlanCli(
  argv: readonly string[],
): Promise<number> {
  const options = parsePublishCliOptions(argv);
  const mediaRoot = await resolveMediaRoot(options.mediaRoot);
  const publishRoot = await resolvePublishRoot(options.publishRoot);
  const plan = await buildPublishPlan(
    mediaRoot,
    publishRoot,
    options.releaseId,
  );

  process.stdout.write(
    options.json
      ? `${JSON.stringify(plan, null, 2)}\n`
      : formatPublishPlan(plan),
  );

  return options.strict && plan.status === "blocked" ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runPublishPlanCli(process.argv.slice(2))
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      process.stderr.write(
        `Publish planning error: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 2;
    });
}
