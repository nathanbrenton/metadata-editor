import path from "node:path";

import {
  auditMediaLibraryTechnical,
  type MediaTechnicalInventoryEntry,
  type MediaTechnicalReleaseSummary,
} from "../server/media-technical-audit.js";

function argumentValue(
  name: string,
): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0
    ? process.argv[index + 1]
    : undefined;
}

function positiveIntegerArgument(
  name: string,
): number | undefined {
  const raw = argumentValue(name);
  if (!raw) {
    return undefined;
  }

  const parsed = Number(raw);
  if (
    !Number.isInteger(parsed) ||
    parsed < 1 ||
    parsed > 8
  ) {
    throw new Error(
      `${name} must be an integer from 1 to 8.`,
    );
  }

  return parsed;
}

function formatInventory(
  entries: MediaTechnicalInventoryEntry[],
): string {
  return entries
    .map(({ value, count }) => `${value} ${count}`)
    .join(" · ");
}

function printInventoryLine(
  label: string,
  entries: MediaTechnicalInventoryEntry[],
): void {
  if (entries.length === 0) {
    return;
  }

  console.log(`${label}: ${formatInventory(entries)}`);
}

function printVerboseItem(
  item: Awaited<
    ReturnType<typeof auditMediaLibraryTechnical>
  >["items"][number],
): void {
  if (item.probeError) {
    console.log(
      `probe failed · ${item.relativePath} · ${item.probeError}`,
    );
    return;
  }

  const technical = item.technical ?? {};
  const details =
    item.role === "audio-master"
      ? [
          technical.codec,
          technical.sampleRate
            ? `${technical.sampleRate} Hz`
            : undefined,
          technical.bitDepth
            ? `${technical.bitDepth}-bit`
            : technical.sampleFormat,
          technical.channels
            ? `${technical.channels} ch`
            : undefined,
        ]
      : [
          technical.codec,
          technical.profile,
          technical.width && technical.height
            ? `${technical.width}×${technical.height}`
            : undefined,
          technical.pixelFormat,
          item.role === "video-master"
            ? technical.frameRate
            : undefined,
        ];

  console.log(
    [
      item.role,
      ...details.filter(Boolean),
      item.relativePath,
    ].join(" · "),
  );
}

function healthLabel(
  health: MediaTechnicalReleaseSummary["health"],
): string {
  switch (health) {
    case "ready":
      return "Ready";
    case "review":
      return "Review";
    case "blocked":
      return "Blocked";
  }
}

function printReleaseSummary(
  release: MediaTechnicalReleaseSummary,
): void {
  const issues = release.issues.map(
    (issue) => issue.message,
  );

  console.log(
    [
      healthLabel(release.health),
      release.releaseId,
      `${release.summary.total} masters`,
      ...issues,
    ].join(" · "),
  );
}

if (process.argv.includes("--help")) {
  console.log(
    [
      "Usage: npm run audit:media-technical -- [options]",
      "",
      "Options:",
      "  --release RELEASE_ID   Audit one release",
      "  --releases             List every release technical-health summary",
      "  --verbose              List every canonical master after the summary",
      "  --concurrency N        Run 1-8 ffprobe workers (default: 4)",
      "  --json                 Emit structured JSON",
      "  --root PATH            Override media-library root",
      "  --help                 Show this help",
      "",
      "Technical health checks probeability, expected streams, dimensions,",
      "and intra-release audio consistency. Technical Media Contract v1 also",
      "summarizes source-preservation classes and artwork geometry without",
      "requesting conversion. It does not grade sample rate, bit depth,",
      "resolution, codec quality, or change Publish gating.",
    ].join("\n"),
  );
  process.exit(0);
}

const jsonOutput = process.argv.includes("--json");
const verbose = process.argv.includes("--verbose");
const listReleases = process.argv.includes("--releases");
const releaseId = argumentValue("--release");
const concurrency = positiveIntegerArgument(
  "--concurrency",
);
const root = path.resolve(
  argumentValue("--root") ??
    process.env.MEDIA_LIBRARY_ROOT ??
    "../media-library",
);

const result = await auditMediaLibraryTechnical(
  root,
  releaseId,
  { concurrency },
);

if (jsonOutput) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

