import {
  createHash,
  randomUUID,
} from "node:crypto";
import {
  chmod,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  spawn,
} from "node:child_process";

import {
  auditPublishedMediaDeployment,
  type PublishedMediaDeploymentManifest,
} from "./published-media-deployment.js";
import {
  resolvePublishedMediaDeploymentProfileSelection,
  type PublishedMediaDeploymentProfile,
  type PublishedMediaDeploymentProfileName,
} from "./deployment-profiles.js";

const deployConfirmation = "DEPLOY_PUBLISHED_MEDIA";
const rollbackConfirmation = "ROLLBACK_PUBLISHED_MEDIA";
const targetPrefixLocal = "local:";
const targetPrefixSsh = "ssh:";
const receiptSchemaName =
  "metadata-editor-published-media-deployment-operation";
const receiptSchemaVersion = 1;

export type PublishedMediaDeploymentTarget = {
  kind: "local" | "ssh";
  configuredValue: string;
  display: string;
  destinationPath: string;
  host?: string;
  sshPort?: number;
};

export type PublishedMediaDeploymentTargetStatus = {
  schema: {
    name: "metadata-editor-published-media-deployment-target-status";
    version: 2;
  };
  generatedAt: string;
  configured: boolean;
  profile: PublishedMediaDeploymentProfile;
  profiles: PublishedMediaDeploymentProfile[];
  architecture: ReturnType<
    typeof resolvePublishedMediaDeploymentProfileSelection
  >["architecture"];
  target?: PublishedMediaDeploymentTarget;
  stateRoot: string;
  deployConfirmation: typeof deployConfirmation;
  rollbackConfirmation: typeof rollbackConfirmation;
  deployCommand: string;
  rollbackCommand: string;
  latestOperation?: PublishedMediaDeploymentOperationReceipt;
};

export type PublishedMediaDeploymentSyncChange = {
  action:
    | "add"
    | "update"
    | "remove"
    | "metadata"
    | "unknown";
  path: string;
  itemized: string;
};

export type PublishedMediaDeploymentSyncPlan = {
  schema: {
    name: "metadata-editor-published-media-deployment-sync-plan";
    version: 2;
  };
  generatedAt: string;
  profile: PublishedMediaDeploymentProfile;
  status: "current" | "changes";
  sourceRoot: string;
  sourceContentFingerprint: string;
  sourceFileCount: number;
  sourceTotalBytes: number;
  target: PublishedMediaDeploymentTarget;
  targetManifest: {
    exists: boolean;
    contentFingerprint?: string;
    generatedAt?: string;
  };
  changes: PublishedMediaDeploymentSyncChange[];
  summary: {
    addCount: number;
    updateCount: number;
    removeCount: number;
    metadataCount: number;
    unknownCount: number;
    changeCount: number;
  };
  planFingerprint: string;
  confirmation: typeof deployConfirmation;
};

export type PublishedMediaDeploymentOperationReceipt = {
  schema: {
    name: typeof receiptSchemaName;
    version: typeof receiptSchemaVersion;
  };
  operationId: string;
  profileName?: PublishedMediaDeploymentProfileName;
  state:
    | "running"
    | "completed"
    | "failed"
    | "rolled-back";
  startedAt: string;
  completedAt?: string;
  rolledBackAt?: string;
  target: PublishedMediaDeploymentTarget;
  sourceContentFingerprint: string;
  previousContentFingerprint?: string;
  planFingerprint: string;
  backupPath: string;
  incomingPath: string;
  summary: PublishedMediaDeploymentSyncPlan["summary"];
  error?: string;
};

type DeploymentEnvironment = NodeJS.ProcessEnv;

type CommandResult = {
  stdout: string;
  stderr: string;
};

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function sanitizeConfiguredTarget(
  value: string,
): string {
  if (/\r|\n|\0/.test(value)) {
    throw new Error(
      "PUBLISHED_MEDIA_DEPLOY_TARGET may not contain control characters.",
    );
  }
  return value.trim();
}

function safeLocalDestination(
  candidate: string,
  publishRoot: string,
): string {
  if (!path.isAbsolute(candidate)) {
    throw new Error(
      "local deployment target must be an absolute path.",
    );
  }

  const resolved = path.resolve(candidate);
  const source = path.resolve(publishRoot);
  const home = path.resolve(process.env.HOME ?? "/");

  if (
    resolved === path.parse(resolved).root ||
    resolved === home ||
    resolved === source ||
    resolved.startsWith(`${source}${path.sep}`) ||
    source.startsWith(`${resolved}${path.sep}`)
  ) {
    throw new Error(
      `Refusing unsafe local deployment target: ${resolved}`,
    );
  }

  return resolved;
}

function safeRemoteDestination(
  candidate: string,
): string {
  if (
    !candidate.startsWith("/") ||
    /\r|\n|\0/.test(candidate) ||
    !/^\/[A-Za-z0-9._~\/-]+$/.test(candidate)
  ) {
    throw new Error(
      "ssh deployment destination must be an absolute POSIX path containing only letters, numbers, dot, underscore, tilde, slash, and hyphen.",
    );
  }

  const normalized = path.posix.normalize(candidate);
  const segments = normalized.split("/").filter(Boolean);
  if (
    normalized === "/" ||
    segments.length < 3 ||
    ["/var", "/var/www", "/srv", "/home", "/Users"].includes(
      normalized,
    )
  ) {
    throw new Error(
      `Refusing broad ssh deployment destination: ${normalized}`,
    );
  }

  return normalized;
}

