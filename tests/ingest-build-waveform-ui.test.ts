import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sharedSource = readFileSync(
  new URL("../shared/ingest-builder.ts", import.meta.url),
  "utf8",
);
const serverSource = readFileSync(
  new URL("../server/ingest-builder.ts", import.meta.url),
  "utf8",
);
const builderSource = readFileSync(
  new URL("../src/IngestReleaseBuilder.tsx", import.meta.url),
  "utf8",
);
const helpSource = readFileSync(
  new URL("../src/workflow-help-content.ts", import.meta.url),
  "utf8",
);

test("Staging step 5 is Build with the plan action promoted above release review", () => {
  assert.match(
    builderSource,
    /number: 5 as const,[\s\S]*?label: "Build"/,
  );
  assert.match(
    builderSource,
    /className="ingest-build-plan-launcher"[\s\S]*?Preview update plan/,
  );
  assert.match(
    builderSource,
    /<h4>Build readiness<\/h4>/,
  );
  assert.doesNotMatch(
    builderSource,
    /<h4>Preflight<\/h4>/,
  );
});

test("Staging plan exposes waveform create refresh and current counts", () => {
  assert.match(
    sharedSource,
    /waveformCreateCount: number;[\s\S]*?waveformReplaceCount: number;[\s\S]*?waveformPreserveCount: number;/,
  );
  assert.match(
    sharedSource,
    /\| "waveform"/,
  );
  assert.match(
    serverSource,
    /const waveforms =[\s\S]*?prepareStagingWaveforms/,
  );
  assert.match(
    serverSource,
    /kind: "waveform"/,
  );
  assert.match(
    builderSource,
    /Waveforms: \{preview\.summary\.waveformCreateCount\} create/,
  );
});

test("guarded Staging execution writes waveforms before Library promotion", () => {
  assert.match(
    serverSource,
    /options\.waveformWriter \?\?[\s\S]*?writeStagingWaveform/,
  );
  assert.match(
    serverSource,
    /for \(const waveform of prepared\.waveforms\)[\s\S]*?await waveformWriter\([\s\S]*?masterPath,[\s\S]*?waveformPath/,
  );
  assert.match(
    serverSource,
    /await waveformWriter\([\s\S]*?await rename\([\s\S]*?stagingPath,[\s\S]*?prepared\.releasePath/,
  );
  assert.match(
    helpSource,
    /waveform-peaks\.wfp[\s\S]*?before the update is promoted/i,
  );
});

test("Staging build shows honest live activity text while guarded waveform work runs", () => {
  assert.match(
    builderSource,
    /buildElapsedSeconds[\s\S]*?window\.setInterval\(updateElapsed, 1000\)/,
  );
  assert.match(
    builderSource,
    /Server request active[\s\S]*?Still processing/,
  );
  assert.match(
    builderSource,
    /waveformBuildJobCount[\s\S]*?waveform job/,
  );
  assert.match(
    builderSource,
    /buildElapsedSeconds}s elapsed/,
  );
  assert.doesNotMatch(
    builderSource,
    /% complete|percent complete/i,
  );
});
