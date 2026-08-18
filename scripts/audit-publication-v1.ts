import process from "node:process";

import {
  auditPublicationV1Package,
} from "../server/publication-v1-audit.js";
import {
  resolveMediaRoot,
} from "../server/media-root.js";
import {
  resolvePublishRoot,
} from "../server/workflow-locations.js";

const jsonMode = process.argv.includes("--json");
const [mediaRoot, publishRoot] = await Promise.all([
  resolveMediaRoot(),
  resolvePublishRoot(),
]);
const audit = await auditPublicationV1Package(
  mediaRoot,
  publishRoot,
);

if (jsonMode) {
  process.stdout.write(
    `${JSON.stringify(audit, null, 2)}\n`,
  );
} else {
  const totalBytes = Math.max(1, audit.summary.totalBytes);
  const mib = (bytes: number): string =>
    (bytes / 1024 / 1024).toFixed(2);
  const percent = (bytes: number): string =>
    ((bytes / totalBytes) * 100).toFixed(2);

  console.log("Hiplingo v1.0.0 publication audit");
  console.log(`Status: ${audit.status}`);
  console.log(
    `Snapshot: ${audit.summary.fileCount} files · ${mib(audit.summary.totalBytes)} MiB`,
  );
  console.log(
    `Public releases/tracks: ${audit.summary.publicReleaseCount} / ${audit.summary.publicTrackCount}`,
  );
  console.log(
    `Waveforms: ${audit.summary.compactWaveformCount} compact WFP · ${audit.summary.legacyJsonWaveformCount} legacy JSON`,
  );
  console.log(
    `Video files: ${audit.summary.publicVideoFileCount}`,
  );
  console.log(
    `Contract versions: ${audit.summary.contractVersions.join(", ") || "none"}`,
  );
  console.log(
    `Deployment manifest: ${audit.summary.deploymentManifestCurrent ? "current" : "missing/stale"}`,
  );

  console.log("\nSize breakdown:");
  for (const category of audit.categories) {
    console.log(
      `  ${category.category}: ${mib(category.bytes)} MiB · ${percent(category.bytes)}% · ${category.fileCount} files`,
    );
  }

  if (audit.issues.length > 0) {
    console.log("\nRelease-gate issues:");
    for (const issue of audit.issues) {
      console.log(
        `  ${issue.severity === "blocked" ? "BLOCKED" : "WARNING"} ${issue.code}: ${issue.message}`,
      );
    }
  }
}

if (audit.status !== "ready") {
  process.exitCode = 1;
}
