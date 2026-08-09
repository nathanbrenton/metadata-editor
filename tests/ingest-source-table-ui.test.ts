import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);

test("shows duration only for audio rows in the ingest source table", () => {
  assert.match(
    appSource,
    /file\.mediaKind === "audio" &&\s*file\.technical\.durationSeconds !==\s*undefined/,
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
  assert.match(appSource, /buildIngestAudioPreviewUrl/);
  assert.match(appSource, /aria-pressed=\{playing\}/);
  assert.match(appSource, /<th scope="row">Probe<\/th>/);
});