function parseSshPort(
  value: string | undefined,
): number | undefined {
  if (!value) {
    return undefined;
  }
  const port = Number(value);
  if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    throw new Error(
      "PUBLISHED_MEDIA_DEPLOY_SSH_PORT must be an integer from 1 through 65535.",
    );
  }
  return port;
}

export function resolvePublishedMediaDeploymentTarget(
  publishRoot: string,
  environment: DeploymentEnvironment = process.env,
): PublishedMediaDeploymentTarget | null {
  const configuredRaw =
    environment.PUBLISHED_MEDIA_DEPLOY_TARGET;
  if (!configuredRaw?.trim()) {
    return null;
  }

  const configuredValue =
    sanitizeConfiguredTarget(configuredRaw);

  if (configuredValue.startsWith(targetPrefixLocal)) {
    const destinationPath = safeLocalDestination(
      configuredValue.slice(targetPrefixLocal.length),
      publishRoot,
    );
    return {
      kind: "local",
      configuredValue,
      display: `local:${destinationPath}`,
      destinationPath,
    };
  }

  if (configuredValue.startsWith(targetPrefixSsh)) {
    const remainder = configuredValue.slice(
      targetPrefixSsh.length,
    );
    const separator = remainder.indexOf(":");
    if (separator <= 0) {
      throw new Error(
        "ssh deployment target must use ssh:user@host:/absolute/path.",
      );
    }
    const host = remainder.slice(0, separator);
    const rawDestination = remainder.slice(separator + 1);
    if (
      !/^(?:[A-Za-z0-9._-]+@)?[A-Za-z0-9.-]+$/.test(
        host,
      )
    ) {
      throw new Error(
        "ssh deployment host may contain only a user name, hostname, dots, underscores, and hyphens.",
      );
    }
    const destinationPath =
      safeRemoteDestination(rawDestination);
    const sshPort = parseSshPort(
      environment.PUBLISHED_MEDIA_DEPLOY_SSH_PORT,
    );
    return {
      kind: "ssh",
      configuredValue,
      display: `ssh:${host}:${destinationPath}`,
      destinationPath,
      host,
      ...(sshPort ? { sshPort } : {}),
    };
  }

  throw new Error(
    "PUBLISHED_MEDIA_DEPLOY_TARGET must begin with local: or ssh:.",
  );
}

export function resolvePublishedMediaDeploymentStateRoot(
  publishRoot: string,
  environment: DeploymentEnvironment = process.env,
  profileName?: PublishedMediaDeploymentProfileName,
): string {
  const configured =
    environment.PUBLISHED_MEDIA_DEPLOY_STATE_ROOT;
  const activeProfile =
    profileName ??
    (environment.PUBLISHED_MEDIA_DEPLOY_PROFILE as
      | PublishedMediaDeploymentProfileName
      | undefined) ??
    "custom";
  const candidate = configured?.trim()
    ? path.resolve(configured)
    : path.resolve(
        `${publishRoot}.deployments`,
        activeProfile,
      );
  const source = path.resolve(publishRoot);

  if (
    candidate === source ||
    candidate.startsWith(`${source}${path.sep}`)
  ) {
    throw new Error(
      "PUBLISHED_MEDIA_DEPLOY_STATE_ROOT must remain outside published-media.",
    );
  }

  return candidate;
}

function operationReceiptPath(
  stateRoot: string,
  operationId: string,
): string {
  return path.join(
    stateRoot,
    `${operationId}.json`,
  );
}

async function writeOperationReceipt(
  stateRoot: string,
  receipt: PublishedMediaDeploymentOperationReceipt,
): Promise<void> {
  await mkdir(stateRoot, { recursive: true });
  const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
  await writeFile(
    operationReceiptPath(
      stateRoot,
      receipt.operationId,
    ),
    serialized,
    "utf8",
  );
  await writeFile(
    path.join(stateRoot, "latest.json"),
    serialized,
    "utf8",
  );
}

function parseReceipt(
  value: unknown,
): PublishedMediaDeploymentOperationReceipt | null {
  if (
    !isRecord(value) ||
    !isRecord(value.schema) ||
    value.schema.name !== receiptSchemaName ||
    value.schema.version !== receiptSchemaVersion ||
    typeof value.operationId !== "string" ||
    typeof value.state !== "string" ||
    typeof value.startedAt !== "string" ||
    !isRecord(value.target) ||
    typeof value.sourceContentFingerprint !== "string" ||
    typeof value.planFingerprint !== "string" ||
    typeof value.backupPath !== "string" ||
    typeof value.incomingPath !== "string" ||
    !isRecord(value.summary)
  ) {
    return null;
  }

  return value as PublishedMediaDeploymentOperationReceipt;
}

async function readLatestReceipt(
  stateRoot: string,
): Promise<PublishedMediaDeploymentOperationReceipt | undefined> {
  try {
    const parsed = JSON.parse(
      await readFile(
        path.join(stateRoot, "latest.json"),
        "utf8",
      ),
    ) as unknown;
    return parseReceipt(parsed) ?? undefined;
  } catch (error) {
    if (
      isRecord(error) &&
      error.code === "ENOENT"
    ) {
      return undefined;
    }
    throw error;
  }
}

