import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMetadataGenerationPlan,
  buildSingleMetadataDocumentPlan,
} from "../server/generation-plan.js";
import { buildMetadataPreview } from "../server/inference.js";
import { buildGeneratedTomlPreview } from "../server/toml-preview.js";
import type { ReleaseScanResult } from "../server/types.js";

function createRelease(
  filesExist: boolean,
): ReleaseScanResult {
  const releasePath =
    "releases/2026-07-30_this-ones-all-you";
  const trackPath =
    `${releasePath}/tracks/generation-auto_01_this-ones-all-you`;

  return {
    id: "2026-07-30_this-ones-all-you",
    relativePath: releasePath,
    metadataFiles: [
      "release.toml",
      "release-settings.toml",
      "release-production-notes.toml",
    ].map((filename) => ({
      filename,
      relativePath:
        `${releasePath}/${filename}`,
      exists: filesExist,
    })),
    artworkMasters: [
      {
        filename: "artwork-master.jpeg",
        relativePath:
          `${releasePath}/artwork/front/artwork-master.jpeg`,
        extension: ".jpeg",
      },
    ],
    tracks: [
      {
        id: "generation-auto_01_this-ones-all-you",
        relativePath: trackPath,
        metadataFiles: [
          "track.toml",
          "track-credits.toml",
          "track-production-notes.toml",
        ].map((filename) => ({
          filename,
          relativePath:
            `${trackPath}/${filename}`,
          exists: filesExist,
        })),
        audioMasters: [
          {
            filename: "audio-master.wav",
            relativePath:
              `${trackPath}/audio-master.wav`,
            extension: ".wav",
          },
        ],
        artworkMasters: [],
      },
    ],
  };
}

test(
  "plans creation for all missing metadata files",
  () => {
    const release = createRelease(false);
    const generated =
      buildGeneratedTomlPreview(
        release,
        buildMetadataPreview(release),
      );

    const plan =
      buildMetadataGenerationPlan(
        release,
        generated,
      );

    assert.equal(plan.items.length, 6);
    assert.equal(plan.summary.createCount, 6);
    assert.equal(plan.summary.blockedCount, 0);

    assert.equal(
      plan.items.every(
        (item) =>
          item.action === "create" &&
          item.validated,
      ),
      true,
    );
  },
);

test(
  "blocks every existing metadata file",
  () => {
    const release = createRelease(true);
    const generated =
      buildGeneratedTomlPreview(
        release,
        buildMetadataPreview(release),
      );

    const plan =
      buildMetadataGenerationPlan(
        release,
        generated,
      );

    assert.equal(plan.summary.createCount, 0);
    assert.equal(plan.summary.blockedCount, 6);

    assert.equal(
      plan.items.every(
        (item) =>
          item.action === "blocked" &&
          item.reason.includes(
            "already exists",
          ),
      ),
      true,
    );
  },
);

test(
  "supports mixed missing and existing files",
  () => {
    const release = createRelease(false);

    const releaseToml =
      release.metadataFiles.find(
        (file) =>
          file.filename === "release.toml",
      );

    const trackToml =
      release.tracks[0]?.metadataFiles.find(
        (file) =>
          file.filename === "track.toml",
      );

    assert.ok(releaseToml);
    assert.ok(trackToml);

    releaseToml.exists = true;
    trackToml.exists = true;

    const generated =
      buildGeneratedTomlPreview(
        release,
        buildMetadataPreview(release),
      );

    const plan =
      buildMetadataGenerationPlan(
        release,
        generated,
      );

    assert.equal(plan.summary.createCount, 4);
    assert.equal(plan.summary.blockedCount, 2);
  },
);

test(
  "plans only release metadata for release scope",
  () => {
    const release = createRelease(false);

    const generated =
      buildGeneratedTomlPreview(
        release,
        buildMetadataPreview(release),
      );

    const plan =
      buildMetadataGenerationPlan(
        release,
        generated,
        {
          scope: "release",
        },
      );

    assert.equal(plan.scope, "release");
    assert.equal(plan.items.length, 3);
    assert.equal(plan.summary.createCount, 3);

    assert.equal(
      plan.items.every(
        (item) =>
          !item.relativePath.includes("/tracks/"),
      ),
      true,
    );
  },
);

test(
  "plans only the selected track metadata",
  () => {
    const release = createRelease(false);
    const trackId =
      "generation-auto_01_this-ones-all-you";

    const generated =
      buildGeneratedTomlPreview(
        release,
        buildMetadataPreview(release),
      );

    const plan =
      buildMetadataGenerationPlan(
        release,
        generated,
        {
          scope: "track",
          trackId,
        },
      );

    assert.equal(plan.scope, "track");
    assert.equal(plan.trackId, trackId);
    assert.equal(plan.items.length, 3);
    assert.equal(plan.summary.createCount, 3);

    assert.equal(
      plan.items.every(
        (item) =>
          item.relativePath.includes(
            `/tracks/${trackId}/`,
          ),
      ),
      true,
    );
  },
);

test(
  "requires a valid track for track scope",
  () => {
    const release = createRelease(false);

    const generated =
      buildGeneratedTomlPreview(
        release,
        buildMetadataPreview(release),
      );

    assert.throws(
      () =>
        buildMetadataGenerationPlan(
          release,
          generated,
          {
            scope: "track",
          },
        ),
      /trackId is required/,
    );

    assert.throws(
      () =>
        buildMetadataGenerationPlan(
          release,
          generated,
          {
            scope: "track",
            trackId: "missing-track",
          },
        ),
      /Track not found/,
    );
  },
);


test(
  "plans one exact missing metadata document",
  () => {
    const release = createRelease(false);
    const generated = buildGeneratedTomlPreview(
      release,
      buildMetadataPreview(release),
    );
    const relativePath =
      `${release.relativePath}/release-production-notes.toml`;

    const plan = buildSingleMetadataDocumentPlan(
      release,
      generated,
      relativePath,
    );

    assert.equal(plan.items.length, 1);
    assert.equal(plan.items[0]?.relativePath, relativePath);
    assert.equal(plan.summary.createCount, 1);
    assert.equal(plan.summary.blockedCount, 0);
  },
);

test(
  "blocks exact document creation when the file exists",
  () => {
    const release = createRelease(true);
    const generated = buildGeneratedTomlPreview(
      release,
      buildMetadataPreview(release),
    );
    const relativePath =
      `${release.relativePath}/release-settings.toml`;

    const plan = buildSingleMetadataDocumentPlan(
      release,
      generated,
      relativePath,
    );

    assert.equal(plan.items[0]?.action, "blocked");
    assert.equal(plan.summary.createCount, 0);
    assert.equal(plan.summary.blockedCount, 1);
  },
);

test(
  "rejects a path outside the generated document set",
  () => {
    const release = createRelease(false);
    const generated = buildGeneratedTomlPreview(
      release,
      buildMetadataPreview(release),
    );

    assert.throws(
      () =>
        buildSingleMetadataDocumentPlan(
          release,
          generated,
          `${release.relativePath}/unknown.toml`,
        ),
      /not found/,
    );
  },
);