console.log("Media technical audit");
console.log(`Root: ${result.root}`);
if (result.releaseId) {
  console.log(`Release: ${result.releaseId}`);
}
console.log(
  `${result.summary.total} masters · ${result.summary.probed} probed · ${result.summary.failed} failed`,
);
console.log(
  `Audio ${result.summary.audio} · Artwork ${result.summary.artwork} · Video ${result.summary.video}`,
);
console.log(
  `Release technical health: Ready ${result.healthSummary.ready} · Review ${result.healthSummary.review} · Blocked ${result.healthSummary.blocked}`,
);

console.log("");
console.log("Technical media contract v1");
console.log(
  `Audio preservation: Preferred lossless ${result.contract.audio.preferredLossless} · Compatible lossless ${result.contract.audio.compatibleLossless} · Source-preserved lossy ${result.contract.audio.sourcePreservedLossy} · Review ${result.contract.audio.review}`,
);
console.log(
  `Artwork preservation: Preferred ${result.contract.artwork.preferred} · Compatible ${result.contract.artwork.compatible} · Review ${result.contract.artwork.review}`,
);
console.log(
  `Artwork geometry: Square ${result.contract.artwork.geometry.square} · Landscape ${result.contract.artwork.geometry.landscape} · Portrait ${result.contract.artwork.geometry.portrait} · Unknown ${result.contract.artwork.geometry.unknown}`,
);
console.log(
  [
    "Video policy: Inventory only",
    `${result.contract.video.total} masters`,
    `Preferred containers ${result.contract.video.preferredContainers}`,
    `Compatible containers ${result.contract.video.compatibleContainers}`,
    `Review ${result.contract.video.review}`,
    "no codec/profile threshold",
  ].join(" · "),
);
console.log(
  "Policy: Advisory · preserve source masters · no automatic conversion · no Publish gating",
);

printInventoryLine(
  "Audio codecs",
  result.inventory.audio.codecs,
);
printInventoryLine(
  "Audio sample rates",
  result.inventory.audio.sampleRates,
);
printInventoryLine(
  "Audio bit depths",
  result.inventory.audio.bitDepths,
);
printInventoryLine(
  "Audio sample formats",
  result.inventory.audio.sampleFormats,
);
printInventoryLine(
  "Audio channels",
  result.inventory.audio.channels,
);
printInventoryLine(
  "Artwork codecs",
  result.inventory.artwork.codecs,
);
printInventoryLine(
  "Artwork dimensions",
  result.inventory.artwork.dimensions,
);
printInventoryLine(
  "Artwork pixel formats",
  result.inventory.artwork.pixelFormats,
);
printInventoryLine(
  "Video codecs",
  result.inventory.video.codecs,
);
printInventoryLine(
  "Video profiles",
  result.inventory.video.profiles,
);
printInventoryLine(
  "Video dimensions",
  result.inventory.video.dimensions,
);
printInventoryLine(
  "Video pixel formats",
  result.inventory.video.pixelFormats,
);
printInventoryLine(
  "Video frame rates",
  result.inventory.video.frameRates,
);

const releaseExceptions = result.releases.filter(
  (release) => release.health !== "ready",
);

if (result.releaseId) {
  console.log("");
  console.log("Technical health");
  const releaseSummary = result.releases[0];
  if (releaseSummary) {
    printReleaseSummary(releaseSummary);
  } else {
    console.log("No canonical masters found.");
  }
} else if (releaseExceptions.length > 0) {
  console.log("");
  console.log("Release review");
  releaseExceptions.forEach(printReleaseSummary);
} else {
  console.log("Release review: none");
}

if (listReleases && !result.releaseId) {
  console.log("");
  console.log("All releases");
  result.releases.forEach(printReleaseSummary);
}

const failures = result.items.filter(
  (item) => item.probeError,
);

if (failures.length === 0) {
  console.log(
    verbose
      ? "Probe failures: none"
      : "Probe failures: none · use --verbose for file-level listings",
  );
} else {
  console.log(`Probe failures: ${failures.length}`);
  failures.forEach(printVerboseItem);
}

if (verbose) {
  console.log("");
  console.log("Files");
  result.items
    .filter((item) => !item.probeError)
    .forEach(printVerboseItem);
}
