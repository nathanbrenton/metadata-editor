import {
  createHash,
  randomUUID,
} from "node:crypto";
import {
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const receiptReleasePrefixRepairConfirmation =
  "REPAIR_INGEST_RECEIPT_RELEASE_PREFIX";

type JsonRecord = Record<string, unknown>;

type DestinationOccurrence = {
  objectPath: string;
  sourceRelativePath: string;
  targetRelativePath: string;
  bytes?: number;
  sha256?: string;
};

export type ReceiptReleasePrefixRepairPlan = {
  schema: {
    name: "metadata-editor-ingest-receipt-release-prefix-repair";
    version: 1;
  };
  releaseId: string;
  receiptRelativePath: string;
  currentReleasePrefix: string;
  staleReleasePrefix: string | null;
  occurrenceCount: number;
  uniqueDestinationCount: number;
  verifiedDestinationCount: number;
  blockedReasons: string[];
  items: DestinationOccurrence[];
  confirmation: typeof receiptReleasePrefixRepairConfirmation;
  fingerprint: string;
};

function isRecord(value: unknown): value is JsonRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function normalizeRelativePath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\/+/, "");
}

function assertPathWithinRoot(root: string, candidate: string): string {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  const relative = path.relative(resolvedRoot, resolvedCandidate);

  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(
      `Path escapes configured media root: ${resolvedCandidate}`,
    );
  }

  return resolvedCandidate;
}

function releasePrefixFromDestination(
  destinationRelativePath: string,
): string | null {
  const normalized = normalizeRelativePath(destinationRelativePath);
  const parts = normalized.split("/");

  if (parts.length < 3 || parts[0] !== "releases") {
    return null;
  }

  return `releases/${parts[1]}`;
}

function sha256(bytes: Buffer | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function inspectCanonicalDestination(
  mediaRoot: string,
  occurrence: DestinationOccurrence,
): Promise<string | null> {
  const absolutePath = assertPathWithinRoot(
    mediaRoot,
    path.join(mediaRoot, occurrence.targetRelativePath),
  );

  try {
    const stats = await lstat(absolutePath);

    if (stats.isSymbolicLink() || !stats.isFile()) {
      return `Target is not a regular non-symbolic file: ${occurrence.targetRelativePath}`;
    }

    if (
      occurrence.bytes !== undefined &&
      stats.size !== occurrence.bytes
    ) {
      return (
        `Size mismatch for ${occurrence.targetRelativePath}: ` +
        `receipt ${occurrence.bytes}, Library ${stats.size}.`
      );
    }

    if (occurrence.sha256) {
      const actualSha256 = sha256(await readFile(absolutePath));

      if (actualSha256 !== occurrence.sha256) {
        return (
          `SHA-256 mismatch for ${occurrence.targetRelativePath}: ` +
          `receipt ${occurrence.sha256}, Library ${actualSha256}.`
        );
      }
    }

    return null;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return `Target is missing: ${occurrence.targetRelativePath}`;
    }

    throw error;
  }
}

function collectDestinationOccurrences(
  value: unknown,
  currentReleasePrefix: string,
  objectPath = "$",
): Array<{
  objectPath: string;
  sourceRelativePath: string;
  targetRelativePath: string;
  staleReleasePrefix: string;
  bytes?: number;
  sha256?: string;
}> {
  const result: Array<{
    objectPath: string;
    sourceRelativePath: string;
    targetRelativePath: string;
    staleReleasePrefix: string;
    bytes?: number;
    sha256?: string;
  }> = [];

  const visit = (
    candidate: unknown,
    candidatePath: string,
  ): void => {
    if (Array.isArray(candidate)) {
      candidate.forEach((item, index) =>
        visit(item, `${candidatePath}[${index}]`)
      );
      return;
    }

    if (!isRecord(candidate)) {
      return;
    }

    const destination = candidate.destinationRelativePath;

    if (typeof destination === "string") {
      const normalized = normalizeRelativePath(destination);
      const prefix = releasePrefixFromDestination(normalized);

      if (prefix && prefix !== currentReleasePrefix) {
        const suffix = normalized.slice(prefix.length);
        const targetRelativePath =
          `${currentReleasePrefix}${suffix}`;
        const bytes =
          typeof candidate.bytes === "number"
            ? candidate.bytes
            : undefined;
        const sha =
          typeof candidate.destinationSha256 === "string"
            ? candidate.destinationSha256
            : typeof candidate.sourceSha256 === "string"
              ? candidate.sourceSha256
              : undefined;

        result.push({
          objectPath: `${candidatePath}.destinationRelativePath`,
          sourceRelativePath: normalized,
          targetRelativePath,
          staleReleasePrefix: prefix,
          ...(bytes === undefined ? {} : { bytes }),
          ...(sha ? { sha256: sha } : {}),
        });
      }
    }

    for (const [key, item] of Object.entries(candidate)) {
      visit(item, `${candidatePath}.${key}`);
    }
  };

  visit(value, objectPath);
  return result;
}

