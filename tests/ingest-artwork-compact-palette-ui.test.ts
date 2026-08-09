import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const builderSource = readFileSync(
  new URL(
    "../src/IngestReleaseBuilder.tsx",
    import.meta.url,
  ),
  "utf8",
);

const styleSource = readFileSync(
  new URL(
    "../src/styles.css",
    import.meta.url,
  ),
  "utf8",
);

test(
  "keeps the available-artwork palette thumbnail-only and compact",
  () => {
    assert.match(
      builderSource,
      /thumbnailOnly/,
    );
    assert.doesNotMatch(
      builderSource,
      /className="ingest-artwork-tile-body"/,
    );
    assert.doesNotMatch(
      builderSource,
      /className="ingest-artwork-tile-actions"/,
    );
    assert.match(
      styleSource,
      /\.ingest-artwork-tile-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(auto-fill,\s*5\.5rem\)/,
    );
    assert.match(
      styleSource,
      /\.ingest-artwork-tile\s*\{[\s\S]*width:\s*5\.5rem;[\s\S]*height:\s*5\.5rem;/,
    );
  },
);

test(
  "keeps drag plus keyboard/click assignment without visible tile controls",
  () => {
    assert.match(
      builderSource,
      /draggable=\{!sourceMissing\}/,
    );
    assert.match(
      builderSource,
      /aria-label=\{`Select artwork /,
    );
    assert.match(
      builderSource,
      /onKeyDown=\{\(event\) =>/,
    );
    assert.match(
      builderSource,
      /className="ingest-artwork-advanced-source-controls"/,
    );
    assert.match(
      builderSource,
      /Remove missing source/,
    );
    assert.match(
      builderSource,
      />\s*Detach\s*</,
    );
  },
);
