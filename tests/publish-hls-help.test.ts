import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const helpSource = await readFile(
  new URL("../src/workflow-help-content.ts", import.meta.url),
  "utf8",
);
const readmeSource = await readFile(
  new URL("../README.md", import.meta.url),
  "utf8",
);

test("Workflow & Help explains the segmented web-stream publish model", () => {
  assert.match(helpSource, /AAC-LC HLS/);
  assert.match(helpSource, /roughly three-second fMP4 segments/);
  assert.match(helpSource, /never exposes the canonical master/);
  assert.match(helpSource, /waveform-peaks\.json/);
  assert.match(helpSource, /private audio-playback\.mp3/);
  assert.match(helpSource, /Prepare Library MP3s/);
  assert.match(helpSource, /never blocks Publish or Update public package/);
});

test("README documents the host-ready HLS resource contract", () => {
  assert.match(readmeSource, /stream\/index\.m3u8/);
  assert.match(readmeSource, /segment-00001\.m4s/);
  assert.match(readmeSource, /stream\.href/);
  assert.match(readmeSource, /waveform\.href/);
  assert.match(readmeSource, /private 320 kbps playback MP3/);
});
