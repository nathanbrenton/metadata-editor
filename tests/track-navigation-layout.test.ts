import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);

const styleSource = await readFile(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);

const helpSource = await readFile(
  new URL(
    "../src/workflow-help-content.ts",
    import.meta.url,
  ),
  "utf8",
);

test("places the saved track number directly before the title", () => {
  assert.match(
    appSource,
    /const trackNumberLabel =\s*[\s\S]*?`\$\{trackNumber\}\.\`/,
  );
  assert.match(
    appSource,
    /className="track-navigation-primary"[\s\S]*?className="track-navigation-number"[\s\S]*?\{trackNumberLabel\}[\s\S]*?className="track-navigation-title"[\s\S]*?\{trackDisplayTitle\}/,
  );
  assert.doesNotMatch(
    appSource,
    /<small className="track-navigation-title">/,
  );
});

test("uses compact disc.track numbering for later discs", () => {
  assert.match(
    appSource,
    /`\$\{navigationEntry\.effectiveDiscNumber\}\.\$\{trackNumber\}\.\`/,
  );
});

test("keeps title and status in one compact sidebar row", () => {
  assert.match(
    styleSource,
    /\.track-navigation-primary\s*\{[\s\S]*?display:\s*flex;[\s\S]*?align-items:\s*baseline;/,
  );
  assert.match(
    styleSource,
    /\.track-navigation-title\s*\{[\s\S]*?text-overflow:\s*ellipsis;[\s\S]*?white-space:\s*nowrap;/,
  );
  assert.match(
    styleSource,
    /\.metadata-document-select\.track-document-select\s*\{[\s\S]*?min-height:\s*3\.35rem;/,
  );
  assert.match(
    styleSource,
    /\.metadata-track-preview-button\s*\{[\s\S]*?min-height:\s*3\.35rem;/,
  );
});

test("documents the compact number and title convention", () => {
  assert.match(
    helpSource,
    /omit the repeated word Track/i,
  );
  assert.match(
    helpSource,
    /number directly before the display title/i,
  );
});
