import {
  createHash,
} from "node:crypto";
import {
  copyFile,
  lstat,
  mkdir,
  readFile,
  rename,
  rm,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
  listPublishOperations,
} from "../server/publish-operations.js";
import {
  auditPublishedMediaDeployment,
} from "../server/published-media-deployment.js";
import {
  resolvePublishRoot,
} from "../server/workflow-locations.js";

async function sha256File(
  filePath: string,
): Promise<{ sha256: string; bytes: number }> {
  const content = await readFile(filePath);
  return {
    sha256: createHash("sha256")
      .update(content)
      .digest("hex"),
    bytes: content.length,
  };
}

async function assertNoActivePublishOperation(
  publishRoot: string,
): Promise<void> {
  const history = await listPublishOperations(
    publishRoot,
    { limit: 200 },
  );
  if (
    history.interruptedCount > 0 ||
    history.operations.some(
      (operation) => operation.state === "running",
    )
  ) {
    throw new Error(
      "Deployment staging is blocked while a publish operation is running or interrupted.",
    );
  }
}

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const outputValue = argumentValue("--output");
const confirmation = argumentValue("--confirm");

if (!outputValue) {
  throw new Error(
    "Usage: npm run stage:published-media -- --output /path/to/new-directory --confirm STAGE_PUBLISHED_MEDIA",
  );
}

if (confirmation !== "STAGE_PUBLISHED_MEDIA") {
  throw new Error(
    "Refusing to stage deployment without --confirm STAGE_PUBLISHED_MEDIA.",
  );
}

const publishRoot = path.resolve(
  await resolvePublishRoot(),
);
const outputRoot = path.resolve(outputValue);

if (
  outputRoot === publishRoot ||
  outputRoot.startsWith(`${publishRoot}${path.sep}`) ||
  publishRoot.startsWith(`${outputRoot}${path.sep}`)
) {
  throw new Error(
    "Deployment staging output must be outside published-media and may not contain it.",
  );
}

try {
  await lstat(outputRoot);
  throw new Error(
    `Refusing to overwrite existing deployment staging path: ${outputRoot}`,
  );
} catch (error) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  ) {
    // Expected: output must not exist.
  } else {
    throw error;
  }
}

await assertNoActivePublishOperation(publishRoot);

const audit = await auditPublishedMediaDeployment(
  publishRoot,
);
if (!audit.deployable || !audit.candidateManifest) {
  throw new Error(
    "published-media is not deployment-ready. Run npm run verify:published-media and refresh deployment-manifest.json first.",
  );
}

const manifestPath = path.join(
  publishRoot,
  "deployment-manifest.json",
);
const manifestBytes = await readFile(manifestPath);
const temporaryRoot = `${outputRoot}.tmp-${process.pid}-${Date.now()}`;

await mkdir(temporaryRoot, {
  recursive: false,
});

try {
  for (const file of audit.candidateManifest.files) {
    const source = path.join(
      publishRoot,
      ...file.path.split("/"),
    );
    const destination = path.join(
      temporaryRoot,
      ...file.path.split("/"),
    );
    await mkdir(path.dirname(destination), {
      recursive: true,
    });
    await copyFile(source, destination);
    const copied = await sha256File(destination);
    if (
      copied.sha256 !== file.sha256 ||
      copied.bytes !== file.bytes
    ) {
      throw new Error(
        `Staged deployment file failed hash verification: ${file.path}`,
      );
    }
  }

  const stagedManifestPath = path.join(
    temporaryRoot,
    "deployment-manifest.json",
  );
  await copyFile(
    manifestPath,
    stagedManifestPath,
  );
  const sourceManifestDigest =
    await sha256File(manifestPath);
  const stagedManifestDigest =
    await sha256File(stagedManifestPath);
  if (
    sourceManifestDigest.sha256 !==
      stagedManifestDigest.sha256 ||
    sourceManifestDigest.bytes !==
      stagedManifestDigest.bytes
  ) {
    throw new Error(
      "Staged deployment manifest failed copy verification.",
    );
  }

  await assertNoActivePublishOperation(publishRoot);
  const finalSourceAudit =
    await auditPublishedMediaDeployment(
      publishRoot,
    );
  if (
    !finalSourceAudit.deployable ||
    finalSourceAudit.deploymentManifest.contentFingerprint !==
      audit.deploymentManifest.contentFingerprint
  ) {
    throw new Error(
      "published-media changed while the deployment snapshot was being staged. No output was promoted.",
    );
  }

  await rename(temporaryRoot, outputRoot);
} catch (error) {
  await rm(temporaryRoot, {
    recursive: true,
    force: true,
  }).catch(() => undefined);
  throw error;
}

console.log("Published-media deployment staged.");
console.log(`Source: ${publishRoot}`);
console.log(`Output: ${outputRoot}`);
console.log(
  `Snapshot: ${audit.summary.fileCount + 1} files including deployment-manifest.json · ${audit.summary.totalBytes + manifestBytes.length} bytes`,
);
console.log(
  `Fingerprint: ${audit.deploymentManifest.contentFingerprint}`,
);