export async function buildPublishedMediaDeploymentTargetStatus(
  publishRoot: string,
  environment: DeploymentEnvironment = process.env,
  requestedProfile?: string,
): Promise<PublishedMediaDeploymentTargetStatus> {
  const selection =
    resolvePublishedMediaDeploymentProfileSelection(
      environment,
      requestedProfile,
    );
  const target = resolvePublishedMediaDeploymentTarget(
    publishRoot,
    selection.environment,
  );
  const stateRoot =
    resolvePublishedMediaDeploymentStateRoot(
      publishRoot,
      selection.environment,
      selection.profile.name,
    );
  const latestOperation = await readLatestReceipt(
    stateRoot,
  );

  return {
    schema: {
      name: "metadata-editor-published-media-deployment-target-status",
      version: 2,
    },
    generatedAt: new Date().toISOString(),
    configured: target !== null,
    profile: selection.profile,
    profiles: selection.profiles,
    architecture: selection.architecture,
    ...(target ? { target } : {}),
    stateRoot,
    deployConfirmation,
    rollbackConfirmation,
    deployCommand:
      `npm run deploy:published-media -- --profile ${selection.profile.name} --plan-fingerprint <reviewed-fingerprint> --confirm DEPLOY_PUBLISHED_MEDIA`,
    rollbackCommand:
      `npm run rollback:published-media -- --profile ${selection.profile.name} --confirm ROLLBACK_PUBLISHED_MEDIA`,
    ...(latestOperation ? { latestOperation } : {}),
  };
}

function shellQuote(
  value: string,
): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function sshArgs(
  target: PublishedMediaDeploymentTarget,
): string[] {
  if (target.kind !== "ssh" || !target.host) {
    throw new Error(
      "ssh arguments requested for a non-ssh target.",
    );
  }
  return [
    ...(target.sshPort
      ? ["-p", String(target.sshPort)]
      : []),
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=10",
    target.host,
  ];
}

function rsyncRemoteShell(
  target: PublishedMediaDeploymentTarget,
): string | undefined {
  if (target.kind !== "ssh") {
    return undefined;
  }
  const parts = [
    "ssh",
    ...(target.sshPort
      ? ["-p", String(target.sshPort)]
      : []),
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=10",
  ];
  return parts.join(" ");
}

function rsyncDestination(
  target: PublishedMediaDeploymentTarget,
  destinationPath = target.destinationPath,
): string {
  if (target.kind === "local") {
    return `${destinationPath}${path.sep}`;
  }
  return `${target.host}:${destinationPath}/`;
}

async function runCommand(
  executable: string,
  args: readonly string[],
  options: {
    timeoutMs?: number;
  } = {},
): Promise<CommandResult> {
  return await new Promise<CommandResult>((resolve, reject) => {
    const child = spawn(executable, [...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      child.kill("SIGTERM");
      settled = true;
      reject(
        new Error(
          `${executable} timed out after ${options.timeoutMs ?? 60_000}ms.`,
        ),
      );
    }, options.timeoutMs ?? 60_000);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
      if (stdout.length > 8 * 1024 * 1024) {
        child.kill("SIGTERM");
      }
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
      if (stderr.length > 8 * 1024 * 1024) {
        child.kill("SIGTERM");
      }
    });
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code, signal) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const detail = stderr.trim() || stdout.trim();
      reject(
        new Error(
          `${executable} exited ${code ?? `by signal ${signal ?? "unknown"}`}${detail ? `: ${detail}` : ""}`,
        ),
      );
    });
  });
}

function rsyncBaseArgs(
  target: PublishedMediaDeploymentTarget,
): string[] {
  const remoteShell = rsyncRemoteShell(target);
  return [
    "-a",
    "--checksum",
    "--delete",
    "--chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r",
    ...(remoteShell
      ? ["-e", remoteShell]
      : []),
  ];
}

function isNewRsyncItem(itemized: string): boolean {
  const attributes = itemized.slice(2);
  return (
    attributes.length > 0 &&
    [...attributes].every((attribute) => attribute === "+")
  );
}

export function parseRsyncChangeLine(
  line: string,
): PublishedMediaDeploymentSyncChange | null {
  const separator = line.indexOf("|");
  if (separator < 0) {
    return null;
  }
  const itemized = line.slice(0, separator).trim();
  const rawPath = line.slice(separator + 1).trim();
  if (!itemized || !rawPath) {
    return null;
  }
  const normalizedPath = rawPath
    .replace(/\s+->\s+.*$/, "")
    .replace(/^\.\//, "");
  if (
    !normalizedPath ||
    normalizedPath === "." ||
    normalizedPath.endsWith("/")
  ) {
    return null;
  }

  let action: PublishedMediaDeploymentSyncChange["action"] =
    "unknown";
  if (itemized.startsWith("*deleting")) {
    action = "remove";
  } else if (isNewRsyncItem(itemized)) {
    action = "add";
  } else if (itemized[0] === ">" || itemized[0] === "<") {
    action = "update";
  } else if (/^[.ch]\S+/.test(itemized)) {
    action = "metadata";
  }

  return {
    action,
    path: normalizedPath,
    itemized,
  };
}

async function listSourceFilesForInitialLocalPlan(
  sourceRoot: string,
): Promise<PublishedMediaDeploymentSyncChange[]> {
  const root = path.resolve(sourceRoot);
  const changes: PublishedMediaDeploymentSyncChange[] = [];

  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, {
      withFileTypes: true,
    });
    entries.sort((left, right) =>
      left.name.localeCompare(right.name),
    );
    for (const entry of entries) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(absolute);
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      changes.push({
        action: "add",
        path: path
          .relative(root, absolute)
          .split(path.sep)
          .join("/"),
        itemized: ">f+++++++++",
      });
    }
  };

  await visit(root);
  return changes;
}

