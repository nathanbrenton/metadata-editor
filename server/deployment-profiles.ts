import os from "node:os";
import path from "node:path";

export type PublishedMediaDeploymentProfileName =
  | "local-sandbox"
  | "production"
  | "custom";

export type PublishedMediaDeploymentProfile = {
  name: PublishedMediaDeploymentProfileName;
  label: string;
  environment: "local" | "production" | "custom";
  active: boolean;
  configured: boolean;
  targetSource:
    | "default-local-sandbox"
    | "default-production-alias"
    | "profile-environment"
    | "explicit-override"
    | "unconfigured";
  configuredTarget?: string;
  description: string;
};

export type PublishedMediaDeploymentProfileSelection = {
  profile: PublishedMediaDeploymentProfile;
  profiles: PublishedMediaDeploymentProfile[];
  environment: NodeJS.ProcessEnv;
  architecture: {
    frontendSource: "~/Desktop/record-label/hiplingo.com/";
    frontendServerRoot: "/var/www/hiplingo.com/app/current";
    publicMediaServerRoot: "/var/www/hiplingo.com/published-media";
    publicMediaUrlPrefix: "/media/";
    localPublishedMediaRole: "sanitized-public-output";
    frontendAndMediaIndependent: true;
  };
};

const localSandboxName = "local-sandbox";
const productionName = "production";
const customName = "custom";
const defaultProductionTarget =
  "ssh:hiplingo-prod:/var/www/hiplingo.com/published-media";

function normalizeProfileName(
  value: string | undefined,
): PublishedMediaDeploymentProfileName | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (
    normalized === localSandboxName ||
    normalized === productionName ||
    normalized === customName
  ) {
    return normalized;
  }
  throw new Error(
    `Unknown published-media deployment profile: ${value}. Use local-sandbox, production, or custom.`,
  );
}

function localSandboxTarget(
  environment: NodeJS.ProcessEnv,
): string {
  const configured =
    environment.PUBLISHED_MEDIA_LOCAL_SANDBOX_TARGET?.trim();
  if (configured) {
    return configured;
  }
  const home = environment.HOME?.trim() || os.homedir();
  return `local:${path.join(
    home,
    "Desktop",
    "websites",
    "_deploy",
    "hiplingo.com",
    "published-media",
  )}`;
}

function productionTarget(
  environment: NodeJS.ProcessEnv,
): string {
  const configured =
    environment.PUBLISHED_MEDIA_PRODUCTION_TARGET?.trim();
  return configured || defaultProductionTarget;
}

function buildProfile(
  name: PublishedMediaDeploymentProfileName,
  active: boolean,
  environment: NodeJS.ProcessEnv,
  explicitTarget: string | null,
): PublishedMediaDeploymentProfile {
  if (name === localSandboxName) {
    const target = localSandboxTarget(environment);
    return {
      name,
      label: "Local sandbox",
      environment: "local",
      active,
      configured: true,
      targetSource: environment.PUBLISHED_MEDIA_LOCAL_SANDBOX_TARGET?.trim()
        ? "profile-environment"
        : "default-local-sandbox",
      configuredTarget: target,
      description:
        "Generated deployment mirror under ~/Desktop/websites/_deploy/hiplingo.com/published-media. No public server is required.",
    };
  }

  if (name === productionName) {
    const target = productionTarget(environment);
    return {
      name,
      label: "Production",
      environment: "production",
      active,
      configured: true,
      targetSource:
        environment.PUBLISHED_MEDIA_PRODUCTION_TARGET?.trim()
          ? "profile-environment"
          : "default-production-alias",
      configuredTarget: target,
      description:
        "Persistent Hiplingo public-media boundary through the local hiplingo-prod SSH alias. The alias owns the remote user, key, host address, and connection details; metadata-editor stores only the public-media destination path.",
    };
  }

  return {
    name,
    label: "Custom override",
    environment: "custom",
    active,
    configured: explicitTarget !== null,
    targetSource: explicitTarget
      ? "explicit-override"
      : "unconfigured",
    ...(explicitTarget
      ? { configuredTarget: explicitTarget }
      : {}),
    description:
      "One-off explicit PUBLISHED_MEDIA_DEPLOY_TARGET override. Prefer the named local-sandbox or production profile for normal operation.",
  };
}

export function resolvePublishedMediaDeploymentProfileSelection(
  environment: NodeJS.ProcessEnv = process.env,
  requestedProfile?: string,
): PublishedMediaDeploymentProfileSelection {
  const explicitTarget =
    environment.PUBLISHED_MEDIA_DEPLOY_TARGET?.trim() || null;
  const requested = normalizeProfileName(requestedProfile);
  const configuredDefault = normalizeProfileName(
    environment.PUBLISHED_MEDIA_DEPLOY_PROFILE,
  );

  const activeName: PublishedMediaDeploymentProfileName =
    requested ??
    configuredDefault ??
    (explicitTarget ? customName : localSandboxName);

  const profiles = [
    buildProfile(
      localSandboxName,
      activeName === localSandboxName,
      environment,
      explicitTarget,
    ),
    buildProfile(
      productionName,
      activeName === productionName,
      environment,
      explicitTarget,
    ),
    ...(explicitTarget || activeName === customName
      ? [
          buildProfile(
            customName,
            activeName === customName,
            environment,
            explicitTarget,
          ),
        ]
      : []),
  ];

  const profile = profiles.find(
    (candidate) => candidate.name === activeName,
  );
  if (!profile) {
    throw new Error(
      `Unable to resolve deployment profile ${activeName}.`,
    );
  }

  const effectiveEnvironment: NodeJS.ProcessEnv = {
    ...environment,
    PUBLISHED_MEDIA_DEPLOY_PROFILE: activeName,
  };

  if (profile.configuredTarget) {
    effectiveEnvironment.PUBLISHED_MEDIA_DEPLOY_TARGET =
      profile.configuredTarget;
  } else {
    delete effectiveEnvironment.PUBLISHED_MEDIA_DEPLOY_TARGET;
  }

  return {
    profile,
    profiles,
    environment: effectiveEnvironment,
    architecture: {
      frontendSource: "~/Desktop/record-label/hiplingo.com/",
      frontendServerRoot: "/var/www/hiplingo.com/app/current",
      publicMediaServerRoot:
        "/var/www/hiplingo.com/published-media",
      publicMediaUrlPrefix: "/media/",
      localPublishedMediaRole: "sanitized-public-output",
      frontendAndMediaIndependent: true,
    },
  };
}
