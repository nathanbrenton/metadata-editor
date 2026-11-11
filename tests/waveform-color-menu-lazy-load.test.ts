import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { readEditorAppSource } from "./support/editor-source.js";

const app = readEditorAppSource();

test("waveform color menu is deferred behind a lazy boundary", () => {
  assert.doesNotMatch(
    app,
    /import \{ WaveformColorMenuCard \} from "\.\.\/WaveformColorMenuCard\.js";/,
  );

  assert.match(
    app,
    /const LazyWaveformColorMenuCard = lazy\(async \(\) => \{/,
  );

  assert.match(
    app,
    /await import\(\s*"\.\.\/WaveformColorMenuCard\.js"\s*\)/,
  );

  assert.equal(
    app.match(/<LazyWaveformColorMenuCard/g)?.length ?? 0,
    2,
  );

  assert.match(app, /Loading waveform controls…/);
});
