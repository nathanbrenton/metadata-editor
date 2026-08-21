import assert from "node:assert/strict";
import {
  readFileSync,
} from "node:fs";
import test from "node:test";

const browserSource =
  readFileSync(
    new URL(
      "../src/EditorialDescriptorBrowser.tsx",
      import.meta.url,
    ),
    "utf8",
  );

test("clamped descriptor definitions expose the complete definition only from the definition text", () => {
  const definitionTitles =
    browserSource.match(
      /<small\s+title=\{definition\}>/g,
    ) ?? [];

  assert.equal(
    definitionTitles.length,
    2,
    "expected text-only full-definition hover for normal and Related rows",
  );

  assert.doesNotMatch(
    browserSource,
    /release-descriptor-browser__result-toggle[\s\S]{0,350}?title=\{definition\}/,
  );
});

test("taxonomy-path hover remains isolated on question-mark controls", () => {
  const pathHelpControls =
    browserSource.match(
      /className="release-descriptor-browser__path-help"[\s\S]{0,180}?title=\{path\}[\s\S]{0,80}?>\s*\?\s*<\/span>/g,
    ) ?? [];

  assert.equal(
    pathHelpControls.length,
    2,
    "expected separate taxonomy ? tooltips for normal and Related rows",
  );

  assert.doesNotMatch(
    browserSource,
    /<button[\s\S]{0,260}?title=\{\s*getEditorialDescriptorBrowserPath\(/,
  );
});
