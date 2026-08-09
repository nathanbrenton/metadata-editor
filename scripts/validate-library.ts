import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  formatLibraryValidationReport,
  validateMediaLibrary,
} from "../server/library-validator.js";
import {
  resolveMediaRoot,
} from "../server/media-root.js";

type CliOptions = {
  json: boolean;
  verifyHashes: boolean;
  releaseId?: string;
  mediaRoot?: string;
};

export function parseValidationCliOptions(
  argv: readonly string[],
): CliOptions {
  const options: CliOptions = {
    json: false,
    verifyHashes: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--json") {
      options.json = true;
      continue;
    }

    if (argument === "--verify-hashes") {
      options.verifyHashes = true;
      continue;
    }

    if (argument === "--release") {
      const releaseId = argv[index + 1];

      if (!releaseId || releaseId.startsWith("--")) {
        throw new Error("--release requires a release directory ID.");
      }

      options.releaseId = releaseId;
      index += 1;
      continue;
    }

    if (argument === "--media-root") {
      const mediaRoot = argv[index + 1];

      if (!mediaRoot || mediaRoot.startsWith("--")) {
        throw new Error("--media-root requires a directory path.");
      }

      options.mediaRoot = mediaRoot;
      index += 1;
      continue;
    }

    if (argument?.startsWith("--")) {
      throw new Error(`Unknown option: ${argument}`);
    }

    if (!options.releaseId) {
      options.releaseId = argument;
      continue;
    }

    throw new Error(`Unexpected argument: ${argument}`);
  }

  return options;
}

export async function runValidationCli(
  argv: readonly string[],
): Promise<number> {
  const options = parseValidationCliOptions(argv);
  const mediaRoot = await resolveMediaRoot(options.mediaRoot);
  const report = await validateMediaLibrary(mediaRoot, {
    ...(options.releaseId ? { releaseId: options.releaseId } : {}),
    verifyHashes: options.verifyHashes,
  });

  process.stdout.write(
    options.json
      ? `${JSON.stringify(report, null, 2)}\n`
      : formatLibraryValidationReport(report),
  );

  return report.summary.blockedCount > 0 ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runValidationCli(process.argv.slice(2))
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      process.stderr.write(
        `Validator error: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 2;
    });
}
