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
const helpContentSource = await readFile(
  new URL("../src/workflow-help-content.ts", import.meta.url),
  "utf8",
);

test("application header uses the uploaded Hiplingo image as the global Library home control", () => {
  assert.match(appSource, /className="page-header-brand"/);
  assert.match(appSource, /aria-label="Hiplingo · Back to Library"/);
  assert.match(appSource, /onClick=\{returnToLibraryHome\}/);
  assert.match(appSource, /className="hiplingo-logo"/);
  assert.match(
    appSource,
    /const hiplingoLogoUrl = new URL\([\s\S]*"\.\/assets\/hiplingo-logo\.png"/,
  );
  assert.match(appSource, /src=\{hiplingoLogoUrl\}/);
  assert.doesNotMatch(appSource, /hiplingo-wordmark/);
  assert.match(appSource, /setApplicationView\("library"\)/);
});

test("release detail uses the same uploaded Hiplingo home image", () => {
  const logoMatches =
    appSource.match(/src=\{hiplingoLogoUrl\}/g) ?? [];
  assert.ok(logoMatches.length >= 2);
  assert.match(appSource, /metadata-detail-home-button/);
});

test("compact header removes the synthetic mark and visible Hiplingo wordmark", () => {
  assert.match(styleSource, /\.page-header-branding\s*\{/);
  assert.match(styleSource, /\.page-header-brand\s*\{/);
  assert.match(styleSource, /\.hiplingo-logo\s*\{/);
  assert.doesNotMatch(styleSource, /\.hiplingo-mark\s*\{/);
  assert.doesNotMatch(styleSource, /\.hiplingo-wordmark\s*\{/);
});

test("Workflow Help documents global logo home plus contextual back navigation", () => {
  assert.match(helpContentSource, /Hiplingo logo at the far left/);
  assert.match(
    helpContentSource,
    /global home control and always returns to the Library landing workspace/,
  );
  assert.match(helpContentSource, /contextual Back to editor control/);
});
