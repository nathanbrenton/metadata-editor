import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type {
  IngestFileInspection,
} from "../shared/ingest-types.js";
import {
  buildTrackTitlePlan,
  embeddedTrackTitle,
  filenameTitleFields,
  humanizeFilenameTitleField,
  titleFromFilenameField,
} from "../src/ingest-track-title-source.js";

function audioFile(
  relativePath: string,
  filename: string,
  embeddedMetadata: Record<string, string> = {},
): IngestFileInspection {
  return {
    relativePath,
    filename,
    extension: filename.slice(filename.lastIndexOf(".")),
    sizeBytes: 1,
    modifiedAt: "2026-07-25T12:00:00.000Z",
    mediaKind: "audio",
    detectedBy: "test",
    technical: {},
    embeddedMetadata,
    evidence: [],
    warnings: [],
  };
}

const builderSource = await readFile(
  new URL("../src/IngestReleaseBuilder.tsx", import.meta.url),
  "utf8",
);

const styleSource = await readFile(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);

const helpSource = await readFile(
  new URL("../src/workflow-help-content.ts", import.meta.url),
  "utf8",
);

test("extracts numbered or last filename fields after removing the extension", () => {
  assert.deepEqual(
    filenameTitleFields(
      "CrazyEights_DoubleShuffle_01_Intro.mp3",
      "underscore",
    ),
    ["CrazyEights", "DoubleShuffle", "01", "Intro"],
  );
  assert.equal(
    titleFromFilenameField(
      "CrazyEights_DoubleShuffle_01_Intro.mp3",
      "underscore",
      4,
    ),
    "Intro",
  );
  assert.equal(
    titleFromFilenameField(
      "161112_2xBday_n8fav-09-video-game-level.m4a",
      "underscore",
      "last",
    ),
    "N8fav 09 Video Game Level",
  );
  assert.equal(
    titleFromFilenameField(
      "only-two-fields.wav",
      "underscore",
      3,
    ),
    undefined,
  );
});

test("makes filename fields readable without replacing authored mixed case", () => {
  assert.equal(
    humanizeFilenameTitleField("DoubleShuffle"),
    "Double Shuffle",
  );
  assert.equal(
    humanizeFilenameTitleField("video-game-level"),
    "Video Game Level",
  );
  assert.equal(
    humanizeFilenameTitleField("EP"),
    "EP",
  );
});

test("reads embedded TITLE aliases case-insensitively and preserves their value", () => {
  assert.equal(
    embeddedTrackTitle(
      audioFile("one.m4a", "one.m4a", {
        TITLE: "Indoor Lightning EP",
      }),
    ),
    "Indoor Lightning EP",
  );
  assert.equal(
    embeddedTrackTitle(
      audioFile("two.m4a", "two.m4a", {
        artist: "Crazy Eights",
      }),
    ),
    undefined,
  );
});

test("plans title updates only for included non-missing sources with the chosen value", () => {
  const tracks = [
    {
      sourceRelativePath: "release/one.mp3",
      include: true,
    },
    {
      sourceRelativePath: "release/two.mp3",
      include: true,
    },
    {
      sourceRelativePath: "release/three.mp3",
      include: false,
    },
    {
      sourceRelativePath: "release/missing.mp3",
      include: true,
    },
  ];
  const files = [
    audioFile(
      "release/one.mp3",
      "Band_Release_01_Intro.mp3",
      { title: "Tagged Intro" },
    ),
    audioFile(
      "release/two.mp3",
      "Band_Release_02_Creepith.mp3",
    ),
    audioFile(
      "release/three.mp3",
      "Band_Release_03_Pixels.mp3",
      { title: "Tagged Pixels" },
    ),
  ];
  const missing = new Set([
    "release/missing.mp3",
  ]);

  const filenamePlan = buildTrackTitlePlan(
    tracks,
    files,
    missing,
    {
      kind: "filename-field",
      separator: "underscore",
      field: 4,
    },
  );

  assert.equal(filenamePlan.selectedCount, 2);
  assert.deepEqual(filenamePlan.updates, [
    {
      sourceRelativePath: "release/one.mp3",
      title: "Intro",
    },
    {
      sourceRelativePath: "release/two.mp3",
      title: "Creepith",
    },
  ]);

  const embeddedPlan = buildTrackTitlePlan(
    tracks,
    files,
    missing,
    { kind: "embedded-title" },
  );

  assert.equal(embeddedPlan.selectedCount, 2);
  assert.deepEqual(embeddedPlan.updates, [
    {
      sourceRelativePath: "release/one.mp3",
      title: "Tagged Intro",
    },
  ]);
  assert.deepEqual(
    embeddedPlan.unavailableSourceRelativePaths,
    ["release/two.mp3"],
  );
});

test("renders one toolbar for filename-field or embedded TITLE selection", () => {
  assert.match(builderSource, /Track title tools/);
  assert.match(builderSource, /Filename field/);
  assert.match(builderSource, /Embedded TITLE tag/);
  assert.match(builderSource, /Underscore \(_\)/);
  assert.match(builderSource, /Last field/);
  assert.match(
    builderSource,
    /Missing or unavailable values remain[\s\S]*unchanged/,
  );
  assert.match(
    styleSource,
    /\.ingest-track-title-tools[\s\S]*grid-template-columns:/,
  );
  assert.match(
    helpSource,
    /How do I populate Staging track titles from filenames or tags\?/,
  );
});
