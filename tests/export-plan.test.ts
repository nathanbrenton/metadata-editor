import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMetadataExportPlan,
} from "../server/export-plan.js";
import type {
  MetadataFieldDefinition,
  ReleaseMetadataDetail,
  ReleaseScanResult,
} from "../server/types.js";

const registry: MetadataFieldDefinition[] = [
  {
    id: "release.title",
    canonicalName: "release.title",
    label: "Release Title",
    description: "Album title.",
    scope: "release",
    storageFileRole: "release",
    tomlPath: "release.title",
    valueType: "string",
    required: true,
    repeatable: false,
    inherited: false,
    aliases: {
      ffmpeg: ["album"],
      id3: ["TALB"],
      vorbis: ["ALBUM"],
      mp4: ["©alb"],
      players: {},
    },
    displayPolicy: "always",
  },
  {
    id: "track.title",
    canonicalName: "track.title",
    label: "Track Title",
    description: "Track title.",
    scope: "track",
    storageFileRole: "track",
    tomlPath: "track.title",
    valueType: "string",
    required: true,
    repeatable: false,
    inherited: false,
    aliases: {
      ffmpeg: ["title"],
      id3: ["TIT2"],
      vorbis: ["TITLE"],
      mp4: ["©nam"],
      riff: ["INAM"],
      players: {},
    },
    displayPolicy: "always",
  },
  {
    id: "track.composers[].name",
    canonicalName:
      "track.composers[].name",
    label: "Composer",
    description: "Composer name.",
    scope: "credit",
    storageFileRole: "track-credits",
    tomlPath: "track.composers[].name",
    valueType: "string",
    required: false,
    repeatable: true,
    inherited: false,
    aliases: {
      ffmpeg: ["composer"],
      id3: ["TCOM"],
      vorbis: ["COMPOSER"],
      mp4: ["©wrt"],
      players: {},
    },
    displayPolicy: "auto",
  },
];

const release: ReleaseScanResult = {
  id: "2026-07-16_test-release",
  relativePath:
    "releases/2026-07-16_test-release",
  metadataFiles: [],
  artworkMasters: [],
  tracks: [
    {
      id: "artist_01_test-track",
      relativePath:
        "releases/2026-07-16_test-release/tracks/artist_01_test-track",
      metadataFiles: [],
      audioMasters: [
        {
          filename: "master.wav",
          relativePath:
            "releases/2026-07-16_test-release/tracks/artist_01_test-track/master.wav",
          extension: ".wav",
        },
      ],
      artworkMasters: [],
    },
  ],
};

const detail: ReleaseMetadataDetail = {
  releaseId: release.id,
  releaseRelativePath:
    release.relativePath,
  documents: [
    {
      filename: "release.toml",
      relativePath:
        `${release.relativePath}/release.toml`,
      scope: "release",
      content: "",
      sha256: "a".repeat(64),
      parsed: {
        release: {
          title: "Test Release",
        },
      },
    },
    {
      filename: "track.toml",
      relativePath:
        `${release.tracks[0].relativePath}/track.toml`,
      scope: "track",
      trackId: release.tracks[0].id,
      content: "",
      sha256: "b".repeat(64),
      parsed: {
        track: {
          title: "Test Track",
        },
      },
    },
    {
      filename: "track-credits.toml",
      relativePath:
        `${release.tracks[0].relativePath}/track-credits.toml`,
      scope: "track",
      trackId: release.tracks[0].id,
      content: "",
      sha256: "c".repeat(64),
      parsed: {
        track: {
          composers: [
            { name: "First Composer" },
            { name: "Second Composer" },
          ],
        },
      },
    },
  ],
  missingFiles: [],
  warnings: [],
};

test(
  "builds a read-only export plan for one track",
  () => {
    const plan = buildMetadataExportPlan(
      release,
      detail,
      registry,
      {
        container: "mp3",
        outputDirectory:
          "exports/test-release/mp3",
      },
    );

    assert.equal(
      plan.summary.readyCount,
      1,
    );
    assert.equal(
      plan.items[0].action,
      "ready",
    );
    assert.equal(
      plan.items[0]
        .destinationRelativePath,
      "exports/test-release/mp3/artist_01_test-track.mp3",
    );

    assert.deepEqual(
      plan.items[0].fields.find(
        (field) =>
          field.canonicalPath ===
          "track.composers[].name",
      )?.value,
      [
        "First Composer",
        "Second Composer",
      ],
    );
  },
);

test(
  "uses unique track ids when audio masters share a filename",
  () => {
    const secondTrack = {
      ...release.tracks[0],
      id: "artist_02_second-track",
      relativePath:
        "releases/2026-07-16_test-release/tracks/artist_02_second-track",
      audioMasters: [
        {
          filename: "master.wav",
          relativePath:
            "releases/2026-07-16_test-release/tracks/artist_02_second-track/master.wav",
          extension: ".wav",
        },
      ],
    };

    const multiTrackRelease = {
      ...release,
      tracks: [
        release.tracks[0],
        secondTrack,
      ],
    };

    const plan = buildMetadataExportPlan(
      multiTrackRelease,
      detail,
      registry,
      {
        container: "mp3",
        outputDirectory:
          "exports/test-release/mp3",
      },
    );

    assert.deepEqual(
      plan.items.map(
        (item) =>
          item.destinationRelativePath,
      ),
      [
        "exports/test-release/mp3/artist_01_test-track.mp3",
        "exports/test-release/mp3/artist_02_second-track.mp3",
      ],
    );
  },
);

test(
  "uses container-specific tags",
  () => {
    const plan = buildMetadataExportPlan(
      release,
      detail,
      registry,
      {
        container: "m4a",
      },
    );

    assert.deepEqual(
      plan.items[0].fields.find(
        (field) =>
          field.canonicalPath ===
          "track.title",
      )?.targetTags,
      ["©nam"],
    );
  },
);

test(
  "blocks tracks without exactly one audio master",
  () => {
    const blockedRelease = {
      ...release,
      tracks: [
        {
          ...release.tracks[0],
          audioMasters: [],
        },
      ],
    };

    const plan = buildMetadataExportPlan(
      blockedRelease,
      detail,
      registry,
      {
        container: "flac",
      },
    );

    assert.equal(
      plan.summary.blockedCount,
      1,
    );
    assert.match(
      plan.items[0].warnings[0],
      /No audio master/,
    );
  },
);

test(
  "rejects output-directory traversal",
  () => {
    assert.throws(
      () =>
        buildMetadataExportPlan(
          release,
          detail,
          registry,
          {
            container: "wav",
            outputDirectory:
              "../../outside",
          },
        ),
      /cannot leave/,
    );
  },
);
