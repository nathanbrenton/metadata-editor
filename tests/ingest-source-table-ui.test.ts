import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);

test("shows duration for audio and video rows in the ingest source table", () => {
  assert.match(
    appSource,
    /\(file\.mediaKind === "audio" \|\|\s*file\.mediaKind === "video"\) &&\s*file\.technical\.durationSeconds !==\s*undefined/,
  );
});


test("uses the first ingest source column for media preview instead of probe provenance", () => {
  assert.match(
    appSource,
    /className="ingest-source-preview-column"[\s\S]*?>\s*Preview\s*<\/th>[\s\S]*?Filename/,
  );
  assert.doesNotMatch(appSource, /<th scope="col">Probe<\/th>/);
  assert.match(appSource, /file\.mediaKind === "image"/);
  assert.match(appSource, /buildIngestArtworkPreviewUrl/);
  assert.match(appSource, /file\.mediaKind === "audio"/);
  assert.match(appSource, /file\.mediaKind === "video"/);
  assert.match(appSource, /ingest-source-video-indicator/);
  assert.match(appSource, /buildIngestAudioPreviewUrl/);
  assert.match(appSource, /aria-pressed=\{playing\}/);
  assert.match(appSource, /<th scope="row">Probe<\/th>/);
});

test("keeps the ingest source table compact while retaining Size", () => {
  const tableStart = appSource.indexOf(
    'className="ingest-table ingest-source-table"',
  );
  const detailStart = appSource.indexOf(
    "function IngestFileInspectionDetail",
    tableStart,
  );

  assert.notEqual(tableStart, -1);
  assert.notEqual(detailStart, -1);

  const sourceTable = appSource.slice(
    tableStart,
    detailStart,
  );

  assert.match(
    sourceTable,
    /Preview[\s\S]*Filename[\s\S]*Duration[\s\S]*Size[\s\S]*Details/,
  );

  for (const label of [
    "Type",
    "Container",
    "Codec",
    "Sample rate",
    "Channels",
  ]) {
    assert.doesNotMatch(
      sourceTable,
      new RegExp(
        `<th[^>]*>\\s*${label}\\s*<\\/th>`,
        "i",
      ),
    );
  }

  assert.match(sourceTable, /colSpan=\{5\}/);
});

test("keeps hidden source-table properties available in Details", () => {
  const detailStart = appSource.indexOf(
    "function IngestFileInspectionDetail",
  );
  assert.notEqual(detailStart, -1);
  const detailSource = appSource.slice(detailStart);

  assert.match(detailSource, />Type<\/th>[\s\S]*file\.mediaKind/);
  assert.match(
    detailSource,
    />Size<\/th>[\s\S]*formatByteSize\(file\.sizeBytes\)/,
  );
  assert.match(detailSource, /Object\.entries\(\s*file\.technical/);
});

test("continues ingest source preview to the next available audio file", () => {
  assert.match(appSource, /function getNextIngestAudioFile/);
  assert.match(
    appSource,
    /files[\s\S]*slice\(currentIndex \+ 1\)[\s\S]*file\.mediaKind === "audio"/,
  );
  assert.match(
    appSource,
    /audio\.addEventListener\("ended", handleEnded\)/,
  );
  assert.match(
    appSource,
    /handleEnded[\s\S]*getNextIngestAudioFile\([\s\S]*sortedSourceFiles[\s\S]*startSourceAudioPreview\(audio, nextFile\)/,
  );
});


test("allows detected video to continue into reviewed canonical Staging", () => {
  assert.doesNotMatch(
    appSource,
    /disabled=\{\s*candidate\.videoCount\s*>\s*0\s*\|\|/,
  );
  assert.match(
    appSource,
    /Video sources are probe-verified[\s\S]*Continue to Staging to confirm canonical video destination[\s\S]*stable ID/,
  );
});
