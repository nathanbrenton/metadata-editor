import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appSource = await readFile(
  new URL("../src/App.tsx", import.meta.url),
  "utf8",
);
const locationSource = await readFile(
  new URL("../server/workflow-locations.ts", import.meta.url),
  "utf8",
);

test("limits footer summary to Library and Web Package storage totals", () => {
  const start = appSource.indexOf("const footerSummary = useMemo");
  const end = appSource.indexOf("return (", start);
  const summary = appSource.slice(start, end);

  assert.match(summary, /`Library \$\{/);
  assert.match(summary, /`Web Package \$\{/);
  assert.doesNotMatch(summary, /candidate|ffprobe|releaseCount|trackCount/i);
  assert.match(locationSource, /sizeBytes\?: number/);
  assert.match(locationSource, /directorySizeBytes/);
});

test("links the existing metadata tag information view from the footer", () => {
  const footerStart = appSource.indexOf(
    '<footer className="app-footer">',
  );
  const footerEnd = appSource.indexOf("</footer>", footerStart);
  const footer = appSource.slice(footerStart, footerEnd);

  assert.match(footer, /Metadata Tag Info/);
  assert.match(footer, /setApplicationView\("compatibility"\)/);
});
