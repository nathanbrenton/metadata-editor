import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const codecSource = readFileSync(
  new URL(
    "../../packages/media-player/src/waveform-binary.ts",
    import.meta.url,
  ),
  "utf8",
);
const profileSource = readFileSync(
  new URL("../server/media-processing/profile.ts", import.meta.url),
  "utf8",
);
const writerSource = readFileSync(
  new URL("../server/media-processing/staging-waveform.ts", import.meta.url),
  "utf8",
);
const prepareSource = readFileSync(
  new URL("../server/media-processing/prepare.ts", import.meta.url),
  "utf8",
);
const planSource = readFileSync(
  new URL("../server/media-processing/plan.ts", import.meta.url),
  "utf8",
);
const ingestSource = readFileSync(
  new URL("../server/ingest-builder.ts", import.meta.url),
  "utf8",
);
const stagingBuildSource = readFileSync(
  new URL("../server/staging-library-build.ts", import.meta.url),
  "utf8",
);
const serverSource = readFileSync(
  new URL("../server/index.ts", import.meta.url),
  "utf8",
);
const validatorSource = readFileSync(
  new URL("../server/library-validator.ts", import.meta.url),
  "utf8",
);
const clientSource = readFileSync(
  new URL("../src/PersistentLibraryPlayer.tsx", import.meta.url),
  "utf8",
);
const publishPlanSource = readFileSync(
  new URL("../server/publish-plan.ts", import.meta.url),
  "utf8",
);
const sharedWaveformSource = readFileSync(
  new URL(
    "../../packages/media-player/src/ScrollingWaveformCanvas.tsx",
    import.meta.url,
  ),
  "utf8",
);

test("compact waveform is the canonical 400-pps derivative while JSON remains migration-read-only", () => {
  assert.match(codecSource, /WAVEFORM_BINARY_FILENAME = "waveform-peaks\.wfp"/);
  assert.match(profileSource, /filename: typeof WAVEFORM_BINARY_FILENAME/);
  assert.match(profileSource, /MEDIA_PROCESSING_PROFILE_VERSION = 2/);
  assert.match(writerSource, /encodeWaveformBinary\(waveform\)/);
  assert.match(writerSource, /writeFile\([\s\S]*?encodedWaveform/);
  assert.match(prepareSource, /encodeWaveformBinary\(waveform\)/);
  assert.match(prepareSource, /writeFile\([\s\S]*?encodedWaveform/);
  assert.match(planSource, /decodeWaveformBinary\(content\)/);
  assert.match(ingestSource, /decodeWaveformBinary/);
  assert.match(stagingBuildSource, /decodeWaveformBinary/);
  assert.doesNotMatch(writerSource, /JSON\.stringify\(waveform/);
  assert.doesNotMatch(prepareSource, /JSON\.stringify\(waveform/);
});

test("Library delivery and clients prefer binary but can read legacy JSON during migration", () => {
  assert.match(serverSource, /filename: WAVEFORM_BINARY_FILENAME/);
  assert.match(serverSource, /filename: "waveform-peaks\.json"/);
  assert.match(serverSource, /decodeWaveformPayload\(content\)/);
  assert.match(clientSource, /response\.arrayBuffer\(\)/);
  assert.match(clientSource, /decodeMediaWaveformPayload/);
  assert.match(validatorSource, /authoredPath === "waveform-peaks\.json"/);
  assert.match(validatorSource, /"waveform-peaks\.wfp"/);
});

test("public package contract v6 publishes compact waveform bytes", () => {
  assert.match(publishPlanSource, /name: "audio-player-public-package";\s*version: 6;/);
  assert.match(publishPlanSource, /filename: WAVEFORM_BINARY_FILENAME/);
  assert.match(publishPlanSource, /format: WAVEFORM_BINARY_FORMAT/);
  assert.match(publishPlanSource, /formatVersion: WAVEFORM_BINARY_VERSION/);
  assert.match(publishPlanSource, /kind: "track-waveform"/);
});

test("compact storage migration leaves the exact 45 ms audible scrub guard untouched", () => {
  const matches = sharedWaveformSource.match(/\}, 45\);/g) ?? [];
  assert.equal(matches.length, 1);
});
