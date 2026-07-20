import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMetadataReadiness,
  classifyMissingMetadataDocument,
  readinessBadgeLabel,
  readinessTone,
  summarizeReleaseScanReadiness,
} from "../src/metadata-readiness.js";

const missing = (
  filename: string,
  relativePath = filename,
) => ({
  filename,
  relativePath,
  exists: false,
});

const present = (
  filename: string,
  relativePath = filename,
) => ({
  filename,
  relativePath,
  exists: true,
});

test(
  "classifies core, credit, and supplemental TOML documents",
  () => {
    assert.equal(
      classifyMissingMetadataDocument(
        missing("release.toml"),
      ).importance,
      "core",
    );
    assert.equal(
      classifyMissingMetadataDocument(
        missing("track-credits.toml"),
      ).importance,
      "credits",
    );
    assert.equal(
      classifyMissingMetadataDocument(
        missing("track-production-notes.toml"),
      ).importance,
      "supplemental",
    );
  },
);

test(
  "explains a release whose missing TOMLs are all optional",
  () => {
    const summary = summarizeReleaseScanReadiness({
      id: "release",
      metadataFiles: [
        present("release.toml"),
        missing("release-settings.toml"),
        missing("release-production-notes.toml"),
      ],
      tracks: [
        {
          id: "track-1",
          metadataFiles: [
            present("track.toml"),
            present("track-credits.toml"),
            missing("track-production-notes.toml"),
          ],
        },
      ],
    });

    assert.deepEqual(
      {
        core: summary.core,
        credits: summary.credits,
        supplemental: summary.supplemental,
        total: summary.total,
      },
      {
        core: 0,
        credits: 0,
        supplemental: 3,
        total: 3,
      },
    );
    assert.equal(
      readinessBadgeLabel(summary),
      "3 optional",
    );
    assert.equal(
      readinessTone(summary),
      "supplemental",
    );
  },
);

test(
  "prioritizes core and credit gaps in readiness badges",
  () => {
    assert.equal(
      readinessBadgeLabel({
        core: 1,
        credits: 2,
        supplemental: 3,
      }),
      "1 core missing",
    );
    assert.equal(
      readinessTone({
        core: 0,
        credits: 2,
        supplemental: 3,
      }),
      "warning",
    );
  },
);

test(
  "reports required field omissions only when the core document exists",
  () => {
    const release = {
      id: "release",
      metadataFiles: [present("release.toml")],
      tracks: [
        {
          id: "track-1",
          metadataFiles: [present("track.toml")],
        },
        {
          id: "track-2",
          metadataFiles: [missing("track.toml")],
        },
      ],
    };
    const summary = buildMetadataReadiness({
      release,
      documents: [
        {
          filename: "release.toml",
          scope: "release" as const,
          parsed: {
            release: {
              id: "release",
              title: "Example",
            },
          },
        },
        {
          filename: "track.toml",
          scope: "track" as const,
          trackId: "track-1",
          parsed: {
            track: {
              id: "track-1",
              title: "",
            },
          },
        },
      ],
      fields: [
        {
          label: "Release Title",
          scope: "release",
          storageFileRole: "release",
          tomlPath: "release.title",
          required: true,
          presentation: {
            group: "Release & Track Identity",
          },
        },
        {
          label: "Track Title",
          scope: "track",
          storageFileRole: "track",
          tomlPath: "track.title",
          required: true,
          presentation: {
            group: "Release & Track Identity",
          },
        },
      ],
    });

    assert.equal(summary.missingCoreDocuments, 1);
    assert.equal(summary.missingRequiredFields, 1);
    assert.deepEqual(
      summary.scopes.find(
        (scope) => scope.id === "track-1",
      )?.missingRequiredFields.map(
        (field) => field.tomlPath,
      ),
      ["track.title"],
    );
    assert.deepEqual(
      summary.scopes.find(
        (scope) => scope.id === "track-2",
      )?.missingRequiredFields,
      [],
    );
  },
);

test(
  "keeps optional supplemental documents out of the actionable count",
  () => {
    const summary = buildMetadataReadiness({
      release: {
        id: "release",
        metadataFiles: [
          present("release.toml"),
          missing("release-settings.toml"),
        ],
        tracks: [],
      },
      documents: [
        {
          filename: "release.toml",
          scope: "release",
          parsed: {
            release: {
              title: "Example",
            },
          },
        },
      ],
      fields: [
        {
          label: "Release Title",
          scope: "release",
          storageFileRole: "release",
          tomlPath: "release.title",
          required: true,
        },
      ],
    });

    assert.equal(
      summary.missingSupplementalDocuments,
      1,
    );
    assert.equal(summary.actionableCount, 0);
  },
);
