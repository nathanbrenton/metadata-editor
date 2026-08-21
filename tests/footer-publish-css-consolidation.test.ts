import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const styles = await readFile(
  new URL("../src/styles.css", import.meta.url),
  "utf8",
);

test("footer and Publish action layout each have one global component definition", () => {
  assert.equal(
    (styles.match(/^\.app-footer\s*\{/gm) ?? []).length,
    1,
  );
  assert.equal(
    (styles.match(/^\.publish-workspace-actions\s*\{/gm) ?? []).length,
    1,
  );

  assert.match(
    styles,
    /\.publish-workspace-actions\s*\{[\s\S]*?flex-direction:\s*column;[\s\S]*?justify-content:\s*flex-end;[\s\S]*?flex-wrap:\s*wrap;[\s\S]*?gap:\s*0\.55rem;[\s\S]*?width:\s*min\(100%, 29rem\);/,
  );
});

test("Publish readiness widths are scoped to the actual Web Package and Live table shapes", () => {
  assert.doesNotMatch(
    styles,
    /^\.publish-readiness-table th:nth-child\(/m,
  );

  assert.match(
    styles,
    /\.public-package-workspace \.publish-readiness-table \.publish-batch-select-column\s*\{[\s\S]*?width:\s*5\.4rem;/,
  );
  assert.match(
    styles,
    /\.public-package-workspace \.publish-readiness-table \.publish-release-column\s*\{[\s\S]*?width:\s*55%;/,
  );
  assert.match(
    styles,
    /\.public-package-workspace \.publish-readiness-table \.publish-membership-column\s*\{[\s\S]*?width:\s*16%;/,
  );

  assert.match(
    styles,
    /\.production-workspace \.publish-readiness-table th:first-child\s*\{[\s\S]*?width:\s*62%;/,
  );
  assert.match(
    styles,
    /\.production-workspace \.publish-readiness-table th:nth-child\(2\)\s*\{[\s\S]*?width:\s*28%;/,
  );
  assert.match(
    styles,
    /\.production-workspace \.publish-readiness-table th:nth-child\(3\)\s*\{[\s\S]*?width:\s*22%;/,
  );
});

test("Publish batch cell alignment no longer needs important overrides", () => {
  const start = styles.indexOf(
    ".publish-batch-select-column,",
  );
  const end = styles.indexOf(
    ".publish-batch-select-cell input",
    start,
  );

  assert.notEqual(start, -1);
  assert.ok(end > start);

  const batchCellStyles = styles.slice(start, end);
  assert.match(batchCellStyles, /padding-inline:\s*0\.55rem;/);
  assert.match(batchCellStyles, /text-align:\s*center;/);
  assert.doesNotMatch(batchCellStyles, /!important/);
});
