import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const styles = await readFile(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);
const guide = await readFile(
  new URL("../src/WorkflowHelpView.tsx", import.meta.url),
  "utf8",
);

test("renders probe-verified video feedback as color-coded Ingest readiness", () => {
  assert.match(
    appSource,
    /ingest-candidate-health/,
  );
  assert.match(
    appSource,
    /Ingest readiness: \$\{candidateReadiness\.label\}/,
  );
  assert.match(
    appSource,
    /summary:[\s\S]*?candidate\.videoCount > 0[\s\S]*?Video source\$\{candidate\.videoCount === 1 \? "" : "s"\} probe-verified/,
  );
  assert.doesNotMatch(
    appSource,
    /className="status-message"[\s\S]*?probe-verified/,
  );
  assert.match(
    appSource,
    /ingest-inspection-header[\s\S]*?ingest-candidate-health/,
  );
});

test("defines reusable Ready, Review, and Blocked visual tones", () => {
  assert.match(styles, /\.ingest-candidate-health\.success/);
  assert.match(styles, /\.ingest-candidate-health\.warning/);
  assert.match(styles, /\.ingest-candidate-health\.error/);
});

test("keeps readiness separate from field provenance and points field help to contextual controls", () => {
  assert.match(guide, /green Ready, amber Review, and red Blocked/);
  assert.match(guide, /Provenance remains separate/);
  assert.match(guide, /Use the \? help controls/);
});