function rewriteDestinationPrefixes(
  value: unknown,
  staleReleasePrefix: string,
  currentReleasePrefix: string,
): number {
  let rewritten = 0;

  const visit = (candidate: unknown): void => {
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }

    if (!isRecord(candidate)) {
      return;
    }

    const destination = candidate.destinationRelativePath;
    if (typeof destination === "string") {
      const normalized = normalizeRelativePath(destination);

      if (
        normalized === staleReleasePrefix ||
        normalized.startsWith(`${staleReleasePrefix}/`)
      ) {
        candidate.destinationRelativePath =
          `${currentReleasePrefix}${normalized.slice(staleReleasePrefix.length)}`;
        rewritten += 1;
      }
    }

    Object.values(candidate).forEach(visit);
  };

  visit(value);
  return rewritten;
}

function fingerprintPlan(
  receiptSha256: string,
  plan: Omit<ReceiptReleasePrefixRepairPlan, "fingerprint">,
): string {
  return sha256(
    JSON.stringify({
      receiptSha256,
      releaseId: plan.releaseId,
      receiptRelativePath: plan.receiptRelativePath,
      currentReleasePrefix: plan.currentReleasePrefix,
      staleReleasePrefix: plan.staleReleasePrefix,
      items: plan.items,
      blockedReasons: plan.blockedReasons,
    }),
  );
}

export async function buildReceiptReleasePrefixRepairPlan(
  mediaRoot: string,
  releaseId: string,
): Promise<ReceiptReleasePrefixRepairPlan> {
  const currentReleasePrefix = `releases/${releaseId}`;
  const receiptRelativePath =
    `${currentReleasePrefix}/ingest-receipt.json`;
  const receiptPath = assertPathWithinRoot(
    mediaRoot,
    path.join(mediaRoot, receiptRelativePath),
  );
  const receiptText = await readFile(receiptPath, "utf8");
  const receiptSha256 = sha256(receiptText);
  const receipt = JSON.parse(receiptText) as unknown;

  if (!isRecord(receipt)) {
    throw new Error("ingest-receipt.json must contain an object.");
  }

  const release = receipt.release;
  if (
    !isRecord(release) ||
    release.id !== releaseId ||
    release.relativePath !== currentReleasePrefix
  ) {
    throw new Error(
      "The receipt's current release identity does not match the containing canonical release.",
    );
  }

  const occurrences = collectDestinationOccurrences(
    receipt,
    currentReleasePrefix,
  );
  const stalePrefixes = [
    ...new Set(
      occurrences.map((item) => item.staleReleasePrefix),
    ),
  ];
  const blockedReasons: string[] = [];

  if (occurrences.length === 0) {
    blockedReasons.push(
      "No stale destination release prefixes were found in the ingest receipt.",
    );
  }

  if (stalePrefixes.length > 1) {
    blockedReasons.push(
      `Receipt contains multiple stale release prefixes: ${stalePrefixes.join(", ")}.`,
    );
  }

  const staleReleasePrefix =
    stalePrefixes.length === 1 ? stalePrefixes[0] : null;

  const items: DestinationOccurrence[] = occurrences.map(
    ({
      staleReleasePrefix: _staleReleasePrefix,
      ...item
    }) => item,
  );

  const uniqueDestinations = new Map<
    string,
    DestinationOccurrence[]
  >();

  for (const item of items) {
    const group =
      uniqueDestinations.get(item.targetRelativePath) ?? [];
    group.push(item);
    uniqueDestinations.set(item.targetRelativePath, group);
  }

  let verifiedDestinationCount = 0;

  for (const [targetRelativePath, group] of uniqueDestinations) {
    const expectedBytes = [
      ...new Set(
        group
          .map((item) => item.bytes)
          .filter((value): value is number => value !== undefined),
      ),
    ];
    const expectedHashes = [
      ...new Set(
        group
          .map((item) => item.sha256)
          .filter((value): value is string => Boolean(value)),
      ),
    ];

    if (expectedBytes.length > 1) {
      blockedReasons.push(
        `Receipt records disagree on byte size for ${targetRelativePath}.`,
      );
      continue;
    }

    if (expectedHashes.length > 1) {
      blockedReasons.push(
        `Receipt records disagree on SHA-256 for ${targetRelativePath}.`,
      );
      continue;
    }

    const inspectionError =
      await inspectCanonicalDestination(
        mediaRoot,
        {
          objectPath: group[0].objectPath,
          sourceRelativePath: group[0].sourceRelativePath,
          targetRelativePath,
          ...(expectedBytes[0] === undefined
            ? {}
            : { bytes: expectedBytes[0] }),
          ...(expectedHashes[0]
            ? { sha256: expectedHashes[0] }
            : {}),
        },
      );

    if (inspectionError) {
      blockedReasons.push(inspectionError);
    } else {
      verifiedDestinationCount += 1;
    }
  }

  const planWithoutFingerprint: Omit<
    ReceiptReleasePrefixRepairPlan,
    "fingerprint"
  > = {
    schema: {
      name: "metadata-editor-ingest-receipt-release-prefix-repair",
      version: 1,
    },
    releaseId,
    receiptRelativePath,
    currentReleasePrefix,
    staleReleasePrefix,
    occurrenceCount: items.length,
    uniqueDestinationCount: uniqueDestinations.size,
    verifiedDestinationCount,
    blockedReasons,
    items,
    confirmation: receiptReleasePrefixRepairConfirmation,
  };

  return {
    ...planWithoutFingerprint,
    fingerprint: fingerprintPlan(
      receiptSha256,
      planWithoutFingerprint,
    ),
  };
}