async function runRsyncPlan(
  sourceRoot: string,
  target: PublishedMediaDeploymentTarget,
  destinationPath = target.destinationPath,
): Promise<PublishedMediaDeploymentSyncChange[]> {
  if (
    target.kind === "local" &&
    !(await localPathExists(destinationPath))
  ) {
    return await listSourceFilesForInitialLocalPlan(
      sourceRoot,
    );
  }

  const args = [
    ...rsyncBaseArgs(target),
    "--dry-run",
    "--itemize-changes",
    "--out-format=%i|%n",
    `${path.resolve(sourceRoot)}${path.sep}`,
    rsyncDestination(target, destinationPath),
  ];
  const result = await runCommand(
    process.env.RSYNC_PATH ?? "rsync",
    args,
    { timeoutMs: 90_000 },
  );

  return result.stdout
    .split(/\r?\n/)
    .map(parseRsyncChangeLine)
    .filter(
      (
        change,
      ): change is PublishedMediaDeploymentSyncChange =>
        change !== null,
    );
}

function summarizeChanges(
  changes: readonly PublishedMediaDeploymentSyncChange[],
): PublishedMediaDeploymentSyncPlan["summary"] {
  const count = (
    action: PublishedMediaDeploymentSyncChange["action"],
  ) => changes.filter(
    (change) => change.action === action,
  ).length;

  return {
    addCount: count("add"),
    updateCount: count("update"),
    removeCount: count("remove"),
    metadataCount: count("metadata"),
    unknownCount: count("unknown"),
    changeCount: changes.length,
  };
}

function deploymentPlanFingerprint(
  sourceContentFingerprint: string,
  target: PublishedMediaDeploymentTarget,
  changes: readonly PublishedMediaDeploymentSyncChange[],
  profileName: PublishedMediaDeploymentProfileName,
): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        sourceContentFingerprint,
        profileName,
        target: {
          kind: target.kind,
          display: target.display,
          destinationPath: target.destinationPath,
          host: target.host ?? null,
          sshPort: target.sshPort ?? null,
        },
        changes: changes.map((change) => ({
          action: change.action,
          path: change.path,
          itemized: change.itemized,
        })),
      }),
    )
    .digest("hex");
}

function parseDeploymentManifest(
  value: unknown,
): PublishedMediaDeploymentManifest | null {
  if (
    !isRecord(value) ||
    !isRecord(value.schema) ||
    value.schema.name !==
      "metadata-editor-published-media-deployment-manifest" ||
    value.schema.version !== 1 ||
    !isRecord(value.snapshot) ||
    typeof value.snapshot.contentFingerprint !== "string" ||
    typeof value.generatedAt !== "string"
  ) {
    return null;
  }
  return value as PublishedMediaDeploymentManifest;
}

