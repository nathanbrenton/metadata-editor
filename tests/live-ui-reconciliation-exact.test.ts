import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const builderSource = await readFile(
  new URL("../src/IngestReleaseBuilder.tsx", import.meta.url),
  "utf8",
);
const styles = await readFile(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);

test("Ingest inferred-date evidence is neutral and explicit", () => {
  assert.match(appSource, /className="badge ingest-date-evidence"/);
  assert.match(
    appSource,
    /candidate\.dateCandidates\.length === 1[\s\S]*"date"[\s\S]*"dates"/,
  );
  assert.doesNotMatch(
    appSource,
    /candidate\.dateCandidates\.length > 1[\s\S]{0,80}\?\s*"warning"/,
  );
  assert.doesNotMatch(
    appSource,
    /`\?\s*\$\{candidate\.dateCandidates\.length\}`/,
  );
});

test("Staging candidate is compact context and five setup tabs stay on one row", () => {
  assert.match(
    builderSource,
    /className="ingest-builder-header ingest-builder-header-context"/,
  );
  assert.match(builderSource, />\s*Selected candidate\s*</);
  assert.match(builderSource, /className="ingest-staging-candidate-name"/);
  assert.doesNotMatch(
    builderSource,
    /<h2>\s*\{inspection\.candidate\.displayTitle\}\s*<\/h2>/,
  );
  assert.match(
    builderSource,
    /<ol className="ingest-guided-steps ingest-guided-step-tabs">/,
  );
  assert.doesNotMatch(
    builderSource,
    /<span>\{item\.number\}<\/span>/,
  );
  assert.match(
    styles,
    /\.ingest-guided-steps\.ingest-guided-step-tabs[\s\S]*grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)\s*!important/,
  );
});

test("Web Package and Live boundary renders terse names and retains full roots as tooltips", () => {
  assert.match(appSource, /mode === "production" \? "published-media" : "media-library"/);
  assert.match(appSource, /mode === "production" \? "Live" : "Web Package"/);
  assert.match(
    appSource,
    /location\.id === "library"[\s\S]*\?\.displayPath[\s\S]*Configured Library root/,
  );
  assert.match(
    appSource,
    /location\.id === "public-package"[\s\S]*\?\.displayPath[\s\S]*Configured published-media root/,
  );
  assert.doesNotMatch(
    appSource,
    /Validated snapshot output · complete releases are atomically replaced/,
  );
});