async function writeFileAtomically(
  targetPath: string,
  content: string,
): Promise<void> {
  const tempPath =
    `${targetPath}.${randomUUID()}.receipt-prefix-repair.tmp`;
  const file = await open(tempPath, "wx", 0o600);

  try {
    await file.writeFile(content, "utf8");
    await file.sync();
  } finally {
    await file.close();
  }

  await rename(tempPath, targetPath);
}

export async function executeReceiptReleasePrefixRepair(
  mediaRoot: string,
  releaseId: string,
  confirmation: string,
  expectedFingerprint: string,
): Promise<{
  operationId: string;
  manifestRelativePath: string;
  backupRelativePath: string;
  rewrittenCount: number;
  completedAt: string;
}> {
  if (confirmation !== receiptReleasePrefixRepairConfirmation) {
    throw new Error(
      `Confirmation must be ${receiptReleasePrefixRepairConfirmation}.`,
    );
  }

  const plan = await buildReceiptReleasePrefixRepairPlan(
    mediaRoot,
    releaseId,
  );

  if (plan.fingerprint !== expectedFingerprint) {
    throw new Error(
      "Receipt repair plan changed. Review a fresh dry run before applying.",
    );
  }

  if (plan.blockedReasons.length > 0) {
    throw new Error(
      `Receipt release-prefix repair is blocked: ${plan.blockedReasons.join(" ")}`,
    );
  }

  if (!plan.staleReleasePrefix) {
    throw new Error("No stale release prefix is available to repair.");
  }

  const receiptPath = assertPathWithinRoot(
    mediaRoot,
    path.join(mediaRoot, plan.receiptRelativePath),
  );
  const beforeText = await readFile(receiptPath, "utf8");
  const receipt = JSON.parse(beforeText) as unknown;
  const rewrittenCount = rewriteDestinationPrefixes(
    receipt,
    plan.staleReleasePrefix,
    plan.currentReleasePrefix,
  );

  if (rewrittenCount !== plan.occurrenceCount) {
    throw new Error(
      "Receipt changed after review. No repair was written.",
    );
  }

  const nextText = `${JSON.stringify(receipt, null, 2)}\n`;
  JSON.parse(nextText);

  const operationId =
    `receipt-prefix-repair-${randomUUID()}`;
  const operationRelativePath =
    `.metadata-editor-operations/${operationId}`;
  const operationRoot = assertPathWithinRoot(
    mediaRoot,
    path.join(mediaRoot, operationRelativePath),
  );
  const backupRelativePath =
    `${operationRelativePath}/ingest-receipt.before.json`;
  const backupPath = assertPathWithinRoot(
    mediaRoot,
    path.join(mediaRoot, backupRelativePath),
  );
  const manifestRelativePath =
    `${operationRelativePath}/manifest.json`;
  const manifestPath = assertPathWithinRoot(
    mediaRoot,
    path.join(mediaRoot, manifestRelativePath),
  );

  await mkdir(path.dirname(operationRoot), {
    recursive: true,
    mode: 0o700,
  });
  await mkdir(operationRoot, {
    recursive: false,
    mode: 0o700,
  });
  await copyFile(receiptPath, backupPath);

  const startedAt = new Date().toISOString();
  const manifest = {
    schema: {
      name: "metadata-editor-ingest-receipt-release-prefix-repair-operation",
      version: 1,
    },
    operationId,
    releaseId,
    startedAt,
    state: "staging",
    confirmation,
    planFingerprint: plan.fingerprint,
    staleReleasePrefix: plan.staleReleasePrefix,
    currentReleasePrefix: plan.currentReleasePrefix,
    occurrenceCount: plan.occurrenceCount,
    uniqueDestinationCount: plan.uniqueDestinationCount,
    backupRelativePath,
    receiptRelativePath: plan.receiptRelativePath,
    beforeSha256: sha256(beforeText),
    afterSha256: sha256(nextText),
  };

  await writeFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    { mode: 0o600 },
  );

  try {
    await writeFileAtomically(receiptPath, nextText);

    const afterText = await readFile(receiptPath, "utf8");
    if (sha256(afterText) !== manifest.afterSha256) {
      throw new Error(
        "Repaired receipt failed post-write SHA-256 verification.",
      );
    }

    const completedAt = new Date().toISOString();
    await writeFile(
      manifestPath,
      `${JSON.stringify({
        ...manifest,
        state: "completed",
        completedAt,
      }, null, 2)}\n`,
      { mode: 0o600 },
    );

    return {
      operationId,
      manifestRelativePath,
      backupRelativePath,
      rewrittenCount,
      completedAt,
    };
  } catch (error) {
    await copyFile(backupPath, receiptPath);
    await writeFile(
      manifestPath,
      `${JSON.stringify({
        ...manifest,
        state: "rolled-back",
        error:
          error instanceof Error
            ? error.message
            : String(error),
      }, null, 2)}\n`,
      { mode: 0o600 },
    );
    throw error;
  }
}