async function readTargetManifest(
  target: PublishedMediaDeploymentTarget,
  destinationPath = target.destinationPath,
): Promise<PublishedMediaDeploymentManifest | null> {
  const manifestPath =
    target.kind === "local"
      ? path.join(
          destinationPath,
          "deployment-manifest.json",
        )
      : path.posix.join(
          destinationPath,
          "deployment-manifest.json",
        );

  try {
    let content: string;
    if (target.kind === "local") {
      content = await readFile(manifestPath, "utf8");
    } else {
      const result = await runCommand(
        process.env.SSH_PATH ?? "ssh",
        [
          ...sshArgs(target),
          `cat -- ${shellQuote(manifestPath)}`,
        ],
        { timeoutMs: 30_000 },
      );
      content = result.stdout;
    }
    return parseDeploymentManifest(
      JSON.parse(content) as unknown,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    if (
      message.includes("No such file") ||
      message.includes("ENOENT") ||
      message.includes("cannot stat")
    ) {
      return null;
    }
    throw error;
  }
}

export async function buildPublishedMediaDeploymentSyncPlan(
  publishRoot: string,
  environment: DeploymentEnvironment = process.env,
  requestedProfile?: string,
): Promise<PublishedMediaDeploymentSyncPlan> {
  const selection =
    resolvePublishedMediaDeploymentProfileSelection(
      environment,
      requestedProfile,
    );
  const target = resolvePublishedMediaDeploymentTarget(
    publishRoot,
    selection.environment,
  );
  if (!target) {
    throw new Error(
      selection.profile.name === "production"
        ? "Production deployment is not configured. Set PUBLISHED_MEDIA_PRODUCTION_TARGET=ssh:hiplingo-prod:/var/www/hiplingo.com/published-media. The SSH alias owns the remote user, key, host address, and other connection details."
        : "No deployment target is configured for the selected deployment profile.",
    );
  }

  const audit = await auditPublishedMediaDeployment(
    publishRoot,
  );
  if (
    !audit.deployable ||
    !audit.deploymentManifest.current ||
    !audit.deploymentManifest.contentFingerprint
  ) {
    throw new Error(
      "published-media is not deployment-ready. Verify the fleet and refresh deployment-manifest.json before checking the host.",
    );
  }

  const changes = await runRsyncPlan(
    publishRoot,
    target,
  );
  const targetManifest = await readTargetManifest(
    target,
  );
  const summary = summarizeChanges(changes);
  const planFingerprint = deploymentPlanFingerprint(
    audit.deploymentManifest.contentFingerprint,
    target,
    changes,
    selection.profile.name,
  );

  return {
    schema: {
      name: "metadata-editor-published-media-deployment-sync-plan",
      version: 2,
    },
    generatedAt: new Date().toISOString(),
    profile: selection.profile,
    status:
      changes.length === 0 ? "current" : "changes",
    sourceRoot: path.resolve(publishRoot),
    sourceContentFingerprint:
      audit.deploymentManifest.contentFingerprint,
    sourceFileCount: audit.summary.fileCount + 1,
    sourceTotalBytes:
      audit.summary.totalBytes +
      (audit.deploymentManifest.bytes ?? 0),
    target,
    targetManifest: targetManifest
      ? {
          exists: true,
          contentFingerprint:
            targetManifest.snapshot.contentFingerprint,
          generatedAt: targetManifest.generatedAt,
        }
      : {
          exists: false,
        },
    changes,
    summary,
    planFingerprint,
    confirmation: deployConfirmation,
  };
}

function targetSiblingPath(
  target: PublishedMediaDeploymentTarget,
  suffix: string,
): string {
  return target.kind === "local"
    ? `${target.destinationPath}${suffix}`
    : `${target.destinationPath}${suffix}`;
}

async function localPathExists(
  candidate: string,
): Promise<boolean> {
  try {
    await stat(candidate);
    return true;
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function sshPathExists(
  target: PublishedMediaDeploymentTarget,
  candidate: string,
): Promise<boolean> {
  if (target.kind !== "ssh") {
    return localPathExists(candidate);
  }
  try {
    await runCommand(
      process.env.SSH_PATH ?? "ssh",
      [
        ...sshArgs(target),
        `test -e ${shellQuote(candidate)}`,
      ],
      { timeoutMs: 30_000 },
    );
    return true;
  } catch {
    return false;
  }
}

async function removeTargetPath(
  target: PublishedMediaDeploymentTarget,
  candidate: string,
): Promise<void> {
  if (target.kind === "local") {
    await rm(candidate, {
      recursive: true,
      force: true,
    });
    return;
  }
  await runCommand(
    process.env.SSH_PATH ?? "ssh",
    [
      ...sshArgs(target),
      `rm -rf -- ${shellQuote(candidate)}`,
    ],
    { timeoutMs: 60_000 },
  );
}

async function ensureTargetParent(
  target: PublishedMediaDeploymentTarget,
): Promise<void> {
  const parent =
    target.kind === "local"
      ? path.dirname(target.destinationPath)
      : path.posix.dirname(target.destinationPath);
  if (target.kind === "local") {
    await mkdir(parent, { recursive: true });
    return;
  }
  await runCommand(
    process.env.SSH_PATH ?? "ssh",
    [
      ...sshArgs(target),
      `test -d ${shellQuote(parent)}`,
    ],
    { timeoutMs: 30_000 },
  );
}

function publishedMediaRsyncTimeoutMs(): number {
  const configured = process.env.PUBLISHED_MEDIA_RSYNC_TIMEOUT_MS?.trim();
  if (!configured) {
    return 60 * 60_000;
  }

  const timeoutMs = Number(configured);
  if (!Number.isFinite(timeoutMs) || timeoutMs < 60_000) {
    throw new Error(
      "PUBLISHED_MEDIA_RSYNC_TIMEOUT_MS must be a finite number of milliseconds >= 60000.",
    );
  }

  return Math.trunc(timeoutMs);
}

async function normalizeLocalPublishedMediaPermissions(
  root: string,
): Promise<void> {
  await chmod(root, 0o755);
  const entries = await readdir(root, {
    withFileTypes: true,
  });

  for (const entry of entries) {
    const absolute = path.join(root, entry.name);

    if (entry.isSymbolicLink()) {
      throw new Error(
        `Published-media deployment target contains a symbolic link during permission normalization: ${absolute}`,
      );
    }

    if (entry.isDirectory()) {
      await normalizeLocalPublishedMediaPermissions(
        absolute,
      );
      continue;
    }

    if (entry.isFile()) {
      await chmod(absolute, 0o644);
      continue;
    }

    throw new Error(
      `Published-media deployment target contains an unsupported filesystem entry during permission normalization: ${absolute}`,
    );
  }
}

async function assertLocalPublishedMediaPermissions(
  root: string,
): Promise<void> {
  const rootMode = (await stat(root)).mode & 0o777;
  if (rootMode !== 0o755) {
    throw new Error(
      `Published-media deployment directory mode is ${rootMode.toString(8)} instead of 755: ${root}`,
    );
  }

  const entries = await readdir(root, {
    withFileTypes: true,
  });

  for (const entry of entries) {
    const absolute = path.join(root, entry.name);

    if (entry.isDirectory()) {
      await assertLocalPublishedMediaPermissions(
        absolute,
      );
      continue;
    }

    if (entry.isFile()) {
      const mode = (await stat(absolute)).mode & 0o777;
      if (mode !== 0o644) {
        throw new Error(
          `Published-media deployment file mode is ${mode.toString(8)} instead of 644: ${absolute}`,
        );
      }
      continue;
    }

    throw new Error(
      `Published-media deployment target contains an unsupported filesystem entry during permission verification: ${absolute}`,
    );
  }
}

function remotePublishedMediaPermissionCommand(
  root: string,
  normalize: boolean,
): string {
  const quotedRoot = shellQuote(root);
  return [
    "set -eu",
    `test -d ${quotedRoot}`,
    ...(normalize
      ? [
          `find ${quotedRoot} -type d -exec chmod 0755 {} +`,
          `find ${quotedRoot} -type f -exec chmod 0644 {} +`,
        ]
      : []),
    `bad_dir="$(find ${quotedRoot} -type d ! -perm 0755 -print -quit)"; if [ -n "$bad_dir" ]; then echo "Published-media deployment contains a non-0755 directory: $bad_dir" >&2; exit 1; fi`,
    `bad_file="$(find ${quotedRoot} -type f ! -perm 0644 -print -quit)"; if [ -n "$bad_file" ]; then echo "Published-media deployment contains a non-0644 file: $bad_file" >&2; exit 1; fi`,
  ].join("; ");
}

export async function assertPublishedMediaTargetPermissions(
  target: PublishedMediaDeploymentTarget,
  root = target.destinationPath,
): Promise<void> {
  if (target.kind === "local") {
    await assertLocalPublishedMediaPermissions(root);
    return;
  }

  await runCommand(
    process.env.SSH_PATH ?? "ssh",
    [
      ...sshArgs(target),
      remotePublishedMediaPermissionCommand(
        root,
        false,
      ),
    ],
    { timeoutMs: 60_000 },
  );
}

export async function normalizePublishedMediaTargetPermissions(
  target: PublishedMediaDeploymentTarget,
  root = target.destinationPath,
): Promise<void> {
  if (target.kind === "local") {
    await normalizeLocalPublishedMediaPermissions(root);
  } else {
    await runCommand(
      process.env.SSH_PATH ?? "ssh",
      [
        ...sshArgs(target),
        remotePublishedMediaPermissionCommand(
          root,
          true,
        ),
      ],
      { timeoutMs: 60_000 },
    );
  }

  await assertPublishedMediaTargetPermissions(
    target,
    root,
  );
}

async function syncToIncoming(
  publishRoot: string,
  target: PublishedMediaDeploymentTarget,
  incomingPath: string,
): Promise<void> {
  await runCommand(
    process.env.RSYNC_PATH ?? "rsync",
    [
      ...rsyncBaseArgs(target),
      `${path.resolve(publishRoot)}${path.sep}`,
      rsyncDestination(target, incomingPath),
    ],
    { timeoutMs: publishedMediaRsyncTimeoutMs() },
  );

  /*
   * Defense in depth: rsync --chmod is retained, but the incoming tree must
   * independently prove the public web permission contract before promotion.
   */
  await normalizePublishedMediaTargetPermissions(
    target,
    incomingPath,
  );

  const verifyChanges = await runRsyncPlan(
    publishRoot,
    target,
    incomingPath,
  );
  if (verifyChanges.length > 0) {
    throw new Error(
      `Incoming deployment failed checksum verification; ${verifyChanges.length} difference(s) remain.`,
    );
  }
}

async function promoteTarget(
  target: PublishedMediaDeploymentTarget,
  incomingPath: string,
  backupPath: string,
): Promise<void> {
  if (target.kind === "local") {
    await rm(backupPath, {
      recursive: true,
      force: true,
    });
    const hadCurrent = await localPathExists(
      target.destinationPath,
    );
    if (hadCurrent) {
      await rename(
        target.destinationPath,
        backupPath,
      );
    }
    try {
      await rename(
        incomingPath,
        target.destinationPath,
      );
    } catch (error) {
      if (
        hadCurrent &&
        !(await localPathExists(target.destinationPath)) &&
        (await localPathExists(backupPath))
      ) {
        await rename(
          backupPath,
          target.destinationPath,
        ).catch(() => undefined);
      }
      throw error;
    }
    return;
  }

  const destination = shellQuote(
    target.destinationPath,
  );
  const incoming = shellQuote(incomingPath);
  const backup = shellQuote(backupPath);
  const command = [
    "set -eu",
    `rm -rf -- ${backup}`,
    `had_current=0; if [ -e ${destination} ]; then mv -- ${destination} ${backup}; had_current=1; fi`,
    `if mv -- ${incoming} ${destination}; then :; else if [ \"$had_current\" -eq 1 ] && [ ! -e ${destination} ] && [ -e ${backup} ]; then mv -- ${backup} ${destination}; fi; exit 1; fi`,
  ].join("; ");
  await runCommand(
    process.env.SSH_PATH ?? "ssh",
    [
      ...sshArgs(target),
      command,
    ],
    { timeoutMs: 60_000 },
  );
}

async function restoreBackupAfterFailedVerification(
  target: PublishedMediaDeploymentTarget,
  backupPath: string,
): Promise<void> {
  const failedPath = targetSiblingPath(
    target,
    `.metadata-editor-failed-${Date.now()}`,
  );
  if (target.kind === "local") {
    if (!(await localPathExists(backupPath))) {
      return;
    }
    if (await localPathExists(target.destinationPath)) {
      await rename(
        target.destinationPath,
        failedPath,
      );
    }
    await rename(
      backupPath,
      target.destinationPath,
    );
    return;
  }
  if (!(await sshPathExists(target, backupPath))) {
    return;
  }
  const command = [
    "set -eu",
    `if [ -e ${shellQuote(target.destinationPath)} ]; then mv -- ${shellQuote(target.destinationPath)} ${shellQuote(failedPath)}; fi`,
    `mv -- ${shellQuote(backupPath)} ${shellQuote(target.destinationPath)}`,
  ].join("; ");
  await runCommand(
    process.env.SSH_PATH ?? "ssh",
    [
      ...sshArgs(target),
      command,
    ],
    { timeoutMs: 60_000 },
  );
}

export async function executePublishedMediaDeployment(
  publishRoot: string,
  options: {
    confirmation: string;
    planFingerprint: string;
    environment?: DeploymentEnvironment;
    profileName?: string;
  },
): Promise<PublishedMediaDeploymentOperationReceipt> {
  if (options.confirmation !== deployConfirmation) {
    throw new Error(
      `Refusing deployment without confirmation ${deployConfirmation}.`,
    );
  }
  const environment = options.environment ?? process.env;
  const plan = await buildPublishedMediaDeploymentSyncPlan(
    publishRoot,
    environment,
    options.profileName,
  );
  if (plan.planFingerprint !== options.planFingerprint) {
    throw new Error(
      "Deployment plan fingerprint changed. Review a fresh dry-run before deploying.",
    );
  }
  if (plan.status === "current") {
    throw new Error(
      "Deployment target is already current; no write is required.",
    );
  }

  const target = plan.target;
  const stateRoot =
    resolvePublishedMediaDeploymentStateRoot(
      publishRoot,
      resolvePublishedMediaDeploymentProfileSelection(
        environment,
        options.profileName,
      ).environment,
      plan.profile.name,
    );
  const previousOperation = await readLatestReceipt(
    stateRoot,
  );
  if (previousOperation?.state === "running") {
    throw new Error(
      `A previous deployment operation is still recorded as running: ${previousOperation.operationId}. Review its receipt in ${stateRoot} before starting another deployment.`,
    );
  }
  const operationId = `deployment-${randomUUID()}`;
  const suffix = `.${operationId}`;
  const incomingPath = targetSiblingPath(
    target,
    `.metadata-editor-incoming${suffix}`,
  );
  const backupPath = targetSiblingPath(
    target,
    ".metadata-editor-backup",
  );
  const previousManifest = await readTargetManifest(
    target,
  );
  let receipt: PublishedMediaDeploymentOperationReceipt = {
    schema: {
      name: receiptSchemaName,
      version: receiptSchemaVersion,
    },
    operationId,
    profileName: plan.profile.name,
    state: "running",
    startedAt: new Date().toISOString(),
    target,
    sourceContentFingerprint:
      plan.sourceContentFingerprint,
    ...(previousManifest
      ? {
          previousContentFingerprint:
            previousManifest.snapshot.contentFingerprint,
        }
      : {}),
    planFingerprint: plan.planFingerprint,
    backupPath,
    incomingPath,
    summary: plan.summary,
  };
  await writeOperationReceipt(stateRoot, receipt);

  try {
    await ensureTargetParent(target);
    await removeTargetPath(target, incomingPath);
    await syncToIncoming(
      publishRoot,
      target,
      incomingPath,
    );

    const finalSource =
      await auditPublishedMediaDeployment(
        publishRoot,
      );
    if (
      !finalSource.deployable ||
      finalSource.deploymentManifest.contentFingerprint !==
        plan.sourceContentFingerprint
    ) {
      throw new Error(
        "published-media changed after the reviewed deployment plan. No target promotion was allowed.",
      );
    }

    await promoteTarget(
      target,
      incomingPath,
      backupPath,
    );

    const postPromotionChanges = await runRsyncPlan(
      publishRoot,
      target,
    );
    if (postPromotionChanges.length > 0) {
      await restoreBackupAfterFailedVerification(
        target,
        backupPath,
      );
      throw new Error(
        `Deployment target failed post-promotion verification; ${postPromotionChanges.length} difference(s) remain. Previous deployment was restored when a backup was available.`,
      );
    }

    const targetManifest = await readTargetManifest(
      target,
    );
    if (
      !targetManifest ||
      targetManifest.snapshot.contentFingerprint !==
        plan.sourceContentFingerprint
    ) {
      await restoreBackupAfterFailedVerification(
        target,
        backupPath,
      );
      throw new Error(
        "Deployment target manifest fingerprint does not match the reviewed local snapshot. Previous deployment was restored when a backup was available.",
      );
    }

    receipt = {
      ...receipt,
      state: "completed",
      completedAt: new Date().toISOString(),
    };
    await writeOperationReceipt(stateRoot, receipt);
    return receipt;
  } catch (error) {
    await removeTargetPath(
      target,
      incomingPath,
    ).catch(() => undefined);
    receipt = {
      ...receipt,
      state: "failed",
      completedAt: new Date().toISOString(),
      error:
        error instanceof Error
          ? error.message
          : String(error),
    };
    await writeOperationReceipt(stateRoot, receipt);
    throw error;
  }
}

async function assertBackupFingerprint(
  receipt: PublishedMediaDeploymentOperationReceipt,
): Promise<void> {
  if (!receipt.previousContentFingerprint) {
    throw new Error(
      "The latest deployment did not replace an existing target, so no previous snapshot is available for rollback.",
    );
  }
  const manifest = await readTargetManifest(
    receipt.target,
    receipt.backupPath,
  );
  if (
    !manifest ||
    manifest.snapshot.contentFingerprint !==
      receipt.previousContentFingerprint
  ) {
    throw new Error(
      "Rollback backup manifest does not match the recorded previous deployment fingerprint.",
    );
  }
}

export async function rollbackPublishedMediaDeployment(
  publishRoot: string,
  options: {
    confirmation: string;
    environment?: DeploymentEnvironment;
    profileName?: string;
  },
): Promise<PublishedMediaDeploymentOperationReceipt> {
  if (options.confirmation !== rollbackConfirmation) {
    throw new Error(
      `Refusing rollback without confirmation ${rollbackConfirmation}.`,
    );
  }
  const environment = options.environment ?? process.env;
  const selection =
    resolvePublishedMediaDeploymentProfileSelection(
      environment,
      options.profileName,
    );
  const stateRoot =
    resolvePublishedMediaDeploymentStateRoot(
      publishRoot,
      selection.environment,
      selection.profile.name,
    );
  const receipt = await readLatestReceipt(stateRoot);
  if (!receipt || receipt.state !== "completed") {
    throw new Error(
      "No completed deployment operation is available for rollback.",
    );
  }
  const configuredTarget =
    resolvePublishedMediaDeploymentTarget(
      publishRoot,
      selection.environment,
    );
  if (
    !configuredTarget ||
    configuredTarget.display !== receipt.target.display
  ) {
    throw new Error(
      "Configured deployment target does not match the target recorded by the latest completed deployment.",
    );
  }

  await assertBackupFingerprint(receipt);

  const failedPath = targetSiblingPath(
    receipt.target,
    `.metadata-editor-rollback-replaced-${Date.now()}`,
  );
  if (receipt.target.kind === "local") {
    if (await localPathExists(receipt.target.destinationPath)) {
      await rename(
        receipt.target.destinationPath,
        failedPath,
      );
    }
    await rename(
      receipt.backupPath,
      receipt.target.destinationPath,
    );
  } else {
    const command = [
      "set -eu",
      `if [ -e ${shellQuote(receipt.target.destinationPath)} ]; then mv -- ${shellQuote(receipt.target.destinationPath)} ${shellQuote(failedPath)}; fi`,
      `mv -- ${shellQuote(receipt.backupPath)} ${shellQuote(receipt.target.destinationPath)}`,
    ].join("; ");
    await runCommand(
      process.env.SSH_PATH ?? "ssh",
      [
        ...sshArgs(receipt.target),
        command,
      ],
      { timeoutMs: 60_000 },
    );
  }

  const restoredManifest = await readTargetManifest(
    receipt.target,
  );
  if (
    !restoredManifest ||
    restoredManifest.snapshot.contentFingerprint !==
      receipt.previousContentFingerprint
  ) {
    throw new Error(
      "Rollback promotion completed but the restored deployment manifest failed fingerprint verification.",
    );
  }

  const updated: PublishedMediaDeploymentOperationReceipt = {
    ...receipt,
    state: "rolled-back",
    rolledBackAt: new Date().toISOString(),
  };
  await writeOperationReceipt(stateRoot, updated);
  return updated;
}

export async function listPublishedMediaDeploymentOperations(
  publishRoot: string,
  environment: DeploymentEnvironment = process.env,
): Promise<PublishedMediaDeploymentOperationReceipt[]> {
  const stateRoot =
    resolvePublishedMediaDeploymentStateRoot(
      publishRoot,
      environment,
    );
  try {
    const entries = await readdir(stateRoot, {
      withFileTypes: true,
    });
    const receipts: PublishedMediaDeploymentOperationReceipt[] = [];
    for (const entry of entries) {
      if (
        !entry.isFile() ||
        entry.name === "latest.json" ||
        !entry.name.endsWith(".json")
      ) {
        continue;
      }
      const parsed = parseReceipt(
        JSON.parse(
          await readFile(
            path.join(stateRoot, entry.name),
            "utf8",
          ),
        ) as unknown,
      );
      if (parsed) {
        receipts.push(parsed);
      }
    }
    return receipts.sort((left, right) =>
      right.startedAt.localeCompare(left.startedAt),
    );
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}
