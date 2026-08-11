import path from "node:path";

import {
  auditMediaLibraryFileSpec,
  formatMediaFileSpecAuditSummary,
  formatMediaFileSpecExtensionInventory,
  mediaFileSpecAuditIssueItems,
} from "../server/media-file-spec-audit.js";

function argumentValue(
  name: string,
): string | undefined {
  const index = process.argv.indexOf(name);

  if (index < 0) {
    return undefined;
  }

  return process.argv[index + 1];
}

const jsonOutput = process.argv.includes("--json");
const verboseOutput = process.argv.includes("--verbose");
const compatibleOutput = process.argv.includes("--compatible");
const helpOutput =
  process.argv.includes("--help") ||
  process.argv.includes("-h");
const releaseId = argumentValue("--release");
const root = path.resolve(
  argumentValue("--root") ??
    process.env.MEDIA_LIBRARY_ROOT ??
    "../media-library",
);

if (helpOutput) {
  console.log(`Usage: npm run audit:file-spec -- [options]

Options:
  --release RELEASE_ID  Audit one canonical release
  --root PATH           Override the media-library root
  --compatible          List compatibility masters plus true issues
  --verbose             List every discovered canonical master
  --json                Emit the complete machine-readable audit
  -h, --help            Show this help

Default output is concise: summary, extension inventory, and only
outside-spec or non-canonical-name issue files.`);
  process.exit(0);
}

const result = await auditMediaLibraryFileSpec(
  root,
  releaseId,
);

if (jsonOutput) {
  process.stdout.write(
    `${JSON.stringify(result, null, 2)}\n`,
  );
  process.exit(0);
}

console.log(`Media file spec audit`);
console.log(`Root: ${result.root}`);

if (result.releaseId) {
  console.log(`Release: ${result.releaseId}`);
}

for (const line of formatMediaFileSpecAuditSummary(result)) {
  console.log(line);
}

for (const line of formatMediaFileSpecExtensionInventory(result)) {
  console.log(line);
}

const issueItems = mediaFileSpecAuditIssueItems(result);
const itemsToList = verboseOutput
  ? result.items
  : compatibleOutput
    ? result.items.filter(
        (item) =>
          item.formatClass === "compatible" ||
          item.formatClass === "unsupported" ||
          !item.canonicalName,
      )
    : issueItems;

if (itemsToList.length === 0) {
  console.log(
    "Issues: none · use --compatible or --verbose for file-level listings",
  );
}

for (const item of itemsToList) {
  const flags = [
    item.formatClass,
    item.canonicalName
      ? "canonical-name"
      : `rename→${item.canonicalFilename}`,
  ];

  console.log(
    `${flags.join(" · ")} · ${item.relativePath}`,
  );
}