function usage(): string {
  return [
    "Usage:",
    "  tsx scripts/repair-ingest-receipt-release-prefix.ts <media-root> <release-id>",
    "  tsx scripts/repair-ingest-receipt-release-prefix.ts <media-root> <release-id> --apply REPAIR_INGEST_RECEIPT_RELEASE_PREFIX <fingerprint>",
    "",
    "Dry-run is the default and performs no writes.",
  ].join("\n");
}

async function main(): Promise<void> {
  const [, , mediaRootArg, releaseId, applyFlag, confirmation, fingerprint] =
    process.argv;

  if (!mediaRootArg || !releaseId) {
    console.error(usage());
    process.exitCode = 2;
    return;
  }

  const mediaRoot = path.resolve(mediaRootArg);

  if (!applyFlag) {
    console.log(
      JSON.stringify(
        await buildReceiptReleasePrefixRepairPlan(
          mediaRoot,
          releaseId,
        ),
        null,
        2,
      ),
    );
    return;
  }

  if (
    applyFlag !== "--apply" ||
    !confirmation ||
    !fingerprint
  ) {
    console.error(usage());
    process.exitCode = 2;
    return;
  }

  console.log(
    JSON.stringify(
      await executeReceiptReleasePrefixRepair(
        mediaRoot,
        releaseId,
        confirmation,
        fingerprint,
      ),
      null,
      2,
    ),
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(
    path.resolve(process.argv[1]),
  ).href
) {
  await main();
}
