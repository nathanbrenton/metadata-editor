import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import {
  resolvePublishedMediaDeploymentProfileSelection,
} from "../server/deployment-profiles.js";

const fakeHome = path.resolve("/tmp/metadata-editor-profile-home");

test(
  "local-sandbox is the default deployment profile and mirrors the Hiplingo server media boundary locally",
  () => {
    const selection =
      resolvePublishedMediaDeploymentProfileSelection({
        HOME: fakeHome,
      });

    assert.equal(selection.profile.name, "local-sandbox");
    assert.equal(selection.profile.configured, true);
    assert.equal(
      selection.environment.PUBLISHED_MEDIA_DEPLOY_TARGET,
      `local:${path.join(
        fakeHome,
        "Desktop",
        "websites",
        "_deploy",
        "hiplingo.com",
        "published-media",
      )}`,
    );
    assert.equal(
      selection.architecture.publicMediaServerRoot,
      "/var/www/hiplingo.com/published-media",
    );
    assert.equal(
      selection.architecture.frontendServerRoot,
      "/var/www/hiplingo.com/app/current",
    );
    assert.equal(
      selection.architecture.frontendAndMediaIndependent,
      true,
    );
  },
);

test(
  "production defaults to the dedicated hiplingo-prod SSH alias boundary",
  () => {
    const selection =
      resolvePublishedMediaDeploymentProfileSelection(
        { HOME: fakeHome },
        "production",
      );

    assert.equal(selection.profile.name, "production");
    assert.equal(selection.profile.configured, true);
    assert.equal(
      selection.profile.targetSource,
      "default-production-alias",
    );
    assert.equal(
      selection.environment.PUBLISHED_MEDIA_DEPLOY_TARGET,
      "ssh:hiplingo-prod:/var/www/hiplingo.com/published-media",
    );
  },
);

test(
  "production environment override replaces the default alias without replacing the local sandbox profile",
  () => {
    const target =
      "ssh:deploy@example.test:/var/www/hiplingo.com/published-media";
    const selection =
      resolvePublishedMediaDeploymentProfileSelection(
        {
          HOME: fakeHome,
          PUBLISHED_MEDIA_PRODUCTION_TARGET: target,
        },
        "production",
      );

    assert.equal(selection.profile.configured, true);
    assert.equal(selection.profile.targetSource, "profile-environment");
    assert.equal(
      selection.environment.PUBLISHED_MEDIA_DEPLOY_TARGET,
      target,
    );
    assert.equal(
      selection.profiles.find(
        (profile) => profile.name === "local-sandbox",
      )?.configured,
      true,
    );
  },
);

test(
  "legacy explicit deployment target becomes a custom override unless a named profile is requested",
  () => {
    const selection =
      resolvePublishedMediaDeploymentProfileSelection({
        HOME: fakeHome,
        PUBLISHED_MEDIA_DEPLOY_TARGET:
          "local:/tmp/metadata-editor-custom-target",
      });
    assert.equal(selection.profile.name, "custom");
    assert.equal(selection.profile.targetSource, "explicit-override");

    const local =
      resolvePublishedMediaDeploymentProfileSelection(
        {
          HOME: fakeHome,
          PUBLISHED_MEDIA_DEPLOY_TARGET:
            "local:/tmp/metadata-editor-custom-target",
        },
        "local-sandbox",
      );
    assert.equal(local.profile.name, "local-sandbox");
    assert.notEqual(
      local.environment.PUBLISHED_MEDIA_DEPLOY_TARGET,
      "local:/tmp/metadata-editor-custom-target",
    );
  },
);

test(
  "unknown deployment profiles are rejected instead of silently falling back",
  () => {
    assert.throws(
      () =>
        resolvePublishedMediaDeploymentProfileSelection(
          { HOME: fakeHome },
          "staging-server",
        ),
      /Unknown published-media deployment profile/,
    );
  },
);
